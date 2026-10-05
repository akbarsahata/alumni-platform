import { test } from "node:test";
import assert from "node:assert/strict";
import { membershipReviewers } from "./helpers/membership.mjs";
import { login, call, capturedMail } from "./helpers/accounts.mjs";

test("primary issues a captured email invitation and verified recipient accepts only its school role", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/invitations-fixture.json`,
    JSON.stringify({ primary }),
    { mode: 0o600 }
  );
  const recipient = await login("invited-staff");
  const input = { email: recipient.email, role: "staff", reason: "Penunjukan wakil sekolah" };
  assert.equal((await call(reviewer, "/api/admin/invitations", input)).status, 403);
  const issued = await call(primary, "/api/admin/invitations", input);
  assert.equal(issued.status, 200);
  const invitation = await issued.json();
  assert.match((await capturedMail(recipient.email)).text, new RegExp(invitation.id));
  const accepted = await call(recipient, `/api/invitations/${invitation.id}`, {});
  assert.equal(accepted.status, 200);
  const access = await (await call(recipient, "/api/access")).json();
  assert.deepEqual(access.roles, ["staff"]);
  assert.equal(access.membership.status, "none");
  assert.equal(
    (await (await call(recipient, "/api/membership/application")).json()).application,
    null
  );
  for (const [name, allowed] of Object.entries(access.permissions))
    assert.equal(allowed, name === "validateSchoolContent", name);
  assert.equal((await call(recipient, `/api/invitations/${invitation.id}`, {})).status, 409);
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: recipient.id,
        role: "staff",
        action: "revoke",
        reason: "Mandat selesai",
      })
    ).status,
    200
  );
  assert.equal((await call(recipient, `/api/invitations/${invitation.id}`, {})).status, 409);
  assert.deepEqual((await (await call(recipient, "/api/access")).json()).roles, []);
});

test("invitations deny wrong email, tampering, unverified visitors and cross-origin acceptance", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const recipient = await login("invited-student"),
    other = await login("wrong-invite-email");
  const input = { email: recipient.email, role: "student", reason: "Mandat siswa" };
  for (const role of [
    "finance-coordinator",
    "directory-coordinator",
    "membership-administrator",
    "primary-administrator",
    ["staff", "student"],
  ])
    assert.equal((await call(primary, "/api/admin/invitations", { ...input, role })).status, 400);
  for (const email of ["invalid", "", "x".repeat(255)])
    assert.equal((await call(primary, "/api/admin/invitations", { ...input, email })).status, 400);
  const { id } = await (
    await call(primary, "/api/admin/invitations", {
      ...input,
      email: recipient.email.toUpperCase(),
    })
  ).json();
  for (const account of [other, reviewer, null]) {
    for (const path of [`/api/invitations/${id}`, `/invitations/${id}.data`]) {
      const denied = await call(account, path);
      if (account || path.startsWith("/api")) assert.equal(denied.status, account ? 404 : 401);
      assert.doesNotMatch(await denied.text(), new RegExp(recipient.email));
      assert.equal(denied.headers.get("cache-control"), "no-store");
    }
    assert.equal((await call(account, `/api/invitations/${id}`, {})).status, account ? 404 : 401);
  }
  for (const body of [
    { role: "finance-coordinator" },
    { role: "staff" },
    { actorUserId: primary.id },
    { targetUserId: other.id },
  ])
    assert.equal((await call(recipient, `/api/invitations/${id}`, body)).status, 400);
  for (const origin of ["", "null", "https://attacker.example"])
    assert.equal(
      (await call(recipient, `/api/invitations/${id}`, {}, { Origin: origin })).status,
      403
    );
  for (const path of ["/api/admin/invitations", "/admin/invitations", "/admin/invitations.data"])
    assert.equal((await call(reviewer, path, input)).status, 403);
  assert.equal((await call(recipient, `/api/invitations/${id}`, {})).status, 200);
  const access = await (await call(recipient, "/api/access")).json();
  assert.deepEqual(access.roles, ["student"]);
  for (const [name, allowed] of Object.entries(access.permissions))
    assert.equal(allowed, name === "proposeStudentContent", name);
  for (const path of [
    "/api/admin/roles",
    "/api/admin/audit",
    "/api/membership/reviews",
    "/admin/roles",
    "/admin/audit",
    "/admin/invitations",
  ])
    assert.equal((await call(recipient, path)).status, 403);
});

test("concurrent acceptance records one intended role grant and restricted UTC invitation history", async () => {
  const { primary } = await membershipReviewers();
  const recipient = await login("concurrent-invitation");
  const reason = `Mandat sekolah ${crypto.randomUUID()}`;
  const { id, expiresAt } = await (
    await call(primary, "/api/admin/invitations", { email: recipient.email, role: "staff", reason })
  ).json();
  const days = (Date.parse(expiresAt) - Date.now()) / 86400000;
  assert.ok(days > 6.99 && days <= 7);
  const results = await Promise.all([
    call(recipient, `/api/invitations/${id}`, {}),
    call(recipient, `/api/invitations/${id}`, {}),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const audit = await (await call(primary, "/api/admin/audit")).json();
  const events = audit.events.filter((e) => e.reason === reason);
  assert.deepEqual(events.map((e) => e.action).sort(), [
    "grant",
    "invitation-accepted",
    "invitation-issued",
  ]);
  for (const event of events) {
    assert.equal(event.role, "staff");
    assert.match(event.occurredAt, /Z$/);
  }
  assert.equal(events.find((e) => e.action === "invitation-issued").actorUserId, primary.id);
  assert.equal(events.find((e) => e.action === "invitation-accepted").actorUserId, recipient.id);
  assert.equal(events.find((e) => e.action === "grant").actorUserId, primary.id);
  assert.equal((await call(recipient, "/api/admin/audit")).status, 403);
});

test("expired invitations cannot grant a role", async () => {
  const { execFileSync } = await import("node:child_process");
  const { primary } = await membershipReviewers();
  const recipient = await login("expired-invitation");
  const issued = await (
    await call(primary, "/api/admin/invitations", {
      email: recipient.email,
      role: "student",
      reason: "Expired appointment",
    })
  ).json();
  const id = crypto.randomUUID().replaceAll("-", "");
  assert.match(issued.id, /^[a-f0-9]{32}$/);
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  // Construct only a past-time fixture in disposable D1; assertions use public HTTP.
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
      `INSERT INTO school_invitation (id,email,role,issuer_id,reason,issued_at,expires_at) SELECT '${id}',email,role,issuer_id,reason,strftime('%Y-%m-%dT%H:%M:%fZ','now','-8 days'),strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 day') FROM school_invitation WHERE id = '${issued.id}'`,
    ],
    { stdio: "pipe" }
  );
  const view = await (await call(recipient, `/api/invitations/${id}`)).json();
  assert.equal(view.expired, true);
  assert.equal((await call(recipient, `/api/invitations/${id}`, {})).status, 409);
  assert.deepEqual((await (await call(recipient, "/api/access")).json()).roles, []);
});
