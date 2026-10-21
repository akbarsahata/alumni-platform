import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady, reloadReady, useAccount } from "./app-ready";

test("coordinator records and closes while the member confirms, corrects and the school sees aggregates", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outcomes-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  const otherContext = await browser.newContext();
  try {
    const coordinator = await useAccount(context, f.coordinator);
    await gotoReady(coordinator, `/outreach/needs/${f.needId}`);
    await expect(coordinator.getByRole("heading", { name: "Hasil bantuan" })).toBeVisible();
    await expect(coordinator.getByText(/Status saat ini: Sudah diperkenalkan/)).toBeVisible();

    const other = await useAccount(otherContext, f.otherCoordinator);
    await gotoReady(other, `/outreach/needs/${f.needId}`);

    await coordinator.getByLabel("Catat hasil bantuan").selectOption("completed");
    await coordinator
      .getByLabel("Catatan hasil bantuan (1-500 karakter)")
      .fill("Bantuan selesai di sekolah");
    await coordinator.getByRole("button", { name: "Catat hasil" }).click();
    await expect(
      coordinator.getByRole("status").filter({ hasText: "Hasil bantuan dicatat: Selesai." })
    ).toBeVisible();
    await coordinator.screenshot({ path: "test-results/outcomes-desktop.png", fullPage: true });

    await other.getByLabel("Catat hasil bantuan").selectOption("help-confirmed");
    await other.getByLabel("Catatan hasil bantuan (1-500 karakter)").fill("Form lama");
    await other.getByRole("button", { name: "Catat hasil" }).click();
    await expect(other.getByRole("alert")).toContainText("Muat ulang");
    await expect(other.getByText(/Status saat ini: Selesai/)).toBeVisible();
    await expect(other.locator('input[name="expectedRevision"]')).toHaveValue("1");
    await other.getByLabel("Catat hasil bantuan").selectOption("completed");
    await other
      .getByLabel("Catatan hasil bantuan (1-500 karakter)")
      .fill("Bantuan selesai di sekolah");
    await other.getByRole("button", { name: "Catat hasil" }).click();
    await expect(
      other.getByRole("status").filter({ hasText: "Hasil bantuan dicatat: Selesai." })
    ).toBeVisible();

    await coordinator.getByRole("button", { name: "Tutup kebutuhan" }).click();
    await expect(
      coordinator.getByRole("status").filter({ hasText: "Status penjangkauan diperbarui." })
    ).toBeVisible();
    await reloadReady(coordinator);
    await expect(coordinator.getByText(/Kebutuhan ditutup pada/)).toBeVisible();

    const member = await useAccount(context, f.recipient);
    await member.setViewportSize({ width: 390, height: 844 });
    await gotoReady(member, `/outreach/requests/${f.requestId}`);
    await expect(member.getByRole("heading", { name: "Hasil bantuan" })).toBeVisible();
    await expect(member.getByText(/Catatan terbaru: Bantuan selesai di sekolah/)).toBeVisible();
    await member.getByRole("button", { name: "Konfirmasi hasil" }).click();
    await expect(
      member.getByRole("status").filter({ hasText: "Hasil bantuan dikonfirmasi." })
    ).toBeVisible();
    await member.getByLabel("Koreksi hasil bantuan").selectOption("did-not-proceed");
    await member
      .getByLabel("Penjelasan koreksi (1-500 karakter)")
      .fill("Jadwal berubah sehingga bantuan tidak berlanjut");
    await member.getByRole("button", { name: "Koreksi hasil" }).click();
    await expect(
      member
        .getByRole("status")
        .filter({ hasText: "Koreksi hasil bantuan disimpan: Tidak berlanjut." })
    ).toBeVisible();
    await member.getByText("Riwayat hasil bantuan (4)").click();
    await expect(member.getByText("Dikonfirmasi alumni")).toBeVisible();
    await member.screenshot({ path: "test-results/outcomes-mobile.png", fullPage: true });
    expect(await member.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(
      true
    );

    const student = await useAccount(context, f.student);
    await gotoReady(student, `/school-needs/${f.needId}`);
    const progress = student.getByRole("region", { name: "Progres penjangkauan" });
    await expect(progress).toContainText("Kebutuhan ditutup pada");
    await expect(progress).toContainText("Tidak berlanjut: 1");
    await expect(progress).toContainText("Total perkenalan: 1");
    await expect(student.locator("main")).not.toContainText("Jadwal berubah");
  } finally {
    await context.close();
    await otherContext.close();
  }
});
