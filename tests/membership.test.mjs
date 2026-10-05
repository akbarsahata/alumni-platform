import { test, after } from "node:test";
import assert from "node:assert/strict";
import { login, call, capturedMail, base } from "./helpers/accounts.mjs";
import { writeFile } from "node:fs/promises";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";

test("verified applicant submits a manual application and sees status without private privileges", async () => {
  const applicant = await login("applicant");
  const submitted = await call(applicant, "/api/membership/application", application);
  assert.equal(submitted.status, 200);
  const own = await (await call(applicant, "/api/membership/application")).json();
  assert.equal(own.application.status, "pending");
  assert.equal(own.application.revision, 1);
  assert.equal(own.revisions[0].schoolName, "Nama semasa sekolah");
  assert.equal(own.revisions[0].house, "Komodo");
  const access = await (await call(applicant, "/api/access")).json();
  assert.equal(access.membership.status, "none");
  assert.equal(access.permissions.directory, false);
  assert.equal(access.permissions.finance, false);
});

test("invalid identity and house fields are rejected; former students use attendance years and independent checks", async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("former-student");
  for (const invalid of [
    { house: "Unknown" },
    { house: "" },
    { house: null },
    { house: ["Komodo", "Lion"] },
    { schoolName: " " },
    { schoolName: "x".repeat(201) },
    { explanation: " " },
    { explanation: "x".repeat(1001) },
    { graduationYear: null },
    { graduationYear: 0 },
    { graduationYear: 2100 },
    { graduationYear: 2008.5 },
    { graduationYear: true },
    { studentType: "expelled", graduationYear: null },
    { studentType: "former-student", graduationYear: null },
    { studentType: "former-student", attendanceStart: 2000, attendanceEnd: 2004 },
    {
      studentType: "former-student",
      graduationYear: null,
      attendanceStart: 2004,
      attendanceEnd: 2000,
    },
    { attendanceStart: 2000, attendanceEnd: 2004 },
    { expectedRevision: -1 },
    { expectedRevision: null },
  ])
    assert.equal(
      (await call(applicant, "/api/membership/application", { ...application, ...invalid })).status,
      400,
      JSON.stringify(invalid)
    );
  assert.equal(
    (await (await call(applicant, "/api/membership/application")).json()).application,
    null
  );
  const former = {
    ...application,
    studentType: "former-student",
    graduationYear: null,
    attendanceStart: 2000,
    attendanceEnd: 2004,
  };
  assert.equal((await call(applicant, "/api/membership/application", former)).status, 200);
  const path = `/api/membership/reviews/${applicant.id}`;
  for (const invalid of [
    { checkSource: null },
    { checkSource: "applicant" },
    { checkNote: " " },
    { checkNote: "x".repeat(1001) },
    { reason: " " },
    { applicantMessage: " " },
    { outcome: "grant-admin" },
    { outcome: ["approved"] },
    { expectedRevision: null },
  ])
    assert.equal((await call(reviewer, path, { ...decision, ...invalid })).status, 400);
  assert.equal((await (await call(reviewer, path)).json()).decisions.length, 0);
  assert.equal(
    (
      await call(reviewer, path, {
        ...decision,
        checkSource: "school-staff",
        checkNote:
          "Staf sekolah mengonfirmasi masa kehadiran 2000–2004 dan kelayakan secara individual.",
      })
    ).status,
    200
  );
  const details = await (await call(reviewer, path)).json();
  assert.equal(details.revisions[0].graduationYear, null);
  assert.equal(details.revisions[0].attendanceStart, 2000);
  assert.equal(details.revisions[0].attendanceEnd, 2004);
  assert.equal(details.decisions[0].checkSource, "school-staff");
});

test("all nine houses are accepted and concurrent submissions, edits and decisions have one winning transition", async () => {
  const { reviewer } = await membershipReviewers();
  for (const house of [
    "Komodo",
    "Lion",
    "Rhino",
    "Hornbill",
    "Dove",
    "Eagle",
    "Dolphin",
    "Shark",
    "Mantaray",
  ]) {
    const applicant = await login(`house-${house.toLowerCase()}`);
    const responses = await Promise.all([
      call(applicant, "/api/membership/application", { ...application, house }),
      call(applicant, "/api/membership/application", { ...application, house }),
    ]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const own = await (await call(applicant, "/api/membership/application")).json();
    assert.equal(own.revisions.length, 1);
    assert.equal(own.application.revision, 1);
    assert.equal(own.revisions[0].house, house);
    const path = `/api/membership/reviews/${applicant.id}`;
    const decisions = await Promise.all([
      call(reviewer, path, decision),
      call(reviewer, path, { ...decision, outcome: "rejected" }),
    ]);
    assert.deepEqual(decisions.map((response) => response.status).sort(), [200, 409]);
    assert.equal((await call(reviewer, path, decision)).status, 409);
    const history = await (await call(reviewer, path)).json();
    assert.equal(history.decisions.length, 1);
    assert.equal(history.application.status, history.decisions[0].outcome);
    const access = await (await call(applicant, "/api/access")).json();
    assert.equal(
      access.membership.status,
      history.application.status === "approved" ? "approved" : "none"
    );
  }
  const applicant = await login("revision-race");
  await call(applicant, "/api/membership/application", application);
  const edits = await Promise.all([
    call(applicant, "/api/membership/application", {
      ...application,
      expectedRevision: 1,
      house: "Dove",
    }),
    call(applicant, "/api/membership/application", {
      ...application,
      expectedRevision: 1,
      house: "Eagle",
    }),
  ]);
  assert.deepEqual(edits.map((response) => response.status).sort(), [200, 409]);
  const path = `/api/membership/reviews/${applicant.id}`;
  assert.equal((await call(reviewer, path, decision)).status, 409);
  assert.equal((await (await call(reviewer, path)).json()).decisions.length, 0);
  const race = await Promise.all([
    call(applicant, "/api/membership/application", {
      ...application,
      expectedRevision: 2,
      house: "Shark",
    }),
    call(reviewer, path, { ...decision, expectedRevision: 2 }),
  ]);
  assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
  const current = await (await call(reviewer, path)).json();
  if (current.application.status === "approved") {
    assert.equal(current.application.revision, 2);
    assert.equal(
      (
        await call(applicant, "/api/membership/application", {
          ...application,
          expectedRevision: 2,
        })
      ).status,
      409
    );
  } else {
    assert.equal(current.application.revision, 3);
    assert.equal(current.decisions.length, 0);
    assert.equal((await call(reviewer, path, { ...decision, expectedRevision: 2 })).status, 409);
  }
});

test("ownership, reviewer roles, origins and self-review protect API, page and framework data routes", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const applicant = await login("private-applicant");
  const unrelated = await login("unrelated");
  await call(applicant, "/api/membership/application", {
    ...application,
    schoolName: "PRIVATE SCHOOL NAME",
    explanation: "PRIVATE APPLICANT EXPLANATION",
    userId: unrelated.id,
    status: "approved",
  });
  assert.equal(
    (await (await call(unrelated, `/api/membership/application?userId=${applicant.id}`)).json())
      .application,
    null
  );
  const finance = await login("membership-finance"),
    school = await login("membership-school"),
    directory = await login("membership-directory");
  for (const [account, role] of [
    [finance, "finance-coordinator"],
    [school, "staff"],
    [directory, "directory-coordinator"],
  ])
    await call(primary, "/api/admin/roles", {
      targetUserId: account.id,
      role,
      action: "grant",
      reason: "Role boundary test",
    });
  const path = `/api/membership/reviews/${applicant.id}`;
  for (const account of [null, primary, applicant, unrelated, finance, school, directory]) {
    for (const route of [
      "/api/membership/reviews",
      path,
      "/admin/membership",
      `/admin/membership/${applicant.id}`,
      "/admin/membership.data",
      `/admin/membership/${applicant.id}.data`,
    ]) {
      const denied = await call(account, route);
      assert.equal(denied.status, account ? 403 : 401, route);
      assert.equal(denied.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await denied.text(), /PRIVATE SCHOOL|PRIVATE APPLICANT/);
    }
    assert.equal(
      (await call(account, path, { ...decision, actorUserId: reviewer.id })).status,
      account ? 403 : 401
    );
  }
  for (const route of ["/api/membership/application", "/membership", "/membership.data"])
    assert.equal((await call(null, route)).status, 401);
  for (const origin of ["", "null", "https://attacker.example"]) {
    assert.equal(
      (await call(applicant, "/api/membership/application", application, { Origin: origin }))
        .status,
      403
    );
    assert.equal((await call(reviewer, path, decision, { Origin: origin })).status, 403);
    for (const route of [
      "/membership",
      "/membership.data",
      `/admin/membership/${applicant.id}`,
      `/admin/membership/${applicant.id}.data`,
    ])
      assert.equal((await call(reviewer, route, decision, { Origin: origin })).status, 403);
  }
  await call(reviewer, "/api/membership/application", application);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${reviewer.id}`, decision)).status,
    403
  );
  assert.equal(
    (await (await call(reviewer, `/api/membership/reviews/${reviewer.id}`)).json()).decisions
      .length,
    0
  );
  await call(primary, "/api/admin/roles", {
    targetUserId: reviewer.id,
    role: "membership-administrator",
    action: "revoke",
    reason: "Review term ended",
  });
  assert.equal((await call(reviewer, path, decision)).status, 403);
  await call(primary, "/api/admin/roles", {
    targetUserId: reviewer.id,
    role: "membership-administrator",
    action: "grant",
    reason: "Resume test review",
  });
  assert.equal((await call(reviewer, path, { ...decision, actorUserId: primary.id })).status, 200);
  const details = await (await call(reviewer, path)).json();
  assert.equal(details.decisions[0].actorUserId, reviewer.id);
  assert.doesNotMatch(
    JSON.stringify(await (await call(applicant, "/api/membership/application")).json()),
    /checkNote|checkSource|actorUserId/
  );
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
});

after(async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("browser-applicant");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/membership-accounts.json`,
    JSON.stringify({ applicant, reviewer }),
    { mode: 0o600 }
  );
});

test("manual action and decision notifications go only to the applicant and keep review notes private", async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("action-request");
  const initialMail = await capturedMail(reviewer.email);
  await call(applicant, "/api/membership/application", application);
  const path = `/api/membership/reviews/${applicant.id}`;
  assert.equal(
    (
      await call(reviewer, path, {
        expectedRevision: 1,
        outcome: "action-required",
        reason: "PRIVATE: independent reviewer note",
        applicantMessage: "Mohon lengkapi nama semasa sekolah.",
      })
    ).status,
    200
  );
  let mail = await capturedMail(applicant.email);
  assert.match(mail.subject, /Perbaikan pengajuan/);
  assert.match(mail.text, /\/membership/);
  assert.doesNotMatch(mail.text, /PRIVATE/);
  assert.equal(
    (await (await call(applicant, "/api/membership/application")).json()).application.status,
    "action-required"
  );
  await call(applicant, "/api/membership/application", { ...application, expectedRevision: 1 });
  await call(reviewer, path, { ...decision, expectedRevision: 2 });
  mail = await capturedMail(applicant.email);
  assert.match(mail.subject, /disetujui/);
  assert.doesNotMatch(JSON.stringify(mail), new RegExp(decision.checkNote));
  assert.deepEqual(await capturedMail(reviewer.email), initialMail);
});

test("independent manual review rejects then approves a corrected revision with retained private history", async () => {
  const { reviewer } = await membershipReviewers();
  const applicant = await login("resubmit");
  assert.equal((await call(applicant, "/api/membership/application", application)).status, 200);
  const queue = await (await call(reviewer, "/api/membership/reviews")).json();
  assert.ok(queue.applications.some((entry) => entry.userId === applicant.id));
  const path = `/api/membership/reviews/${applicant.id}`;
  assert.equal((await call(reviewer, path, { ...decision, outcome: "rejected" })).status, 200);
  let own = await (await call(applicant, "/api/membership/application")).json();
  assert.equal(own.application.status, "rejected");
  assert.equal(
    (
      await call(applicant, "/api/membership/application", {
        ...application,
        expectedRevision: 1,
        schoolName: "Nama sekolah diperbaiki",
        house: "Lion",
      })
    ).status,
    200
  );
  assert.equal((await call(reviewer, path, { ...decision, expectedRevision: 2 })).status, 200);
  const reviewed = await (await call(reviewer, path)).json();
  assert.equal(reviewed.decisions.length, 2);
  assert.equal(reviewed.decisions[0].actorUserId, reviewer.id);
  assert.equal(reviewed.decisions[0].reason, decision.reason);
  assert.equal(reviewed.decisions[0].checkSource, "trusted-alumnus");
  assert.equal(reviewed.decisions[0].checkNote, decision.checkNote);
  assert.match(reviewed.decisions[0].occurredAt, /Z$/);
  own = await (await call(applicant, "/api/membership/application")).json();
  assert.deepEqual(
    own.revisions.map((revision) => revision.schoolName),
    ["Nama sekolah diperbaiki", "Nama semasa sekolah"]
  );
  assert.equal(own.application.status, "approved");
  assert.doesNotMatch(JSON.stringify(own), /checkNote|checkSource|actorUserId/);
  const access = await (await call(applicant, "/api/access")).json();
  assert.equal(access.membership.house, "Lion");
  assert.equal(access.membership.status, "approved");
  assert.deepEqual(access.roles, []);
  assert.equal(access.permissions.endorse, true);
  assert.equal(access.permissions.directory, false);
  assert.equal(access.permissions.finance, false);
  assert.equal(access.permissions.reviewMembership, false);
});
