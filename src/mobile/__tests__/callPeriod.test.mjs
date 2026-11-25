// node --test src/mobile/__tests__/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel } from '../../components/callPeriod.mjs';

// 21 Nov 2026, 15:00 India time
const NOW = Date.parse('2026-11-21T15:00:00+05:30');

test('the default broad period is the last 30 India days, spelled out', () => {
  assert.deepEqual(periodLabel({ period: '30d' }, NOW), { name: 'Last 30 days', range: '23 Oct 2026 – 21 Nov 2026 (India time)' });
  assert.deepEqual(periodLabel({}, NOW), periodLabel({ period: '30d' }, NOW));
});

test('today / 7 days use India-time days, also just after midnight IST', () => {
  const justAfter = Date.parse('2026-11-22T00:00:05+05:30'); // still 21 Nov in UTC
  assert.equal(periodLabel({ period: 'today' }, justAfter).range, '22 Nov 2026 (India time)');
  assert.equal(periodLabel({ period: '7d' }, NOW).range, '15 Nov 2026 – 21 Nov 2026 (India time)');
});

test('All time stays available and says it can be slow; custom dates are echoed', () => {
  assert.equal(periodLabel({ period: 'all' }, NOW).name, 'All time');
  assert.match(periodLabel({ period: 'all' }, NOW).range, /several seconds/);
  assert.equal(periodLabel({ period: 'custom', from: '2026-11-20', to: '2026-11-20' }, NOW).range, '20 Nov 2026 – 20 Nov 2026 (India time)');
  assert.equal(periodLabel({ period: 'custom', from: '', to: '' }, NOW).range, 'pick a From and/or To date');
});
