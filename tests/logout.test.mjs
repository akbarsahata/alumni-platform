import { test } from "node:test";
import assert from "node:assert/strict";
import { login, call, base } from "./helpers/accounts.mjs";

test("opening logout shows confirmation and confirming revokes the existing session", async () => {
  const account = await login("direct-logout");
  const confirmation = await call(account, "/logout");
  assert.equal(confirmation.status, 200);
  assert.match(await confirmation.text(), /Keluar dari akun/);
  assert.equal((await call(account, "/api/access")).status, 200);
  const logout = await fetch(`${base}/logout`, {
    method: "POST",
    headers: { Cookie: account.cookie, Origin: base },
    body: new URLSearchParams(),
    redirect: "manual",
  });
  assert.equal(logout.status, 302);
  assert.equal(logout.headers.get("location"), "/login");
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await call(account, "/api/access")).status, 401);
});
