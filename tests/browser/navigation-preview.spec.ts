import { gotoReady, reloadReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("only primary administrator previews role menus without changing access", async ({
  browser,
}) => {
  const { primary, coordinator } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/directory-accounts.json`, "utf8")
  );
  for (const [fixture, isPrimary] of [
    [primary, true],
    [coordinator, false],
  ] as const) {
    const context = await browser.newContext();
    const [name, ...value] = fixture.cookie.split("=");
    await context.addCookies([{ name, value: value.join("="), url: "http://127.0.0.1:5173" }]);
    const page = await context.newPage();
    try {
      await gotoReady(page, "/");
      await expect(page.getByRole("region", { name: "Pratinjau peran", exact: true })).toHaveCount(
        0
      );
      await page.getByLabel("Menu akun", { exact: true }).click();
      const toggle = page.getByRole("button", { name: "Pratinjau peran", exact: true });
      if (!isPrimary) {
        await expect(toggle).toHaveCount(0);
        continue;
      }
      await toggle.click();
      const panel = page.getByRole("region", { name: "Pratinjau peran", exact: true });
      await expect(panel).toBeVisible();
      await panel.getByLabel("Koordinator direktori", { exact: true }).check();
      await expect(
        page.locator(".navigation-groups summary").filter({ hasText: "Direktori" })
      ).toBeVisible();
      expect((await context.request.get("/api/directory")).status()).toBe(403);
      await page.setViewportSize({ width: 390, height: 850 });
      const panelBounds = await panel.boundingBox();
      expect(panelBounds).not.toBeNull();
      expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(390);
      await page.getByLabel("Menu akun", { exact: true }).click();
      await page.getByRole("button", { name: "Tutup pratinjau peran", exact: true }).click();
      await expect(panel).toHaveCount(0);
      await page.getByLabel("Menu akun", { exact: true }).click();
      await toggle.click();
      await reloadReady(page);
      await expect(panel).toHaveCount(0);
    } finally {
      await context.close();
    }
  }
});
