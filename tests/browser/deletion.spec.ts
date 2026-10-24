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

async function fixture() {
  return JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/deletion-accounts.json`, "utf8")
  );
}

async function screenshotTop(page: import("@playwright/test").Page, path: string) {
  await page.evaluate(
    "document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);"
  );
  await page.screenshot({ path, fullPage: true });
}

test("member requests profile deletion and the primary operator completes the manual steps", async ({
  browser,
}) => {
  const f = await fixture();
  const memberContext = await browser.newContext(localBrowserOptions);
  const primaryContext = await browser.newContext(localBrowserOptions);
  try {
    const member = await useAccount(memberContext, f.submitter);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, "/profile");
    await expect(member.getByRole("link", { name: "Privasi & penghapusan" })).toBeVisible();
    await member.getByRole("link", { name: "Privasi & penghapusan" }).click();
    await expect(member.getByRole("heading", { name: "Privasi & penghapusan" })).toBeVisible();
    await expect(member.locator("main")).toContainText("30 hari");
    await expect(member.locator("main")).toContainText("tidak dapat ditarik kembali");
    await expect(member.locator("main")).toContainText("Akun, keanggotaan, peran");
    await member
      .getByRole("checkbox", {
        name: /Saya memahami bahwa profil langsung disembunyikan/,
      })
      .check();
    await member.getByRole("button", { name: "Ajukan penghapusan profil" }).click();
    await expect(member.locator("main")).toContainText("Permintaan sedang diproses");
    await expect(member.locator("main")).toContainText("Target selesai");
    await expectLocalTimestamp(member.locator("main time").first());
    await expectNoRawTimestampText(member);
    await expect(member.locator("main")).toContainText("tidak dapat dibatalkan");
    await screenshotTop(member, "test-results/deletion-member-mobile.png");
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );

    const primary = await useAccount(primaryContext, f.primary);
    await gotoReady(primary, "/admin/profile-deletions");
    await expect(primary.getByRole("heading", { name: "Penghapusan profil" })).toBeVisible();
    await expect(primary.locator("main")).toContainText("tidak membuka pencarian direktori");
    await expect(
      primary.locator("main").getByRole("link", { name: "Direktori keahlian" })
    ).toHaveCount(0);
    await gotoReady(primary, `/admin/profile-deletions/${f.deletionRequestId}`);
    await expect(primary.getByRole("heading", { name: "Proses penghapusan profil" })).toBeVisible();
    await expect(primary.locator("main")).toContainText("ID akun:");
    await expect(primary.locator("main")).not.toContainText(f.processing.email);
    await expectLocalTimestamp(primary.locator("main time").first());
    await expectNoRawTimestampText(primary);

    await primary
      .getByRole("checkbox", {
        name: "Saya memahami tindakan ini menghapus konten profil secara permanen.",
      })
      .check();
    await primary.getByRole("button", { name: "Hapus konten profil" }).click();
    await expect(
      primary.getByRole("status").filter({ hasText: "Konten profil dihapus." })
    ).toBeVisible();
    await expect(primary.locator("main")).toContainText("selesai pada");

    await primary
      .getByRole("checkbox", {
        name: "Saya memahami tindakan ini menghapus teks klarifikasi secara permanen.",
      })
      .check();
    await primary.getByRole("button", { name: "Hapus teks klarifikasi privat" }).click();
    await expect(
      primary.getByRole("status").filter({ hasText: "Teks klarifikasi privat dihapus." })
    ).toBeVisible();

    await primary
      .getByLabel("Bukti penyelesaian")
      .fill("Profil dan teks klarifikasi terverifikasi.");
    await primary.getByRole("button", { name: "Selesaikan penghapusan" }).click();
    await expect(
      primary.getByRole("status").filter({ hasText: "Penghapusan profil diselesaikan." })
    ).toBeVisible();
    await expect(primary.locator("main")).toContainText("Selesai pada");
    await screenshotTop(primary, "test-results/deletion-admin-desktop.png");

    const processing = await useAccount(memberContext, f.processing);
    await gotoReady(processing, "/profile/deletion");
    await expect(processing.locator("main")).toContainText("Penghapusan selesai.");
    await expect(processing.locator("main")).toContainText("Buka profil untuk membuat profil baru");
    await reloadReady(processing);
    await expect(processing.locator("main")).toContainText("Penghapusan selesai.");
  } finally {
    await Promise.allSettled([primaryContext.close(), memberContext.close()]);
  }
});
