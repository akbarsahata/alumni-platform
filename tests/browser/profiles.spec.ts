import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("member edits, consents, pauses, opts out, and reconfirms a private profile in Bahasa Indonesia", async ({
  browser,
}) => {
  const { member } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/profile-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  const [name, ...value] = member.cookie.split("=");
  await context.addCookies([
    { name, value: value.join("="), url: "http://127.0.0.1:5173", httpOnly: true, sameSite: "Lax" },
  ]);
  try {
    const page = await context.newPage();
    async function save() {
      const response = page.waitForResponse(
        (response) => response.request().method() === "POST" && response.url().includes("/profile")
      );
      await page.getByRole("button", { name: "Simpan profil", exact: true }).click();
      await response;
      await expect(page.getByRole("button", { name: "Simpan profil", exact: true })).toBeEnabled();
    }
    const notifications = page.getByRole("region", { name: /Pemberitahuan profil/ });
    async function selectLocation(label: string, query: string, option: string) {
      const input = page.getByRole("combobox", { name: label, exact: true });
      await input.fill(query);
      await page.getByRole("option", { name: option, exact: true }).click();
      await input.press("Escape");
    }
    await page.goto("/");
    await page.getByRole("link", { name: "Profil keahlian" }).click();
    await page.getByText("Identitas sekolah terverifikasi ·", { exact: false }).click();
    await expect(page.getByLabel("Identitas sekolah terverifikasi")).toContainText(
      "Nama semasa sekolah"
    );
    await expect(page.getByLabel("Aktifkan partisipasi")).not.toBeChecked();
    await expect(page.getByLabel("Perkenalan profesional (wajib)")).toHaveAttribute("required", "");
    await expect(page.getByLabel("Perkenalan profesional (wajib)")).toHaveAttribute(
      "placeholder",
      /Contoh:/
    );
    await expect(page.getByLabel("Catatan ketersediaan (opsional)")).not.toHaveAttribute(
      "required"
    );
    await page.getByLabel("Nama tampilan (opsional)").fill("Nama profesional");
    await page.getByLabel("Perkenalan profesional (wajib)").fill("Mendampingi klub robotika");
    await selectLocation(
      "Kota di Indonesia (opsional)",
      "Palembang",
      "Palembang — Sumatera Selatan"
    );
    await selectLocation("Kota di Indonesia (opsional)", "Jakarta", "Jakarta — DKI Jakarta");
    const cityInput = page.getByRole("combobox", {
      name: "Kota di Indonesia (opsional)",
      exact: true,
    });
    await cityInput.fill("Singapore");
    await expect(page.getByText("Tidak ada hasil.", { exact: true })).toBeVisible();
    await cityInput.press("Escape");
    await selectLocation("Negara (opsional)", "Indonesia", "Indonesia");
    await selectLocation("Negara (opsional)", "Australia", "Australia");
    await expect(page.locator("#participation-help")).toContainText("Hapus centang");
    await expect(page.locator("#participation-consent-help")).toContainText(
      "tidak membagikan email"
    );
    await page.getByLabel("Teknologi", { exact: true }).check();
    await page.getByLabel("Sains", { exact: true }).check();
    await page.getByLabel("Pendampingan", { exact: true }).check();
    await page.getByLabel("Ketersediaan", { exact: true }).selectOption("limited");
    await page.getByLabel("Aktifkan partisipasi").check();
    await save();
    await expect(page.getByRole("alert")).toContainText("persetujuan");
    await page.getByLabel("Saya menyetujui").check();
    await save();
    await expect(notifications).toContainText("tersimpan");
    await notifications.getByRole("button", { name: "Tutup pemberitahuan" }).click();
    await expect(page.getByText("Kelayakan penjangkauan: Memenuhi syarat")).toBeVisible();
    await page.getByLabel("Ketersediaan", { exact: true }).selectOption("unavailable");
    await page.getByLabel("Saya menyetujui").check();
    await save();
    await expect(
      page.getByText("Kelayakan penjangkauan: Anda sementara tidak tersedia.")
    ).toBeVisible();
    await page.getByLabel("Aktifkan partisipasi").uncheck();
    await save();
    await expect(
      page.getByText("Kelayakan penjangkauan: Partisipasi belum diaktifkan.")
    ).toBeVisible();
    await page.getByLabel("Nama tampilan (opsional)").fill("Nama diperbarui");
    await save();
    await expect(notifications).toContainText("tersimpan");
    await notifications.getByRole("button", { name: "Tutup pemberitahuan" }).click();
    await page.reload();
    await expect(page.getByLabel("Nama tampilan (opsional)")).toHaveValue("Nama diperbarui");
    await expect(
      page
        .locator(".location__multi-value__label")
        .filter({ hasText: "Palembang — Sumatera Selatan" })
    ).toBeVisible();
    await expect(
      page.locator(".location__multi-value__label").filter({ hasText: "Australia" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Hapus Australia", exact: true }).click();
    await save();
    await expect(notifications).toContainText("tersimpan");
    await notifications.getByRole("button", { name: "Tutup pemberitahuan" }).click();
    await page.reload();
    await expect(
      page.locator(".location__multi-value__label").filter({ hasText: "Australia" })
    ).toHaveCount(0);
    await expect(
      page.locator(".location__multi-value__label").filter({ hasText: "Indonesia" })
    ).toBeVisible();
    await page.getByRole("button", { name: "Konfirmasi profil masih benar" }).click();
    await expect(notifications).toContainText("Profil dikonfirmasi");
    await expect(notifications.locator("[data-sonner-toast]")).toHaveCSS("opacity", "1");
    const toastBox = await notifications.locator("[data-sonner-toast]").boundingBox();
    expect(toastBox?.y).toBeGreaterThan(64);
    expect(toastBox?.y).toBeLessThan(150);
    await page.screenshot({ path: "test-results/profile-feedback.png", fullPage: true });
  } finally {
    await context.close().catch(() => {});
  }
});
