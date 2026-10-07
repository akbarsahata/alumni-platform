import { gotoReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("student submits a need for independent staff validation and coordinator approval", async ({
  browser,
}) => {
  const { student, staff, coordinator } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/school-needs-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  async function useAccount(account: { cookie: string }) {
    await context.clearCookies();
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
    return await context.newPage();
  }
  try {
    const studentPage = await useAccount(student);
    await gotoReady(studentPage, "/");
    await studentPage.locator(".navigation-groups summary").filter({ hasText: "Sekolah" }).click();
    await studentPage.getByRole("link", { name: "Kebutuhan sekolah", exact: true }).click();
    await studentPage.getByLabel("Jenis kebutuhan").selectOption("student-mentoring");
    await studentPage.getByLabel("Judul").fill("Mentoring sains daring");
    await studentPage.getByLabel("Tujuan sekolah").fill("Mendukung siswa menyiapkan proyek sains.");
    await studentPage
      .getByLabel("Keahlian atau bantuan yang dibutuhkan")
      .fill("Keahlian sains dan pendampingan.");
    await studentPage.getByLabel("Perkiraan komitmen waktu").fill("Satu jam setiap Sabtu.");
    await studentPage.getByLabel("Waktu pelaksanaan", { exact: true }).fill("Mulai bulan depan.");
    await studentPage.getByLabel("Lokasi kegiatan").selectOption("remote");
    await studentPage.getByLabel("Perwakilan staf terverifikasi").selectOption(staff.id);
    await studentPage.getByLabel("Nama perwakilan staf").fill("Ibu Staf Pendamping");
    await studentPage.getByLabel("Ketentuan partisipasi").selectOption("voluntary");
    await studentPage.getByRole("button", { name: "Kirim kebutuhan" }).click();
    await expect(studentPage.getByRole("status")).toContainText("berhasil dikirim untuk ditinjau");
    await studentPage.getByRole("link", { name: /Mentoring sains daring/ }).click();
    await expect(studentPage.getByRole("status").first()).toContainText(
      "Menunggu validasi perwakilan staf"
    );
    const needPath = new URL(studentPage.url()).pathname;

    const staffPage = await useAccount(staff);
    await gotoReady(staffPage, needPath);
    await expect(
      staffPage.getByRole("button", { name: "Validasi sebagai perwakilan staf" })
    ).toBeVisible();
    await staffPage.getByRole("button", { name: "Validasi sebagai perwakilan staf" }).click();
    await expect(
      staffPage
        .getByRole("status")
        .filter({ hasText: "Menunggu persetujuan koordinator direktori" })
    ).toBeVisible();

    const coordinatorPage = await useAccount(coordinator);
    await gotoReady(coordinatorPage, needPath);
    await expect(
      coordinatorPage.getByRole("button", {
        name: "Setujui penjangkauan sebagai koordinator direktori",
      })
    ).toBeVisible();
    await coordinatorPage
      .getByRole("button", { name: "Setujui penjangkauan sebagai koordinator direktori" })
      .click();
    await expect(
      coordinatorPage.getByRole("status").filter({ hasText: "Disetujui untuk penjangkauan" })
    ).toBeVisible();
  } finally {
    await context.close().catch(() => {});
  }
});
