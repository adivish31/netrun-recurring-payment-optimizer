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

import type { ActionType } from '../types';

/** Verify BEFORE JSON.parse. Use timingSafeEqual, not ===. */
export function verifyWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
  throw new Error('not implemented — build order step 11');
}

/** Retry with backoff on 5xx. Idempotency key is passed by the caller and
 *  MUST be reused unchanged across retries (spec §38 failure 2). */
export async function executeAction(
  _action: ActionType,
  _idempotencyKey: string
): Promise<{ externalRef: string | null; status: string }> {
  throw new Error('not implemented — build order step 11');
}
