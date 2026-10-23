import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady, reloadReady, useAccount } from "./app-ready";

async function fixture() {
  return JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/representative-names-accounts.json`, "utf8")
  );
}

test("primary corrects a representative name and the saved identity reaches school needs, consent and captured mail", async ({
  browser,
}) => {
  const f = await fixture();
  const primaryContext = await browser.newContext();
  const staffContext = await browser.newContext();
  const memberContext = await browser.newContext();
  try {
    const primary = await useAccount(primaryContext, f.primary);
    await gotoReady(primary, "/admin/roles");
    await primary.getByLabel("Akun perwakilan").selectOption(f.staff.id);
    await primary.getByLabel("Nama perwakilan", { exact: true }).fill("Ibu Sari Browser Baru");
    await primary.getByRole("button", { name: "Simpan nama" }).click();
    await expect(primary.getByRole("status")).toHaveText("Nama perwakilan berhasil diperbarui.");
    await expect(primary.getByRole("row").filter({ hasText: f.staff.email })).toContainText(
      "Ibu Sari Browser Baru"
    );

    const staff = await useAccount(staffContext, f.staff);
    await gotoReady(staff, "/school-needs");
    const contact = staff.getByLabel("Perwakilan staf terverifikasi");
    await expect(contact.locator(`option[value="${f.staff.id}"]`)).toHaveText(
      "Ibu Sari Browser Baru"
    );

    const member = await useAccount(memberContext, f.recipient);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, `/outreach/requests/${f.requestId}`);
    let consent = member.getByRole("region", { name: "Persetujuan berbagi email" });
    await expect(consent).toContainText("Ibu Sari Browser Baru");
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );

    const primaryAgain = await useAccount(primaryContext, f.primary);
    await gotoReady(primaryAgain, "/admin/roles");
    await primaryAgain.getByLabel("Akun perwakilan").selectOption(f.staff.id);
    await primaryAgain
      .getByLabel("Nama perwakilan", { exact: true })
      .fill("Ibu Sari Browser Terbaru");
    await primaryAgain.getByRole("button", { name: "Simpan nama" }).click();
    await expect(primaryAgain.getByRole("status")).toHaveText(
      "Nama perwakilan berhasil diperbarui."
    );

    await reloadReady(member);
    consent = member.getByRole("region", { name: "Persetujuan berbagi email" });
    await expect(consent).toContainText("Ibu Sari Browser Terbaru");
    await expect(consent).not.toContainText("Ibu Sari Browser Baru");
    await member.getByLabel(/Saya setuju email saya/).check();
    await consent.getByRole("button", { name: "Setujui perkenalan" }).click();
    await expect(
      member.getByText("Persetujuan tercatat. Perkenalan telah dikirim kepada kontak staf.")
    ).toBeVisible();
    await expect(consent.getByText(/Email Anda sudah dibagikan kepada/)).toContainText(
      "Ibu Sari Browser Terbaru"
    );

    const vars = await readFile(process.env.ALUMNI_TEST_VARS!, "utf8");
    const key = vars
      .split("\n")
      .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
      .slice("LOCAL_MAIL_KEY=".length);
    const mail = await (
      await member.request.get(`/__local/mail?email=${encodeURIComponent(f.staff.email)}`, {
        headers: { Authorization: `Bearer ${key}` },
      })
    ).json();
    expect(mail.text).toContain("Ibu Sari Browser Terbaru");
    expect(mail.text).toContain(f.recipient.email);
  } finally {
    await primaryContext.close();
    await staffContext.close();
    await memberContext.close();
  }
});
