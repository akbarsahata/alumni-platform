import { test, after } from "node:test";
import assert from "node:assert/strict";
import { login, call } from "./helpers/accounts.mjs";
import { application, decision, membershipReviewers } from "./helpers/membership.mjs";
test("directory search requires a current explicit coordinator assignment", async () => {
  const { primary } = await membershipReviewers();
  const coordinator = await login("directory-coordinator");
  for (const endpoint of ["/api/directory", "/directory", "/directory.data"]) {
    assert.equal((await call(primary, endpoint)).status, 403);
    assert.equal((await call(null, endpoint)).status, 401);
  }
  await call(primary, "/api/admin/roles", {
    targetUserId: coordinator.id,
    role: "directory-coordinator",
    action: "grant",
    reason: "Directory test",
  });
  assert.equal((await call(coordinator, "/api/directory")).status, 200);
  await call(primary, "/api/admin/roles", {
    targetUserId: coordinator.id,
    role: "directory-coordinator",
    action: "revoke",
    reason: "Directory test",
  });
  assert.equal((await call(coordinator, "/api/directory")).status, 403);
});

const input = {
  displayName: "Ahli Robotika",
  introduction: "Mentor robotika dan perangkat lunak",
  city: ["ID:SS:Palembang"],
  country: ["ID"],
  expertiseTags: ["technology"],
  helpTypes: ["mentoring"],
  availability: "limited",
  participation: true,
  participationConsent: true,
};
let fixture;
async function setup() {
  if (fixture) return fixture;
  const { primary, reviewer } = await membershipReviewers();
  const coordinator = await login("search-coordinator");
  await call(primary, "/api/admin/roles", {
    targetUserId: coordinator.id,
    role: "directory-coordinator",
    action: "grant",
    reason: "Search fixture",
  });
  const member = await login("search-member");
  await call(member, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${member.id}`, decision);
  assert.equal((await call(member, "/api/profile", input)).status, 200);
  fixture = { primary, reviewer, coordinator, member };
  return fixture;
}
test("coordinator finds eligible profiles by skills, introduction, locations, help, availability and real cohort", async () => {
  const { coordinator, member } = await setup();
  for (const query of [
    "",
    "expertise=technology",
    "introduction=robotika",
    "city=Palembang",
    "country=Indonesia",
    "city=ID%3ASS%3APalembang&city=ID%3AJK%3AJakarta",
    "country=ID&country=AU",
    "helpType=mentoring",
    "availability=limited",
    "graduationFrom=2008&graduationTo=2008",
  ]) {
    const response = await call(coordinator, `/api/directory?${query}`);
    assert.equal(response.status, 200);
    const state = await response.json();
    assert.ok(
      state.profiles.some((p) => p.id === member.id),
      query
    );
    const serialized = JSON.stringify(state);
    assert.doesNotMatch(serialized, /Komodo|house|email|checkNote|reason|explanation/);
  }
  for (const query of [
    "expertise=science",
    "introduction=accounting",
    "city=Jakarta",
    "country=Australia",
    "helpType=speaking",
    "availability=available",
    "graduationFrom=2010",
    "attendanceFrom=2003&attendanceTo=2005",
  ]) {
    const state = await (await call(coordinator, `/api/directory?${query}`)).json();
    assert.ok(!state.profiles.some((p) => p.id === member.id), query);
  }
  assert.equal((await call(coordinator, "/api/directory?house=Komodo")).status, 400);
  for (const endpoint of [
    `/api/directory/${member.id}`,
    `/directory/${member.id}`,
    `/directory/${member.id}.data`,
  ]) {
    const response = await call(coordinator, endpoint);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.doesNotMatch(await response.text(), /Komodo|search-member.*@|checkNote|explanation/);
  }
});
after(async () => {
  if (fixture) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(
      `${process.env.ALUMNI_TEST_STATE}/directory-accounts.json`,
      JSON.stringify(fixture),
      { mode: 0o600 }
    );
  }
});

test("coordinators maintain audited labels while retired selections survive and replacements require member choice", async () => {
  const { coordinator, member, primary } = await setup();
  let response = await call(coordinator, "/api/directory/tags", {
    action: "add",
    label: "Robotika",
  });
  assert.equal(response.status, 200);
  let state = await response.json();
  const tag = state.tags.find((t) => t.label === "Robotika");
  assert.ok(tag);
  assert.equal(
    (await call(member, "/api/profile", { ...input, expertiseTags: [tag.id] })).status,
    200
  );
  assert.equal(
    (
      await call(coordinator, "/api/directory/tags", {
        action: "rename",
        id: tag.id,
        expectedVersion: tag.version,
        label: "Robotika pendidikan",
      })
    ).status,
    200
  );
  assert.equal(
    (
      await call(coordinator, "/api/directory/tags", {
        action: "rename",
        id: tag.id,
        expectedVersion: tag.version,
        label: "Stale overwrite",
      })
    ).status,
    409
  );
  assert.equal(
    (
      await call(coordinator, "/api/directory/tags", {
        action: "replace",
        id: tag.id,
        expectedVersion: 1,
        label: "Otomasi industri",
      })
    ).status,
    200
  );
  state = await (await call(coordinator, "/api/directory/tags")).json();
  const replacement = state.tags.find((t) => t.label === "Otomasi industri");
  assert.ok(replacement);
  assert.equal(state.tags.find((t) => t.id === tag.id).retired, true);
  assert.deepEqual((await (await call(member, "/api/profile")).json()).profile.expertiseTags, [
    tag.id,
  ]);
  assert.equal(
    (await call(member, "/api/profile", { ...input, expertiseTags: [tag.id] })).status,
    200
  );
  const outsider = await login("tag-outsider");
  await call(outsider, "/api/membership/application", application);
  const { reviewer } = await membershipReviewers();
  await call(reviewer, `/api/membership/reviews/${outsider.id}`, decision);
  assert.equal(
    (await call(outsider, "/api/profile", { ...input, expertiseTags: [tag.id] })).status,
    400
  );
  assert.equal(
    (await call(member, "/api/profile", { ...input, expertiseTags: [replacement.id] })).status,
    200
  );
  for (const actor of [primary, member, null])
    assert.equal((await call(actor, "/api/directory/tags")).status, actor ? 403 : 401);
  for (const origin of ["", "https://attacker.example"])
    assert.equal(
      (
        await call(
          coordinator,
          "/api/directory/tags",
          { action: "add", label: "Forged" },
          { Origin: origin }
        )
      ).status,
      403
    );
  const audit = await (await call(coordinator, "/api/directory/tags/audit")).json();
  assert.ok(
    audit.events.some(
      (e) => e.actorUserId === coordinator.id && e.action === "replace" && e.occurredAt
    )
  );
  assert.doesNotMatch(JSON.stringify(audit), /email|introduction|house/);
});

test("eligibility changes immediately hide search and detail across all private surfaces", async () => {
  const { coordinator, member, reviewer } = await setup();
  async function visible(expected) {
    const response = await call(coordinator, "/api/directory");
    assert.match(response.headers.get("cache-control"), /no-store/);
    const state = await response.json();
    assert.equal(
      state.profiles.some((p) => p.id === member.id),
      expected
    );
    for (const endpoint of [
      `/api/directory/${member.id}`,
      `/directory/${member.id}`,
      `/directory/${member.id}.data`,
    ])
      assert.equal((await call(coordinator, endpoint)).status, expected ? 200 : 404);
  }
  for (const change of [{ participation: false }, { availability: "unavailable" }]) {
    await call(member, "/api/profile", { ...input, ...change });
    await visible(false);
    await call(member, "/api/profile", input);
    await visible(true);
  }
  const { execFileSync } = await import("node:child_process");
  assert.ok(process.env.ALUMNI_TEST_STATE.includes("integration-state-"));
  assert.match(member.id, /^[a-zA-Z0-9-]+$/);
  const fixture = (sql) =>
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
  fixture(
    `UPDATE expertise_profile SET confirmed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 months') WHERE user_id='${member.id}'`
  );
  await visible(false);
  await call(member, "/api/profile/confirm", {});
  await visible(true);
  fixture(
    `UPDATE expertise_profile SET deletion_requested_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id='${member.id}'`
  );
  await visible(false);
  fixture(`UPDATE expertise_profile SET deletion_requested_at=NULL WHERE user_id='${member.id}'`);
  await visible(true);
  assert.equal(
    (
      await call(reviewer, `/api/membership/reviews/${member.id}/status`, {
        expectedVersion: 0,
        outcome: "suspended",
        reason: "Private internal reason",
        applicantMessage: "Suspended",
      })
    ).status,
    200
  );
  await visible(false);
});
test("former students use attendance ranges and other roles never acquire directory permission", async () => {
  const { coordinator, primary, reviewer, member } = await setup();
  const former = await login("directory-former");
  await call(former, "/api/membership/application", {
    ...application,
    studentType: "former-student",
    graduationYear: null,
    attendanceStart: 2003,
    attendanceEnd: 2005,
  });
  await call(reviewer, `/api/membership/reviews/${former.id}`, decision);
  await call(former, "/api/profile", input);
  let state = await (
    await call(coordinator, "/api/directory?attendanceFrom=2004&attendanceTo=2004")
  ).json();
  const found = state.profiles.find((p) => p.id === former.id);
  assert.ok(found);
  assert.equal(found.graduationYear, null);
  state = await (await call(coordinator, "/api/directory?graduationFrom=1900")).json();
  assert.ok(!state.profiles.some((p) => p.id === former.id));
  const pending = await login("directory-pending");
  await call(pending, "/api/membership/application", application);
  const rejected = await login("directory-rejected");
  await call(rejected, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${rejected.id}`, {
    ...decision,
    outcome: "rejected",
  });
  const actors = [primary, reviewer, member, former, pending, rejected];
  for (const role of ["staff", "student", "finance-coordinator"]) {
    const actor = await login(`directory-deny-${role}`);
    await call(primary, "/api/admin/roles", {
      targetUserId: actor.id,
      role,
      action: "grant",
      reason: "Role matrix",
    });
    actors.push(actor);
  }
  for (const actor of actors)
    for (const endpoint of [
      "/api/directory",
      "/directory",
      "/directory.data",
      "/api/directory/tags",
      "/directory/tags",
      "/directory/tags.data",
      `/api/directory/${former.id}`,
      `/directory/${former.id}`,
      `/directory/${former.id}.data`,
    ]) {
      const response = await call(actor, endpoint);
      assert.equal(response.status, 403, endpoint);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.doesNotMatch(await response.text(), /Ahli Robotika|Mentor robotika/);
    }
  for (const endpoint of [
    "/api/directory?graduationFrom=2010&graduationTo=2000",
    "/api/directory?attendanceFrom=2005&attendanceTo=2003",
    "/api/directory?export=csv",
  ])
    assert.equal((await call(coordinator, endpoint)).status, 400);
  // Keep a current graduate profile for the browser journey.
  const browserMember = await login("directory-browser-member");
  await call(browserMember, "/api/membership/application", application);
  await call(reviewer, `/api/membership/reviews/${browserMember.id}`, decision);
  await call(browserMember, "/api/profile", input);
  fixture.browserMember = browserMember;
});
