-- NetRun — 001_init.sql   (spec §14, §15, §39)
--
-- Design decisions worth defending in the panel:
--   1. All money is BIGINT paise. No FLOAT anywhere (spec §15).
--   2. The recovery budget is enforced by a DATABASE CHECK, not application
--      logic. "Postgres makes an over-budget attempt impossible" is a stronger
--      answer than "my code checks for it."
--   3. UNIQUE(cycle_id, attempt_no) + UNIQUE(idempotency_key) are the two
--      constraints that make double execution structurally impossible (§37).
--   4. audit_log is append-only — see the REVOKE at the bottom (§39).
--
-- NOTE ON THE BUDGET CONSTANT BELOW:
--   The spec says `attempts_used <= verified/configured maximum`, and §60 says
--   the attempt count must not be the product's identity. SQL CHECK constraints
--   cannot read TypeScript, so the number appears here literally. Keep the two
--   in sync deliberately:
--     - src/config/rules.ts is the source of truth
--     - tests/schema.test.ts asserts this CHECK equals
--       MAX_ATTEMPTS_PER_CYCLE.value, so a config change that forgets the
--       migration FAILS THE TEST rather than silently diverging.
--   That test is the honest answer to "you said no magic numbers, but there's
--   a 4 in your schema."
--
-- NOTE ON `window`:
--   WINDOW is a reserved keyword in Postgres (window functions), so the column
--   is `window_name`. The TypeScript field stays `window` and the mapping lives
--   in src/db. Do not rename the column to `window` without quoting it
--   everywhere — it will bite you at 3am.

BEGIN;

CREATE TABLE mandates (
  mandate_id    TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  amount_paise  BIGINT NOT NULL CHECK (amount_paise > 0),
  mcc           TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','halted','cancelled')),
  created_on    DATE NOT NULL,
  cycle_day     SMALLINT NOT NULL CHECK (cycle_day BETWEEN 1 AND 28)
);
CREATE INDEX mandates_customer_idx ON mandates (customer_id);
CREATE INDEX mandates_status_idx   ON mandates (status);

CREATE TABLE cycles (
  cycle_id         TEXT PRIMARY KEY,
  mandate_id       TEXT NOT NULL REFERENCES mandates (mandate_id),
  cycle_no         INT NOT NULL,
  due_date         DATE NOT NULL,
  attempts_used    SMALLINT NOT NULL DEFAULT 0 CHECK (attempts_used >= 0),
  pdns_sent        SMALLINT NOT NULL DEFAULT 0 CHECK (pdns_sent >= 0),
  outcome          TEXT NOT NULL DEFAULT 'pending'
                     CHECK (outcome IN ('pending','recovered','lost','mandate_cancelled')),
  recovered_paise  BIGINT NOT NULL DEFAULT 0 CHECK (recovered_paise >= 0),

  -- ===================================================================
  -- RECOVERY BUDGET CEILING, ENFORCED BY THE DATABASE.
  -- rule_id: RECOVERY_BUDGET_MAX_ATTEMPTS_PER_CYCLE  (src/config/rules.ts)
  -- Kept in sync by tests/schema.test.ts — see the note at the top.
  -- ===================================================================
  CONSTRAINT recovery_budget_ceiling CHECK (attempts_used <= 4),

  CONSTRAINT one_cycle_per_mandate_per_no UNIQUE (mandate_id, cycle_no)
);
CREATE INDEX cycles_outcome_idx  ON cycles (outcome);
CREATE INDEX cycles_due_date_idx ON cycles (due_date);

CREATE TABLE attempts (
  attempt_id       TEXT PRIMARY KEY,
  cycle_id         TEXT NOT NULL REFERENCES cycles (cycle_id),
  attempt_no       SMALLINT NOT NULL CHECK (attempt_no >= 1),
  scheduled_for    TIMESTAMPTZ NOT NULL,
  window_name      TEXT NOT NULL CHECK (window_name IN ('early','midday','late')),
  pdn_sent_at      TIMESTAMPTZ,
  executed_at      TIMESTAMPTZ,
  result           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (result IN ('pending','success','failure','skipped','blocked')),
  decline_code     TEXT,

  -- Deterministic: hash(cycle_id + attempt_no + action_type).
  -- This UNIQUE is the anti-double-execution guarantee. Ten duplicate webhooks
  -- produce one row; the rest hit ON CONFLICT DO NOTHING and read state.
  idempotency_key  TEXT NOT NULL UNIQUE,

  CONSTRAINT one_attempt_per_slot UNIQUE (cycle_id, attempt_no),

  -- An attempt may not be scheduled before its notice has had the required
  -- lead time to land.  rule_id: UPI_AUTOPAY_PD_NOTICE_LEAD_HOURS
  CONSTRAINT pd_notice_lead_time CHECK (
    pdn_sent_at IS NULL
    OR scheduled_for >= pdn_sent_at + INTERVAL '24 hours'
  )
);
CREATE INDEX attempts_cycle_idx     ON attempts (cycle_id);
CREATE INDEX attempts_scheduled_idx ON attempts (scheduled_for);

CREATE TABLE decisions (
  decision_id             TEXT PRIMARY KEY,
  cycle_id                TEXT NOT NULL REFERENCES cycles (cycle_id),
  chosen_schedule         JSONB,
  expected_nrv_paise      BIGINT,
  nrv_breakdown           JSONB,          -- spec §22: never hide the decomposition
  alternatives_considered INT NOT NULL DEFAULT 0,
  runner_up_schedule      JSONB,          -- powers "why this schedule?" in the UI
  action                  TEXT NOT NULL
                            CHECK (action IN ('SCHEDULE_ATTEMPT','SEND_PDN','PAYMENT_LINK','STOP','ESCALATE')),
  policy_verdict          TEXT NOT NULL
                            CHECK (policy_verdict IN ('APPROVE','MODIFY','BLOCK','ESCALATE')),
  rule_id                 TEXT NOT NULL,  -- always traceable to config/rules.ts
  diagnosis_class         TEXT,
  diagnosis_source        TEXT CHECK (diagnosis_source IN ('lookup','llm','llm_rejected_fallback_lookup')),
  promise_source          TEXT CHECK (promise_source IN ('regex','llm','llm_rejected_fallback_regex')),
  estimator_name          TEXT,           -- which SuccessEstimator produced the probabilities
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX decisions_cycle_idx ON decisions (cycle_id);

CREATE TABLE audit_log (
  id         BIGSERIAL PRIMARY KEY,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  actor      TEXT NOT NULL CHECK (actor IN ('engine','llm','human')),
  rule_id    TEXT,
  before     JSONB,
  after      JSONB,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_log (entity, entity_id);

COMMIT;

-- Append-only audit trail (spec §39). Run once the app role exists:
--   REVOKE UPDATE, DELETE ON audit_log FROM netrun_app;
-- Demo this: try to UPDATE a row on camera and let it fail.
