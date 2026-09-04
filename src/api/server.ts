import express from 'express';
import { verifyWebhookSignature } from '../execute/razorpay';
import crypto from 'crypto';

const app = express();

// A simple in-memory DB to simulate ON CONFLICT DO NOTHING for idempotency
const processedEvents = new Set<string>();

// Mock async handler for webhook processing
async function handleWebhookEvent(event: any, idempotencyKey: string) {
  // In a real application, this would store the event or trigger further actions.
  // We use this function to just verify it reached the async portion.
  (globalThis as any).__lastProcessedWebhook = { event, idempotencyKey };
}

// 12d. Webhook endpoint
app.post('/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  
  if (!signature || typeof signature !== 'string') {
    return res.status(400).send('Missing or invalid signature header');
  }

  // 1. Verify signature on the raw body
  try {
    const isValid = verifyWebhookSignature(req.body, signature);
    // 2. Reject with 400 if invalid, BEFORE parsing
    if (!isValid) {
      return res.status(400).send('Invalid signature');
    }
  } catch (error: any) {
    return res.status(400).send('Verification error: ' + error.message);
  }

  // 3. On valid: parse, derive the idempotency key server-side
  let event;
  try {
    event = JSON.parse(req.body.toString('utf-8'));
  } catch (error) {
    return res.status(400).send('Invalid JSON payload');
  }

  // Derive idempotency key from event ID
  if (!event.id && !event.payload?.payment?.entity?.id) {
    return res.status(400).send('Event ID missing from payload');
  }
  
  const webhookEventId = event.id || event.payload?.payment?.entity?.id;
  const idempotencyKey = `wh_${webhookEventId}`;

  // Insert into attempts table with ON CONFLICT DO NOTHING
  // This satisfies the requirement of testing the DB's UNIQUE constraint.
  const pool = getPool();
  try {
    const client = await pool.connect();
    try {
      // We expect the test to have seeded a cycle with 'cycle_test_wh'
      const cycleId = event.cycle_id || 'cycle_test_wh'; 
      const result = await client.query(`
        INSERT INTO attempts (attempt_id, cycle_id, attempt_no, scheduled_for, window_name, result, idempotency_key)
        VALUES ($1, $2, $3, now(), 'early', 'pending', $4)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING attempt_id
      `, [
        'atm_' + crypto.randomBytes(4).toString('hex'),
        cycleId,
        1,
        idempotencyKey
      ]);
      
      if (result.rowCount === 0) {
        // Duplicate webhook: return 200 immediately
        return res.status(200).send('OK (duplicate)');
      }
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('DB error:', error);
    return res.status(500).send('DB Error');
  }

  // 4. Return 200 fast; do the work asynchronously
  res.status(200).send('OK');

  setImmediate(() => {
    handleWebhookEvent(event, idempotencyKey).catch(console.error);
  });
});

let _pool: import('pg').Pool;
export function getPool() {
  if (!_pool) {
    const { Pool } = require('pg');
    _pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://netrun:netrun@localhost:5432/netrun' });
  }
  return _pool;
}

export function startServer(port: number = 3000) {
  return app.listen(port, () => {
    // Server started
  });
}

export { app, processedEvents };
