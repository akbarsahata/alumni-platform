import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady, reloadReady, useAccount } from "./app-ready";
test("coordinator selects a recipient and member declines privately on mobile", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  try {
    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, "/outreach");
    await coordinator
      .getByRole("link", { name: "Mentor robotika untuk siswa", exact: true })
      .click();
    await expect(coordinator.getByRole("heading", { name: "Pilih penerima" })).toBeVisible();
    const candidate = coordinator
      .getByRole("article")
      .filter({ has: coordinator.locator(`input[value="${f.recipient.id}"]`) });
    await candidate.getByRole("button", { name: "Kirim permintaan" }).click();
    await expect(coordinator.getByRole("status")).toContainText("Permintaan berhasil dikirim");
    await coordinator.screenshot({ path: "test-results/outreach-desktop.png", fullPage: true });
    const member = await useAccount(context, f.recipient);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, "/outreach");
    await member.getByRole("link", { name: "Mentor robotika untuk siswa", exact: true }).click();
    await expect(
      member.getByText("Menyatakan minat tidak membagikan email Anda.", { exact: true })
    ).toBeVisible();
    await member.getByLabel("Alasan penolakan (opsional)").fill("Jadwal keluarga");
    await member.getByRole("button", { name: "Tolak permintaan" }).click();
    await expect(member.getByRole("status").first()).toContainText("Ditolak");
    await member.screenshot({ path: "test-results/outreach-mobile.png", fullPage: true });
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );
    const student = await useAccount(context, f.student);
    await gotoReady(student, `/school-needs/${f.needId}`);
    await expect(student.getByRole("region", { name: "Progres penjangkauan" })).toContainText(
      "Ditolak: 1"
    );
    await expect(student.locator("main")).not.toContainText("Jadwal keluarga");
  } finally {
    await context.close();
  }
});

test("coordinator sends one reminder and takes over; expired requests reject responses", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  try {
    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.reminderNeedId}`);
    await coordinator.getByRole("button", { name: "Kirim satu pengingat" }).click();
    await expect(coordinator.getByRole("status")).toContainText("Status penjangkauan diperbarui.");
    await reloadReady(coordinator);
    await expect(coordinator.getByText("Pengingat: Terkirim")).toBeVisible();
    const other = await useAccount(context, f.otherCoordinator);
    await gotoReady(other, `/outreach/needs/${f.reminderNeedId}`);
    await other.getByRole("button", { name: "Ambil alih koordinasi" }).click();
    await expect(other.getByRole("status")).toContainText("Status penjangkauan diperbarui.");
    await reloadReady(other);
    await expect(other.getByText(`Koordinator (ID): ${f.otherCoordinator.id}`)).toBeVisible();
    const member = await useAccount(context, f.expiredRecipient);
    await gotoReady(member, `/outreach/requests/${f.expiredRequestId}`);
    await expect(member.getByRole("status")).toContainText("Kedaluwarsa");
    await expect(member.getByRole("button", { name: "Saya berminat" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Tolak permintaan" })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
