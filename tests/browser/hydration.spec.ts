import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady } from "./app-ready";

test("slow JavaScript startup waits for form handlers before changing school history", async ({
  browser,
}) => {
  const vars = await readFile(process.env.ALUMNI_TEST_VARS!, "utf8");
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
    .slice("LOCAL_MAIL_KEY=".length);
  const context = await browser.newContext();
  const base = "http://127.0.0.1:5173";
  const email = `hydration-${crypto.randomUUID()}@example.test`;
  const subnet = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  await context.setExtraHTTPHeaders({
    Origin: base,
    "CF-Connecting-IP": `2001:db8:${subnet.slice(0, 4)}:${subnet.slice(4)}::1`,
  });
  expect((await context.request.post("/login", { form: { email, intent: "send" } })).status()).toBe(
    200
  );
  const mail = await (
    await context.request.get(`/__local/mail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).json();
  expect(
    (
      await context.request.post("/login", {
        form: { email, intent: "verify", otp: mail.text.match(/\b\d{6}\b/)[0] },
      })
    ).status()
  ).toBe(200);
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    await route.continue();
  });
  try {
    let ready = false;
    const navigation = gotoReady(page, "/membership").then(() => {
      ready = true;
    });
    await expect(page.getByLabel("Riwayat sekolah")).toBeVisible();
    await expect(page.locator('body[data-hydrated="true"]')).toHaveCount(0);
    expect(ready).toBe(false);
    releaseScripts();
    await navigation;
    await page.getByLabel("Riwayat sekolah").selectOption("former-student");
    await expect(page.getByLabel("Tahun mulai bersekolah", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Tahun kelulusan", { exact: true })).toHaveCount(0);
  } finally {
    releaseScripts();
    await context.close();
  }
});
