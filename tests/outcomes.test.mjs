import { test, after } from "node:test";
import assert from "node:assert/strict";
import { call } from "./helpers/accounts.mjs";
import {
  setup,
  member,
  approvedNeed,
  send,
  respond,
  giveConsent,
  retryIntroduction,
  changeStaff,
  queueIntroduction,
  staffAccount,
  fixtureSql,
  role,
} from "./helpers/outreach.mjs";

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const note = "Kesepakatan pendampingan robotika sekolah";

function outcome(account, requestId, body) {
  return call(account, `/api/outreach/requests/${requestId}/outcome`, body);
}

async function introducedRequest(f, label, needId) {
  const recipient = await member(label);
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200, await sent.clone().text());
  const { requestId } = await sent.json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  const consent = await giveConsent(recipient, requestId);
  assert.equal(consent.status, 200, await consent.clone().text());
  assert.equal((await consent.json()).shared, true);
  return { recipient, requestId };
}

async function auditEvents(primary) {
  const events = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const path = cursor
      ? `/api/outreach/audit?after=${encodeURIComponent(cursor)}`
      : "/api/outreach/audit";
    const body = await (await call(primary, path)).json();
    events.push(...body.events);
    cursor = body.nextCursor;
    if (!cursor) break;
  }
  return events;
}

test("the first committed share creates one introduced baseline; consent-only and pending delivery do not", async () => {
  const f = await setup();
  const recipient = await member("outcome-baseline");
  const needId = await approvedNeed(f);
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const { requestId } = await sent.json();

  let detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome, null);
  assert.equal(
    (
      await outcome(f.coordinator, requestId, {
        action: "record",
        expectedRevision: 0,
        state: "help-confirmed",
        note,
      })
    ).status,
    409
  );

  assert.equal((await respond(recipient, requestId)).status, 200);
  await queueIntroduction(requestId);
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome, null);
  const pending = await outcome(f.coordinator, requestId, {
    action: "record",
    expectedRevision: 0,
    state: "help-confirmed",
    note,
  });
  assert.equal(pending.status, 409);
  assert.equal((await (await retryIntroduction(f.coordinator, requestId)).json()).shared, true);

  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.revision, 0);
  assert.equal(detail.outcome.state, "introduced");
  assert.equal(detail.outcome.events.length, 0);
  assert.equal(detail.outcome.introducedAt, detail.sharing.find((item) => item.sharedAt).sharedAt);
  const baselineIntroducedAt = detail.outcome.introducedAt;
  assert.equal(detail.access.canConfirm, true);
  assert.equal(detail.access.canCorrect, true);

  let school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(school.outreach.introducedTotal, 1);
  assert.equal(school.outreach.introduced, 1);
  assert.equal(school.outreach.helpConfirmed, 0);

  const replacement = await staffAccount("outcome-baseline-staff", f.primary);
  assert.equal((await changeStaff(f.coordinator, needId, f.staff.id, replacement.id)).status, 200);
  const fresh = await giveConsent(recipient, requestId);
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).shared, true);
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.revision, 0);
  assert.equal(detail.outcome.state, "introduced");
  assert.equal(detail.outcome.events.length, 0);
  assert.equal(detail.outcome.introducedAt, baselineIntroducedAt);
  school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(school.outreach.introducedTotal, 1);
  assert.equal(school.outreach.introduced, 1);
});

test("coordinators record outcomes and members confirm or correct with retained history", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  const { recipient, requestId } = await introducedRequest(f, "outcome-history", needId);

  let response = await outcome(f.coordinator, requestId, {
    action: "record",
    expectedRevision: 0,
    state: "help-confirmed",
    note,
  });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(await response.json(), {
    changed: true,
    revision: 1,
    state: "help-confirmed",
  });

  let detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.state, "help-confirmed");
  assert.equal(detail.outcome.revision, 1);
  assert.equal(detail.outcome.latest.kind, "record");
  assert.equal(detail.outcome.latest.actorKind, "coordinator");
  assert.equal(detail.outcome.latest.note, note);
  assert.equal(detail.access.canConfirm, true);
  const page = await (await call(recipient, `/outreach/requests/${requestId}`)).text();
  assert.match(page, /Hasil bantuan/);
  assert.match(page, /Bantuan dikonfirmasi/);
  assert.match(page, new RegExp(escape(note)));
  assert.match(page, /Konfirmasi hasil/);
  assert.match(page, /Koreksi hasil/);

  response = await outcome(recipient, requestId, {
    action: "confirm",
    expectedRevision: 1,
  });
  assert.equal(response.status, 200, await response.clone().text());
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.revision, 2);
  assert.equal(detail.outcome.latest.kind, "confirm");
  assert.equal(detail.outcome.latest.actorKind, "member");
  assert.equal(detail.outcome.latest.note, null);
  assert.equal(detail.access.canConfirm, false);
  assert.equal(detail.access.canCorrect, true);

  response = await outcome(f.coordinator, requestId, {
    action: "record",
    expectedRevision: 2,
    state: "completed",
    note: "Bantuan selesai dan sudah diterima sekolah",
  });
  assert.equal(response.status, 200);
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.state, "completed");
  assert.equal(detail.outcome.latest.kind, "record");
  assert.equal(detail.outcome.latest.actorKind, "coordinator");
  assert.equal(detail.access.canConfirm, true);
  assert.equal(detail.outcome.events.length, 3);
  assert.deepEqual(
    detail.outcome.events.map((event) => [event.revision, event.previousState, event.state]),
    [
      [1, "introduced", "help-confirmed"],
      [2, "help-confirmed", "help-confirmed"],
      [3, "help-confirmed", "completed"],
    ]
  );

  response = await outcome(recipient, requestId, {
    action: "correct",
    expectedRevision: 3,
    state: "did-not-proceed",
    note: "Jadwal sekolah berubah sehingga pendampingan tidak berlanjut",
  });
  assert.equal(response.status, 200, await response.clone().text());
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.state, "did-not-proceed");
  assert.equal(detail.outcome.latest.kind, "correct");
  assert.equal(detail.outcome.events.length, 4);
  assert.match(
    await (await call(recipient, `/outreach/requests/${requestId}`)).text(),
    /Jadwal sekolah berubah/
  );

  const school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(school.outreach.introducedTotal, 1);
  assert.deepEqual(
    {
      introduced: school.outreach.introduced,
      helpConfirmed: school.outreach.helpConfirmed,
      completed: school.outreach.completed,
      didNotProceed: school.outreach.didNotProceed,
    },
    { introduced: 0, helpConfirmed: 0, completed: 0, didNotProceed: 1 }
  );
  assert.doesNotMatch(
    JSON.stringify(school),
    new RegExp(`${recipient.id}|${f.coordinator.id}|Jadwal sekolah|${escape(recipient.email)}`)
  );
});

test("outcome validation, ownership, stale revisions and races leave one committed event", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  const { recipient, requestId } = await introducedRequest(f, "outcome-races", needId);
  const outsider = await member("outcome-races-outsider");

  for (const [account, body, status] of [
    [f.coordinator, { action: "record", expectedRevision: 0, state: "help-confirmed" }, 400],
    [
      f.coordinator,
      { action: "record", expectedRevision: 0, state: "help-confirmed", note: "x".repeat(501) },
      400,
    ],
    [f.coordinator, { action: "record", expectedRevision: 0, state: "unknown", note }, 400],
    [f.coordinator, { action: "record", expectedRevision: -1, state: "help-confirmed", note }, 400],
    [f.coordinator, { action: "confirm", expectedRevision: 0, state: "completed" }, 403],
    [
      f.coordinator,
      { action: "record", expectedRevision: 0, state: "completed", note, actorId: f.primary.id },
      400,
    ],
    [outsider, { action: "confirm", expectedRevision: 0 }, 404],
    [outsider, { action: "correct", expectedRevision: -1, state: "unknown" }, 404],
    [recipient, { action: "record", expectedRevision: -1, state: "unknown" }, 403],
    [recipient, { action: "correct", expectedRevision: -1, state: "unknown" }, 400],
    [f.staff, { action: "confirm", expectedRevision: 0 }, 404],
    [f.primary, { action: "record", expectedRevision: 0, state: "completed", note }, 404],
    [f.coordinator, { action: "record", expectedRevision: 9, state: "completed", note }, 409],
  ]) {
    const response = await outcome(account, requestId, body);
    assert.equal(response.status, status, JSON.stringify(body));
  }

  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.events.length, 0);

  const race = await Promise.all([
    outcome(f.coordinator, requestId, {
      action: "record",
      expectedRevision: 0,
      state: "help-confirmed",
      note,
    }),
    outcome(f.otherCoordinator, requestId, {
      action: "record",
      expectedRevision: 0,
      state: "completed",
      note: "Catatan lain",
    }),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const afterRace = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(afterRace.outcome.events.length, 1);
  assert.equal(afterRace.outcome.revision, 1);

  const retry = await outcome(f.coordinator, requestId, {
    action: "record",
    expectedRevision: 0,
    state: "completed",
    note: "Kiriman ulang form lama",
  });
  assert.equal(retry.status, 409);
  assert.match(await retry.text(), /Muat ulang/);
  const afterRetry = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(afterRetry.outcome.events.length, 1);
  await assert.rejects(
    fixtureSql(`UPDATE outreach_outcome SET state='completed' WHERE request_id='${requestId}'`)
  );
  await assert.rejects(
    fixtureSql(`UPDATE outreach_outcome_event SET note='rewritten' WHERE request_id='${requestId}'`)
  );
});

test("combined coordinator/member accounts record with the source of the chosen action", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  const recipient = await member("outcome-combined");
  await role(recipient, "directory-coordinator", f.primary);
  const sent = await send(f, needId, recipient);
  const { requestId } = await sent.json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  assert.equal((await (await giveConsent(recipient, requestId)).json()).shared, true);

  assert.equal(
    (
      await outcome(recipient, requestId, {
        action: "record",
        expectedRevision: 0,
        state: "help-confirmed",
        note: "Dicatat melalui kewenangan koordinator",
      })
    ).status,
    200
  );
  let detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.latest.kind, "record");
  assert.equal(detail.outcome.latest.actorKind, "coordinator");
  assert.equal(detail.outcome.latest.actorUserId, recipient.id);

  assert.equal(
    (
      await outcome(recipient, requestId, {
        action: "confirm",
        expectedRevision: 1,
      })
    ).status,
    200
  );
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.outcome.latest.kind, "confirm");
  assert.equal(detail.outcome.latest.actorKind, "member");
  assert.equal(detail.outcome.latest.actorUserId, recipient.id);
});

test("outcome projections enforce access, suspension, no-store and aggregate-only school privacy", async () => {
  const f = await setup();
  const needId = await approvedNeed(f);
  const { recipient, requestId } = await introducedRequest(f, "outcome-privacy", needId);
  const outsider = await member("outcome-privacy-outsider");
  assert.equal(
    (
      await outcome(f.coordinator, requestId, {
        action: "record",
        expectedRevision: 0,
        state: "completed",
        note: "Catatan privat untuk hasil",
      })
    ).status,
    200
  );

  for (const [account, expected] of [
    [null, 401],
    [f.primary, 404],
    [f.staff, 404],
    [f.student, 404],
    [outsider, 404],
  ]) {
    for (const path of [
      `/api/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}.data`,
    ]) {
      const response = await call(account, path);
      assert.equal(response.status, expected, path);
      assert.equal(response.headers.get("cache-control"), "no-store", path);
      assert.doesNotMatch(await response.text(), /Catatan privat/);
    }
  }
  for (const path of [
    `/api/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}.data`,
  ]) {
    const response = await call(recipient, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  const school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(school.outreach.completed, 1);
  assert.doesNotMatch(
    JSON.stringify(school),
    new RegExp(`${recipient.id}|${f.coordinator.id}|Catatan privat|${escape(recipient.email)}`)
  );

  const events = await auditEvents(f.primary);
  const recorded = events.find(
    (event) => event.action === "outcome-recorded" && event.needId === needId
  );
  assert.ok(recorded);
  assert.equal(recorded.needId, needId);
  assert.ok(recorded.actorUserId);
  assert.deepEqual(Object.keys(recorded).sort(), [
    "action",
    "actorUserId",
    "id",
    "needId",
    "occurredAt",
  ]);
  assert.doesNotMatch(JSON.stringify(events), /Catatan privat|completed|@example.test/);

  const reviewer = f.reviewer;
  assert.equal(
    (
      await call(reviewer, `/api/membership/reviews/${recipient.id}/status`, {
        expectedVersion: 0,
        outcome: "suspended",
        reason: "Synthetic outcome suspension",
        applicantMessage: "Keanggotaan ditinjau",
      })
    ).status,
    200
  );
  const suspended = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(suspended.outcome.state, "completed");
  assert.equal(suspended.access.canConfirm, false);
  assert.equal(suspended.access.canCorrect, false);
  const deniedCorrection = await outcome(recipient, requestId, {
    action: "correct",
    expectedRevision: -1,
    state: "unknown",
  });
  assert.equal(deniedCorrection.status, 403);
  assert.equal(deniedCorrection.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await outcome(recipient, requestId, {
        action: "confirm",
        expectedRevision: 1,
      })
    ).status,
    403
  );

  for (const path of [
    `/api/outreach/requests/${requestId}/outcome`,
    `/outreach/requests/${requestId}`,
  ]) {
    const response = await call(
      f.coordinator,
      path,
      {},
      {
        Origin: "https://attacker.example",
      }
    );
    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("closure cancels open work, preserves history, blocks new consent and allows later outcomes", async () => {
  const f = await setup();
  const unanswered = await member("outcome-close-unanswered");
  const declined = await member("outcome-close-declined");
  const interested = await member("outcome-close-interested");
  const introduced = await member("outcome-close-introduced");
  const pendingShare = await member("outcome-close-pending-share");
  const needId = await approvedNeed(f);

  const unansweredId = (await (await send(f, needId, unanswered)).json()).requestId;
  const declinedId = (await (await send(f, needId, declined)).json()).requestId;
  const interestedId = (await (await send(f, needId, interested)).json()).requestId;
  const introducedSent = await send(f, needId, introduced);
  const introducedId = (await introducedSent.json()).requestId;
  const pendingShareId = (await (await send(f, needId, pendingShare)).json()).requestId;
  assert.equal((await respond(declined, declinedId, "declined", "Alasan pribadi")).status, 200);
  assert.equal((await respond(interested, interestedId)).status, 200);
  assert.equal((await respond(introduced, introducedId)).status, 200);
  assert.equal((await (await giveConsent(introduced, introducedId)).json()).shared, true);
  assert.equal((await respond(pendingShare, pendingShareId)).status, 200);
  await queueIntroduction(pendingShareId);

  await fixtureSql(
    `UPDATE outreach_notification SET state='claimed' WHERE request_id='${unansweredId}' AND kind='request'`
  );
  const beforeClose = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(
    beforeClose.notifications.find(
      (notification) => notification.requestId === unansweredId && notification.kind === "request"
    ).state,
    "claimed"
  );

  const closed = await call(f.coordinator, `/api/outreach/needs/${needId}/close`, {});
  assert.equal(closed.status, 200, await closed.clone().text());
  assert.equal((await call(f.coordinator, `/api/outreach/needs/${needId}/close`, {})).status, 409);

  const afterClose = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(afterClose.closed, true);
  assert.ok(afterClose.closedAt);
  const states = Object.fromEntries(
    afterClose.requests.map((request) => [request.id, request.status])
  );
  assert.equal(states[unansweredId], "cancelled");
  assert.equal(states[declinedId], "declined");
  assert.equal(states[interestedId], "interested");
  assert.equal(states[introducedId], "interested");
  assert.equal(states[pendingShareId], "interested");
  assert.equal(
    afterClose.notifications.find(
      (notification) => notification.requestId === unansweredId && notification.kind === "request"
    ).state,
    "cancelled"
  );
  assert.equal(
    (
      await outcome(f.coordinator, introducedId, {
        action: "record",
        expectedRevision: 0,
        state: "completed",
        note: "Bantuan selesai setelah kebutuhan ditutup",
      })
    ).status,
    200
  );
  assert.equal(
    (await (await call(introduced, `/api/outreach/requests/${introducedId}`)).json()).outcome.state,
    "completed"
  );

  const fresh = await giveConsent(interested, interestedId);
  assert.equal(fresh.status, 409);
  assert.match(await fresh.text(), /Kebutuhan sudah ditutup/);
  assert.equal((await respond(unanswered, unansweredId)).status, 409);
  assert.equal(
    (await call(f.coordinator, `/api/outreach/requests/${interestedId}/remind`, {})).status,
    409
  );
  assert.equal((await send(f, needId, await member("outcome-close-new"))).status, 409);

  const pendingDelivery = await retryIntroduction(f.coordinator, pendingShareId);
  assert.equal(pendingDelivery.status, 200);
  assert.equal((await pendingDelivery.json()).shared, true);

  const raceNeed = await approvedNeed(f);
  const raceRecipient = await member("outcome-close-race");
  const [raceSend, raceClose] = await Promise.all([
    send(f, raceNeed, raceRecipient),
    call(f.coordinator, `/api/outreach/needs/${raceNeed}/close`, {}),
  ]);
  assert.equal(raceClose.status, 200);
  assert.equal([200, 409].includes(raceSend.status), true);
  const raceWorkspace = await (await call(f.coordinator, `/api/outreach/needs/${raceNeed}`)).json();
  assert.equal(raceWorkspace.closed, true);
  assert.ok(raceWorkspace.requests.every((request) => request.status === "cancelled"));

  await fixtureSql(
    `UPDATE outreach_request SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${introducedId}'`
  );
  assert.equal(
    (
      await outcome(introduced, introducedId, {
        action: "confirm",
        expectedRevision: 1,
      })
    ).status,
    200
  );

  const school = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(school.outreach.closed, true);
  assert.ok(school.outreach.closedAt);
  assert.equal(school.outreach.introducedTotal, 2);
  assert.equal(school.outreach.completed, 1);
  assert.equal(school.outreach.introduced, 1);
  const events = await auditEvents(f.primary);
  assert.equal(
    events.filter((event) => event.action === "need-closed" && event.needId === needId).length,
    1
  );
});

test("a replacement need inherits no approvals, responses, consent or outcomes", async () => {
  const f = await setup();
  const recipient = await member("outcome-replacement");
  const original = await approvedNeed(f, { title: "Kebutuhan asli" });
  const sent = await send(f, original, recipient);
  const requestId = (await sent.json()).requestId;
  assert.equal((await respond(recipient, requestId)).status, 200);
  assert.equal((await giveConsent(recipient, requestId)).status, 200);
  assert.equal(
    (
      await outcome(f.coordinator, requestId, {
        action: "record",
        expectedRevision: 0,
        state: "completed",
        note: "Hasil kebutuhan asli",
      })
    ).status,
    200
  );
  assert.equal(
    (await call(f.coordinator, `/api/outreach/needs/${original}/close`, {})).status,
    200
  );

  const replacement = await approvedNeed(f, { title: "Kebutuhan pengganti" });
  assert.notEqual(replacement, original);
  const before = await (await call(f.coordinator, `/api/school-needs/${original}`)).json();
  assert.equal(before.need.title, "Kebutuhan asli");
  const replacementState = await (await call(f.student, `/api/school-needs/${replacement}`)).json();
  assert.equal(replacementState.outreach.total, 0);
  assert.equal(replacementState.outreach.introducedTotal, 0);
  assert.equal(replacementState.outreach.closed, false);

  const replacementSent = await send(f, replacement, recipient, f.otherCoordinator);
  assert.equal(replacementSent.status, 200, await replacementSent.clone().text());
  const replacementId = (await replacementSent.json()).requestId;
  const replacementDetail = await (
    await call(recipient, `/api/outreach/requests/${replacementId}`)
  ).json();
  assert.equal(replacementDetail.request.status, "pending");
  assert.equal(replacementDetail.sharing.length, 0);
  assert.equal(replacementDetail.outcome, null);
  const originalDetail = await (
    await call(recipient, `/api/outreach/requests/${requestId}`)
  ).json();
  assert.equal(originalDetail.outcome.state, "completed");
});

after(async () => {
  const f = await setup();
  const needId = await approvedNeed(f, { title: "Mentor robotika untuk hasil" });
  const { recipient, requestId } = await introducedRequest(f, "outcome-browser", needId);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/outcomes-accounts.json`,
    JSON.stringify({ ...f, needId, recipient, requestId }),
    { mode: 0o600 }
  );
});
