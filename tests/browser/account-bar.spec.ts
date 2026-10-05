import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("shared account bar identifies separate sessions across navigation, wraps on mobile and logs out from membership", async ({
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
      await page.goto("/");
      const bar = page.getByRole("region", { name: "Akun aktif" });
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Pengajuan keanggotaan" }).click();
      await expect(page).toHaveURL(/\/membership$/);
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await expect(bar.getByRole("button", { name: "Keluar", exact: true })).toBeVisible();
      const overflow = await bar.evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(overflow).toBe(false);
      const identity = bar.getByText(account.email, { exact: true });
      expect(await identity.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        false
      );
      await page.screenshot({
        path: `test-results/account-bar-${index === 0 ? "desktop" : "mobile"}.png`,
      });
      await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
      const bounds = await bar.boundingBox();
      expect(bounds?.y).toBeGreaterThanOrEqual(0);
      await page.goto("/admin/membership");
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await page.goto("/missing-account-bar-page");
      await expect(bar.getByText(account.email, { exact: true })).toBeVisible();
      await page.goto("/membership");
      await bar.getByRole("button", { name: "Keluar", exact: true }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(bar.getByText("Anda belum masuk.")).toBeVisible();
      await expect(bar.getByRole("link", { name: "Masuk", exact: true })).toBeVisible();
      await expect(bar.getByText(account.email, { exact: true })).toHaveCount(0);
      const denied = await contexts[index].request.get("/api/access");
      expect(denied.status()).toBe(401);
    }
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
