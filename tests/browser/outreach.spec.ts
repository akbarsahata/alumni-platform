import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { gotoReady } from "./app-ready";
test("coordinator selects a recipient and member declines privately on mobile", async ({
  browser,
}) => {
  const f = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/outreach-accounts.json`, "utf8")
  );
  const context = await browser.newContext();
  async function use(account: { cookie: string }) {
    await context.clearCookies();
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
    return context.newPage();
  }
  try {
    const coordinator = await use(f.coordinator);
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
    const member = await use(f.recipient);
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
    const student = await use(f.student);
    await gotoReady(student, `/school-needs/${f.needId}`);
    await expect(student.getByRole("region", { name: "Progres penjangkauan" })).toContainText(
      "Ditolak: 1"
    );
    await expect(student.locator("main")).not.toContainText("Jadwal keluarga");
  } finally {
    await context.close();
  }
});
