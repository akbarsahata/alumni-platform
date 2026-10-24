import { test, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { login, call } from "./helpers/accounts.mjs";
import { fixtureQuery, fixtureSql } from "./helpers/d1.mjs";
import {
  setup,
  member,
  approvedNeed,
  send,
  role,
  profile,
  queueIntroduction,
} from "./helpers/outreach.mjs";
import { application, decision } from "./helpers/membership.mjs";

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function deletion(account) {
  return (await call(account, "/api/profile/deletion")).json();
}

async function requestDeletion(account) {
  return call(account, "/api/profile/deletion", { confirm: true });
}

test("a deletion request hides the profile immediately, cancels pending work and is idempotent", async () => {
  const f = await setup();
  const recipient = await member("deletion-hide");
  const uniqueIntroduction = `Profil penghapusan unik ${crypto.randomUUID()}`;
  assert.equal(
    (await call(recipient, "/api/profile", { ...profile, introduction: uniqueIntroduction }))
      .status,
    200
  );
  const pendingNeed = await approvedNeed(f, { title: "Deletion pending" });
  const { requestId: pendingRequestId } = await (await send(f, pendingNeed, recipient)).json();
  await fixtureSql(
    `UPDATE outreach_notification SET state='pending' WHERE request_id='${pendingRequestId}'`
  );
  await queueIntroduction(pendingRequestId);
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${pendingRequestId}/clarification`, {
        body: "Pesan privat sebelum penghapusan",
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(f.coordinator, `/api/outreach/requests/${pendingRequestId}/clarification`, {
        body: "Balasan koordinator sebelum penghapusan",
      })
    ).status,
    200
  );

  const historicalNeed = await approvedNeed(f, { title: "Deletion historical" });
  const { requestId: historicalRequestId } = await (
    await send(f, historicalNeed, recipient)
  ).json();
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${historicalRequestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );

  const searchBefore = await (
    await call(
      f.coordinator,
      `/api/directory?introduction=${encodeURIComponent(uniqueIntroduction)}`
    )
  ).json();
  assert.ok(searchBefore.profiles.some((item) => item.id === recipient.id));
  assert.equal((await call(f.coordinator, `/api/directory/${recipient.id}`)).status, 200);

  const created = await requestDeletion(recipient);
  assert.equal(created.status, 200, await created.clone().text());
  const createdBody = await created.json();
  assert.equal(createdBody.changed, true);
  assert.equal(createdBody.request.status, "active");
  assert.equal(createdBody.request.profileExists, true);
  assert.equal(
    Date.parse(createdBody.request.dueAt) - Date.parse(createdBody.request.requestedAt),
    30 * 86400000
  );
  assert.equal(createdBody.request.overdue, false);

  const repeat = await requestDeletion(recipient);
  assert.equal(repeat.status, 200);
  const repeatBody = await repeat.json();
  assert.equal(repeatBody.request.id, createdBody.request.id);
  assert.equal(repeatBody.request.dueAt, createdBody.request.dueAt);
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM profile_deletion_request WHERE member_user_id='${recipient.id}'`
    )[0].count,
    1
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM profile_deletion_event
       WHERE request_id='${createdBody.request.id}' AND action='requested'`
    )[0].count,
    1
  );

  const pendingAfter = await (
    await call(f.coordinator, `/api/outreach/requests/${pendingRequestId}`)
  ).json();
  assert.equal(pendingAfter.request.status, "cancelled");
  assert.equal(pendingAfter.clarification.length, 2);
  assert.equal(
    fixtureQuery(
      `SELECT state FROM outreach_notification WHERE request_id='${pendingRequestId}' ORDER BY kind`
    ).every((row) => row.state === "cancelled"),
    true
  );
  const introduction = fixtureQuery(
    `SELECT invalidated_at,delivery_state FROM outreach_introduction WHERE request_id='${pendingRequestId}'`
  )[0];
  assert.ok(introduction.invalidated_at);
  assert.equal(introduction.delivery_state, "cancelled");

  const historicalAfter = await (
    await call(recipient, `/api/outreach/requests/${historicalRequestId}`)
  ).json();
  assert.equal(historicalAfter.request.status, "interested");
  assert.equal(historicalAfter.access.canConsent, false);
  assert.equal(historicalAfter.access.canClarify, false);

  const searchAfter = await (
    await call(
      f.coordinator,
      `/api/directory?introduction=${encodeURIComponent(uniqueIntroduction)}`
    )
  ).json();
  assert.ok(!searchAfter.profiles.some((item) => item.id === recipient.id));
  assert.equal((await call(f.coordinator, `/api/directory/${recipient.id}`)).status, 404);
  const eligible = fixtureQuery(
    `SELECT COUNT(*) AS count FROM outreach_eligible_recipient WHERE user_id='${recipient.id}'`
  )[0].count;
  assert.equal(eligible, 0);
  const state = await deletion(recipient);
  assert.equal(state.request.status, "active");
  assert.equal(state.profileExists, true);
});

test("profile editing and confirmation stay blocked until processing completes; a new lifecycle is allowed afterwards", async () => {
  const f = await setup();
  const recipient = await member("deletion-editing");
  const created = await (await requestDeletion(recipient)).json();
  const requestId = created.request.id;

  const saveBlocked = await call(recipient, "/api/profile", {
    ...profile,
    introduction: "Perubahan saat penghapusan aktif",
  });
  assert.equal(saveBlocked.status, 409);
  const confirmBlocked = await call(recipient, "/api/profile/confirm", {});
  assert.equal(confirmBlocked.status, 409);

  assert.equal(
    (await call(f.primary, `/api/admin/profile-deletions/${requestId}/profile-removal`, {})).status,
    200
  );
  assert.equal((await call(recipient, "/api/profile", profile)).status, 409);
  assert.equal((await call(recipient, "/api/profile/confirm", {})).status, 409);
  assert.equal(
    (await call(f.primary, `/api/admin/profile-deletions/${requestId}/clarification-removal`, {}))
      .status,
    200
  );
  assert.equal((await call(recipient, "/api/profile", profile)).status, 409);
  const completed = await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
    note: "Profil dan teks klarifikasi telah diverifikasi.",
  });
  assert.equal(completed.status, 200, await completed.clone().text());
  assert.equal((await completed.json()).request.status, "completed");

  const completedPage = await call(recipient, "/profile/deletion");
  assert.equal(completedPage.status, 200);
  const completedHtml = await completedPage.text();
  assert.match(completedHtml, /Penghapusan selesai\./);
  assert.match(completedHtml, /Profil tidak lagi tersedia\./);
  assert.doesNotMatch(completedHtml, /Ajukan penghapusan profil/);

  assert.equal((await call(recipient, "/api/profile", profile)).status, 200);
  const afterProfile = await (await call(recipient, "/api/profile")).json();
  assert.equal(afterProfile.deletion.status, "completed");
  assert.equal(afterProfile.deletion.profileExists, true);
  const recreatedPage = await call(recipient, "/profile/deletion");
  assert.equal(recreatedPage.status, 200);
  const recreatedHtml = await recreatedPage.text();
  assert.match(recreatedHtml, /Penghapusan selesai\./);
  assert.match(recreatedHtml, /Ajukan penghapusan profil/);
  assert.doesNotMatch(recreatedHtml, /Profil tidak lagi tersedia\./);
  const noProfile = await requestDeletion(recipient);
  assert.equal(noProfile.status, 200, await noProfile.clone().text());
  const second = await (await requestDeletion(recipient)).json();
  assert.notEqual(second.request.id, requestId);
  assert.equal(second.request.status, "active");
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM profile_deletion_request WHERE member_user_id='${recipient.id}'`
    )[0].count,
    2
  );
});

test("processing is primary-only, scoped, evidence-based and leaves unrelated clarification threads intact", async () => {
  const f = await setup();
  const recipient = await member("deletion-process");
  const other = await member("deletion-other");
  await role(recipient, "directory-coordinator", f.primary);

  const ownNeed = await approvedNeed(f, { title: "Deletion own thread" });
  const { requestId: ownRequestId } = await (await send(f, ownNeed, recipient)).json();
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${ownRequestId}/clarification`, {
        body: "Teks privat milik anggota yang dihapus",
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(f.coordinator, `/api/outreach/requests/${ownRequestId}/clarification`, {
        body: "Balasan koordinator pada thread anggota",
      })
    ).status,
    200
  );

  const otherNeed = await approvedNeed(f, { title: "Deletion unrelated thread" });
  const sentByDeletedMember = await send(f, otherNeed, other, recipient);
  assert.equal(sentByDeletedMember.status, 200, await sentByDeletedMember.clone().text());
  const { requestId: otherRequestId } = await sentByDeletedMember.json();
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${otherRequestId}/clarification`, {
        body: "Pesan sebagai koordinator pada thread anggota lain",
      })
    ).status,
    200
  );

  const created = await (await requestDeletion(recipient)).json();
  const requestId = created.request.id;

  assert.equal((await call(null, "/api/admin/profile-deletions")).status, 401);
  for (const actor of [f.coordinator, f.reviewer, f.staff, f.student, other]) {
    assert.equal((await call(actor, "/api/admin/profile-deletions")).status, 403);
    assert.equal((await call(actor, `/api/admin/profile-deletions/${requestId}`)).status, 403);
  }
  assert.equal((await call(f.primary, "/api/admin/profile-deletions/no-such-id")).status, 400);
  assert.equal(
    (await call(f.primary, "/api/admin/profile-deletions/00000000-0000-4000-8000-000000000000"))
      .status,
    404
  );
  assert.equal(
    (
      await call(
        f.primary,
        `/api/admin/profile-deletions/${requestId}/profile-removal`,
        {},
        { Origin: "https://evil.example" }
      )
    ).status,
    403
  );
  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/profile-removal`, {
        unexpected: true,
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
        note: "Belum boleh selesai",
      })
    ).status,
    409
  );

  const queue = await (await call(f.primary, "/api/admin/profile-deletions")).json();
  const listed = queue.active.find((item) => item.id === requestId);
  assert.ok(listed);
  assert.equal(listed.memberUserId, recipient.id);
  assert.equal(listed.house, "Komodo");
  const safeQueue = JSON.stringify(queue);
  assert.doesNotMatch(safeQueue, new RegExp(escape(recipient.email)));
  assert.doesNotMatch(safeQueue, /Teks privat|Perkenalan profesional|Pesan klarifikasi/);

  const profileRemoval = await call(
    f.primary,
    `/api/admin/profile-deletions/${requestId}/profile-removal`,
    {}
  );
  assert.equal(profileRemoval.status, 200, await profileRemoval.clone().text());
  const afterProfile = (await profileRemoval.json()).request;
  assert.equal(afterProfile.profileRemovalCount, 1);
  assert.equal(afterProfile.steps.profileRemoved, true);
  assert.equal(afterProfile.profileExists, false);
  assert.equal(
    (await call(f.primary, `/api/admin/profile-deletions/${requestId}/profile-removal`, {})).status,
    409
  );
  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
        note: "Masih menunggu teks klarifikasi",
      })
    ).status,
    409
  );

  const clarificationRemoval = await call(
    f.primary,
    `/api/admin/profile-deletions/${requestId}/clarification-removal`,
    {}
  );
  assert.equal(clarificationRemoval.status, 200, await clarificationRemoval.clone().text());
  const afterClarification = (await clarificationRemoval.json()).request;
  assert.equal(afterClarification.clarificationRemovalCount, 2);
  assert.equal(afterClarification.steps.clarificationRemoved, true);
  assert.equal(
    (await call(f.primary, `/api/admin/profile-deletions/${requestId}/clarification-removal`, {}))
      .status,
    409
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM outreach_clarification WHERE request_id='${ownRequestId}'`
    )[0].count,
    0
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM outreach_clarification WHERE request_id='${otherRequestId}'`
    )[0].count,
    1
  );

  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
        note: "   ",
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
        note: "x".repeat(1001),
      })
    ).status,
    400
  );
  const completed = await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
    note: "  Profil, pesan, dan bukti telah diperiksa.  ",
  });
  assert.equal(completed.status, 200, await completed.clone().text());
  const completedRequest = (await completed.json()).request;
  assert.equal(completedRequest.status, "completed");
  assert.equal(completedRequest.completionNote, "Profil, pesan, dan bukti telah diperiksa.");
  assert.equal(completedRequest.events.length, 4);
  assert.deepEqual(
    completedRequest.events.map((event) => event.action),
    ["requested", "profile-removed", "clarification-removed", "completed"]
  );
  assert.equal(
    (
      await call(f.primary, `/api/admin/profile-deletions/${requestId}/complete`, {
        note: "Pengulangan",
      })
    ).status,
    409
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM profile_deletion_event
       WHERE request_id='${requestId}' AND action='completed'`
    )[0].count,
    1
  );

  const memberView = await deletion(recipient);
  assert.equal(memberView.request.status, "completed");
  assert.equal(memberView.request.completedAt, completedRequest.completedAt);
  assert.equal("completionNote" in memberView.request, false);

  const detailResponse = await call(f.primary, `/api/admin/profile-deletions/${requestId}`);
  assert.equal(detailResponse.headers.get("cache-control"), "no-store");
  const detail = await detailResponse.json();
  const serialized = JSON.stringify(detail);
  assert.doesNotMatch(serialized, new RegExp(escape(recipient.email)));
  assert.doesNotMatch(serialized, /Teks privat|Balasan koordinator|Perkenalan profesional/);
  assert.doesNotMatch(serialized, new RegExp(escape(f.staff.email)));

  const removedThread = await (
    await call(recipient, `/api/outreach/requests/${ownRequestId}`)
  ).json();
  assert.equal(removedThread.clarification.length, 0);
  const unrelatedThread = await (
    await call(recipient, `/api/outreach/requests/${otherRequestId}`)
  ).json();
  assert.equal(unrelatedThread.clarification.length, 1);
  assert.equal(
    unrelatedThread.clarification[0].body,
    "Pesan sebagai koordinator pada thread anggota lain"
  );

  const access = await (await call(f.primary, "/api/access")).json();
  assert.equal(access.permissions.directory, false);
  assert.equal((await call(f.primary, "/api/directory")).status, 403);
  assert.equal((await call(f.primary, "/directory")).status, 403);

  for (const path of ["/admin/profile-deletions", `/admin/profile-deletions/${requestId}`]) {
    const response = await call(f.primary, `${path}.data`);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await call(recipient, "/profile/deletion.data")).status, 200);
  assert.equal((await call(null, "/profile/deletion.data")).status, 401);
  assert.equal((await call(null, "/admin/profile-deletions.data")).status, 401);
  assert.equal((await call(recipient, "/admin/profile-deletions.data")).status, 403);

  const method = await fetch(
    `${process.env.TEST_BASE_URL || "http://127.0.0.1:5173"}/api/admin/profile-deletions/${requestId}`,
    {
      method: "DELETE",
      headers: {
        Cookie: f.primary.cookie,
        Origin: process.env.TEST_BASE_URL || "http://127.0.0.1:5173",
      },
    }
  );
  assert.equal(method.status, 405);
});

test("a deletion request requires an existing profile", async () => {
  const f = await setup();
  const account = await login("deletion-no-profile");
  assert.equal((await call(account, "/api/membership/application", application)).status, 200);
  assert.equal(
    (await call(f.reviewer, `/api/membership/reviews/${account.id}`, decision)).status,
    200
  );
  const missing = await requestDeletion(account);
  assert.equal(missing.status, 409);
  assert.equal((await deletion(account)).profileExists, false);
});

test("the manual retention boundary rejects premature deletion, preserves aggregates and defers evidence holds", async () => {
  const f = await setup();
  const held = await member("retention-held");
  const ordinary = await member("retention-clarification");
  const ordinaryNeed = await approvedNeed(f, { title: "Retention clarification" });
  const { requestId: ordinaryRequestId } = await (await send(f, ordinaryNeed, ordinary)).json();
  assert.equal(
    (
      await call(ordinary, `/api/outreach/requests/${ordinaryRequestId}/clarification`, {
        body: "Teks klarifikasi yang menunggu 90 hari",
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(ordinary, `/api/outreach/requests/${ordinaryRequestId}/respond`, {
        outcome: "declined",
      })
    ).status,
    200
  );
  const needId = await approvedNeed(f, { title: "Retention held need" });
  const { requestId } = await (await send(f, needId, held)).json();
  assert.equal(
    (
      await call(held, `/api/outreach/requests/${requestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );
  await queueIntroduction(requestId);
  await fixtureSql(`INSERT INTO local_introduction_mail(recipient,introduction_id,message,captured_at,expires_at)
    SELECT s.email,i.id,'Synthetic introduction evidence',unixepoch()*1000,unixepoch()*1000+600000
    FROM outreach_introduction i
    JOIN outreach_staff_recipient sr ON sr.need_id=i.need_id
    JOIN user s ON s.id=sr.user_id
    WHERE i.request_id='${requestId}'`);
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM outreach_introduction WHERE request_id='${requestId}' AND shared_at IS NOT NULL`
    )[0].count,
    1
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM outreach_outcome WHERE request_id='${requestId}'`
    )[0].count,
    1
  );
  assert.equal((await call(f.coordinator, `/api/outreach/needs/${needId}/close`, {})).status, 200);
  const deletionRequest = await (await requestDeletion(held)).json();
  for (const [path, body] of [
    ["profile-removal", {}],
    ["clarification-removal", {}],
    ["complete", { note: "Retention evidence hold verified." }],
  ]) {
    assert.equal(
      (
        await call(
          f.primary,
          `/api/admin/profile-deletions/${deletionRequest.request.id}/${path}`,
          body
        )
      ).status,
      200
    );
  }
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM retention_profile_deletion_hold
       WHERE deletion_request_id='${deletionRequest.request.id}'`
    )[0].count,
    1
  );

  await fixtureSql(
    `UPDATE outreach_closure SET closed_at='2024-01-01T00:00:00.000Z' WHERE need_id='${needId}'`
  );
  const candidate = fixtureQuery(
    `SELECT * FROM retention_closed_need_candidate WHERE need_id='${needId}'`
  )[0];
  assert.equal(candidate.request_count, 1);
  assert.equal(candidate.interested_count, 1);
  assert.equal(candidate.introduced_count, 1);
  assert.equal(candidate.shared_count, 1);

  assert.throws(() => fixtureSql(`DELETE FROM outreach_outcome WHERE request_id='${requestId}'`));
  assert.throws(() =>
    fixtureSql(`DELETE FROM outreach_introduction WHERE request_id='${requestId}'`)
  );

  const executionId = "00000000000000000000000000000001";
  fixtureSql(`INSERT INTO retention_execution(id,actor_user_id,scope,target_id,reason,executed_at)
    VALUES('${executionId}','${f.primary.id}','outreach-records','${needId}',
      'Synthetic closed-need retention review',strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  fixtureSql(`INSERT INTO school_need_retention_snapshot
    (id,need_id,category,request_count,pending_count,interested_count,declined_count,
     cancelled_count,introduced_count,help_confirmed_count,completed_count,did_not_proceed_count,
     shared_count,captured_at)
    SELECT lower(hex(randomblob(16))),need_id,category,request_count,pending_count,interested_count,
      declined_count,cancelled_count,introduced_count,help_confirmed_count,completed_count,
      did_not_proceed_count,shared_count,strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM retention_closed_need_candidate WHERE need_id='${needId}'`);
  assert.throws(() => fixtureSql(`DELETE FROM outreach_outcome WHERE request_id='${requestId}'`));
  assert.throws(() =>
    fixtureSql(`DELETE FROM outreach_introduction WHERE request_id='${requestId}'`)
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM school_need_retention_snapshot WHERE need_id='${needId}'`
    )[0].count,
    1
  );

  await fixtureSql(
    `UPDATE outreach_request SET responded_at='2024-01-01T00:00:00.000Z',
      updated_at='2024-01-01T00:00:00.000Z' WHERE id='${ordinaryRequestId}'`
  );
  assert.equal(
    fixtureQuery(
      `SELECT message_count FROM retention_clarification_candidate WHERE request_id='${ordinaryRequestId}'`
    )[0].message_count,
    1
  );
  assert.throws(() =>
    fixtureSql(`DELETE FROM outreach_clarification WHERE request_id='${ordinaryRequestId}'`)
  );
  fixtureSql(`INSERT INTO retention_execution(id,actor_user_id,scope,target_id,reason,executed_at)
    VALUES('00000000000000000000000000000002','${f.primary.id}','clarification-text',
      '${ordinaryRequestId}','Synthetic 90-day clarification review',
      strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  fixtureSql(`DELETE FROM outreach_clarification WHERE request_id='${ordinaryRequestId}'`);
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM outreach_clarification WHERE request_id='${ordinaryRequestId}'`
    )[0].count,
    0
  );

  fixtureSql(`INSERT INTO retention_execution(id,actor_user_id,scope,target_id,reason,executed_at)
    VALUES('00000000000000000000000000000003','${f.primary.id}','profile-deletion-evidence',
      '${deletionRequest.request.id}','Synthetic deletion evidence review',
      strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
  assert.throws(() =>
    fixtureSql(
      `DELETE FROM profile_deletion_event WHERE request_id='${deletionRequest.request.id}'`
    )
  );
  assert.throws(() =>
    fixtureSql(`DELETE FROM profile_deletion_request WHERE id='${deletionRequest.request.id}'`)
  );

  await fixtureSql(
    `UPDATE profile_deletion_request SET completed_at='2024-01-01T00:00:00.000Z'
     WHERE id='${deletionRequest.request.id}'`
  );
  fixtureSql(`DELETE FROM local_introduction_mail
    WHERE introduction_id IN (SELECT id FROM outreach_introduction WHERE request_id='${requestId}')`);
  fixtureSql(`DELETE FROM outreach_outcome_event WHERE request_id='${requestId}'`);
  fixtureSql(`DELETE FROM outreach_outcome WHERE request_id='${requestId}'`);
  fixtureSql(`DELETE FROM outreach_introduction WHERE request_id='${requestId}'`);
  fixtureSql(`DELETE FROM outreach_clarification WHERE request_id='${requestId}'`);
  fixtureSql(`DELETE FROM outreach_notification WHERE request_id='${requestId}'`);
  fixtureSql(`DELETE FROM outreach_request WHERE id='${requestId}'`);
  assert.equal(
    fixtureQuery(`SELECT COUNT(*) AS count FROM outreach_request WHERE id='${requestId}'`)[0].count,
    0
  );
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM school_need_retention_snapshot WHERE need_id='${needId}'`
    )[0].count,
    1
  );
  fixtureSql(`DELETE FROM profile_deletion_event WHERE request_id='${deletionRequest.request.id}'`);
  fixtureSql(`DELETE FROM profile_deletion_request WHERE id='${deletionRequest.request.id}'`);
  assert.equal(
    fixtureQuery(
      `SELECT COUNT(*) AS count FROM profile_deletion_request
       WHERE id='${deletionRequest.request.id}'`
    )[0].count,
    0
  );

  // Operator fixtures write through a separate D1 process. Wait for any Vite
  // worker restart to settle before the next supported HTTP request.
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${process.env.TEST_BASE_URL || "http://127.0.0.1:5173"}/login`)).ok) break;
    } catch {}
    await delay(250);
  }

  const retainedReport = await call(f.student, `/api/school-needs/${needId}`);
  assert.equal(retainedReport.status, 200, await retainedReport.clone().text());
  assert.deepEqual((await retainedReport.json()).outreach, {
    total: 1,
    pending: 0,
    interested: 1,
    declined: 0,
    cancelled: 0,
    expired: 0,
    introduced: 1,
    helpConfirmed: 0,
    completed: 0,
    didNotProceed: 0,
    introducedTotal: 1,
    closed: true,
    closedAt: "2024-01-01T00:00:00.000Z",
  });
});

after(async () => {
  const f = await setup();
  const submitter = await member("deletion-browser-submit");
  const processing = await member("deletion-browser-process");
  const needId = await approvedNeed(f, { title: "Deletion browser" });
  const { requestId } = await (await send(f, needId, processing)).json();
  const created = await (await requestDeletion(processing)).json();
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/deletion-accounts.json`,
    JSON.stringify({
      primary: f.primary,
      submitter,
      processing,
      needId,
      outreachRequestId: requestId,
      deletionRequestId: created.request.id,
    }),
    { mode: 0o600 }
  );
});
