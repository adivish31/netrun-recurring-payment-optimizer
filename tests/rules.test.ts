import test from 'node:test';
import assert from 'node:assert';
import { getAfaThresholdPaise } from '../src/config/rules';

test('AFA Threshold resolutions', () => {
  // Elevated MCC (e.g. 5413) should resolve to 10000000 (1_00_00_000)
  assert.strictEqual(getAfaThresholdPaise('5413'), 1_00_00_000, 'Elevated MCC failed');
  
  // Non-elevated MCC (e.g. 1234) should resolve to 1500000 (15_00_000)
  assert.strictEqual(getAfaThresholdPaise('1234'), 15_00_000, 'Non-elevated MCC failed');
});
