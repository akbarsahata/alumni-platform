import { test, after } from "node:test";
import assert from "node:assert/strict";
import { call, capturedMail } from "./helpers/accounts.mjs";
import {
  setup,
  member,
  approvedNeed,
  send,
  profile,
  role,
  staffAccount,
  respond,
  giveConsent,
  withdrawConsent,
  retryIntroduction,
  changeStaff,
  queueIntroduction,
  fixtureSql,
} from "./helpers/outreach.mjs";

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

test("interest alone does not share email; consent is initially unchecked and sends one introduction to the named staff", async () => {
  const f = await setup();
  const recipient = await member("intro-consent");
  const needId = await approvedNeed(f, { title: "Mentor robotika untuk kelas" });
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200, await sent.clone().text());
  const { requestId } = await sent.json();
  assert.equal((await respond(recipient, requestId)).status, 200);

  const staffMailBefore = await capturedMail(f.staff.email);
  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.request.status, "interested");
  assert.equal(detail.need.purpose, "Mendampingi siswa merancang robot");
  assert.equal(detail.sharing.length, 0);
  assert.equal(detail.access.canConsent, true);
  assert.equal(detail.viewer.email, recipient.email);
  assert.equal(detail.eligible, true);

  const page = await (await call(recipient, `/outreach/requests/${requestId}`)).text();
  assert.match(page, /Persetujuan berbagi email/);
  assert.match(page, new RegExp(escape(recipient.email)));
  assert.match(page, /name="consent"/);
  assert.doesNotMatch(page, /name="consent"[^>]*checked/);
  assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore);

  const consent = await giveConsent(recipient, requestId);
  assert.equal(consent.status, 200, await consent.clone().text());
  const result = await consent.json();
  assert.equal(result.shared, true);
  assert.equal(result.pending, false);

  const mail = await capturedMail(f.staff.email);
  assert.equal(mail.to, f.staff.email);
  assert.match(mail.subject, /Perkenalan alumni/);
  assert.match(mail.text, new RegExp(escape(recipient.email)));
  assert.match(mail.text, /Mentor robotika/);
  assert.match(mail.text, /Mentor robotika untuk kelas/);
  assert.doesNotMatch(mail.text, /Komodo/);

  const afterConsent = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(afterConsent.sharing.length, 1);
  assert.ok(afterConsent.sharing[0].sharedAt);
  assert.equal(afterConsent.access.canConsent, false);
  assert.equal(afterConsent.access.canWithdraw, false);

  const coordinator = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.equal(coordinator.sharing.length, 1);
  assert.equal(coordinator.sharing[0].staffUserId, f.staff.id);
  assert.doesNotMatch(JSON.stringify(coordinator), new RegExp(escape(recipient.email)));

  const student = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.doesNotMatch(JSON.stringify(student), new RegExp(escape(recipient.email)));

  const events = await auditEvents(f.primary);
  assert.ok(events.some((event) => event.action === "consent-recorded" && event.needId === needId));
  assert.ok(
    events.some((event) => event.action === "introduction-shared" && event.needId === needId)
  );
  assert.doesNotMatch(JSON.stringify(events), new RegExp(escape(recipient.email)));
});

test("stale consent cannot share with a replacement staff recipient or changed member email", async () => {
  const f = await setup();
  const recipient = await member("intro-stale-consent");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  const displayed = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  const replacement = await staffAccount("intro-stale-staff", f.primary);
  const before = await capturedMail(replacement.email);
  assert.equal((await changeStaff(f.coordinator, needId, f.staff.id, replacement.id)).status, 200);
  const response = await call(recipient, `/api/outreach/requests/${requestId}/consent`, {
    consent: true,
    expectedStaffUserId: displayed.staffRecipient.userId,
    expectedMemberEmail: displayed.viewer.email,
  });
  assert.equal(response.status, 409, await response.clone().text());
  const staleEmail = await call(recipient, `/api/outreach/requests/${requestId}/consent`, {
    consent: true,
    expectedStaffUserId: replacement.id,
    expectedMemberEmail: `old-${recipient.id}@example.test`,
  });
  assert.equal(staleEmail.status, 409, await staleEmail.clone().text());
  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.sharing.length, 0);
  assert.deepEqual(await capturedMail(replacement.email), before);
});

test("repeated and concurrent consent share once; retries are idempotent", async () => {
  const f = await setup();
  const recipient = await member("intro-repeat");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);

  const race = await Promise.all([
    giveConsent(recipient, requestId),
    giveConsent(recipient, requestId),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);

  for (let attempt = 0; attempt < 3; attempt++) {
    const retry = await retryIntroduction(f.coordinator, requestId);
    assert.equal(retry.status, 200);
    const result = await retry.json();
    assert.equal(result.shared, false);
  }

  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.sharing.filter((item) => item.sharedAt).length, 1);
  assert.equal((await giveConsent(recipient, requestId)).status, 409);

  const events = await auditEvents(f.primary);
  assert.equal(
    events.filter((event) => event.action === "introduction-shared" && event.needId === needId)
      .length,
    1
  );
});

test("failed sharing evidence rolls back mail capture before an ordinary retry", async () => {
  const f = await setup();
  const recipient = await member("intro-capture-rollback");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  const before = await capturedMail(f.staff.email);
  await fixtureSql(`CREATE TRIGGER fail_introduction_evidence BEFORE INSERT ON outreach_audit
    WHEN NEW.action='introduction-shared' AND NEW.need_id='${needId}' BEGIN
    SELECT RAISE(ABORT,'synthetic sharing evidence failure'); END`);
  try {
    const response = await giveConsent(recipient, requestId);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.shared, false);
    assert.equal(result.pending, true);
    assert.deepEqual(await capturedMail(f.staff.email), before);
    const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
    assert.equal(detail.sharing[0].sharedAt, null);
    assert.equal(detail.sharing[0].deliveryState, "pending");
  } finally {
    await fixtureSql("DROP TRIGGER fail_introduction_evidence");
  }
  assert.equal((await (await retryIntroduction(f.coordinator, requestId)).json()).shared, true);
  assert.match((await capturedMail(f.staff.email)).text, new RegExp(escape(recipient.email)));
  assert.equal((await (await retryIntroduction(f.coordinator, requestId)).json()).shared, false);
  const events = await auditEvents(f.primary);
  assert.equal(
    events.filter((event) => event.needId === needId && event.action === "introduction-shared")
      .length,
    1
  );
});

test("withdrawal is allowed while pending, blocked after sharing, and races stay consistent", async () => {
  const f = await setup();
  const recipient = await member("intro-withdraw");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  await queueIntroduction(requestId);
  const staffMailBefore = await capturedMail(f.staff.email);

  let detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.access.canWithdraw, true);
  assert.equal(detail.sharing.length, 1);
  assert.equal(detail.sharing[0].deliveryState, "pending");

  const withdrawn = await withdrawConsent(recipient, requestId);
  assert.equal(withdrawn.status, 200, await withdrawn.clone().text());
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.ok(detail.sharing[0].withdrawnAt);
  assert.equal(detail.access.canWithdraw, false);
  assert.equal(detail.access.canConsent, true);
  assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore);

  const retry = await retryIntroduction(f.coordinator, requestId);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).shared, false);
  assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore);
  assert.equal((await withdrawConsent(recipient, requestId)).status, 409);

  const sharedRecipient = await member("intro-withdraw-shared");
  const sharedNeed = await approvedNeed(f);
  const { requestId: sharedId } = await (await send(f, sharedNeed, sharedRecipient)).json();
  assert.equal((await respond(sharedRecipient, sharedId)).status, 200);
  assert.equal((await giveConsent(sharedRecipient, sharedId)).status, 200);
  const blocked = await withdrawConsent(sharedRecipient, sharedId);
  assert.equal(blocked.status, 409);
  assert.match(await blocked.text(), /tidak dapat ditarik/i);

  const raceRecipient = await member("intro-withdraw-race");
  const raceNeed = await approvedNeed(f);
  const { requestId: raceId } = await (await send(f, raceNeed, raceRecipient)).json();
  assert.equal((await respond(raceRecipient, raceId)).status, 200);
  await queueIntroduction(raceId);
  const [raceWithdraw, raceRetry] = await Promise.all([
    withdrawConsent(raceRecipient, raceId),
    retryIntroduction(f.coordinator, raceId),
  ]);
  detail = await (await call(raceRecipient, `/api/outreach/requests/${raceId}`)).json();
  const shared = detail.sharing.some((item) => item.sharedAt);
  if (raceWithdraw.status === 200) {
    assert.equal(shared, false);
    assert.equal((await raceRetry.json()).shared, false);
  } else {
    assert.equal(raceWithdraw.status, 409);
    assert.equal(shared, true);
  }
});

test("a claimed but unshared introduction can still be withdrawn", async () => {
  const f = await setup();
  const recipient = await member("intro-withdraw-claimed");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  await queueIntroduction(requestId);
  await fixtureSql(`UPDATE outreach_introduction SET delivery_state='claimed',
    claimed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE request_id='${requestId}'`);
  const before = await capturedMail(f.staff.email);
  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.access.canWithdraw, true);
  const page = await (await call(recipient, `/outreach/requests/${requestId}`)).text();
  assert.match(page, /Tarik persetujuan/);
  const withdrawn = await withdrawConsent(recipient, requestId);
  assert.equal(withdrawn.status, 200, await withdrawn.clone().text());
  assert.equal((await (await retryIntroduction(f.coordinator, requestId)).json()).shared, false);
  const after = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.ok(after.sharing[0].withdrawnAt);
  assert.equal(after.sharing[0].sharedAt, null);
  assert.deepEqual(await capturedMail(f.staff.email), before);
});

test("expiry blocks new consent but an introduction authorized before expiry may finish", async () => {
  const f = await setup();
  const expired = await member("intro-expired");
  const expiredNeed = await approvedNeed(f);
  const { requestId: expiredId } = await (await send(f, expiredNeed, expired)).json();
  assert.equal((await respond(expired, expiredId)).status, 200);
  await fixtureSql(
    `UPDATE outreach_request SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${expiredId}'`
  );
  const staffMailBefore = await capturedMail(f.staff.email);
  assert.equal((await giveConsent(expired, expiredId)).status, 409);
  const expiredDetail = await (await call(expired, `/api/outreach/requests/${expiredId}`)).json();
  assert.equal(expiredDetail.access.expired, true);
  assert.equal(expiredDetail.access.canConsent, false);
  assert.equal(expiredDetail.sharing.length, 0);
  assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore);

  const authorized = await member("intro-authorized");
  const authorizedNeed = await approvedNeed(f);
  const { requestId: authorizedId } = await (await send(f, authorizedNeed, authorized)).json();
  assert.equal((await respond(authorized, authorizedId)).status, 200);
  await queueIntroduction(authorizedId, "strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')");
  await fixtureSql(
    `UPDATE outreach_request SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${authorizedId}'`
  );
  const retry = await retryIntroduction(f.coordinator, authorizedId);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).shared, true);
  const mail = await capturedMail(f.staff.email);
  assert.match(mail.text, new RegExp(escape(authorized.email)));
  assert.equal((await withdrawConsent(authorized, authorizedId)).status, 409);
});

test("staff role loss pauses delivery, restoration resumes it, and replacement requires fresh consent", async () => {
  const f = await setup();
  const paused = await member("intro-paused");
  const pausedNeed = await approvedNeed(f);
  const { requestId: pausedId } = await (await send(f, pausedNeed, paused)).json();
  assert.equal((await respond(paused, pausedId)).status, 200);
  await queueIntroduction(pausedId);
  const staffMailBefore = await capturedMail(f.staff.email);
  await role(f.staff, "staff", f.primary, "revoke");

  let detail = await (await call(paused, `/api/outreach/requests/${pausedId}`)).json();
  assert.equal(detail.staffRecipient.active, false);
  assert.equal(detail.access.canWithdraw, true);
  assert.equal(detail.access.canConsent, false);
  let retry = await retryIntroduction(f.coordinator, pausedId);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).shared, false);
  assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore);

  await role(f.staff, "staff", f.primary);
  retry = await retryIntroduction(f.coordinator, pausedId);
  assert.equal((await retry.json()).shared, true);
  assert.match((await capturedMail(f.staff.email)).text, new RegExp(escape(paused.email)));

  const replacement = await staffAccount("intro-replacement", f.primary);
  const memberForReplacement = await member("intro-replacement-member");
  const needForReplacement = await approvedNeed(f);
  const { requestId: replacementId } = await (
    await send(f, needForReplacement, memberForReplacement)
  ).json();
  assert.equal((await respond(memberForReplacement, replacementId)).status, 200);
  await queueIntroduction(replacementId);
  const replacementMailBefore = await capturedMail(replacement.email);

  assert.equal(
    (await changeStaff(f.coordinator, needForReplacement, f.staff.id, replacement.id)).status,
    200
  );
  detail = await (
    await call(memberForReplacement, `/api/outreach/requests/${replacementId}`)
  ).json();
  assert.equal(detail.staffRecipient.userId, replacement.id);
  assert.equal(detail.staffRecipient.active, true);
  assert.ok(detail.sharing[0].invalidatedAt);
  assert.equal(detail.access.canConsent, true);
  const page = await (
    await call(memberForReplacement, `/outreach/requests/${replacementId}`)
  ).text();
  assert.match(page, new RegExp(`Akun staf ${escape(replacement.id.slice(0, 8))}`));
  assert.match(page, /name="consent"/);
  assert.doesNotMatch(page, /name="consent"[^>]*checked/);

  retry = await retryIntroduction(f.coordinator, replacementId);
  assert.equal((await retry.json()).shared, false);
  assert.deepEqual(await capturedMail(replacement.email), replacementMailBefore);

  const freshConsent = await giveConsent(memberForReplacement, replacementId);
  assert.equal(freshConsent.status, 200);
  assert.equal((await freshConsent.json()).shared, true);
  const replacementMail = await capturedMail(replacement.email);
  assert.equal(replacementMail.to, replacement.email);
  assert.match(replacementMail.text, new RegExp(escape(memberForReplacement.email)));

  const stale = await changeStaff(f.coordinator, needForReplacement, f.staff.id, replacement.id);
  assert.equal(stale.status, 409);
  assert.equal(
    (await changeStaff(f.coordinator, needForReplacement, replacement.id, f.student.id)).status,
    409
  );
  assert.equal(
    (await changeStaff(f.coordinator, needForReplacement, replacement.id, replacement.id)).status,
    409
  );
});

test("replacing staff after a shared introduction requires fresh consent and never reuses the old share", async () => {
  const f = await setup();
  const recipient = await member("intro-replace-shared");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  assert.equal((await giveConsent(recipient, requestId)).status, 200);
  const firstMail = await capturedMail(f.staff.email);
  assert.match(firstMail.text, new RegExp(escape(recipient.email)));

  const replacement = await staffAccount("intro-replace-shared-staff", f.primary);
  const replacementMailBefore = await capturedMail(replacement.email);
  assert.equal((await changeStaff(f.coordinator, needId, f.staff.id, replacement.id)).status, 200);

  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.staffRecipient.userId, replacement.id);
  assert.equal(detail.sharing.filter((item) => item.sharedAt).length, 1);
  assert.equal(detail.sharing.find((item) => item.sharedAt).staffUserId, f.staff.id);
  assert.equal(detail.access.canConsent, true);

  const retry = await retryIntroduction(f.coordinator, requestId);
  assert.equal((await retry.json()).shared, false);
  assert.deepEqual(await capturedMail(replacement.email), replacementMailBefore);

  const fresh = await giveConsent(recipient, requestId);
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).shared, true);
  const replacementMail = await capturedMail(replacement.email);
  assert.equal(replacementMail.to, replacement.email);
  assert.match(replacementMail.text, new RegExp(escape(recipient.email)));
  const finalDetail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(finalDetail.sharing.filter((item) => item.sharedAt).length, 2);
  const events = await auditEvents(f.primary);
  assert.equal(
    events.filter((event) => event.action === "introduction-shared" && event.needId === needId)
      .length,
    2
  );
});

test("eligibility changes during queued delivery block the introduction", async () => {
  const f = await setup();
  const changes = [
    [
      "participation",
      (account) =>
        call(account, "/api/profile", {
          ...profile,
          participation: false,
          participationConsent: false,
        }),
    ],
    [
      "availability",
      (account) => call(account, "/api/profile", { ...profile, availability: "unavailable" }),
    ],
    [
      "stale",
      (account) =>
        fixtureSql(
          `UPDATE expertise_profile SET confirmed_at='2020-01-01T00:00:00.000Z' WHERE user_id='${account.id}'`
        ),
    ],
    [
      "deletion",
      (account) =>
        fixtureSql(
          `UPDATE expertise_profile SET deletion_requested_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id='${account.id}'`
        ),
    ],
    [
      "suspension",
      (account) =>
        call(f.reviewer, `/api/membership/reviews/${account.id}/status`, {
          expectedVersion: 0,
          outcome: "suspended",
          reason: "Synthetic introduction suspension",
          applicantMessage: "Akses ditangguhkan",
        }),
    ],
    [
      "email",
      (account) =>
        fixtureSql(
          `UPDATE user SET email='changed-${account.id}@example.test' WHERE id='${account.id}'`
        ),
    ],
  ];

  for (const [label, change] of changes) {
    const recipient = await member(`intro-eligibility-${label}`);
    const needId = await approvedNeed(f);
    const { requestId } = await (await send(f, needId, recipient)).json();
    assert.equal((await respond(recipient, requestId)).status, 200);
    await queueIntroduction(requestId);
    const staffMailBefore = await capturedMail(f.staff.email);
    await change(recipient);
    const retry = await retryIntroduction(f.coordinator, requestId);
    assert.equal(retry.status, 200);
    const result = await retry.json();
    assert.equal(result.shared, false, label);
    const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
    assert.ok(
      detail.sharing.some((item) => item.invalidatedAt),
      label
    );
    if (label === "participation") {
      const page = await (await call(recipient, `/outreach/requests/${requestId}`)).text();
      assert.match(page, /belum memenuhi syarat/);
    }
    assert.deepEqual(await capturedMail(f.staff.email), staffMailBefore, label);
    const events = await auditEvents(f.primary);
    assert.equal(
      events.filter((event) => event.action === "introduction-shared" && event.needId === needId)
        .length,
      0,
      label
    );
  }
});

test("sharing APIs, pages and data routes enforce ownership, privacy, origin and no-store", async () => {
  const f = await setup();
  const recipient = await member("intro-privacy");
  const outsider = await member("intro-privacy-outsider");
  const needId = await approvedNeed(f);
  const { requestId } = await (await send(f, needId, recipient)).json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  await queueIntroduction(requestId);

  for (const actor of [null, f.primary, f.staff, f.student, outsider]) {
    for (const path of [
      `/api/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}.data`,
    ]) {
      const response = await call(actor, path);
      assert.equal(response.status, actor ? 404 : 401, path);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await response.text(), new RegExp(escape(recipient.email)));
    }
  }

  for (const path of [
    `/api/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}.data`,
  ]) {
    const response = await call(f.coordinator, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await response.text(), new RegExp(escape(recipient.email)));
  }

  for (const path of [
    `/api/outreach/requests/${requestId}/consent`,
    `/api/outreach/requests/${requestId}/withdraw-consent`,
    `/api/outreach/requests/${requestId}/introduction/deliver`,
    `/api/outreach/needs/${needId}/staff-recipient`,
  ]) {
    const response = await call(f.coordinator, path);
    assert.equal(response.status, 405, path);
  }

  assert.equal(
    (await call(f.coordinator, `/api/outreach/requests/${requestId}/consent`, { consent: true }))
      .status,
    404
  );
  assert.equal(
    (await call(outsider, `/api/outreach/requests/${requestId}/consent`, { consent: true })).status,
    404
  );
  assert.equal(
    (await call(recipient, `/api/outreach/requests/${requestId}/consent`, { consent: false }))
      .status,
    400
  );
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/consent`, {
        consent: "true",
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/consent`, {
        consent: true,
        actorId: f.primary.id,
      })
    ).status,
    400
  );
  assert.equal(
    (await call(recipient, `/api/outreach/requests/${requestId}/withdraw-consent`, { x: 1 }))
      .status,
    400
  );
  assert.equal(
    (await call(f.coordinator, `/api/outreach/requests/${requestId}/introduction/deliver`, {}))
      .status,
    200
  );
  for (const [actor, expected] of [
    [recipient, 403],
    [f.student, 403],
    [f.primary, 403],
  ]) {
    assert.equal(
      (await call(actor, `/api/outreach/requests/${requestId}/introduction/deliver`, {})).status,
      expected
    );
  }
  for (const body of [
    {},
    { expectedStaffUserId: f.staff.id },
    { expectedStaffUserId: f.staff.id, staffUserId: f.staff.id, extra: true },
  ]) {
    assert.equal(
      (await call(f.coordinator, `/api/outreach/needs/${needId}/staff-recipient`, body)).status,
      400
    );
  }
  for (const path of [
    `/api/outreach/requests/${requestId}/consent`,
    `/api/outreach/requests/${requestId}/withdraw-consent`,
    `/api/outreach/requests/${requestId}/introduction/deliver`,
    `/api/outreach/needs/${needId}/staff-recipient`,
  ]) {
    const response = await call(f.coordinator, path, {}, { Origin: "https://attacker.example" });
    assert.equal(response.status, 403, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

after(async () => {
  const f = await setup();
  const replacement = await staffAccount("intro-browser-replacement", f.primary);
  const consentMember = await member("intro-browser-consent");
  const consentNeed = await approvedNeed(f, { title: "Mentor robotika untuk browser" });
  const consentSent = await send(f, consentNeed, consentMember);
  assert.equal(consentSent.status, 200);
  const consentRequestId = (await consentSent.json()).requestId;
  assert.equal((await respond(consentMember, consentRequestId)).status, 200);

  const replacementMember = await member("intro-browser-replacement-member");
  const replacementNeed = await approvedNeed(f, { title: "Mentor robotika pengganti" });
  const replacementSent = await send(f, replacementNeed, replacementMember);
  assert.equal(replacementSent.status, 200);
  const replacementRequestId = (await replacementSent.json()).requestId;
  assert.equal((await respond(replacementMember, replacementRequestId)).status, 200);
  await queueIntroduction(replacementRequestId);

  const withdrawMember = await member("intro-browser-withdraw");
  const withdrawNeed = await approvedNeed(f, { title: "Mentor robotika ditarik" });
  const withdrawSent = await send(f, withdrawNeed, withdrawMember);
  assert.equal(withdrawSent.status, 200);
  const withdrawRequestId = (await withdrawSent.json()).requestId;
  assert.equal((await respond(withdrawMember, withdrawRequestId)).status, 200);
  await queueIntroduction(withdrawRequestId);

  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/introductions-accounts.json`,
    JSON.stringify({
      ...f,
      replacement,
      consentMember,
      consentNeed,
      consentRequestId,
      replacementMember,
      replacementNeed,
      replacementRequestId,
      withdrawMember,
      withdrawNeed,
      withdrawRequestId,
    }),
    { mode: 0o600 }
  );
});
