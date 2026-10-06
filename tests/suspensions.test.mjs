import { test, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { login, call, capturedMail, base } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";

const suspension = {
  expectedVersion: 0,
  outcome: "suspended",
  reason: "PRIVATE suspension check",
  applicantMessage: "Keanggotaan ditangguhkan. Silakan minta tinjauan.",
};
const reinstatement = {
  expectedVersion: 1,
  outcome: "approved",
  reason: "PRIVATE independent reinstatement check",
  applicantMessage: "Pemeriksaan selesai; keanggotaan dipulihkan.",
};
const path = (member) => `/api/membership/reviews/${member.id}/status`;
async function approved(label) {
  const { reviewer } = await membershipReviewers();
  const member = await login(label);
  assert.equal((await call(member, "/api/membership/application", application)).status, 200);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${member.id}`, decision)).status,
    200
  );
  return member;
}
async function own(member) {
  return await (await call(member, "/api/membership/application")).json();
}
async function details(member) {
  const { reviewer } = await membershipReviewers();
  return await (await call(reviewer, `/api/membership/reviews/${member.id}`)).json();
}

test("suspension immediately denies reference reads/responses in existing sessions and preserves explicit roles", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const member = await approved("suspension-reference");
  for (const role of [
    "staff",
    "student",
    "finance-coordinator",
    "directory-coordinator",
    "membership-administrator",
  ]) {
    assert.equal(
      (
        await call(primary, "/api/admin/roles", {
          targetUserId: member.id,
          role,
          action: "grant",
          reason: "Separate role test",
        })
      ).status,
      200
    );
  }
  const before = await (await call(member, "/api/access")).json();
  const applicant = await login("suspension-reference-applicant");
  await call(applicant, "/api/membership/application", application);
  await call(applicant, "/api/membership/references", { expectedRevision: 1, email: member.email });
  const referenceId = (await capturedMail(member.email)).text.match(
    /\/references\/([a-f0-9-]+)/
  )[1];
  assert.equal((await call(member, `/api/membership/references/${referenceId}`)).status, 200);
  const races = await Promise.all([
    call(reviewer, path(member), suspension),
    call(reviewer, path(member), suspension),
  ]);
  assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
  const access = await (await call(member, "/api/access")).json();
  assert.equal(access.membership.status, "suspended");
  assert.equal(access.permissions.endorse, false);
  assert.deepEqual(access.roles, before.roles);
  for (const permission of [
    "finance",
    "directory",
    "validateSchoolContent",
    "proposeStudentContent",
    "reviewMembership",
  ])
    assert.equal(access.permissions[permission], true);
  assert.equal((await call(member, `/api/membership/references/${referenceId}`)).status, 403);
  assert.equal(
    (
      await call(member, `/api/membership/references/${referenceId}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    403
  );
  assert.equal(
    (await call(member, "/api/membership/application", { ...application, expectedRevision: 1 }))
      .status,
    409
  );
  assert.equal((await call(member, path(member), reinstatement)).status, 403);
});

test("one outstanding review request survives repeats, decision races, and later suspension cycles with private history retained", async () => {
  const { reviewer } = await membershipReviewers();
  const member = await approved("suspension-review");
  assert.equal((await call(reviewer, path(member), suspension)).status, 200);
  let state = await own(member);
  const body = {
    suspensionId: state.suspension.suspensionId,
    explanation: "PRIVATE member review explanation",
    userId: reviewer.id,
  };
  assert.equal(
    (await call(member, "/api/membership/suspension-review", { ...body, explanation: " " })).status,
    400
  );
  const race = await Promise.all([
    call(member, "/api/membership/suspension-review", body),
    call(member, "/api/membership/suspension-review", body),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call(member, "/api/membership/suspension-review", body)).status, 409);
  const queue = await (await call(reviewer, "/api/membership/reviews")).json();
  assert.ok(queue.members.some((m) => m.userId === member.id && m.requestedAt));
  const history = await details(member);
  assert.equal(history.suspensionRequests.length, 1);
  assert.equal(history.suspensionRequests[0].userId, member.id);
  assert.equal(history.statusDecisions[0].reason, suspension.reason);
  assert.equal(history.decisions.length, 1);
  const ownText = JSON.stringify(await own(member));
  assert.doesNotMatch(ownText, /PRIVATE suspension check|actorUserId|resolvedBy/);
  assert.doesNotMatch((await capturedMail(member.email)).text, /PRIVATE/);
  const outsider = await login("suspension-outsider");
  for (const endpoint of [
    `/api/membership/reviews/${member.id}`,
    `/admin/membership/${member.id}`,
    `/admin/membership/${member.id}.data`,
  ]) {
    const denied = await call(outsider, endpoint);
    assert.equal(denied.status, 403);
    assert.doesNotMatch(await denied.text(), /PRIVATE|suspensionRequests|statusDecisions/);
    assert.match(denied.headers.get("cache-control"), /no-store/);
  }
  const decisions = await Promise.all([
    call(reviewer, path(member), reinstatement),
    call(reviewer, path(member), reinstatement),
  ]);
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call(reviewer, path(member), suspension)).status, 409);
  state = await own(member);
  assert.equal(state.suspension.requests[0].resolved, true);
  assert.equal((await (await call(member, "/api/access")).json()).permissions.endorse, true);
  assert.match((await capturedMail(member.email)).text, /keanggotaan dipulihkan/);
  assert.equal((await call(member, "/api/membership/suspension-review", body)).status, 409);
  assert.equal(
    (await call(reviewer, path(member), { ...suspension, expectedVersion: 2 })).status,
    200
  );
  assert.equal((await call(member, "/api/membership/suspension-review", body)).status, 409);
  const next = await own(member);
  assert.equal(
    (
      await call(member, "/api/membership/suspension-review", {
        ...body,
        suspensionId: next.suspension.suspensionId,
      })
    ).status,
    200
  );
  const final = await details(member);
  assert.equal(final.statusDecisions.length, 3);
  assert.equal(final.suspensionRequests.length, 2);
  assert.equal(final.suspensionRequests.filter((r) => !r.resolvedBy).length, 1);
});

test("suspended users can sign in again with email codes and request review while concurrent reinstatement stays consistent", async () => {
  const { reviewer } = await membershipReviewers();
  const member = await approved("suspension-login");
  await call(reviewer, path(member), suspension);
  const headers = {
    Origin: base,
    "Content-Type": "application/json",
    "CF-Connecting-IP": "2001:db8:acdc:8::1",
  };
  assert.equal(
    (
      await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: member.email, type: "sign-in" }),
      })
    ).status,
    200
  );
  const otp = (await capturedMail(member.email)).text.match(/\b\d{6}\b/)[0];
  const response = await fetch(`${base}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: member.email, otp }),
  });
  assert.equal(response.status, 200);
  const fresh = { ...member, cookie: response.headers.get("set-cookie").split(";")[0] };
  assert.equal((await (await call(fresh, "/api/access")).json()).membership.status, "suspended");
  const status = await own(fresh);
  const race = await Promise.all([
    call(fresh, "/api/membership/suspension-review", {
      suspensionId: status.suspension.suspensionId,
      explanation: "Mohon pemeriksaan ulang.",
    }),
    call(reviewer, path(member), reinstatement),
  ]);
  assert.ok([200, 409].includes(race[0].status));
  assert.equal(race[1].status, 200);
  const history = await details(member);
  assert.equal(history.membership.status, "approved");
  assert.ok(history.suspensionRequests.every((r) => r.resolvedBy));
});

test("status changes enforce current authority, origins, valid reasons and independent review", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const member = await approved("suspension-guards");
  assert.equal((await call(null, path(member), suspension)).status, 401);
  assert.equal((await call(primary, path(member), suspension)).status, 403);
  assert.equal((await call(member, path(member), suspension)).status, 403);
  assert.equal((await call(reviewer, path(member), { ...suspension, reason: " " })).status, 400);
  assert.equal(
    (await call(reviewer, path(member), { ...suspension, expectedVersion: null })).status,
    400
  );
  assert.equal(
    (await call(reviewer, path(member), suspension, { Origin: "https://attacker.example" })).status,
    403
  );
  await call(reviewer, path(member), suspension);
  const status = await own(member);
  const request = { suspensionId: status.suspension.suspensionId, explanation: "Review" };
  assert.equal((await call(null, "/api/membership/suspension-review", request)).status, 401);
  assert.equal(
    (
      await call(member, "/api/membership/suspension-review", request, {
        Origin: "https://attacker.example",
      })
    ).status,
    403
  );
  const endorser = await approved("suspension-endorser");
  const applicant = await login("suspension-endorsed");
  await call(applicant, "/api/membership/application", application);
  await call(applicant, "/api/membership/references", {
    expectedRevision: 1,
    email: endorser.email,
  });
  const id = (await capturedMail(endorser.email)).text.match(/\/references\/([a-f0-9-]+)/)[1];
  await call(endorser, `/api/membership/references/${id}`, {
    outcome: "endorse",
    personallyKnown: true,
  });
  await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision);
  await call(primary, "/api/admin/roles", {
    targetUserId: endorser.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Conflict test",
  });
  assert.equal((await call(endorser, path(applicant), suspension)).status, 403);
});

test("initial trusted alumni without applications can be suspended and reinstated with retained status history", async (t) => {
  let fixture;
  try {
    fixture = JSON.parse(await readFile(`${process.env.ALUMNI_TEST_STATE}/accounts.json`, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      t.skip("Full suite bootstrap fixture");
      return;
    }
    throw error;
  }
  const { reviewer } = await membershipReviewers();
  const member = fixture.alumnus;
  assert.equal((await call(reviewer, path(member), suspension)).status, 200);
  const status = await own(member);
  assert.equal(
    (
      await call(member, "/api/membership/suspension-review", {
        suspensionId: status.suspension.suspensionId,
        explanation: "Trusted alumni review",
      })
    ).status,
    200
  );
  assert.equal((await call(reviewer, path(member), reinstatement)).status, 200);
  assert.equal((await details(member)).statusDecisions.length, 2);
});

after(async () => {
  const { reviewer } = await membershipReviewers();
  const member = await approved("browser-suspension");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/suspension-accounts.json`,
    JSON.stringify({ reviewer, member }),
    { mode: 0o600 }
  );
});
