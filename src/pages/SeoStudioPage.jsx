// src/pages/SeoStudioPage.jsx
//
// SEO Studio — the review surface for the backend's SEO draft pipeline
// (medifleet-backend routes/seo.js).
//
// APPROVE IS THE PUBLISH BUTTON. There is no separate publish step and none
// is needed: SeoArticle.PUBLIC_STATUSES is ['approved', 'published'], so an
// article that has passed its checks becomes publicly readable the moment it
// is approved. savelife-web reads that API and renders it at /guides/[slug],
// and it appears there within the site's revalidation window with no deploy.
// `published` further along the ladder stamps publishedAt and records who
// signed it off — it does not change what the public can already see.
//
// Approving is therefore a decision to put a page on a live medical site, not
// a filing action. The checks below are what stands between a draft and that.
//
// This screen never sees the ANTHROPIC_API_KEY. That lives only in the
// backend's Render environment. The browser sends a keyword and receives a
// draft.
//
// The quality checks are shown, not hidden. A draft that failed its checks is
// still saved and still visible, because a reviewer needs to see WHY it failed
// rather than have it silently disappear — and the backend refuses to approve
// it until the reason is gone.
import React, { useEffect, useRef, useState } from 'react';
import { seoApi } from '../api/client';
import { PageHeader, Btn, Input, Select, Spinner, Empty, Badge, Tabs, SectionLabel } from '../components/ui';
import {
  Sparkles, FileText, AlertTriangle, CheckCircle2, Copy, RefreshCw,
  Link2, HelpCircle, Code2, Gauge, XCircle, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

// Mirrors the enum in medifleet-backend models/SeoArticle.js.
const STATUS_META = {
  draft:     { color: 'gray',  label: 'Draft' },
  in_review: { color: 'amber', label: 'In Review' },
  approved:  { color: 'blue',  label: 'Approved' },
  published: { color: 'green', label: 'Published' },
  rejected:  { color: 'red',   label: 'Rejected' },
};

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved',  label: 'Approved' },
  { key: 'published', label: 'Published' },
  { key: 'rejected',  label: 'Rejected' },
];

const StatusChip = ({ status }) => {
  const s = STATUS_META[status] || { color: 'gray', label: status };
  return <Badge color={s.color}>{s.label}</Badge>;
};

// Generation runs 30–90s on the backend. A spinner alone reads as "hung", so
// this shows elapsed seconds and names the stage that is actually running.
const GeneratingPanel = ({ seconds }) => {
  const stage =
    seconds < 8  ? 'Building the fact sheet…'
    : seconds < 35 ? 'Claude is drafting the article…'
    : seconds < 70 ? 'Fact-checking against verified SaveLife facts…'
    : 'Running the similarity sweep…';
  return (
    <div className="card flex flex-col items-center justify-center py-14 gap-3">
      <div className="rounded-full border-2 border-t-transparent animate-spin"
        style={{ width: 30, height: 30, borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      <div className="text-sm font-semibold">{stage}</div>
      <div className="text-xs" style={{ color: 'var(--text3)' }}>
        {seconds}s elapsed · this normally takes 30–90 seconds
      </div>
      <div className="text-xs" style={{ color: 'var(--text3)' }}>
        Two Claude calls plus a similarity sweep. Leave this tab open.
      </div>
    </div>
  );
};

// Ranges the backend gate enforces (services/seoGenerator.js). Kept in step
// with it deliberately: if these drift, the UI says pass while the API says
// fail, which is worse than showing nothing.
const TITLE_MIN = 55, TITLE_MAX = 60;
const META_MIN = 150, META_MAX = 160;
// Mirrors SEO_MAX_AUTO_REPAIR_ATTEMPTS in the backend. Display only — the
// backend enforces the cap.
const MAX_AUTO_ATTEMPTS = 2;
// How often the article is re-read while an automatic cycle is running. A
// cycle is ONE long request making up to four Claude calls, so the response
// tells us nothing until it is over; the loop writes its phase to the article
// as it advances and this is how that reaches the screen. Owner-only screen,
// one article at a time, so the request cost is irrelevant next to being able
// to see what is happening.
const AUTO_POLL_MS = 2500;
const SIMILARITY_BLOCK = 0.55;
const MIN_WORDS = 700;

// Claims arrive as { claim, severity, action }. Drafts generated before
// severities existed stored plain strings; the backend normalises those on
// read, but a cached row in this tab might still be the old shape.
const normaliseClaim = (c) =>
  typeof c === 'string'
    ? { claim: c, severity: 'unsupported', action: 'rewrite' }
    : { claim: c.claim, severity: c.severity || 'unsupported', action: c.action || 'rewrite' };

const SEVERITY_META = {
  fabricated:  { color: 'red',   label: 'Fabricated',  blocking: true },
  unsupported: { color: 'amber', label: 'Unsupported', blocking: true },
  phrasing:    { color: 'blue',  label: 'Phrasing',    blocking: false },
};

const ACTION_LABEL = {
  source:  'Use the real figure from the fact sheet',
  remove:  'Delete — nothing supports it',
  rewrite: 'Reword so it stops asserting',
};

// The quality gates from SeoArticle.checks. Approval is blocked on these by
// the backend, so they are rendered as hard pass/fail rather than hints.
const ChecksPanel = ({ checks = {}, article }) => {
  const wc = checks.wordCount || 0;
  const sim = checks.similarityScore || 0;
  const claims = (checks.unverifiedClaims || []).map(normaliseClaim);
  const blocking = claims.filter((c) => SEVERITY_META[c.severity]?.blocking !== false);
  const advisory = claims.filter((c) => SEVERITY_META[c.severity]?.blocking === false);
  const dropped = checks.droppedLinks || [];

  // Phase 2 gates. liveSim and schemaErrors block approval in the backend;
  // intentCollisions are advisory, because no threshold in this project
  // decides when two pages are "too close in intent".
  const liveSim = checks.livePageSimilarity || 0;
  const liveIndexed = checks.livePagesIndexed ?? null;
  const schemaErrors = checks.schemaErrors || [];
  const collisions = checks.intentCollisions || [];

  // Fall back to measuring the strings when an older draft has no stored
  // lengths, so the row is never blank.
  const titleLen = checks.titleLength ?? (article?.title || '').length;
  const metaLen = checks.metaLength ?? (article?.metaDescription || '').length;
  const titleOk = titleLen >= TITLE_MIN && titleLen <= TITLE_MAX;
  const metaOk = metaLen >= META_MIN && metaLen <= META_MAX;

  const rows = [
    {
      ok: blocking.length === 0,
      label: 'Fact check',
      detail: blocking.length === 0
        ? (advisory.length ? `Clean — ${advisory.length} advisory note${advisory.length === 1 ? '' : 's'}` : 'No unverified claims')
        : `${blocking.length} blocking claim${blocking.length === 1 ? '' : 's'}`,
    },
    {
      ok: titleOk,
      label: 'Title length',
      detail: `${titleLen} chars${titleOk ? '' : ` — must be ${TITLE_MIN}–${TITLE_MAX}`}`,
    },
    {
      ok: metaOk,
      label: 'Meta length',
      detail: `${metaLen} chars${metaOk ? '' : ` — must be ${META_MIN}–${META_MAX}`}`,
    },
    {
      ok: sim < SIMILARITY_BLOCK,
      label: 'Cannibalisation',
      detail: `${Math.round(sim * 100)}% similar to nearest existing draft${sim >= SIMILARITY_BLOCK ? ' — too close' : ''}`,
    },
    {
      // The curated pages on savelife.health. These already rank, so a draft
      // that duplicates one would compete with it rather than add anything.
      ok: liveSim < SIMILARITY_BLOCK,
      label: 'Live page overlap',
      detail: liveIndexed === 0
        ? 'No live pages indexed — this check did not run'
        : `${Math.round(liveSim * 100)}% vs ${checks.similarToLivePage || 'nearest live page'}${liveSim >= SIMILARITY_BLOCK ? ' — too close' : ''}`,
    },
    {
      ok: schemaErrors.length === 0,
      label: 'Structured data',
      detail: schemaErrors.length === 0
        ? 'Valid'
        : `${schemaErrors.length} error${schemaErrors.length === 1 ? '' : 's'}`,
    },
    {
      ok: !checks.duplicateSlug,
      label: 'Slug',
      detail: checks.duplicateSlug ? 'Duplicate slug' : (article?.slug || 'unique'),
    },
    {
      ok: wc >= MIN_WORDS,
      label: 'Word count',
      detail: `${wc} words${wc < MIN_WORDS ? ` — under the ${MIN_WORDS} minimum` : ''}`,
    },
    {
      ok: (article?.internalLinks || []).length >= 2,
      label: 'Internal links',
      detail: `${(article?.internalLinks || []).length} valid${dropped.length ? ` · ${dropped.length} dropped` : ''}`,
    },
  ].map((r) => ({ ...r, icon: r.ok ? CheckCircle2 : AlertTriangle }));

  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Quality gates</SectionLabel>
        {checks.passed
          ? <Badge color="green">All checks passed</Badge>
          : <Badge color="red">Checks failed — cannot be approved</Badge>}
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((r) => {
          const I = r.icon;
          return (
            <div key={r.label} className="flex items-start gap-2 p-2.5 rounded-lg"
              style={{ background: 'var(--surface2)' }}>
              <I size={15} style={{ color: r.ok ? 'var(--green)' : 'var(--red)', marginTop: 2, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="text-xs font-semibold">{r.label}</div>
                <div className="text-xs break-words" style={{ color: 'var(--text3)' }}>{r.detail}</div>
              </div>
            </div>
          );
        })}
      </div>

      {blocking.length > 0 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.25)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--red)' }}>
            Blocking — {blocking.length} claim{blocking.length === 1 ? '' : 's'} must be fixed before approval
          </div>
          <ul className="space-y-2">
            {blocking.map((c, i) => {
              const sev = SEVERITY_META[c.severity] || SEVERITY_META.unsupported;
              return (
                <li key={i}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <Badge color={sev.color}>{sev.label}</Badge>
                    <span className="text-xs leading-relaxed flex-1 min-w-0 break-words" style={{ color: 'var(--text2)' }}>
                      “{c.claim}”
                    </span>
                  </div>
                  <div className="text-xs mt-0.5 pl-1" style={{ color: 'var(--text3)' }}>
                    → {ACTION_LABEL[c.action] || c.action}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {advisory.length > 0 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(59,158,255,.07)', border: '1px solid rgba(59,158,255,.2)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--blue)' }}>
            Advisory — {advisory.length} phrasing note{advisory.length === 1 ? '' : 's'} · does not block approval
          </div>
          <ul className="space-y-2">
            {advisory.map((c, i) => (
              <li key={i}>
                <div className="text-xs leading-relaxed break-words" style={{ color: 'var(--text2)' }}>“{c.claim}”</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                  → {ACTION_LABEL[c.action] || c.action}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {schemaErrors.length > 0 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.25)' }}>
          <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--red)' }}>
            Structured data will not validate — {schemaErrors.length} error{schemaErrors.length === 1 ? '' : 's'}
          </div>
          <ul className="space-y-1">
            {schemaErrors.map((e, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>• {e}</li>
            ))}
          </ul>
          <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
            The published page drops invalid nodes, so approving this would ship a page with no rich-result markup and no error anywhere.
          </div>
        </div>
      )}

      {collisions.length > 0 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(59,158,255,.07)', border: '1px solid rgba(59,158,255,.2)' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: 'var(--blue)' }}>
            Advisory — {collisions.length} page{collisions.length === 1 ? '' : 's'} in the same cluster target the same intent
          </div>
          <ul className="space-y-1.5">
            {collisions.map((c, i) => (
              <li key={i} className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
                <span className="font-mono">{c.ref}</span>
                <span style={{ color: 'var(--text3)' }}>
                  {' '}· {c.cluster} · {c.searchIntent} · titles {Math.round((c.titleSimilarity || 0) * 100)}% alike
                </span>
              </li>
            ))}
          </ul>
          <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
            Does not block. Judge whether this page answers something the others do not — if it does not, reject it rather than splitting the same query across two URLs.
          </div>
        </div>
      )}

      {dropped.length > 0 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(255,184,48,.08)', border: '1px solid rgba(255,184,48,.25)' }}>
          <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--amber)' }}>
            {dropped.length} generated link{dropped.length === 1 ? '' : 's'} dropped — not live on the site
          </div>
          <ul className="space-y-1">
            {dropped.map((l, i) => (
              <li key={i} className="text-xs leading-relaxed break-all" style={{ color: 'var(--text2)' }}>
                • <span className="font-mono">{l.href}</span>
                {l.label ? <span style={{ color: 'var(--text3)' }}> — {l.label}</span> : null}
              </li>
            ))}
          </ul>
          <div className="text-xs mt-2" style={{ color: 'var(--text3)' }}>
            The model proposed these but they do not exist. Either the page should be built, or the link was invented.
          </div>
        </div>
      )}

      {sim >= 0.55 && (
        <div className="mt-3 p-3 rounded-lg" style={{ background: 'rgba(255,184,48,.08)', border: '1px solid rgba(255,184,48,.25)' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--amber)' }}>
            Cannibalisation warning
          </div>
          <div className="text-xs leading-relaxed" style={{ color: 'var(--text2)' }}>
            This draft is {Math.round(sim * 100)}% similar to an existing draft. Two pages
            this close compete for the same query rather than reinforcing each other.
            Merge them, or retarget one.
          </div>
        </div>
      )}
    </div>
  );
};

// What the automatic cycle is doing, or what it decided.
//
// The states are deliberately distinguishable at a glance, because they need
// different things from the reviewer: a run in flight needs nothing, a pass
// needs an Approve, and a stop needs somebody to read the draft. "Manual
// review required" is never inferred from a phase alone -- it comes from the
// backend having stopped and said why.
const AUTO_STEPS = [
  { key: 'repairing',  label: 'Repairing' },
  { key: 'rechecking', label: 'Rechecking' },
];

const AutoProgress = ({ run }) => {
  if (!run) return null;
  const { running, phase, attempts = 0, maxAttempts, timeline = [], stoppedReason, auto } = run;
  const cap = maxAttempts || MAX_AUTO_ATTEMPTS;
  const passed = !running && phase === 'passed';
  const stopped = !running && !passed;
  const activeIdx = AUTO_STEPS.findIndex((s) => s.key === phase);

  return (
    <div className="card mb-3" style={{ borderColor: passed ? 'var(--accent)' : stopped ? 'var(--amber)' : 'var(--blue)' }}>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {running
          ? (
            // Same markup as GeneratingPanel's spinner. The shared Spinner
            // component centres itself inside p-8, which is right for a page
            // and wrong for a line of text.
            <div
              className="rounded-full border-2 border-t-transparent animate-spin"
              style={{ width: 14, height: 14, borderColor: 'var(--blue)', borderTopColor: 'transparent' }}
            />
          )
          : passed ? <CheckCircle2 size={15} style={{ color: 'var(--accent)' }} />
                   : <AlertTriangle size={15} style={{ color: 'var(--amber)' }} />}
        <span className="text-sm font-medium">
          {running ? 'Automatic repair running' : passed ? 'Automatic repair passed' : 'Manual review required'}
        </span>
        {/* Zero attempts on a finished run is not a missing number: it means
            the loop looked at the failures and refused to spend a repair on
            them — a price, a duplicate slug, a cannibalisation score. Saying
            "attempt 0/2" would read like a bug. */}
        <Badge color={running ? 'blue' : passed ? 'green' : 'amber'}>
          {!running && attempts === 0
            ? 'no repair attempted'
            : `attempt ${Math.max(attempts, running ? 1 : attempts)}/${cap}`}
        </Badge>
        {auto && <Badge color="gray">started automatically</Badge>}
      </div>

      {/* Repairing -> Rechecking, with the step in flight lit. Once the run is
          over both are spent and the outcome line below carries the meaning. */}
      <div className="flex items-center gap-2 flex-wrap text-xs mb-2">
        {AUTO_STEPS.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <span style={{ color: 'var(--text3)' }}>&rarr;</span>}
            <span
              className="px-2 py-0.5 rounded-full"
              style={{
                background: running && i === activeIdx ? 'var(--blue)' : 'var(--surface2)',
                color: running && i === activeIdx ? 'var(--ink)' : 'var(--text3)',
              }}
            >
              {s.label}{running && i === activeIdx ? '\u2026' : ''}
            </span>
          </React.Fragment>
        ))}
        <span style={{ color: 'var(--text3)' }}>&rarr;</span>
        <span
          className="px-2 py-0.5 rounded-full"
          style={{
            background: passed ? 'var(--accent)' : stopped ? 'var(--amber)' : 'var(--surface2)',
            color: passed || stopped ? 'var(--ink)' : 'var(--text3)',
          }}
        >
          {passed ? 'Passed' : stopped ? 'Manual review' : 'Passed'}
        </span>
        {running && attempts > 1 && (
          <span style={{ color: 'var(--text3)' }}>&middot; retrying after a failed recheck</span>
        )}
      </div>

      {passed && (
        <div className="text-xs" style={{ color: 'var(--text2)' }}>
          The checks are clean. Nothing has been approved or published &mdash; press Approve when you are satisfied.
        </div>
      )}
      {stopped && stoppedReason && (
        <div className="text-xs" style={{ color: 'var(--text2)' }}>{stoppedReason}</div>
      )}

      {timeline.length > 0 && (
        <div className="mt-2 rounded-lg p-2.5" style={{ background: 'var(--surface2)' }}>
          {timeline.map((t, i) => (
            <div key={i} className="text-xs" style={{ color: 'var(--text3)' }}>&bull; {t}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// An Anthropic-side failure, kept on screen rather than left in a toast that
// has already gone. Every one of these is acted on somewhere other than this
// page -- a billing console, an env var, or simply waiting -- so the operator
// needs to be able to re-read it.
const API_ERROR_TITLE = {
  billing: 'Anthropic credits exhausted',
  auth: 'Anthropic API key rejected',
  rate_limit: 'Anthropic rate limit reached',
  overloaded: 'Anthropic is overloaded',
  upstream: 'Anthropic API failure',
};

const ApiErrorBanner = ({ error, onDismiss }) => {
  if (!error) return null;
  return (
    <div className="card mb-3" style={{ borderColor: 'var(--red)' }}>
      <div className="flex items-start gap-2">
        <AlertTriangle size={15} style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }} />
        <div className="min-w-0">
          <div className="text-sm font-medium">{API_ERROR_TITLE[error.code] || 'Anthropic API failure'}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text2)' }}>{error.message}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
            The article was not changed by the failed call.
          </div>
        </div>
        <Btn size="sm" variant="ghost" className="ml-auto" onClick={onDismiss}>Dismiss</Btn>
      </div>
    </div>
  );
};

const DraftView = ({ article, onStatus, onRecheck, onRepair, onAutoRepair, autoState, working }) => {
  if (!article) return null;
  const checks = article.checks || {};
  const gen = article.generation || {};

  // What Repair can actually act on: the blocking claims the last recheck
  // raised, and a meta description outside its length band. Same normaliser
  // and same constants ChecksPanel uses, so the button and the checks panel
  // can never disagree about whether there is something to fix.
  const blockingCount = (checks.unverifiedClaims || [])
    .map(normaliseClaim)
    .filter((c) => SEVERITY_META[c.severity]?.blocking !== false).length;
  const metaLen = checks.metaLength ?? (article.metaDescription || '').length;
  const repairable = blockingCount > 0 || metaLen < META_MIN || metaLen > META_MAX;
  const auto = gen.autoRepair || {};
  // The JSON-LD moved from `schema` to `jsonLd` (`schema` is a reserved name
  // on a Mongoose document). The API still mirrors the old key, so this falls
  // back rather than depending on which side deploys first.
  const jsonLd = article.jsonLd ?? article.schema;

  const copy = (text, what) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error('Could not copy'),
    );
  };

  return (
    <div>
      <div className="card mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <StatusChip status={article.status} />
              {article.searchIntent && <Badge color="gray">{article.searchIntent}</Badge>}
              {article.cluster && <Badge color="blue">{article.cluster}</Badge>}
            </div>
            <div className="text-lg font-bold font-display break-words">{article.h1}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
              keyword: <span style={{ color: 'var(--text2)' }}>{article.keyword}</span>
              {article.service && <> · service: <span style={{ color: 'var(--text2)' }}>{article.service}</span></>}
              {article.location && <> · location: <span style={{ color: 'var(--text2)' }}>{article.location}</span></>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Btn size="sm" variant="ghost" disabled={working}
              onClick={() => onStatus(article._id, 'in_review')}>Mark In Review</Btn>
            <Btn size="sm" variant="ghost" disabled={working}
              title="Re-run all quality checks against the current text"
              onClick={() => onRecheck(article._id)}>Recheck</Btn>
            {/* Only when there is something for it to do. A passing article
                has neither blocking claims nor a meta outside its range —
                both are gate terms — so this never appears on approved work. */}
            {repairable && (
              <Btn size="sm" variant="ghost" disabled={working}
                title="Rewrite the blocking claims and fix the meta description length. You must Recheck afterwards."
                onClick={() => onRepair(article._id)}>
                {working ? 'Repairing…' : 'Repair'}
              </Btn>
            )}
            {repairable && (
              <Btn size="sm" variant="ghost" disabled={working}
                title="Repair and Recheck automatically, up to twice. Never approves — a clean result still needs your Approve."
                onClick={() => onAutoRepair(article._id)}>
                {autoState || 'Auto-repair'}
              </Btn>
            )}
            <Btn size="sm" variant="blue" disabled={working || !checks.passed}
              title={checks.passed ? '' : 'Blocked: this draft has not passed its checks'}
              onClick={() => onStatus(article._id, 'approved')}>Approve</Btn>
            <Btn size="sm" variant="danger" disabled={working}
              onClick={() => onStatus(article._id, 'rejected')}>Reject</Btn>
          </div>
        </div>

        {repairable && (
          <div className="text-xs -mt-1" style={{ color: 'var(--text3)' }}>
            Repair fixes blocking fact-check claims and metadata. You must Recheck after repair.
            Auto-repair does both, up to twice, and still never approves.
          </div>
        )}

        {/* What the last automatic run did. Kept visible after it finishes,
            because "it stopped and why" is the part a reviewer acts on. */}
        {auto?.attempts > 0 && (
          <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface2)' }}>
            <div className="font-medium" style={{ color: 'var(--text1)' }}>
              {auto.stoppedReason
                ? `Repair stopped after ${auto.attempts}/${MAX_AUTO_ATTEMPTS} — manual review required`
                : `Auto-repair passed after ${auto.attempts}/${MAX_AUTO_ATTEMPTS} — your Approve is still required`}
            </div>
            {auto.stoppedReason && (
              <div className="mt-1" style={{ color: 'var(--text2)' }}>{auto.stoppedReason}</div>
            )}
            {(auto.timeline || []).map((t, i) => (
              <div key={i} className="mt-0.5" style={{ color: 'var(--text3)' }}>• {t}</div>
            ))}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          {[
            { icon: Gauge, label: 'Word count', value: checks.wordCount || 0 },
            { icon: HelpCircle, label: 'FAQs', value: (article.faqs || []).length },
            { icon: Link2, label: 'Internal links', value: (article.internalLinks || []).length },
          ].map(({ icon: I, label, value }) => (
            <div key={label} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--surface2)' }}>
              <I size={15} style={{ color: 'var(--accent)' }} />
              <div>
                <div className="text-sm font-bold">{value}</div>
                <div className="text-xs" style={{ color: 'var(--text3)' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ChecksPanel checks={checks} article={article} />

      {/* SEO metadata — lengths shown because these are the two fields that
          silently truncate in search results. */}
      <div className="card mb-4">
        <SectionLabel>SEO metadata</SectionLabel>
        {[
          { label: 'Title', value: article.title, lo: TITLE_MIN, hi: TITLE_MAX },
          { label: 'Meta description', value: article.metaDescription, lo: META_MIN, hi: META_MAX },
        ].map(({ label, value, lo, hi }) => {
          const len = (value || '').length;
          const inRange = len >= lo && len <= hi;
          return (
            <div key={label} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text2)' }}>{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: inRange ? 'var(--green)' : 'var(--red)' }}>
                    {len} chars {inRange ? '· pass' : `· FAIL (must be ${lo}–${hi})`}
                  </span>
                  <button onClick={() => copy(value, label)} title="Copy"
                    className="opacity-60 hover:opacity-100 transition-opacity">
                    <Copy size={13} />
                  </button>
                </div>
              </div>
              <div className="text-sm p-2.5 rounded-lg break-words" style={{ background: 'var(--surface2)' }}>{value}</div>
            </div>
          );
        })}
        <div className="mt-3">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text2)' }}>Slug</span>
          <div className="text-sm p-2.5 rounded-lg mt-1 font-mono break-all" style={{ background: 'var(--surface2)' }}>/{article.slug}</div>
        </div>
      </div>

      {(article.internalLinks || []).length > 0 && (
        <div className="card mb-4">
          <SectionLabel>Internal links</SectionLabel>
          <div className="space-y-2">
            {article.internalLinks.map((l, i) => (
              <div key={i} className="p-2.5 rounded-lg" style={{ background: 'var(--surface2)' }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link2 size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span className="text-sm font-semibold break-words">{l.label}</span>
                  <span className="text-xs font-mono break-all" style={{ color: 'var(--text3)' }}>{l.href}</span>
                </div>
                {l.reason && (
                  <div className="text-xs mt-1 pl-5" style={{ color: 'var(--text3)' }}>{l.reason}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(article.faqs || []).length > 0 && (
        <div className="card mb-4">
          <SectionLabel>FAQs ({article.faqs.length})</SectionLabel>
          <div className="space-y-2">
            {article.faqs.map((f, i) => (
              <details key={i} className="p-2.5 rounded-lg" style={{ background: 'var(--surface2)' }}>
                <summary className="text-sm font-semibold cursor-pointer">{f.q}</summary>
                <p className="text-sm mt-2 leading-relaxed" style={{ color: 'var(--text2)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Article body</SectionLabel>
          <button onClick={() => copy(article.content, 'Content')} title="Copy"
            className="opacity-60 hover:opacity-100 transition-opacity"><Copy size={13} /></button>
        </div>
        <pre className="text-sm whitespace-pre-wrap leading-relaxed p-3 rounded-lg max-h-[520px] overflow-y-auto"
          style={{ background: 'var(--surface2)', color: 'var(--text2)', fontFamily: 'inherit' }}>
          {article.content}
        </pre>
      </div>

      {jsonLd && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Structured data</SectionLabel>
            <div className="flex items-center gap-2">
              <Badge color="blue">
                {(Array.isArray(jsonLd) ? jsonLd : [jsonLd])
                  .map((s) => s?.['@type']).filter(Boolean).join(' · ') || 'schema'}
              </Badge>
              <button onClick={() => copy(JSON.stringify(jsonLd, null, 2), 'Schema')} title="Copy"
                className="opacity-60 hover:opacity-100 transition-opacity"><Copy size={13} /></button>
            </div>
          </div>
          <pre className="text-xs p-3 rounded-lg max-h-72 overflow-auto font-mono"
            style={{ background: 'var(--surface2)', color: 'var(--text3)' }}>
            {JSON.stringify(jsonLd, null, 2)}
          </pre>
        </div>
      )}

      {(gen.model || gen.generatedAt) && (
        <div className="card">
          <SectionLabel>Provenance</SectionLabel>
          <div className="text-xs space-y-1" style={{ color: 'var(--text3)' }}>
            {gen.model && <div>model: <span style={{ color: 'var(--text2)' }}>{gen.model}</span>{gen.effort ? ` · effort: ${gen.effort}` : ''}</div>}
            {(gen.inputTokens || gen.outputTokens) && (
              <div>tokens: {gen.inputTokens || 0} in / {gen.outputTokens || 0} out</div>
            )}
            {gen.factSheetHash && <div className="break-all">fact sheet: {gen.factSheetHash}</div>}
            {gen.generatedAt && <div>generated: {new Date(gen.generatedAt).toLocaleString('en-IN')}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

export default function SeoStudioPage() {
  const [keyword,  setKeyword]  = useState('');
  const [service,  setService]  = useState('');
  const [location, setLocation] = useState('Bangalore');
  const [notes,    setNotes]    = useState('');

  const [generating, setGenerating] = useState(false);
  const [elapsed,    setElapsed]    = useState(0);
  const [working,    setWorking]    = useState(false);
  // Label shown on the Auto-repair button while a run is in flight. The
  // request is one round trip, so this cannot follow the backend's real
  // progress — it says what stage is expected, not what has happened.
  const [autoState,  setAutoState]  = useState(null);
  // The live view of the running (or last) automatic cycle, fed by the poll
  // below. Distinct from the article's own generation.autoRepair, which is
  // only authoritative once the run is over.
  const [autoRun,    setAutoRun]    = useState(null);
  const [apiError,   setApiError]   = useState(null);
  // Whether a failed generation goes straight into the loop. On by default:
  // that is the whole point of the automation. Off is for when somebody wants
  // to read the draft before spending more on it.
  const [autoAfterGenerate, setAutoAfterGenerate] = useState(true);
  // One cycle at a time. The backend refuses a second loop on the same
  // article with a 409, but stopping it here avoids the wasted round trip and
  // the flicker of two progress states fighting.
  const autoCycle = useRef(false);
  const pollRef = useRef(null);

  const [articles, setArticles] = useState([]);
  const [counts,   setCounts]   = useState({});
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');
  const [selected, setSelected] = useState(null);

  const load = async (status = filter) => {
    try {
      const { data } = await seoApi.getAll(status === 'all' ? {} : { status });
      setArticles(data.articles || []);
      setCounts(data.counts || {});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not load SEO articles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setLoading(true); load(filter); /* eslint-disable-next-line */ }, [filter]);

  // A cycle left running when this page unmounts would keep polling forever.
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // A failure the backend identified as Anthropic's owns a `code` (see
  // claudeFailure in seoController.js). Those get the API's own sentence, a
  // long toast and a banner that stays put, because the fix is somewhere else
  // entirely -- a billing page, an env var, or just waiting -- and a
  // four-second toast is not long enough to read a URL out of.
  const showClaudeError = (err, fallback) => {
    const d = err.response?.data || {};
    if (d.code) {
      setApiError({ code: d.code, message: d.message });
      toast.error(d.message, { duration: 14000 });
      return;
    }
    toast.error(d.message || fallback, { duration: 8000 });
  };

  // Elapsed counter for the generation panel.
  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [generating]);

  const openArticle = async (id) => {
    try {
      const { data } = await seoApi.getById(id);
      setSelected(data.article);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not open draft');
    }
  };

  const generate = async () => {
    if (!keyword.trim()) return toast.error('A keyword is required.');
    setGenerating(true);
    setSelected(null);
    setAutoRun(null);
    setApiError(null);
    // Held outside the try so the automatic cycle can start AFTER the
    // generating panel has gone and the draft is on screen -- the operator
    // should be able to read what is being repaired while it is repaired.
    let fresh = null;
    try {
      const { data } = await seoApi.generate({
        keyword: keyword.trim(),
        service: service.trim() || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      fresh = data.article;
      setSelected(fresh);
      toast.success('Draft generated');
      load();
    } catch (err) {
      // 503 = missing key or a Claude refusal, 402 = an exhausted balance.
      // The backend sends a readable message for all of them.
      showClaudeError(err, 'Generation failed');
    } finally {
      setGenerating(false);
    }

    // The automation, and the only place it is triggered without a click. A
    // draft that PASSED is left exactly as it is: it is waiting for a person,
    // and there is nothing for a repair to do. A draft that failed goes into
    // the existing loop, which still cannot approve it.
    if (fresh && autoAfterGenerate && !fresh.checks?.passed) {
      await runAutoRepair(fresh._id, { auto: true });
    }
  };

  const changeStatus = async (id, status) => {
    setWorking(true);
    try {
      const { data } = await seoApi.setStatus(id, { status });
      setSelected(data.article);
      toast.success(`Moved to ${STATUS_META[status]?.label || status}`);
      load();
    } catch (err) {
      // 422 is the backend refusing to approve a draft that failed its checks.
      toast.error(err.response?.data?.message || 'Could not change status', { duration: 7000 });
    } finally {
      setWorking(false);
    }
  };

  // Re-run the gates over the current text. This is the only way an article
  // edited after approval can get checks.passed back — nothing else sets it.
  // A pass does NOT approve: the backend leaves status alone and a human
  // still presses Approve, so the button below stays gated on checks.passed.
  const recheck = async (id) => {
    setWorking(true);
    try {
      const { data } = await seoApi.recheck(id);
      setSelected(data.article);
      // The backend says what happened in both cases — a pass explains that
      // Approve is still required, a failure lists the exact gates. Longer
      // toast on failure because that list is the actionable part.
      if (data.passed) toast.success(data.message);
      else toast.error(data.message, { duration: 10000 });
      load();
    } catch (err) {
      // 422 = a rejected article, which cannot be rechecked back into
      // contention. 503 = missing key or a Claude refusal, 402 = no credits.
      showClaudeError(err, 'Recheck failed');
    } finally {
      setWorking(false);
    }
  };

  // Rewrites the blocking claims the last recheck raised, plus a meta
  // description outside its range. It does not re-run the checks: the backend
  // sets checks.passed false and leaves it there, so Recheck is the next step
  // and the notice under the buttons says so.
  const repair = async (id) => {
    setWorking(true);
    try {
      const { data } = await seoApi.repair(id);
      setSelected(data.article);
      // The backend reports honestly when a repair changed nothing, and that
      // is not a success — show it as a warning rather than a tick.
      if (data.repaired) toast.success(data.message, { duration: 9000 });
      else toast(data.message, { icon: '⚠️', duration: 9000 });
      load();
    } catch (err) {
      // 422 = nothing to repair, or a rejected article. 503 = missing key or
      // a Claude refusal, 402 = an exhausted balance.
      showClaudeError(err, 'Repair failed');
    } finally {
      setWorking(false);
    }
  };

  // Repair -> recheck, up to twice, entirely on the backend. It cannot
  // approve: a clean result comes back with the article still in its existing
  // status and Approve still gated on checks.passed.
  //
  // One request drives the whole loop, so nothing comes back until it is
  // over. The progress on screen comes from polling the article, which the
  // loop stamps with its phase as it advances. A poll that fails is ignored:
  // a missed progress frame is not a failed run, and the response is still
  // the authority on what happened.
  const runAutoRepair = async (id, { auto = false } = {}) => {
    if (autoCycle.current) {
      toast('An automatic cycle is already running on this article.', { icon: '\u23f3' });
      return;
    }
    autoCycle.current = true;
    setWorking(true);
    setApiError(null);
    setAutoState('Auto-repairing\u2026');
    setAutoRun({ running: true, phase: 'repairing', attempts: 1, maxAttempts: MAX_AUTO_ATTEMPTS, timeline: [], auto });

    pollRef.current = setInterval(async () => {
      try {
        const { data } = await seoApi.getById(id);
        // The checks panel is refreshed too, so the blocking claims still
        // outstanding update after each recheck rather than only at the end.
        setSelected(data.article);
        const a = data.article?.generation?.autoRepair;
        if (a) {
          setAutoRun((p) => (p ? {
            ...p,
            phase: a.phase || p.phase,
            attempts: a.attempts || p.attempts,
            maxAttempts: a.maxAttempts || p.maxAttempts,
            timeline: a.timeline?.length ? a.timeline : p.timeline,
          } : p));
        }
      } catch { /* a poll that fails is not a run that failed */ }
    }, AUTO_POLL_MS);

    try {
      const { data } = await seoApi.autoRepair(id);
      setSelected(data.article);
      setAutoRun({
        running: false,
        phase: data.passed ? 'passed' : 'stopped',
        attempts: data.attempts,
        maxAttempts: data.article?.generation?.autoRepair?.maxAttempts || MAX_AUTO_ATTEMPTS,
        timeline: data.timeline || [],
        stoppedReason: data.stoppedReason,
        auto,
      });
      if (data.passed) toast.success(data.message, { duration: 10000 });
      else toast(data.message, { icon: '\u26a0\ufe0f', duration: 12000 });
      load();
    } catch (err) {
      // 409 = another loop already holds this article. 402/401/429 = the API
      // itself gave out, which is not a fact about the draft.
      setAutoRun((p) => ({
        ...(p || { attempts: 0, maxAttempts: MAX_AUTO_ATTEMPTS, timeline: [] }),
        running: false,
        phase: 'stopped',
        stoppedReason: err.response?.data?.message || 'The automatic cycle failed.',
      }));
      showClaudeError(err, 'Auto-repair failed');
    } finally {
      clearInterval(pollRef.current);
      pollRef.current = null;
      autoCycle.current = false;
      setWorking(false);
      setAutoState(null);
    }
  };

  // The manual button. Same cycle, same guard -- it is a fallback for a run
  // the operator wants to start again, not a second implementation.
  const autoRepair = (id) => runAutoRepair(id, { auto: false });

  return (
    <div>
      <PageHeader
        title="SEO Studio"
        subtitle="Generate and review SEO drafts. Approving a draft that has passed its checks makes it live on savelife.health at /guides/[slug]."
        action={
          <Btn variant="ghost" size="sm" onClick={() => load()} disabled={loading}>
            <RefreshCw size={13} /> Refresh
          </Btn>
        }
      />

      <div className="card mb-5">
        <SectionLabel>Generate a draft</SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          <Input label="Keyword *" value={keyword} placeholder="freezer box in Bangalore"
            onChange={(e) => setKeyword(e.target.value)} disabled={generating} />
          <Input label="Service" value={service} placeholder="freezer-box"
            onChange={(e) => setService(e.target.value)} disabled={generating} />
          <Input label="Location" value={location} placeholder="Bangalore"
            onChange={(e) => setLocation(e.target.value)} disabled={generating} />
        </div>
        <div className="mt-3">
          <Input label="Notes for the writer (optional)" value={notes}
            placeholder="Anything the draft must or must not say"
            onChange={(e) => setNotes(e.target.value)} disabled={generating} />
        </div>
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          {/* `working` covers an automatic cycle in flight as well as a manual
              recheck or repair. Generating during one would replace the draft on
              screen while the loop is still writing to it. */}
          <Btn onClick={generate} disabled={generating || working || !keyword.trim()}>
            <Sparkles size={14} />
            {generating ? 'Generating…' : working ? 'Busy…' : 'Generate Draft'}
          </Btn>
          <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text2)' }}>
            <input
              type="checkbox"
              checked={autoAfterGenerate}
              disabled={generating || working}
              onChange={(e) => setAutoAfterGenerate(e.target.checked)}
            />
            Repair &amp; recheck automatically if the checks fail
          </label>
          <span className="text-xs" style={{ color: 'var(--text3)' }}>
            Saves as a draft only. Rate limited to 5 generations a minute.
            Automatic repair never approves or publishes.
          </span>
        </div>
      </div>

      {generating && <GeneratingPanel seconds={elapsed} />}

      {!generating && selected && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Selected draft</SectionLabel>
            <Btn size="sm" variant="ghost" onClick={() => setSelected(null)}>
              <XCircle size={13} /> Close
            </Btn>
          </div>
          <ApiErrorBanner error={apiError} onDismiss={() => setApiError(null)} />
          <AutoProgress run={autoRun} />
          <DraftView
            article={selected}
            onStatus={changeStatus}
            onRecheck={recheck}
            onRepair={repair}
            onAutoRepair={autoRepair}
            autoState={autoState}
            working={working}
          />
        </div>
      )}

      <SectionLabel>All drafts</SectionLabel>
      <Tabs
        tabs={FILTERS.map((f) => ({
          ...f,
          label: counts[f.key] ? `${f.label} (${counts[f.key]})` : f.label,
        }))}
        active={filter}
        onChange={setFilter}
      />

      {loading ? <Spinner /> : articles.length === 0 ? (
        <Empty icon="🔍" message="No SEO drafts yet. Generate one above." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text3)' }} className="text-xs uppercase tracking-wide">
                <th className="text-left py-2 px-2">Keyword</th>
                <th className="text-left py-2 px-2">Title</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Words</th>
                <th className="text-left py-2 px-2">Checks</th>
                <th className="text-left py-2 px-2">Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a._id} className="border-t" style={{ borderColor: 'rgba(255,255,255,.06)' }}>
                  <td className="py-2.5 px-2 font-semibold">{a.keyword}</td>
                  <td className="py-2.5 px-2" style={{ color: 'var(--text2)' }}>{a.title}</td>
                  <td className="py-2.5 px-2"><StatusChip status={a.status} /></td>
                  <td className="py-2.5 px-2" style={{ color: 'var(--text2)' }}>{a.checks?.wordCount || 0}</td>
                  <td className="py-2.5 px-2">
                    {a.checks?.passed
                      ? <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--green)' }}><CheckCircle2 size={12} /> passed</span>
                      : <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--red)' }}><AlertTriangle size={12} /> failed</span>}
                  </td>
                  <td className="py-2.5 px-2 text-xs" style={{ color: 'var(--text3)' }}>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {a.updatedAt ? new Date(a.updatedAt).toLocaleString('en-IN') : '—'}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    <Btn size="sm" variant="ghost" onClick={() => openArticle(a._id)}>
                      <FileText size={12} /> Open
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
