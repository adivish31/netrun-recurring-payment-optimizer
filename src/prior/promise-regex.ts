/**
 * NetRun — src/prior/promise-regex.ts   (spec §19)
 *
 * Deterministic promise-date extraction using regexes.
 * This is the BASELINE the LLM is measured against in a later task.
 * Required, not optional.
 *
 * Extracts promised_day_of_month from free-text (typically Hinglish)
 * customer replies. Returns null if no date is found.
 *
 * Patterns handled:
 *   - "5 tareekh" / "5 tarikh" / "5 ko" / "5 date"
 *   - "5th", "15th"
 *   - Hindi numerals (१-२८)
 *   - Bare numbers 1-28 at word boundaries
 */

// Hindi digit mapping
const HINDI_DIGITS: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
};

function hindiToArabic(s: string): string {
  return s.replace(/[०-९]/g, (ch) => HINDI_DIGITS[ch] ?? ch);
}

/**
 * Extract a promised day-of-month (1-28) from reply text.
 * Returns null if no plausible date is found.
 *
 * This is the deterministic baseline. The LLM fallback in a later task
 * must beat this to justify its existence.
 */
export function extractPromisedDay(text: string): number | null {
  const normalized = hindiToArabic(text.toLowerCase().trim());

  // Pattern 1: "{number} tareekh/tarikh/date/ko"
  // e.g. "5 tareekh ko", "15 tarikh", "7 ko payment"
  const dateContextPattern = /\b(\d{1,2})\s*(?:tareekh|tarikh|date|ko\b)/;
  const m1 = normalized.match(dateContextPattern);
  if (m1) {
    const day = parseInt(m1[1]!, 10);
    if (day >= 1 && day <= 28) return day;
  }

  // Pattern 2: ordinals — "5th", "15th", "1st", "2nd", "3rd"
  const ordinalPattern = /\b(\d{1,2})(?:st|nd|rd|th)\b/;
  const m2 = normalized.match(ordinalPattern);
  if (m2) {
    const day = parseInt(m2[1]!, 10);
    if (day >= 1 && day <= 28) return day;
  }

  // Pattern 3: "tak" / "ke baad" / "se pehle" with number
  // e.g. "7 tak ruko", "5 ke baad"
  const untilPattern = /\b(\d{1,2})\s*(?:tak|ke\s+baad|se\s+pehle)\b/;
  const m3 = normalized.match(untilPattern);
  if (m3) {
    const day = parseInt(m3[1]!, 10);
    if (day >= 1 && day <= 28) return day;
  }

  // Pattern 4: "next {number}" or just a bare number in context
  // Only if the text seems to be about payment/money
  const paymentContext = /(?:salary|paise|payment|amount|fund|bhej|daal|kar)/i;
  if (paymentContext.test(normalized)) {
    const bareNumber = /\b(\d{1,2})\b/;
    const m4 = normalized.match(bareNumber);
    if (m4) {
      const day = parseInt(m4[1]!, 10);
      if (day >= 1 && day <= 28) return day;
    }
  }

  return null;
}
