/**
 * NetRun — src/eval/pdn.ts
 *
 * Shared PDN commitment logic. Used by both eval/run.ts and schedule/optimizer.ts.
 * A notification must be sent PDN_MIN_LEAD_HOURS before the debit; once sent,
 * it is COMMITTED regardless of whether the debit fires.
 *
 * CLUSTERED schedules (e.g. day-1 early/midday/late) require all PDNs to be
 * sent before any outcome is known. SPACED schedules (e.g. T+1, T+3, T+7)
 * allow sequential commitment and early exit.
 */

import type { Slot, ISODate, WindowName } from '../types';
import { PDN_MIN_LEAD_HOURS, PDN_EXEMPT_MCC } from '../config/rules';

function daysBetween(d1: string, d2: string): number {
  const y1 = (d1.charCodeAt(0) - 48) * 1000 + (d1.charCodeAt(1) - 48) * 100 + (d1.charCodeAt(2) - 48) * 10 + (d1.charCodeAt(3) - 48);
  const m1 = (d1.charCodeAt(5) - 48) * 10 + (d1.charCodeAt(6) - 48);
  const day1 = (d1.charCodeAt(8) - 48) * 10 + (d1.charCodeAt(9) - 48);
  const y2 = (d2.charCodeAt(0) - 48) * 1000 + (d2.charCodeAt(1) - 48) * 100 + (d2.charCodeAt(2) - 48) * 10 + (d2.charCodeAt(3) - 48);
  const m2 = (d2.charCodeAt(5) - 48) * 10 + (d2.charCodeAt(6) - 48);
  const day2 = (d2.charCodeAt(8) - 48) * 10 + (d2.charCodeAt(9) - 48);
  
  const totalDays1 = (y1 * 12 * 28) + (m1 * 28) + day1;
  const totalDays2 = (y2 * 12 * 28) + (m2 * 28) + day2;
  return totalDays2 - totalDays1;
}

export function getAttemptHour(dueDate: string, slotDate: string, window: 'early' | 'midday' | 'late' | string): number {
  const days = daysBetween(dueDate, slotDate);
  let hour = days * 24;
  if (window === 'early') hour += 0;
  else if (window === 'midday') hour += 13;
  else if (window === 'late') hour += 21.5;
  return hour;
}

/**
 * Count the number of PDNs that must be COMMITTED given a schedule and
 * a resolution point (the hour at which the schedule's outcome is determined).
 *
 * A PDN must be sent PDN_MIN_LEAD_HOURS before the attempt. If the send-hour
 * is <= the resolution-hour, the PDN is committed (paid for) regardless of
 * whether the attempt actually fires.
 *
 * @param slots - The slots in the schedule
 * @param dueDate - The cycle's due date
 * @param resolutionHour - The hour at which the outcome is determined
 *                         (Infinity if no slot succeeds)
 * @param mcc - The mandate's MCC (PDN-exempt MCCs pay 0 PDNs)
 */
export function countCommittedPdns(
  slots: Slot[],
  dueDate: ISODate,
  resolutionHour: number,
  mcc: string,
): number {
  if (PDN_EXEMPT_MCC.value.includes(mcc)) return 0;

  const leadHours = PDN_MIN_LEAD_HOURS.value;
  let count = 0;
  for (const slot of slots) {
    const attemptHour = getAttemptHour(dueDate, slot.date, slot.window);
    const sendHour = attemptHour - leadHours;
    if (sendHour <= resolutionHour) {
      count++;
    }
  }
  return count;
}
