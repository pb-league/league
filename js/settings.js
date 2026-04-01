// ============================================================
// settings.js — Deployment configuration
//
// Edit this file when deploying:
//   - Update GAS_URL after each new GAS deployment
//   - Bump APP_VERSION and APP_BUILD_DATE with each release
//
// This file is loaded first in all HTML pages so these
// constants are available to api.js and admin.js.
// ============================================================

// Google Apps Script Web App URL
// After deploying a new version in GAS, paste the URL here.
 // for BETA
//const GAS_URL = 'https://script.google.com/macros/s/AKfycbyyOWnHgNGf7JOJqHteSLmu7h1fIc0ZJfmuKJ1-xIjWVuR4b07DXWgAu10LhIrnQTNTAQ/exec';

// For release
 const GAS_URL = 'https://script.google.com/macros/s/AKfycbzudYO4IDqCJt92kR4gu6dVJyGN5LoKtxpD3RYR1pNHepxU_liEdpogjCnE8mWTOXqU/exec';

// App version — bump when deploying changes
const APP_VERSION    = '1.3.7';
const APP_BUILD_DATE = '2026-04-01';

// Google Analytics 4 Measurement ID
// Set to your GA4 property ID (format: G-XXXXXXXXXX) to enable analytics.
// Leave as empty string '' to disable — no tracking code will load.
const GA_MEASUREMENT_ID = 'G-N7VXLGFSHX';

// ── Config sanitizer ────────────────────────────────────────
// Normalizes raw config values from the server (which may be strings,
// numbers, or booleans depending on how Sheets stored them) into
// consistent types. Called every time state.config is assigned.
// Prevents NaN/undefined from propagating into critical calculations.
function sanitizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const c = { ...raw };

  // Helper converters
  const int  = (v, def) => { const n = parseInt(v);   return isFinite(n) ? n : def; };
  const flt  = (v, def) => { const n = parseFloat(v); return isFinite(n) ? n : def; };
  const bool = (v, def) => v === true || v === 'true' ? true : v === false || v === 'false' ? false : def;
  const str  = (v, def) => (v !== undefined && v !== null && v !== '') ? String(v) : def;

  // Integer fields
  c.courts          = int(c.courts,          3);
  c.weeks           = int(c.weeks,           8);
  c.gamesPerSession = int(c.gamesPerSession, 7);
  c.optimizerTries  = int(c.optimizerTries, 100);
  c.swapPasses      = (v => isFinite(parseInt(v)) ? parseInt(v) : 5)(c.swapPasses);
  c.maxPendingReg   = int(c.maxPendingReg,  10);

  // Float fields (optimizer weights)
  const D = typeof Pairings !== 'undefined' ? Pairings.DEFAULTS : {};
  c.wSessionPartner  = flt(c.wSessionPartner,  D.sessionPartnerWeight  ?? 50);
  c.wSessionOpponent = flt(c.wSessionOpponent, D.sessionOpponentWeight ?? 20);
  c.wHistoryPartner  = flt(c.wHistoryPartner,  D.historyPartnerWeight  ?? 10);
  c.wHistoryOpponent = flt(c.wHistoryOpponent, D.historyOpponentWeight ?? 3);
  c.wByeVariance     = flt(c.wByeVariance,     D.byeVarianceWeight     ?? 20);
  c.wSessionBye      = flt(c.wSessionBye,      D.sessionByeWeight      ?? 30);
  c.wRankBalance     = flt(c.wRankBalance,     D.rankBalanceWeight     ?? 15);
  c.wRankStdDev      = flt(c.wRankStdDev,      D.rankStdDevWeight      ?? 8);

  // Boolean fields
  c.localImprove        = bool(c.localImprove,        true);
  c.useInitialRank      = bool(c.useInitialRank,       false);
  c.adminOnlyEmail      = bool(c.adminOnlyEmail,       false);
  c.allowRegistration   = bool(c.allowRegistration,    false);

  // String fields (keep as-is but ensure they're strings, not null/undefined)
  if (c.leagueName   !== undefined) c.leagueName   = str(c.leagueName,   '');
  if (c.location     !== undefined) c.location     = str(c.location,     '');
  if (c.sessionTime  !== undefined) c.sessionTime  = str(c.sessionTime,  '');
  if (c.notes        !== undefined) c.notes        = str(c.notes,        '');
  if (c.rules        !== undefined) c.rules        = str(c.rules,        '');
  if (c.leagueUrl    !== undefined) c.leagueUrl    = str(c.leagueUrl,    '');
  if (c.replyTo      !== undefined) c.replyTo      = str(c.replyTo,      '');
  if (c.gameMode     !== undefined) c.gameMode     = str(c.gameMode,     'doubles');
  if (c.rankingMethod !== undefined) c.rankingMethod = str(c.rankingMethod, 'avgptdiff');
  if (c.adminPin     !== undefined) c.adminPin     = str(c.adminPin,     '');

  return c;
}
