/**
 * NetRun — src/execute/razorpay.ts   (spec §33, §34, §35)
 *
 * REAL TEST MODE (rzp_test_ keys only):
 *   - Subscription + plan creation
 *   - "Charge as Failure" from the dashboard to emit genuine
 *     subscription.charged / subscription.halted webhooks
 *   - Webhook HMAC-SHA256 verification over the RAW body, before parsing
 *   - Payment Links as the ESCALATE action (test mode caps the count — batch
 *     volume uses the simulator)
 *
 * SIMULATED (label in code, README, dashboard and video):
 *   - timed mandate debit outcomes at volume
 *   - notification delivery and customer cancellations
 *
 * Never claim test-mode behaviour is production behaviour. Never let a
 * rzp_live_ key near this repo. Verify signatures with a constant-time compare.
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import type { ActionType } from '../types';

dotenv.config();

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
  throw new Error("STARTUP_GUARD_FAILED: RAZORPAY_KEY_ID is missing or does not start with 'rzp_test_'. Live keys are not permitted.");
}

/** Verify BEFORE JSON.parse. Use timingSafeEqual, not ===. */
export function verifyWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured');
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Compare in constant time to prevent timing attacks
  if (expectedSignature.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(signature, 'utf-8')
  );
}

// Simple sleep utility for backoff
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Mock Razorpay client behavior for testing
// In reality, this would be `import Razorpay from 'razorpay';`
export const mockRazorpayClient = {
  paymentLink: {
    create: async (params: any, options: { headers: { 'X-Idempotency-Key': string } }) => {
      // Allow injection of mocked errors
      if ((globalThis as any).__injectRazorpayError) {
        throw (globalThis as any).__injectRazorpayError();
      }
      return { id: 'plink_mock_' + crypto.randomBytes(4).toString('hex') };
    }
  }
};

/** Retry with backoff on 5xx. Idempotency key is passed by the caller and
 *  MUST be reused unchanged across retries (spec §38 failure 2). */
export async function executeAction(
  action: ActionType,
  idempotencyKey: string
): Promise<{ externalRef: string | null; status: string }> {
  let attempt = 0;
  const maxAttempts = 3;
  const baseDelayMs = 100;

  while (attempt < maxAttempts) {
    try {
      if (action === 'ESCALATE') {
        const res = await mockRazorpayClient.paymentLink.create(
          {
            amount: 1000,
            currency: 'INR',
            description: 'Escalation Payment'
          },
          { headers: { 'X-Idempotency-Key': idempotencyKey } }
        );
        return { externalRef: res.id, status: 'created' };
      }
      return { externalRef: null, status: 'skipped' }; // Other actions simulated
    } catch (error: any) {
      attempt++;
      // Check if it's a 5xx error or network error
      const is5xx = error && error.statusCode && error.statusCode >= 500 && error.statusCode < 600;
      const isNetwork = error && (!error.statusCode); // e.g. ECONNRESET

      if (is5xx || isNetwork) {
        if (attempt >= maxAttempts) {
          throw error;
        }
        await delay(baseDelayMs * Math.pow(2, attempt - 1));
      } else {
        // Do not retry 4xx or other errors
        throw error;
      }
    }
  }
  throw new Error("executeAction exceeded max attempts unexpectedly");
}
