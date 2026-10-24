import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

// Every browser journey runs in a non-UTC locale so timestamp displays are
// exercised in the same way an Indonesian operator would see them.
export const localBrowserOptions = { locale: "id-ID", timezoneId: "Asia/Jakarta" } as const;

const localContexts = new WeakSet<BrowserContext>();

export async function useAccount(context: BrowserContext, account: { cookie: string }) {
  if (!localContexts.has(context)) {
    // Functional journeys use local UI/assets; remote fonts must not block navigation or capture.
    await context.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
      route.abort()
    );
    localContexts.add(context);
  }
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
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`[browser-error] ${error.message}`));
  return page;
}

// Navigation/load completion can precede React attaching form handlers.
export async function gotoReady(page: Page, url: string) {
  const response = await page.goto(url);
  await page.locator('body[data-hydrated="true"]').waitFor();
  return response;
}

// LocalTimestamp keeps the UTC instant in dateTime/title while showing local
// time, a short zone label and a Bahasa Indonesia relative description.
export async function expectLocalTimestamp(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toContainText("WIB");
  await expect(locator).toContainText(/yang lalu|dalam/);
  await expect(locator).toHaveAttribute("dateTime", /^\d{4}-\d{2}-\d{2}T.*Z$/);
  await expect(locator).toHaveAttribute("title", /^\d{4}-\d{2}-\d{2}T.*Z$/);
}

export async function expectNoRawTimestampText(page: Page) {
  const main = page.locator("main");
  await expect(main).not.toContainText(/\(UTC\)/);
  await expect(main).not.toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
}

export async function reloadReady(page: Page) {
  const response = await page.reload();
  await page.locator('body[data-hydrated="true"]').waitFor();
  return response;
}
