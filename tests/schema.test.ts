/**
 * NetRun — tests/schema.test.ts
 *
 * Schema drift test: the `recovery_budget_ceiling` CHECK constraint in
 * 001_init.sql contains a literal numeral. This test parses it and
 * asserts it matches MAX_ATTEMPTS_PER_CYCLE.value from rules.ts.
 *
 * If someone changes the recovery budget in rules.ts without updating
 * the migration, this test fails — that is by design.
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { MAX_ATTEMPTS_PER_CYCLE } from '../src/config/rules';

describe('Schema drift guard', () => {
  it('recovery_budget_ceiling CHECK matches MAX_ATTEMPTS_PER_CYCLE.value', () => {
    const sqlPath = path.resolve(
      __dirname,
      '..',
      'src',
      'db',
      'migrations',
      '001_init.sql'
    );
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    // Match: CONSTRAINT recovery_budget_ceiling CHECK (attempts_used <= <number>)
    const match = sql.match(
      /CONSTRAINT\s+recovery_budget_ceiling\s+CHECK\s*\(\s*attempts_used\s*<=\s*(\d+)\s*\)/i
    );

    assert.ok(match, 'Could not find recovery_budget_ceiling CHECK constraint in 001_init.sql');

    const sqlBudget = parseInt(match[1]!, 10);

    assert.equal(
      sqlBudget,
      MAX_ATTEMPTS_PER_CYCLE.value,
      `Schema says attempts_used <= ${sqlBudget}, but rules.ts MAX_ATTEMPTS_PER_CYCLE.value is ${MAX_ATTEMPTS_PER_CYCLE.value}. Update the migration or the rule.`
    );
  });
});
