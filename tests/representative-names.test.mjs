import { after, test } from "node:test";
import assert from "node:assert/strict";
import { base, call, capturedMail, login } from "./helpers/accounts.mjs";
import { membershipReviewers } from "./helpers/membership.mjs";
import {
  approvedNeed,
  fixtureSql,
  giveConsent,
  needInput,
  respond,
  send,
  setup,
  member,
} from "./helpers/outreach.mjs";

async function assign(primary, account, role) {
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: account.id,
        role,
        action: "grant",
        reason: "Synthetic representative name appointment",
      })
    ).status,
    200
  );
}

function nameAccount(primary, account, representativeName) {
  return call(primary, "/api/admin/representative-names", {
    targetUserId: account.id,
    representativeName,
  });
}

async function account(primary, accountId) {
  const body = await (await call(primary, "/api/admin/roles")).json();
  return body.accounts.find((item) => item.id === accountId);
}

const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("named invitations set only blank account names and preserve existing identities", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const staff = await login("named-invite-staff");
  const student = await login("named-invite-student");
  const other = await login("named-invite-other");

  const staffInput = {
    email: staff.email,
    representativeName: "Siti Rahma",
    role: "staff",
    reason: "Penunjukan wakil sekolah",
  };
  assert.equal((await call(reviewer, "/api/admin/invitations", staffInput)).status, 403);
  const issued = await call(primary, "/api/admin/invitations", staffInput);
  assert.equal(issued.status, 200);
  const invitation = await issued.json();
  const mail = await capturedMail(staff.email);
  assert.match(mail.text, new RegExp(invitation.id));
  assert.match(mail.text, /Siti Rahma/);

  const staffView = await (await call(staff, `/api/invitations/${invitation.id}`)).json();
  assert.equal(staffView.representativeName, "Siti Rahma");
  for (const visitor of [other, null]) {
    const denied = await call(visitor, `/api/invitations/${invitation.id}`);
    assert.equal(denied.status, visitor ? 404 : 401);
    const text = await denied.text();
    assert.doesNotMatch(text, /Siti Rahma/);
    assert.doesNotMatch(text, new RegExp(escape(staff.email)));
    assert.equal(denied.headers.get("cache-control"), "no-store");
  }
  assert.equal((await call(staff, `/api/invitations/${invitation.id}`, {})).status, 200);
  assert.equal((await account(primary, staff.id)).name, "Siti Rahma");
  assert.deepEqual((await (await call(staff, "/api/access")).json()).roles, ["staff"]);
  assert.equal((await (await call(staff, "/api/membership/application")).json()).application, null);
  assert.equal((await call(staff, "/api/profile")).status, 403);

  const studentInput = {
    email: student.email,
    representativeName: "Budi Santoso",
    role: "student",
    reason: "Mandat siswa",
  };
  const studentInvitation = await (
    await call(primary, "/api/admin/invitations", studentInput)
  ).json();
  assert.equal((await call(student, `/api/invitations/${studentInvitation.id}`, {})).status, 200);
  assert.equal((await account(primary, student.id)).name, "Budi Santoso");
  assert.deepEqual((await (await call(student, "/api/access")).json()).roles, ["student"]);

  const existing = await login("named-invite-existing");
  await assign(primary, existing, "staff");
  assert.equal((await nameAccount(primary, existing, "Nama Lama")).status, 200);
  const preserveInput = {
    email: existing.email,
    representativeName: "Nama Undangan Baru",
    role: "staff",
    reason: "Undangan pembaruan nama",
  };
  const preserveInvitation = await (
    await call(primary, "/api/admin/invitations", preserveInput)
  ).json();
  const preserveView = await (
    await call(existing, `/api/invitations/${preserveInvitation.id}`)
  ).json();
  assert.equal(preserveView.representativeName, "Nama Undangan Baru");
  assert.equal((await call(existing, `/api/invitations/${preserveInvitation.id}`, {})).status, 200);
  assert.equal((await account(primary, existing.id)).name, "Nama Lama");
  assert.equal((await nameAccount(primary, existing, "Nama Dikoreksi")).status, 200);
  assert.equal((await account(primary, existing.id)).name, "Nama Dikoreksi");
  const acceptedView = await (
    await call(existing, `/api/invitations/${preserveInvitation.id}`)
  ).json();
  assert.equal(acceptedView.accepted, true);
  assert.equal(acceptedView.representativeName, "Nama Undangan Baru");
});

test("primary name correction validates input, rechecks eligibility, and preserves unrelated account data", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const staff = await login("name-correction-staff");
  const student = await login("name-correction-student");
  const unassigned = await login("name-correction-unassigned");
  await assign(primary, staff, "staff");
  await assign(primary, student, "student");

  assert.equal((await nameAccount(reviewer, staff, "Bukan Hakim")).status, 403);
  for (const representativeName of [undefined, "", "   ", ` ${"x".repeat(201)} `, 42])
    assert.equal((await nameAccount(primary, staff, representativeName)).status, 400);
  assert.equal(
    (
      await call(primary, "/api/admin/representative-names", {
        targetUserId: "missing",
        representativeName: "Nama",
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(primary, "/api/admin/representative-names", {
        targetUserId: unassigned.id,
        representativeName: "Nama",
      })
    ).status,
    409
  );
  assert.equal(
    (
      await call(primary, "/api/admin/representative-names", {
        targetUserId: staff.id,
        representativeName: "Nama",
        staffContactName: "Nama yang dipalsukan",
      })
    ).status,
    400
  );
  assert.equal(
    (
      await call(
        primary,
        "/api/admin/representative-names",
        { targetUserId: staff.id, representativeName: "Nama" },
        { Origin: "https://attacker.example" }
      )
    ).status,
    403
  );

  const first = await nameAccount(primary, staff, "Ibu Sari");
  assert.equal(first.status, 200);
  assert.equal((await first.json()).changed, true);
  assert.equal((await nameAccount(primary, staff, "Ibu Sari")).status, 200);
  assert.equal((await (await nameAccount(primary, staff, "Ibu Sari")).json()).changed, false);
  assert.equal((await account(primary, staff.id)).name, "Ibu Sari");
  assert.equal((await account(primary, student.id)).name, "");

  const audit = await (await call(primary, "/api/admin/audit")).json();
  const nameEvent = audit.events.find(
    (event) => event.action === "representative-name-changed" && event.targetUserId === staff.id
  );
  assert.ok(nameEvent);
  assert.equal(nameEvent.actorUserId, primary.id);
  assert.match(nameEvent.operator, /Ibu Sari/);
  assert.match(nameEvent.occurredAt, /Z$/);
  assert.equal((await call(reviewer, "/api/admin/audit")).status, 403);

  const race = await Promise.all([
    nameAccount(primary, staff, "Ibu Sari Bersama"),
    nameAccount(primary, staff, "Ibu Sari Bersama"),
  ]);
  assert.deepEqual(
    (await Promise.all(race.map(async (response) => (await response.json()).changed))).sort(),
    [false, true]
  );
  assert.equal((await account(primary, staff.id)).name, "Ibu Sari Bersama");

  const revoked = await call(primary, "/api/admin/roles", {
    targetUserId: staff.id,
    role: "staff",
    action: "revoke",
    reason: "Synthetic term ended",
  });
  assert.equal(revoked.status, 200);
  assert.equal((await nameAccount(primary, staff, "Nama Setelah Dicabut")).status, 409);
  assert.equal((await account(primary, staff.id)).name, "Ibu Sari Bersama");
  assert.equal((await nameAccount(primary, student, "Nama Siswa")).status, 200);
  assert.equal((await account(primary, student.id)).name, "Nama Siswa");

  const form = await fetch(`${base}/admin/roles`, {
    method: "POST",
    headers: {
      Cookie: primary.cookie,
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      intent: "representative-name",
      targetUserId: student.id,
      representativeName: "Nama Siswa Form",
    }),
  });
  assert.equal(form.status, 200);
  assert.equal((await account(primary, student.id)).name, "Nama Siswa Form");
  const invalidForm = await fetch(`${base}/admin/roles`, {
    method: "POST",
    headers: {
      Cookie: primary.cookie,
      Origin: base,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      intent: "representative-name",
      targetUserId: student.id,
      representativeName: "   ",
    }),
  });
  assert.equal(invalidForm.status, 400);
  assert.equal((await account(primary, student.id)).name, "Nama Siswa Form");

  const memberStaff = await member("name-preserve-member");
  await assign(primary, memberStaff, "staff");
  assert.equal((await nameAccount(primary, memberStaff, "Anggota Staf")).status, 200);
  const beforeProfile = await (await call(memberStaff, "/api/profile")).json();
  const beforeAccess = await (await call(memberStaff, "/api/access")).json();
  assert.equal((await nameAccount(primary, memberStaff, "Anggota Staf Baru")).status, 200);
  const afterProfile = await (await call(memberStaff, "/api/profile")).json();
  const afterAccess = await (await call(memberStaff, "/api/access")).json();
  assert.deepEqual(afterProfile, beforeProfile);
  assert.deepEqual(afterAccess, beforeAccess);
});

test("corrected names flow through selectors, needs, consent and introduction mail without rewriting history", async () => {
  const f = await setup();
  assert.equal((await nameAccount(f.primary, f.staff, "Ibu Sari")).status, 200);
  const needId = await approvedNeed(f, { title: "Mentor robotika bernama" });

  const needList = await (await call(f.student, "/api/school-needs")).json();
  assert.equal(
    needList.staffContacts.find((contact) => contact.id === f.staff.id).name,
    "Ibu Sari"
  );
  let need = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(need.need.staffContactName, "Ibu Sari");
  const approvalsBefore = need.approvals;

  const recipient = await member("named-intro-member");
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const { requestId } = await sent.json();
  assert.equal((await respond(recipient, requestId)).status, 200);
  let detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.staffRecipient.name, "Ibu Sari");
  assert.match(await (await call(recipient, `/outreach/requests/${requestId}`)).text(), /Ibu Sari/);

  assert.equal((await nameAccount(f.primary, f.staff, "Ibu Sari Baru")).status, 200);
  detail = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  assert.equal(detail.staffRecipient.name, "Ibu Sari Baru");
  const consent = await giveConsent(recipient, requestId);
  assert.equal(consent.status, 200, await consent.clone().text());
  const mail = await capturedMail(f.staff.email);
  assert.match(mail.text, /Ibu Sari Baru/);

  const sharedBefore = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  const shared = sharedBefore.sharing.find((item) => item.sharedAt);
  assert.ok(shared);
  assert.equal(shared.staffUserId, f.staff.id);

  assert.equal((await nameAccount(f.primary, f.staff, "Ibu Sari Terbaru")).status, 200);
  need = await (await call(f.student, `/api/school-needs/${needId}`)).json();
  assert.equal(need.need.staffContactName, "Ibu Sari Terbaru");
  assert.deepEqual(need.approvals, approvalsBefore);
  const sharedAfter = await (await call(recipient, `/api/outreach/requests/${requestId}`)).json();
  const sharedAfterItem = sharedAfter.sharing.find((item) => item.sharedAt);
  assert.ok(sharedAfterItem);
  assert.equal(sharedAfterItem.staffUserId, shared.staffUserId);
  assert.equal(sharedAfterItem.sharedAt, shared.sharedAt);
  assert.match((await capturedMail(f.staff.email)).text, /Ibu Sari Baru/);

  const stored = await fixtureSql(
    `SELECT staff_contact_name AS name FROM school_need WHERE id='${needId}'`
  );
  assert.match(stored, /"name": "Ibu Sari"/);
  assert.doesNotMatch(stored, /Ibu Sari Terbaru/);
});

test("legacy invitations and unnamed accounts remain usable with the fallback", async () => {
  const { primary } = await membershipReviewers();
  const recipient = await login("legacy-name-invite");
  const staff = await login("legacy-name-staff");
  await assign(primary, staff, "staff");
  const invitationId = crypto.randomUUID().replaceAll("-", "");
  await fixtureSql(
    `INSERT INTO school_invitation(id,email,role,issuer_id,reason)
     VALUES('${invitationId}','${recipient.email}','student','${primary.id}','Legacy invitation')`
  );
  const view = await (await call(recipient, `/api/invitations/${invitationId}`)).json();
  assert.equal(view.representativeName, null);
  assert.equal((await call(recipient, `/api/invitations/${invitationId}`, {})).status, 200);
  assert.equal((await account(primary, recipient.id)).name, "");
  assert.deepEqual((await (await call(recipient, "/api/access")).json()).roles, ["student"]);

  const fallback = `Akun staf ${staff.id.slice(0, 8)}`;
  const contacts = await (await call(recipient, "/api/school-needs")).json();
  assert.equal(contacts.staffContacts.find((contact) => contact.id === staff.id).name, fallback);
  const submitted = await call(recipient, "/api/school-needs", {
    ...needInput,
    staffContactUserId: staff.id,
  });
  assert.equal(submitted.status, 200, await submitted.clone().text());
  const { needId } = await submitted.json();
  let need = await (await call(recipient, `/api/school-needs/${needId}`)).json();
  assert.equal(need.need.staffContactName, fallback);

  assert.equal((await nameAccount(primary, staff, "Nama Staff Legasi")).status, 200);
  need = await (await call(recipient, `/api/school-needs/${needId}`)).json();
  assert.equal(need.need.staffContactName, "Nama Staff Legasi");
  const contactsAfter = await (await call(recipient, "/api/school-needs")).json();
  assert.equal(
    contactsAfter.staffContacts.find((contact) => contact.id === staff.id).name,
    "Nama Staff Legasi"
  );
});

after(async () => {
  const f = await setup();
  assert.equal((await nameAccount(f.primary, f.staff, "Ibu Sari Browser")).status, 200);
  const needId = await approvedNeed(f, { title: "Mentor robotika untuk nama perwakilan" });
  const recipient = await member("named-browser-member");
  const sent = await send(f, needId, recipient);
  assert.equal(sent.status, 200);
  const requestId = (await sent.json()).requestId;
  assert.equal((await respond(recipient, requestId)).status, 200);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/representative-names-accounts.json`,
    JSON.stringify({
      ...f,
      needId,
      recipient,
      requestId,
    }),
    { mode: 0o600 }
  );
});
