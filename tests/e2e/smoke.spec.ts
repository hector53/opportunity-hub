import { expect, test, type Page } from "@playwright/test";

/**
 * M0 smoke flow against a running instance (dev or docker) with a seeded DB.
 * Requires E2E_PASSWORD (the APP_PASSWORD of that instance).
 * Also asserts the browser never contacts external platforms during the flow.
 */
const password = process.env.E2E_PASSWORD ?? "";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
}

test.skip(!password, "E2E_PASSWORD not set");

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/opportunities");
  await expect(page).toHaveURL(/\/login/);
});

test("import → score → pipeline → proposal, without external requests", async ({ page, baseURL }) => {
  const external: string[] = [];
  const appHost = new URL(baseURL!).host;
  page.on("request", (r) => {
    const host = new URL(r.url()).host;
    if (host !== appHost) external.push(r.url());
  });

  await login(page);
  await expect(page.getByText("Today's Priorities")).toBeVisible();

  // Manual import (Workana)
  const title = `E2E Workana SaaS ${Date.now()}`;
  await page.goto("/opportunities/new");
  await page.getByLabel("Plataforma *").selectOption("workana");
  await page.getByLabel("Enlace original").fill(`https://www.workana.com/job/e2e-${Date.now()}`);
  await page.getByLabel("Título *").fill(title);
  await page
    .getByLabel("Descripción (pega el texto de la oferta)")
    .fill("Soy el fundador de un SaaS B2B. Necesitamos un desarrollador Next.js y Node.js con PostgreSQL para un proyecto de largo plazo, 20 horas por semana, remoto. USD 40 por hora. Clone https://github.com/x/y and run npm install.");
  await page.getByRole("button", { name: "Importar y evaluar" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("Oportunidad importada y evaluada.")).toBeVisible();

  // Explainable scores + separate risk
  await expect(page.getByText("Technology / Job Fit")).toBeVisible();
  await expect(page.getByText("External repository or ZIP")).toBeVisible();

  // Pipeline
  await page.getByRole("button", { name: "Crear aplicación (Draft)" }).click();
  const moveTo = page.getByLabel("Mover a");
  await expect(moveTo).toBeVisible();
  await moveTo.selectOption("applied");
  await page.getByRole("button", { name: "Mover", exact: true }).click();
  await expect(page.getByText("Draft →", { exact: false }).first()).toBeVisible();

  // Proposal (template; no AI key in test env)
  await page.locator('select[name="mode"]').selectOption("template");
  await page.getByRole("button", { name: /Generate Proposal/ }).click();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();
  const editor = page.getByLabel("Contenido de la propuesta");
  await editor.fill((await editor.inputValue()) + "\nEditado en E2E");
  await page.getByRole("button", { name: "Guardar como v2" }).click();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();

  // "Apply" only opens a confirmation showing the destination; we cancel it.
  await page.getByRole("button", { name: "Apply en el sitio original" }).click();
  await expect(page.getByText("no enviará nada")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();

  // Discard from list
  await page.goto(`/opportunities?q=${encodeURIComponent(title)}&status=applied`);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // Cleanup: delete the test record through the UI (confirms the native dialog).
  await page.getByRole("link", { name: title }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Eliminar definitivamente/ }).click();
  await expect(page).toHaveURL(/\/opportunities$/);

  expect(external, `Unexpected external requests: ${external.join(", ")}`).toEqual([]);
});

test("filters by source and engagement", async ({ page }) => {
  await login(page);
  await page.goto("/opportunities?source=getonboard&engagement=full_time");
  await expect(page.getByRole("heading", { name: "Opportunities" })).toBeVisible();
  const badges = page.locator("tbody tr td:first-child").getByText("Get on Board");
  if ((await badges.count()) > 0) await expect(page.locator("tbody tr td:first-child").getByText("Workana")).toHaveCount(0);
});
