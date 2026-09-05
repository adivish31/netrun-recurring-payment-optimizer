/**
 * NetRun — generated monochrome glyphs.
 *
 * EVERY mark in here is drawn from scratch as SVG paths. No bank, card-network,
 * PSP or regulator logo files are embedded anywhere in this project, and none
 * should be: displaying them next to results would imply an endorsement that
 * does not exist. The only third-party name on the site is the factual text
 * attribution "Razorpay AI Buildathon · Track 03".
 *
 * The actors in the diagrams are therefore represented by neutral glyphs that
 * mean "a customer", "a bank", "a calendar date" — not by anyone's brand.
 */

export function NetRunMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  // The product in one glyph: a bounded window, three candidate slots inside
  // it, and only the last one spent. Skipped attempts are hollow.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="NetRun"
    >
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path d="M8 20.5 H24" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="10.5" cy="20.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="20.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="21.5" cy="20.5" r="3.1" fill="currentColor" />
      <path
        d="M10.5 14.5 C 13 9.5, 19 9.5, 21.5 13.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

/** A person. Stands for "the customer", not any particular brand's user. */
export function CustomerGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20.5 C 4.5 15.8, 8 13.6, 12 13.6 C 16 13.6, 19.5 15.8, 19.5 20.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A columned building. Stands for "a bank" generically. */
export function BankGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M3 9.5 L12 4 L21 9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 9.5 V19 M9.7 9.5 V19 M14.3 9.5 V19 M19 9.5 V19" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 20.5 H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A calendar. Stands for "a date the money is likely to be there". */
export function CalendarGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 10.5 H20.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3.5 V7 M16 3.5 V7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="15.5" r="2" fill="currentColor" />
    </svg>
  );
}

/** A rupee coin. Stands for "the money", with no issuer implied. */
export function MoneyGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 8 H15 M9 11 H15 M9 8 C 13 8, 13.5 11, 9 11 L14.5 16.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A shield. Stands for the policy gate. */
export function ShieldGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 3 L20 6 V12 C 20 16.5, 16.5 19.8, 12 21.3 C 7.5 19.8, 4 16.5, 4 12 V6 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M8.6 12.2 L11 14.6 L15.4 10.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A small chip standing for the model. Not a vendor mark. */
export function ModelGlyph({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="7" y="7" width="10" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M10 7 V4 M14 7 V4 M10 17 V20 M14 17 V20 M7 10 H4 M7 14 H4 M17 10 H20 M17 14 H20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
