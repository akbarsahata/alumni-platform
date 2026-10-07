import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("member edits, consents, pauses, opts out, and reconfirms a private profile in Bahasa Indonesia", async ({
  browser,
}) => {
  const { member } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/profile-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  const [name, ...value] = member.cookie.split("=");
  await context.addCookies([
    { name, value: value.join("="), url: "http://127.0.0.1:5173", httpOnly: true, sameSite: "Lax" },
  ]);
  try {
    const page = await context.newPage();
    async function save() {
      const response = page.waitForResponse(
        (response) => response.request().method() === "POST" && response.url().includes("/profile")
      );
      await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
      await response;
      await expect(page.getByRole("button", { name: "Simpan profil", exact: true })).toBeEnabled();
    }
    await page.goto("/");
    await page.getByRole("link", { name: "Profil keahlian" }).click();
    await expect(page.getByLabel("Identitas sekolah terverifikasi")).toContainText(
      "Nama semasa sekolah"
    );
    await expect(page.getByLabel("Aktifkan partisipasi")).not.toBeChecked();
    await page.getByLabel("Nama tampilan (opsional)").fill("Nama profesional");
    await page.getByLabel("Perkenalan profesional (opsional)").fill("Mendampingi klub robotika");
    await page.getByLabel("Teknologi", { exact: true }).check();
    await page.getByLabel("Sains", { exact: true }).check();
    await page.getByLabel("Pendampingan", { exact: true }).check();
    await page.getByLabel("Ketersediaan", { exact: true }).selectOption("limited");
    await page.getByLabel("Aktifkan partisipasi").check();
    await save();
    await expect(page.getByRole("alert")).toContainText("persetujuan");
    await page.getByLabel("Saya menyetujui").check();
    await save();
    await expect(page.getByRole("status")).toContainText("tersimpan");
    await expect(page.getByText("Kelayakan penjangkauan: Memenuhi syarat")).toBeVisible();
    await page.getByLabel("Ketersediaan", { exact: true }).selectOption("unavailable");
    await page.getByLabel("Saya menyetujui").check();
    await save();
    await expect(
      page.getByText("Kelayakan penjangkauan: Anda sementara tidak tersedia.")
    ).toBeVisible();
    await page.getByLabel("Aktifkan partisipasi").uncheck();
    await save();
    await expect(
      page.getByText("Kelayakan penjangkauan: Partisipasi belum diaktifkan.")
    ).toBeVisible();
    await page.getByLabel("Nama tampilan (opsional)").fill("Nama diperbarui");
    await save();
    await expect(page.getByRole("status")).toContainText("tersimpan");
    await page.reload();
    await expect(page.getByLabel("Nama tampilan (opsional)")).toHaveValue("Nama diperbarui");
    await page.getByRole("button", { name: "Konfirmasi profil masih benar" }).click();
    await expect(page.getByRole("status")).toContainText("Profil dikonfirmasi");
  } finally {
    await context.close();
  }
});
