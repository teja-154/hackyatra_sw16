import { test, expect } from '@playwright/test';

test.describe('COC-Sync Civic Platform E2E', () => {
  // Use a constant phone and ward for testing
  const testPhone = '9998887776';
  const testWard = 'Ward 18 - Maddilapalem';
  const testDescription = 'E2E Test: Massive pothole causing heavy traffic jams on the main road.';

  test('Citizen can submit a complaint successfully', async ({ page }) => {
    // Navigate to citizen portal
    await page.goto('http://localhost:5173/');
    
    // Fill the description
    await page.fill('textarea[placeholder*="E.g., Large pothole"]', testDescription);
    
    // Select Ward
    await page.selectOption('select', testWard);
    
    // Fill phone number
    await page.fill('input[type="tel"]', testPhone);
    
    // Simulate getting location
    // Intercept geolocation API or simply mock the position in Playwright if possible,
    // but the app handles 'Finding location...' on click. 
    // To simplify the test, we'll use a mocked location script before the click.
    await page.evaluate(() => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: 17.73, longitude: 83.32 } });
      };
    });
    
    // Click Get GPS Location
    await page.click('button:has-text("Get GPS Location")');
    
    // Wait for location to be captured
    await expect(page.locator('text=Location captured')).toBeVisible();
    
    // Submit the form
    await page.click('button[type="submit"]');
    
    // Expect success screen
    await expect(page.locator('text=Issue Reported!')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Tracking ID')).toBeVisible();
    
    // The assigned department should be visible (e.g. Roads & Engineering or GVMC General)
    await expect(page.locator('text=assigned to')).toBeVisible();
  });

  test('COC Dashboard shows live alerts and detail panel', async ({ page }) => {
    // Navigate to COC dashboard
    await page.goto('http://localhost:5173/coc');
    
    // Wait for alerts to load
    await expect(page.locator('text=Live Alerts')).toBeVisible();
    
    // Wait for at least one alert to be rendered in the left feed
    const firstAlert = page.locator('.col-span-3 .flex-1 > div.cursor-pointer').first();
    await expect(firstAlert).toBeVisible({ timeout: 10000 });
    
    // Click the first alert
    await firstAlert.click();
    
    // Wait for the detail panel to open
    await expect(page.locator('text=Incident Detail')).toBeVisible();
    
    // Check if timeline or reports section is visible
    await expect(page.locator('text=Timeline')).toBeVisible();
    
    // Close the detail panel
    await page.locator('button:has(svg.lucide-x)').click();
    
    // Search functionality test
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill(testWard); // Should filter down to incidents in the test ward
    
    // Ensure the feed still has items or shows no matches
    // But since we just added one in the previous test, it should be there.
  });
});
