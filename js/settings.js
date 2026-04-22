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
// for beta
 // const GAS_URL = 'https://script.google.com/macros/s/AKfycbyyOWnHgNGf7JOJqHteSLmu7h1fIc0ZJfmuKJ1-xIjWVuR4b07DXWgAu10LhIrnQTNTAQ/exec';

// for release
 const GAS_URL = 'https://script.google.com/macros/s/AKfycbzudYO4IDqCJt92kR4gu6dVJyGN5LoKtxpD3RYR1pNHepxU_liEdpogjCnE8mWTOXqU/exec';

// Base URL of the hosted app — update this if the hosting site changes.
// Must end with a trailing slash.
const APP_BASE_URL = 'https://pb-league.github.io/league/';

// App version — bump when deploying changes
const APP_VERSION    = '1.5.17';
const APP_BUILD_DATE = '2026-04-22';

const TIERS = [
{
    version: 'Basic',
    description: 'only essential features. Admin handles attendance, scoring, messaging. No player use of app.',
    disableList: [
      'messaging',
      'pushNotifications',
      'hostedDb',
      'timers',
      'tournamentPairings',
      'queuePairings',
      'ladderLeague',
      'headToHead',
      'playerReport',
      'playerRegistration',
      'playerAttendance',
      'playerLogin',
      'playerScoring',
      'pairingEditor',
      'finalRoundAnalysis',
      'arrangeGames',
      'challenges',
      'playerPhotos',
      'createLeagues',
      'deleteLeagues',
      'deletePlayers',
      'changePasswords'
    ],

  },
  {
    version: 'Mid',
    description: ' more report options, players can view scores and reports.',
    disableList: [
      'messaging',
      'pushNotifications',
      'timers',
      'queuePairings',
      'tournamentPairings',
      'ladderLeague',
      'headToHead',
      'playerReport',
      'playerRegistration',
      'playerAttendance',
      'playerScoring',
      'finalRoundAnalysis',
      'arrangeGames',
      'challenges',
      'playerPhotos'
    ],
  },
  {
    version: 'Max',
    description: 'everything enabled.  In-app messaging,  email based attendance updates, More reports, Tournament mode, queued player pairing option, in-app Messaging, players help score, notifications to players, players can register, final round outcome analysis.',
    disableList: []
  }
]

// Push notification pre-send delay (seconds).
// Push notifications take several seconds to reach players after the GAS relay.
// Setting this > 0 causes the timer to send warn/end pushes this many seconds
// before the visual event, so the notification arrives in sync with the display.
// The START push is sent immediately when the button is pressed; the timer shows
// a "Starting in N…" countdown before the clock begins ticking.
const TIMER_PUSH_DELAY_SECS = 6;

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
  c.challengesEnabled   = bool(c.challengesEnabled,    false);

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
  c.pairingMode      = str(c.pairingMode      ?? 'round-based', 'round-based');
  c.standingsMethod  = str(c.standingsMethod  ?? 'standard',    'standard');
  c.ladderAttendPts    = flt(c.ladderAttendPts,    2);
  c.ladderPlayPts      = flt(c.ladderPlayPts,      1);
  c.ladderRange1Min    = flt(c.ladderRange1Min,   -99);
  c.ladderRange1Max    = flt(c.ladderRange1Max,    -1);
  c.ladderRange1Pts    = flt(c.ladderRange1Pts,     3);
  c.ladderRange2Min    = flt(c.ladderRange2Min,     0);
  c.ladderRange2Max    = flt(c.ladderRange2Max,     3);
  c.ladderRange2Pts    = flt(c.ladderRange2Pts,     2);
  c.ladderRange3Min    = flt(c.ladderRange3Min,     4);
  c.ladderRange3Max    = flt(c.ladderRange3Max,     6);
  c.ladderRange3Pts    = flt(c.ladderRange3Pts,     1);
  c.ladderRange4Min    = flt(c.ladderRange4Min,     7);
  c.ladderRange4Max    = flt(c.ladderRange4Max,    99);
  c.ladderRange4Pts    = flt(c.ladderRange4Pts,     0);
  c.ladderRange5Min    = flt(c.ladderRange5Min,     0);
  c.ladderRange5Max    = flt(c.ladderRange5Max,     0);
  c.ladderRange5Pts    = flt(c.ladderRange5Pts,     0);
  c.ladderRange6Min    = flt(c.ladderRange6Min,     0);
  c.ladderRange6Max    = flt(c.ladderRange6Max,     0);
  c.ladderRange6Pts    = flt(c.ladderRange6Pts,     0);
  c.ladderRank1Pts   = flt(c.ladderRank1Pts,   0);
  c.ladderRank2Pts   = flt(c.ladderRank2Pts,   0);
  c.ladderRank3Pts   = flt(c.ladderRank3Pts,   0);
  c.queueWinnerStay  = int(c.queueWinnerStay,  0);
  c.queueWinnerSplit = str(c.queueWinnerSplit  ?? 'none',        'none');
  c.wQueueWait       = flt(c.wQueueWait,        10);
  if (c.adminPin     !== undefined) c.adminPin     = str(c.adminPin,     '');
  if (c.emailScriptUrl    !== undefined) c.emailScriptUrl    = str(c.emailScriptUrl,    '');
  if (c.emailScriptSecret !== undefined) c.emailScriptSecret = str(c.emailScriptSecret, '');


  return c;
}
