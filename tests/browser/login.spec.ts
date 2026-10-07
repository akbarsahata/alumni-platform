import { gotoReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Bahasa Indonesia email-code login, returning login and logout", async ({ page, request }) => {
  const vars = await readFile(process.env.ALUMNI_TEST_VARS || ".dev.vars", "utf8");
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
    .slice("LOCAL_MAIL_KEY=".length);
  const email = `browser-${Date.now()}@example.test`;
  await page.setExtraHTTPHeaders({
    "CF-Connecting-IP": `2001:db8:beef:${Date.now().toString(16).slice(-4)}::1`,
  });
  await gotoReady(page, "/");
  await expect(page.getByRole("navigation", { name: "Menu utama" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Masuk ke keluarga alumni" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "id");
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Kirim kode", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Kode telah dikirim");
    const capture = await request.get(`/__local/mail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    expect(capture.status()).toBe(200);
    const mail = await capture.json();
    const code = mail.text.match(/\b\d{6}\b/)[0];
    await page.getByLabel("Kode masuk", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL("http://127.0.0.1:5173/");
    await page.getByLabel("Menu akun", { exact: true }).click();
    await expect(
      page.locator(".navigation-account").getByText(email, { exact: true })
    ).toBeVisible();
    if (attempt === 0) {
      await gotoReady(page, "/logout");
      await expect(page.getByRole("heading", { name: "Keluar dari akun" })).toBeVisible();
    }
    const logout = attempt === 0 ? page.getByRole("main") : page.locator(".navigation-account");
    await logout.getByRole("button", { name: "Keluar", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { name: "Masuk ke keluarga alumni" })).toBeVisible();
    await gotoReady(page, "/login");
  }
});
