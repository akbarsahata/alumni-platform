import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
export const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
const vars = await readFile(process.env.ALUMNI_TEST_VARS || ".dev.vars", "utf8");
const key = vars
  .split("\n")
  .find((line) => line.startsWith("LOCAL_MAIL_KEY="))
  .slice("LOCAL_MAIL_KEY=".length);
let clientNumber = 1;
export async function login(label) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const headers = {
    Origin: base,
    "Content-Type": "application/json",
    "CF-Connecting-IP": `2001:db8:abcd:${clientNumber++}::${Date.now().toString(16).slice(-4)}`,
  };
  const send = await fetch(`${base}/api/auth/email-otp/send-verification-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, type: "sign-in" }),
  });
  assert.equal(send.status, 200);
  const mail = await fetch(`${base}/__local/mail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const otp = (await mail.json()).text.match(/\b\d{6}\b/)[0];
  const response = await fetch(`${base}/api/auth/sign-in/email-otp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, otp }),
  });
  assert.equal(response.status, 200);
  const { user } = await response.json();
  return { ...user, cookie: response.headers.get("set-cookie").split(";")[0] };
}
export function call(account, path, body, extra = {}) {
  return fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: account?.cookie || "",
      ...(body ? { Origin: base, "Content-Type": "application/json" } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
}
export async function capturedMail(email) {
  return await (
    await fetch(`${base}/__local/mail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).json();
}
