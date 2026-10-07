import { gotoReady, reloadReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("applicant and independent administrator complete action, rejection, correction and former-student approval in Bahasa Indonesia", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/membership-accounts.json`, "utf8")
  );
  const applicantContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  for (const [context, account] of [
    [applicantContext, fixture.applicant],
    [reviewerContext, fixture.reviewer],
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
  const applicant = await applicantContext.newPage();
  const reviewer = await reviewerContext.newPage();
  try {
    await gotoReady(applicant, "http://127.0.0.1:5173/");
    await applicant.locator(".navigation-groups summary").filter({ hasText: "Pribadi" }).click();
    await applicant.getByRole("link", { name: "Keanggotaan", exact: true }).click();
    await applicant.getByLabel("Nama semasa sekolah").fill("Nama Browser Awal");
    await applicant.getByLabel("Tahun kelulusan").fill("2008");
    await applicant.getByLabel("House", { exact: true }).selectOption("Komodo");
    await applicant
      .getByLabel("Penjelasan untuk tinjauan manual")
      .fill("Alumni tepercaya dapat mengonfirmasi kehadiran saya.");
    await applicant.getByRole("button", { name: "Kirim pengajuan" }).click();
    await expect(applicant.getByText("Menunggu tinjauan manual", { exact: true })).toBeVisible();
    await gotoReady(reviewer, "http://127.0.0.1:5173/");
    await reviewer
      .locator(".navigation-groups summary")
      .filter({ hasText: "Administrasi" })
      .click();
    await reviewer.getByRole("link", { name: "Tinjau keanggotaan", exact: true }).click();
    await reviewer.getByRole("link", { name: "Nama Browser Awal" }).click();
    await reviewer.getByLabel("Keputusan", { exact: true }).selectOption("action-required");
    await reviewer.getByLabel("Alasan internal").fill("Catatan pemeriksaan privat browser");
    await reviewer.getByLabel("Pesan untuk pemohon").fill("Mohon perbaiki nama semasa sekolah.");
    await reviewer.getByRole("button", { name: "Simpan keputusan" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await reloadReady(applicant);
    await expect(applicant.getByText("Perlu perbaikan", { exact: true }).first()).toBeVisible();
    await expect(applicant.getByText("Mohon perbaiki nama semasa sekolah.")).toBeVisible();
    await expect(applicant.getByText("Catatan pemeriksaan privat browser")).toHaveCount(0);
    await applicant.getByLabel("Nama semasa sekolah").fill("Nama Browser Koreksi");
    await applicant.getByRole("button", { name: "Kirim perbaikan" }).click();
    await expect(applicant.getByRole("status")).toContainText("Pengajuan tersimpan");
    await reloadReady(reviewer);
    await reviewer.getByLabel("Keputusan", { exact: true }).selectOption("rejected");
    await reviewer.getByLabel("Sumber pemeriksaan independen").selectOption("school-staff");
    await reviewer
      .getByLabel("Catatan pemeriksaan independen")
      .fill("Staf sekolah meminta koreksi masa kehadiran setelah pemeriksaan terpisah.");
    await reviewer
      .getByLabel("Alasan internal")
      .fill("Data kelulusan tidak sesuai pemeriksaan staf sekolah");
    await reviewer
      .getByLabel("Pesan untuk pemohon")
      .fill("Ajukan masa kehadiran apabila tidak lulus.");
    await reviewer.getByRole("button", { name: "Simpan keputusan" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await reloadReady(applicant);
    await applicant.getByLabel("Riwayat sekolah").selectOption("former-student");
    await expect(applicant.getByLabel("Tahun kelulusan")).toHaveCount(0);
    await applicant.getByLabel("Tahun mulai bersekolah").fill("2004");
    await applicant.getByLabel("Tahun terakhir bersekolah").fill("2006");
    await applicant.getByLabel("House", { exact: true }).selectOption("Lion");
    await applicant
      .getByLabel("Penjelasan untuk tinjauan manual")
      .fill("Saya tidak lulus; mohon penilaian kelayakan secara individual.");
    await applicant.getByRole("button", { name: "Kirim perbaikan" }).click();
    await expect(applicant.getByRole("status")).toContainText("Pengajuan tersimpan");
    await reloadReady(reviewer);
    await expect(reviewer.getByText("2004–2006").first()).toBeVisible();
    await reviewer.getByLabel("Keputusan", { exact: true }).selectOption("approved");
    await reviewer.getByLabel("Sumber pemeriksaan independen").selectOption("school-staff");
    await reviewer
      .getByLabel("Catatan pemeriksaan independen")
      .fill("Staf sekolah mengonfirmasi masa kehadiran dan house melalui arsip sekolah.");
    await reviewer
      .getByLabel("Alasan internal")
      .fill("Kelayakan dinilai secara individual setelah pemeriksaan staf sekolah");
    await reviewer
      .getByLabel("Pesan untuk pemohon")
      .fill("Keanggotaan Anda disetujui setelah pemeriksaan sekolah.");
    await reviewer.getByRole("button", { name: "Simpan keputusan" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await reloadReady(applicant);
    await expect(
      applicant.getByText("Keanggotaan disetujui", { exact: true }).first()
    ).toBeVisible();
    await expect(applicant.getByRole("button", { name: "Kirim perbaikan" })).toHaveCount(0);
    await expect(applicant.getByText("Nama Browser Awal")).toBeVisible();
    await expect(applicant.getByText("Nama Browser Koreksi").first()).toBeVisible();
    await expect(applicant.getByText("Catatan pemeriksaan privat browser")).toHaveCount(0);
  } finally {
    await applicantContext.close();
    await reviewerContext.close();
  }
});
