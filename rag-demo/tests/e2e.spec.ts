import { test, expect } from '@playwright/test';

const STAGES = 9;

async function walkPipeline(page: any, nextLabel = 'Next') {
  const nextButton = page.getByRole('button', { name: nextLabel });
  for (let i = 0; i < STAGES; i += 1) {
    await nextButton.click();
  }
}

test('runs_full_pipeline_en', async ({ page }) => {
  await page.goto('/');
  await walkPipeline(page);
  const citations = page.locator('[data-testid^="citation-"]');
  await expect(citations).toHaveCount(4);
  await expect(page.getByText('disciplined Scrum loop')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('burndown chart shows a mid-week spike')).toBeVisible({ timeout: 8000 });
  await expect(citations.first()).toContainText('Confluence / Engineering');
});

test('toggle_rerank_off_changes_top_citation', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Cohere rerank').uncheck();
  await walkPipeline(page);
  const citations = page.locator('[data-testid^="citation-"]');
  await expect(citations).toHaveCount(4);
  await expect(citations.first()).toContainText('Intranet / Blogs · Internal blog: Estimation pitfalls');
});

test('toggle_vision_off_removes_pdf_insight', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Vision').uncheck();
  await walkPipeline(page);
  await expect(page.getByText('visual anomaly is omitted')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('burndown chart')).toHaveCount(0);
});
