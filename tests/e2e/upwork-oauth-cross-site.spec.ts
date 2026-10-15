import { expect, test, type Page } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
}

test.skip(!password, "E2E_PASSWORD not set");

test("cross-site OAuth redirect reaches the callback without sending oh_session", async ({ page, baseURL }) => {
  await login(page);
  const prepare = await page.evaluate(async () => {
    const response = await fetch("/api/connectors/upwork/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: window.location.origin },
      credentials: "same-origin",
    });
    return { status: response.status, body: (await response.json()) as { authorizationUrl?: string; error?: string } };
  });
  expect(prepare.status, prepare.body.error).toBe(200);
  expect(prepare.body.authorizationUrl).toContain("www.upwork.com");
  const callbackUrl = new URL("/api/connectors/upwork/callback?error=access_denied", baseURL).toString();
  let callbackResponse: { status: () => number; headers: () => Record<string, string> } | undefined;
  page.on("response", (response) => {
    if (response.url().startsWith(new URL("/api/connectors/upwork/callback", baseURL).toString())) callbackResponse = response;
  });

  // The route is synthetic: the browser still has www.upwork.com as its initiating site,
  // but no real Upwork page or credential is contacted.
  await page.route("https://www.upwork.com/oauth-test", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<a href="${callbackUrl}">return from Upwork</a>`,
    });
  });
  await page.goto("https://www.upwork.com/oauth-test");
  await page.getByRole("link", { name: "return from Upwork" }).click();

  await expect.poll(() => callbackResponse?.status() ?? 0).toBe(307);
  expect(callbackResponse?.status()).not.toBe(401);
  expect(callbackResponse?.headers().location).toMatch(/\/sources\?upwork=oauth_denied/);
});
