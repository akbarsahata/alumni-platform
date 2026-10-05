import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("primary invites a new school representative who verifies email and accepts without an alumni profile", async ({
  page,
}) => {
  const { primary } = JSON.parse(
    await readFile(`${process.env.ALUMNI_TEST_STATE}/invitations-fixture.json`, "utf8")
  );
  const vars = await readFile(process.env.ALUMNI_TEST_VARS!, "utf8");
  const key = vars
    .split("\n")
    .find((line) => line.startsWith("LOCAL_MAIL_KEY="))!
    .slice("LOCAL_MAIL_KEY=".length);
  const email = `school-browser-${crypto.randomUUID()}@example.test`;
  const [name, ...cookieValue] = primary.cookie.split("=");
  await page.context().addCookies([
    {
      name,
      value: cookieValue.join("="),
      url: "http://127.0.0.1:5173",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/admin/roles");
  await page.getByRole("link", { name: "Undang perwakilan sekolah" }).click();
  await page.getByLabel("Email penerima").fill(email);
  await page.getByLabel("Peran sekolah").selectOption("student");
  await page.getByLabel("Alasan undangan").fill("Penunjukan siswa untuk uji browser");
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByRole("status")).toContainText("Undangan telah dikirim.");
  const invitationPath = await page
    .getByRole("link", { name: "Tautan undangan" })
    .getAttribute("href");
  const mail = await (
    await page.request.get(`/__local/mail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).json();
  expect(mail.text).toContain(invitationPath);
  await page.context().clearCookies();
  await page.goto(invitationPath!);
  await expect(page.getByRole("button", { name: "Terima undangan" })).toHaveCount(0);
  await page.getByRole("link", { name: "Masuk dengan kode email" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Kirim kode", exact: true }).click();
  await expect(page.getByLabel("Kode masuk")).toBeVisible();
  const otpMail = await (
    await page.request.get(`/__local/mail?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
  ).json();
  await page.getByLabel("Kode masuk").fill(otpMail.text.match(/\b\d{6}\b/)[0]);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${invitationPath}$`));
  await expect(page.getByText("Peran: Perwakilan siswa")).toBeVisible();
  await page.getByRole("button", { name: "Terima undangan" }).click();
  await expect(page.getByRole("status")).toContainText("Undangan telah diterima.");
  const access = await (await page.request.get("/api/access")).json();
  expect(access.roles).toEqual(["student"]);
  expect(access.membership.status).toBe("none");
  expect(access.permissions.directory).toBe(false);
  expect(access.permissions.finance).toBe(false);
  expect(access.permissions.endorse).toBe(false);
  await page.reload();
  await expect(page.getByRole("button", { name: "Terima undangan" })).toHaveCount(0);
});
