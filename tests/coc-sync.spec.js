import { test, expect } from '@playwright/test';
import path from 'path';
require('dotenv').config();

// CRITICAL: Always use the test DB — NEVER the demo DB
const TEST_MONGO_URI = process.env.MONGODB_TEST_URI || process.env.MONGODB_URI;

test.describe.serial('COC-Sync Core Verification Pass', () => {
  const testPhone = '9998887776';
  const testWard = 'Ward 18 - Maddilapalem';
  const testDescription = 'Massive pothole on the main road causing danger.';
  const lat = 17.73;
  const lng = 83.32;
  
  let incidentId = null;
  let deptToken = null;

  test('1. Citizen submits report with photo -> Confirm real Groq classification', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.fill('textarea[placeholder*="E.g., Large pothole"]', testDescription);
    await page.selectOption('select', testWard);
    await page.fill('input[type="tel"]', testPhone);
    
    await page.setInputFiles('input[type="file"]', path.join(__dirname, 'dummy.jpg'));
    
    await page.evaluate(({ lat, lng }) => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: lat, longitude: lng } });
      };
    }, { lat, lng });
    
    await page.click('button:has-text("Get GPS Location")');
    await expect(page.locator('text=Location captured')).toBeVisible();
    
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/complaints') && res.status() === 201),
      page.click('button[type="submit"]')
    ]);
    
    const responseData = await response.json();
    incidentId = responseData.id;
    expect(incidentId).toBeTruthy();
    
    // Asserts real Groq ran successfully because fallback sets ai_failed to true
    expect(responseData.ai_failed).toBe(false);
    await expect(page.locator('text=Issue Reported!')).toBeVisible({ timeout: 10000 });
  });

  test('2. Spatial merging: Second signal within 300m merges into same incident', async ({ page }) => {
    await page.waitForTimeout(2000);
    await page.goto('http://localhost:5173/');
    await page.fill('textarea[placeholder*="E.g., Large pothole"]', 'Another report about the same pothole here.');
    await page.selectOption('select', testWard);
    await page.fill('input[type="tel"]', testPhone);
    
    await page.evaluate(({ lat, lng }) => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: lat + 0.0001, longitude: lng + 0.0001 } });
      };
    }, { lat, lng });
    
    await page.click('button:has-text("Get GPS Location")');
    await expect(page.locator('text=Location captured')).toBeVisible();
    
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/complaints') && res.status() === 201),
      page.click('button[type="submit"]')
    ]);
    
    const responseData = await response.json();
    expect(responseData.id).toBe(incidentId);
    expect(responseData.occurrence_count).toBeGreaterThanOrEqual(2);
  });

  test('2.5 Category mismatch protection: Garbage signal 50m away creates NEW incident', async ({ page }) => {
    await page.goto('http://localhost:5173/');
    await page.fill('textarea[placeholder*="E.g., Large pothole"]', 'Massive garbage pile dumped near the corner.'); // 'garbage' category
    await page.selectOption('select', testWard);
    await page.fill('input[type="tel"]', testPhone);
    
    // 50m away
    await page.evaluate(({ lat, lng }) => {
      navigator.geolocation.getCurrentPosition = (success) => {
        success({ coords: { latitude: lat + 0.0005, longitude: lng + 0.0005 } });
      };
    }, { lat, lng });
    
    await page.click('button:has-text("Get GPS Location")');
    await expect(page.locator('text=Location captured')).toBeVisible();
    
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/complaints') && res.status() === 201),
      page.click('button[type="submit"]')
    ]);
    
    const responseData = await response.json();
    

    // It should NOT merge. Must return a different incident ID.
    expect(responseData.id).not.toBe(incidentId);
    expect(responseData.occurrence_count).toBeGreaterThanOrEqual(1);
    expect(responseData.category).toBe('garbage');
  });

  test('3. Dept Login & Optimistic Lock: Second accept attempt returns 409', async ({ page, request }) => {
    await page.goto('http://localhost:5173/dept/login');
    await page.selectOption('select', 'GVMC');
    await page.fill('input[type="password"]', '1234');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Incident Queue')).toBeVisible({ timeout: 10000 });
    
    deptToken = await page.evaluate(() => localStorage.getItem('coc_token'));
    expect(deptToken).toBeTruthy();

    const acceptRes = await request.post(`http://localhost:3001/api/incidents/${incidentId}/accept`, {
      headers: { 'Authorization': `Bearer ${deptToken}` }
    });
    // It might be 200 if not auto-assigned, or 409 if the auto-assigner already picked it up.
    // In either case, the state transitions to 'assigned'.
    expect([200, 409]).toContain(acceptRes.status());

    const secondAcceptRes = await request.post(`http://localhost:3001/api/incidents/${incidentId}/accept`, {
      headers: { 'Authorization': `Bearer ${deptToken}` }
    });
    // The second attempt MUST fail with 409 (Optimistic lock prevents accepting an already assigned incident)
    expect(secondAcceptRes.status()).toBe(409);
  });

  test('4. Resolution photo upload triggers AI verification', async ({ request }) => {
    const resolveRes = await request.post(`http://localhost:3001/api/incidents/${incidentId}/resolve`, {
      headers: { 'Authorization': `Bearer ${deptToken}` },
      data: { photoUrl: 'http://example.com/dummy.jpg' }
    });
    expect(resolveRes.status()).toBe(200);
    const incidentData = await resolveRes.json();
    expect(['resolved_verified', 'disputed']).toContain(incidentData.status);
  });

  test('5. Citizen status lookup returns full timeline', async ({ page }) => {
    await page.goto('http://localhost:5173/track');
    
    const searchInput = page.locator('input[type="text"]');
    await searchInput.fill(incidentId);
    await searchInput.press('Enter');

    await expect(page.locator('text=Status Timeline')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Merged with existing incident')).toBeVisible();

    const timelineItems = page.locator('.border-l-2 > div');
    expect(await timelineItems.count()).toBeGreaterThan(1);
  });

  test('6. Double-submit idempotency: Concurrent requests yield only 1 incident', async ({ request }) => {
    // Generate a fresh idempotency key
    const idempotencyKey = require('crypto').randomUUID();
    const payload = {
      description: 'Water leak on main street',
      phone: '9988776655',
      ward: 'Ward 1 - Gajuwaka',
      lat: 17.7,
      lon: 83.3,
      idempotency_key: idempotencyKey,
    };

    // Fire two identical POST requests concurrently
    const [res1, res2] = await Promise.all([
      request.post('http://localhost:3001/api/complaints', { data: payload }),
      request.post('http://localhost:3001/api/complaints', { data: payload })
    ]);

    // One should be 201 (Created), the other 200 (OK / Duplicate)
    const statuses = [res1.status(), res2.status()].sort();
    expect(statuses).toEqual([200, 201]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Both should return the EXACT SAME incident ID
    expect(data1.id).toBe(data2.id);

    // Verify exactly one signal in DB for this idempotency key
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(TEST_MONGO_URI);
    await client.connect();
    const db = client.db();
    const signalCount = await db.collection('signals').countDocuments({ idempotencyKey });
    expect(signalCount).toBe(1);
    await client.close();
  });

  test('7. SLA Breach Auto-Escalation: Incident priority jumps when SLA violated', async ({ request }) => {
    // 1. Create a fresh incident - use random coords to prevent merging with previous test runs
    const payload = {
      description: 'Fallen tree blocking the road',
      phone: '9988776655',
      ward: 'Ward 8 - Seethammadhara',
      lat: 17.7 + (Math.random() * 0.1),
      lon: 83.3 + (Math.random() * 0.1),
      idempotency_key: require('crypto').randomUUID(),
    };
    const createRes = await request.post('http://localhost:3001/api/complaints', { data: payload });
    expect(createRes.status()).toBe(201);
    const incidentData = await createRes.json();
    const newIncidentId = incidentData.id;

    // Fetch initial score from DB
    const { MongoClient, ObjectId } = require('mongodb');
    const client = new MongoClient(TEST_MONGO_URI);
    await client.connect();
    const db = client.db();
    let initialIncident = await db.collection('incidents').findOne({ _id: new ObjectId(newIncidentId) });
    const initialScore = initialIncident.priorityScore;

    // 2. Modify createdAt in DB to simulate 6 hours ago
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    await db.collection('incidents').updateOne(
      { _id: new ObjectId(newIncidentId) },
      { $set: { createdAt: sixHoursAgo } }
    );
    await client.close();

    // 3. Trigger SLA Checker Endpoint
    const slaRes = await request.post('http://localhost:3001/api/test/sla-check');
    expect(slaRes.status()).toBe(200);

    // 4. Verify priority jumped and slaBreached is true by querying DB
    await client.connect();
    const finalIncident = await db.collection('incidents').findOne({ _id: new ObjectId(newIncidentId) });
    await client.close();
    
    expect(finalIncident.slaBreached).toBe(true);
    expect(finalIncident.priorityScore).toBeGreaterThan(initialScore);
  });
});

