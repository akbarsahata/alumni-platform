import { test } from "node:test";
import assert from "node:assert/strict";
import { base, call, login } from "./helpers/accounts.mjs";
import { membershipReviewers, application } from "./helpers/membership.mjs";

test("declared API routes distinguish unsupported methods and unknown paths, protect origins and disable caching", async () => {
  for (const path of [
    "/api/access",
    "/api/admin/roles",
    "/api/admin/audit",
    "/api/membership/application",
    "/api/membership/reviews",
    "/api/membership/reviews/missing",
    "/api/membership/references",
    "/api/membership/references/missing",
    "/api/auth/get-session",
    "/api/auth/sign-out",
    "/api/auth/sign-in/email-otp",
    "/api/auth/email-otp/send-verification-otp",
  ]) {
    for (const method of ["DELETE", "HEAD"]) {
      const response = await fetch(`${base}${path}`, { method, headers: { Origin: base } });
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const blocked = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });
    assert.equal(blocked.status, 403, path);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
  }
  for (const path of [
    "/api/membership/unknown",
    "/api/admin/unknown",
    "/api/auth/sign-up/email",
    "/api/auth/email-otp/get-verification-otp",
    "/api/unknown",
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await fetch(`${base}/login`)).status, 200);
});

test("JSON and form validators reject malformed inputs after authorization and never accept forged actors", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const applicant = await login("backend-validation");
  for (const body of ["{", JSON.stringify([]), JSON.stringify(null)]) {
    const response = await fetch(`${base}/api/membership/application`, {
      method: "POST",
      headers: { Cookie: applicant.cookie, Origin: base, "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal((await call(null, "/api/membership/application", { house: "Invalid" })).status, 401);
  assert.equal((await call(applicant, "/api/admin/roles", { action: "Invalid" })).status, 403);
  const form = await fetch(`${base}/membership`, {
    method: "POST",
    headers: { Cookie: applicant.cookie, Origin: base },
    body: new URLSearchParams({ ...application, graduationYear: "true", expectedRevision: "0" }),
  });
  assert.equal(form.status, 400);
  assert.equal(
    (await (await call(applicant, "/api/membership/application")).json()).application,
    null
  );
  assert.equal(
    (
      await call(applicant, "/api/membership/application", {
        ...application,
        userId: reviewer.id,
        status: "approved",
      })
    ).status,
    200
  );
  const own = await (await call(applicant, "/api/membership/application")).json();
  assert.equal(own.application.userId, applicant.id);
  assert.equal(own.application.status, "pending");
  assert.equal(
    (
      await call(primary, "/api/admin/roles", {
        targetUserId: applicant.id,
        role: "primary",
        action: "grant",
        reason: "Forged privilege",
      })
    ).status,
    400
  );
});
