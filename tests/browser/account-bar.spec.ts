import { gotoReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("shared account menu identifies separate sessions across navigation, wraps on mobile and logs out from membership", async ({
  browser,
}) => {
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/account-bar-accounts.json`, "utf8")
  );
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext({ viewport: { width: 320, height: 740 } }),
  ]);
  try {
    for (const [index, account] of [fixture.first, fixture.second].entries()) {
      const [name, ...value] = account.cookie.split("=");
      await contexts[index].addCookies([
        {
          name,
          value: value.join("="),
          url: "http://127.0.0.1:5173",
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await contexts[index].newPage();
      await gotoReady(page, "/");
      const bar = page.locator(".navigation-account");
      await page.getByLabel("Menu akun", { exact: true }).click();
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await page.locator(".navigation-groups summary").filter({ hasText: "Pribadi" }).click();
      await page.getByRole("link", { name: "Keanggotaan", exact: true }).click();
      await expect(page).toHaveURL(/\/membership$/);
      await page.getByLabel("Menu akun", { exact: true }).click();
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      const identity = bar.getByText(account.email, { exact: true });
      expect(await identity.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        false
      );
      await page.screenshot({ path: `test-results/account-menu-${index}.png` });
      await gotoReady(page, "/admin/membership");
      await page.getByLabel("Menu akun", { exact: true }).click();
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await gotoReady(page, "/missing-account-bar-page");
      await page.getByLabel("Menu akun", { exact: true }).click();
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await gotoReady(page, "/membership");
      await page.getByLabel("Menu akun", { exact: true }).click();
      await bar.getByRole("button", { name: "Keluar", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(bar).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Masuk ke keluarga alumni" })).toBeVisible();
      const denied = await contexts[index].request.get("/api/access");
      expect(denied.status()).toBe(401);
    }
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
