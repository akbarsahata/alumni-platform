import type { BrowserContext, Page } from "@playwright/test";

export async function useAccount(context: BrowserContext, account: { cookie: string }) {
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
