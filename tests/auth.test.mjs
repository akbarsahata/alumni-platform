import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const vars = Object.fromEntries((await readFile(".dev.vars", "utf8")).split("\n").filter(line => line.includes("=")).map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
describe("main Workers authentication", { concurrency: true }, () => {
test("email-code login is available in Bahasa Indonesia", async () => {
  const response = await fetch(`${base}/login`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Kirim kode/);
});

test("requesting a code captures mail without returning secrets", async () => {
  const response = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email: "applicant@example.test", type: "sign-in" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
});

async function capturedCode(email) {
  const response = await fetch(`${base}/__local/mail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${vars.LOCAL_MAIL_KEY}` },
  });
  assert.equal(response.status, 200);
  const mail = await response.json();
  assert.equal(mail.to, email);
  return mail.text.match(/\b\d{6}\b/)[0];
}

test("an emailed code creates a verified account and logout revokes its session", async () => {
  const email = `new-${Date.now()}@example.test`;
  const send = await fetch(`${base}/login`, { method: "POST", headers: { Origin: base }, body: new URLSearchParams({ email, intent: "send" }) });
  assert.equal(send.status, 200);
  assert.match(await send.text(), /Kode telah dikirim/);
  const otp = await capturedCode(email);
  const signIn = await fetch(`${base}/login`, { method: "POST", redirect: "manual", headers: { Origin: base }, body: new URLSearchParams({ email, otp, intent: "verify" }) });
  assert.equal(signIn.status, 302);
  const cookie = signIn.headers.get("set-cookie").split(";")[0];
  const home = await fetch(base, { headers: { Cookie: cookie } });
  assert.match(await home.text(), new RegExp(email));
  const session = await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookie } });
  const account = await session.json();
  assert.equal(account.user.emailVerified, true);
  assert.equal(account.user.email, email);
  assert.equal(account.session, undefined);
  const logout = await fetch(`${base}/logout`, { method: "POST", redirect: "manual", headers: { Origin: base, Cookie: cookie } });
  assert.equal(logout.status, 302);
  const revoked = await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: cookie } });
  assert.equal(await revoked.json(), null);
});

let nextIp = 10;
function client() {
  const headers = { Origin: base, "CF-Connecting-IP": `2001:db8:${Math.floor(Date.now() / 1000).toString(16).slice(-4)}:${nextIp++}::1` };
  return (path, body, extra = {}) => fetch(`${base}${path}`, {
    method: body ? "POST" : "GET", headers: { ...headers, ...(body ? { "Content-Type": "application/json" } : {}), ...extra },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
const sendPath = "/api/auth/email-otp/send-verification-otp";
const signInPath = "/api/auth/sign-in/email-otp";
async function requestCode(call, email) {
  const response = await call(sendPath, { email, type: "sign-in" });
  assert.equal(response.status, 200);
  return capturedCode(email);
}


test("codes are single use, and an existing account can sign in again", async () => {
  const call = client();
  const email = `returning-${Date.now()}@example.test`;
  const otp = await requestCode(call, email);
  const first = await call(signInPath, { email, otp });
  assert.equal(first.status, 200);
  const account = await first.json();
  assert.equal(account.user.emailVerified, true);
  assert.equal(account.token, undefined);
  assert.match(first.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(first.headers.get("set-cookie"), /SameSite=Lax/i);
  const replay = await call(signInPath, { email, otp });
  assert.equal(replay.status, 400);
  const nextOtp = await requestCode(call, email);
  const returning = await call(signInPath, { email, otp: nextOtp });
  assert.equal(returning.status, 200);
  assert.equal((await returning.json()).user.id, account.user.id);
});

test("resend replaces the previous code", async () => {
  const call = client();
  const email = `resend-${Date.now()}@example.test`;
  const oldOtp = await requestCode(call, email);
  const newOtp = await requestCode(call, email);
  // A random replacement can coincidentally have the same digits; request again in that case.
  const replacement = oldOtp === newOtp ? await requestCode(call, email) : newOtp;
  assert.notEqual(replacement, oldOtp);
  assert.equal((await call(signInPath, { email, otp: oldOtp })).status, 400);
  assert.equal((await call(signInPath, { email, otp: replacement })).status, 200);
});

test("the production limiter rejects the fourth send and resets after its window", { timeout: 75_000 }, async () => {
  const call = client();
  const email = `limited-${Date.now()}@example.test`;
  for (let i = 0; i < 3; i++) await requestCode(call, email);
  const limited = await call(sendPath, { email, type: "sign-in" });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("x-retry-after")) > 0);
  await new Promise(resolve => setTimeout(resolve, 61_000));
  await requestCode(call, email);
});

test("three wrong guesses exhaust the code budget even after rate-limit reset", { timeout: 75_000 }, async () => {
  const call = client();
  const email = `attempts-${Date.now()}@example.test`;
  const otp = await requestCode(call, email);
  const wrong = otp === "000000" ? "111111" : "000000";
  for (let i = 0; i < 3; i++) assert.equal((await call(signInPath, { email, otp: wrong })).status, 400);
  assert.equal((await call(signInPath, { email, otp })).status, 429);
  await new Promise(resolve => setTimeout(resolve, 61_000));
  const exhausted = await call(signInPath, { email, otp });
  assert.equal(exhausted.status, 403);
  assert.equal((await exhausted.json()).code, "TOO_MANY_ATTEMPTS");
  assert.equal((await call(signInPath, { email, otp })).status, 400);
});

test("untrusted and missing origins cannot mutate authentication or form routes", async () => {
  for (const path of [sendPath, signInPath, "/api/auth/sign-out", "/login", "/logout"]) {
    for (const origin of ["https://attacker.example", null]) {
      const response = await fetch(`${base}${path}`, { method: "POST", headers: {
        ...(path.startsWith("/api/") ? { "Content-Type": "application/json" } : {}), ...(origin ? { Origin: origin } : {}),
      }, body: path.startsWith("/api/") ? JSON.stringify({ email: "origin@example.test", type: "sign-in", otp: "123456" }) : new URLSearchParams({ email: "origin@example.test", intent: "send" }) });
      assert.equal(response.status, 403, path);
    }
  }
});

test("capture and identity-changing endpoints are unavailable to public clients", async () => {
  assert.equal((await fetch(`${base}/__local/mail?email=applicant@example.test`)).status, 404);
  assert.equal((await fetch(`${base}/__local/mail?email=applicant@example.test`, { headers: { Authorization: "Bearer wrong" } })).status, 404);
  for (const path of ["/email-otp/get-verification-otp?email=applicant@example.test&type=sign-in", "/sign-in/email", "/sign-up/email", "/update-user", "/change-email", "/email-otp/change-email", "/email-otp/request-password-reset"]) {
    assert.equal((await fetch(`${base}/api/auth${path}`, { method: "POST", headers: { Origin: base } })).status, 404);
  }
  const invalidCookie = await fetch(`${base}/api/auth/get-session`, { headers: { Cookie: "better-auth.session_token=forged" } });
  assert.equal(await invalidCookie.json(), null);
  assert.equal(invalidCookie.headers.get("cache-control"), "no-store");
});

test("concurrent use of one code creates only one session", async () => {
  const call = client();
  const email = `concurrent-${Date.now()}@example.test`;
  const otp = await requestCode(call, email);
  const responses = await Promise.all([call(signInPath, { email, otp }), call(signInPath, { email, otp })]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 400]);
});

test("expired codes are rejected after the installed five-minute lifetime", { timeout: 330_000 }, async () => {
  const call = client();
  const email = `expiry-${Date.now()}@example.test`;
  const otp = await requestCode(call, email);
  // Real wall time at the agreed HTTP seam; no private database or clock edits.
  await new Promise(resolve => setTimeout(resolve, 301_000));
  const response = await call(signInPath, { email, otp });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "OTP_EXPIRED");
});

});
