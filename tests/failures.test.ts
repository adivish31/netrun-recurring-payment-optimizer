import { test, describe, before, beforeEach, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { app, processedEvents, startServer } from '../src/api/server';
import { verifyWebhookSignature, executeAction, mockRazorpayClient } from '../src/execute/razorpay';
import crypto from 'crypto';

describe('Task 12: Failure Injection', () => {
  const secret = 'test_secret_123';
  let server: http.Server;
  let port: number;
  
  let pool: import('pg').Pool;

  before(async () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    process.env.RAZORPAY_KEY_ID = 'rzp_test_123456';
    
    const { getPool } = require('../src/api/server');
    pool = getPool();
    
    // Seed DB for the attempts insert
    const client = await pool.connect();
    try {
      await client.query(`INSERT INTO mandates (mandate_id, customer_id, amount_paise, mcc, category, status, created_on, cycle_day) VALUES ('mdt_test_wh', 'cust_test_wh', 1000, '5969', 'general', 'active', '2026-01-01', 1) ON CONFLICT DO NOTHING`);
      await client.query(`INSERT INTO cycles (cycle_id, mandate_id, cycle_no, due_date) VALUES ('cycle_test_wh', 'mdt_test_wh', 1, '2026-01-01') ON CONFLICT DO NOTHING`);
    } finally {
      client.release();
    }
    
    return new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  after(() => {
    server.close();
    pool.end();
  });

  beforeEach(async () => {
    processedEvents.clear();
    (globalThis as any).__lastProcessedWebhook = null;
    (globalThis as any).__injectRazorpayError = null;
    await pool.query('DELETE FROM attempts WHERE cycle_id = $1', ['cycle_test_wh']);
  });

  function signPayload(payload: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  function makeRequest(path: string, method: string, headers: any, body: string): Promise<{ status: number, body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode || 500, body: data }));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  test('1. DUPLICATE WEBHOOK: Deliver identical signed payload 10 times concurrently', async () => {
    const payload = JSON.stringify({ id: 'evt_123', event: 'subscription.charged' });
    const signature = signPayload(payload);

    // Concurrency variant: fire all 10 in parallel using Promise.all
    const requests = Array.from({ length: 10 }).map(() =>
      makeRequest('/webhooks/razorpay', 'POST', {
        'x-razorpay-signature': signature,
        'Content-Type': 'application/json'
      }, payload)
    );

    const responses = await Promise.all(requests);
    
    // Assert exactly ONE attempt row exists in the real DB
    const res = await pool.query('SELECT count(*) FROM attempts WHERE idempotency_key = $1', ['wh_evt_123']);
    const rowCount = parseInt(res.rows[0].count, 10);
    
    console.log(`\nDuplicate webhook test: delivered 10 times concurrently.`);
    console.log(`Query result for idempotency_key = wh_evt_123: ${rowCount}`);

    assert.strictEqual(rowCount, 1);
    assert.strictEqual(responses.every(r => r.status === 200), true);
  });

  test('2. 5xx MID-EXECUTION: Mock Razorpay 500 twice then 200', async () => {
    let callCount = 0;
    const idempotencyKeysUsed: string[] = [];

    // Override mock to intercept calls and capture idempotency key
    const originalCreate = mockRazorpayClient.paymentLink.create;
    mockRazorpayClient.paymentLink.create = async (params: any, options: { headers: { 'X-Idempotency-Key': string } }) => {
      callCount++;
      idempotencyKeysUsed.push(options.headers['X-Idempotency-Key']);
      
      if (callCount <= 2) {
        const err = new Error('Razorpay 500');
        (err as any).statusCode = 500;
        throw err;
      }
      return { id: 'plink_success' };
    };

    const idempotencyKey = 'idk_test_5xx';
    
    const res = await executeAction('ESCALATE', idempotencyKey);
    
    console.log(`\n5xx Mid-Execution test:`);
    console.log(`Call count: ${callCount}`);
    console.log(`Result status: ${res.status}`);
    idempotencyKeysUsed.forEach((key, idx) => {
      console.log(`Key sent on call ${idx + 1}: ${key}`);
    });

    assert.strictEqual(callCount, 3); // 2 failures + 1 success
    assert.strictEqual(res.externalRef, 'plink_success');
    assert.strictEqual(idempotencyKeysUsed[0], idempotencyKey);
    assert.strictEqual(idempotencyKeysUsed[1], idempotencyKey);
    assert.strictEqual(idempotencyKeysUsed[2], idempotencyKey);

    // Restore mock
    mockRazorpayClient.paymentLink.create = originalCreate;
  });

  test('3. MALFORMED BODY: Fails signature verification', async () => {
    const payload = 'this is not valid json';
    const signature = signPayload(payload + '_invalid'); // Invalid signature

    const response = await makeRequest('/webhooks/razorpay', 'POST', {
      'x-razorpay-signature': signature,
      'Content-Type': 'application/json'
    }, payload);

    console.log(`\nMalformed Body test:`);
    console.log(`Response status: ${response.status}`);
    console.log(`Response body: ${response.body}`);
    
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body, 'Invalid signature');
    assert.strictEqual(processedEvents.size, 0); // Never reached parsing or DB
  });

  test('4. TAMPERED BODY: Alter one byte, keep signature', async () => {
    const payload = JSON.stringify({ id: 'evt_123', amount: 1000 });
    const validSignature = signPayload(payload);

    // Alter body slightly (change 1000 to 2000)
    const tamperedPayload = payload.replace('1000', '2000');

    const response = await makeRequest('/webhooks/razorpay', 'POST', {
      'x-razorpay-signature': validSignature, // Use original valid signature
      'Content-Type': 'application/json'
    }, tamperedPayload);

    console.log(`\nTampered Body test:`);
    console.log(`Response status: ${response.status}`);
    
    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.body, 'Invalid signature');
  });

  test('5. STARTUP KEY GUARD: Live-looking key is rejected', () => {
    console.log(`\nStartup key guard test:`);
    
    const origEnv = process.env.RAZORPAY_KEY_ID;
    
    try {
      // Simulate live key
      process.env.RAZORPAY_KEY_ID = 'rzp_live_abc123';
      
      // We'll dynamically require or re-require the module to trigger the startup guard
      // Since Node caches modules, we delete it from cache first
      delete require.cache[require.resolve('../src/execute/razorpay')];
      
      let threw = false;
      try {
        require('../src/execute/razorpay');
      } catch (err: any) {
        threw = true;
        console.log(`Caught error on startup: ${err.message}`);
        assert.match(err.message, /STARTUP_GUARD_FAILED/);
      }
      
      assert.strictEqual(threw, true);
    } finally {
      // Restore
      process.env.RAZORPAY_KEY_ID = origEnv;
      delete require.cache[require.resolve('../src/execute/razorpay')];
      require('../src/execute/razorpay'); // re-require with good key to avoid breaking later tests
    }
  });

  test('6. LIVE TEST MODE VERIFICATION', () => {
    console.log(`\nLIVE TEST MODE VERIFICATION:`);
    console.log(`SIMULATED: We are running in an environment without a live business test account configured.`);
    console.log(`The webhook payloads tested above are self-signed Razorpay-shaped payloads using the exact HMAC-SHA256 logic required for production.`);
  });
});
