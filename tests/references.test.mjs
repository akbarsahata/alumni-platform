import { test, after } from "node:test";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { login, call, capturedMail, base } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";

test("reference email entry is neutral for registered and unknown addresses and captures an authenticated request", async () => {
  await membershipReviewers();
  const known = await login("reference-known");
  const responses = [];
  for (const email of [known.email, "unknown-reference@example.test"]) {
    const applicant = await login("reference-applicant");
    assert.equal((await call(applicant, "/api/membership/application", application)).status, 200);
    const response = await call(applicant, "/api/membership/references", {
      expectedRevision: 1,
      email,
    });
    assert.equal(response.status, 200);
    responses.push(await response.json());
    const mail = await capturedMail(email);
    assert.equal(mail.subject, "Permintaan referensi alumni");
    assert.match(mail.text, /\/references\/[a-f0-9-]+/);
    assert.doesNotMatch(mail.text, /Nama semasa sekolah|Komodo|belum terdaftar/);
    const own = await (await call(applicant, "/api/membership/application")).json();
    assert.equal(own.referenceStatus, "waiting");
  }
  assert.deepEqual(responses[0], responses[1]);
});

test("decline and cannot-confirm require manual review and disclose no private response to applicants", async () => {
  const { reviewer } = await membershipReviewers();
  const reference = await approvedReference("negative-reference");
  for (const outcome of ["decline", "cannot-confirm"]) {
    const applicant = await login(`response-${outcome}`);
    const id = await requestFor(applicant, reference);
    const path = `/api/membership/references/${id}`;
    assert.equal(
      (await call(reference, path, { outcome, comment: `PRIVATE ${outcome} COMMENT` })).status,
      200
    );
    const own = await (await call(applicant, "/api/membership/application")).json();
    assert.equal(own.referenceStatus, "manual-review");
    assert.doesNotMatch(JSON.stringify(own), /PRIVATE|decline|cannot-confirm|comment|actorUserId/);
    for (const route of ["/membership", "/membership.data"]) {
      const page = await call(applicant, route);
      assert.equal(page.status, 200);
      assert.doesNotMatch(await page.text(), /PRIVATE|decline|cannot-confirm/);
    }
    const mail = await capturedMail(applicant.email);
    assert.match(mail.text, /memerlukan tinjauan manual/);
    assert.doesNotMatch(mail.text, /PRIVATE|decline|cannot-confirm/);
    const details = await (await call(reviewer, `/api/membership/reviews/${applicant.id}`)).json();
    assert.equal(details.references[0].outcome, outcome);
    assert.equal(details.references[0].actorUserId, reference.id);
    assert.equal(details.references[0].comment, `PRIVATE ${outcome} COMMENT`);
    assert.equal(
      (await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision)).status,
      200
    );
  }
});

test("wrong recipient, self, different house and unapproved accounts cannot read or respond through API or page/data routes", async () => {
  const same = await approvedReference("same-reference");
  const different = await approvedReference("different-reference", "Lion");
  const unapproved = await login("unapproved-reference");
  const unrelated = await login("wrong-reference");
  const applicant = await login("private-reference-applicant");
  const id = await requestFor(applicant, same);
  for (const account of [null, applicant, different, unapproved, unrelated]) {
    for (const route of [
      `/api/membership/references/${id}`,
      `/references/${id}`,
      `/references/${id}.data`,
    ]) {
      const denied = await call(account, route);
      assert.equal(denied.status, account ? 403 : 401, route);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await denied.text(), /Nama semasa sekolah|Komodo/);
    }
    assert.equal(
      (
        await call(account, `/api/membership/references/${id}`, {
          outcome: "endorse",
          personallyKnown: true,
          actorUserId: same.id,
        })
      ).status,
      account ? 403 : 401
    );
  }
  for (const reference of [different, unapproved]) {
    const owner = await login("ineligible-intended");
    const token = await requestFor(owner, reference);
    assert.equal((await call(reference, `/api/membership/references/${token}`)).status, 403);
    assert.equal(
      (
        await call(reference, `/api/membership/references/${token}`, {
          outcome: "endorse",
          personallyKnown: true,
        })
      ).status,
      403
    );
  }
  const self = await login("self-reference");
  const selfToken = await requestFor(self, self);
  assert.equal(
    (
      await call(self, `/api/membership/references/${selfToken}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    403
  );
  for (const origin of ["", "null", "https://attacker.example"]) {
    assert.equal(
      (
        await call(
          same,
          `/api/membership/references/${id}`,
          { outcome: "endorse", personallyKnown: true },
          { Origin: origin }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await call(
          applicant,
          "/api/membership/references",
          { expectedRevision: 1, email: same.email },
          { Origin: origin }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await call(
          same,
          `/references/${id}.data`,
          { outcome: "endorse", personallyKnown: true },
          { Origin: origin }
        )
      ).status,
      403
    );
  }
});

test("corrections invalidate unanswered requests and endorsements; expiry blocks consumption and permits manual review", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const reference = await approvedReference("stale-reference");
  await call(primary, "/api/admin/roles", {
    targetUserId: reference.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Review conflict across revisions",
  });
  const applicant = await login("stale-applicant");
  const id = await requestFor(applicant, reference);
  const reviewPath = `/api/membership/reviews/${applicant.id}`;
  assert.equal(
    (
      await call(applicant, "/api/membership/application", {
        ...application,
        expectedRevision: 1,
        house: "Lion",
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(reference, `/api/membership/references/${id}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    409
  );
  assert.equal(
    (await (await call(applicant, "/api/membership/application")).json()).referenceStatus,
    null
  );
  const endorsed = await login("old-endorsement");
  const old = await requestFor(endorsed, reference);
  assert.equal(
    (
      await call(reference, `/api/membership/references/${old}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    200
  );
  await call(endorsed, "/api/membership/application", {
    ...application,
    expectedRevision: 1,
    house: "Lion",
  });
  assert.equal(
    (
      await call(reference, `/api/membership/reviews/${endorsed.id}`, {
        ...decision,
        expectedRevision: 2,
      })
    ).status,
    403
  );
  assert.equal(
    (await (await call(endorsed, "/api/membership/application")).json()).referenceStatus,
    null
  );
  assert.equal(
    (
      await call(reviewer, `/api/membership/reviews/${endorsed.id}`, {
        ...decision,
        expectedRevision: 2,
      })
    ).status,
    200
  );

  const expiring = await login("expiring-applicant");
  const token = await requestFor(expiring, reference);
  const view = await (await call(reference, `/api/membership/references/${token}`)).json();
  const days = (Date.parse(view.expiresAt) - Date.now()) / 86400000;
  assert.ok(days > 6.99 && days <= 7);
  // Time-boundary fixture in disposable D1 only; all assertions use public HTTP behavior.
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  assert.match(token, /^[a-f0-9-]{36}$/);
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
      `UPDATE membership_reference SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id = '${token}'`,
    ],
    { stdio: "pipe" }
  );
  const expiredPath = `/api/membership/references/${token}`;
  assert.equal((await call(reference, expiredPath)).status, 409);
  assert.equal(
    (await call(reference, expiredPath, { outcome: "endorse", personallyKnown: true })).status,
    409
  );
  assert.equal(
    (await (await call(expiring, "/api/membership/application")).json()).referenceStatus,
    "expired"
  );
  assert.equal(
    (await (await call(reviewer, `/api/membership/reviews/${expiring.id}`)).json()).references[0]
      .outcome,
    null
  );
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${expiring.id}`, decision)).status,
    200
  );
  assert.equal(
    (await call(reviewer, reviewPath, { ...decision, expectedRevision: 2 })).status,
    200
  );
});

after(async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("browser-reference-applicant");
  const reference = await approvedReference("browser-reference");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/reference-accounts.json`,
    JSON.stringify({ applicant, reference, reviewer }),
    { mode: 0o600 }
  );
});

test("one request per current graduate revision survives concurrent creation, with safe retries and invalid inputs denied", async () => {
  const applicant = await login("reference-request-race");
  await call(applicant, "/api/membership/application", application);
  for (const input of [
    null,
    [],
    { expectedRevision: true, email: "valid@example.test" },
    { expectedRevision: 0, email: "valid@example.test" },
    { expectedRevision: 1, email: "invalid" },
    { expectedRevision: 1, email: ["valid@example.test"] },
  ]) {
    const response = await fetch(`${base}/api/membership/references`, {
      method: "POST",
      headers: { Cookie: applicant.cookie, Origin: base, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    assert.equal(response.status, 400);
  }
  const emails = ["race-first@example.test", "race-second@example.test"];
  const responses = await Promise.all(
    emails.map((email) =>
      call(applicant, "/api/membership/references", { expectedRevision: 1, email })
    )
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const winner = emails[responses.findIndex((r) => r.status === 200)];
  const captured = await capturedMail(winner);
  assert.equal(
    (await call(applicant, "/api/membership/references", { expectedRevision: 1, email: winner }))
      .status,
    200
  );
  assert.deepEqual(await capturedMail(winner), captured);
  await call(applicant, "/api/membership/application", { ...application, expectedRevision: 1 });
  assert.equal(
    (await call(applicant, "/api/membership/references", { expectedRevision: 1, email: winner }))
      .status,
    409
  );
  const former = await login("former-reference");
  await call(former, "/api/membership/application", {
    ...application,
    studentType: "former-student",
    graduationYear: null,
    attendanceStart: 2000,
    attendanceEnd: 2004,
  });
  assert.equal(
    (await call(former, "/api/membership/references", { expectedRevision: 1, email: winner }))
      .status,
    409
  );
});

async function approvedReference(label, house = "Komodo") {
  const { reviewer } = await membershipReviewers();
  const account = await login(label);
  assert.equal(
    (
      await call(account, "/api/membership/application", {
        ...application,
        house,
        graduationYear: 1999,
      })
    ).status,
    200
  );
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${account.id}`, decision)).status,
    200
  );
  return account;
}
async function requestFor(applicant, reference) {
  assert.equal((await call(applicant, "/api/membership/application", application)).status, 200);
  assert.equal(
    (
      await call(applicant, "/api/membership/references", {
        expectedRevision: 1,
        email: reference.email,
      })
    ).status,
    200
  );
  return (await capturedMail(reference.email)).text.match(/\/references\/([a-f0-9-]+)/)[1];
}

test("eligible same-house reference from another year endorses with attestation, and endorsement only enables independent review", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const reference = await approvedReference("eligible-reference");
  const applicant = await login("endorsed-applicant");
  const id = await requestFor(applicant, reference);
  const path = `/api/membership/references/${id}`;
  const details = await call(reference, path);
  assert.equal(details.status, 200);
  const view = await details.json();
  assert.equal(view.schoolName, application.schoolName);
  assert.equal(view.graduationYear, 2008);
  assert.equal(view.house, "Komodo");
  assert.doesNotMatch(JSON.stringify(view), /explanation|decisions|email|userId/);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision)).status,
    409
  );
  assert.equal(
    (
      await call(reference, path, {
        outcome: "endorse",
        personallyKnown: false,
        comment: "PRIVATE RESPONSE",
      })
    ).status,
    400
  );
  const settled = await Promise.all([
    call(reference, path, {
      outcome: "endorse",
      personallyKnown: true,
      comment: "PRIVATE RESPONSE",
    }),
    call(reference, path, {
      outcome: "endorse",
      personallyKnown: true,
      comment: "OTHER PRIVATE RESPONSE",
    }),
  ]);
  assert.deepEqual(settled.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    (await call(reference, path, { outcome: "decline", comment: "rewrite" })).status,
    409
  );
  assert.equal((await (await call(applicant, "/api/access")).json()).membership.status, "none");
  const own = await (await call(applicant, "/api/membership/application")).json();
  assert.equal(own.referenceStatus, "endorsed");
  assert.doesNotMatch(JSON.stringify(own), /PRIVATE RESPONSE|comment|actorUserId/);
  await call(primary, "/api/admin/roles", {
    targetUserId: reference.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Test independent decision rule",
  });
  assert.equal(
    (await call(reference, `/api/membership/reviews/${applicant.id}`, decision)).status,
    403
  );
  const review = await (await call(reviewer, `/api/membership/reviews/${applicant.id}`)).json();
  assert.equal(review.references.length, 1);
  assert.equal(review.references[0].outcome, "endorse");
  assert.match(review.references[0].comment, /PRIVATE RESPONSE/);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision)).status,
    200
  );
  assert.equal((await (await call(applicant, "/api/access")).json()).membership.status, "approved");
});
