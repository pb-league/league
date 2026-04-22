// ============================================================
// changelog.js — Revision history for Pickleball League Manager
// Update this file with each release. Entries are shown newest-first
// on the admin dashboard via the "What's New" link.
// ============================================================

const CHANGELOG = [
{
  version: '1.5.17',
  date: '2026-04-22',
  changes: [
    'Security: brute-force protection for player passwords — 30-second lockout after 2 failed attempts, 5-minute lockout after 5 failed attempts; login button shows countdown timer',
    'Security: admin login OTP — after a 2nd failed password attempt an email verification code (valid 10 minutes) is sent to the recovery email on file; incorrect or expired code locks the account for 15 minutes',
    'Security: if no recovery email is configured for the league, the admin is locked out for 15 minutes after 2 failed attempts with instructions to contact the app developer',
  ]
},
{
  version: '1.5.16',
  date: '2026-04-21',
  changes: [
    'Backup reminder: admin is prompted to download a JSON backup on login if more than 7 days since last backup; skipping resets the reminder to 3 days',
    'Offline scoresheet: download a self-contained HTML scoresheet from the Pairings tab, pre-filled with current session pairings, editable court names and session number, works without internet',
  ]
},
{
  version: '1.5.13',
  date: '2026-04-20',
  changes: [
    'Timer: pausing or resetting a timer now sends a push notification to players and waits for the backend save to complete before doing so — eliminates the race condition where players fetched stale (still-running) timer state',
    'Admin/player chat: background 25 s polling removed; chat badge updates are now push-triggered (zero background polling when not on the chat page)',
    'Audit log: every login attempt (player PIN, admin password, app manager) is now recorded to an audit_log tab on the registry spreadsheet — timestamp, league, player, role, success/fail, reason',
    'Timer opt-in: player dashboard now shows a "Show court timers" checkbox for leagues on the Max tier; polling only starts when the player opts in; preference is saved per league in localStorage',
  ]
},
{
  version: '1.5.10',
  date: '2026-04-20',
  changes: [
    'New customer onboarding: "Apply to Use League Manager" form now collects cell phone and league/tournament name; includes a link to the live demo',
    'New customer onboarding: app manager can view all applications (name, email, phone, league name, type, date, status) in a new Applications section of the admin panel — visible to app manager only',
    'New customer onboarding: app manager can approve an application with one click, which generates a unique setup password and emails the applicant a setup link',
    'New customer onboarding: approved applicants complete their league setup at setup.html — enter their temporary password, confirm league name and slug, choose storage backend, optionally provide a Google Sheet ID, and set an admin password; on success a direct login link is shown',
    'Bug fix: creating a Google Sheets league with no source league (e.g. via the new setup form) now correctly initialises the config sheet with leagueName and adminPin so the admin can log in',
    'Bug fix: fixed ReferenceError for effectiveCustomerId when adding a league with no source league',
    'Availability page: players are now warned with a confirmation dialog if they try to navigate away or close/refresh the page with unsaved changes to their profile (name, phone, email, notifications, contact sharing)',
  ]
},
{
  version: '1.5.9',
  date: '2026-04-19',
  changes: [
    'Admin assistants: new "My Profile" page in the admin sidebar (My Account section) — set availability, upload avatar, edit full name / phone / email / notification and contact-sharing prefs, and change password, all without needing to use the player app',
    'Attendance page: league coordinator\'s avatar and name now appear at the top of the attendance sheet; clicking the name opens their contact card',
    'Scoresheet: player names are now clickable underlined links that open a contact card pop-up (works in both the read-only scoresheet and the score-entry view)',
    'Dashboard: coordinator email address now shows the same tooltip as the phone number — "Email the coordinator — only works if this app is saved to your phone\'s home screen"',
    'Availability page: players can now update their full name and cell phone number in addition to email',
    'Availability page: new "Allow contact sharing" checkbox — when enabled, your email and phone are visible to other players on the attendance page (defaults to off; legacy leagues default to off)',
    'Attendance page (player & admin): each player row now shows their avatar alongside their handle',
    'Attendance page: player handle is now a clickable underlined link that opens a contact card pop-up',
    'Contact card: shows avatar, handle, full name, and (if the player has enabled sharing) their email and phone number',
    'Contact card: clicking an email address opens the native email app; clicking a phone number opens the native SMS/texting app',
    'Contact card: "Add to Contacts" button generates a .vcf file — on mobile this opens the native contacts app with the info pre-filled; on desktop the file downloads',
    'Bug fix: spectator-role players no longer appear in standings',
    'Player config: new Donation fields — admin can record the amount and method (Venmo / Buy Me a Coffee / Other) for a supporter; a gold star ⭐ appears on their avatar in the player list',
    'Player accordion: the expand/collapse triangle (▼/▲) now correctly flips when opening or closing a player row',
    'Basic tier: delete player, delete/create league, and change password actions are now disabled for leagues on the Basic tier',
    'App Manager: changing the admin password no longer requires entering the current admin password — the confirmation modal is bypassed for the app manager',
    'Feedback form: Buy Me a Coffee ☕ link added alongside the Venmo link; supporter donations received via BMAC webhook are logged and viewable by the app manager in a new Supporter Donations card',
  ]
},
{
  version: '1.5.8',
  date: '2026-04-18',
  changes: [
    'Export: new "Export / Backup League Data" card in Setup — downloads all league data (config, players, pairings, scores, attendance, queue, challenges)',
    'Export JSON: complete backup that can be reimported to create a new league; player photos and Stripe keys are included in JSON',
    'Export CSV: human-readable multi-section file openable in Excel or Google Sheets; player photos and Stripe keys are omitted — CSV is view-only and cannot be reimported',
    'Import: new "Import from JSON" button in All Leagues — creates a new Google Sheets league from a JSON backup; pre-fills league name and ID from the file; admin password is always set fresh on import',
    'Import: Stripe secret keys and coordinator photos are intentionally not restored; all other config, players, pairings, scores, attendance, queue, and challenges are written to the new spreadsheet',
  ]
},
{
  version: '1.5.7',
  date: '2026-04-18',
  changes: [
    'Login page: Register button moved to appear directly below the player name dropdown, before the Admin Login button',
    'Login page: a small spinning indicator now appears immediately in the registration area while availability is being checked, so players know something is loading',
    'Login page: config (registration availability) is now pre-fetched in parallel with the player list as soon as a league is selected — in most cases the Register button appears at the same time as the player list instead of several seconds later',
    'Login page: league name, org ID, and direct league ID fields now use autocomplete="new-password" to prevent Edge/Chrome from filling them with saved profile data',
  ]
},
{
  version: '1.5.6',
  date: '2026-04-18',
  changes: [
    'Bug fix: player dashboard personal login URL now correctly includes ?id=<customerID> for org-scoped leagues — previously relied only on the stored leagueUrl field, which is not always populated; now also checks the session-stored customer ID saved at login time',
  ]
},
{
  version: '1.5.5',
  date: '2026-04-18',
  changes: [
    'Ladder league: win % standings table now shown below the ladder points table on both the Season and Session tabs — pairings still use ladder points for ranking',
    'Ladder league: new session ranking bonus — configurable extra points for finishing 1st / 2nd / 3rd in a session by win % (set in Setup → Ladder League → Point Schedule)',
    'Ladder standings table: new "S.Rnk" column shows session ranking bonus points per player (column appears only when any bonus is configured)',
    'Ladder points legend now lists the session ranking bonus rates alongside attend/play/range points',
  ]
},
{
  version: '1.5.3',
  date: '2026-04-18',
  changes: [
    'Stripe registration: after payment, the app now auto-completes registration using the saved form data — no manual form submission required',
    'Stripe registration: on successful payment and registration, a dedicated confirmation page is shown ("You\'re registered — pending approval") instead of returning to the login page',
    'Stripe registration: if auto-registration fails (e.g. handle taken), the form is pre-filled with payment confirmed so the player can correct and resubmit',
    'Stripe checkout page now shows richer event details — location, session time, coordinator name — in the product description',
    'Bug fix: Stripe return URL now preserves ?league= and ?id= parameters so the correct league is loaded on return (customer-scoped leagues were not being found)',
    'Bug fix: GAS now correctly appends payment_success and session_id with & when the return URL already contains query parameters (was generating double-? URLs)',
  ]
},
{
  version: '1.5.2',
  date: '2026-04-18',
  changes: [
    'Self-hosted Supabase: league admins can now use their own Supabase account as storage — select "Self-hosted Supabase" when creating a league',
    'Self-hosted Supabase: SQL setup script provided in the creation form — copy to clipboard and run in your Supabase SQL Editor',
    'Self-hosted Supabase: Validate Connection button checks all 11 required tables before saving',
    'Self-hosted Supabase: storage badge shows "Own Supabase" (blue) in the All Leagues list',
    'Self-hosted Supabase: migration to/from self-hosted Supabase fully supported',
    'Bug fix: Stripe pay button gave "API.post is not a function" — fixed by adding named createCheckoutSession and confirmPayment methods to API',
    'League URL on admin dashboard now always shows correct ?id= when league has a Customer ID, even when navigated directly without it in the URL',
    '"Edit Limits & Tier" modal renamed to "Edit Limits, Tier & Customer ID" to surface that field',
  ]
},
{
  version: '1.5.1',
  date: '2026-04-17',
  changes: [
    'Stripe checkout automated — admin provides their Stripe secret key in Setup; app creates hosted Checkout Sessions server-side (no manual payment link setup needed)',
    'After Stripe payment, registration form auto-restores and confirms payment via session ID',
    'APP_BASE_URL constant in settings.js and Code.gs — single place to update if the hosting URL changes',
    'League URLs now correctly include ?id=<customerID> when a league belongs to a customer org',
    'All Leagues view: customerID-scoped leagues now visible to their own admin; app manager sees all leagues',
    'Tournament promotion page can be saved as a standalone HTML file for external hosting',
  ]
},
{
  version: '1.5.0',
  date: '2026-04-14',
  changes: [
    'Add Supabase storage backend — individual leagues can now be stored in Supabase instead of Google Sheets',
    'League registry stays in Google Sheets; per-league storage is chosen at creation time',
    'New league form: Storage Backend selector (Google Sheets / Supabase); Sheet ID field hides when Supabase is selected',
    'Leagues table: shows "Supabase" badge for Supabase-backed leagues instead of Sheet ID',
    'Migration functions: copy all league data between Google Sheets and Supabase in either direction',
    'All data operations (config, players, attendance, pairings, scores, queue, timers, push subscriptions, challenges, chat) supported in Supabase',
  ]
},
{
  version: '1.4.17',
  date: '2026-04-14',
  changes: [
    'Replace flat player table with collapsible accordion list',
    'Add Full Name and Cell Phone fields to player info (admin) and self-registration form',
    'H2H page: add Sort dropdown — alphabetical, initial rank, or overall rank (ladder-aware)',
    'add Ladder League support',
    'add player Avatars',
    'add player chat',
    'add queue-based pairing for open-play style league',
    'add ability for admin to setup certain pairs or matches before generate fills in rest',
    'in ladder-leagues allow players to issue challenges to other players',
    'improve tournament pairing to support mixed-doubles',
    'add singles tournament with reseeding option',
    'allow attendance sheet to be sorted by gender or rank'
]
  },


  {
    version: '1.4.6',
    date: '2026-04-05',
    changes: [
      'remove Games and Byes columns from overall and session standings tables',
      'session standings now show overall season rank through that session',
      'session standings now show change in overall rank vs. previous session',
    ]},
{
    version: '1.4.5',
    date: '2026-04-4',
    changes: ['add timers with display on players dashboard if they are on a related court',
   'support push notifications on timer start, warn, stop'
]},
{
    version: '1.4.4',
    date: '2026-04-3',
    changes: ['add Push notifications (currently only allowed by app dev)',
'ensure attendance changes get recorded',
'change PIN entry to password and use full keyboard',
'clean up league entry form',
'allow league admin to be sender of messages',
'auto set league admin to have access to sheet created by app'
]},
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
