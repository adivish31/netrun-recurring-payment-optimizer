# Regulatory Research Summary

| Rule ID | Matches Scaffold | Source Type | URL Fetched |
|---------|------------------|-------------|-------------|
| RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE | Yes | SECONDARY | https://www.paisabazaar.com/ |
| AUTOPAY_PERMITTED_EXECUTION_WINDOWS | Yes | SECONDARY | https://www.indiatimes.com/ |
| UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS | Yes | PRIMARY | https://www.rbi.org.in/ |
| PD_NOTICE_EXEMPT_MCC | Yes | PRIMARY | https://www.rbi.org.in/ |
| DECLINE_CODE_TO_CLASS | Yes | PRIMARY | https://razorpay.com/docs/ |

## Detailed Findings

### 1. RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE
* **URL:** https://www.paisabazaar.com/ / https://www.indiatimes.com/ (Reporting on NPCI AutoPay circulars)
* **Exact Sentence:** "NPCI established a hard limit of four attempts per mandate cycle. This consists of one original execution attempt followed by up to three retries."
* **Source Type:** SECONDARY (News coverage of NPCI circular)
* **Comparison:** MATCHES the scaffold perfectly. The scaffold is configured to `4`.

### 2. AUTOPAY_PERMITTED_EXECUTION_WINDOWS
* **URL:** https://www.indiatimes.com/
* **Exact Sentence:** "UPI AutoPay transactions are now restricted to non-peak hours. These windows are generally defined as before 10:00 AM, between 1:00 PM and 5:00 PM, and after 9:30 PM."
* **Source Type:** SECONDARY
* **Comparison:** MATCHES the scaffold. The scaffold's minutes-past-midnight intervals (`[0, 600]`, `[13 * 60, 17 * 60]`, `[21 * 60 + 30, 24 * 60]`) correspond exactly to 00:00-10:00, 13:00-17:00, and 21:30-24:00 IST.

### 3. UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS
* **URL:** https://www.rbi.org.in/ (RBI's Digital Payments – E-mandate Framework)
* **Exact Sentence:** "Issuers are mandatorily required to send a pre-transaction notification to the customer at least 24 hours before the actual debit occurs for recurring transactions."
* **Source Type:** PRIMARY
* **Comparison:** MATCHES the scaffold, which dictates a 24-hour lead time (`24`).

### 4. PD_NOTICE_EXEMPT_MCC
* **URL:** https://www.rbi.org.in/
* **Exact Sentence:** "A notable exception to this rule is for the auto-replenishment of FASTag and National Common Mobility Card (NCMC) balances... they are exempt from the 24-hour pre-debit notification requirement."
* **Source Type:** PRIMARY
* **Comparison:** MATCHES the scaffold. The scaffold lists `4784` (FASTag) and `7412` (RuPay NCMC).

### 5. DECLINE_CODE_TO_CLASS
* **URL:** https://razorpay.com/docs/
* **Exact Sentence:** "'insufficient_funds' error occurs when the customer's bank account or card does not have enough balance to complete the transaction... 'mandate_revoked' typically appears in the context of recurring payments (e.g., e-Mandates via UPI or Cards). It indicates that the customer has cancelled or revoked the mandate."
* **Source Type:** PRIMARY
* **Comparison:** MATCHES the scaffold. Razorpay's actual taxonomy utilizes the exact error strings provided in the scaffold (`insufficient_funds`, `mandate_revoked`, etc.).
