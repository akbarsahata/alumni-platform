import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { login, call, capturedMail, base } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";

const requestPath = (id) => `/api/email-changes/${id}`;
const reason = "PRIVATE assisted email change reason";
const identityCheck = "Pemeriksaan langsung atas identitas pemilik akun.";

async function approvedMember(reviewer, label) {
  const member = await login(label);
  assert.equal((await call(member, "/api/membership/application", application)).status, 200);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${member.id}`, decision)).status,
    200
  );
  return member;
}

async function signInWithEmail(email) {
  const subnet = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const headers = {
    Origin: base,
    "Content-Type": "application/json",
    "CF-Connecting-IP": `2001:db8:${subnet.slice(0, 4)}:${subnet.slice(4)}::1`,
  };
  const sent = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  assert.equal(sent.status, 200);
  const mail = await capturedMail(email);
  const otp = mail.text.match(/\b\d{6}\b/)[0];
  const response = await fetch(`${base}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, otp }),
  });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  return { ...user, cookie: response.headers.get("set-cookie").split(";")[0] };
}

test("verified email change preserves membership and roles, revokes old sessions, and audits the identity check", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const target = await approvedMember(reviewer, "email-change-approved");
  for (const role of ["staff", "finance-coordinator"])
    assert.equal(
      (
        await call(primary, "/api/admin/roles", {
          targetUserId: target.id,
          role,
          action: "grant",
          reason: "Separate role retention test",
        })
      ).status,
      200
    );

  const other = await login("email-change-other");
  const existing = await login("email-change-collision");
  const newEmail = `verified-${crypto.randomUUID()}@example.test`;
  const input = {
    targetUserId: target.id,
    newEmail,
    identityCheck,
    reason,
  };
  assert.equal((await call(other, "/api/admin/email-changes", input)).status, 403);
  for (const path of ["/api/auth/update-user", "/api/auth/change-email"])
    assert.equal((await call(target, path, { email: newEmail })).status, 404);
  assert.equal(
    (await call(reviewer, "/api/admin/email-changes", input, { Origin: "" })).status,
    403
  );
  assert.equal(
    (
      await call(reviewer, "/api/admin/email-changes", {
        ...input,
        targetUserId: reviewer.id,
      })
    ).status,
    403
  );
  assert.equal(
    (await call(reviewer, "/api/admin/email-changes", { ...input, newEmail: existing.email }))
      .status,
    409
  );
  assert.equal(
    (
      await call(reviewer, "/api/admin/email-changes", {
        ...input,
        actorUserId: target.id,
      })
    ).status,
    400
  );

  const issuedResponse = await call(reviewer, "/api/admin/email-changes", input);
  assert.equal(issuedResponse.status, 200);
  const issued = await issuedResponse.json();
  assert.equal(issued.delivered, true);
  const message = await capturedMail(newEmail);
  const verificationToken = message.text.match(/\b[a-f0-9]{64}\b/)[0];
  assert.doesNotMatch(JSON.stringify(issued), new RegExp(verificationToken));
  assert.match(message.text, new RegExp(issued.id));
  const viewPath = requestPath(issued.id);
  assert.equal((await call(other, viewPath)).status, 404);
  assert.equal((await call(other, viewPath, { token: verificationToken })).status, 404);
  const verification = await call(target, viewPath);
  assert.equal(verification.status, 200);
  const publicView = await verification.json();
  assert.equal(publicView.email, newEmail);
  assert.doesNotMatch(JSON.stringify(publicView), /token|identityCheck|reason/);
  assert.equal((await call(target, viewPath, { token: "f".repeat(64) })).status, 409);
  assert.equal((await call(target, "/api/access")).status, 200);
  const verified = await call(target, viewPath, { token: verificationToken });
  assert.equal(verified.status, 200, await verified.text());
  assert.equal((await call(target, "/api/access")).status, 401);
  assert.equal((await call(target, viewPath, { token: verificationToken })).status, 401);

  const changed = await signInWithEmail(newEmail);
  assert.equal(changed.id, target.id);
  assert.equal(changed.email, newEmail);
  const access = await (await call(changed, "/api/access")).json();
  assert.equal(access.membership.status, "approved");
  assert.deepEqual(access.roles.sort(), ["finance-coordinator", "staff"]);

  const oldAddressAccount = await signInWithEmail(target.email);
  assert.notEqual(oldAddressAccount.id, target.id);
  assert.equal(
    (await (await call(oldAddressAccount, "/api/access")).json()).membership.status,
    "none"
  );

  const events = (await (await call(primary, "/api/admin/audit")).json()).events.filter(
    (event) => event.reason === reason
  );
  assert.deepEqual(events.map((event) => event.action).sort(), [
    "email-change-completed",
    "email-change-requested",
  ]);
  assert.equal(
    events.find((event) => event.action === "email-change-requested").actorUserId,
    reviewer.id
  );
  assert.equal(
    events.find((event) => event.action === "email-change-completed").actorUserId,
    target.id
  );
  for (const event of events) {
    assert.equal(event.targetUserId, target.id);
    assert.match(event.occurredAt, /Z$/);
  }
  assert.equal(
    events.find((event) => event.action === "email-change-requested").operator,
    identityCheck
  );
  assert.equal(
    events.find((event) => event.action === "email-change-completed").operator,
    `${target.email} → ${newEmail}`
  );
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/email-change-browser.json`,
    JSON.stringify({ reviewer, target: await login("email-change-browser-target") }),
    { mode: 0o600 }
  );
});

test("expired and wrong-account verifications cannot switch the login identity", async () => {
  const { reviewer } = await membershipReviewers();
  const target = await login("email-change-expired");
  const token = "a".repeat(64);
  const id = crypto.randomUUID().replaceAll("-", "");
  const hash = createHash("sha256").update(token).digest("hex");
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const sql = `INSERT INTO email_change_request
    (id,target_user_id,actor_user_id,old_email,new_email,identity_check,reason,token_hash,status,requested_at,expires_at)
    VALUES (${quote(id)},${quote(target.id)},${quote(reviewer.id)},${quote(target.email)},
      ${quote(`expired-${crypto.randomUUID()}@example.test`)},${quote(identityCheck)},${quote(reason)},
      ${quote(hash)},'pending',strftime('%Y-%m-%dT%H:%M:%fZ','now','-20 minutes'),
      strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 minutes'))`;
  execFileSync(
    "node_modules/.bin/wrangler",
    [
      "d1",
      "execute",
      "alumni_local",
      "--local",
      "--persist-to",
      process.env.ALUMNI_TEST_STATE,
      "--command",
      sql,
    ],
    { stdio: "pipe" }
  );
  assert.equal((await call(target, requestPath(id), { token })).status, 409);
  assert.equal((await call(target, "/api/access")).status, 200);
  const publicView = await (await call(target, requestPath(id))).json();
  assert.equal(publicView.expired, true);
  assert.doesNotMatch(JSON.stringify(publicView), new RegExp(token));
});

test("verification races and email collisions cannot change an account more than once", async () => {
  const { reviewer } = await membershipReviewers();
  const target = await login("email-change-concurrent");
  const collidingAddress = await login("email-change-address-owner");
  const prefix = `race-${crypto.randomUUID()}`;
  assert.equal(
    (
      await call(reviewer, "/api/admin/email-changes", {
        targetUserId: target.id,
        newEmail: collidingAddress.email,
        identityCheck,
        reason: "Collision must not change identity",
      })
    ).status,
    409
  );
  const newEmail = `${prefix}@example.test`;
  const issued = await (
    await call(reviewer, "/api/admin/email-changes", {
      targetUserId: target.id,
      newEmail,
      identityCheck,
      reason: "Concurrent verification test",
    })
  ).json();
  const verificationToken = (await capturedMail(newEmail)).text.match(/\b[a-f0-9]{64}\b/)[0];
  const results = await Promise.all([
    call(target, requestPath(issued.id), { token: verificationToken }),
    call(target, requestPath(issued.id), { token: verificationToken }),
  ]);
  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.ok(results.every((result) => [200, 401, 409].includes(result.status)));
  const loggedIn = await signInWithEmail(newEmail);
  assert.equal(loggedIn.id, target.id);
  assert.equal((await call(target, "/api/access")).status, 401);

  const contenders = await Promise.all([
    login("email-change-contender-one"),
    login("email-change-contender-two"),
  ]);
  const sharedAddress = `shared-${crypto.randomUUID()}@example.test`;
  const pending = [];
  for (const contender of contenders) {
    const response = await call(reviewer, "/api/admin/email-changes", {
      targetUserId: contender.id,
      newEmail: sharedAddress,
      identityCheck,
      reason: "Concurrent address collision test",
    });
    assert.equal(response.status, 200);
    const request = await response.json();
    const token = (await capturedMail(sharedAddress)).text.match(/\b[a-f0-9]{64}\b/)[0];
    pending.push({ request, token });
  }
  const collisions = await Promise.all(
    contenders.map((contender, index) =>
      call(contender, requestPath(pending[index].request.id), { token: pending[index].token })
    )
  );
  assert.deepEqual(collisions.map((response) => response.status).sort(), [200, 409]);
  const winnerId = contenders[collisions.findIndex((response) => response.status === 200)].id;
  const sharedAddressLogin = await signInWithEmail(sharedAddress);
  assert.equal(sharedAddressLogin.id, winnerId);
  const loserIndex = collisions.findIndex((response) => response.status === 409);
  assert.equal((await call(contenders[loserIndex], "/api/access")).status, 200);
});
