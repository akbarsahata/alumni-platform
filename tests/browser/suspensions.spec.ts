import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("administrator suspends and restores membership after a member requests review in Bahasa Indonesia", async ({
  browser,
}) => {
  const fixture = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/suspension-accounts.json`, "utf8")
  );
  const reviewerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  for (const [context, account] of [
    [reviewerContext, fixture.reviewer],
    [memberContext, fixture.member],
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
  try {
    const reviewer = await reviewerContext.newPage();
    const member = await memberContext.newPage();
    await member.goto("/membership");
    await reviewer.goto(`/admin/membership/${fixture.member.id}`);
    await reviewer
      .getByLabel("Alasan perubahan status (privat)")
      .fill("PRIVATE browser suspension reason");
    await reviewer
      .getByLabel("Pesan perubahan status untuk anggota")
      .fill("Hubungi pemeriksa melalui permintaan tinjauan.");
    await reviewer.getByRole("button", { name: "Tangguhkan keanggotaan", exact: true }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await member.reload();
    await expect(
      member.getByText("Keanggotaan ditangguhkan", { exact: true }).first()
    ).toBeVisible();
    await expect(member.getByText("PRIVATE browser suspension reason")).toHaveCount(0);
    await member
      .getByLabel("Penjelasan tinjauan penangguhan")
      .fill("Mohon periksa ulang dengan staf sekolah.");
    await member.getByRole("button", { name: "Minta tinjauan penangguhan", exact: true }).click();
    await expect(member.getByRole("status")).toContainText(
      "Permintaan tinjauan penangguhan tersimpan"
    );
    await expect(
      member.getByRole("button", { name: "Minta tinjauan penangguhan", exact: true })
    ).toHaveCount(0);
    await reviewer.goto("/admin/membership");
    await reviewer
      .getByRole("link", { name: `Tinjau anggota ${fixture.member.id}`, exact: true })
      .click();
    await expect(reviewer.getByText("Mohon periksa ulang dengan staf sekolah.")).toBeVisible();
    await reviewer
      .getByLabel("Alasan perubahan status (privat)")
      .fill("PRIVATE browser reinstatement check");
    await reviewer
      .getByLabel("Pesan perubahan status untuk anggota")
      .fill("Pemeriksaan selesai dan keanggotaan dipulihkan.");
    await reviewer.getByRole("button", { name: "Pulihkan keanggotaan", exact: true }).click();
    await expect(reviewer.getByRole("status")).toContainText("Keputusan tersimpan");
    await member.reload();
    await expect(member.getByText("Tinjauan penangguhan selesai", { exact: true })).toBeVisible();
    await expect(
      member.getByText("Pemeriksaan selesai dan keanggotaan dipulihkan.", { exact: true })
    ).toBeVisible();
    await expect(member.getByText("PRIVATE browser reinstatement check")).toHaveCount(0);
    await expect(
      member.getByRole("button", { name: "Minta tinjauan penangguhan", exact: true })
    ).toHaveCount(0);
  } finally {
    await Promise.allSettled([reviewerContext.close(), memberContext.close()]);
  }
});
