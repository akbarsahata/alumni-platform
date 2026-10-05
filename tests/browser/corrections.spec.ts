import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("applicant replaces a reference, switches to manual review and corrects house; administrator freshly reviews an approved house correction", async ({
  browser,
}) => {
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/correction-accounts.json`, "utf8")
  );
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  for (const [index, account] of [fixture.applicant, fixture.reviewer, fixture.member].entries()) {
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
    await applicant.goto("/membership");
    await applicant.getByLabel("Email referensi baru").fill("browser-replacement@example.test");
    await applicant.getByRole("button", { name: "Ganti referensi", exact: true }).click();
    await expect(applicant.getByRole("status")).toContainText("Referensi diganti");
    await applicant
      .getByLabel("Alasan meminta tinjauan manual")
      .fill("Mohon pemeriksaan independen melalui staf sekolah.");
    await applicant.getByRole("button", { name: "Minta tinjauan manual", exact: true }).click();
    await expect(applicant.getByRole("status")).toContainText("Tinjauan manual diminta");
    await applicant.getByLabel("House", { exact: true }).selectOption("Lion");
    await applicant.getByRole("button", { name: "Kirim perbaikan", exact: true }).click();
    await expect(applicant.getByRole("status")).toContainText("Pengajuan tersimpan");
    await expect(applicant.getByText("Versi 4", { exact: true })).toBeVisible();
    const reviewer = await contexts[1].newPage();
    await reviewer.goto(`/admin/membership/${fixture.member.id}`);
    await reviewer.getByLabel("House yang benar").selectOption("Lion");
    await reviewer.getByLabel("Sumber pemeriksaan independen").selectOption("school-staff");
    await reviewer
      .getByLabel("Catatan pemeriksaan independen")
      .fill("Staf sekolah memeriksa ulang house Lion dari catatan sekolah.");
    await reviewer
      .getByLabel("Alasan internal")
      .fill("House awal salah; pemeriksaan baru selesai.");
    await reviewer
      .getByLabel("Pesan untuk pemohon")
      .fill("House telah dikoreksi menjadi Lion setelah tinjauan baru.");
    await reviewer.getByRole("button", { name: "Simpan koreksi house setelah tinjauan" }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await expect(reviewer.getByText("Versi 1: Komodo → Lion", { exact: true })).toBeVisible();
    const member = await contexts[2].newPage();
    await member.goto("/membership");
    await expect(
      member.getByText("House telah dikoreksi menjadi Lion setelah tinjauan baru.")
    ).toBeVisible();
    await expect(member.getByRole("button", { name: "Kirim perbaikan" })).toHaveCount(0);
    await expect(member.getByRole("definition").filter({ hasText: /^Lion$/ })).toBeVisible();
    await expect(member.getByText("House awal salah; pemeriksaan baru selesai.")).toHaveCount(0);
  } finally {
    await Promise.allSettled(contexts.map((c) => c.close()));
  }
});
