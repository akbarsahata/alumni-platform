import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  expectLocalTimestamp,
  expectNoRawTimestampText,
  gotoReady,
  localBrowserOptions,
  reloadReady,
  useAccount,
} from "./app-ready";
test("coordinator selects a recipient and member declines privately on mobile", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`, "utf8")
  );
  const context = await browser.newContext(localBrowserOptions);
  try {
    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.needId}`);
    await expect(coordinator.getByRole("heading", { name: "Pilih penerima" })).toBeVisible();
    const candidate = coordinator
      .getByRole("article")
      .filter({ has: coordinator.locator(`input[value="${f.recipient.id}"]`) });
    // Directory results are paginated; advance until the fixture recipient is visible.
    for (let page = 0; page < 10 && (await candidate.count()) === 0; page++) {
      const next = coordinator.getByRole("link", { name: "Penerima berikutnya" });
      if ((await next.count()) === 0) break;
      await gotoReady(
        coordinator,
        new URL((await next.getAttribute("href"))!, coordinator.url()).href
      );
    }
    await candidate.getByRole("button", { name: "Kirim permintaan" }).click();
    await expect(coordinator.getByRole("status")).toContainText("Permintaan berhasil dikirim");
    await expectLocalTimestamp(
      coordinator
        .locator("p")
        .filter({ hasText: /Batas respons:/ })
        .first()
        .locator("time")
    );
    const requestId = await coordinator.locator('input[name="requestId"]').first().inputValue();
    await coordinator.screenshot({ path: "test-results/outreach-desktop.png", fullPage: true });
    const member = await useAccount(context, f.recipient);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, "/outreach");
    await expectLocalTimestamp(member.locator("main time").first());
    await gotoReady(member, `/outreach/requests/${requestId}`);
    await expect(
      member.getByText("Menyatakan minat tidak membagikan email Anda.", { exact: true })
    ).toBeVisible();
    await expectLocalTimestamp(member.locator("main time").first());
    await expectNoRawTimestampText(member);
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
    const primary = await useAccount(context, f.primary);
    await gotoReady(primary, "/admin/outreach-audit");
    await expectLocalTimestamp(primary.locator("main time").first());
    await expectNoRawTimestampText(primary);
  } finally {
    await Promise.allSettled([context.close()]);
  }
});

test("coordinator sends one reminder and takes over; expired requests reject responses", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`, "utf8")
  );
  const context = await browser.newContext(localBrowserOptions);
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
    await expectLocalTimestamp(member.locator("main time").first());
    await expectNoRawTimestampText(member);
    await expect(member.getByRole("button", { name: "Saya berminat" })).toHaveCount(0);
    await expect(member.getByRole("button", { name: "Tolak permintaan" })).toHaveCount(0);
  } finally {
    await Promise.allSettled([context.close()]);
  }
});
