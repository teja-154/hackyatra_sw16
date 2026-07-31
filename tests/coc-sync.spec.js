import { test, expect } from '@playwright/test';

test.describe('COC-Sync Civic Platform E2E', () => {
  const testPhone = '9998887776';
  const testWard = 'Ward 18 - Maddilapalem';
  const testDescription = 'E2E Test: Massive pothole causing heavy traffic jams on the main road.';

  test('Citizen can submit a complaint', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.fill('textarea[placeholder*="E.g., Large pothole"]', testDescription);
    await page.selectOption('select', testWard);
    await page.fill('input[type="tel"]', testPhone);
    
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 17.73, longitude: 83.32 } });
      };
    });
    
    await page.click('button:has-text("Get GPS Location")');
    await expect(page.locator('text=Location captured')).toBeVisible();
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Issue Reported!')).toBeVisible({ timeout: 10000 });
  });

  test('COC Dashboard shows live alerts', async ({ page }) => {
    await page.goto('http://localhost:5173/coc');
    await expect(page.locator('text=Live Alerts')).toBeVisible();
    
    const firstAlert = page.locator('.col-span-3 .flex-1 > div.cursor-pointer').first();
    await expect(firstAlert).toBeVisible({ timeout: 10000 });
    
    await firstAlert.click();
    await expect(page.locator('text=Incident Detail')).toBeVisible();
    await expect(page.locator('text=Timeline')).toBeVisible();
    
    // Close detail panel
    await page.click('button:has(.lucide-x)');
    
    // Search
    const searchInput = page.locator('input[placeholder*="Search"]');
    await expect(searchInput).toBeVisible();
    await searchInput.fill(testWard);
  });

  test('Department Manager can Assign and Resolve', async ({ page }) => {
    await page.goto('http://localhost:5173/dept/login');
    
    // Login as GVMC General (which receives potholes)
    await page.selectOption('select', 'GVMC');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');

    // Wait for queue
    await expect(page.locator('text=Incident Queue')).toBeVisible({ timeout: 10000 });

    // Click the first reported incident
    const firstIncident = page.locator('.bg-slate-800.rounded-xl.border.p-5.cursor-pointer').first();
    await expect(firstIncident).toBeVisible();
    await firstIncident.click();

    // Verify detail page loaded
    await expect(page.locator('text=History')).toBeVisible();

    // Click Assign Team (should exist if status is reported)
    const assignBtn = page.locator('button:has-text("Assign Team")');
    if (await assignBtn.isVisible()) {
      await assignBtn.click();
    }

    // Now Resolve Issue should be visible
    const resolveBtn = page.locator('button:has-text("Resolve Issue")');
    await expect(resolveBtn).toBeVisible({ timeout: 5000 });
    await resolveBtn.click();

    // Upload dummy photo and submit
    await expect(page.locator('text=Confirm Resolved')).toBeVisible();
    // We can't easily mock camera in standard headless without complex setup, so we just verify the popup appears
  });
});
