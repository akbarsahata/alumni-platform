import type { BrowserContext, Page } from "@playwright/test";

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

export async function reloadReady(page: Page) {
  const response = await page.reload();
  await page.locator('body[data-hydrated="true"]').waitFor();
  return response;
}
