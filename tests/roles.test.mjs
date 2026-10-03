import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { login, call, base } from "./helpers/accounts.mjs";

let primary, alumnus, ordinary;
async function audit() { return (await (await call(primary, "/api/admin/audit")).json()).events; }
async function access(account) { return (await (await call(account, "/api/access")).json()); }
function bootstrap(file) { return execFileSync(process.execPath, ["scripts/bootstrap.mjs", file], { stdio: "pipe" }); }

test("private bootstrap establishes a primary administrator and trusted alumni without public escalation", async () => {
  primary = await login("primary");
  alumnus = await login("trusted");
  ordinary = await login("ordinary");
  assert.equal((await call(primary, "/api/admin/roles")).status, 403);
  await mkdir("test-results", { recursive: true });
  const file = `${process.env.ALUMNI_TEST_STATE}/bootstrap.json`;
  const input = { primaryUserId: primary.id, operator: "Synthetic organization operator", reason: "Organization appointment and independent alumni checks", trustedAlumni: [{ userId: alumnus.id, house: "Komodo" }] };
  for (const invalid of [
    { ...input, primaryUserId: "nonexistent" },
    { ...input, reason: " " },
    { ...input, trustedAlumni: [{ userId: alumnus.id, house: "Unknown" }] },
    { ...input, trustedAlumni: [{ userId: alumnus.id }] },
    { ...input, trustedAlumni: [...input.trustedAlumni, { userId: "nonexistent", house: "Lion" }] },
    { ...input, trustedAlumni: [...input.trustedAlumni, ...input.trustedAlumni] },
  ]) {
    await writeFile(file, JSON.stringify(invalid), { mode: 0o600 });
    assert.throws(() => bootstrap(file));
    assert.equal((await call(primary, "/api/admin/roles")).status, 403);
    assert.equal((await access(alumnus)).membership.status, "none");
  }
  const otherHouses = ["Lion", "Rhino", "Hornbill", "Dove", "Eagle", "Dolphin", "Shark", "Mantaray"];
  const otherAlumni = await Promise.all(otherHouses.map(house => login(house.toLowerCase())));
  input.trustedAlumni.push(...otherAlumni.map((account, index) => ({ userId: account.id, house: otherHouses[index] })));
  await writeFile(file, JSON.stringify(input), { mode: 0o600 });
  bootstrap(file);
  for (const [index, account] of otherAlumni.entries()) assert.equal((await access(account)).membership.house, otherHouses[index]);
  await writeFile(`${process.env.ALUMNI_TEST_STATE}/accounts.json`, JSON.stringify({ primary, alumnus, ordinary }), { mode: 0o600 });
  const admin = await call(primary, "/api/admin/roles");
  assert.equal(admin.status, 200);
  const trustedAccess = await access(alumnus);
  assert.equal(trustedAccess.membership.status, "approved");
  assert.equal(trustedAccess.membership.house, "Komodo");
  assert.equal(trustedAccess.permissions.endorse, true);
  assert.equal(trustedAccess.permissions.manageRoles, false);
  assert.equal(trustedAccess.permissions.directory, false);
  assert.equal(trustedAccess.permissions.finance, false);
  assert.equal((await call(ordinary, "/api/admin/audit")).status, 403);
  const audit = await (await call(primary, "/api/admin/audit")).json();
  assert.equal(audit.events.filter(event => event.action === "bootstrap-primary").length, 1);
  assert.ok(audit.events.some(event => event.targetUserId === alumnus.id && event.house === "Komodo" && event.actorUserId === primary.id && event.operator === "Synthetic organization operator" && event.reason && /Z$/.test(event.occurredAt)));
  assert.throws(() => bootstrap(file));
  for (const path of ["/bootstrap", "/api/bootstrap", "/api/admin/bootstrap"]) assert.equal((await call(ordinary, path, { primaryUserId: ordinary.id })).status, 404);
});

test("each privileged role grants only its permission and revocation updates an existing session", async () => {
  const matrix = {
    "membership-administrator": "reviewMembership", "finance-coordinator": "finance",
    "directory-coordinator": "directory", staff: "validateSchoolContent", student: "proposeStudentContent",
  };
  for (const [role, permission] of Object.entries(matrix)) {
    const reason = `Synthetic appointment: ${role}`;
    const grant = await call(primary, "/api/admin/roles", { targetUserId: ordinary.id, role, action: "grant", reason });
    assert.equal(grant.status, 200);
    assert.equal((await grant.json()).changed, true);
    const current = await access(ordinary);
    assert.deepEqual(current.roles, [role]);
    assert.equal(current.membership.status, "none");
    for (const [name, allowed] of Object.entries(current.permissions)) assert.equal(allowed, name === permission, `${role}: ${name}`);
    const events = await audit();
    const event = events.find(event => event.targetUserId === ordinary.id && event.role === role && event.action === "grant");
    assert.equal(event.actorUserId, primary.id);
    assert.equal(event.reason, reason);
    assert.match(event.occurredAt, /Z$/);
    const revoke = await call(primary, "/api/admin/roles", { targetUserId: ordinary.id, role, action: "revoke", reason: "Term ended" });
    assert.equal(revoke.status, 200);
    assert.equal((await revoke.json()).changed, true);
    const revoked = await access(ordinary); // same cookie, no sign-in or logout
    assert.deepEqual(revoked.roles, []);
    assert.equal(revoked.permissions[permission], false);
    assert.ok((await audit()).some(event => event.targetUserId === ordinary.id && event.role === role && event.action === "revoke"));
  }
});

test("all non-primary accounts are denied administration and audit disclosure, including framework data routes", async () => {
  const finance = await login("finance"), directory = await login("directory"), school = await login("staff");
  for (const [account, role] of [[finance, "finance-coordinator"], [directory, "directory-coordinator"], [school, "staff"], [ordinary, "membership-administrator"]]) {
    assert.equal((await call(primary, "/api/admin/roles", { targetUserId: account.id, role, action: "grant", reason: "Role isolation test" })).status, 200);
  }
  const initialAudit = await audit();
  for (const account of [ordinary, alumnus, finance, directory, school, null]) {
    for (const path of ["/api/admin/roles", "/api/admin/audit", "/admin/roles", "/admin/audit", "/admin/roles.data", "/admin/audit.data"]) {
      const denied = await call(account, path);
      assert.equal(denied.status, account ? 403 : 401, path);
      assert.doesNotMatch(await denied.text(), new RegExp(primary.email));
      assert.equal(denied.headers.get("cache-control"), "no-store");
    }
    for (const action of ["grant", "revoke"]) {
      const denied = await call(account, "/api/admin/roles", { targetUserId: finance.id, role: "finance-coordinator", action, reason: "Unauthorized", actorUserId: primary.id });
      assert.equal(denied.status, account ? 403 : 401);
    }
    const form = await fetch(`${base}/admin/roles`, {
      method: "POST", headers: { Cookie: account?.cookie || "", Origin: base },
      body: new URLSearchParams({ targetUserId: finance.id, role: "finance-coordinator", action: "revoke", reason: "Unauthorized form" }),
    });
    assert.equal(form.status, account ? 403 : 401);
  }
  assert.deepEqual(await audit(), initialAudit);
  assert.equal((await access(finance)).permissions.finance, true);
  assert.equal((await access(directory)).permissions.finance, false);
  assert.equal((await access(school)).permissions.directory, false);
  await call(primary, "/api/admin/roles", { targetUserId: ordinary.id, role: "membership-administrator", action: "revoke", reason: "Test cleanup" });
});

test("invalid roles, targets, reasons and cross-origin requests cannot change state or audit", async () => {
  const body = { targetUserId: ordinary.id, role: "finance-coordinator", action: "grant", reason: "Authorized test" };
  const initialAudit = await audit();
  for (const invalid of [{ role: "primary-administrator" }, { role: ["staff", "finance-coordinator"] }, { targetUserId: "missing" }, { action: "bootstrap" }, { reason: " " }, { reason: "x".repeat(1001) }]) {
    assert.equal((await call(primary, "/api/admin/roles", { ...body, ...invalid })).status, 400);
  }
  for (const origin of ["https://attacker.example", "null", ""]) {
    for (const path of ["/api/admin/roles", "/admin/roles", "/admin/roles.data"]) assert.equal((await call(primary, path, body, { Origin: origin })).status, 403);
  }
  assert.deepEqual(await audit(), initialAudit);
  assert.deepEqual((await access(ordinary)).roles, []);
});

test("repeated and concurrent role changes retain one audit event per actual change", async () => {
  const body = { targetUserId: ordinary.id, role: "directory-coordinator", action: "grant", reason: "Concurrent appointment", actorUserId: ordinary.id };
  const initialAudit = await audit();
  const results = await Promise.all([call(primary, "/api/admin/roles", body), call(primary, "/api/admin/roles", body)]);
  assert.deepEqual(await Promise.all(results.map(async response => (await response.json()).changed)).then(values => values.sort()), [false, true]);
  assert.equal((await (await call(primary, "/api/admin/roles", body)).json()).changed, false);
  assert.equal((await audit()).length, initialAudit.length + 1);
  assert.equal((await audit()).find(event => event.reason === "Concurrent appointment").actorUserId, primary.id);
  assert.equal((await access(ordinary)).permissions.directory, true);
  const revoked = await Promise.all([call(primary, "/api/admin/roles", { ...body, action: "revoke" }), call(primary, "/api/admin/roles", { ...body, action: "revoke" })]);
  assert.deepEqual(await Promise.all(revoked.map(async response => (await response.json()).changed)).then(values => values.sort()), [false, true]);
  assert.equal((await audit()).length, initialAudit.length + 2);
  assert.equal((await access(ordinary)).permissions.directory, false);
});

test("revoking one of multiple explicit roles preserves the others and membership stays separate", async () => {
  for (const role of ["finance-coordinator", "directory-coordinator"]) {
    assert.equal((await call(primary, "/api/admin/roles", { targetUserId: alumnus.id, role, action: "grant", reason: "Multiple explicit responsibilities" })).status, 200);
  }
  await call(primary, "/api/admin/roles", { targetUserId: alumnus.id, role: "finance-coordinator", action: "revoke", reason: "Finance responsibility ended" });
  const current = await access(alumnus);
  assert.equal(current.permissions.finance, false);
  assert.equal(current.permissions.directory, true);
  assert.equal(current.permissions.endorse, true);
  assert.equal(current.membership.house, "Komodo");
  await call(primary, "/api/admin/roles", { targetUserId: alumnus.id, role: "directory-coordinator", action: "revoke", reason: "Directory responsibility ended" });
  assert.equal((await access(alumnus)).permissions.endorse, true);
  assert.equal((await call(null, "/api/access")).status, 401);
});

test("operators can read older history across audit pages without duplicate or lost events", async () => {
  for (let index = 0; index < 50; index++) {
    for (const action of ["grant", "revoke"]) {
      assert.equal((await call(primary, "/api/admin/roles", { targetUserId: ordinary.id, role: "student", action, reason: `Synthetic term ${index}` })).status, 200);
    }
  }
  const first = await (await call(primary, "/api/admin/audit")).json();
  assert.equal(first.events.length, 100);
  assert.ok(first.nextCursor);
  const second = await (await call(primary, `/api/admin/audit?before=${encodeURIComponent(first.nextCursor)}`)).json();
  const all = [...first.events, ...second.events];
  assert.equal(new Set(all.map(event => event.id)).size, all.length);
  assert.ok(second.events.some(event => event.action === "bootstrap-primary"));
  assert.equal(second.nextCursor, null);
  assert.equal((await call(primary, "/api/admin/audit?before=invalid")).status, 400);
});
