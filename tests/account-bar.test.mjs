import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { login, call } from "./helpers/accounts.mjs";

test("every page shows only the current account and a logout form, including denied and missing pages", async () => {
  const first = await login("account-bar-first");
  const second = await login("account-bar-second");
  for (const account of [first, second]) {
    for (const path of [
      "/",
      "/membership",
      "/login",
      "/logout",
      "/admin/membership",
      "/references/unavailable-request",
      "/missing-account-bar-page",
    ]) {
      const response = await call(account, path);
      if (path === "/login") {
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/");
        continue;
      }
      const html = await response.text();
      assert.match(html, /aria-label="Akun aktif"/, path);
      assert.ok(html.includes(account.email), path);
      assert.ok(!html.includes(account === first ? second.email : first.email), path);
      assert.match(html, /action="\/logout"/);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  }
  await writeFile(
    `${process.env.ALUMNI_TEST_STATE}/account-bar-accounts.json`,
    JSON.stringify({ first, second }),
    { mode: 0o600 }
  );
});

test("guest pages show sign-in and logout from a non-home page revokes the session without retaining identity", async () => {
  const account = await login("account-bar-logout");
  for (const path of ["/", "/login", "/missing-account-bar-page"]) {
    const response = await call(null, path);
    const html = await response.text();
    assert.match(html, /Anda belum masuk/);
    assert.ok(!html.includes(account.email));
  }
  const logout = await call(account, "/logout", {});
  assert.equal(logout.status, 302);
  assert.equal(logout.headers.get("location"), "/login");
  assert.equal((await call(account, "/api/access")).status, 401);
  const page = await call(account, "/membership");
  assert.equal(page.status, 401);
  const html = await page.text();
  assert.match(html, /Anda belum masuk/);
  assert.ok(!html.includes(account.email));
});
