import { test, after } from "node:test";
import assert from "node:assert/strict";
import { call, capturedMail } from "./helpers/accounts.mjs";
import {
  setup,
  member,
  approvedNeed,
  send,
  profile,
  needInput,
  fixtureSql,
} from "./helpers/outreach.mjs";

test("coordinator sends an approved need and the member expresses interest without sharing email", async () => {
  const fixture = await setup();
  const recipient = await member("outreach-interest");
  const needId = await approvedNeed(fixture);
  const sent = await send(fixture, needId, recipient);
  assert.equal(sent.status, 200, await sent.clone().text());
  const { requestId } = await sent.json();
  const mail = await capturedMail(recipient.email);
  assert.equal(mail.to, recipient.email);
  assert.match(mail.text, new RegExp(`/outreach/requests/${requestId}`));
  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.request.status, "pending");
  assert.equal(detail.need.purpose, "Mendampingi siswa merancang robot");
  assert.equal(
    Date.parse(detail.request.expiresAt) - Date.parse(detail.request.sentAt),
    14 * 86400000
  );
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );
  const state = await (await call(fixture.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(state.requests[0].status, "interested");
  assert.doesNotMatch(JSON.stringify(state), /@example.test|Komodo|introduction|email/i);
  assert.equal((await capturedMail(fixture.staff.email)).subject, "Kode masuk keluarga alumni");
});

test("sent needs freeze commitments; opt-out cancels unanswered requests permanently and closure preserves responses", async () => {
  const f = await setup();
  const a = await member("freeze-member");
  const b = await member("cancel-member");
  const needId = await approvedNeed(f);
  const first = await send(f, needId, a);
  assert.equal(first.status, 200);
  const firstId = (await first.json()).requestId;
  assert.equal(
    (
      await call(f.student, `/api/school-needs/${needId}/edit`, {
        ...needInput,
        staffContactUserId: f.staff.id,
        expectedVersion: 1,
        purpose: "Changed terms",
      })
    ).status,
    409
  );
  assert.equal(
    (await call(a, `/api/outreach/requests/${firstId}/respond`, { outcome: "interested" })).status,
    200
  );
  const second = await send(f, needId, b);
  assert.equal(second.status, 200);
  const secondId = (await second.json()).requestId;
  assert.equal(
    (
      await call(b, "/api/profile", {
        ...profile,
        participation: false,
        participationConsent: false,
      })
    ).status,
    200
  );
  assert.equal(
    (await (await call(b, `/api/outreach/requests/${secondId}`)).json()).request.status,
    "cancelled"
  );
  await call(b, "/api/profile", profile);
  assert.equal(
    (await call(b, `/api/outreach/requests/${secondId}/respond`, { outcome: "interested" })).status,
    409
  );
  assert.equal((await call(f.coordinator, `/api/outreach/needs/${needId}/close`, {})).status, 200);
  assert.equal((await send(f, needId, await member("closed-member"))).status, 409);
  const state = await (await call(f.otherCoordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(state.closed, true);
  assert.equal(state.requests.find((r) => r.id === firstId).status, "interested");
});

test("concurrent sends obey recipient and global contact limits across coordinators and replacement needs", async () => {
  const f = await setup();
  const recipient = await member("bounded-member");
  const needId = await approvedNeed(f);
  const duplicate = await Promise.all([
    send(f, needId, recipient),
    send(f, needId, recipient, f.otherCoordinator),
  ]);
  assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 409]);
  const replacementIds = await Promise.all([approvedNeed(f), approvedNeed(f), approvedNeed(f)]);
  const sends = await Promise.all(
    replacementIds.map((id) => send(f, id, recipient, f.otherCoordinator))
  );
  assert.deepEqual(sends.map((r) => r.status).sort(), [200, 200, 409]);
  const candidates = await Promise.all(
    Array.from({ length: 11 }, (_, i) => member(`bounded-${i}`))
  );
  const maxNeed = await approvedNeed(f);
  const results = await Promise.all(candidates.map((m) => send(f, maxNeed, m)));
  assert.equal(results.filter((r) => r.status === 200).length, 10);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(
    (await (await call(f.coordinator, `/api/outreach/needs/${maxNeed}`)).json()).requests.length,
    10
  );
});

test("school views reveal aggregates only, decline reasons stay private, and coordinator takeover requires a current role", async () => {
  const f = await setup();
  const recipient = await member("private-decline");
  const outsider = await member("private-outsider");
  const needId = await approvedNeed(f);
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  for (const actor of [null, f.primary, f.staff, f.student, outsider]) {
    const denied = await call(actor, `/api/outreach/requests/${requestId}`);
    assert.equal(denied.status, actor ? 404 : 401);
    assert.equal(denied.headers.get("cache-control"), "no-store");
  }
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/respond`, {
        outcome: "declined",
        reason: "Alasan pribadi sangat rahasia",
      })
    ).status,
    200
  );
  const state = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(state.requests[0].declineReason, "Alasan pribadi sangat rahasia");
  const school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.deepEqual(school.outreach, {
    total: 1,
    pending: 0,
    interested: 0,
    declined: 1,
    cancelled: 0,
    expired: 0,
    closed: false,
  });
  assert.doesNotMatch(
    JSON.stringify(school),
    new RegExp(`${recipient.id}|Alasan pribadi|${recipient.email}`)
  );
  assert.equal(
    (
      await call(f.otherCoordinator, `/api/outreach/requests/${requestId}/take-over`, {
        expectedCoordinatorUserId: f.coordinator.id,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(f.coordinator, `/api/outreach/requests/${requestId}/take-over`, {
        expectedCoordinatorUserId: f.coordinator.id,
      })
    ).status,
    409
  );
  const { role } = await import("./helpers/outreach.mjs");
  await role(f.coordinator, "directory-coordinator", f.primary, "revoke");
  assert.equal((await call(f.coordinator, `/api/outreach/needs/${needId}`)).status, 403);
  assert.equal((await call(f.coordinator, `/api/outreach/requests/${requestId}`)).status, 404);
  const audit = await (await call(f.primary, "/api/outreach/audit")).json();
  assert.ok(audit.events.some((e) => e.action === "assignment-changed"));
  assert.doesNotMatch(
    JSON.stringify(audit),
    /Alasan pribadi|@example.test|Pengalaman pendampingan/
  );
});

test("one reminder is permitted after seven days; expiry and short deadlines never extend", async () => {
  const f = await setup();
  const a = await member("reminder-member");
  const needId = await approvedNeed(f);
  const sent = await send(f, needId, a);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  assert.equal(
    (await call(f.coordinator, `/api/outreach/requests/${requestId}/remind`, {})).status,
    409
  );
  await fixtureSql(
    `UPDATE outreach_request SET sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days','-1 minute') WHERE id='${requestId}'`
  );
  const reminders = await Promise.all([
    call(f.coordinator, `/api/outreach/requests/${requestId}/remind`, {}),
    call(f.otherCoordinator, `/api/outreach/requests/${requestId}/remind`, {}),
  ]);
  assert.deepEqual(reminders.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await capturedMail(a.email)).subject, "Pengingat permintaan bantuan sekolah");
  assert.equal(
    (await call(f.coordinator, `/api/outreach/requests/${requestId}/remind`, {})).status,
    409
  );
  await fixtureSql(
    `UPDATE outreach_request SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${requestId}'`
  );
  assert.equal(
    (await call(a, `/api/outreach/requests/${requestId}/respond`, { outcome: "interested" }))
      .status,
    409
  );
  assert.equal(
    (await (await call(a, `/api/outreach/requests/${requestId}`)).json()).request.status,
    "expired"
  );
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const short = await approvedNeed(f, { deadline: tomorrow });
  const shortSent = await send(f, short, await member("short-member"));
  assert.equal(shortSent.status, 200);
  const shortId = (await shortSent.json()).requestId;
  const state = await (await call(f.coordinator, `/api/outreach/requests/${shortId}`)).json();
  assert.equal(state.request.expiresAt, `${tomorrow}T23:59:59.999Z`);
});

test("primary audit history is chronological and paginates with a stable cursor", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  const inserts = Array.from({ length: 52 }, (_, index) => {
    const id = (51 - index).toString(16).padStart(32, "0");
    const occurredAt = `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z`;
    return `INSERT INTO outreach_audit VALUES('${id}','${needId}',NULL,'test-${String(index).padStart(3, "0")}','${occurredAt}')`;
  }).join(";");
  await fixtureSql(inserts);
  const first = await (await call(f.primary, "/api/outreach/audit")).json();
  assert.equal(first.events.length, 50);
  assert.equal(first.events[0].action, "test-000");
  assert.equal(first.events[49].action, "test-049");
  assert.match(first.nextCursor, /\|/);
  const second = await (
    await call(f.primary, `/api/outreach/audit?after=${encodeURIComponent(first.nextCursor)}`)
  ).json();
  assert.deepEqual(
    second.events.slice(0, 2).map((event) => event.action),
    ["test-050", "test-051"]
  );
  assert.deepEqual(
    first.events.map((event) => event.action),
    Array.from({ length: 50 }, (_, index) => `test-${String(index).padStart(3, "0")}`)
  );
});

test("outreach lists apply needs and requests cursors independently", async () => {
  const f = await setup();
  const memberAccount = await member("paging-coordinator");
  const { role } = await import("./helpers/outreach.mjs");
  await role(memberAccount, "directory-coordinator", f.primary);
  const needA = await approvedNeed(f);
  const needB = await approvedNeed(f);
  const sentA = await send(f, needA, memberAccount, memberAccount);
  const sentB = await send(f, needB, memberAccount, memberAccount);
  assert.equal(sentA.status, 200, await sentA.clone().text());
  assert.equal(sentB.status, 200, await sentB.clone().text());
  const requestA = (await sentA.json()).requestId;
  const requestB = (await sentB.json()).requestId;
  const needsFiltered = await (
    await call(memberAccount, `/api/outreach?needsAfter=${needA}`)
  ).json();
  assert.ok(!needsFiltered.needs.some((need) => need.id === needA));
  assert.ok(needsFiltered.requests.some((request) => request.id === requestA));
  assert.ok(needsFiltered.requests.some((request) => request.id === requestB));
  const requestsFiltered = await (
    await call(memberAccount, `/api/outreach?requestsAfter=${requestA}`)
  ).json();
  assert.ok(!requestsFiltered.requests.some((request) => request.id === requestA));
  assert.ok(requestsFiltered.needs.some((need) => need.id === needA));
  assert.ok(requestsFiltered.needs.some((need) => need.id === needB));
});

after(async () => {
  const f = await setup();
  const recipient = await member("browser-outreach-member");
  const needId = await approvedNeed(f, { title: "Mentor robotika untuk siswa" });
  const reminderRecipient = await member("browser-reminder-member");
  const reminderNeedId = await approvedNeed(f, { title: "Pendampingan robotika lanjutan" });
  const reminderSent = await send(f, reminderNeedId, reminderRecipient);
  assert.equal(reminderSent.status, 200);
  const reminderRequestId = (await reminderSent.json()).requestId;
  await fixtureSql(
    `UPDATE outreach_request SET sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 days') WHERE id='${reminderRequestId}'`
  );
  const expiredRecipient = await member("browser-expired-member");
  const expiredNeedId = await approvedNeed(f, { title: "Mentor robotika kedaluwarsa" });
  const expiredSent = await send(f, expiredNeedId, expiredRecipient);
  assert.equal(expiredSent.status, 200);
  const expiredRequestId = (await expiredSent.json()).requestId;
  await fixtureSql(
    `UPDATE outreach_request SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${expiredRequestId}'`
  );
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`,
    JSON.stringify({
      ...f,
      recipient,
      needId,
      reminderRecipient,
      reminderNeedId,
      reminderRequestId,
      expiredRecipient,
      expiredNeedId,
      expiredRequestId,
    }),
    { mode: 0o600 }
  );
});

test("eligibility changes cancel queued delivery and reminders, with current approvals and roles checked on retry", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  for (const change of ["participation", "availability", "stale", "deletion", "suspension"]) {
    const recipient = await member(`cancel-${change}`);
    const sent = await send(f, needId, recipient);
    assert.equal(sent.status, 200);
    const requestId = (await sent.json()).requestId;
    const original = await capturedMail(recipient.email);
    await fixtureSql(
      `UPDATE outreach_notification SET state='pending' WHERE request_id='${requestId}'; UPDATE outreach_request SET sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 days') WHERE id='${requestId}'`
    );
    if (change === "participation")
      await call(recipient, "/api/profile", {
        ...profile,
        participation: false,
        participationConsent: false,
      });
    if (change === "availability")
      await call(recipient, "/api/profile", { ...profile, availability: "unavailable" });
    if (change === "stale")
      await fixtureSql(
        `UPDATE expertise_profile SET confirmed_at='2020-01-01T00:00:00.000Z' WHERE user_id='${recipient.id}'`
      );
    if (change === "deletion")
      await fixtureSql(
        `UPDATE expertise_profile SET deletion_requested_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id='${recipient.id}'`
      );
    if (change === "suspension")
      assert.equal(
        (
          await call(f.reviewer, `/api/membership/reviews/${recipient.id}/status`, {
            expectedVersion: 0,
            outcome: "suspended",
            reason: "Synthetic suspension",
            applicantMessage: "Akses ditangguhkan",
          })
        ).status,
        200
      );
    assert.equal(
      (await (await call(recipient, `/api/outreach/requests/${requestId}`)).json()).request.status,
      "cancelled"
    );
    assert.equal(
      (await call(f.coordinator, `/api/outreach/requests/${requestId}/deliver`, {})).status,
      200
    );
    assert.equal(
      (await call(f.coordinator, `/api/outreach/requests/${requestId}/remind`, {})).status,
      409
    );
    assert.equal((await send(f, await approvedNeed(f), recipient)).status, 409);
    // Suspension also sends its own membership notice; all other mailboxes remain unchanged.
    if (change !== "suspension") assert.deepEqual(await capturedMail(recipient.email), original);
    const state = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
    assert.ok(
      state.notifications
        .filter((n) => n.requestId === requestId)
        .every((n) => n.state === "cancelled")
    );
  }
  const recipient = await member("approval-retry");
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  await fixtureSql(
    `UPDATE outreach_notification SET state='pending' WHERE request_id='${requestId}'`
  );
  const original = await capturedMail(recipient.email);
  const { role } = await import("./helpers/outreach.mjs");
  await role(f.staff, "staff", f.primary, "revoke");
  assert.equal((await send(f, needId, await member("revoked-staff-recipient"))).status, 409);
  await call(f.coordinator, `/api/outreach/requests/${requestId}/deliver`, {});
  assert.deepEqual(await capturedMail(recipient.email), original);
});

test("outreach APIs, pages and data routes enforce privacy, origin checks and strict workflow input", async () => {
  const f = await setup();
  const recipient = await member("boundary-recipient");
  const outsider = await member("boundary-outsider");
  const needId = await approvedNeed(f);
  for (const actor of [null, f.primary, f.staff, f.student, outsider])
    for (const path of [
      `/api/outreach/needs/${needId}`,
      `/outreach/needs/${needId}`,
      `/outreach/needs/${needId}.data`,
    ]) {
      const response = await call(actor, path);
      assert.equal(response.status, actor ? 403 : 401);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await response.text(), /Mendampingi siswa/);
    }
  assert.equal(
    (
      await call(f.coordinator, `/api/outreach/needs/${needId}/send`, {
        expectedVersion: 1,
        recipientUserId: recipient.id,
        actorId: f.primary.id,
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(f.coordinator, `/api/outreach/needs/${needId}/send`, {
        expectedVersion: 2,
        recipientUserId: recipient.id,
      })
    ).status,
    409
  );
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  for (const path of [
    `/api/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}.data`,
  ]) {
    const denied = await call(outsider, path);
    assert.equal(denied.status, 404);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await denied.text(), /Mendampingi siswa/);
  }
  for (const path of [
    `/api/outreach/needs/${needId}/send`,
    `/api/outreach/needs/${needId}/close`,
    `/api/outreach/requests/${requestId}/respond`,
    `/api/outreach/requests/${requestId}/remind`,
    `/api/outreach/requests/${requestId}/take-over`,
    `/api/outreach/requests/${requestId}/deliver`,
  ]) {
    const denied = await call(f.coordinator, path, {}, { Origin: "https://attacker.example" });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("cache-control"), "no-store");
  }
  for (const body of [
    { outcome: "interested", consent: true },
    { outcome: "declined", reason: "x".repeat(1001) },
    { outcome: "interested", reason: "not allowed" },
  ])
    assert.equal(
      (await call(recipient, `/api/outreach/requests/${requestId}/respond`, body)).status,
      400
    );
  const race = await Promise.all([
    call(recipient, `/api/outreach/requests/${requestId}/respond`, { outcome: "interested" }),
    call(recipient, `/api/outreach/requests/${requestId}/respond`, { outcome: "declined" }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  for (const path of [
    `/api/outreach/requests/${requestId}/respond`,
    `/api/outreach/needs/${needId}/send`,
  ])
    assert.equal((await call(recipient, path)).status, 405);
  for (const path of ["/api/outreach/audit", "/admin/outreach-audit", "/admin/outreach-audit.data"])
    assert.equal((await call(f.coordinator, path)).status, 403);
});

test("historical directory approval lets an active coordinator continue and extend outreach", async () => {
  const f = await setup();
  const recipient = await member("inherited-pending");
  const needId = await approvedNeed(f);
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  const { role } = await import("./helpers/outreach.mjs");
  await role(f.coordinator, "directory-coordinator", f.primary, "revoke");
  assert.equal(
    (await send(f, needId, await member("inherited-new"), f.otherCoordinator)).status,
    200
  );
  assert.equal(
    (
      await call(f.otherCoordinator, `/api/outreach/requests/${requestId}/take-over`, {
        expectedCoordinatorUserId: f.coordinator.id,
      })
    ).status,
    200
  );
  await fixtureSql(
    `UPDATE outreach_request SET sent_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 days') WHERE id='${requestId}'; UPDATE outreach_notification SET state='pending' WHERE request_id='${requestId}'`
  );
  assert.equal(
    (await call(f.otherCoordinator, `/api/outreach/requests/${requestId}/deliver`, {})).status,
    200
  );
  assert.equal(
    (await call(f.otherCoordinator, `/api/outreach/requests/${requestId}/remind`, {})).status,
    200
  );
  assert.equal(
    (await capturedMail(recipient.email)).subject,
    "Pengingat permintaan bantuan sekolah"
  );
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );
  assert.equal((await call(f.coordinator, `/api/outreach/needs/${needId}`)).status, 403);
});
