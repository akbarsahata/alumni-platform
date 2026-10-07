import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("coordinator searches private alumni and maintains shared expertise in Bahasa Indonesia", async ({
  browser,
}) => {
  const { coordinator, primary, browserMember } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/directory-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  const [name, ...value] = coordinator.cookie.split("=");
  await context.addCookies([{ name, value: value.join("="), url: "http://127.0.0.1:5173" }]);
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByRole("link", { name: "Direktori keahlian" }).click();
    await page.getByLabel("Perkenalan profesional", { exact: true }).fill("robotika");
    await page.getByRole("button", { name: "Cari alumni" }).click();
    await expect(page.getByLabel("Hasil pencarian")).toContainText("Ahli Robotika");
    await page.goto(`/directory/${browserMember.id}`);
    await expect(page.getByRole("heading", { name: "Profil alumni" })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Komodo");
    await expect(page.locator("main")).not.toContainText(browserMember.email);
    await page.goto("/directory/tags");
    await page.getByLabel("Keahlian baru").fill("Astronomi browser");
    await page.getByRole("button", { name: "Tambah keahlian" }).click();
    await expect(
      page.getByRole("heading", { name: "Astronomi browser", exact: true })
    ).toBeVisible();
    const section = page.getByRole("region", { name: "Astronomi browser", exact: true });
    await section.getByLabel("Label keahlian").fill("Astronomi sekolah");
    await section.getByRole("button", { name: "Ubah label" }).click();
    await expect(
      page.getByRole("heading", { name: "Astronomi sekolah", exact: true })
    ).toBeVisible();
    await page
      .getByRole("region", { name: "Astronomi sekolah", exact: true })
      .getByRole("button", { name: "Hentikan keahlian" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Astronomi sekolah (dihentikan)" })
    ).toBeVisible();
    await expect(page.getByLabel("Riwayat keahlian")).toContainText("Dihentikan");
    const revoked = await context.request.post("http://127.0.0.1:5173/api/admin/roles", {
      headers: { Cookie: primary.cookie, Origin: "http://127.0.0.1:5173" },
      data: {
        targetUserId: coordinator.id,
        role: "directory-coordinator",
        action: "revoke",
        reason: "Browser current session",
      },
    });
    expect(revoked.status()).toBe(200);
    expect((await page.goto("/directory"))?.status()).toBe(403);
    expect((await context.request.get(`/directory/${browserMember.id}.data`)).status()).toBe(403);
  } finally {
    await context.close();
  }
});
