import { test, after } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { login, call } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";
const path = "/api/profile";
const profile = {
  displayName: "PRIVATE profile name",
  introduction: "Keahlian robotika",
  city: ["ID:SS:Palembang", "ID:JK:Jakarta"],
  country: ["ID", "AU"],
  availabilityNote: "Akhir pekan",
  expertiseTags: ["technology"],
  helpTypes: ["mentoring"],
  availability: "available",
  participation: true,
  participationConsent: true,
};
async function approved(label, identity = application) {
  const member = await login(label);
  const { reviewer } = await membershipReviewers();
  assert.equal((await call(member, "/api/membership/application", identity)).status, 200);
  assert.equal(
    (await call(reviewer, `/api/membership/reviews/${member.id}`, decision)).status,
    200
  );
  return member;
}
test("member privately creates and confirms a profile with verified identity and explicit consent", async () => {
  const member = await approved("profile");
  let response = await call(member, path);
  assert.equal(response.status, 200);
  let state = await response.json();
  assert.equal(state.profile.participation, false);
  assert.equal(state.eligibility.eligible, false);
  assert.equal((await call(member, path, { ...profile, participationConsent: false })).status, 400);
  response = await call(member, path, profile);
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.eligibility.eligible, true);
  assert.equal(state.identity.schoolName, application.schoolName);
  assert.equal(state.identity.house, "Komodo");
  assert.ok(state.profile.confirmedAt);
  assert.deepEqual(state.profile.city, profile.city);
  assert.deepEqual(state.profile.country, profile.country);
  const reloaded = await (await call(member, path)).json();
  assert.deepEqual(reloaded.profile.city, profile.city);
  assert.deepEqual(reloaded.profile.country, profile.country);
  assert.equal(
    (await call(member, path, { ...profile, userId: "forged", house: "Lion" })).status,
    400
  );
  for (const availability of ["limited", "unavailable", "available"]) {
    state = await (await call(member, path, { ...profile, availability })).json();
    assert.equal(state.eligibility.eligible, availability !== "unavailable");
  }
  state = await (
    await call(member, path, { ...profile, participation: false, participationConsent: false })
  ).json();
  assert.equal(state.eligibility.eligible, false);
  assert.equal((await call(member, "/api/profile/confirm", {})).status, 200);
});
after(async () => {
  const member = await approved("browser-profile");
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/profile-accounts.json`,
    JSON.stringify({ member }),
    { mode: 0o600 }
  );
});

test("profiles deny nonmembers and never project another member through API, pages, or data responses", async () => {
  const member = await approved("private-owner");
  await call(member, path, profile);
  const { primary, reviewer } = await membershipReviewers();
  const outsider = await approved("private-outsider");
  const pending = await login("private-pending");
  await call(pending, "/api/membership/application", application);
  const rejected = await login("private-rejected");
  await call(rejected, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${rejected.id}`, {
    ...decision,
    outcome: "rejected",
  });
  const actors = [null, primary, reviewer, pending, rejected];
  for (const role of ["staff", "student", "finance-coordinator", "directory-coordinator"]) {
    const actor = await login(`private-${role}`);
    await call(primary, "/api/admin/roles", {
      targetUserId: actor.id,
      role,
      action: "grant",
      reason: "Profile privacy fixture",
    });
    actors.push(actor);
  }
  for (const actor of actors)
    for (const endpoint of [path, "/profile", "/profile.data"]) {
      const response = await call(actor, endpoint);
      assert.equal(response.status, actor ? 403 : 401);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(await response.text(), /PRIVATE profile name|Keahlian robotika/);
    }
  for (const endpoint of [
    `${path}/${member.id}`,
    `/profile/${member.id}`,
    `/profile/${member.id}.data`,
  ]) {
    const response = await call(outsider, endpoint);
    assert.equal(response.status, 404);
    assert.doesNotMatch(await response.text(), /PRIVATE profile name|Keahlian robotika/);
  }
  for (const endpoint of [
    `${path}?userId=${member.id}`,
    `/profile?userId=${member.id}`,
    `/profile.data?userId=${member.id}`,
  ]) {
    const response = await call(outsider, endpoint);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /PRIVATE profile name|Keahlian robotika/);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  assert.equal((await call(outsider, path, { ...profile, userId: member.id })).status, 400);
  assert.equal(
    (await call(member, path, profile, { Origin: "https://attacker.example" })).status,
    403
  );
  assert.equal(
    (await call(member, "/api/profile/confirm", {}, { Origin: "https://attacker.example" })).status,
    403
  );
  assert.equal(
    (await call(member, "/profile", profile, { Origin: "https://attacker.example" })).status,
    403
  );
  assert.equal((await call(member, path, profile, { Origin: "" })).status, 403);
  for (const field of [
    { expertiseTags: [] },
    { helpTypes: [] },
    { availability: null },
    { expertiseTags: ["invalid"] },
    { participation: "true" },
    { confirmedAt: "2000-01-01T00:00:00Z" },
    { city: ["SG:Singapore"] },
    { country: ["Imaginary"] },
    { city: ["legacy:forged"] },
    { city: "Palembang" },
    { country: "Indonesia" },
  ])
    assert.equal((await call(member, path, { ...profile, ...field })).status, 400);
  assert.equal((await call(outsider, "/api/profile/confirm", {})).status, 409);
});

test("12 calendar months exclude an opted-in profile until the member reconfirms or saves", async () => {
  const member = await approved("profile-stale");
  await call(member, path, profile);
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  assert.match(member.id, /^[a-zA-Z0-9-]+$/);
  const { execFileSync } = await import("node:child_process");
  const age = (modifier) =>
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
        `UPDATE expertise_profile SET confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now',${modifier}) WHERE user_id = '${member.id}'`,
      ],
      { stdio: "pipe" }
    );
  age("'-12 months','+1 day'");
  assert.equal((await (await call(member, path)).json()).eligibility.eligible, true);
  age("'-12 months'");
  let state = await (await call(member, path)).json();
  assert.equal(state.eligibility.eligible, false);
  assert.equal(state.eligibility.reason, "stale");
  const old = state.profile.confirmedAt;
  state = await (await call(member, "/api/profile/confirm", {})).json();
  assert.equal(state.eligibility.eligible, true);
  assert.notEqual(state.profile.confirmedAt, old);
  age("'-13 months'");
  state = await (
    await call(member, path, { ...profile, introduction: "Informasi terkini" })
  ).json();
  assert.equal(state.eligibility.eligible, true);
});

test("suspension removes recipient eligibility immediately while separate roles and verified former-student identity remain intact", async () => {
  const { primary, reviewer } = await membershipReviewers();
  const member = await approved("profile-former", {
    ...application,
    studentType: "former-student",
    graduationYear: null,
    attendanceStart: 2003,
    attendanceEnd: 2005,
  });
  await call(primary, "/api/admin/roles", {
    targetUserId: member.id,
    role: "directory-coordinator",
    action: "grant",
    reason: "Separate role",
  });
  let state = await (await call(member, path, profile)).json();
  assert.equal(state.identity.graduationYear, null);
  assert.equal(state.identity.attendanceStart, 2003);
  assert.equal(state.identity.attendanceEnd, 2005);
  assert.equal(
    (
      await call(reviewer, `/api/membership/reviews/${member.id}/status`, {
        expectedVersion: 0,
        outcome: "suspended",
        reason: "Synthetic suspension",
        applicantMessage: "Silakan minta tinjauan.",
      })
    ).status,
    200
  );
  state = await (await call(member, path)).json();
  assert.equal(state.eligibility.eligible, false);
  assert.equal(state.eligibility.reason, "membership");
  assert.equal(state.profile.displayName, profile.displayName);
  assert.equal((await call(member, path, profile)).status, 403);
  assert.equal((await call(member, "/api/profile/confirm", {})).status, 403);
  const access = await (await call(member, "/api/access")).json();
  assert.equal(access.permissions.directory, true);
  for (const endpoint of ["/profile", "/profile.data"])
    assert.equal((await call(member, endpoint)).status, 200);
});

test("legacy locations normalize when known, retain unmapped values, and can be explicitly removed", async () => {
  const member = await approved("profile-legacy-location");
  await call(member, path, profile);
  assert.ok(process.env.ALUMNI_TEST_STATE?.includes("integration-state-"));
  assert.match(member.id, /^[a-zA-Z0-9-]+$/);
  const { execFileSync } = await import("node:child_process");
  const fixture = (city) =>
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
        `UPDATE expertise_profile SET city = '${city}', country = 'Indonesia', location_format = 0 WHERE user_id = '${member.id}'`,
      ],
      { stdio: "pipe" }
    );
  fixture("Palembang");
  let state = await (await call(member, path)).json();
  assert.deepEqual(state.profile.city, ["ID:SS:Palembang"]);
  assert.deepEqual(state.profile.country, ["ID"]);
  assert.equal(
    (
      await call(member, path, {
        ...profile,
        city: state.profile.city,
        country: state.profile.country,
      })
    ).status,
    200
  );
  fixture("Paris");
  state = await (await call(member, path)).json();
  assert.deepEqual(state.profile.city, ["legacy:Paris"]);
  assert.equal((await call(member, path, { ...profile, city: state.profile.city })).status, 200);
  assert.deepEqual((await (await call(member, path)).json()).profile.city, ["legacy:Paris"]);
  assert.equal((await call(member, path, { ...profile, city: [], country: [] })).status, 200);
  state = await (await call(member, path)).json();
  assert.deepEqual(state.profile.city, []);
  assert.deepEqual(state.profile.country, []);
});
