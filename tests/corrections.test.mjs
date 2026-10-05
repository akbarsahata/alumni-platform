import { writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { login, call, capturedMail } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";

test("replacement advances the revision atomically, invalidates old access, and retains reference history", async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("replacement-applicant");
  const reference = await login("replacement-reference");
  await call(reference, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${reference.id}`, decision);
  await call(applicant, "/api/membership/application", application);
  await call(applicant, "/api/membership/references", {
    expectedRevision: 1,
    email: reference.email,
  });
  const old = (await capturedMail(reference.email)).text.match(/\/references\/([a-f0-9-]+)/)[1];
  const responses = await Promise.all(
    [1, 2].map(() =>
      call(applicant, "/api/membership/reference-replacement", {
        expectedRevision: 1,
        email: "replacement@example.test",
      })
    )
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await call(reference, `/api/membership/references/${old}`)).status, 409);
  assert.equal(
    (
      await call(reference, `/api/membership/references/${old}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    409
  );
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision)).status,
    409
  );
  const own = await (await call(applicant, "/api/membership/application")).json();
  assert.equal(own.application.revision, 2);
  assert.equal(own.referenceStatus, "waiting");
  const history = await (await call(reviewer, `/api/membership/reviews/${applicant.id}`)).json();
  assert.equal(history.references.length, 2);
  assert.equal(history.revisions.length, 2);
  assert.match((await capturedMail("replacement@example.test")).text, /\/references\//);
});

test("approved house correction requires fresh independent review, denies member edits and stale concurrent corrections, and retains history", async () => {
  const { reviewer } = await membershipReviewers();
  const member = await login("house-correction-member");
  await call(member, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${member.id}`, decision);
  const path = `/api/membership/reviews/${member.id}/house-correction`;
  const correction = { ...decision, house: "Lion" };
  assert.equal((await call(member, path, correction)).status, 403);
  assert.equal(
    (
      await call(member, "/api/membership/application", {
        ...application,
        expectedRevision: 1,
        house: "Lion",
      })
    ).status,
    409
  );
  assert.equal(
    (await call(reviewer, path, { expectedRevision: 1, house: "Lion", reason: "Correction" }))
      .status,
    400
  );
  const race = await Promise.all([
    call(reviewer, path, correction),
    call(reviewer, path, correction),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
  const access = await (await call(member, "/api/access")).json();
  assert.equal(access.membership.house, "Lion");
  assert.equal(access.membership.status, "approved");
  const history = await (await call(reviewer, `/api/membership/reviews/${member.id}`)).json();
  assert.equal(history.revisions.length, 2);
  assert.equal(history.revisions[1].house, "Komodo");
  assert.equal(history.decisions.length, 2);
  assert.equal(history.corrections[0].actorUserId, reviewer.id);
  assert.equal(history.corrections[0].oldHouse, "Komodo");
  assert.equal(history.corrections[0].house, "Lion");
  assert.equal((await call(reviewer, path, correction)).status, 409);
  assert.doesNotMatch(
    JSON.stringify(await (await call(member, "/api/membership/application")).json()),
    /checkNote|actorUserId|oldHouse/
  );
});

async function approved(label, house = "Komodo") {
  const { reviewer } = await membershipReviewers();
  const account = await login(label);
  assert.equal(
    (await call(account, "/api/membership/application", { ...application, house })).status,
    200
  );
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${account.id}`, decision)).status,
    200
  );
  return account;
}
async function requested(applicant, reference) {
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
function expire(id) {
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  assert.match(id, /^[a-f0-9-]{36}$/);
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
      `UPDATE membership_reference SET expires_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 second') WHERE id='${id}'`,
    ],
    { stdio: "pipe" }
  );
}
test("seven-day expiry permits replacement or explained manual fallback without leaking private feedback", async () => {
  const { reviewer } = await membershipReviewers();
  const reference = await approved("expiry-recovery-reference");
  for (const manual of [false, true]) {
    const applicant = await login("expiry-recovery");
    const id = await requested(applicant, reference);
    expire(id);
    assert.equal(
      (await (await call(applicant, "/api/membership/application")).json()).referenceStatus,
      "expired"
    );
    const path = manual ? "/api/membership/manual-review" : "/api/membership/reference-replacement";
    assert.equal(
      (
        await call(applicant, path, {
          expectedRevision: 1,
          ...(manual
            ? { explanation: "Mohon hubungi staf sekolah untuk pemeriksaan baru." }
            : { email: reference.email }),
        })
      ).status,
      200
    );
    const own = await (await call(applicant, "/api/membership/application")).json();
    assert.equal(own.application.revision, 2);
    assert.equal(own.referenceStatus, manual ? null : "waiting");
    assert.equal((await call(reference, `/api/membership/references/${id}`)).status, 409);
    if (manual) {
      assert.match(own.revisions[0].explanation, /hubungi staf sekolah/);
      assert.equal(
        (
          await call(reviewer, `/api/membership/reviews/${applicant.id}`, {
            ...decision,
            expectedRevision: 2,
          })
        ).status,
        200
      );
    } else assert.match((await capturedMail(reference.email)).text, /\/references\//);
  }
  const applicant = await login("private-fallback");
  const id = await requested(applicant, reference);
  await call(reference, `/api/membership/references/${id}`, {
    outcome: "decline",
    comment: "SECRET REFERENCE FEEDBACK",
  });
  assert.equal(
    (
      await call(applicant, "/api/membership/manual-review", {
        expectedRevision: 1,
        explanation: "Mohon tinjauan melalui staf.",
      })
    ).status,
    200
  );
  assert.doesNotMatch(
    JSON.stringify(await (await call(applicant, "/api/membership/application")).json()),
    /SECRET|decline|actorUserId/
  );
  assert.doesNotMatch((await capturedMail(applicant.email)).text, /SECRET|decline/);
  const history = await (await call(reviewer, `/api/membership/reviews/${applicant.id}`)).json();
  assert.equal(history.references[0].comment, "SECRET REFERENCE FEEDBACK");
});

test("house edits invalidate prior endorsements and revalidate the new reference house, including racing old responses", async () => {
  const { reviewer } = await membershipReviewers();
  const oldReference = await approved("old-house-reference");
  const newReference = await approved("new-house-reference", "Lion");
  const applicant = await login("house-edit-applicant");
  const id = await requested(applicant, oldReference);
  const race = await Promise.all([
    call(oldReference, `/api/membership/references/${id}`, {
      outcome: "endorse",
      personallyKnown: true,
    }),
    call(applicant, "/api/membership/application", {
      ...application,
      expectedRevision: 1,
      house: "Lion",
    }),
  ]);
  assert.equal(race[1].status, 200);
  assert.ok([200, 409].includes(race[0].status));
  assert.equal(
    (await (await call(applicant, "/api/membership/application")).json()).referenceStatus,
    null
  );
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision)).status,
    409
  );
  await call(applicant, "/api/membership/references", {
    expectedRevision: 2,
    email: oldReference.email,
  });
  const wrong = (await capturedMail(oldReference.email)).text.match(
    /\/references\/([a-f0-9-]+)/
  )[1];
  assert.equal((await call(oldReference, `/api/membership/references/${wrong}`)).status, 403);
  assert.equal(
    (
      await call(applicant, "/api/membership/reference-replacement", {
        expectedRevision: 2,
        email: newReference.email,
      })
    ).status,
    200
  );
  const current = (await capturedMail(newReference.email)).text.match(
    /\/references\/([a-f0-9-]+)/
  )[1];
  assert.equal(
    (
      await call(newReference, `/api/membership/references/${current}`, {
        outcome: "endorse",
        personallyKnown: true,
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(reviewer, `/api/membership/reviews/${applicant.id}`, {
        ...decision,
        expectedRevision: 3,
      })
    ).status,
    200
  );
  assert.equal((await (await call(applicant, "/api/access")).json()).membership.house, "Lion");
});

test("replacement races with administrator decisions preserve one winning transition and reject stale actions", async () => {
  const { reviewer } = await membershipReviewers();
  const reference = await approved("replacement-review-race-reference");
  for (let i = 0; i < 3; i++) {
    const applicant = await login("replacement-review-race");
    const id = await requested(applicant, reference);
    await call(reference, `/api/membership/references/${id}`, {
      outcome: "endorse",
      personallyKnown: true,
    });
    const race = await Promise.all([
      call(applicant, "/api/membership/reference-replacement", {
        expectedRevision: 1,
        email: reference.email,
      }),
      call(reviewer, `/api/membership/reviews/${applicant.id}`, decision),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    const detail = await (await call(reviewer, `/api/membership/reviews/${applicant.id}`)).json();
    if (race[0].status === 200) {
      assert.equal(detail.application.revision, 2);
      assert.equal(detail.decisions.length, 0);
    } else {
      assert.equal(detail.application.status, "approved");
      assert.equal(detail.revisions.length, 1);
    }
    assert.equal(
      (await call(reference, `/api/membership/references/${id}`, { outcome: "decline" })).status,
      409
    );
  }
});

test("recovery and house correction enforce origins, authenticated authority, schema validation and conflicts", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const member = await approved("correction-guards-member");
  const path = `/api/membership/reviews/${member.id}/house-correction`;
  assert.equal((await call(null, path, { ...decision, house: "Lion" })).status, 401);
  assert.equal((await call(reviewer, path, { ...decision, house: "unknown" })).status, 400);
  assert.equal(
    (
      await call(
        reviewer,
        path,
        { ...decision, house: "Lion" },
        { Origin: "https://attacker.example" }
      )
    ).status,
    403
  );
  await call(primary, "/api/admin/roles", {
    targetUserId: member.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Test self-correction guard",
  });
  assert.equal((await call(member, path, { ...decision, house: "Lion" })).status, 403);
  const reference = await approved("correction-conflict-reference");
  await call(primary, "/api/admin/roles", {
    targetUserId: reference.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Test endorser guard",
  });
  const applicant = await login("correction-conflict-applicant");
  const id = await requested(applicant, reference);
  await call(reference, `/api/membership/references/${id}`, {
    outcome: "endorse",
    personallyKnown: true,
  });
  await call(reviewer, `/api/membership/reviews/${applicant.id}`, decision);
  assert.equal(
    (
      await call(reference, `/api/membership/reviews/${applicant.id}/house-correction`, {
        ...decision,
        house: "Lion",
      })
    ).status,
    403
  );
  for (const path of ["/api/membership/reference-replacement", "/api/membership/manual-review"]) {
    assert.equal(
      (
        await call(null, path, {
          expectedRevision: 1,
          email: reference.email,
          explanation: "Review",
        })
      ).status,
      401
    );
    assert.equal(
      (
        await call(
          member,
          path,
          { expectedRevision: 1, email: reference.email, explanation: "Review" },
          { Origin: "https://attacker.example" }
        )
      ).status,
      403
    );
  }
});

after(async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("browser-correction-applicant");
  const reference = await approved("browser-correction-reference");
  await requested(applicant, reference);
  const member = await approved("browser-correction-member");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/correction-accounts.json`,
    JSON.stringify({ applicant, reference, member, reviewer }),
    { mode: 0o600 }
  );
});

test("bootstrapped approved alumni without an application receive audited repeatable house corrections", async (t) => {
  const { reviewer } = await membershipReviewers();
  let fixture;
  try {
    fixture = JSON.parse(await readFile(`${process.env.ALUMNI_TEST_STATE}/accounts.json`, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      t.skip("Bootstrap fixture is supplied by the full suite roles journey.");
      return;
    }
    throw error;
  }
  const member = fixture.alumnus;
  const path = `/api/membership/reviews/${member.id}/house-correction`;
  const initial = await (await call(reviewer, `/api/membership/reviews/${member.id}`)).json();
  assert.equal(initial.revisions.length, 0);
  assert.equal(initial.application.revision, 0);
  for (const [index, house] of ["Lion", "Rhino"].entries()) {
    assert.equal(
      (await call(reviewer, path, { ...decision, expectedRevision: index, house })).status,
      200
    );
    assert.equal((await (await call(member, "/api/access")).json()).membership.house, house);
    assert.equal(
      (await call(reviewer, path, { ...decision, expectedRevision: index, house: "Shark" })).status,
      409
    );
  }
  const history = await (await call(reviewer, `/api/membership/reviews/${member.id}`)).json();
  assert.equal(history.corrections.length, 2);
  assert.equal(history.corrections[0].oldHouse, "Lion");
  assert.equal(history.corrections[1].oldHouse, "Komodo");
  assert.match((await capturedMail(member.email)).text, /Identitas sekolah telah diperiksa/);
});
