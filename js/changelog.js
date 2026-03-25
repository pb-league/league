// ============================================================
// changelog.js — Revision history for Pickleball League Manager
// Update this file with each release. Entries are shown newest-first
// on the admin dashboard via the "What's New" link.
// ============================================================

const CHANGELOG = [
  {
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
