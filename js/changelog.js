// ============================================================
// changelog.js — Revision history for Pickleball League Manager
// Update this file with each release. Entries are shown newest-first
// on the admin dashboard via the "What's New" link.
// ============================================================

const CHANGELOG = [
{
    version: '1.3.7',
    date: '2026-03-31',
    changes: [
'log each score written as a backup should the score database get corrupted',
'issue warning if tie scores are saved',
'fix issues with four players getting asigned buys even though a court is available',
'fix issue with initial rankings not properly factoring in to force like-ranked players on same court when multiple people have same rank',
'added verbose mode for generate to show histogram of the scores checked',
'add swap feature where admin can swap between best and 2nd best pairings to see difference in calculation and pick which to use',
'warn if navigate away from player changes or pairing generation without saving',
'add option to use initial rankings instead of season standings for any pairing generation',
'fix bug with adminOnlyEmail not working',
'add refresh to player standings report',
'add buttons in email to request attendance update to support updating all remaining games',
'add ability to request player report through URL command, and included in request for attendance email',
'add ability to include standings in message to players',
'add analysis of each players scenarios for placing. Only shown when reach last round of last session',
'prevent score entry sheet from temporary clearing if anohter user is viewing scores'
]},
{
    version: '1.3.4',
    date: '2026-03-29',
    changes: [
'improve clearing of cached files',
'support email attendance recording',
'remove SIT-OUT as option since redundant with OUT',
'rearrange admin config to put generate weights with pairing',
'put messaging tasks on own menu tab'
]},

  {
    version: '1.3.1',
    date: '2026-03-28',
    changes: [
      'Admin can now change league name in registry',
      'Admin configure to only send report emails to admin.',
      'added player participation calculation and shown in results',
      'clean up formatting',
      'improve on pairing algorithm',
      'show URL for logging directly in on player dashboard',
      'for mixed doubles show number of M,F.E at bottom of attendance',
      'show players their upcoming games on dashboard',
      'allow admin to save or print the pairings',
      'make swapping optimization step optional and with an interaction count',
      'show generation progress',
      'warn if pairings have not yet been saved',
      'improve score entry to not lose focus and to prevent overwriting scores if entered too fast',
      'put generation in background task so webpage does not timeout if takes too long'
    ]
  },{
    version: '1.1.0',
    date: '2026-03-24',
    changes: [
      'Added Role System: App Manager, League Admin, Admin Assistant, Scorer, Spectator, Sub, Player roles',
      'Admin Assistants now routed to admin.html via player PIN login with restricted access',
      'Added Sit Out attendance state for mid-session player withdrawal',
      'Added PEND status for self-registered players pending admin approval',
      'Approval email sent automatically when admin activates a pending player',
      'Added Customer ID / Organisation ID field to registry for multi-tenant URL filtering',
      'index.html?id=<orgId> filters leagues to that organization only',
      'Find My League section on login page for players who don\'t know their org ID',
      'remember last used session and default session selection to that.',
      'edit pairings now also edits the corresponding score data.',
      'scores same immediately after recording both scores of a game to avoid loss.',
      'Pending Approval stat tile on dashboard when registrations await review',
      'Player report now shows Faced as Opponent and Played as Partner frequency tables',
      'Generate button now shows session number (e.g. Generate Pairings for Session 3)',
      'Added help.html — in-browser user guide with search and deep-link anchors',
      'Help link added to admin sidebar',
      'Registration form: renamed Player Name to Player Handle, moved email notify checkbox',
      'Registration form: gender group labelled as mixed-doubles only',
    
    
    ]
  },
  {
    version: '1.0.0',
    date: '2026-03-16',
    changes: [
      'Initial release',
      'Multi-league support with master registry Google Sheet',
      'Pairing optimizer with configurable weights and weight calibration',
      'Three tournament modes: Single Elimination, Double Elimination, Round Robin Reseeded',
      'Player dashboard with two-phase fast load',
      'Self-registration with invite code and admin approval',
      'Email reports: session results, tournament results, league message, player report',
      'Attendance grid with present/absent/TBD states',
      'Season and session standings with ranking trend chart',
      'Head-to-head player comparison',
      'URL shortcuts: ?league=, ?player= for pre-filled login',
      'Warmup trigger support to eliminate GAS cold-start delays',
    ]
  }
];
