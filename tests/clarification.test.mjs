import { test, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { call, capturedMail } from "./helpers/accounts.mjs";
import {
  setup,
  member,
  approvedNeed,
  send,
  role,
  profile,
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

test("member asks privately and coordinator replies with linked notifications that omit text and email", async () => {
  const f = await setup();
  const recipient = await member("clarify-basic");
  const needId = await approvedNeed(f, { title: "Klarifikasi robotika" });
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200, await sent.clone().text());
  const { requestId } = await sent.json();

  const before = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(before.request.status, "pending");
  assert.deepEqual(before.clarification, []);
  assert.equal(before.access.canClarify, true);
  const staffMailBefore = await capturedMail(f.staff.email);
  const studentMailBefore = await capturedMail(f.student.email);

  const ask = await call(recipient, `/api/outreach/requests/${requestId}/clarification`, {
    body: "  Apakah kegiatan ini daring?  ",
  });
  assert.equal(ask.status, 200, await ask.clone().text());
  assert.deepEqual(await ask.json(), { changed: true, notified: true });

  const coordinatorMail = await capturedMail(f.coordinator.email);
  assert.match(coordinatorMail.subject, /Klarifikasi/);
  assert.match(coordinatorMail.text, new RegExp(`/outreach/requests/${requestId}`));
  assert.doesNotMatch(coordinatorMail.text, /Apakah kegiatan ini daring\?/);
  assert.doesNotMatch(coordinatorMail.text, new RegExp(escape(recipient.email)));
  assert.equal((await capturedMail(f.staff.email)).subject, staffMailBefore.subject);
  assert.equal((await capturedMail(f.student.email)).subject, studentMailBefore.subject);

  const afterAsk = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(afterAsk.request.status, "pending");
  assert.equal(afterAsk.request.expiresAt, before.request.expiresAt);
  assert.equal(afterAsk.clarification.length, 1);
  assert.equal(afterAsk.clarification[0].body, "Apakah kegiatan ini daring?");
  assert.equal(afterAsk.clarification[0].authorRole, "member");
  assert.equal(afterAsk.clarification[0].mine, true);
  assert.ok(afterAsk.clarification[0].createdAt);
  assert.equal(afterAsk.sharing.length, 0);
  assert.equal(afterAsk.access.canClarify, true);

  const coordinatorView = await (
    await call(f.coordinator, `/api/outreach/requests/${requestId}`)
  ).json();
  assert.equal(coordinatorView.clarification.length, 1);
  assert.equal(coordinatorView.clarification[0].mine, false);
  assert.doesNotMatch(JSON.stringify(coordinatorView), new RegExp(escape(recipient.email)));

  const reply = await call(f.coordinator, `/api/outreach/requests/${requestId}/clarification`, {
    body: "Ya, kegiatan ini daring.",
  });
  assert.equal(reply.status, 200, await reply.clone().text());
  assert.deepEqual(await reply.json(), { changed: true, notified: true });

  const memberMail = await capturedMail(recipient.email);
  assert.match(memberMail.subject, /Balasan klarifikasi/);
  assert.match(memberMail.text, new RegExp(`/outreach/requests/${requestId}`));
  assert.doesNotMatch(memberMail.text, /Ya, kegiatan ini daring\./);
  assert.doesNotMatch(memberMail.text, new RegExp(escape(f.coordinator.email)));

  const final = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(final.clarification.length, 2);
  assert.equal(final.clarification[1].body, "Ya, kegiatan ini daring.");
  assert.equal(final.clarification[1].authorRole, "coordinator");
  assert.equal(final.clarification[1].mine, false);
  assert.equal(final.request.status, "pending");
  assert.equal(final.sharing.length, 0);

  const studentView = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.doesNotMatch(
    JSON.stringify(studentView),
    /Apakah kegiatan ini daring|Ya, kegiatan ini daring/
  );
  const staffView = await (await call(f.staff, `/api/school-needs/${needId}`)).json();
  assert.doesNotMatch(
    JSON.stringify(staffView),
    /Apakah kegiatan ini daring|Ya, kegiatan ini daring/
  );
  const workspace = await (await call(f.coordinator, `/api/outreach/needs/${needId}`)).json();
  assert.doesNotMatch(
    JSON.stringify(workspace),
    /Apakah kegiatan ini daring|Ya, kegiatan ini daring/
  );

  const page = await call(recipient, `/outreach/requests/${requestId}`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  const html = await page.text();
  assert.match(html, /Klarifikasi privat/);
  assert.match(html, /Apakah kegiatan ini daring\?/);
  assert.match(html, /Ya, kegiatan ini daring\./);
  assert.match(html, /Koordinator direktori/);
  assert.match(html, /Staf dan siswa tidak dapat melihatnya/);
  assert.doesNotMatch(html, new RegExp(escape(f.coordinator.email)));
});

test("clarification is not interest or consent and leaves the request deadline unchanged", async () => {
  const f = await setup();
  const recipient = await member("clarify-not-consent");
  const needId = await approvedNeed(f, { title: "Klarifikasi sebelum minat" });
  const { requestId } = await (await send(f, needId, recipient)).json();
  const before = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();

  const ask = await call(recipient, `/api/outreach/requests/${requestId}/clarification`, {
    body: "Apakah waktu kegiatan bisa disesuaikan?",
  });
  assert.equal(ask.status, 200, await ask.clone().text());

  const after = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(after.request.status, "pending");
  assert.equal(after.request.expiresAt, before.request.expiresAt);
  assert.equal(after.request.declineReason, "");
  assert.equal(after.sharing.length, 0);
  assert.equal(after.access.canConsent, false);

  assert.equal(
    (
      await call(recipient, `/api/outreach/requests/${requestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );
  const interested = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(interested.request.status, "interested");
  assert.equal(interested.request.expiresAt, before.request.expiresAt);
  assert.equal(interested.access.canConsent, true);
  assert.equal(interested.sharing.length, 0);

  const afterInterest = await call(recipient, `/api/outreach/requests/${requestId}/clarification`, {
    body: "Saya berminat; apakah jadwalnya bisa disesuaikan?",
  });
  assert.equal(afterInterest.status, 200, await afterInterest.clone().text());
  const final = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(final.request.status, "interested");
  assert.equal(final.request.expiresAt, before.request.expiresAt);
  assert.equal(final.sharing.length, 0);
  assert.equal(final.clarification.length, 2);
  assert.equal(final.access.canClarify, true);
});

test("clarification access is limited to the recipient and current coordinators and audit stays minimal", async () => {
  const f = await setup();
  const recipient = await member("clarify-access");
  const outsider = await member("clarify-access-outsider");
  const otherRecipient = await member("clarify-access-other");
  const needId = await approvedNeed(f, { title: "Klarifikasi akses" });
  const { requestId } = await (await send(f, needId, recipient)).json();
  const otherNeed = await approvedNeed(f, { title: "Klarifikasi permintaan lain" });
  const { requestId: otherRequestId } = await (await send(f, otherNeed, otherRecipient)).json();

  const text = "Apakah ada dokumen pendukung?";
  const otherText = "Pesan hanya untuk permintaan lain.";
  const path = `/api/outreach/requests/${requestId}/clarification`;
  assert.equal((await call(recipient, path, { body: text })).status, 200);
  assert.equal(
    (
      await call(otherRecipient, `/api/outreach/requests/${otherRequestId}/clarification`, {
        body: otherText,
      })
    ).status,
    200
  );

  for (const actor of [null, f.primary, f.staff, f.student, outsider]) {
    for (const deniedPath of [
      `/api/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}`,
      `/outreach/requests/${requestId}.data`,
    ]) {
      const denied = await call(actor, deniedPath);
      assert.equal(denied.status, actor ? 404 : 401, deniedPath);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      const deniedBody = await denied.text();
      assert.doesNotMatch(deniedBody, new RegExp(escape(text)), deniedPath);
      assert.doesNotMatch(deniedBody, new RegExp(escape(recipient.email)), deniedPath);
    }
  }

  const coordinatorView = await call(f.coordinator, `/api/outreach/requests/${requestId}`);
  assert.equal(coordinatorView.status, 200);
  const coordinatorBody = await coordinatorView.text();
  assert.match(coordinatorBody, new RegExp(escape(text)));
  assert.doesNotMatch(coordinatorBody, new RegExp(escape(otherText)));

  const audit = await auditEvents(f.primary);
  const event = audit.find(
    (item) => item.action === "clarification-message" && item.actorUserId === recipient.id
  );
  assert.ok(event);
  assert.equal(event.needId, needId);
  assert.ok(event.occurredAt);
  assert.doesNotMatch(JSON.stringify(audit), new RegExp(escape(text)));
  assert.doesNotMatch(JSON.stringify(audit), new RegExp(escape(recipient.email)));
  for (const actor of [recipient, f.coordinator, f.staff, f.student]) {
    assert.equal((await call(actor, "/api/outreach/audit")).status, 403);
  }

  for (const body of [
    {},
    { body: "" },
    { body: "   " },
    { body: "x".repeat(2001) },
    { body: "Pesan valid", extra: true },
  ]) {
    const invalid = await call(recipient, path, body);
    assert.equal(invalid.status, 400, JSON.stringify(body));
    assert.equal(invalid.headers.get("cache-control"), "no-store");
  }
  const maxLength = await call(recipient, path, { body: `${"x".repeat(2000)}   ` });
  assert.equal(maxLength.status, 200, await maxLength.clone().text());
  const maxDetail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(maxDetail.clarification.at(-1).body.length, 2000);
  assert.equal((await call(recipient, path)).status, 405);
  assert.equal((await call(null, path, { body: "Pesan" })).status, 401);
  assert.equal((await call(outsider, path, { body: "Pesan" })).status, 404);
  assert.equal((await call(f.primary, path, { body: "Pesan" })).status, 404);
  const forged = await call(
    recipient,
    path,
    { body: "Pesan" },
    { Origin: "https://attacker.example" }
  );
  assert.equal(forged.status, 403);
  assert.equal(forged.headers.get("cache-control"), "no-store");

  const workspace = await call(f.coordinator, `/outreach/needs/${needId}`);
  assert.equal(workspace.status, 200);
  const workspaceBody = await workspace.text();
  assert.match(workspaceBody, /Buka klarifikasi privat/);
  assert.doesNotMatch(workspaceBody, new RegExp(escape(text)));
});

test("takeover changes the notification target and revocation removes access immediately", async () => {
  const f = await setup();
  const recipient = await member("clarify-takeover");
  const needId = await approvedNeed(f, { title: "Klarifikasi takeover" });
  const { requestId } = await (await send(f, needId, recipient)).json();
  const path = `/api/outreach/requests/${requestId}/clarification`;
  const oldMailBefore = await capturedMail(f.coordinator.email);
  assert.match(oldMailBefore.subject, /Kode masuk/);

  const takeover = await call(f.otherCoordinator, `/api/outreach/requests/${requestId}/take-over`, {
    expectedCoordinatorUserId: f.coordinator.id,
  });
  assert.equal(takeover.status, 200, await takeover.clone().text());

  assert.equal((await call(recipient, path, { body: "Kapan batas pendaftaran?" })).status, 200);
  const assignedMail = await capturedMail(f.otherCoordinator.email);
  assert.match(assignedMail.subject, /Klarifikasi/);
  assert.match(assignedMail.text, new RegExp(requestId));
  const oldMailAfter = await capturedMail(f.coordinator.email);
  assert.equal(oldMailAfter.subject, oldMailBefore.subject);

  const secondCoordinatorView = await call(f.coordinator, `/api/outreach/requests/${requestId}`);
  assert.equal(secondCoordinatorView.status, 200);
  assert.match(await secondCoordinatorView.text(), /Kapan batas pendaftaran\?/);

  assert.equal(
    (
      await call(f.primary, "/api/admin/roles", {
        targetUserId: f.otherCoordinator.id,
        role: "directory-coordinator",
        action: "revoke",
        reason: "Synthetic clarification revocation",
      })
    ).status,
    200
  );
  for (const deniedPath of [
    `/api/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}`,
    `/outreach/requests/${requestId}.data`,
  ]) {
    const denied = await call(f.otherCoordinator, deniedPath);
    assert.equal(denied.status, 404, deniedPath);
    assert.equal(denied.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await denied.text(), /Kapan batas pendaftaran\?/, deniedPath);
  }
  assert.equal(
    (await call(f.otherCoordinator, path, { body: "Pesan setelah dicabut" })).status,
    404
  );

  const reply = await call(f.coordinator, path, { body: "Batasnya akhir bulan." });
  assert.equal(reply.status, 200, await reply.clone().text());
  assert.match((await capturedMail(recipient.email)).subject, /Balasan klarifikasi/);

  await role(f.coordinator, "directory-coordinator", f.primary, "revoke");
  const withoutCoordinator = await call(recipient, path, { body: "Ada kabar lanjutan?" });
  assert.equal(withoutCoordinator.status, 200, await withoutCoordinator.clone().text());
  assert.deepEqual(await withoutCoordinator.json(), { changed: true, notified: false });
  const detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.clarification.length, 3);
  assert.equal(detail.clarification[1].body, "Batasnya akhir bulan.");
  assert.equal(detail.clarification[1].authorRole, "coordinator");
  assert.equal(detail.request.coordinatorUserId, f.otherCoordinator.id);
});

test("self-authored member messages do not notify the same account", async () => {
  const f = await setup();
  const coordinatorMember = await member("clarify-self");
  await role(coordinatorMember, "directory-coordinator", f.primary);
  const needId = await approvedNeed(f, { title: "Klarifikasi sendiri" });
  const sent = await send(f, needId, coordinatorMember, coordinatorMember);
  assert.equal(sent.status, 200, await sent.clone().text());
  const { requestId } = await sent.json();
  const result = await call(
    coordinatorMember,
    `/api/outreach/requests/${requestId}/clarification`,
    { body: "Saya bertanya sebagai penerima." }
  );
  assert.equal(result.status, 200, await result.clone().text());
  assert.deepEqual(await result.json(), { changed: true, notified: false });
  const detail = await (
    await call(coordinatorMember, `/api/outreach/requests/${requestId}`)
  ).json();
  assert.equal(detail.clarification.length, 1);
  assert.equal(detail.clarification[0].authorRole, "member");
});

test("clarification becomes read-only after decline, closure, eligibility loss, and expiry", async () => {
  const f = await setup();

  const declinedMember = await member("clarify-decline");
  const declinedNeed = await approvedNeed(f, { title: "Klarifikasi ditolak" });
  const { requestId: declinedRequestId } = await (
    await send(f, declinedNeed, declinedMember)
  ).json();
  const declinedPath = `/api/outreach/requests/${declinedRequestId}/clarification`;
  assert.equal(
    (await call(declinedMember, declinedPath, { body: "Boleh dijelaskan?" })).status,
    200
  );
  assert.equal(
    (
      await call(declinedMember, `/api/outreach/requests/${declinedRequestId}/respond`, {
        outcome: "declined",
        reason: "Tidak cocok",
      })
    ).status,
    200
  );
  assert.equal((await call(declinedMember, declinedPath, { body: "Setelah ditolak" })).status, 409);
  const declinedDetail = await (
    await call(declinedMember, `/api/outreach/requests/${declinedRequestId}`)
  ).json();
  assert.equal(declinedDetail.request.status, "declined");
  assert.equal(declinedDetail.clarification.length, 1);
  assert.equal(declinedDetail.access.canClarify, false);
  assert.match(
    await (await call(declinedMember, `/outreach/requests/${declinedRequestId}`)).text(),
    /hanya dapat dibaca/
  );

  const closedMember = await member("clarify-close");
  const closedNeed = await approvedNeed(f, { title: "Klarifikasi ditutup" });
  const { requestId: closedRequestId } = await (await send(f, closedNeed, closedMember)).json();
  const closedPath = `/api/outreach/requests/${closedRequestId}/clarification`;
  assert.equal(
    (
      await call(closedMember, `/api/outreach/requests/${closedRequestId}/respond`, {
        outcome: "interested",
      })
    ).status,
    200
  );
  assert.equal((await call(closedMember, closedPath, { body: "Pertanyaan" })).status, 200);
  assert.equal(
    (await call(f.coordinator, `/api/outreach/needs/${closedNeed}/close`, {})).status,
    200
  );
  assert.equal((await call(closedMember, closedPath, { body: "Setelah ditutup" })).status, 409);
  const closedDetail = await (
    await call(closedMember, `/api/outreach/requests/${closedRequestId}`)
  ).json();
  assert.equal(closedDetail.request.status, "interested");
  assert.equal(closedDetail.access.canClarify, false);
  assert.equal(closedDetail.clarification.length, 1);
  assert.match(
    await (await call(closedMember, `/outreach/requests/${closedRequestId}`)).text(),
    /hanya dapat dibaca/
  );

  const optOutMember = await member("clarify-optout");
  const optOutNeed = await approvedNeed(f, { title: "Klarifikasi opt-out" });
  const { requestId: optOutRequestId } = await (await send(f, optOutNeed, optOutMember)).json();
  const optOutPath = `/api/outreach/requests/${optOutRequestId}/clarification`;
  assert.equal((await call(optOutMember, optOutPath, { body: "Pertanyaan" })).status, 200);
  assert.equal(
    (
      await call(optOutMember, "/api/profile", {
        ...profile,
        participation: false,
        participationConsent: false,
      })
    ).status,
    200
  );
  assert.equal((await call(optOutMember, optOutPath, { body: "Setelah opt-out" })).status, 409);
  const optOutDetail = await (
    await call(optOutMember, `/api/outreach/requests/${optOutRequestId}`)
  ).json();
  assert.equal(optOutDetail.request.status, "cancelled");
  assert.equal(optOutDetail.clarification.length, 1);

  const expiredMember = await member("clarify-expired");
  const expiredNeed = await approvedNeed(f, { title: "Klarifikasi kedaluwarsa" });
  const { requestId: expiredRequestId } = await (await send(f, expiredNeed, expiredMember)).json();
  const expiredPath = `/api/outreach/requests/${expiredRequestId}/clarification`;
  assert.equal((await call(expiredMember, expiredPath, { body: "Pertanyaan" })).status, 200);
  await fixtureSql(
    `UPDATE outreach_request SET expires_at='2000-01-01T00:00:00.000Z' WHERE id='${expiredRequestId}'`
  );
  const expiredDetail = await (
    await call(expiredMember, `/api/outreach/requests/${expiredRequestId}`)
  ).json();
  assert.equal(expiredDetail.request.status, "expired");
  assert.equal(expiredDetail.access.canClarify, false);
  assert.equal(expiredDetail.clarification.length, 1);
  assert.equal(
    (await call(expiredMember, expiredPath, { body: "Setelah kedaluwarsa" })).status,
    409
  );
});

after(async () => {
  const f = await setup();
  const recipient = await member("clarify-browser");
  const needId = await approvedNeed(f, { title: "Klarifikasi robotika browser" });
  const { requestId } = await (await send(f, needId, recipient)).json();
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/clarification-accounts.json`,
    JSON.stringify({ ...f, recipient, needId, requestId }),
    { mode: 0o600 }
  );
});
