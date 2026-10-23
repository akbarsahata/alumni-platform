import { gotoReady } from "./app-ready";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("student submits a need for independent staff validation and coordinator approval", async ({
  browser,
}) => {
  const { student, staff, coordinator } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/school-needs-accounts.json`, "utf8")
  );
  const context = await browser.newContext({ locale: "id-ID", timezoneId: "Asia/Jakarta" });
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
    await studentPage.getByRole("button", { name: "Kirim kebutuhan" }).click();
    await expect(studentPage.locator("[data-sonner-toast]").first()).toContainText(
      "Periksa kembali isian yang ditandai."
    );
    await expect(studentPage.getByText("Pilih jenis kebutuhan.")).toBeVisible();
    await expect(studentPage.getByText("Judul wajib diisi.")).toBeVisible();
    await expect(studentPage.getByText("Jumlah komitmen wajib diisi.")).toBeVisible();
    await expect(studentPage.getByLabel("Jenis kebutuhan")).toBeFocused();
    await studentPage.getByLabel("Jenis kebutuhan").selectOption("student-mentoring");
    await expect(studentPage.getByText("Pilih jenis kebutuhan.")).toHaveCount(0);
    await studentPage.getByLabel("Judul").fill("Mentoring sains daring");
    await studentPage.getByLabel("Tujuan sekolah").fill("Mendukung siswa menyiapkan proyek sains.");
    await studentPage
      .getByLabel("Keahlian atau bantuan yang dibutuhkan")
      .fill("Keahlian sains dan pendampingan.");
    const commitment = studentPage.getByRole("group", { name: "Perkiraan komitmen waktu" });
    await commitment.getByLabel("Jumlah").fill("1");
    await commitment.getByLabel("Satuan").selectOption("jam");
    await commitment.getByLabel("Frekuensi (opsional)").selectOption("per-minggu");
    const timing = studentPage.getByRole("group", { name: "Waktu pelaksanaan" });
    await timing.getByLabel("Mulai").fill("2026-11-01");
    await timing.getByLabel("Selesai (opsional)").fill("2026-11-30");
    await studentPage.getByLabel("Lokasi kegiatan").selectOption("on-site");
    const locationDetails = studentPage.getByLabel("Alamat/lokasi");
    await expect(locationDetails).toHaveValue("SMAN Sumsel, Palembang");
    await studentPage.getByLabel("Lokasi kegiatan").selectOption("off-site");
    await expect(locationDetails).toHaveValue("");
    await locationDetails.fill("Balai Kota Palembang");
    await studentPage.getByLabel("Perwakilan staf terverifikasi").selectOption(staff.id);
    await studentPage.getByLabel("Ketentuan partisipasi").selectOption("voluntary");
    const initiativeLink = studentPage.getByLabel("Tautan inisiatif (opsional)");
    await initiativeLink.fill("bukan tautan");
    await initiativeLink.blur();
    await expect(
      studentPage.getByText("Masukkan tautan yang valid", { exact: false })
    ).toBeVisible();
    await studentPage.getByRole("button", { name: "Kirim kebutuhan" }).click();
    await expect(
      studentPage.getByText("Masukkan tautan yang valid", { exact: false })
    ).toBeVisible();
    await expect(studentPage.locator("[data-sonner-toast]").first()).toContainText(
      "Periksa kembali isian yang ditandai."
    );
    await initiativeLink.fill("school.example/mentoring");
    await initiativeLink.blur();
    await expect(initiativeLink).toHaveValue("https://school.example/mentoring");
    await studentPage.getByRole("button", { name: "Kirim kebutuhan" }).click();
    await expect(studentPage.getByRole("status")).toContainText("berhasil dikirim untuk ditinjau");
    await expect(studentPage.locator("[data-sonner-toast]").first()).toContainText(
      "berhasil dikirim untuk ditinjau"
    );
    await studentPage.getByRole("link", { name: /Mentoring sains daring/ }).click();
    await expect(studentPage.getByText("1 jam per minggu")).toBeVisible();
    await expect(studentPage.getByText("1 November 2026 – 30 November 2026")).toBeVisible();
    await expect(
      studentPage.getByText("Di lokasi di luar sekolah · Balai Kota Palembang")
    ).toBeVisible();
    const history = studentPage.getByRole("region", { name: "Riwayat persetujuan" });
    await expect(history.locator("time").first()).toContainText("WIB");
    await expect(history.locator("time").first()).toContainText("lalu");
    await expect(studentPage.getByRole("link", { name: "Lihat inisiatif" })).toHaveAttribute(
      "href",
      "https://school.example/mentoring"
    );
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
