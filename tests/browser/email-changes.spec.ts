import { gotoReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("administrator checks identity and the account holder verifies the new address before login changes", async ({
  browser,
}) => {
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/email-change-browser.json`, "utf8")
  );
  const vars = await readFile(process.env.ALUMNI_TEST_VARS!, "utf8");
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
    .slice("LOCAL_MAIL_KEY=".length);
  const reviewerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  for (const context of [reviewerContext, memberContext]) {
    const subnet = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    await context.setExtraHTTPHeaders({
      "CF-Connecting-IP": `2001:db8:${subnet.slice(0, 4)}:${subnet.slice(4)}::1`,
    });
  }
  for (const [context, account] of [
    [reviewerContext, fixture.reviewer],
    [memberContext, fixture.target],
  ] as const) {
    const [name, ...value] = account.cookie.split("=");
    await context.addCookies([
      {
        name,
        value: value.join("="),
        url: "http://127.0.0.1:5173",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
  try {
    const reviewer = await reviewerContext.newPage();
    const member = await memberContext.newPage();
    const newEmail = `browser-${crypto.randomUUID()}@example.test`;
    await gotoReady(reviewer, "/admin/email-changes");
    await reviewer.getByLabel("Akun pemilik").selectOption(fixture.target.id);
    await reviewer.getByLabel("Email baru").fill(newEmail);
    await reviewer
      .getByLabel("Catatan pemeriksaan identitas")
      .fill("Pemilik mencocokkan data kontak secara langsung.");
    await reviewer.getByLabel("Alasan perubahan (privat)").fill("Permintaan pemulihan akses akun.");
    await reviewer.getByRole("button", { name: "Kirim kode verifikasi" }).click();
    await expect(reviewer.getByRole("status")).toContainText(newEmail);
    const link = await reviewer
      .getByRole("link", { name: "verifikasi perubahan email" })
      .getAttribute("href");
    const mail = await (
      await reviewer.request.get(`/__local/mail?email=${encodeURIComponent(newEmail)}`, {
        headers: { Authorization: ["Bearer", key].join(" ") },
      })
    ).json();
    const token = mail.text.match(/\b[a-f0-9]{64}\b/)[0];
    await gotoReady(member, link!);
    await expect(member.getByText(newEmail)).toBeVisible();
    await member.getByLabel("Kode verifikasi email baru").fill(token);
    await member.getByRole("button", { name: "Verifikasi dan ubah email" }).click();
    await expect(member).toHaveURL(/\/login\?emailChanged=1$/);
    await expect(member.getByRole("status")).toContainText("Email login berubah");
    await member.getByLabel("Email", { exact: true }).fill(newEmail);
    await member.getByRole("button", { name: "Kirim kode", exact: true }).click();
    await expect(member.getByLabel("Kode masuk")).toBeVisible();
    const loginMail = await (
      await member.request.get(`/__local/mail?email=${encodeURIComponent(newEmail)}`, {
        headers: { Authorization: ["Bearer", key].join(" ") },
      })
    ).json();
    await member.getByLabel("Kode masuk").fill(loginMail.text.match(/\b\d{6}\b/)[0]);
    await member.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(member).toHaveURL("/");
    await member.getByLabel("Menu akun", { exact: true }).click();
    await expect(
      member.locator(".navigation-account").getByText(newEmail, { exact: true })
    ).toBeVisible();
  } finally {
    await Promise.allSettled([reviewerContext.close(), memberContext.close()]);
  }
});
