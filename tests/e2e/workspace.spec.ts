import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

async function runSample(page: Page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/analyze") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^Investigate issue/ }).click();
  expect((await pending).ok()).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Here’s where to look." }),
  ).toBeVisible();
  expect(await page.locator(".hypothesis").count()).toBeGreaterThan(0);
  await expect(page.locator(".result-meta")).toContainText(
    "Deterministic sample",
  );
}

async function expectNoOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
}

async function openWorkspace(page: Page) {
  await page.goto("/");
  // The configuration request starts in a React effect. Its completed status
  // distinguishes the hydrated workspace from the immediately visible SSR HTML.
  await expect(page.locator(".server-status")).not.toContainText(
    "Checking server configuration",
  );
}

test("desktop: sample analysis, evidence, export, case switch, and session key", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error")
      errors.push(`${message.text()} (${message.location().url})`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const failure = `HTTP ${response.status()}: ${response.url()}`;
      errors.push(failure);
      console.error(failure);
    }
  });

  await openWorkspace(page);
  await expect(
    page.getByRole("heading", { name: "Find the why. Fix it faster." }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await runSample(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });

  await page.locator(".citations button").first().click();
  const evidenceDialog = page.locator("dialog.evidence-dialog");
  await expect(evidenceDialog).toBeVisible();
  expect(await evidenceDialog.locator(".highlighted").count()).toBeGreaterThan(
    0,
  );
  await page.getByRole("button", { name: "Close source evidence" }).click();
  await expect(evidenceDialog).not.toBeVisible();

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.md$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const brief = await readFile(downloadedPath!, "utf8");
  expect(brief).toContain("Hypotheses");
  expect(brief).toContain("demo");

  const firstTitle = await page.locator("#report-title").inputValue();
  await page.locator(".sample-card").nth(1).click();
  await expect(page.locator(".result-body")).toHaveCount(0);
  expect(await page.locator("#report-title").inputValue()).not.toBe(firstTitle);
  await runSample(page);

  await page
    .getByRole("button", { name: "Model settings", exact: true })
    .first()
    .click();
  const transientKey = `gsk_${randomUUID().replaceAll("-", "")}`;
  await page.locator("#api-key").fill(transientKey);
  await page.getByRole("button", { name: "Use Groq", exact: true }).click();
  const keyWasPersisted = await page.evaluate(
    (key) => Object.values(localStorage).some((value) => value.includes(key)),
    transientKey,
  );
  expect(keyWasPersisted).toBe(false);
  await page.reload();
  await page
    .getByRole("button", { name: "Model settings", exact: true })
    .first()
    .click();
  await expect(page.locator("#api-key")).toHaveValue("");
  await page.getByRole("button", { name: "Close model settings" }).click();
  expect(errors).toEqual([]);
});

test("mobile: 390px workspace and sample result fit without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openWorkspace(page);
  await expect(
    page.getByRole("heading", { name: "Find the why. Fix it faster." }),
  ).toBeVisible();
  await expectNoOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("mobile.png") });
  await runSample(page);
  await expectNoOverflow(page);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator(".sidebar")).toHaveClass(/is-open/);
  await page
    .getByRole("button", { name: "Case library", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "A few good mysteries." }),
  ).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});
