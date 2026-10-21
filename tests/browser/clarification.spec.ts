import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady, reloadReady, useAccount } from "./app-ready";

async function fixture() {
  return JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/clarification-accounts.json`, "utf8")
  );
}

async function screenshotTop(page: import("@playwright/test").Page, path: string) {
  await page.evaluate(
    "document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);"
  );
  await page.screenshot({ path, fullPage: true });
}

test("member asks privately and coordinator replies without exposing the thread to staff or students", async ({
  browser,
}) => {
  const f = await fixture();
  const context = await browser.newContext();
  const coordinatorContext = await browser.newContext();
  try {
    const member = await useAccount(context, f.recipient);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, `/outreach/requests/${f.requestId}`);
    const memberThread = member.getByRole("region", { name: "Klarifikasi privat" });
    await expect(memberThread).toBeVisible();
    await expect(memberThread).toContainText("Staf dan siswa tidak dapat melihatnya");
    await member
      .getByLabel("Pesan klarifikasi")
      .fill("Apakah kegiatan ini menyediakan transportasi?");
    await memberThread.getByRole("button", { name: "Kirim klarifikasi" }).click();
    await expect(member.getByText(/Pesan klarifikasi tersimpan/)).toBeVisible();
    await expect(member.getByLabel("Pesan klarifikasi")).toHaveValue("");
    await expect(memberThread).toContainText("Apakah kegiatan ini menyediakan transportasi?");
    await expect(memberThread).toContainText("Anda");
    await screenshotTop(member, "test-results/clarification-mobile.png");
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );

    const coordinator = await useAccount(coordinatorContext, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.needId}`);
    await coordinator.getByRole("link", { name: "Buka klarifikasi privat" }).click();
    const coordinatorThread = coordinator.getByRole("region", { name: "Klarifikasi privat" });
    await expect(coordinatorThread).toContainText("Apakah kegiatan ini menyediakan transportasi?");
    await expect(coordinatorThread).toContainText("Alumni");
    await coordinator
      .getByLabel("Pesan klarifikasi")
      .fill("Ya, transportasi disediakan dari sekolah.");
    await coordinatorThread.getByRole("button", { name: "Kirim klarifikasi" }).click();
    await expect(coordinator.getByText(/Pesan klarifikasi tersimpan/)).toBeVisible();
    await expect(coordinator.getByLabel("Pesan klarifikasi")).toHaveValue("");
    await expect(coordinatorThread).toContainText("Ya, transportasi disediakan dari sekolah.");
    await screenshotTop(coordinator, "test-results/clarification-desktop.png");

    await reloadReady(member);
    await expect(memberThread).toContainText("Ya, transportasi disediakan dari sekolah.");
    await expect(memberThread).toContainText("Koordinator direktori");

    const staff = await useAccount(context, f.staff);
    await gotoReady(staff, `/school-needs/${f.needId}`);
    await expect(staff.locator("main")).not.toContainText(
      "Apakah kegiatan ini menyediakan transportasi?"
    );
    const student = await useAccount(context, f.student);
    await gotoReady(student, `/school-needs/${f.needId}`);
    await expect(student.locator("main")).not.toContainText(
      "Apakah kegiatan ini menyediakan transportasi?"
    );
  } finally {
    await coordinatorContext.close();
    await context.close();
  }
});
