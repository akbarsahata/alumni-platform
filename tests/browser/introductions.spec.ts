import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  expectLocalTimestamp,
  gotoReady,
  localBrowserOptions,
  reloadReady,
  useAccount,
} from "./app-ready";

async function fixture() {
  return JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/introductions-accounts.json`, "utf8")
  );
}

function staffName(account: { id: string }) {
  return `Akun staf ${account.id.slice(0, 8)}`;
}

async function screenshotTop(page: import("@playwright/test").Page, path: string) {
  await page.evaluate(
    "document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0);"
  );
  await page.screenshot({ path, fullPage: true });
}

test("stale consent is rejected; fresh unchecked consent shares without exposing member email", async ({
  browser,
}) => {
  const f = await fixture();
  const context = await browser.newContext(localBrowserOptions);
  const replacementContext = await browser.newContext(localBrowserOptions);
  try {
    const member = await useAccount(context, f.consentMember);
    await member.setViewportSize({ width: 375, height: 812 });
    await gotoReady(member, `/outreach/requests/${f.consentRequestId}`);
    const consentSection = member.getByRole("region", { name: "Persetujuan berbagi email" });
    await expect(consentSection).toBeVisible();
    await expect(consentSection).toContainText(staffName(f.staff));
    await expect(consentSection).toContainText(f.consentMember.email);
    const checkbox = member.getByLabel(/Saya setuju email saya/);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    const replacementCoordinator = await useAccount(replacementContext, f.coordinator);
    await gotoReady(replacementCoordinator, `/outreach/needs/${f.consentNeed}`);
    await replacementCoordinator
      .getByLabel("Ganti kontak staf penerima")
      .selectOption(f.replacement.id);
    await replacementCoordinator.getByRole("button", { name: "Simpan kontak penerima" }).click();
    await expect(
      replacementCoordinator.getByText(
        "Kontak staf penerima perkenalan diperbarui. Persetujuan yang belum terkirim dibatalkan."
      )
    ).toBeVisible();
    await consentSection.getByRole("button", { name: "Setujui perkenalan" }).click();
    await expect(member.getByRole("alert")).toBeVisible();
    await expect(consentSection).toContainText(staffName(f.replacement));
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await consentSection.getByRole("button", { name: "Setujui perkenalan" }).click();
    await expect(
      member.getByText("Persetujuan tercatat. Perkenalan telah dikirim kepada kontak staf.")
    ).toBeVisible();
    await expect(consentSection.getByText(/Email Anda sudah dibagikan kepada/)).toBeVisible();
    await expectLocalTimestamp(
      consentSection
        .locator("p")
        .filter({ hasText: /Email Anda sudah dibagikan kepada/ })
        .locator("time")
    );
    await expect(
      member.getByText(/Email yang sudah dibagikan tidak dapat ditarik kembali/)
    ).toBeVisible();
    await screenshotTop(member, "test-results/introductions-consent-mobile.png");
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );

    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.consentNeed}`);
    await expect(coordinator.getByText(/Perkenalan: terkirim kepada/)).toBeVisible();
    await expectLocalTimestamp(
      coordinator
        .locator("p")
        .filter({ hasText: /Perkenalan: terkirim kepada/ })
        .locator("time")
    );
    await expect(coordinator.locator("main")).not.toContainText(f.consentMember.email);
    await screenshotTop(coordinator, "test-results/introductions-consent-desktop.png");

    const student = await useAccount(context, f.student);
    await gotoReady(student, `/school-needs/${f.consentNeed}`);
    await expect(student.locator("main")).not.toContainText(f.consentMember.email);
  } finally {
    await replacementContext.close();
    await context.close();
  }
});

test("coordinator replaces staff; member sees a fresh unchecked consent for the new recipient", async ({
  browser,
}) => {
  const f = await fixture();
  const context = await browser.newContext(localBrowserOptions);
  try {
    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.replacementNeed}`);
    const recipientSection = coordinator.getByRole("region", {
      name: "Kontak staf penerima perkenalan",
    });
    await expect(recipientSection).toContainText(staffName(f.staff));
    await coordinator.getByLabel("Ganti kontak staf penerima").selectOption(f.replacement.id);
    await coordinator.getByRole("button", { name: "Simpan kontak penerima" }).click();
    await expect(
      coordinator.getByText(
        "Kontak staf penerima perkenalan diperbarui. Persetujuan yang belum terkirim dibatalkan."
      )
    ).toBeVisible();
    await reloadReady(coordinator);
    await expect(recipientSection).toContainText(staffName(f.replacement));
    await expect(coordinator.getByText(/Perkenalan: persetujuan dibatalkan/)).toBeVisible();
    await expect(coordinator.getByText(/Kontak staf penerima berubah/)).toBeVisible();
    await screenshotTop(coordinator, "test-results/introductions-replacement.png");

    const member = await useAccount(context, f.replacementMember);
    await gotoReady(member, `/outreach/requests/${f.replacementRequestId}`);
    const consentSection = member.getByRole("region", { name: "Persetujuan berbagi email" });
    await expect(consentSection).toContainText(staffName(f.replacement));
    const checkbox = member.getByLabel(/Saya setuju email saya/);
    await expect(checkbox).not.toBeChecked();
    await checkbox.check();
    await consentSection.getByRole("button", { name: "Setujui perkenalan" }).click();
    await expect(
      member.getByText("Persetujuan tercatat. Perkenalan telah dikirim kepada kontak staf.")
    ).toBeVisible();
    await expect(consentSection.getByText(/Email Anda sudah dibagikan kepada/)).toBeVisible();
    await expectLocalTimestamp(
      consentSection
        .locator("p")
        .filter({ hasText: /Email Anda sudah dibagikan kepada/ })
        .locator("time")
    );

    const coordinatorAgain = await useAccount(context, f.coordinator);
    await gotoReady(coordinatorAgain, `/outreach/needs/${f.replacementNeed}`);
    await expect(coordinatorAgain.getByText(/Perkenalan: terkirim kepada/)).toBeVisible();
    await expectLocalTimestamp(
      coordinatorAgain
        .locator("p")
        .filter({ hasText: /Perkenalan: terkirim kepada/ })
        .locator("time")
    );
    await expect(coordinatorAgain.locator("main")).not.toContainText(f.replacementMember.email);
  } finally {
    await context.close();
  }
});

test("member withdraws a pending consent and sees the non-recall explanation", async ({
  browser,
}) => {
  const f = await fixture();
  const context = await browser.newContext(localBrowserOptions);
  try {
    const member = await useAccount(context, f.withdrawMember);
    await gotoReady(member, `/outreach/requests/${f.withdrawRequestId}`);
    const consentSection = member.getByRole("region", { name: "Persetujuan berbagi email" });
    await expect(consentSection).toContainText(/Persetujuan tercatat/);
    await expectLocalTimestamp(consentSection.locator("time").first());
    await expect(
      consentSection.getByText(/Email yang sudah dibagikan tidak dapat ditarik kembali/)
    ).toBeVisible();
    await consentSection.getByRole("button", { name: "Tarik persetujuan" }).click();
    await expect(
      member.getByText("Persetujuan ditarik. Email belum dibagikan dan tidak akan dikirim.")
    ).toBeVisible();
    await expect(consentSection.getByText(/Persetujuan sebelumnya ditarik/)).toBeVisible();
    await expect(consentSection.getByText(/Email Anda sudah dibagikan kepada/)).toHaveCount(0);

    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.withdrawNeed}`);
    await expect(coordinator.getByText(/Perkenalan: persetujuan ditarik/)).toBeVisible();
    await expect(coordinator.getByText(/Perkenalan: terkirim kepada/)).toHaveCount(0);
    await expect(coordinator.locator("main")).not.toContainText(f.withdrawMember.email);
  } finally {
    await context.close();
  }
});
