import type { Page } from "@playwright/test";

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
