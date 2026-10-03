import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("primary administrator grants and revokes roles in Bahasa Indonesia and inspects history", async ({
  page,
}) => {
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/accounts.json`, "utf8")
  );
  const [name, ...value] = fixture.primary.cookie.split("=");
  await page.context().addCookies([
    {
      name,
      value: value.join("="),
      url: "http://127.0.0.1:5173",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/");
  await page.getByRole("link", { name: "Kelola peran" }).click();
  await expect(page.getByRole("heading", { name: "Kelola peran" })).toBeVisible();
  await page.getByLabel("Akun terverifikasi").selectOption(fixture.ordinary.id);
  await page.getByLabel("Peran", { exact: true }).selectOption("finance-coordinator");
  await page.getByLabel("Alasan").fill("Penunjukan koordinator keuangan untuk uji lokal");
  await page.getByRole("button", { name: "Berikan peran" }).click();
  await expect(page.getByRole("status")).toHaveText("Peran berhasil diperbarui.");
  const row = page.getByRole("row").filter({ hasText: fixture.ordinary.email });
  await expect(row).toContainText("Koordinator keuangan");
  await page.getByLabel("Alasan").fill("Masa tugas selesai pada uji lokal");
  await page.getByRole("button", { name: "Cabut peran" }).click();
  await expect(row).toContainText("Tanpa peran tambahan");
  await page.getByRole("link", { name: "Riwayat perubahan" }).click();
  await expect(page.getByRole("heading", { name: "Riwayat perubahan" })).toBeVisible();
  await expect(page.getByText("Masa tugas selesai pada uji lokal")).toBeVisible();
  await expect(page.getByText("Penunjukan koordinator keuangan untuk uji lokal")).toBeVisible();
});
