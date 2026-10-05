import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("applicant requests a reference and authenticated alumnus responds before private administrator review", async ({
  browser,
}) => {
  test.setTimeout(60_000);
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/reference-accounts.json`, "utf8")
  );
  const vars = await readFile(process.env.ALUMNI_TEST_VARS!, "utf8");
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
    .slice("LOCAL_MAIL_KEY=".length);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const [index, account] of [
    fixture.applicant,
    fixture.reference,
    fixture.reviewer,
  ].entries()) {
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
  }
  try {
    const applicant = await contexts[0].newPage();
    const reference = await contexts[1].newPage();
    const reviewer = await contexts[2].newPage();
    await applicant.goto("/membership");
    await applicant.getByLabel("Nama semasa sekolah").fill("Nama Pemohon Referensi Browser");
    await applicant.getByLabel("Tahun kelulusan").fill("2008");
    await applicant.getByLabel("House", { exact: true }).selectOption("Komodo");
    await applicant
      .getByLabel("Penjelasan untuk tinjauan manual")
      .fill("Penjelasan privat pemohon browser.");
    await applicant.getByRole("button", { name: "Kirim pengajuan", exact: true }).click();
    await applicant.getByLabel("Email referensi").fill(fixture.reference.email);
    await applicant.getByRole("button", { name: "Kirim permintaan referensi" }).click();
    await expect(applicant.getByText("Menunggu respons referensi", { exact: true })).toBeVisible();
    const mail = await (
      await contexts[0].request.get(
        `/__local/mail?email=${encodeURIComponent(fixture.reference.email)}`,
        { headers: { Authorization: `Bearer ${key}` } }
      )
    ).json();
    const path = mail.text.match(/\/references\/[a-f0-9-]+/)[0];
    await reference.goto(path);
    await expect(
      reference.getByText("Nama semasa sekolah: Nama Pemohon Referensi Browser")
    ).toBeVisible();
    await expect(reference.getByText("Penjelasan privat pemohon browser.")).toHaveCount(0);
    await reference.getByLabel("Respons", { exact: true }).selectOption("endorse");
    await reference
      .getByLabel("Komentar privat untuk pemeriksa")
      .fill("Komentar privat referensi browser.");
    await reference.getByRole("button", { name: "Kirim respons" }).click();
    await expect(reference.getByRole("alert")).toContainText("kenal pribadi");
    await reference.getByLabel("Saya kenal pribadi dengan pemohon semasa sekolah").check();
    await reference.getByRole("button", { name: "Kirim respons" }).click();
    await expect(reference.getByRole("status")).toContainText("Respons tersimpan");
    await expect(reference.getByRole("button", { name: "Kirim respons" })).toHaveCount(0);
    await applicant.reload();
    await expect(
      applicant.getByText("Referensi diterima — menunggu keputusan administrator", { exact: true })
    ).toBeVisible();
    await expect(applicant.getByText("Komentar privat referensi browser.")).toHaveCount(0);
    await reviewer.goto(`/admin/membership/${fixture.applicant.id}`);
    await expect(
      reviewer.getByText("Komentar privat: Komentar privat referensi browser.")
    ).toBeVisible();
    await reviewer.getByLabel("Sumber pemeriksaan independen").selectOption("trusted-alumnus");
    await reviewer
      .getByLabel("Catatan pemeriksaan independen")
      .fill("Mengevaluasi referensi alumni yang kenal pribadi dengan pemohon.");
    await reviewer.getByLabel("Alasan internal").fill("Identitas dan kelayakan sesuai referensi.");
    await reviewer
      .getByLabel("Pesan untuk pemohon")
      .fill("Keanggotaan disetujui setelah tinjauan administrator.");
    await reviewer.getByRole("button", { name: "Simpan keputusan" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await applicant.reload();
    await expect(
      applicant.getByText("Keanggotaan disetujui", { exact: true }).first()
    ).toBeVisible();
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
