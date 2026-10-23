import assert from "node:assert/strict";
import { login, call } from "./accounts.mjs";
import { fixtureSql } from "./d1.mjs";
import { membershipReviewers, application, decision } from "./membership.mjs";

export const profile = {
  displayName: "Mentor robotika",
  introduction: "Pengalaman pendampingan robotika",
  expertiseTags: ["technology"],
  helpTypes: ["mentoring"],
  availability: "available",
  participation: true,
  participationConsent: true,
};
export const needInput = {
  category: "student-mentoring",
  title: "Pendampingan robotika",
  purpose: "Mendampingi siswa merancang robot",
  requestedHelp: "Mentor teknologi",
  timeCommitment: "2|jam|per-minggu",
  timing: "2026-11-01",
  locationMode: "remote",
  participationTerms: "voluntary",
};
export async function role(account, name, primary, action = "grant") {
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: account.id,
        role: name,
        action,
        reason: "Synthetic outreach appointment",
      })
    ).status,
    200
  );
}
export async function member(label) {
  const { reviewer } = await membershipReviewers();
  const account = await login(label);
  assert.equal((await call(account, "/api/membership/application", application)).status, 200);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${account.id}`, decision)).status,
    200
  );
  assert.equal((await call(account, "/api/profile", profile)).status, 200);
  return account;
}
export async function setup() {
  const { primary, reviewer } = await membershipReviewers();
  const staff = await login("outreach-staff");
  const student = await login("outreach-student");
  const coordinator = await login("outreach-coordinator");
  const otherCoordinator = await login("outreach-other-coordinator");
  for (const [account, name] of [
    [staff, "staff"],
    [student, "student"],
    [coordinator, "directory-coordinator"],
    [otherCoordinator, "directory-coordinator"],
  ])
    await role(account, name, primary);
  return { primary, reviewer, staff, student, coordinator, otherCoordinator };
}
export async function approvedNeed(fixture, overrides = {}) {
  const response = await call(fixture.student, "/api/school-needs", {
    ...needInput,
    staffContactUserId: fixture.staff.id,
    ...overrides,
  });
  assert.equal(response.status, 200, await response.clone().text());
  const { needId } = await response.json();
  for (const [actor, stage] of [
    [fixture.staff, "validate"],
    [fixture.coordinator, "approve"],
  ])
    assert.equal(
      (await call(actor, `/api/school-needs/${needId}/${stage}`, { expectedVersion: 1 })).status,
      200
    );
  return needId;
}
export async function send(fixture, needId, recipient, actor = fixture.coordinator) {
  return call(actor, `/api/outreach/needs/${needId}/send`, {
    expectedVersion: 1,
    recipientUserId: recipient.id,
  });
}
export async function staffAccount(label, primary) {
  const account = await login(label);
  await role(account, "staff", primary);
  return account;
}
export function respond(account, requestId, outcome = "interested", reason = "") {
  return call(account, `/api/outreach/requests/${requestId}/respond`, { outcome, reason });
}
export async function giveConsent(account, requestId) {
  const detail = await (await call(account, `/api/outreach/requests/${requestId}`)).json();
  return call(account, `/api/outreach/requests/${requestId}/consent`, {
    consent: true,
    expectedStaffUserId: detail.staffRecipient.userId,
    expectedMemberEmail: detail.viewer.email,
  });
}
export function withdrawConsent(account, requestId) {
  return call(account, `/api/outreach/requests/${requestId}/withdraw-consent`, {});
}
export function retryIntroduction(account, requestId) {
  return call(account, `/api/outreach/requests/${requestId}/introduction/deliver`, {});
}
export function changeStaff(account, needId, expectedStaffUserId, staffUserId) {
  return call(account, `/api/outreach/needs/${needId}/staff-recipient`, {
    expectedStaffUserId,
    staffUserId,
  });
}
export async function queueIntroduction(
  requestId,
  consentedAt = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
) {
  await fixtureSql(`INSERT INTO outreach_introduction(id,need_id,request_id,member_user_id,
    staff_user_id,member_email,consented_at,delivery_state)
    SELECT lower(hex(randomblob(16))),r.need_id,r.id,r.recipient_user_id,sr.user_id,u.email,
      ${consentedAt},'pending'
    FROM outreach_request r JOIN outreach_staff_recipient sr ON sr.need_id=r.need_id
    JOIN user u ON u.id=r.recipient_user_id WHERE r.id='${requestId}'`);
}

export { fixtureSql };
