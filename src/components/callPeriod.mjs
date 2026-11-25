// src/components/callPeriod.mjs
//
// The Call Logs period, spelled out in India dates — the same boundaries
// the server uses (services/callStats.js: IST days; "7 days" = today + the 6
// days before, "30 days" = today + the 29 days before). Shown above "All
// call events" / "By customer" so the selected period is always visible,
// also while a page is loading.
const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

// The India day containing `ms`, as a UTC-midnight Date of that calendar day.
const istDay = (ms) => new Date(Math.floor((ms + IST_MS) / DAY_MS) * DAY_MS);
const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const parseDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? new Date(`${s}T00:00:00Z`) : null);

/**
 * { name, range } for a filter state { period, from, to }.
 *   name   'Last 30 days' …        range  '23 Oct 2026 – 21 Nov 2026 (India time)'
 */
export function periodLabel(f, now = Date.now()) {
  const d0 = istDay(now);
  const back = (n) => new Date(d0.getTime() - n * DAY_MS);
  switch (f?.period) {
    case 'today': return { name: 'Today', range: `${fmt(d0)} (India time)` };
    case '7d': return { name: 'Last 7 days', range: `${fmt(back(6))} – ${fmt(d0)} (India time)` };
    case '30d': return { name: 'Last 30 days', range: `${fmt(back(29))} – ${fmt(d0)} (India time)` };
    case 'all': return { name: 'All time', range: 'every call on record — can take several seconds' };
    case 'custom': {
      const a = parseDay(f.from); const b = parseDay(f.to);
      if (!a && !b) return { name: 'Chosen dates', range: 'pick a From and/or To date' };
      return { name: 'Chosen dates', range: `${a ? fmt(a) : 'the first call'} – ${b ? fmt(b) : 'today'} (India time)` };
    }
    default: return { name: 'Last 30 days', range: `${fmt(back(29))} – ${fmt(d0)} (India time)` };
  }
}
