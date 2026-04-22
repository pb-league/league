// ── Google Analytics helpers ─────────────────────────────────
function gaEvent(eventName, params = {}) {
  try {
    if (typeof gtag === 'function' && window.__gaReady) gtag('event', eventName, params);
  } catch(e) {}
}
function gaPage(pageName) {
  try {
    if (typeof gtag === 'function' && window.__gaReady)
      gtag('event', 'page_view', { page_title: pageName, page_location: window.location.href });
  } catch(e) {}
}

// ── Photo / avatar utilities ──────────────────────────────────

function resizeImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 200;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75).split(',')[1]);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function generateInitialAvatar(name, size) {
  size = size || 40;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const palette = ['#c84c4c','#c87c38','#9a8c28','#3a9e50','#2e8eb4','#4060c0','#8044b8','#b04488'];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  ctx.fillStyle = palette[hash % palette.length];
  const r = size / 2;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${Math.round(size * 0.46)}px sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(((name || '?')[0]).toUpperCase(), r, r + Math.round(size * 0.03));
  return canvas.toDataURL('image/png');
}

function playerPhotoSrc(name, photo, size) {
  if (photo) return 'data:image/jpeg;base64,' + photo;
  return generateInitialAvatar(name, size || 40);
}

// Returns true if the given feature is enabled for the supplied tier string.
function tierAllows(tier, feature) {
  if (!tier || typeof TIERS === 'undefined') return true;
  const def = TIERS.find(t => t.version.toLowerCase() === tier.toLowerCase());
  if (!def) return true;
  return !(def.disableList || []).includes(feature);
}

// Builds the podium HTML for the top-3 season finishers.
// topThree    — array of standings objects sorted by rank (index 0 = 1st place)
// photoMap    — { name: base64photoString }
// photosOn    — boolean, whether photo avatars are enabled for this tier
// seasonComplete — boolean, whether the season is over (affects title label)
// fullNameMap — optional { handle: fullName } — shows full name when available
function buildPodiumHTML(topThree, photoMap, photosOn, seasonComplete, fullNameMap) {
  if (!topThree || topThree.length < 3) return '';
  const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const _fnMap = fullNameMap || {};

  // Visual order: 2nd (left), 1st (centre/tallest), 3rd (right)
  const slots = [
    { s: topThree[1], label: '🥈 2nd', height: 68,  grad: 'rgba(192,192,192,0.25)', border: 'rgba(192,192,192,0.5)' },
    { s: topThree[0], label: '🥇 1st', height: 96,  grad: 'rgba(245,200,66,0.25)',  border: 'rgba(245,200,66,0.6)'  },
    { s: topThree[2], label: '🥉 3rd', height: 48,  grad: 'rgba(205,127,50,0.25)',  border: 'rgba(205,127,50,0.5)'  },
  ];

  const slotHtml = slots.map(({ s, label, height, grad, border }) => {
    const photo = photosOn ? (photoMap[s.name] || '') : '';
    const avatarHtml = photosOn
      ? `<img src="${playerPhotoSrc(s.name, photo, 60)}"
           style="width:60px;height:60px;border-radius:50%;object-fit:cover;
                  border:2px solid ${border};margin-bottom:5px;flex-shrink:0;">`
      : '';
    const displayName = _fnMap[s.name] || s.name;
    const nameHtml = `<div style="font-size:0.76rem;font-weight:600;color:var(--white);
        text-align:center;margin-bottom:5px;width:110px;
        line-height:1.3;word-break:break-word;overflow-wrap:break-word;">${_esc(displayName)}</div>`;
    const blockHtml = `<div style="width:110px;height:${height}px;
        background:${grad};border:1px solid ${border};
        border-radius:6px 6px 0 0;display:flex;align-items:center;
        justify-content:center;font-size:0.82rem;font-weight:700;color:var(--white);">${label}</div>`;
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
      ${avatarHtml}${nameHtml}${blockHtml}
    </div>`;
  }).join('');

  const title = seasonComplete ? '🏆 Season Champions' : 'Season Leaders';
  return `<div style="text-align:center;padding-bottom:4px;margin-bottom:8px;">
    <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;
        color:var(--muted);margin-bottom:2px;">${title}</div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:6px;padding-top:12px;">
      ${slotHtml}
    </div>
  </div>`;
}

// ── QR Code modal ────────────────────────────────────────────
function showLeagueQR(event, url, leagueName) {
  event.preventDefault();
  const modal = document.getElementById('qr-modal');
  const wrap  = document.getElementById('qr-canvas-wrap');
  const label = document.getElementById('qr-url-label');
  const title = document.getElementById('qr-modal-title');
  if (!modal || !wrap) return;

  if (title) title.textContent = leagueName ? `${leagueName} — QR Code` : 'League QR Code';
  label.textContent = url;
  wrap.innerHTML = ''; // clear previous

  if (typeof QRCode === 'undefined') {
    wrap.innerHTML = '<p style="color:#333; font-size:0.8rem;">QR library not loaded.<br>Check your internet connection.</p>';
  } else {
    new QRCode(wrap, {
      text: url,
      width: 220,
      height: 220,
      colorDark: '#0d1b2a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M,
    });
  }

  // Download button
  document.getElementById('btn-qr-download').onclick = () => {
    const canvas = wrap.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = 'league-qr.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  modal.style.display = 'flex';
  modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
}

// ── Tier info popup ──────────────────────────────────────────
function showTierInfo(currentTier) {
  const modal = document.getElementById('tier-info-modal');
  if (!modal) return;

  const allFeatures = [
    { key: 'messaging',          label: 'Messaging' },
    { key: 'pushNotifications',  label: 'Push Notifications' },
    { key: 'hostedDb',           label: 'Hosted DB (auto-create sheets)' },
    { key: 'timers',             label: 'Game Timers' },
    { key: 'tournamentPairings', label: 'Tournament Pairings' },
    { key: 'queuePairings',      label: 'Queue-Based Pairings' },
    { key: 'ladderLeague',      label: 'Ladder League mode' },
    { key: 'headToHead',         label: 'Head-to-Head Stats' },
    { key: 'playerReport',       label: 'Player Reports' },
    { key: 'playerRegistration', label: 'Player Self-Registration' },
    { key: 'playerLogin',        label: 'Player Login' },
    { key: 'playerScoring',      label: 'Player Score Entry' },
    { key: 'pairingEditor',      label: 'Pairing / Score Editor' },
    { key: 'finalRoundAnalysis', label: 'Report scenarios for players to place'},
    { key: 'arrangeGames',       label: 'Admin can setup custom partners or opponents before auto-generate of remaining players'},
    { key: 'challenges',         label: 'Players can challenge others to matchups in Ladder League'},
    { key: 'playerPhotos',       label: 'players can provide avatar image'}
  ];

  const tierDefs = typeof TIERS !== 'undefined' ? TIERS : [];
  const norm = s => s ? s.toLowerCase() : '';

  let headerRow = `<th style="text-align:left; padding:6px 16px 10px 0; font-size:0.72rem;
    color:var(--muted); letter-spacing:0.06em; text-transform:uppercase;">Feature</th>`;
  tierDefs.forEach(t => {
    const isCurrent = norm(t.version) === norm(currentTier);
    headerRow += `<th style="text-align:center; padding:6px 12px 10px;
      font-size:0.82rem; font-weight:700;
      color:${isCurrent ? 'var(--green)' : 'var(--muted)'};">
      ${t.version}${isCurrent ? ' <span style="font-size:0.6em;">▲ current</span>' : ''}
    </th>`;
  });

  let rows = '';
  allFeatures.forEach((f, idx) => {
    const rowBg = idx % 2 === 0 ? '' : 'background:rgba(255,255,255,0.02);';
    rows += `<tr style="${rowBg}">`;
    rows += `<td style="padding:7px 16px 7px 0; font-size:0.82rem; color:var(--white);">${f.label}</td>`;
    tierDefs.forEach(t => {
      const disabled = (t.disableList || []).includes(f.key);
      const isCurrent = norm(t.version) === norm(currentTier);
      rows += `<td style="text-align:center; padding:7px 12px;
        ${isCurrent ? 'background:rgba(94,194,106,0.06);' : ''}">
        ${disabled
          ? '<span style="color:rgba(255,255,255,0.2); font-size:0.85rem;">✕</span>'
          : '<span style="color:var(--green); font-size:0.9rem;">✓</span>'}
      </td>`;
    });
    rows += '</tr>';
  });

  document.getElementById('tier-info-table').innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  modal.style.display = 'flex';
  modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
}

// ── Role display config ──────────────────────────────────────
const ROLE_ORDER  = ['admin','assistant','scorer','','sub','spectator','pend'];
const ROLE_LABELS = {
  admin: '⚙️ League Admin', assistant: '🤝 Admin Assistant',
  scorer: '✏️ Scorer', '': '🎾 Players',
  sub: '🔄 Substitutes', spectator: '👁 Spectators', pend: '⏳ Pending Approval'
};
const ROLE_COLORS = {
  admin: 'rgba(45,122,58,0.25)', assistant: 'rgba(122,155,181,0.2)',
  scorer: 'rgba(94,194,106,0.15)', '': 'rgba(255,255,255,0.06)',
  sub: 'rgba(232,184,75,0.12)', spectator: 'rgba(232,184,75,0.08)',
  pend: 'rgba(224,85,85,0.12)'
};

// ============================================================
// admin.js — Admin dashboard logic
// ============================================================

(async function init() {
  const session = Auth.requireAuth(true);
  if (!session) return;
  document.getElementById('topbar-name').textContent = session.name;

  // Display role badge and apply restrictions
  const userRole = session.role || (session.isAdmin ? 'admin' : 'player');
  const isManager   = userRole === 'manager';
  const isAdmin     = userRole === 'admin' || isManager;
  const isAssistant = userRole === 'assistant';
  const canManagePlayers = isAdmin || isManager; // assistants cannot see player sensitive data
  const canDeleteScores  = isAdmin || isManager; // assistants can enter but not delete/overwrite
  const canDeletePairings = isAdmin || isManager; // assistants cannot clear pairings

  const roleLabels = { manager: '★ App Manager', admin: 'League Admin', assistant: 'Admin Assistant', scorer: 'Scorer', sub: 'Sub', player: 'Player' };
  const roleColors = { manager: 'rgba(232,184,75,0.2)', admin: 'rgba(45,122,58,0.15)', assistant: 'rgba(42,63,84,0.8)' };
  const roleEl = document.getElementById('topbar-role');
  if (roleEl) {
    roleEl.textContent = roleLabels[userRole] || userRole;
    roleEl.style.background = roleColors[userRole] || 'rgba(255,255,255,0.07)';
    if (userRole === 'manager') roleEl.style.color = 'var(--gold)';
    else if (userRole === 'admin') roleEl.style.color = 'var(--green)';
  }

  // Apply nav visibility based on role
  function applyNavVisibility() {
    // Leagues: visible to admin and manager only
    document.querySelectorAll('.nav-item[data-page="leagues"]').forEach(el =>
      el.classList.toggle('hidden', !isAdmin && !isManager)
    );
    // Applications: visible to app manager only
    document.querySelectorAll('.nav-item[data-page="applications"]').forEach(el =>
      el.classList.toggle('hidden', !isManager)
    );
    // Players: hidden from assistants
    document.querySelectorAll('.nav-item[data-page="players"]').forEach(el =>
      el.classList.toggle('hidden', isAssistant)
    );
    // Setup: hidden from assistants (contains admin PIN, weights, league settings)
    document.querySelectorAll('.nav-item[data-page="setup"]').forEach(el =>
      el.classList.toggle('hidden', isAssistant)
    );
    // These pages are always visible to all admin roles — explicitly ensure never hidden
    // (skip items that were hidden by tier restrictions)
    ['pairings', 'scores', 'attendance', 'standings', 'player-report', 'head-to-head', 'dashboard'].forEach(page => {
      document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(el => {
        if (!el.dataset.tierHidden) el.classList.remove('hidden');
      });
    });
  }
  applyNavVisibility();

  // Show push notification and donations cards for App Manager only
  if (isManager) {
    document.getElementById('push-notif-card')?.classList.remove('hidden');
    document.getElementById('donations-card')?.classList.remove('hidden');
  }

  // Grey out restricted buttons for assistants so it's visually clear
  if (isAssistant) {
    ['btn-save-config', 'btn-send-message', 'btn-add-player', 'btn-save-players',
     'btn-send-report', 'btn-send-tourn-report', 'btn-clear-pairings'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.disabled = true; el.title = 'Not available for Admin Assistants'; }
    });
  }

  if (session.leagueName) {
    document.querySelector('.topbar-brand').innerHTML =
      `<img src="img/pb_rot.gif" style="width:22px;height:22px;vertical-align:middle;margin-right:4px;object-fit:contain;" alt=""><span>${esc(session.leagueName)}</span> <span style="color:var(--muted);font-size:0.75rem;font-weight:400;margin-left:4px;">Admin</span>`;
  }

  // ── State ──────────────────────────────────────────────────
  let state = {
    config: {}, players: [], attendance: [],
    pairings: [], scores: [], standings: [],
    queue: [],           // queue-based pairing: [{player, waitWeight, stayGames}]
    currentPairWeek: 1, currentScoreWeek: 1,
    currentStandWeek: 1, currentTournWeek: 1, pendingPairings: null,
    tournaments: {},   // { [week]: { week, mode, round, seeds } }
    challenges: [],    // active challenges from the challenges sheet
    bestGeneration: null, // { score, pairings, breakdown, normalizedWeights, inputHash, totalTries }
    saveLocks: {},        // per-week save queue to prevent concurrent writes
    _scoresheetLoading: false, // nav fetch in flight — block background re-renders
    _scoresheetTouched: false, // user has typed in scoresheet — block background re-renders
    _pairSkipPlayers: new Set(), // players temporarily excluded from the next round-based generate
    _arrangeGrid: null,         // pre-arranged court layout for round 1: array[court][seat] = name|null
    _arrangeSitOut: new Set(),  // players excluded from all rounds via the arrange grid sit-out zone
    _arrangeOpen: false,        // whether the arrange grid panel is expanded
    _arrangeGridWeek: null,     // week the grid was last initialized (resets on week change)
    adminChatMessages: [],      // all visible chat messages, newest last
    adminChatLastId: 0,         // highest message id seen — used for incremental polling
    adminChatPollTimer: null,   // setInterval handle for background chat polling
    currentLeagueCustomerId: null, // customerId from registry for the logged-in league; set by renderLeagues
  };

  // Helper: returns relay config from state.config for inclusion in email API calls.
  // This lets Code.gs route emails through the admin's personal Apps Script if configured.
  function getRelayConfig() {
    return {
      emailScriptUrl:    state.config.emailScriptUrl    || '',
      emailScriptSecret: state.config.emailScriptSecret || '',
    };
  }

  // Helper: build the canonical league URL including ?id= when the league has a customerID.
  // Uses three sources in priority order so it is correct even when config.leagueUrl is stale
  // (e.g. customerID was assigned after the league was created).
  function getLeagueUrl() {
    const c   = state.config;
    const lid = Auth.getSession()?.leagueId || '';
    const cid = state.currentLeagueCustomerId
      || sessionStorage.getItem('pb_customer_id')
      || (c.leagueUrl || '').match(/[?&]id=([^&]+)/)?.[1]
      || '';
    return lid
      ? APP_BASE_URL + 'index.html?league=' + encodeURIComponent(lid) + (cid ? '&id=' + encodeURIComponent(cid) : '')
      : (c.leagueUrl || APP_BASE_URL + 'index.html');
  }

  // ── Load persisted week selections from localStorage ────────
  const PREFS_KEY = `pb_week_prefs_${session.leagueId}`;
  function saveWeekPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({
        pair:   state.currentPairWeek,
        score:  state.currentScoreWeek,
        stand:  state.currentStandWeek,
        tourn:  state.currentTournWeek,
      }));
    } catch (e) { /* localStorage may not be available */ }
  }
  function loadWeekPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      const max = parseInt(state.config.weeks || 8);
      const clamp = v => (v && v >= 1 && v <= max) ? v : null;
      if (clamp(prefs.pair))  state.currentPairWeek  = clamp(prefs.pair);
      if (clamp(prefs.score)) state.currentScoreWeek = clamp(prefs.score);
      if (clamp(prefs.stand)) state.currentStandWeek = clamp(prefs.stand);
      if (clamp(prefs.tourn)) state.currentTournWeek = clamp(prefs.tourn);
    } catch (e) { /* ignore */ }
  }

  // ── Boot — two-phase load ──────────────────────────────────
  // Phase 1: fast fetch (config + players + attendance).
  // Renders the UI shell immediately; phase 2 fills pairings/scores/standings.
  showLoading(true);
  try {
    const early = await API.getEarlyData();
    state.config     = sanitizeConfig(early.config || {});
    state.players    = early.players    || [];
    state.attendance = early.attendance || [];
    state.challenges = early.challenges || [];
    state._playersLoaded = true;
  } catch (e) {
    // Phase 1 failed — fall back to full load so we don't leave user stuck
    try {
      const data = await API.getAllData();
      state.config = sanitizeConfig(data.config     || {});
      state.players    = data.players    || [];
      state.attendance = data.attendance || [];
      state.pairings   = data.pairings   || [];
      state.scores     = data.scores     || [];
      state.standings  = data.standings  || [];
      if (data.limits) state.limits = data.limits;
      state._playersLoaded = true;
    } catch (e2) {
      toast('Failed to load data: ' + e2.message, 'error');
    }
  } finally {
    showLoading(false);
  }

  loadWeekPrefs();
  gaPage('Admin Dashboard');
  gaEvent('login', { role: userRole });
  renderAll();
  applyLimitRestrictions();
  setupNav();
  setupEvents();
  {
    const reconciled = Math.max(state.currentPairWeek || 1, state.currentScoreWeek || 1);
    state.currentPairWeek  = reconciled;
    state.currentScoreWeek = reconciled;
  }
  // Populate all session dropdowns with correct options and saved selections
  populateWeekSelect('pair-week-select',  'currentPairWeek');
  populateWeekSelect('score-week-select', 'currentScoreWeek');
  populateWeekSelect('tourn-week-select', 'currentTournWeek');
  populateWeekSelect('stand-week-select', 'currentStandWeek');

  applyNavVisibility();

  // ── Phase 2: load pairings, scores, standings in background ──
  // Show spinners in dashboard sections that depend on this data.
  const spinnerHtml = '<div style="padding:16px; text-align:center; color:var(--muted); font-size:0.82rem;">⏳ Loading…</div>';
  const standEl = document.getElementById('dash-standings');
  const progEl  = document.getElementById('dash-progress');
  if (standEl) standEl.innerHTML = spinnerHtml;
  if (progEl)  progEl.innerHTML  = spinnerHtml;

  state._initialDataLoading = true;
  // Show loading indicator on scoresheet immediately if it's visible
  const scoresheetEl = document.getElementById('scoresheet');
  if (scoresheetEl) {
    scoresheetEl.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">⏳ Loading scores…</div>';
    document.querySelectorAll('#page-scores .score-input').forEach(el => { el.disabled = true; });
  }

  async function checkAndPromptBackup() {
    try {
      let daysSince = null;
      try {
        const status = await API.getBackupStatus();
        if (status && status.due === false) return;
        if (status && status.daysSince != null) daysSince = status.daysSince;
      } catch (e) { /* API unavailable — still show prompt */ }
      const daysMsg = daysSince === null
        ? 'No backup has ever been made for this league.'
        : `Last backup was ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`;

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
      overlay.innerHTML = `
        <div style="background:var(--surface,#fff);border-radius:12px;padding:28px 32px;max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
          <h3 style="margin:0 0 10px;font-size:1.05rem;">Backup Reminder</h3>
          <p style="margin:0 0 20px;color:var(--muted,#666);font-size:0.9rem;">${daysMsg} Download a backup now to protect your league data?</p>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="backup-skip-btn" style="padding:8px 16px;border:1px solid var(--border,#ccc);background:transparent;border-radius:6px;cursor:pointer;font-size:0.9rem;">Remind in 3 days</button>
            <button id="backup-download-btn" style="padding:8px 16px;background:var(--primary,#2563eb);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.9rem;font-weight:600;">Download Backup</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      document.getElementById('backup-download-btn').onclick = async () => {
        document.body.removeChild(overlay);
        document.getElementById('btn-export-json')?.click();
        API.recordBackupDone().catch(() => {});
      };
      document.getElementById('backup-skip-btn').onclick = () => {
        document.body.removeChild(overlay);
        API.recordBackupSkipped().catch(() => {});
      };
    } catch (e) { /* never block the admin */ }
  }

  API.getAllData().then(data => {
    state.pairings  = data.pairings  || [];
    state.scores    = data.scores    || [];
    state.standings = data.standings || [];
    state._pairingsLoaded = true;
    state._initialDataLoading = false;
    if (data.limits) state.limits = data.limits;
    renderDashboard();
    renderPairingsPreview();
    renderScoresheet();
    renderStandings();
    applyLimitRestrictions();
    applyTierRestrictions(state.limits?.tier);
    updatePairingModeUI();
    if (state.config.pairingMode === 'queue-based') loadQueueForWeek(state.currentPairWeek);
    if (tierAllows(state.limits?.tier, 'messaging')) {
      pollAdminChatMessages();
      startAdminChatPolling(false); // 120 s fallback for non-push users
      if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('message', event => {
          if (event.data && event.data.type === 'PUSH_RECEIVED') pollAdminChatMessages();
        });
      }
    }
    // Refresh challenges so accepted ones appear in pairings section
    API.getChallenges().then(r => { state.challenges = r.challenges || []; renderPairingsPreview(); }).catch(() => {});
    // Reconcile week selectors now that pairings are loaded
    const reconciled = Math.max(state.currentPairWeek || 1, state.currentScoreWeek || 1);
    state.currentPairWeek  = reconciled;
    state.currentScoreWeek = reconciled;
    populateWeekSelect('pair-week-select',  'currentPairWeek');
    populateWeekSelect('score-week-select', 'currentScoreWeek');
    updateTournamentResultsNav();
    checkAndPromptBackup();
  }).catch(e => {
    const errHtml = `<p style="padding:12px; color:var(--danger); font-size:0.82rem;">⚠ Could not load scores/pairings: ${e.message}</p>`;
    if (standEl) standEl.innerHTML = errHtml;
    if (progEl)  progEl.innerHTML  = errHtml;
  });

  // ── Admin Chat ─────────────────────────────────────────────
  function adminChatTimeAgo(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60)    return 'just now';
    if (s < 3600)  return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  // Returns the name the admin sends chat messages as (coordinator name if set, else session name)
  function adminSenderName() {
    return state.config.coordinatorName || Auth.getSession()?.name || 'Admin';
  }

  function buildAdminChatMsgHTML(m) {
    const myName     = adminSenderName();
    const isMe       = m.sender === myName;
    const isPrivToMe = m.recipient === myName;
    const isPrivFromMe = isMe && m.recipient !== '';
    const photosOn   = !state._tierDisablePhotos;
    // For the coordinator's own messages, use the coordinator photo from config
    const senderIsCoord = m.sender === myName;
    const senderPhoto   = senderIsCoord
      ? (state.config.coordinatorPhoto || '')
      : (state.players.find(p => p.name === m.sender)?.photo || '');
    const avatarHtml = photosOn
      ? `<img src="${playerPhotoSrc(m.sender, senderPhoto, 28)}"
           style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;margin-top:1px;">`
      : `<div style="width:28px;height:28px;border-radius:50%;background:var(--border);
           flex-shrink:0;display:flex;align-items:center;justify-content:center;
           font-size:0.72rem;font-weight:700;color:var(--muted);">${esc((m.sender||'?')[0].toUpperCase())}</div>`;

    const recipLabel = isPrivFromMe
      ? ` <span style="color:var(--muted);">→</span> <span style="color:var(--gold);">${esc(m.recipient)}</span>` : '';
    const privateBadge = (m.recipient !== '')
      ? `<span style="font-size:0.65rem;padding:1px 5px;background:rgba(245,200,66,0.18);
           color:var(--gold);border-radius:3px;margin-left:5px;border:1px solid rgba(245,200,66,0.3);">🔒 private</span>` : '';
    const rowBg = isPrivToMe
      ? 'background:rgba(245,200,66,0.07);border-left:2px solid rgba(245,200,66,0.35);padding-left:8px;'
      : isPrivFromMe
      ? 'background:rgba(255,255,255,0.03);border-left:2px solid rgba(255,255,255,0.08);padding-left:8px;'
      : '';

    return `<div class="admin-chat-msg" data-id="${m.id}"
        style="display:flex;gap:8px;padding:5px 8px;border-radius:6px;margin-bottom:3px;${rowBg}">
      <div style="flex-shrink:0;">${avatarHtml}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.72rem;margin-bottom:2px;display:flex;align-items:baseline;flex-wrap:wrap;gap:2px;">
          <span style="font-weight:600;color:${isMe ? 'var(--green)' : 'var(--white)'};">${esc(m.sender)}</span>
          ${recipLabel}${privateBadge}
          <span style="margin-left:auto;font-size:0.66rem;color:var(--muted);white-space:nowrap;">${adminChatTimeAgo(m.timestamp)}</span>
        </div>
        <div style="font-size:0.87rem;word-break:break-word;">${esc(m.message)}</div>
      </div>
    </div>`;
  }

  function renderAdminChatMessages() {
    const c = document.getElementById('admin-chat-messages');
    if (!c) return;
    if (!state.adminChatMessages.length) {
      c.innerHTML = `<div style="text-align:center;padding:40px 16px;color:var(--muted);font-size:0.85rem;">
        No messages yet. Start the conversation! 👋</div>`;
      return;
    }
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
    c.innerHTML = state.adminChatMessages.map(buildAdminChatMsgHTML).join('');
    if (atBottom || !c._hasScrolled) { c.scrollTop = c.scrollHeight; c._hasScrolled = true; }
  }

  function appendAdminChatMsgs(newMsgs) {
    const c = document.getElementById('admin-chat-messages');
    if (!c || !newMsgs.length) return;
    const atBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 60;
    if (!c.querySelector('.admin-chat-msg')) { renderAdminChatMessages(); return; }
    newMsgs.forEach(m => {
      const tmp = document.createElement('div');
      tmp.innerHTML = buildAdminChatMsgHTML(m);
      c.appendChild(tmp.firstChild);
    });
    if (atBottom) { c.scrollTop = c.scrollHeight; }
    c._hasScrolled = true;
  }

  function renderAdminChat() {
    const myName = adminSenderName();
    const sel = document.getElementById('admin-chat-recipient');
    if (sel) {
      const active = state.players.filter(p => p.active !== false && p.active !== 'false');
      sel.innerHTML = `<option value="">Everyone</option>` +
        active.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    }
    renderAdminChatMessages();

    const input   = document.getElementById('admin-chat-input');
    const sendBtn = document.getElementById('btn-admin-chat-send');
    const counter = document.getElementById('admin-chat-char-count');
    const status  = document.getElementById('admin-chat-send-status');
    if (input && !input._chatWired) {
      input._chatWired = true;
      input.addEventListener('input', () => {
        const rem = 160 - input.value.length;
        if (counter) { counter.textContent = rem; counter.style.color = rem < 20 ? 'var(--danger)' : 'var(--muted)'; }
      });
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn?.click(); }
      });
    }
    if (sendBtn && !sendBtn._chatWired) {
      sendBtn._chatWired = true;
      sendBtn.addEventListener('click', async () => {
        const msg = input?.value.trim() || '';
        if (!msg) return;
        const recipient = document.getElementById('admin-chat-recipient')?.value || '';
        sendBtn.disabled = true; sendBtn.textContent = '…';
        if (status) status.textContent = '';
        try {
          const res = await API.postChatMessage(myName, recipient, msg);
          if (res.success) {
            if (input) { input.value = ''; }
            if (counter) { counter.textContent = '160'; counter.style.color = 'var(--muted)'; }
            await pollAdminChatMessages();
          } else if (status) { status.textContent = res.error || 'Failed to send'; }
        } catch (err) {
          if (status) status.textContent = 'Error: ' + err.message;
        } finally { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
      });
    }
  }

  async function pollAdminChatMessages() {
    try {
      // Admin passes no player filter — sees all messages
      const data = await API.getChatMessages(state.adminChatLastId, '');
      if (!data.messages?.length) return;
      const existingIds = new Set(state.adminChatMessages.map(m => m.id));
      const newMsgs = data.messages.filter(m => !existingIds.has(m.id));
      if (!newMsgs.length) return;
      state.adminChatMessages.push(...newMsgs);
      if (state.adminChatMessages.length > 200) state.adminChatMessages = state.adminChatMessages.slice(-200);
      state.adminChatLastId = Math.max(...state.adminChatMessages.map(m => m.id));
      // If chat page is active, append without disrupting scroll
      if (document.getElementById('page-chat')?.classList.contains('active')) {
        appendAdminChatMsgs(newMsgs);
      }
    } catch (e) { /* polling errors are silent */ }
  }

  function startAdminChatPolling(fast) {
    if (state.adminChatPollTimer) clearInterval(state.adminChatPollTimer);
    state.adminChatPollTimer = setInterval(pollAdminChatMessages, fast ? 10000 : 120000);
  }

  // ── Nav ────────────────────────────────────────────────────
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const currentPage = document.querySelector('.tab-panel.active')?.id?.replace('page-', '');
        // Warn if navigating away from setup page with unsaved changes
        if (currentPage === 'setup' && state._setupDirty) {
          if (!confirm('You have unsaved changes to the league setup. Leave without saving?')) return;
          state._setupDirty = false;
        }
        // Warn if navigating away from players page with unsaved changes
        if (currentPage === 'players' && state._playersDirty) {
          if (!confirm('You have unsaved changes to the player list. Leave without saving?')) return;
          state._playersDirty = false;
        }
        // Warn if navigating away from attendance page with unsaved changes
        if (currentPage === 'attendance' && state._attDirty) {
          if (!confirm('You have unsaved attendance changes. Leave without saving?')) return;
          state._attDirty = false;
          state._attPending = {};
        }
        // Warn if navigating away from pairings with generated but unlocked pairings
        if (currentPage === 'pairings' && state.pendingPairings) {
          if (!confirm('Pairings have been generated but not locked and saved. Leave without locking?')) return;
        }
        // Pre-emptively show spinner on scores page BEFORE making panel visible
        // so there is zero window where stale inputs are visible and enterable
        if (item.dataset.page === 'scores') {
          const scoreEl = document.getElementById('scoresheet');
          if (scoreEl) scoreEl.innerHTML = `
            <div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
              <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
              <div>Loading Session ${state.currentScoreWeek}…</div>
            </div>`;
        }

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        const panel = document.getElementById('page-' + page);
        if (panel) panel.classList.add('active');
        gaPage('Admin: ' + page);
        if (page === 'timers') {
          if (typeof setTimerCourtConfig === 'function') {
            const numCourts = parseInt(state.config.courts || 3);
            const timerWeek = state.currentPairWeek;
            const perSess = state.config.courtNamesPerSession === true || state.config.courtNamesPerSession === 'true';
            const nameMap = {};
            for (let c = 1; c <= numCourts; c++) {
              const sName = perSess && timerWeek ? state.config[`courtName_${c}_w${timerWeek}`] : null;
              nameMap[c] = (sName && sName.trim()) ? sName.trim() : (state.config['courtName_' + c] || ('Court ' + c));
            }
            setTimerCourtConfig(numCourts, nameMap);
          }
          if (typeof setTimerSessionContext === 'function') {
            setTimerSessionContext(
              state.config.adminPin       || null,
              state.config.vapidPublicKey || null,
              state.config.replyTo        || ''
            );
          }
          renderTimersPage();
        }
        if (page === 'standings') renderStandings();
        if (page === 'tourn-results') renderAdminTournamentResults();
        if (page === 'player-report') renderPlayerReportSelect();
        if (page === 'dashboard') refreshDashboard();
        if (page === 'messaging') {
          initAvailUI();
          refreshSendMessageUI();
          if (isManager) initPushUI();
        }
        if (page === 'scores') {
          const fetchId = Date.now();
          state._scoresFetchId = fetchId;
          state._scoresheetLoading = true;
          state._scoresheetTouched = false;
          API.getScores(state.currentScoreWeek).then(data => {
            if (state._scoresFetchId !== fetchId) return;
            if (data && data.scores) {
              const week = state.currentScoreWeek;
              state.scores = state.scores.filter(s => parseInt(s.week) !== week);
              state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
            }
            state._scoresheetLoading = false;
            if (!state._scoresheetTouched) renderScoresheet();
          }).catch(() => {
            if (state._scoresFetchId !== fetchId) return;
            state._scoresheetLoading = false;
            if (!state._scoresheetTouched) renderScoresheet();
          });
        }
        if (page === 'pairings') {
          state.selectedQueueCourts = null;
          renderPairingsPreview();
          renderEditPairingForm();
          updatePairingModeUI();
          // Refresh queue data every time pairings page is opened; also re-initialises
          // selectedQueueCourts so stale null-Set click handlers can't throw.
          if (state.config.pairingMode === 'queue-based') loadQueueForWeek(state.currentPairWeek);
        }
        if (page === 'attendance') {
          // Show refreshing indicator and block grid interaction until fetch completes
          const grid = document.getElementById('attendance-grid');
          if (grid) {
            const indicator = document.createElement('div');
            indicator.id = 'att-refresh-indicator';
            indicator.style.cssText = 'font-size:0.78rem; color:var(--muted); padding:8px 4px; display:flex; align-items:center; gap:6px;';
            indicator.innerHTML = '<span style="animation:spin 0.8s linear infinite; display:inline-block;">⏳</span> Refreshing attendance…';
            grid.prepend(indicator);
            // Block pointer events on the grid while loading
            grid.style.pointerEvents = 'none';
            grid.style.opacity = '0.5';
          }
          state._attRefreshing = true;
          API.getAttendance().then(data => {
            if (data && data.attendance) {
              const generationActive = !document.getElementById('pairing-overlay')?.classList.contains('hidden');
              if (!generationActive) {
                // Apply server data but re-overlay any unsaved pending changes
                const pending = state._attPending || {};
                state.attendance = data.attendance.map(a => {
                  const p = pending[`${a.player}|${a.week}`];
                  return p ? { ...a, status: p.status } : a;
                });
                // Add pending entries for player+week combos not yet in server data
                Object.values(pending).forEach(p => {
                  if (!state.attendance.find(a => a.player === p.player && String(a.week) === String(p.week))) {
                    state.attendance.push({ player: p.player, week: p.week, status: p.status });
                  }
                });
              }
            }
            renderAttendance();
          }).catch(() => renderAttendance())
            .finally(() => {
              state._attRefreshing = false;
              const grid2 = document.getElementById('attendance-grid');
              if (grid2) { grid2.style.pointerEvents = ''; grid2.style.opacity = ''; }
            });
        }
        if (page === 'leagues') renderLeagues();
        if (page === 'applications') loadApplications();
        if (page === 'head-to-head') renderHeadToHead();
        if (page === 'chat') {
          renderAdminChat();
          startAdminChatPolling(true);
        } else if (state.adminChatPollTimer) {
          clearInterval(state.adminChatPollTimer);
          state.adminChatPollTimer = null;
        }
      });
    });
  }

  // ── Render All ─────────────────────────────────────────────
  function renderAll() {
    renderDashboard();
    renderSetup();
    renderPlayers();
    renderAttendance();
    renderPairingsPreview();
    renderEditPairingForm();
    renderScoresheet();
    updateTournamentResultsNav();
    renderStandings();
    renderPlayerReportSelect();
    renderLeagues();
    initAvailUI();
    renderMessaging();
    refreshSendMessageUI();
    refreshSmsUI();
  }

  // ── Head-to-Head ───────────────────────────────────────────
  let h2hMode = 'partners';
  let h2hWeek = 'all';
  let h2hSort = 'alpha';

  function renderHeadToHead() {
    // Populate session selector
    const sel = document.getElementById('h2h-week-select');
    if (sel) {
      const weeks = [...new Set(state.pairings.map(p => parseInt(p.week)))].sort((a,b) => a-b);
      sel.innerHTML = '<option value="all">All Weeks</option>' +
        weeks.map(w => {
          const date = formatDateTime(w, state.config) ? ' — ' + formatDateTime(w, state.config) : '';
          return `<option value="${w}" ${h2hWeek == w ? 'selected' : ''}>Session ${w}${date}</option>`;
        }).join('');
      sel.value = h2hWeek;
      sel.onchange = () => { h2hWeek = sel.value; renderH2HTable(); };
    }

    // Sort select
    const sortSel = document.getElementById('h2h-sort-select');
    if (sortSel) {
      sortSel.value = h2hSort;
      sortSel.onchange = () => { h2hSort = sortSel.value; renderH2HTable(); };
    }

    // Tab switching
    document.querySelectorAll('#h2h-tabs .tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('#h2h-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        h2hMode = btn.dataset.h2h;
        renderH2HTable();
      };
    });
    renderH2HTable();
  }

  function renderH2HTable() {
    const activePlayers = state.players.filter(p => p.active === true && p.role !== 'spectator' && p.role !== 'sub');
    if (!activePlayers.length) {
      document.getElementById('h2h-content').innerHTML = '<div class="card"><p class="text-muted">No players yet.</p></div>';
      return;
    }

    // ── Build rank map (used for sort and avg-rank analysis) ──
    // Use ladder standings when the league is configured for it, otherwise standard.
    const isLadder = (state.config.standingsMethod || 'standard') === 'ladder';
    const rankMap = {};
    if (isLadder) {
      const initRankMap = {};
      state.standings.forEach(s => { if (s.rank && s.rank !== '-') initRankMap[s.name] = parseInt(s.rank); });
      activePlayers.forEach(p => { if (initRankMap[p.name] == null && p.initialRank) initRankMap[p.name] = p.initialRank; });
      try {
        const ls = Reports.computeLadderStandings(state.scores, state.players, state.pairings,
          null, state.attendance, state.config, initRankMap);
        ls.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = parseInt(s.rank); });
      } catch (e) {
        state.standings.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = parseInt(s.rank); });
      }
    } else {
      state.standings.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = parseInt(s.rank); });
    }
    activePlayers.forEach(p => { if (rankMap[p.name] == null && p.initialRank) rankMap[p.name] = p.initialRank; });

    // ── Sort players ──────────────────────────────────────────
    if (h2hSort === 'alpha') {
      activePlayers.sort((a, b) => a.name.localeCompare(b.name));
    } else if (h2hSort === 'initial-rank') {
      activePlayers.sort((a, b) => {
        const ra = a.initialRank ?? Infinity;
        const rb = b.initialRank ?? Infinity;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
      });
    } else { // overall-rank
      activePlayers.sort((a, b) => {
        const ra = rankMap[a.name] ?? Infinity;
        const rb = rankMap[b.name] ?? Infinity;
        return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
      });
    }

    const players = activePlayers.map(p => p.name);
    if (!players.length) {
      document.getElementById('h2h-content').innerHTML = '<div class="card"><p class="text-muted">No players yet.</p></div>';
      return;
    }

    // Build count matrix
    const matrix = {};
    players.forEach(a => { matrix[a] = {}; players.forEach(b => { matrix[a][b] = 0; }); });

    // Filter pairings by selected week (or all weeks)
    const h2hPairings = h2hWeek === 'all'
      ? state.pairings.filter(g => g.type === 'game' || g.type === 'tourn-game')
      : state.pairings.filter(g => (g.type === 'game' || g.type === 'tourn-game') && parseInt(g.week) === parseInt(h2hWeek));

    h2hPairings.forEach(g => {
      if (!g.p1) return;
      const team1 = [g.p1, g.p2].filter(Boolean);
      const team2 = [g.p3, g.p4].filter(Boolean);

      if (h2hMode === 'partners') {
        [[g.p1, g.p2], [g.p3, g.p4]].forEach(([a, b]) => {
          if (a && b && matrix[a] && matrix[b]) {
            matrix[a][b]++;
            matrix[b][a]++;
          }
        });
      } else {
        team1.forEach(a => {
          team2.forEach(b => {
            if (matrix[a] && matrix[b]) {
              matrix[a][b]++;
              matrix[b][a]++;
            }
          });
        });
      }
    });

    // Find max for heat-map shading
    let maxVal = 1;
    players.forEach(a => players.forEach(b => { if (a !== b) maxVal = Math.max(maxVal, matrix[a][b]); }));

    const label = h2hMode === 'partners' ? 'Times as Partners' : 'Times as Opponents';
    let tableHtml = `<table style="font-size:0.75rem;">
      <thead><tr>
        <th style="min-width:90px;">${label}</th>
        ${players.map(p => `<th style="text-align:center; padding:4px 6px;">${esc(p)}</th>`).join('')}
      </tr></thead>
      <tbody>`;

    players.forEach(rowPlayer => {
      tableHtml += `<tr><td class="player-name" style="font-size:0.78rem;">${esc(rowPlayer)}</td>`;
      players.forEach(colPlayer => {
        if (rowPlayer === colPlayer) {
          tableHtml += `<td style="text-align:center; background:rgba(255,255,255,0.04); color:var(--muted);">—</td>`;
        } else {
          const val = matrix[rowPlayer][colPlayer];
          const intensity = maxVal > 0 ? val / maxVal : 0;
          const bg = val === 0
            ? 'transparent'
            : `rgba(94,194,106,${(0.1 + intensity * 0.55).toFixed(2)})`;
          tableHtml += `<td style="text-align:center; background:${bg}; font-weight:${val > 0 ? 600 : 400}; color:${val > 0 ? 'var(--white)' : 'var(--muted)'}">${val || '·'}</td>`;
        }
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';

    // ── Average rank analysis ─────────────────────────────────
    // Median rank for players with no rank
    const rankedVals = Object.values(rankMap).filter(r => typeof r === 'number');
    const medianRank = rankedVals.length
      ? rankedVals.sort((a,b)=>a-b)[Math.floor(rankedVals.length/2)]
      : players.length;

    // For each player, compute weighted average rank of their partners/opponents
    // In opponents mode (doubles), each game adds 2 opponent entries to the matrix,
    // so we divide totalGames by 2 to get actual game count.
    const gameMode    = state.config.gameMode || 'doubles';
    const isSingles   = gameMode === 'singles' || gameMode === 'fixed-pairs';
    const oppsPerGame = (h2hMode === 'opponents' && !isSingles) ? 2 : 1;

    const avgRankData = players.map(player => {
      let weightedSum = 0;
      let totalGames  = 0;
      players.forEach(other => {
        if (other === player) return;
        const count = matrix[player][other] || 0;
        if (count === 0) return;
        const rank = rankMap[other] ?? medianRank;
        weightedSum += rank * count;
        totalGames  += count;
      });
      // Divide by oppsPerGame so totalGames reflects actual games, not player encounters
      const actualGames = totalGames / oppsPerGame;
      return {
        name: player,
        avgRank: actualGames > 0 ? weightedSum / totalGames : null,
        totalGames: actualGames,
      };
    }).filter(d => d.avgRank !== null);

    // Sort ascending by avgRank (rank 1 = best, so lowest number = highest-ranked partners)
    avgRankData.sort((a, b) => a.avgRank - b.avgRank);

    const modeLabel = h2hMode === 'partners' ? 'Partner' : 'Opponent';
    let rankHtml = '';
    if (avgRankData.length) {
      rankHtml = `
        <div style="margin-top:22px;">
          <div class="card-title" style="font-size:0.8rem; margin-bottom:10px; color:var(--muted);">
            AVERAGE ${modeLabel.toUpperCase()} RANK
            <span style="font-weight:400; font-size:0.72rem;">
              — weighted by games played together, sorted best to worst
            </span>
          </div>
          <table style="font-size:0.82rem; width:100%; max-width:420px;">
            <thead><tr>
              <th style="width:36px;">#</th>
              <th>Player</th>
              <th>Avg ${modeLabel} Rank</th>
              <th>Games</th>
            </tr></thead>
            <tbody>
              ${avgRankData.map((d, i) => {
                const bar = Math.round((1 - (d.avgRank - 1) / (players.length || 1)) * 100);
                const barColor = bar > 66 ? 'var(--green)' : bar > 33 ? 'var(--gold)' : 'rgba(224,85,85,0.7)';
                return `<tr>
                  <td style="color:var(--muted); font-size:0.72rem;">${i + 1}</td>
                  <td class="player-name">${esc(d.name)}</td>
                  <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-weight:600; min-width:32px;">${d.avgRank.toFixed(1)}</span>
                      <div style="flex:1; max-width:80px; height:6px; background:rgba(255,255,255,0.08); border-radius:3px;">
                        <div style="width:${bar}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                      </div>
                    </div>
                  </td>
                  <td style="color:var(--muted);">${d.totalGames}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    document.getElementById('h2h-content').innerHTML =
      `<div class="card">
        <div class="table-wrap" style="overflow-x:auto;">${tableHtml}</div>
        ${rankHtml}
      </div>`;
  }

  // ── Dashboard Refresh ──────────────────────────────────────
  async function refreshDashboard() {
    const btn = document.getElementById('btn-refresh-dashboard');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
      const data = await API.getAllData();
      state.scores    = data.scores    || state.scores;
      state.pairings  = data.pairings  || state.pairings;
      state.standings = data.standings || state.standings;
      state.players   = data.players   || state.players;
      state.attendance= data.attendance|| state.attendance;
      if (data.limits) state.limits = data.limits;
      renderDashboard();
    } catch (e) {
      toast('Refresh failed: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    }
  }

  // Shared helper — renders a checkbox list into a container div.
  // First row is "All Players" which acts as select-all.
  function buildCheckboxList(container, items, labelFn, prevSelected) {
    const allChecked = !prevSelected || prevSelected.has('__all__');
    const rowStyle = 'display:flex;align-items:center;gap:10px;padding:7px 12px;cursor:pointer;font-size:0.83rem;border-bottom:1px solid rgba(255,255,255,0.05);';
    let html = `<label style="${rowStyle}">
      <input type="checkbox" data-recip="__all__" ${allChecked ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0;">
      <span style="font-weight:600;">All Players</span>
    </label>`;
    items.forEach(item => {
      const checked = allChecked || (prevSelected && prevSelected.has(item.value));
      html += `<label style="${rowStyle}">
        <input type="checkbox" data-recip="${esc(item.value)}" ${checked ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0;">
        <span>${esc(labelFn(item))}</span>
      </label>`;
    });
    container.innerHTML = html;

    // All Players checkbox — check/uncheck all
    const allBox = container.querySelector('[data-recip="__all__"]');
    allBox.addEventListener('change', () => {
      container.querySelectorAll('[data-recip]').forEach(cb => { cb.checked = allBox.checked; });
    });
    // Individual checkbox — uncheck All Players if any individual is unchecked
    container.querySelectorAll('[data-recip]:not([data-recip="__all__"])').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked) allBox.checked = false;
        const individuals = [...container.querySelectorAll('[data-recip]:not([data-recip="__all__"])')];
        if (individuals.every(c => c.checked)) allBox.checked = true;
      });
    });
  }

  // Returns selected values from a checkbox list container. Empty set = All Players.
  function getCheckboxSelections(container) {
    if (!container) return new Set(['__all__']);
    const allBox = container.querySelector('[data-recip="__all__"]');
    if (allBox && allBox.checked) return new Set(['__all__']);
    return new Set(
      [...container.querySelectorAll('[data-recip]:not([data-recip="__all__"])')].filter(c => c.checked).map(c => c.dataset.recip)
    );
  }

  function refreshSendMessageUI() {
    const adminOnly = state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true';
    const replyTo   = state.config.replyTo || '';
    const preview   = document.getElementById('msg-recipient-preview');
    const statusEl  = document.getElementById('msg-status');
    const container = document.getElementById('msg-recipients');

    if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }

    if (container) {
      const prevSelected = getCheckboxSelections(container);
      const eligible = state.players.filter(p => p.active === true && p.email);
      buildCheckboxList(container,
        eligible.map(p => ({ value: p.name, email: p.email })),
        item => `${item.value} — ${item.email}`,
        prevSelected
      );
    }

    if (!preview) return;
    if (adminOnly) {
      preview.textContent = replyTo
        ? `Admin-only mode: will send only to ${replyTo}`
        : 'Admin-only mode is on but no Admin Email is set — set it above.';
      preview.style.color = replyTo ? 'var(--gold)' : 'var(--danger)';
    } else {
      const eligible = state.players.filter(p => p.active === true && p.email);
      preview.textContent = eligible.length
        ? `${eligible.length} player${eligible.length !== 1 ? 's' : ''} have email addresses on file.`
        : 'No active players have email addresses on file.';
      preview.style.color = eligible.length ? 'var(--muted)' : 'var(--danger)';
    }
  }

  function refreshSmsUI() {
    const container = document.getElementById('sms-recipients');
    if (!container) return;
    const prevSelected = getCheckboxSelections(container);
    const eligible = state.players.filter(p => p.active === true && p.phone);
    buildCheckboxList(container,
      eligible.map(p => ({ value: p.name, phone: p.phone })),
      item => `${item.value} — ${item.phone}`,
      prevSelected
    );
    const statusEl = document.getElementById('sms-status');
    if (statusEl) {
      statusEl.textContent = eligible.length
        ? `${eligible.length} player${eligible.length !== 1 ? 's' : ''} have phone numbers on file.`
        : 'No active players have phone numbers on file.';
      statusEl.style.color = eligible.length ? 'var(--muted)' : 'var(--danger)';
    }
  }

  // ── Availability UI helpers (outer scope so renderAll can call initAvailUI) ──

  function initAvailUI() {
    const weekSel   = document.getElementById('avail-week-select');
    const filterSel = document.getElementById('avail-filter');
    const preview   = document.getElementById('avail-preview');
    if (!weekSel) return;
    const curWeek = parseInt(weekSel.value) || state.currentPairWeek || 1;
    const weeks = parseInt(state.config.weeks || 8);
    weekSel.innerHTML = '';
    for (let w = 1; w <= weeks; w++) {
      const opt = document.createElement('option');
      opt.value = w;
      const d = formatDateTime(w, state.config);
      opt.textContent = d ? `Session ${w} — ${d}` : `Session ${w}`;
      if (w === curWeek) opt.selected = true;
      weekSel.appendChild(opt);
    }
    updateAvailPreview();
  }

  function getAvailRecipients(week, filter) {
    return state.players.filter(p => {
      if (p.active !== true || p.active === 'pend') return false;
      if (p.role === 'spectator') return false;
      if (!p.email) return false;
      if (filter === 'unmarked') {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
        return !rec || rec.status === 'tbd';
      }
      return true;
    });
  }

  // ── Push Notification UI (App Manager only) ───────────────

  // Session storage key for the VAPID private key (survives nav between pages)
  const PUSH_PRIV_KEY = 'pb_vapid_priv';

  function initPushUI() {
    const hasVapidKey = !!(state.config.vapidPublicKey);
    document.getElementById('push-setup-section').style.display  = hasVapidKey ? 'none' : '';
    document.getElementById('push-active-section').style.display = hasVapidKey ? ''     : 'none';

    if (!hasVapidKey) {
      // Wire generate button once
      const btn = document.getElementById('btn-push-generate-keys');
      if (btn && !btn._pushWired) {
        btn._pushWired = true;
        btn.addEventListener('click', handlePushGenerateKeys);
      }
      return;
    }

    refreshPushActiveUI();

    // Wire unlock button once
    const unlockBtn = document.getElementById('btn-push-unlock');
    if (unlockBtn && !unlockBtn._pushWired) {
      unlockBtn._pushWired = true;
      unlockBtn.addEventListener('click', handlePushUnlock);
    }
    // Wire send button once
    const sendBtn = document.getElementById('btn-push-send');
    if (sendBtn && !sendBtn._pushWired) {
      sendBtn._pushWired = true;
      sendBtn.addEventListener('click', handlePushSend);
    }
    // Wire subscriber list buttons once
    const selAll  = document.getElementById('btn-push-select-all');
    const selNone = document.getElementById('btn-push-select-none');
    const refresh = document.getElementById('btn-push-refresh-subs');
    if (selAll && !selAll._pushWired) {
      selAll._pushWired = true;
      selAll.addEventListener('click', () => {
        document.querySelectorAll('.push-sub-cb').forEach(cb => cb.checked = true);
      });
    }
    if (selNone && !selNone._pushWired) {
      selNone._pushWired = true;
      selNone.addEventListener('click', () => {
        document.querySelectorAll('.push-sub-cb').forEach(cb => cb.checked = false);
      });
    }
    if (refresh && !refresh._pushWired) {
      refresh._pushWired = true;
      refresh.addEventListener('click', loadPushSubscriberList);
    }
  }

  function refreshPushActiveUI() {
    const privKey = sessionStorage.getItem(PUSH_PRIV_KEY);
    document.getElementById('push-unlock-section').style.display = privKey ? 'none' : '';
    document.getElementById('push-send-section').style.display   = privKey ? ''     : 'none';
    if (privKey) loadPushSubscriberList();
  }

  async function loadPushSubscriberList() {
    const listEl  = document.getElementById('push-recipients-list');
    const countEl = document.getElementById('push-recipient-count');
    if (!listEl) return;

    listEl.innerHTML = '<span style="color:var(--muted); font-style:italic;">Loading subscribers…</span>';
    if (countEl) countEl.textContent = '';

    try {
      const adminPin = state.config.adminPin;
      if (!adminPin) {
        listEl.innerHTML = '<span style="color:var(--warn); font-style:italic;">Admin PIN not configured — set it in Setup first.</span>';
        return;
      }

      const { subscriptions } = await API.getTimerPushSubs(adminPin);

      if (!subscriptions || !subscriptions.length) {
        listEl.innerHTML = '<span style="color:var(--muted); font-style:italic;">No subscribers yet — players subscribe via their dashboard.</span>';
        listEl._subscriptions = [];
        return;
      }

      listEl._subscriptions = subscriptions;
      listEl.innerHTML = subscriptions.map((sub, i) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer;">
          <input type="checkbox" class="push-sub-cb" value="${i}" checked
            style="accent-color:var(--green);width:15px;height:15px;flex-shrink:0;">
          <span style="font-size:0.83rem;">${esc(sub.player || 'Unknown')}</span>
        </label>`
      ).join('');

      if (countEl) countEl.textContent = `(${subscriptions.length} subscriber${subscriptions.length !== 1 ? 's' : ''})`;
    } catch(e) {
      listEl.innerHTML = `<span style="color:var(--danger); font-style:italic;">Failed to load: ${esc(e.message)}</span>`;
      listEl._subscriptions = [];
    }
  }

  async function handlePushGenerateKeys() {
    const btn      = document.getElementById('btn-push-generate-keys');
    const statusEl = document.getElementById('push-setup-status');
    btn.disabled   = true;
    btn.textContent = '⏳ Generating…';
    statusEl.textContent = '';
    try {
      const { publicKey, privateKey } = await VapidPush.generateVapidKeys();

      // Save public key via normal config save so it lands in the config sheet
      const newConfig = { ...state.config, vapidPublicKey: publicKey };
      await API.saveConfig(newConfig);
      state.config.vapidPublicKey = publicKey;

      // Save private key to Script Properties (requires App Manager password re-entry)
      const password = prompt('Enter your App Manager password to save the private key securely:');
      if (!password) { statusEl.textContent = 'Cancelled — keys not saved.'; statusEl.style.color = 'var(--gold)'; btn.disabled = false; btn.textContent = '🔑 Generate Keys & Enable Push'; return; }
      await API.saveVapidPrivateKey(password, privateKey);

      // Cache private key in session so we can send immediately
      sessionStorage.setItem(PUSH_PRIV_KEY, privateKey);

      statusEl.textContent = '✓ VAPID keys generated and saved. Push notifications are now enabled.';
      statusEl.style.color = 'var(--green)';

      // Refresh UI to show send form
      document.getElementById('push-setup-section').style.display  = 'none';
      document.getElementById('push-active-section').style.display = '';
      refreshPushActiveUI();
    } catch (e) {
      statusEl.textContent = 'Setup failed: ' + e.message;
      statusEl.style.color = 'var(--danger)';
      btn.disabled    = false;
      btn.textContent = '🔑 Generate Keys & Enable Push';
    }
  }

  async function handlePushUnlock() {
    const btn      = document.getElementById('btn-push-unlock');
    const statusEl = document.getElementById('push-unlock-status');
    const password = document.getElementById('push-mgr-password').value;
    if (!password) { statusEl.textContent = 'Enter your App Manager password.'; statusEl.style.color = 'var(--gold)'; return; }
    btn.disabled    = true;
    btn.textContent = '⏳ Verifying…';
    statusEl.textContent = '';
    try {
      const result = await API.getVapidPrivateKey(password);
      if (!result.privateKey) throw new Error('No VAPID key found — please generate keys first.');
      sessionStorage.setItem(PUSH_PRIV_KEY, result.privateKey);
      document.getElementById('push-mgr-password').value = '';
      refreshPushActiveUI();
    } catch (e) {
      statusEl.textContent = 'Failed: ' + e.message;
      statusEl.style.color = 'var(--danger)';
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Unlock';
    }
  }

  async function handlePushSend() {
    const btn      = document.getElementById('btn-push-send');
    const statusEl = document.getElementById('push-send-status');
    const title    = document.getElementById('push-title').value.trim();
    const body     = document.getElementById('push-body').value.trim();
    const url      = document.getElementById('push-url').value.trim() || './player.html';

    if (!title) { statusEl.textContent = 'Please enter a title.'; statusEl.style.color = 'var(--gold)'; return; }
    if (!body)  { statusEl.textContent = 'Please enter a message.'; statusEl.style.color = 'var(--gold)'; return; }

    const privKey = sessionStorage.getItem(PUSH_PRIV_KEY);
    if (!privKey) { refreshPushActiveUI(); return; }

    // Build recipient list from checked checkboxes in the loaded subscriber list
    const listEl  = document.getElementById('push-recipients-list');
    const allSubs = (listEl && listEl._subscriptions) || [];
    const checked = new Set(
      Array.from(document.querySelectorAll('.push-sub-cb:checked')).map(cb => parseInt(cb.value))
    );
    const subscriptions = allSubs.filter((_, i) => checked.has(i));

    if (!subscriptions.length) {
      statusEl.textContent = allSubs.length ? 'No recipients selected — use the checkboxes above.' : 'No subscribers yet — players subscribe via their dashboard.';
      statusEl.style.color = 'var(--gold)';
      return;
    }

    btn.disabled    = true;
    btn.textContent = '⏳ Sending…';
    statusEl.textContent = `Encrypting and sending to ${subscriptions.length} recipient(s)…`;
    statusEl.style.color = 'var(--muted)';

    try {
      const vapidPub = state.config.vapidPublicKey;
      const subject  = `mailto:${state.config.replyTo || 'noreply@example.com'}`;
      const payload  = JSON.stringify({ title, body, url });

      // Encrypt in the browser, then relay through GAS (CORS blocks direct push on Apple)
      const notifications = await VapidPush.buildNotifications(
        subscriptions, payload, privKey, vapidPub, subject
      );
      const { results } = await API.sendTimerPush(state.config.adminPin, notifications);

      let sent = 0, failed = 0;
      const expired = [];
      results.forEach(r => {
        if (r.ok) { sent++; }
        else {
          failed++;
          if (r.status === 404 || r.status === 410) expired.push(r.endpoint);
        }
      });

      // Clean up expired subscriptions and refresh the list
      if (expired.length) {
        await Promise.allSettled(expired.map(ep => API.deletePushSubscription(ep)));
        loadPushSubscriberList();
      }

      statusEl.textContent = `✓ Sent to ${sent} recipient(s).${failed ? ` ${failed} failed.` : ''}${expired.length ? ` ${expired.length} expired removed.` : ''}`;
      statusEl.style.color = sent > 0 ? 'var(--green)' : 'var(--danger)';
    } catch (e) {
      statusEl.textContent = 'Send failed: ' + e.message;
      statusEl.style.color = 'var(--danger)';
    } finally {
      btn.disabled    = false;
      btn.textContent = '🔔 Send Notification';
    }
  }

  function updateAvailPreview() {
    const weekSel   = document.getElementById('avail-week-select');
    const filterSel = document.getElementById('avail-filter');
    const preview   = document.getElementById('avail-preview');
    if (!weekSel || !preview) return;
    const week   = parseInt(weekSel.value) || 1;
    const filter = filterSel ? filterSel.value : 'unmarked';
    const recips = getAvailRecipients(week, filter);
    preview.textContent = recips.length
      ? `Will send to ${recips.length} player${recips.length !== 1 ? 's' : ''}: ${recips.map(p => p.name).join(', ')}`
      : 'No eligible recipients (check players have email addresses, spectators excluded).';
  }

  // ── Dashboard ──────────────────────────────────────────────
  function renderDashboard() {
    document.getElementById('dash-league-name').textContent =
      Auth.getSession()?.leagueName || state.config.leagueName || 'League Dashboard';

    const c = state.config;
    const infoParts = [];
    if (c.location)    infoParts.push(`<span>📍 ${esc(c.location)}</span>`);
    if (c.sessionTime) infoParts.push(`<span>🕐 ${esc(c.sessionTime)}</span>`);
    if (c.notes)       infoParts.push(`<span>📌 ${esc(c.notes)}</span>`);
    if (c.leagueUrl || Auth.getSession()?.leagueId) {
      // Always derive URL from leagueId so it stays correct regardless of config value
      const sess = Auth.getSession();
      const lid  = sess?.leagueId || '';
      // Resolve customerId from most-to-least reliable source:
      // 1. state.currentLeagueCustomerId — set by renderLeagues from the live registry (always correct)
      // 2. sessionStorage — set at login from the ?id= URL param (missing if URL lacked it)
      // 3. c.leagueUrl param — written at league creation, stale if customerId assigned later
      const _cid1 = state.currentLeagueCustomerId
        || sessionStorage.getItem('pb_customer_id')
        || (c.leagueUrl || '').match(/[?&]id=([^&]+)/)?.[1]
        || '';
      const leagueUrl = lid
        ? APP_BASE_URL + 'index.html?league=' + encodeURIComponent(lid) + (_cid1 ? '&id=' + encodeURIComponent(_cid1) : '')
        : (c.leagueUrl || APP_BASE_URL + 'index.html');
      const lName = sess?.leagueName || state.config.leagueName || '';

      infoParts.push(`<span style="display:inline-flex; align-items:center; gap:6px; flex-wrap:wrap;">
        🔗 <a href="${esc(leagueUrl)}" target="_blank" style="color:var(--green);">${esc(leagueUrl)}</a>
        <button onclick="navigator.clipboard.writeText('${leagueUrl.replace(/'/g, "\\'")}').then(()=>{ this.textContent='✓ Copied'; setTimeout(()=>this.textContent='Copy',1500); })"
          style="font-size:0.72rem; padding:1px 8px; border-radius:4px; cursor:pointer; line-height:1.6;
                 background:rgba(94,194,106,0.12); color:var(--green); border:1px solid rgba(94,194,106,0.3);">Copy</button>
        <a href="#" onclick="showLeagueQR(event, '${esc(leagueUrl)}', '${esc(lName)}')"
          style="color:var(--muted); font-size:0.75rem; text-decoration:none; border:1px solid rgba(255,255,255,0.15);
                 border-radius:4px; padding:1px 6px; line-height:1.6;"
          title="Show QR code">&#x25A6; QR</a>
      </span>`);
    }

    // Build rules section
    let rulesHtml = '';
    if (c.rules && c.rules.trim()) {
      const lines = c.rules.split('\n').map(l => l.trim()).filter(Boolean);
      rulesHtml = `<div style="margin-top:10px; padding:12px 16px; background:rgba(255,255,255,0.03);
                               border-left:3px solid var(--gold); border-radius:6px;">
        <div style="font-size:0.7rem; letter-spacing:0.1em; text-transform:uppercase;
                    color:var(--gold); font-weight:600; margin-bottom:8px;">📋 League Rules</div>
        <ol style="margin:0; padding-left:18px; font-size:0.85rem; color:var(--muted); line-height:1.8;">
          ${lines.map(l => `<li>${esc(l)}</li>`).join('')}
        </ol>
      </div>`;
    }

    document.getElementById('dash-info').innerHTML =
      (infoParts.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:12px 24px;margin-bottom:${rulesHtml ? '8px' : '14px'};font-size:0.88rem;color:var(--muted);">${infoParts.join('')}</div>`
        : '') + rulesHtml;

    const activePlayers = state.players.filter(p => p.active === true).length;
    const pendingPlayers = state.players.filter(p => p.active === 'pend').length;
    const L = state.limits || {};

    // Expiry banner
    let expiryHtml = '';
    if (L.daysRemaining !== null && L.daysRemaining !== undefined) {
      if (L.expired) {
        expiryHtml = `<div style="background:rgba(224,85,85,0.15); border:1px solid rgba(224,85,85,0.4); border-radius:8px; padding:10px 16px; margin-bottom:14px; font-size:0.85rem; color:var(--danger);">
          ⛔ League subscription expired. Generate and score entry functions are disabled. Contact your app manager to renew.
        </div>`;
      } else if (L.daysRemaining <= 14) {
        expiryHtml = `<div style="background:rgba(232,184,75,0.12); border:1px solid rgba(232,184,75,0.35); border-radius:8px; padding:10px 16px; margin-bottom:14px; font-size:0.85rem; color:var(--gold);">
          ⚠️ League subscription expires in <strong>${L.daysRemaining} day${L.daysRemaining !== 1 ? 's' : ''}</strong>. Contact your app manager to renew.
        </div>`;
      } else {
        expiryHtml = `<div style="font-size:0.75rem; color:var(--muted); margin-bottom:10px;">
          Subscription: <strong style="color:var(--white);">${L.daysRemaining} days remaining</strong>
        </div>`;
      }
    }

    // Tier badge
    let tierHtml = '';
    if (L.tier) {
      const tierDef = typeof TIERS !== 'undefined' ? TIERS.find(t => t.version.toLowerCase() === L.tier.toLowerCase()) : null;
      const tierDesc = tierDef ? tierDef.description : '';
      tierHtml = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span>Plan:</span>
        <span style="background:rgba(94,194,106,0.12); border:1px solid rgba(94,194,106,0.3);
          border-radius:4px; padding:2px 8px; font-size:0.75rem; color:var(--green); font-weight:600;">${esc(L.tier)}</span>
        ${tierDesc ? `<span style="color:var(--muted); font-size:0.75rem;">${esc(tierDesc)}</span>` : ''}
        <a href="#" onclick="showTierInfo('${esc(L.tier)}'); return false;"
          style="color:var(--green); font-size:0.75rem; text-decoration:none; opacity:0.75;"
          onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.75'">View features ›</a>
      </div>`;
    }

    // Limits badges
    const limitBadge = (label, used, max) => {
      if (max === null || max === undefined) return '';
      const over = used > max;
      const pct  = Math.min(100, Math.round((used / max) * 100));
      return `<div style="font-size:0.72rem; color:${over ? 'var(--danger)' : 'var(--muted)'}; margin-bottom:4px;">
        ${label}: <strong style="color:${over ? 'var(--danger)' : 'var(--white)'};">${used}/${max}</strong>
      </div>`;
    };
    const weeksWithScores = [...new Set(state.scores.map(s => s.week))].length;
    const totalGames = state.scores.filter(s => s.score1 || s.score2).length;

    // Append tier badge + expiry to dash-info (both are now defined)
    if (tierHtml || expiryHtml) {
      document.getElementById('dash-info').innerHTML += tierHtml + expiryHtml;
    }

    const loadingVal = `<span style="color:var(--muted); animation:pulse 1.2s ease-in-out infinite;">…</span>`;
    const loaded = !!state._pairingsLoaded;
    const totalWeeks  = state.config.weeks || '—';
    const maxSessNote = L.maxSessions ? `/${L.maxSessions}` : '';
    const sessPlayed  = loaded ? weeksWithScores : loadingVal;
    const gamesVal    = loaded ? totalGames : loadingVal;
    const pendNote    = pendingPlayers ? ` <span style="color:var(--gold); font-size:0.85em;">(+${pendingPlayers} pending)</span>` : '';
    const statItem    = (icon, label) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
         <span style="opacity:0.7;">${icon}</span><span>${label}</span>
       </span>`;
    const dot = `<span style="color:rgba(255,255,255,0.18);">·</span>`;
    document.getElementById('dash-stats').innerHTML =
      `<div style="font-size:0.76rem;color:#7a9bb5;background:#1a2f45;border-radius:6px;
           padding:6px 14px;margin-bottom:0;display:flex;flex-wrap:nowrap;align-items:center;gap:8px;">
        ${statItem('👥', `${activePlayers} players${pendNote}`)}
        ${dot}
        ${statItem('📅', `${sessPlayed} of ${totalWeeks}${maxSessNote} sessions played`)}
        ${dot}
        ${statItem('🎮', `${gamesVal} games entered`)}
      </div>`;

    // ── League config summary strip ───────────────────────────
    const cfgEl = document.getElementById('dash-config');
    if (cfgEl) {
      const c = state.config;
      const courts      = parseInt(c.courts || 3);
      const gameModeMap = { doubles: 'Doubles', 'mixed-doubles': 'Mixed Doubles', singles: 'Singles', 'fixed-pairs': 'Fixed Pairs' };
      const rankSecondary = { avgptdiff: 'Avg Pt Diff', ptspct: 'Pts %' };
      const item = (icon, label) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;">
           <span style="opacity:0.7;">${icon}</span>
           <span>${label}</span>
         </span>`;
      const dot = `<span style="color:rgba(255,255,255,0.18);">·</span>`;
      cfgEl.innerHTML = `<div style="font-size:0.76rem;color:#7a9bb5;background:#1a2f45;border-radius:6px;
          padding:6px 14px;margin-bottom:6px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
        ${item('🏟', `${courts} Court${courts !== 1 ? 's' : ''}`)}
        ${dot}
        ${item('🎮', gameModeMap[c.gameMode || 'doubles'] || 'Doubles')}
        ${dot}
        ${item('📋', (c.pairingMode || 'round-based') === 'queue-based' ? 'Queue Pairing' : 'Round Pairing')}
        ${dot}
        ${item('📊', `Win %, ${rankSecondary[c.rankingMethod || 'avgptdiff'] || 'Avg Pt Diff'}`)}
      </div>`;
    }

    const activeNames = new Set(state.players.filter(p => p.active === true).map(p => p.name));
    const isLadderDash = (state.config.standingsMethod || 'standard') === 'ladder';
    if (isLadderDash) {
      const stdAll = Reports.computeStandings(state.scores, state.players, state.pairings, null,
        state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const rankMap = {};
      stdAll.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = s.rank; });
      state.players.forEach(p => { if (rankMap[p.name] == null && p.initialRank) rankMap[p.name] = p.initialRank; });
      const ladderDash = Reports.computeLadderStandings(state.scores, state.players, state.pairings,
        null, state.attendance, state.config, rankMap).filter(s => activeNames.has(s.name));
      document.getElementById('dash-standings').innerHTML = renderLadderStandingsTable(ladderDash, state.config, true);
    } else {
      const dashStandings = state.standings.filter(s => activeNames.has(s.name));
      document.getElementById('dash-standings').innerHTML = renderStandingsTable(dashStandings, true);
    }

    // ── Session Progress ──────────────────────────────────────
    const progressEl = document.getElementById('dash-progress');
    if (progressEl) {
      const totalWeeks = parseInt(state.config.weeks || 8);
      const gamePairings = state.pairings.filter(p => p.type === 'game' || p.type === 'tourn-game');
      const weeks = [...new Set(gamePairings.map(p => parseInt(p.week)))].sort((a,b)=>a-b);

      if (!weeks.length) {
        progressEl.innerHTML = '<p class="text-muted" style="font-size:0.82rem; padding:4px 0;">No pairings generated yet.</p>';
      } else {
        let html = `<table class="compact-table" style="width:100%;">
          <thead><tr>
            <th>Session</th><th>Round</th><th>Entered</th><th>Total</th><th style="min-width:80px;">Progress</th>
          </tr></thead><tbody>`;

        // Show all configured sessions (1..totalWeeks), not just those with pairings
        const allWeeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
        allWeeks.forEach(w => {
          const rounds = [...new Set(gamePairings.filter(p=>parseInt(p.week)===w).map(p=>parseInt(p.round)))].sort((a,b)=>a-b);

          if (!rounds.length) {
            // Session exists in config but has no pairings yet
            html += `<tr>
              <td style="font-weight:600; color:var(--white);">S${w}</td>
              <td style="color:var(--muted);">—</td>
              <td style="color:var(--muted);">—</td>
              <td style="color:var(--muted);">—</td>
              <td style="color:var(--muted); font-size:0.78rem;">No pairings</td>
            </tr>`;
            return;
          }
          rounds.forEach((r, ri) => {
            const roundGames = gamePairings.filter(p => parseInt(p.week)===w && parseInt(p.round)===r);
            const total = roundGames.length;
            const entered = roundGames.filter(g => {
              const sc = state.scores.find(s =>
                parseInt(s.week)===w && parseInt(s.round)===r && String(s.court)===String(g.court) &&
                s.score1 !== '' && s.score1 !== null && s.score2 !== '' && s.score2 !== null
              );
              return !!sc;
            }).length;
            const pct = total > 0 ? Math.round(entered/total*100) : 0;
            const done = entered === total && total > 0;
            const barColor = done ? 'var(--green)' : entered > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.1)';

            html += `<tr>
              ${ri === 0 ? `<td rowspan="${rounds.length}" style="font-weight:600; color:var(--white); vertical-align:top; padding-top:7px;">S${w}</td>` : ''}
              <td style="color:var(--muted);">R${r}</td>
              <td style="color:${done ? 'var(--green)' : 'var(--white)'}; font-weight:${done?'700':'400'};">${entered}</td>
              <td style="color:var(--muted);">${total}</td>
              <td>
                <div style="display:flex; align-items:center; gap:6px;">
                  <div style="flex:1; height:5px; background:rgba(255,255,255,0.08); border-radius:3px;">
                    <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:3px; transition:width 0.3s;"></div>
                  </div>
                  <span style="font-size:0.7rem; color:var(--muted); min-width:28px;">${done ? '✓' : pct+'%'}</span>
                </div>
              </td>
            </tr>`;
          });
        });
        html += '</tbody></table>';
        progressEl.innerHTML = html;
      }
    }
    // ── League Restrictions box ──────────────────────────────
    const limitsEl     = document.getElementById('dash-limits');
    const limitsDetail = document.getElementById('dash-limits-details');
    const L2 = state.limits || {};
    const hasLimits = L2.expiryDays != null || L2.maxPlayers != null ||
                      L2.maxCourts != null  || L2.maxRounds  != null || L2.maxSessions != null;

    if (limitsDetail) limitsDetail.style.display = hasLimits ? '' : 'none';

    if (limitsEl && hasLimits) {
      const totalWeeks  = parseInt(state.config.weeks  || 0);
      const totalCourts = parseInt(state.config.courts || 0);
      const activePlCount = state.players.filter(p => p.active === true).length;

      const limitRow = (label, used, max, unit = '') => {
        if (max == null) return '';
        const over = used !== null && used > max;
        const pct  = used !== null && max > 0 ? Math.min(100, Math.round(used / max * 100)) : 0;
        const barColor = over ? 'var(--danger)' : pct >= 80 ? 'var(--gold)' : 'var(--green)';
        return `<tr>
          <td style="color:var(--muted); font-size:0.82rem; padding:6px 12px 6px 0; white-space:nowrap;">${label}</td>
          <td style="font-size:0.82rem; padding:6px 8px; color:${over ? 'var(--danger)' : 'var(--white)'}; font-weight:${over?'700':'400'};">
            ${used !== null ? used + (unit ? ' '+unit : '') : '—'} / ${max}${unit ? ' '+unit : ''}
          </td>
          <td style="padding:6px 0; min-width:80px;">
            <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:${barColor}; border-radius:3px; transition:width 0.3s;"></div>
            </div>
          </td>
          ${over ? '<td style="font-size:0.75rem; color:var(--danger); padding:6px 0 6px 8px;">⚠ over limit</td>' : '<td></td>'}
        </tr>`;
      };

      // Expiry row
      let expiryRow = '';
      if (L2.expiryDays != null) {
        const expLabel = L2.daysRemaining != null
          ? (L2.expired ? '<span style="color:var(--danger);">Expired</span>'
             : `<span style="color:${L2.daysRemaining <= 14 ? 'var(--gold)' : 'var(--muted)'};">${L2.daysRemaining} days remaining</span>`)
          : '—';
        const created = L2.createdDate ? ` <span style="color:var(--muted); font-size:0.75rem;">(from ${L2.createdDate})</span>` : '';
        expiryRow = `<tr>
          <td style="color:var(--muted); font-size:0.82rem; padding:6px 12px 6px 0;">Expiry</td>
          <td colspan="3" style="font-size:0.82rem; padding:6px 0;">${L2.expiryDays} days${created} — ${expLabel}</td>
        </tr>`;
      }

      limitsEl.innerHTML = `
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left; font-size:0.72rem; color:var(--muted); letter-spacing:0.06em; text-transform:uppercase; padding:4px 12px 8px 0;">Restriction</th>
            <th style="text-align:left; font-size:0.72rem; color:var(--muted); letter-spacing:0.06em; text-transform:uppercase; padding:4px 8px 8px;">Used / Max</th>
            <th style="padding:4px 0 8px;"></th>
            <th></th>
          </tr></thead>
          <tbody>
            ${expiryRow}
            ${limitRow('Active Players',  activePlCount,  L2.maxPlayers)}
            ${limitRow('Courts',          totalCourts,    L2.maxCourts)}
            ${limitRow('Rounds/Session',  null,           L2.maxRounds)}
            ${limitRow('Sessions',        totalWeeks,     L2.maxSessions)}
          </tbody>
        </table>`;
    }

    // ── Final Session Banner ──────────────────────────────────
    const finalBannerEl = document.getElementById('dash-final-banner');
    if (finalBannerEl) {
      const totalWeeks   = parseInt(state.config.weeks || 0);
      const currentWeek  = Math.max(state.currentPairWeek || 1, state.currentScoreWeek || 1);
      const isFinalSession = totalWeeks > 0 && currentWeek >= totalWeeks;
      if (isFinalSession) {
        finalBannerEl.innerHTML = buildFinalSessionBanner('admin');
        wireFinalSessionBanner('admin');
      } else {
        finalBannerEl.innerHTML = '';
      }
    }

    document.getElementById('dash-version').innerHTML =
      `<div style="text-align:right; font-size:0.7rem; color:rgba(255,255,255,0.2); margin-top:10px;">
        v${APP_VERSION} &nbsp;·&nbsp; Built ${APP_BUILD_DATE}
        &nbsp;·&nbsp; <a href="#" id="btn-whats-new"
          style="color:rgba(94,194,106,0.5); text-decoration:none; font-size:0.7rem;"
          onmouseover="this.style.color='rgba(94,194,106,0.9)'"
          onmouseout="this.style.color='rgba(94,194,106,0.5)'">What's New</a>
      </div>`;
    // Wire What's New link after render
    setTimeout(() => {
      const wnBtn = document.getElementById('btn-whats-new');
      if (wnBtn) wnBtn.addEventListener('click', e => { e.preventDefault(); showChangelog(); });
    }, 0);
  }

  // ── Final Session Banner (shared HTML builder + wiring) ─────────────────────
  function buildFinalSessionBanner(idPrefix) {
    return `
      <details id="${idPrefix}-final-banner-details" style="margin-top:10px;">
        <summary style="list-style:none; cursor:pointer; display:flex; align-items:center;
            justify-content:space-between; background:rgba(232,184,75,0.13);
            border:1px solid rgba(232,184,75,0.35); border-radius:8px; padding:10px 16px;
            user-select:none;">
          <div style="font-size:0.9rem; font-weight:600; color:var(--gold);">
            🏆 Final Session! &nbsp; Please leave feedback for the app developer
          </div>
          <span style="font-size:0.72rem; color:var(--gold); opacity:0.7; flex-shrink:0; margin-left:10px;">▼</span>
        </summary>
        <div style="padding:14px 16px; background:rgba(232,184,75,0.05);
            border:1px solid rgba(232,184,75,0.25); border-top:none;
            border-radius:0 0 8px 8px;">
          <p style="font-size:0.85rem; color:var(--muted); line-height:1.75; margin:0 0 14px;">
            This app was built to help run your league — completely free. Other apps doing far less
            often charge significant fees. This helps you keep the cost of running leagues down. It took hundreds of hours to develop, test, and support.
            If you'd like to show appreciation for the effort, free-will donations can be made on
            Venmo to <strong style="color:var(--white);">Doug-Tucker-26</strong>
            &nbsp;<a href="https://venmo.com/Doug-Tucker-26" target="_blank"
              style="color:var(--green); text-decoration:none; font-size:0.8rem;
                     border:1px solid rgba(94,194,106,0.3); border-radius:4px; padding:1px 9px;
                     white-space:nowrap;">💸 Open Venmo</a>
            &nbsp;or&nbsp;<a href="https://buymeacoffee.com/dougtucker" target="_blank"
              style="color:#FFDD00; text-decoration:none; font-size:0.8rem;
                     border:1px solid rgba(255,221,0,0.35); border-radius:4px; padding:1px 9px;
                     background:rgba(255,221,0,0.08); white-space:nowrap;">☕ Buy Me a Coffee</a>.
            <br>Donations also help cover ongoing costs for tools and hosting, and will enable new features and faster hosting to be added.
          </p>
          <div style="border-top:1px solid rgba(255,255,255,0.07); padding-top:12px;">
            <div style="font-size:0.78rem; font-weight:600; color:var(--muted);
                text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px;">
              💡 Suggestions for the app
            </div>
            <textarea id="${idPrefix}-final-suggestion-text"
                placeholder="What would you like to see improved or added?"
                style="width:100%; box-sizing:border-box; min-height:80px; padding:8px 10px;
                       font-size:0.85rem; background:rgba(255,255,255,0.05);
                       border:1px solid rgba(255,255,255,0.15); border-radius:6px;
                       color:var(--white); resize:vertical; font-family:inherit;"></textarea>
            <div style="display:flex; align-items:center; gap:10px; margin-top:8px; flex-wrap:wrap;">
              <button id="${idPrefix}-final-suggestion-send"
                  class="btn btn-primary" style="font-size:0.82rem; padding:5px 16px;">
                📨 Send
              </button>
              <span id="${idPrefix}-final-suggestion-status" style="font-size:0.82rem;"></span>
            </div>
          </div>
        </div>
      </details>`;
  }

  function wireFinalSessionBanner(idPrefix, playerName) {
    const btn    = document.getElementById(`${idPrefix}-final-suggestion-send`);
    const txtEl  = document.getElementById(`${idPrefix}-final-suggestion-text`);
    const statEl = document.getElementById(`${idPrefix}-final-suggestion-status`);
    if (!btn || !txtEl || !statEl) return;
    btn.addEventListener('click', async () => {
      const message = txtEl.value.trim();
      if (!message) { statEl.innerHTML = '<span style="color:var(--danger);">Please enter a suggestion.</span>'; return; }
      btn.disabled = true; btn.textContent = '⏳ Sending…'; statEl.innerHTML = '';
      try {
        const sess = Auth.getSession();
        await API.sendFeedback({
          feedbackType: 'Suggestion',
          name:    playerName || sess?.leagueName || '',
          email:   '',
          message,
          leagueId:   sess?.leagueId,
          leagueName: sess?.leagueName,
        });
        statEl.innerHTML = '<span style="color:var(--green);">✓ Sent — thank you!</span>';
        txtEl.value = '';
      } catch (e) {
        statEl.innerHTML = `<span style="color:var(--danger);">Failed: ${esc(e.message)}</span>`;
      } finally {
        btn.disabled = false; btn.textContent = '📨 Send';
      }
    });
  }

  // ── Session accordion (date, time, title, court names per session) ──────────
  function renderSessionsAccordion() {
    const c = state.config;
    const numCourts = parseInt(document.getElementById('cfg-courts')?.value || c.courts || 3);
    const weeks = parseInt(document.getElementById('cfg-weeks')?.value || c.weeks || 8);

    // Preserve values already typed before rebuilding
    const saved = {};
    for (let w = 1; w <= 20; w++) {
      const dEl  = document.getElementById(`cfg-date-${w}`);
      const tEl  = document.getElementById(`cfg-time-${w}`);
      const ttEl = document.getElementById(`cfg-title-${w}`);
      if (dEl)  saved[`date_${w}`]  = dEl.value;
      if (tEl)  saved[`time_${w}`]  = tEl.value;
      if (ttEl) saved[`title_${w}`] = ttEl.value;
      for (let cn = 1; cn <= 8; cn++) {
        const cEl = document.getElementById(`cfg-court-name-${cn}-w${w}`);
        if (cEl) saved[`court_${cn}_${w}`] = cEl.value;
      }
    }

    // Remember which sessions are open
    const expanded = {};
    for (let w = 1; w <= 20; w++) {
      const body = document.getElementById(`sess-body-${w}`);
      if (body) expanded[w] = body.style.display !== 'none';
    }

    let html = `<div style="margin-top:12px; margin-bottom:4px; font-size:0.85rem; font-weight:600; color:var(--muted);">Per-Session Details</div>`;
    html += `<div id="session-accordion" style="border:1px solid var(--border); border-radius:6px; overflow:hidden;">`;

    for (let w = 1; w <= weeks; w++) {
      const dateVal  = saved[`date_${w}`]  !== undefined ? saved[`date_${w}`]  : normalizeDate(c[`date_${w}`] || '');
      const timeVal  = saved[`time_${w}`]  !== undefined ? saved[`time_${w}`]  : (c[`time_${w}`]  || '');
      const titleVal = saved[`title_${w}`] !== undefined ? saved[`title_${w}`] : (c[`title_${w}`] || '');

      const summaryParts = [];
      if (dateVal)  summaryParts.push(dateVal);
      if (titleVal) summaryParts.push(titleVal);
      const summary = summaryParts.join('  ·  ');

      const isOpen = !!expanded[w];
      const borderTop = w > 1 ? 'border-top:1px solid var(--border);' : '';

      html += `<div class="session-acc-item" style="${borderTop}">`;

      // Header
      html += `
        <div id="sess-header-${w}" style="display:flex; align-items:center; gap:8px; padding:8px 12px; cursor:pointer; background:var(--surface2); user-select:none;" onclick="window._toggleSessionAcc(${w})">
          <span style="font-size:0.7rem; color:var(--muted); transition:transform 0.15s; display:inline-block; transform:${isOpen ? 'rotate(90deg)' : 'rotate(0deg)'};" id="sess-arrow-${w}">▶</span>
          <span style="font-size:0.85rem; font-weight:600; min-width:72px;">Session ${w}</span>
          <span style="font-size:0.82rem; color:var(--muted); flex:1;" id="sess-summary-${w}">${esc(summary)}</span>
        </div>`;

      // Body
      html += `<div id="sess-body-${w}" style="display:${isOpen ? '' : 'none'}; padding:12px 14px; border-top:1px solid var(--border);">`;

      // Date + Time + Title row
      html += `<div class="form-row" style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end; margin-bottom:8px;">
        <div class="form-group" style="margin-bottom:0; flex:0 0 auto;">
          <label class="form-label">Date</label>
          <input class="form-control" id="cfg-date-${w}" type="date" value="${dateVal}" style="width:160px;" onchange="window._updateSessionSummary(${w})">
        </div>
        <div class="form-group" style="margin-bottom:0; flex:0 0 auto;">
          <label class="form-label">Time</label>
          <input class="form-control" id="cfg-time-${w}" type="time" value="${timeVal}" style="width:130px;">
        </div>
        <div class="form-group" style="margin-bottom:0; flex:1; min-width:160px;">
          <label class="form-label">Title <span style="color:var(--muted); font-size:0.75rem;">(optional)</span></label>
          <input class="form-control" id="cfg-title-${w}" type="text" placeholder="e.g. Finals, Playoffs" value="${esc(titleVal)}" style="width:100%;" oninput="window._updateSessionSummary(${w})">
        </div>
      </div>`;

      // Court names
      if (numCourts > 0) {
        html += `<div class="form-row" style="display:flex; flex-wrap:wrap; gap:8px; align-items:flex-end; margin-bottom:10px;">`;
        for (let cn = 1; cn <= numCourts; cn++) {
          let courtVal = '';
          if (saved[`court_${cn}_${w}`] !== undefined) {
            courtVal = saved[`court_${cn}_${w}`];
          } else if (c[`courtName_${cn}_w${w}`]) {
            courtVal = c[`courtName_${cn}_w${w}`];
          } else if (c[`courtName_${cn}`]) {
            courtVal = c[`courtName_${cn}`];
          }
          html += `
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">Court ${cn} Name</label>
              <input class="form-control" id="cfg-court-name-${cn}-w${w}" placeholder="Court ${cn}" value="${esc(courtVal)}" style="width:120px;">
            </div>`;
        }
        html += '</div>';
      }

      // Copy to all remaining sessions button
      html += `
        <div>
          <button type="button" class="btn" style="font-size:0.78rem; padding:4px 12px; height:auto;" onclick="window._copySessionToAll(${w})">Copy to all remaining sessions →</button>
        </div>`;

      html += '</div>'; // end body
      html += '</div>'; // end session-acc-item
    }

    html += '</div>'; // end accordion

    document.getElementById('cfg-dates-area').innerHTML = html;
    document.getElementById('cfg-court-names-area').innerHTML = '';

    window._toggleSessionAcc = function(w) {
      const body  = document.getElementById(`sess-body-${w}`);
      const arrow = document.getElementById(`sess-arrow-${w}`);
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
    };

    window._updateSessionSummary = function(w) {
      const dateEl  = document.getElementById(`cfg-date-${w}`);
      const titleEl = document.getElementById(`cfg-title-${w}`);
      const summEl  = document.getElementById(`sess-summary-${w}`);
      if (!summEl) return;
      const parts = [];
      if (dateEl?.value)  parts.push(dateEl.value);
      if (titleEl?.value) parts.push(titleEl.value);
      summEl.textContent = parts.join('  ·  ');
    };

    window._copySessionToAll = function(fromW) {
      const numC = parseInt(document.getElementById('cfg-courts')?.value || state.config.courts || 3);
      const numW = parseInt(document.getElementById('cfg-weeks')?.value || state.config.weeks || 8);
      const baseDateStr = document.getElementById(`cfg-date-${fromW}`)?.value || '';
      const timeVal     = document.getElementById(`cfg-time-${fromW}`)?.value || '';
      const titleVal    = document.getElementById(`cfg-title-${fromW}`)?.value || '';
      const baseDate    = baseDateStr ? new Date(baseDateStr + 'T00:00:00') : null;
      for (let w = fromW + 1; w <= numW; w++) {
        const offset = w - fromW;
        if (baseDate) {
          const d = new Date(baseDate);
          d.setDate(d.getDate() + offset * 7);
          const dEl = document.getElementById(`cfg-date-${w}`);
          if (dEl) dEl.value = d.toISOString().slice(0, 10);
        }
        const tEl  = document.getElementById(`cfg-time-${w}`);
        const ttEl = document.getElementById(`cfg-title-${w}`);
        if (tEl)  tEl.value  = timeVal;
        if (ttEl) ttEl.value = titleVal;
        for (let cn = 1; cn <= numC; cn++) {
          const srcEl = document.getElementById(`cfg-court-name-${cn}-w${fromW}`);
          const dstEl = document.getElementById(`cfg-court-name-${cn}-w${w}`);
          if (srcEl && dstEl) dstEl.value = srcEl.value;
        }
        window._updateSessionSummary(w);
      }
    };
  }

  // ── Setup ──────────────────────────────────────────────────
  function renderSetup() {
    const c = state.config;
    // Apply limit caps after setup fields are populated (called at end of this function)
    document.getElementById('cfg-name').value     = c.leagueName  || '';
    document.getElementById('cfg-location').value = c.location    || '';
    document.getElementById('cfg-time').value     = c.sessionTime || '';
    document.getElementById('cfg-notes').value    = c.notes       || '';
    // Auto-populate URL if blank using current leagueId
    const leagueId = Auth.getSession()?.leagueId || '';
    const _cid2 = state.currentLeagueCustomerId
      || sessionStorage.getItem('pb_customer_id')
      || (c.leagueUrl || '').match(/[?&]id=([^&]+)/)?.[1]
      || '';
    const generatedUrl = leagueId
      ? APP_BASE_URL + 'index.html?league=' + encodeURIComponent(leagueId) + (_cid2 ? '&id=' + encodeURIComponent(_cid2) : '')
      : (c.leagueUrl || APP_BASE_URL + 'index.html');
    const urlEl = document.getElementById('cfg-league-url');
    if (urlEl) urlEl.value = generatedUrl;
    const idDisplay = document.getElementById('cfg-league-id-display');
    if (idDisplay) idDisplay.value = leagueId;
    document.getElementById('cfg-allow-registration').checked = c.allowRegistration === true || c.allowRegistration === 'true';
    document.getElementById('cfg-reg-code').value              = c.registrationCode   || '';
    document.getElementById('cfg-reg-max-pending').value       = c.maxPendingReg      || 10;
    { const _mp = parseInt(c.maxParticipants); document.getElementById('cfg-reg-max-participants').value = isFinite(_mp) ? _mp : ''; }
    document.getElementById('cfg-reg-fee').value               = c.registrationFee    != null ? c.registrationFee : '';
    document.getElementById('cfg-stripe-secret-key').value     = c.stripeSecretKey     || '';
    document.getElementById('cfg-reg-payment-required').checked = c.registrationPaymentRequired === true || c.registrationPaymentRequired === 'true';
    // Show/hide registration options based on checkbox
    document.getElementById('cfg-registration-options').style.display =
      (c.allowRegistration === true || c.allowRegistration === 'true') ? '' : 'none';
    document.getElementById('cfg-allow-registration').addEventListener('change', function() {
      document.getElementById('cfg-registration-options').style.display = this.checked ? '' : 'none';
    });

    document.getElementById('cfg-rules').value    = c.rules       || '';
    document.getElementById('cfg-admin-pin').value = '';
    document.getElementById('cfg-weeks').value   = c.weeks || 8;
    document.getElementById('cfg-courts').value  = c.courts || 3;
    document.getElementById('cfg-games').value   = c.gamesPerSession || 7;
    document.getElementById('cfg-tries').value   = c.optimizerTries || 100;
    document.getElementById('cfg-event-type').value     = c.eventType     || 'league';
    // Update event-type-sensitive labels throughout the admin UI
    const evtLabel = (c.eventType === 'tournament') ? 'Tournament' : 'League';
    const setTxt = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setTxt('admin-setup-heading',    evtLabel + ' Setup');
    setTxt('admin-league-name-label', evtLabel + ' Name');
    document.getElementById('cfg-game-mode').value      = c.gameMode      || 'doubles';
    document.getElementById('cfg-ranking-method').value = c.rankingMethod || 'avgptdiff';
    const standMethEl = document.getElementById('cfg-standings-method');
    if (standMethEl) {
      standMethEl.value = c.standingsMethod || 'standard';
      const ladderSec = document.getElementById('cfg-ladder-section');
      if (ladderSec) ladderSec.style.display = standMethEl.value === 'ladder' ? '' : 'none';
      standMethEl.addEventListener('change', function () {
        const sec = document.getElementById('cfg-ladder-section');
        if (sec) sec.style.display = this.value === 'ladder' ? '' : 'none';
      });
    }
    const challengesEl = document.getElementById('cfg-challenges-enabled');
    if (challengesEl) {
      challengesEl.checked = c.challengesEnabled === true || c.challengesEnabled === 'true';
      // Disable if tier doesn't support challenges
      if (state.limits?.tier) {
        const tierDef = typeof TIERS !== 'undefined' ? TIERS.find(t => t.version.toLowerCase() === state.limits.tier.toLowerCase()) : null;
        if (tierDef && (tierDef.disableList || []).includes('challenges')) {
          challengesEl.disabled = true;
          const row = document.getElementById('cfg-challenges-row');
          if (row) row.title = 'Not available on this subscription tier';
        }
      }
    }
    const lv = id => document.getElementById(id);
    if (lv('cfg-ladder-attend-pts')) lv('cfg-ladder-attend-pts').value = c.ladderAttendPts ?? 2;
    if (lv('cfg-ladder-play-pts'))   lv('cfg-ladder-play-pts').value   = c.ladderPlayPts   ?? 1;
    [1,2,3,4,5,6].forEach(i => {
      const dfMin = [-99, 0, 4, 7, 0, 0][i-1], dfMax = [-1, 3, 6, 99, 0, 0][i-1], dfPts = [3, 2, 1, 0, 0, 0][i-1];
      if (lv(`cfg-ladder-range${i}-min`)) lv(`cfg-ladder-range${i}-min`).value = c[`ladderRange${i}Min`] ?? dfMin;
      if (lv(`cfg-ladder-range${i}-max`)) lv(`cfg-ladder-range${i}-max`).value = c[`ladderRange${i}Max`] ?? dfMax;
      if (lv(`cfg-ladder-range${i}-pts`)) lv(`cfg-ladder-range${i}-pts`).value = c[`ladderRange${i}Pts`] ?? dfPts;
    });
    if (lv('cfg-ladder-rank1-pts')) lv('cfg-ladder-rank1-pts').value = c.ladderRank1Pts ?? 0;
    if (lv('cfg-ladder-rank2-pts')) lv('cfg-ladder-rank2-pts').value = c.ladderRank2Pts ?? 0;
    if (lv('cfg-ladder-rank3-pts')) lv('cfg-ladder-rank3-pts').value = c.ladderRank3Pts ?? 0;
    document.getElementById('cfg-pairing-mode').value   = c.pairingMode   || 'round-based';
    document.getElementById('cfg-min-participation').value = c.minParticipation !== undefined ? c.minParticipation : '';
    // Cap inputs per registry limits
    applyLimitRestrictions();
    // Clear dirty flag — population of fields above may have triggered change events
    state._setupDirty = false;

    // Optimizer weights
    const D = Pairings.DEFAULTS;
    document.getElementById('cfg-w-session-partner').value   = c.wSessionPartner   ?? D.sessionPartnerWeight;
    document.getElementById('cfg-w-session-opponent').value  = c.wSessionOpponent  ?? D.sessionOpponentWeight;
    document.getElementById('cfg-w-history-partner').value   = c.wHistoryPartner   ?? D.historyPartnerWeight;
    document.getElementById('cfg-w-history-opponent').value  = c.wHistoryOpponent  ?? D.historyOpponentWeight;
    document.getElementById('cfg-w-bye-variance').value      = c.wByeVariance      ?? D.byeVarianceWeight;
    document.getElementById('cfg-w-session-bye').value       = c.wSessionBye       ?? D.sessionByeWeight;
    document.getElementById('cfg-w-rank-balance').value           = c.wRankBalance           ?? D.rankBalanceWeight;
    document.getElementById('cfg-w-rank-std-dev').value            = c.wRankStdDev            ?? D.rankStdDevWeight;
    const queueWaitEl = document.getElementById('cfg-w-queue-wait');
    if (queueWaitEl) queueWaitEl.value = c.wQueueWait ?? 10;
    const localImproveEl = document.getElementById('cfg-local-improve');
    if (localImproveEl) localImproveEl.checked = c.localImprove === undefined ? true : (c.localImprove === true || c.localImprove === 'true');
    const swapPassesEl = document.getElementById('cfg-swap-passes');
    if (swapPassesEl) swapPassesEl.value = c.swapPasses !== undefined ? c.swapPasses : 5;
    const useInitialRankEl = document.getElementById('cfg-use-initial-rank');
    if (useInitialRankEl) useInitialRankEl.checked = c.useInitialRank === true || c.useInitialRank === 'true';

    // Coordinator name, phone + photo
    const coordNameEl = document.getElementById('cfg-coordinator-name');
    if (coordNameEl) coordNameEl.value = c.coordinatorName || '';
    const coordPhoneEl = document.getElementById('cfg-coordinator-phone');
    if (coordPhoneEl) coordPhoneEl.value = c.coordinatorPhone || '';
    const coordPreview = document.getElementById('coordinator-photo-preview');
    if (coordPreview) {
      const cName = c.coordinatorName || 'Admin';
      coordPreview.src = state._tierDisablePhotos
        ? generateInitialAvatar(cName, 72)
        : playerPhotoSrc(cName, c.coordinatorPhoto || '', 72);
    }
    const coordPhotoBtn   = document.getElementById('btn-coordinator-photo');
    const coordPhotoInput = document.getElementById('coordinator-photo-input');
    if (coordPhotoBtn && coordPhotoInput && !coordPhotoBtn._wired) {
      coordPhotoBtn._wired = true;
      coordPhotoBtn.addEventListener('click', () => coordPhotoInput.click());
      coordPhotoInput.addEventListener('change', async ev => {
        const file = ev.target.files?.[0];
        if (!file) return;
        coordPhotoBtn.style.opacity = '0.5';
        try {
          const b64 = await resizeImageFile(file);
          const newConfig = { ...state.config,
            coordinatorName:  document.getElementById('cfg-coordinator-name')?.value.trim() || state.config.coordinatorName || '',
            coordinatorPhone: document.getElementById('cfg-coordinator-phone')?.value.trim() || state.config.coordinatorPhone || '',
            coordinatorPhoto: b64 };
          await API.saveConfig(newConfig);
          state.config = sanitizeConfig(newConfig);
          if (coordPreview) coordPreview.src = 'data:image/jpeg;base64,' + b64;
          toast('Coordinator photo saved!');
        } catch (err) { toast('Photo save failed: ' + err.message, 'error'); }
        finally { coordPhotoBtn.style.opacity = ''; coordPhotoInput.value = ''; }
      });
    }

    // Session accordion — date, time, title, court names per session
    renderSessionsAccordion();
  }

  // ── Players ────────────────────────────────────────────────
  function makePlayerRow(p, i) {
    const isFixedPairs = (state.config.gameMode || 'doubles') === 'fixed-pairs';
    const photoSrc = state._tierDisablePhotos ? generateInitialAvatar('', 32) : playerPhotoSrc(p.name, p.photo || '', 32);

    const statusBadge = p.active === 'pend'
      ? '<span class="status-badge" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,165,0,0.18); color:#f0a500; white-space:nowrap;">Pending</span>'
      : p.active === false
        ? '<span class="status-badge" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,80,80,0.15); color:var(--danger); white-space:nowrap;">Inactive</span>'
        : '<span class="status-badge" style="display:none;"></span>';

    const groupLabel = { M: 'Male', F: 'Female', Either: 'Either' }[p.group] || (p.group || '');
    const groupChip  = groupLabel
      ? `<span class="summary-chip-group" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,255,255,0.07); color:var(--muted); white-space:nowrap;">${groupLabel}</span>`
      : '';
    const rankChipHtml = p.initialRank
      ? `<span class="summary-chip-rank" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,255,255,0.07); color:var(--muted); white-space:nowrap;">#${p.initialRank}</span>`
      : `<span class="summary-chip-rank" style="display:none;"></span>`;
    const scoreChip  = !state._tierDisableScoring
      ? (p.canScore
          ? `<span class="summary-chip-score" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(94,194,106,0.15); color:var(--green); white-space:nowrap;">✓ Score</span>`
          : `<span class="summary-chip-score" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,255,255,0.05); color:var(--muted); white-space:nowrap;">No Score</span>`)
      : '';

    const hasFee = parseFloat(state.config.registrationFee) > 0;
    const paidChip = hasFee
      ? (p.stripePaid
          ? `<span class="summary-chip-paid" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(94,194,106,0.18); color:var(--green); white-space:nowrap;">Paid</span>`
          : `<span class="summary-chip-paid" style="font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,80,80,0.15); color:var(--danger); white-space:nowrap;">Unpaid</span>`)
      : '';

    const displayName = p.name
      ? esc(p.name)
      : `<em style="color:var(--muted);">New ${isFixedPairs ? 'Team' : 'Player'}</em>`;

    const row = document.createElement('details');
    row.className = 'player-accordion';
    if (!p.name) row.open = true;
    row.style.cssText = 'margin-bottom:4px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; background:rgba(255,255,255,0.02);';

    row.innerHTML = `
      <summary style="list-style:none; cursor:pointer; display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:8px; user-select:none;">
        <div class="player-avatar-wrap" style="position:relative; flex-shrink:0;${state._tierDisablePhotos ? 'visibility:hidden;' : ''}">
          <button class="btn btn-outline btn-photo" data-photo-idx="${i}" title="Add/change photo"
            style="padding:0; width:32px; height:32px; border-radius:50%; overflow:hidden; border:2px solid var(--border);">
            <img src="${photoSrc}" style="width:100%;height:100%;object-fit:cover;" alt="photo">
          </button>
          ${p.donated ? `<span class="donor-star" style="position:absolute; top:-5px; right:-5px; font-size:11px; line-height:1; pointer-events:none;" title="Supporter ★">⭐</span>` : `<span class="donor-star" style="display:none; position:absolute; top:-5px; right:-5px; font-size:11px; line-height:1; pointer-events:none;" title="Supporter ★">⭐</span>`}
        </div>
        <span class="player-accordion-name" style="font-weight:600; font-size:0.9rem; min-width:80px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${displayName}</span>
        <div style="display:flex; align-items:center; gap:4px; flex:1; flex-wrap:wrap;">
          ${groupChip}${rankChipHtml}${scoreChip}${statusBadge}${paidChip}
        </div>
        <span class="collapse-arrow" style="font-size:0.7rem; color:var(--muted); flex-shrink:0;">▼</span>
      </summary>
      <div style="padding:14px 16px; border-top:1px solid rgba(255,255,255,0.06); display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div style="grid-column:1/-1;">
          <label class="label" style="display:block; margin-bottom:4px;">${isFixedPairs ? 'Team Name' : 'Handle / Display Name'} <span style="color:var(--danger);">*</span></label>
          <input class="form-control" data-field="name" data-idx="${i}" value="${esc(p.name)}" placeholder="${isFixedPairs ? 'Team name e.g. Doug&amp;Kim' : 'Name others see'}">
        </div>
        ${!isFixedPairs ? `
        <div style="grid-column:1/-1;">
          <label class="label" style="display:block; margin-bottom:4px;">Full Name <span style="font-weight:400; color:var(--muted);">(optional)</span></label>
          <input class="form-control" data-field="fullName" data-idx="${i}" value="${esc(p.fullName || '')}" placeholder="First Last">
        </div>` : ''}
        <div>
          <label class="label" style="display:block; margin-bottom:4px;">Password</label>
          <input class="form-control" data-field="pin" data-idx="${i}" type="text" value="${esc(String(p.pin || ''))}" placeholder="Password" maxlength="20">
        </div>
        <div>
          <label class="label" style="display:block; margin-bottom:4px; cursor:help;" title="Only used for Mixed Doubles mode to balance partnerships. Has no effect in other game modes.">Gender Group &#x2139;</label>
          <select class="form-control" data-field="group" data-idx="${i}">
            <option value="M" ${p.group==='M'?'selected':''}>Male</option>
            <option value="F" ${p.group==='F'?'selected':''}>Female</option>
            <option value="Either" ${p.group==='Either'?'selected':''}>Either</option>
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <label class="label" style="display:block; margin-bottom:4px;">Email <span style="font-weight:400; color:var(--muted);">(optional)</span></label>
          <input class="form-control" data-field="email" data-idx="${i}" type="email" value="${esc(p.email || '')}" placeholder="email@example.com">
        </div>
        <div style="grid-column:1/-1;">
          <label class="label" style="display:block; margin-bottom:4px;">Cell Phone <span style="font-weight:400; color:var(--muted);">(optional)</span></label>
          <input class="form-control" data-field="phone" data-idx="${i}" type="tel" value="${esc(p.phone || '')}" placeholder="e.g. 555-123-4567">
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" data-field="notify" data-idx="${i}" ${p.notify ? 'checked' : ''} style="width:16px;height:16px; flex-shrink:0;">
          <label class="label" style="margin:0; cursor:pointer;">Email notifications</label>
        </div>
        <div style="display:flex; align-items:center; gap:8px;${state._tierDisableScoring ? 'visibility:hidden;' : ''}">
          <input type="checkbox" data-field="canScore" data-idx="${i}" ${p.canScore ? 'checked' : ''} style="width:16px;height:16px; flex-shrink:0;" ${state._tierDisableScoring ? 'disabled' : ''}>
          <label class="label" style="margin:0; cursor:pointer;">Can enter scores</label>
        </div>
        <div>
          <label class="label" style="display:block; margin-bottom:4px;" title="Initial ranking used before season standings are established">Initial Rank</label>
          <input class="form-control" data-field="initialRank" data-idx="${i}" type="number" min="1" value="${p.initialRank || ''}" placeholder="—" style="text-align:center;">
        </div>
        <div>
          <label class="label" style="display:block; margin-bottom:4px;">Role</label>
          <select class="form-control" data-field="role" data-idx="${i}">
            <option value="" ${!p.role||p.role===''?'selected':''}>Player</option>
            ${p.role==='scorer' ? `<option value="scorer" selected>Scorer (use Can Score)</option>` : ''}
            <option value="assistant" ${p.role==='assistant'?'selected':''}>Assistant</option>
            <option value="admin" ${p.role==='admin'?'selected':''}>Admin</option>
            <option value="spectator" ${p.role==='spectator'?'selected':''}>Spectator</option>
            <option value="sub" ${p.role==='sub'?'selected':''}>Sub</option>
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <label class="label" style="display:block; margin-bottom:4px;">Status</label>
          <select class="form-control" data-field="active" data-idx="${i}">
            <option value="true" ${p.active===true?'selected':''}>Active</option>
            <option value="pend" ${p.active==='pend'?'selected':''}>Pending</option>
            <option value="false" ${p.active===false?'selected':''}>Inactive</option>
          </select>
        </div>
        ${hasFee ? `
        <div style="grid-column:1/-1; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); margin-top:2px;">
          <label class="label" style="display:block; margin-bottom:6px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted);">Payment</label>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.85rem;">
              <input type="checkbox" data-field="stripePaid" data-idx="${i}" ${p.stripePaid ? 'checked' : ''} style="width:15px;height:15px;">
              <span>Paid</span>
            </label>
            <div class="form-group" style="margin:0; min-width:130px;">
              <label class="label" style="font-size:0.75rem; margin-bottom:2px;">Payment Date</label>
              <input class="form-control" data-field="stripePaymentDate" data-idx="${i}" type="date" value="${esc(p.stripePaymentDate || '')}" style="font-size:0.82rem; padding:4px 8px;">
            </div>
            <div class="form-group" style="margin:0; flex:1; min-width:160px;">
              <label class="label" style="font-size:0.75rem; margin-bottom:2px;">Payment Reference</label>
              <input class="form-control" data-field="stripeRef" data-idx="${i}" type="text" value="${esc(p.stripeRef || '')}" placeholder="Stripe session ID" style="font-size:0.82rem; padding:4px 8px;">
            </div>
          </div>
        </div>` : ''}
        <div style="grid-column:1/-1; padding-top:10px; border-top:1px solid rgba(255,255,255,0.06); margin-top:2px;">
          <label class="label" style="display:block; margin-bottom:6px; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted);">Donation</label>
          <div style="display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap;">
            <div class="form-group" style="margin:0; min-width:110px;">
              <label class="label" style="font-size:0.75rem; margin-bottom:2px;">Amount ($)</label>
              <input class="form-control" data-field="donated" data-idx="${i}" type="number" min="0" step="0.01" value="${esc(String(p.donated || ''))}" placeholder="0.00" style="font-size:0.82rem; padding:4px 8px;">
            </div>
            <div class="form-group" style="margin:0; min-width:150px;">
              <label class="label" style="font-size:0.75rem; margin-bottom:2px;">Via</label>
              <select class="form-control" data-field="donationMethod" data-idx="${i}" style="font-size:0.82rem; padding:4px 8px;">
                <option value="" ${!p.donationMethod?'selected':''}>—</option>
                <option value="venmo" ${p.donationMethod==='venmo'?'selected':''}>Venmo</option>
                <option value="bmac" ${p.donationMethod==='bmac'?'selected':''}>Buy Me a Coffee</option>
                <option value="other" ${p.donationMethod==='other'?'selected':''}>Other</option>
              </select>
            </div>
          </div>
        </div>
        <div style="grid-column:1/-1; padding-top:4px; border-top:1px solid rgba(255,255,255,0.06); margin-top:2px;">
          <button class="btn btn-danger" data-remove="${i}" style="font-size:0.82rem;">Delete ${isFixedPairs ? 'Team' : 'Player'}</button>
        </div>
      </div>
    `;
    return row;
  }

  function renderPlayers() {
    const isFixedPairs = (state.config.gameMode || 'doubles') === 'fixed-pairs';

    // Show/hide fixed-pairs hint and update button/column label
    const hintEl = document.getElementById('fixed-pairs-hint');
    if (hintEl) hintEl.style.display = isFixedPairs ? '' : 'none';
    const addBtn = document.getElementById('btn-add-player');
    if (addBtn) addBtn.textContent = isFixedPairs ? '+ Add Team' : '+ Add Player';

    const list = document.getElementById('player-list');
    list.innerHTML = '';

    // If players haven't loaded yet, show a waiting indicator
    if (!state._playersLoaded && (!state.players || state.players.length === 0)) {
      list.innerHTML = '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.85rem;">⏳ Loading player data…</div>';
      return;
    }

    // Group players by role key
    const groups = {};
    ROLE_ORDER.forEach(r => { groups[r] = []; });
    state.players.forEach((p, i) => {
      const rk = p.active === 'pend' ? 'pend' : (p.role || '');
      if (!groups[rk]) groups[rk] = [];
      groups[rk].push({ p, i });
    });

    ROLE_ORDER.forEach(rk => {
      const members = groups[rk] || [];
      if (!members.length) return;

      const label = ROLE_LABELS[rk] || rk;
      const color = ROLE_COLORS[rk] || 'rgba(255,255,255,0.06)';

      // Collapsible group header
      const details = document.createElement('details');
      details.open = true;
      details.style.marginBottom = '6px';

      const summary = document.createElement('summary');
      summary.style.cssText = `list-style:none; cursor:pointer; display:flex; align-items:center;
        gap:8px; padding:6px 12px; border-radius:8px; background:${color};
        border:1px solid rgba(255,255,255,0.07); user-select:none; margin-bottom:4px;`;
      summary.innerHTML = `
        <span class="collapse-arrow" style="font-size:0.68rem; color:var(--green); opacity:0.7;">▲</span>
        <span style="font-weight:600; font-size:0.82rem; color:var(--white);">${label}</span>
        <span style="font-size:0.72rem; color:var(--muted); margin-left:auto;">${members.length} player${members.length!==1?'s':''}</span>`;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.style.paddingBottom = '4px';
      members.forEach(({ p, i }) => {
        body.appendChild(makePlayerRow(p, i));
      });
      details.appendChild(body);
      list.appendChild(details);
    });

    // Live update
    list.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', e => {
        const idx   = parseInt(el.dataset.idx);
        const field = el.dataset.field;
        let val = el.type === 'checkbox' ? el.checked : el.value;
        if (field === 'active') {
          const prev = state.players[idx].active;
          val = val === 'true' ? true : val === 'pend' ? 'pend' : false;
          // When approving a pending player, clear the legacy 'player' string role to ''
          // (registered players get role='player' stored; '' is the correct standard-player value)
          if (prev === 'pend' && val === true) {
            if (!state.players[idx].role || state.players[idx].role === 'player') {
              state.players[idx].role = '';
            }
            const pName = state.players[idx].name;
            API.approvePlayer(pName, getRelayConfig()).then(r => {
              if (r.emailSent) toast(`${esc(pName)} approved — approval email sent.`);
              else toast(`${esc(pName)} approved (no email on file).`);
            }).catch(err => toast(`${esc(pName)} approved but approval email failed: ` + err.message, 'warn'));
          }
          state.players[idx][field] = val;
          // Re-render so the player card moves to the correct group section
          const movedName = state.players[idx].name;
          renderPlayers();
          // Re-open and scroll to the moved player
          document.querySelectorAll('#player-list .player-accordion').forEach(acc => {
            if (acc.querySelector('.player-accordion-name')?.textContent === movedName) {
              acc.open = true;
              acc.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          });
          return;
        }
        if (field === 'initialRank') val = val ? parseInt(val) : null;
        if (field === 'donated') val = val ? parseFloat(val) : null;
        state.players[idx][field] = val;
        // Sync summary chips when relevant fields change
        const accordion = el.closest('.player-accordion');
        if (accordion) {
          if (field === 'active') {
            const badge = accordion.querySelector('summary .status-badge');
            if (badge) {
              if (val === 'pend') {
                badge.textContent = 'Pending';
                badge.style.cssText = 'font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,165,0,0.18); color:#f0a500; white-space:nowrap;';
              } else if (val === false) {
                badge.textContent = 'Inactive';
                badge.style.cssText = 'font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,80,80,0.15); color:var(--danger); white-space:nowrap;';
              } else {
                badge.textContent = '';
                badge.style.cssText = 'display:none;';
              }
            }
          }
          if (field === 'group') {
            const chip = accordion.querySelector('summary .summary-chip-group');
            if (chip) chip.textContent = { M: 'Male', F: 'Female', Either: 'Either' }[val] || val;
          }
          if (field === 'initialRank') {
            const chip = accordion.querySelector('summary .summary-chip-rank');
            if (chip) {
              if (val) { chip.textContent = '#' + val; chip.style.display = ''; }
              else     { chip.textContent = ''; chip.style.display = 'none'; }
            }
          }
          if (field === 'canScore') {
            const chip = accordion.querySelector('summary .summary-chip-score');
            if (chip) {
              if (val) {
                chip.textContent = '✓ Score';
                chip.style.cssText = 'font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(94,194,106,0.15); color:var(--green); white-space:nowrap;';
              } else {
                chip.textContent = 'No Score';
                chip.style.cssText = 'font-size:0.68rem; padding:1px 7px; border-radius:8px; background:rgba(255,255,255,0.05); color:var(--muted); white-space:nowrap;';
              }
            }
          }
          if (field === 'donated') {
            const star = accordion.querySelector('summary .donor-star');
            if (star) star.style.display = (val && parseFloat(val) > 0) ? '' : 'none';
          }
        }
      });
    });

    // Live name → accordion summary sync
    list.querySelectorAll('[data-field="name"]').forEach(el => {
      el.addEventListener('input', () => {
        const accordion = el.closest('.player-accordion');
        if (!accordion) return;
        const nameSpan = accordion.querySelector('.player-accordion-name');
        if (nameSpan) nameSpan.textContent = el.value || '(unnamed)';
      });
    });

    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.dataset.remove);
        const playerName = state.players[idx]?.name || (isFixedPairs ? 'this team' : 'this player');
        if (!confirm(`Delete "${playerName}"? This cannot be undone.`)) return;
        state.players.splice(idx, 1);
        renderPlayers();
      });
    });

    // Re-apply tier restrictions that affect dynamically-rendered rows
    if (state._tierDisableDeletion) {
      list.querySelectorAll('[data-remove]').forEach(el => { el.style.display = 'none'; });
    }
    if (state._tierDisableChangePasswords) {
      list.querySelectorAll('[data-field="pin"]').forEach(el => {
        el.disabled = true;
        el.title = 'Password changes not available on this subscription tier';
        el.style.opacity = '0.45';
      });
    }

    // Photo buttons — hidden file input per click
    list.querySelectorAll('.btn-photo').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.photoIdx);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files[0];
          if (!file) return;
          const playerName = state.players[idx].name;
          btn.style.opacity = '0.5';
          try {
            const b64 = await resizeImageFile(file);
            await API.savePlayerPhoto(playerName, b64);
            state.players[idx].photo = b64;
            // Update the button avatar in-place
            const img = btn.querySelector('img');
            if (img) img.src = 'data:image/jpeg;base64,' + b64;
            toast(`Photo saved for ${esc(playerName)}`);
          } catch (err) {
            toast('Photo save failed: ' + err.message, 'warn');
          } finally {
            btn.style.opacity = '';
          }
        };
        input.click();
      });
    });
  }

  // ── Attendance ─────────────────────────────────────────────
  function renderMessaging() {
    const c = state.config;
    const replyEl = document.getElementById('cfg-reply-to');
    if (replyEl) replyEl.value = c.replyTo || '';
    const adminOnlyEl = document.getElementById('cfg-admin-only-email');
    if (adminOnlyEl) adminOnlyEl.checked = c.adminOnlyEmail === true || c.adminOnlyEmail === 'true';

    // Personal email script fields
    const urlEl = document.getElementById('cfg-email-script-url');
    const secEl = document.getElementById('cfg-email-script-secret');
    if (urlEl) urlEl.value = c.emailScriptUrl || '';
    if (secEl) secEl.value = c.emailScriptSecret || '';

    const activeLabel = document.getElementById('email-script-active-label');
    if (activeLabel) {
      activeLabel.textContent = c.emailScriptUrl
        ? '✓ Personal email script active — league emails will be sent from your account.'
        : 'No personal script configured — emails will be sent from the app developer\'s account.';
      activeLabel.style.color = c.emailScriptUrl ? 'var(--green)' : '';
    }

    // Populate the code snippet with the current secret
    const codeEl = document.getElementById('email-script-code');
    if (codeEl) {
      const secret = c.emailScriptSecret || 'YOUR_SECRET_HERE';
      codeEl.textContent = getEmailRelayScript(secret);
    }
  }

  function getEmailRelayScript(secret) {
    return `// Pickleball League Manager — Personal Email Relay
// Deploy as Web App: Execute as Me, Access: Anyone
// Paste your Web App URL and secret into the league setup page.

const SECRET = '${secret}';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.secret !== SECRET) {
      return ContentService.createTextOutput(
        JSON.stringify({ success: false, error: 'Invalid secret' })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    const opts = { htmlBody: data.htmlBody || data.body || '', name: data.name || '' };
    if (data.replyTo) opts.replyTo = data.replyTo;
    GmailApp.sendEmail(data.to, data.subject, '', opts);
    return ContentService.createTextOutput(
      JSON.stringify({ success: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}`;
  }

  // ── Attendance dirty tracking ────────────────────────────────
  function setAttDirty(dirty) {
    state._attDirty = dirty;
    const indicator = document.getElementById('att-dirty-indicator');
    const saveBtn = document.getElementById('btn-save-attendance');
    if (indicator) { indicator.textContent = 'Unsaved changes'; indicator.style.display = dirty ? '' : 'none'; }
    if (saveBtn) saveBtn.disabled = !dirty;
  }

  async function saveAttendance() {
    const changes = Object.values(state._attPending || {});
    if (!changes.length) return;
    const saveBtn = document.getElementById('btn-save-attendance');
    const indicator = document.getElementById('att-dirty-indicator');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }
    if (indicator) indicator.textContent = 'Saving…';
    try {
      await API.batchSetAttendance(changes);
      state._attPending = {};
      setAttDirty(false);
      if (saveBtn) saveBtn.textContent = 'Save Attendance';
      toast('Attendance saved', 'success');
    } catch (e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Attendance'; }
      if (indicator) indicator.textContent = 'Unsaved changes';
      toast('Failed to save attendance — please try again', 'error');
    }
  }

  // ── My Profile (for assistants and any admin who wants to edit own record) ──
  function renderAttendance() {
    const weeks = parseInt(state.config.weeks || 8);
    // Exclude pending players — not yet authorized
    const sortMode = document.getElementById('att-sort')?.value || 'alpha';
    let attPlayers = state.players.filter(p => p.active !== 'pend');
    if (sortMode === 'alpha') {
      attPlayers = attPlayers.slice().sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === 'initial-rank') {
      attPlayers = attPlayers.slice().sort((a, b) => {
        const ra = a.initialRank != null ? a.initialRank : Infinity;
        const rb = b.initialRank != null ? b.initialRank : Infinity;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'season-rank') {
      const standMap = {};
      (state.standings || []).forEach(s => { standMap[s.name] = s.rank != null ? s.rank : Infinity; });
      attPlayers = attPlayers.slice().sort((a, b) => {
        const ra = standMap[a.name] != null ? standMap[a.name] : Infinity;
        const rb = standMap[b.name] != null ? standMap[b.name] : Infinity;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortMode === 'gender') {
      const gOrder = { M: 0, F: 1, Either: 2 };
      attPlayers = attPlayers.slice().sort((a, b) => {
        const ga = gOrder[a.group || 'M'] ?? 3;
        const gb = gOrder[b.group || 'M'] ?? 3;
        if (ga !== gb) return ga - gb;
        return a.name.localeCompare(b.name);
      });
    }

    // Coordinator banner
    const coordName = state.config.coordinatorName || '';
    let html = '';
    if (coordName) {
      const coordSrc = playerPhotoSrc(coordName, state.config.coordinatorPhoto || '', 36);
      html += `<div style="display:flex; align-items:center; gap:10px; padding:8px 12px; margin-bottom:10px;
          background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
        <img src="${coordSrc}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid rgba(255,255,255,0.12); flex-shrink:0;">
        <div>
          <div style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin-bottom:2px;">League Coordinator</div>
          <span class="att-coord-link" style="font-size:0.88rem; font-weight:600; color:var(--white);
            cursor:pointer; text-decoration:underline; text-underline-offset:2px;">${esc(coordName)}</span>
        </div>
      </div>`;
    }
    html += '<div class="att-grid">';

    // Header row
    html += '<div class="att-row">';
    html += '<div></div>';
    for (let w = 1; w <= weeks; w++) {
      const date = formatDateTime(w, state.config) || `S${w}`;
      html += `<div class="att-week-header">S${w}<br><span style="font-size:0.6rem;font-weight:400;">${date}</span></div>`;
    }
    html += '</div>';

    attPlayers.forEach(p => {
      const avatarSrc = playerPhotoSrc(p.name, p.photo || '', 28);
      html += '<div class="att-row">';
      html += `<div class="att-player-name" style="display:flex; align-items:center; gap:6px;">
        <img src="${avatarSrc}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; flex-shrink:0;">
        <span class="att-contact-link" data-player="${esc(p.name)}"
          style="cursor:pointer; text-decoration:underline; text-underline-offset:2px;">${esc(p.name)}</span>
      </div>`;
      for (let w = 1; w <= weeks; w++) {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
        const status = rec ? rec.status : 'tbd';
        html += `<div class="att-cell editable ${status}" data-player="${esc(p.name)}" data-week="${w}">${statusLabel(status)}</div>`;
      }
      html += '</div>';
    });

    // Totals row — count of players marked present per session
    html += '<div class="att-row" style="border-top:1px solid rgba(255,255,255,0.1); margin-top:4px; padding-top:4px;">';
    html += '<div class="att-player-name" style="font-size:0.75rem; color:var(--muted); font-weight:600;">Players In</div>';
    for (let w = 1; w <= weeks; w++) {
      const count = attPlayers.filter(p => {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
        return rec && rec.status === 'present';
      }).length;
      html += `<div class="att-week-header att-total" data-week="${w}" style="font-weight:700; color:${count > 0 ? 'var(--green)' : 'var(--muted)'}; font-size:0.85rem;">${count}</div>`;
    }
    html += '</div>';

    // In mixed-doubles mode, show M / F / Either breakdown per session
    if ((state.config.gameMode || 'doubles') === 'mixed-doubles') {
      const groupRows = [
        { key: 'M', label: 'Male (M)', color: 'var(--muted)' },
        { key: 'F', label: 'Female (F)', color: 'var(--muted)' },
        { key: 'Either', label: 'Either (E)', color: 'var(--muted)' },
      ];
      groupRows.forEach(({ key, label, color }) => {
        const groupPlayers = attPlayers.filter(p => (p.group || 'M') === key);
        if (!groupPlayers.length) return;
        html += `<div class="att-row" style="border-top:1px dashed rgba(255,255,255,0.06); padding-top:2px;">`;
        html += `<div class="att-player-name" style="font-size:0.7rem; color:${color}; font-weight:500;">${esc(label)}</div>`;
        for (let w = 1; w <= weeks; w++) {
          const count = groupPlayers.filter(p => {
            const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
            return rec && rec.status === 'present';
          }).length;
          html += `<div class="att-week-header" style="font-size:0.78rem; color:${count > 0 ? 'var(--white)' : 'var(--muted)'}; font-weight:${count > 0 ? '600' : '400'};">${count}</div>`;
        }
        html += '</div>';
      });
    }

    html += '</div>';
    document.getElementById('attendance-grid').innerHTML = html;

    // Sync lock-player-attendance checkbox with current config
    const lockChk = document.getElementById('cfg-lock-player-attendance');
    if (lockChk) {
      lockChk.checked = !!state.config.lockPlayerAttendance;
      lockChk.onchange = async function () {
        const newConfig = { ...state.config, lockPlayerAttendance: this.checked };
        try {
          await API.saveConfig(newConfig);
          state.config = sanitizeConfig(newConfig);
        } catch (e) { toast('Failed to save', 'error'); this.checked = !this.checked; }
      };
    }

    document.querySelectorAll('.att-cell.editable').forEach(cell => {
      cell.addEventListener('click', () => {
        // Block clicks while attendance is being refreshed from server
        if (state._attRefreshing) return;
        const isSpectatorRole = (() => { const p = state.players.find(pl => pl.name === cell.dataset.player); return p && p.role === 'spectator'; })();
        const states = isSpectatorRole ? ['absent', 'tbd'] : ['tbd', 'present', 'absent'];
        const prev = cell.className.split(' ').find(c => states.includes(c)) || states[0];
        const cur = states.indexOf(prev);
        const next = states[(cur + 1) % states.length];
        const player = cell.dataset.player;
        const week = cell.dataset.week;

        cell.className = `att-cell editable ${next}`;
        cell.textContent = statusLabel(next);

        // Update local state
        const rec = state.attendance.find(a => a.player === player && String(a.week) === String(week));
        if (rec) { rec.status = next; } else { state.attendance.push({ player, week, status: next }); }

        // Live-update the totals cell for this week
        const players = state.players.filter(p => p.active !== 'pend');
        const count = players.filter(p => {
          const r = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return r && r.status === 'present';
        }).length;
        const totalCell = document.querySelector(`.att-total[data-week="${week}"]`);
        if (totalCell) {
          totalCell.textContent = count;
          totalCell.style.color = count > 0 ? 'var(--green)' : 'var(--muted)';
        }

        // Track pending change — will be written when Save is clicked
        if (!state._attPending) state._attPending = {};
        state._attPending[`${player}|${week}`] = { player, week, status: next };
        setAttDirty(true);
        // Refresh roster chips + generate button to reflect updated attendance
        renderPairingsPreview();
      });
    });

    // Wire up Save button
    const saveBtn = document.getElementById('btn-save-attendance');
    if (saveBtn) {
      saveBtn.disabled = !state._attDirty;
      saveBtn.onclick = saveAttendance;
    }

    // Wire up sort dropdown (once)
    const sortSel = document.getElementById('att-sort');
    if (sortSel && !sortSel._wired) {
      sortSel._wired = true;
      sortSel.addEventListener('change', renderAttendance);
    }

    document.querySelectorAll('#attendance-grid .att-contact-link').forEach(el => {
      el.addEventListener('click', () => {
        const p = state.players.find(pl => pl.name === el.dataset.player);
        if (p) showContactCard(p);
      });
    });

    document.querySelector('#attendance-grid .att-coord-link')?.addEventListener('click', () => {
      showContactCard({
        name:         state.config.coordinatorName || 'Coordinator',
        photo:        state.config.coordinatorPhoto || '',
        fullName:     '',
        email:        state.config.replyTo || '',
        phone:        state.config.coordinatorPhone || '',
        shareContact: true,
      });
    });
  }

  // ── Contact Card popup ─────────────────────────────────────
  let _contactCardWired = false;
  function showContactCard(player) {
    const modal = document.getElementById('contact-card-modal');
    if (!modal) return;

    if (!_contactCardWired) {
      _contactCardWired = true;
      document.getElementById('contact-card-close')?.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    }

    const src = playerPhotoSrc(player.name, player.photo || '', 80);
    document.getElementById('cc-avatar').src = src;
    document.getElementById('cc-handle').textContent = player.name;

    const fullNameEl = document.getElementById('cc-fullname');
    fullNameEl.textContent = player.fullName || '';
    fullNameEl.style.display = player.fullName ? 'block' : 'none';

    const infoEl = document.getElementById('cc-contact-info');
    let infoHtml = '';
    if (player.shareContact) {
      if (player.email) {
        infoHtml += `<div style="margin-bottom:8px;">
          <a href="mailto:${esc(player.email)}"
             style="color:#5ab4ff; font-size:0.9rem; text-decoration:none;">
            ✉️ ${esc(player.email)}</a></div>`;
      }
      if (player.phone) {
        infoHtml += `<div>
          <a href="sms:${esc(player.phone)}"
             style="color:var(--green); font-size:0.9rem; text-decoration:none;">
            📱 ${esc(player.phone)}</a></div>`;
      }
    }
    infoEl.innerHTML = infoHtml;

    const hasContact = player.shareContact && (player.email || player.phone || player.fullName);
    const wrapEl = document.getElementById('cc-add-contact-wrap');
    const noteEl = document.getElementById('cc-note');
    if (hasContact) {
      wrapEl.innerHTML = `<button id="cc-add-btn" class="btn btn-outline"
        style="font-size:0.85rem; width:100%; margin-top:8px;">📇 Add to Contacts</button>`;
      document.getElementById('cc-add-btn').addEventListener('click', () => {
        const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
        lines.push('FN:' + (player.fullName || player.name));
        lines.push('NICKNAME:' + player.name);
        if (player.email) lines.push('EMAIL:' + player.email);
        if (player.phone) lines.push('TEL;TYPE=CELL:' + player.phone);
        lines.push('END:VCARD');
        const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard' });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = player.name + '.vcf';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      });
      noteEl.textContent = 'On mobile, tapping "Add to Contacts" opens your contacts app. On desktop a .vcf file downloads.';
      noteEl.style.display = 'block';
    } else {
      wrapEl.innerHTML = '';
      noteEl.style.display = 'none';
    }

    modal.style.display = 'flex';
  }

  // ── Pairings ───────────────────────────────────────────────
  function renderPairingsPreview() {
    const week = state.currentPairWeek;
    const genBtn = document.getElementById('btn-generate');
    if (genBtn) {
      const scope = document.getElementById('round-scope')?.value || 'all';
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(
        state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
      )].sort((a,b) => a-b);

      let roundLabel;
      if (scope === 'all') {
        roundLabel = `Rounds 1-${totalRounds}`;
      } else if (scope === 'remaining') {
        const nextRound = lockedRounds.length ? Math.max(...lockedRounds) + 1 : 1;
        if (nextRound > totalRounds) {
          roundLabel = 'all rounds generated';
        } else if (nextRound === totalRounds) {
          roundLabel = `Round ${nextRound}`;
        } else {
          roundLabel = `Rounds ${nextRound}-${totalRounds}`;
        }
      } else {
        roundLabel = `Round ${scope}`;
      }
      genBtn.textContent = `🎲 Generate — Session ${week}, ${roundLabel}`;

      // Compute present player count and effective court count for display
      const gameMode = state.config.gameMode || 'doubles';
      const ppc = (gameMode === 'singles' || gameMode === 'fixed-pairs') ? 2 : 4;
      const presentPlayers = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        });
      const presentCount = presentPlayers.length;
      const skipCount = presentPlayers.filter(p => state._pairSkipPlayers.has(p.name)).length;
      const activeCount = presentCount - skipCount;
      const configCourts = state.config.courts || 3;
      const effectiveCourts = activeCount < configCourts * ppc
        ? Math.max(1, Math.floor(activeCount / ppc))
        : configCourts;
      if (presentCount > 0) {
        genBtn.textContent += ` · ${effectiveCourts} court${effectiveCourts !== 1 ? 's' : ''}, ${activeCount} player${activeCount !== 1 ? 's' : ''}`;
        if (skipCount > 0) genBtn.textContent += ` (${skipCount} skipped)`;
      }
    }

    // Update tournament advance button visibility
    const advBtn   = document.getElementById('btn-tourn-advance');
    const resetBtn = document.getElementById('btn-tourn-reset');
    const lockBtn  = document.getElementById('btn-tourn-lock');
    if (advBtn && resetBtn) {
      const inTournament = !!state.tournaments[week];
      advBtn.classList.toggle('hidden', !inTournament);
      resetBtn.classList.toggle('hidden', !inTournament);
      if (lockBtn) lockBtn.classList.toggle('hidden', !inTournament || !state.pendingPairings);
      // Hide the regular Generate button when a tournament is in progress
      // or when tournament rounds have already been locked for this week
      const hasLockedTourn = state.pairings.some(p => parseInt(p.week) === week && p.type === 'tourn-game');
      if (genBtn) genBtn.classList.toggle('hidden', !!inTournament || hasLockedTourn);
      // Disable Generate Bracket and format dropdown once a tournament round is saved
      const tournGenBtn = document.getElementById('btn-tourn-generate');
      const tournModeEl = document.getElementById('tourn-mode');
      const tournLocked = !!inTournament || hasLockedTourn;
      if (tournGenBtn) tournGenBtn.disabled = tournLocked;
      if (tournModeEl) tournModeEl.disabled = tournLocked;
      // Disable Advance Round while pending pairings exist (until Lock & Save is pressed)
      if (advBtn) advBtn.disabled = !!state.pendingPairings;
      if (inTournament) {
        renderTournamentStatus();
      } else {
        const statusEl = document.getElementById('tourn-status');
        if (statusEl) statusEl.innerHTML = '';
      }
    }
    document.getElementById('pair-week-label').textContent = `Session ${week}`;
    const pairWkSel = document.getElementById('pair-week-select');
    if (pairWkSel && pairWkSel.value != week) pairWkSel.value = week;

    const existing = state.pairings.filter(p => parseInt(p.week) === week);
    // For tournament mode, show all locked rounds plus the pending new round.
    // For regular mode, pending pairings replace existing (re-generate workflow).
    const inTournament = !!state.tournaments[week];
    const toShow = inTournament && state.pendingPairings
      ? [...existing, ...state.pendingPairings.filter(p => !existing.find(e => e.round === p.round && e.court === p.court))]
      : (state.pendingPairings || existing);

    // Always rebuild the round-scope dropdown and clear button — must happen even
    // when there are no pairings so that switching sessions / scope updates the text.
    const scopeSel = document.getElementById('round-scope');
    if (scopeSel) {
      const cur         = scopeSel.value;
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(existing.map(p => parseInt(p.round)))].sort((a,b) => a - b);
      scopeSel.innerHTML = '<option value="all">All rounds</option><option value="remaining">All remaining rounds</option>';
      for (let r = 1; r <= totalRounds; r++) {
        const opt = document.createElement('option');
        opt.value = String(r);
        const locked = lockedRounds.includes(r) ? ' \u2713' : '';
        opt.textContent = `Round ${r}${locked}`;
        scopeSel.appendChild(opt);
      }
      if ([...scopeSel.options].some(o => o.value === cur)) scopeSel.value = cur;
      updateClearBtn(scopeSel.value, week, totalRounds, lockedRounds);
      if (!scopeSel._genBtnListenerAdded) {
        scopeSel.addEventListener('change', () => renderPairingsPreview());
        scopeSel._genBtnListenerAdded = true;
      }
    }

    if (!toShow.length) {
      document.getElementById('pairings-preview').innerHTML =
        '<div class="card"><p class="text-muted" style="font-size:0.88rem;">No pairings generated yet for this session.</p></div>';
      const w = document.getElementById('pairings-unsaved-warning');
      if (w) w.style.display = 'none';
      return;
    }

    const rounds = [...new Set(toShow.map(p => p.round))].sort((a,b) => a-b);
    let html = '';
    rounds.forEach(r => {
      const roundGames = toShow.filter(p => p.round == r && p.type !== 'bye' && p.type !== 'tourn-bye');
      const roundByePlayers = [...new Set(
        toShow.filter(p => p.round == r && (p.type === 'bye' || p.type === 'tourn-bye'))
              .flatMap(p => [p.p1, p.p2].filter(Boolean))
      )];

      html += `<div style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; padding:4px 2px 3px; margin-top:4px;"><strong style="color:var(--white); font-size:0.8rem;">Round ${r}</strong></div>`;

      // Games first
      roundGames.forEach(game => {
        html += `<div style="background:var(--card-bg); border-radius:8px; padding:5px 10px; margin-bottom:4px;">
            <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center; gap:4px;">
              <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court, week)}</div>
              <div style="min-width:0; text-align:right;">
                <div style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
                ${game.p2 ? `<div style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
              </div>
              <div style="text-align:center; color:var(--muted); font-size:0.75rem; font-weight:600; flex-shrink:0; padding:0 4px;">VS</div>
              <div style="min-width:0;">
                <div style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
                ${game.p4 ? `<div style="font-size:0.85rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
              </div>
            </div>
          </div>`;
      });

      // Byes after — all on one compact line
      if (roundByePlayers.length) {
        html += `<div style="padding:4px 8px; font-size:0.8rem; color:var(--muted); display:flex; align-items:center; gap:6px;">
          <span>⏸ Bye:</span>
          <strong style="color:var(--white);">${roundByePlayers.map(p => esc(p)).join(', ')}</strong>
        </div>`;
      }
    });

    document.getElementById('pairings-preview').innerHTML = html;
    document.getElementById('btn-lock-pairings').disabled = !state.pendingPairings;
    const unsavedWarn = document.getElementById('pairings-unsaved-warning');
    if (unsavedWarn) unsavedWarn.style.display = state.pendingPairings ? 'flex' : 'none';

    // (round-scope dropdown rebuild and clear-button update now happen unconditionally above)

    renderGenerateRoster();
    renderArrangeGames();
    renderChallengeSuggestions();
  }

  // ── Challenge Suggestions (accepted challenges, all players present) ──
  function renderChallengeSuggestions() {
    const el = document.getElementById('challenge-suggestions');
    if (!el) return;

    const isLadder = (state.config.standingsMethod || 'standard') === 'ladder';
    const enabled  = state.config.challengesEnabled === true || state.config.challengesEnabled === 'true';
    if (!isLadder || !enabled) { el.innerHTML = ''; return; }

    const week = state.currentPairWeek;
    const presentSet = new Set(
      state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        })
        .map(p => p.name)
    );

    const singles = state.config.gameMode === 'singles';
    const accepted = (state.challenges || []).filter(c => {
      if (c.status !== 'accepted') return false;
      const involved = [c.challenger, c.partner, c.opponent1, c.opponent2].filter(Boolean);
      return involved.every(p => presentSet.has(p));
    });

    if (!accepted.length) { el.innerHTML = ''; return; }

    const courts = parseInt(state.config.courts || 3);
    const ppc    = singles ? 2 : 4;
    const courtOpts = Array.from({ length: courts }, (_, i) =>
      `<option value="${i}">Court ${i + 1}</option>`
    ).join('');

    const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = `<div style="margin:8px 0 4px; padding:8px 12px; background:rgba(232,184,75,0.07);
                     border:1px solid rgba(232,184,75,0.25); border-radius:8px;">
      <div style="font-size:0.75rem; font-weight:700; color:var(--gold); text-transform:uppercase;
                  letter-spacing:0.07em; margin-bottom:8px;">⚔️ Accepted Challenges (all players present)</div>`;

    accepted.forEach(c => {
      const t1 = c.partner ? `${esc(c.challenger)} & ${esc(c.partner)}` : esc(c.challenger);
      const t2 = c.opponent2 ? `${esc(c.opponent1)} & ${esc(c.opponent2)}` : esc(c.opponent1);
      const players = JSON.stringify([c.challenger, c.partner, c.opponent1, c.opponent2].filter(Boolean));
      html += `<div style="display:flex; align-items:center; gap:10px; padding:5px 0;
                    border-bottom:1px solid rgba(255,255,255,0.07); flex-wrap:wrap;">
        <span style="font-size:0.84rem; flex:1; min-width:180px;"><strong>${t1}</strong>
          <span style="color:var(--muted); font-size:0.75rem;"> vs </span>
          <strong>${t2}</strong></span>
        <div style="display:flex; align-items:center; gap:6px;">
          <select class="form-control ch-court-sel" data-players='${players}'
            style="width:110px; font-size:0.78rem; padding:3px 6px;">
            <option value="">— court —</option>${courtOpts}
          </select>
          <button class="btn btn-secondary ch-assign-btn" data-players='${players}'
            style="font-size:0.75rem; padding:3px 12px; white-space:nowrap;">Assign</button>
        </div>
      </div>`;
    });

    html += `</div>`;
    el.innerHTML = html;

    // Wire assign buttons
    el.querySelectorAll('.ch-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const courtEl  = btn.previousElementSibling;
        const courtIdx = courtEl?.value !== '' ? parseInt(courtEl.value) : null;
        if (courtIdx === null || isNaN(courtIdx)) { toast('Select a court first.', 'warn'); return; }
        const players  = JSON.parse(btn.dataset.players);
        // Ensure the arrange grid exists and is large enough
        if (!state._arrangeGrid || state._arrangeGrid.length <= courtIdx) {
          state._arrangeOpen = true;
          state._arrangeGrid = Array.from({ length: parseInt(state.config.courts || 3) }, () => Array(ppc).fill(null));
        }
        state._arrangeOpen = true;
        // Place players: for doubles p1,p2 → team1 (cols 0,1), p3,p4 → team2 (cols 2,3)
        players.forEach((name, i) => {
          if (i < ppc) state._arrangeGrid[courtIdx][i] = name;
        });
        renderArrangeGames();
        renderChallengeSuggestions();
        toast(`Challenge assigned to Court ${courtIdx + 1}.`);
      });
    });
  }

  // ── Generate Roster (round-based mode only) ────────────────
  // Shows present players with checkboxes; uncheck to skip a player
  // from the next generate without changing their attendance record.
  // Skips are cleared when pairings are locked.
  function renderGenerateRoster() {
    const el = document.getElementById('pair-generate-roster');
    if (!el) return;

    // Only relevant for round-based pairing
    if ((state.config.pairingMode || 'round-based') !== 'round-based') {
      el.innerHTML = '';
      return;
    }

    const week = state.currentPairWeek;
    const present = state.players
      .filter(p => p.active === true && p.role !== 'spectator')
      .filter(p => {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
        return rec && rec.status === 'present';
      });

    if (!present.length) { el.innerHTML = ''; return; }

    const skipCount = present.filter(p => state._pairSkipPlayers.has(p.name)).length;

    let html = `<div style="margin:10px 0 12px;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:7px; flex-wrap:wrap;">
        <span style="font-size:0.78rem; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em;">Roster for next generate</span>
        <span style="font-size:0.78rem; color:var(--muted);">${present.length - skipCount} playing`;
    if (skipCount > 0) html += ` · <span style="color:var(--danger); font-weight:600;">${skipCount} skipped</span>`;
    html += `</span>`;
    if (skipCount > 0) {
      html += `<button id="btn-roster-clear-skips" style="font-size:0.72rem; padding:1px 8px; border-radius:4px;
        background:rgba(224,85,85,0.12); color:var(--danger); border:1px solid rgba(224,85,85,0.3); cursor:pointer;">
        Clear skips</button>`;
    }
    html += `</div><div style="display:flex; flex-wrap:wrap; gap:5px;">`;

    present.forEach(p => {
      const skipped = state._pairSkipPlayers.has(p.name);
      html += `<label style="display:inline-flex; align-items:center; gap:5px; padding:3px 9px;
        background:${skipped ? 'rgba(224,85,85,0.08)' : 'rgba(94,194,106,0.07)'};
        border:1px solid ${skipped ? 'rgba(224,85,85,0.28)' : 'rgba(94,194,106,0.2)'};
        border-radius:5px; cursor:pointer; user-select:none; font-size:0.82rem;
        color:${skipped ? 'var(--muted)' : 'var(--white)'};
        text-decoration:${skipped ? 'line-through' : 'none'};">
        <input type="checkbox" ${skipped ? '' : 'checked'} data-roster-player="${esc(p.name)}"
          style="width:13px; height:13px; cursor:pointer; accent-color:var(--green);">
        ${esc(p.name)}
      </label>`;
    });

    html += `</div></div>`;
    el.innerHTML = html;

    el.querySelectorAll('input[data-roster-player]').forEach(cb => {
      cb.addEventListener('change', () => {
        const name = cb.dataset.rosterPlayer;
        if (cb.checked) state._pairSkipPlayers.delete(name);
        else            state._pairSkipPlayers.add(name);
        renderPairingsPreview(); // updates button text + re-renders roster
      });
    });

    document.getElementById('btn-roster-clear-skips')?.addEventListener('click', () => {
      state._pairSkipPlayers.clear();
      renderPairingsPreview();
    });
  }

  // ── Arrange Games Grid (Max tier only) ────────────────────────
  // Helper: build a draggable chip HTML string for the arrange grid.
  function makeArrChip(name, loc, row, col) {
    const ds = [
      `data-arr-name="${esc(name)}"`,
      `data-arr-loc="${loc}"`,
      row != null ? `data-arr-row="${row}"` : '',
      col != null ? `data-arr-col="${col}"` : '',
    ].filter(Boolean).join(' ');
    const bg    = loc === 'sitout' ? 'rgba(224,90,90,0.13)' : '#1a2f45';
    const bord  = loc === 'sitout' ? 'rgba(224,90,90,0.4)'  : 'rgba(255,255,255,0.13)';
    const color = loc === 'sitout' ? '#e05a5a' : '#f0f4f8';
    const deco  = loc === 'sitout' ? 'line-through' : 'none';
    return `<div class="arr-chip" ${ds} draggable="true"
      style="padding:4px 7px;font-size:0.78rem;background:${bg};border:1px solid ${bord};
             color:${color};text-decoration:${deco};border-radius:4px;cursor:grab;
             user-select:none;text-align:center;white-space:nowrap;overflow:hidden;
             text-overflow:ellipsis;width:100%;">${esc(name)}</div>`;
  }

  // Renders the pre-arrange court grid panel (drag-and-drop, Max tier only).
  function renderArrangeGames() {
    const wrap = document.getElementById('arrange-games-wrap');
    if (!wrap) return;
    if ((state.config.pairingMode || 'round-based') !== 'round-based') { wrap.innerHTML = ''; return; }

    const week = state.currentPairWeek;
    const gameMode    = state.config.gameMode || 'doubles';
    const singles     = gameMode === 'singles' || gameMode === 'fixed-pairs';
    const ppc         = singles ? 2 : 4;
    const configCourts = parseInt(state.config.courts || 3);

    const present = state.players
      .filter(p => p.active === true && p.role !== 'spectator')
      .filter(p => {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
        return rec && rec.status === 'present';
      })
      .map(p => p.name);

    if (!present.length) { wrap.innerHTML = ''; return; }

    // Reset grid when config or week changes
    if (!state._arrangeGrid ||
        state._arrangeGrid.length !== configCourts ||
        (state._arrangeGrid[0] || []).length !== ppc ||
        state._arrangeGridWeek !== week) {
      state._arrangeGrid    = Array.from({ length: configCourts }, () => Array(ppc).fill(null));
      state._arrangeSitOut  = new Set();
      state._arrangeGridWeek = week;
    }

    // Remove departed players
    state._arrangeGrid.forEach((row, r) => {
      row.forEach((name, c) => { if (name && !present.includes(name)) state._arrangeGrid[r][c] = null; });
    });
    state._arrangeSitOut.forEach(name => { if (!present.includes(name)) state._arrangeSitOut.delete(name); });

    // Effective courts = how many courts can actually be filled given available players.
    // sitOutNames is computed first since it drives the available-player count.
    const sitOutNames     = [...state._arrangeSitOut].filter(n => present.includes(n));
    const activePlayers   = present.length - sitOutNames.length;
    const effectiveCourts = Math.max(1, Math.min(configCourts, Math.floor(activePlayers / ppc)));
    const hiddenCourts    = configCourts - effectiveCourts;

    // Only count players in the visible rows toward inGrid; players in hidden rows
    // fall back to the pool automatically (grid slots are preserved for when
    // effective courts rises again, e.g. after removing a sit-out).
    const visibleGrid = state._arrangeGrid.slice(0, effectiveCourts);
    const inGrid      = new Set(visibleGrid.flat().filter(Boolean));
    const poolNames   = present.filter(n => !inGrid.has(n) && !state._arrangeSitOut.has(n));
    const hasData     = inGrid.size > 0 || sitOutNames.length > 0;
    const isOpen      = !!state._arrangeOpen;

    const teamLabels = singles ? ['P1','P2'] : ['T1P1','T1P2','T2P1','T2P2'];

    // ── Determine first round being generated (matches round-scope dropdown) ──
    const scope = document.getElementById('round-scope')?.value || 'all';
    const lockedRounds = [...new Set(
      state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
    )].sort((a,b) => a-b);
    const firstRound = scope === 'all' ? 1
      : scope === 'remaining' ? (lockedRounds.length ? Math.max(...lockedRounds) + 1 : 1)
      : parseInt(scope);

    // ── Toggle button + summary ──
    let html = `<div style="margin:8px 0 4px;display:flex;align-items:center;gap:8px;">
      <button id="btn-toggle-arrange" class="btn btn-secondary" style="font-size:0.77rem;padding:2px 12px;">
        ${isOpen ? '▲ Hide court arrangement' : `▼ Pre-arrange Round ${firstRound}`}
      </button>`;
    if (!isOpen && hasData)
      html += `<span style="font-size:0.77rem;color:#f5c542;">⚡ ${inGrid.size} pre-set · ${sitOutNames.length} sit-out</span>`;
    html += `</div>`;

    if (isOpen) {
      html += `<div id="arrange-games-body" style="margin-bottom:10px;">`;
      html += `<p style="font-size:0.78rem;color:#7a9bb5;margin-bottom:8px;">
        Drag players into courts to fix <strong style="color:#f0f4f8;">Round ${firstRound}</strong> assignments.
        Partial courts (e.g. 3 of ${ppc}) are auto-completed by the optimizer.
        Players dropped in <strong style="color:#e05a5a;">Sit Out</strong> are excluded from all rounds.
      </p>`;

      html += `<div style="display:grid;grid-template-columns:150px 1fr 130px;gap:12px;align-items:start;">`;

      // ── Pool ──
      html += `<div>
        <div style="font-size:0.72rem;font-weight:600;color:#7a9bb5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Pool</div>
        <div id="arr-pool" style="min-height:50px;display:flex;flex-direction:column;gap:4px;padding:6px;background:#0d1b2a;border:1px dashed rgba(255,255,255,0.15);border-radius:6px;">`;
      if (!poolNames.length)
        html += `<span style="font-size:0.73rem;color:#7a9bb5;text-align:center;padding:4px;">All placed</span>`;
      else
        poolNames.forEach(n => { html += makeArrChip(n, 'pool'); });
      html += `</div></div>`;

      // ── Grid ──
      html += `<div>
        <div style="font-size:0.72rem;font-weight:600;color:#7a9bb5;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Courts — Round ${firstRound}</div>`;
      if (hiddenCourts > 0)
        html += `<div style="font-size:0.73rem;color:#f0a030;margin-bottom:5px;">
          ⚠ Not enough players for ${hiddenCourts} court${hiddenCourts!==1?'s':''} — showing ${effectiveCourts} of ${configCourts}
        </div>`;
      html += `<div id="arr-grid" style="display:flex;flex-direction:column;gap:5px;">`;
      visibleGrid.forEach((row, ri) => {
        html += `<div style="display:flex;align-items:center;gap:5px;">
          <span style="font-size:0.72rem;color:#7a9bb5;min-width:48px;text-align:right;padding-right:4px;flex-shrink:0;">Court ${ri+1}</span>
          <div style="display:grid;grid-template-columns:repeat(${ppc},1fr);gap:4px;flex:1;">`;
        row.forEach((name, ci) => {
          if (name) {
            html += `<div class="arr-cell" data-arr-row="${ri}" data-arr-col="${ci}" style="border-radius:4px;">${makeArrChip(name,'grid',ri,ci)}</div>`;
          } else {
            html += `<div class="arr-cell" data-arr-row="${ri}" data-arr-col="${ci}"
              style="min-height:30px;border:1.5px dashed rgba(255,255,255,0.13);border-radius:4px;
                     display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1px;">
              <span style="font-size:0.6rem;color:rgba(255,255,255,0.25);">${teamLabels[ci]||''}</span>
              <span style="font-size:0.65rem;color:rgba(255,255,255,0.2);">drop</span>
            </div>`;
          }
        });
        html += `</div></div>`;
      });
      html += `</div></div>`;

      // ── Sit Out ──
      html += `<div>
        <div style="font-size:0.72rem;font-weight:600;color:#e05a5a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px;">Sit Out</div>
        <div id="arr-sitout" style="min-height:50px;display:flex;flex-direction:column;gap:4px;padding:6px;
             background:rgba(224,90,90,0.05);border:1.5px dashed rgba(224,90,90,0.35);border-radius:6px;">`;
      if (!sitOutNames.length)
        html += `<span style="font-size:0.72rem;color:#7a9bb5;text-align:center;padding:4px 2px;">Drop to<br>exclude</span>`;
      else
        sitOutNames.forEach(n => { html += makeArrChip(n, 'sitout'); });
      html += `</div>
        <button id="btn-arr-clear" style="font-size:0.72rem;padding:2px 8px;margin-top:5px;width:100%;
          background:transparent;border:1px solid rgba(255,255,255,0.15);border-radius:4px;
          color:#7a9bb5;cursor:pointer;">Clear grid</button>
      </div>`;

      html += `</div></div>`; // close 3-col + body
    }

    wrap.innerHTML = html;

    // Toggle open/close
    wrap.querySelector('#btn-toggle-arrange').addEventListener('click', () => {
      state._arrangeOpen = !state._arrangeOpen;
      renderArrangeGames();
    });

    if (!isOpen) return;

    // Clear all
    wrap.querySelector('#btn-arr-clear')?.addEventListener('click', () => {
      state._arrangeGrid   = Array.from({ length: configCourts }, () => Array(ppc).fill(null));
      state._arrangeSitOut = new Set();
      renderArrangeGames();
    });

    // ── Drag-and-drop wiring ──
    let _arrDrag = null;

    wrap.querySelectorAll('.arr-chip').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        _arrDrag = {
          name: chip.dataset.arrName,
          loc:  chip.dataset.arrLoc,
          row:  chip.dataset.arrRow != null ? parseInt(chip.dataset.arrRow) : null,
          col:  chip.dataset.arrCol != null ? parseInt(chip.dataset.arrCol) : null,
        };
        setTimeout(() => chip.style.opacity = '0.3', 0);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', chip.dataset.arrName);
      });
      chip.addEventListener('dragend', () => chip.style.opacity = '');
    });

    function arrDropZone(el, handler) {
      el.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.style.outline = '2px solid #5ec26a'; });
      el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.style.outline = ''; });
      el.addEventListener('drop', e => { e.preventDefault(); el.style.outline = ''; if (_arrDrag) { handler(_arrDrag); _arrDrag = null; } });
    }

    // Grid cell drops
    wrap.querySelectorAll('.arr-cell').forEach(cell => {
      const destRow = parseInt(cell.dataset.arrRow);
      const destCol = parseInt(cell.dataset.arrCol);
      arrDropZone(cell, src => {
        const destName = state._arrangeGrid[destRow][destCol];
        state._arrangeGrid[destRow][destCol] = src.name;
        if (src.loc === 'grid') {
          state._arrangeGrid[src.row][src.col] = destName; // swap
        } else if (src.loc === 'sitout') {
          state._arrangeSitOut.delete(src.name);
        }
        // src from pool: destName (if any) returns to pool automatically (not in grid)
        renderArrangeGames();
      });
    });

    // Pool drop
    const poolEl = wrap.querySelector('#arr-pool');
    if (poolEl) arrDropZone(poolEl, src => {
      if (src.loc === 'grid')   state._arrangeGrid[src.row][src.col] = null;
      if (src.loc === 'sitout') state._arrangeSitOut.delete(src.name);
      renderArrangeGames();
    });

    // Sit-out drop
    const sitoutEl = wrap.querySelector('#arr-sitout');
    if (sitoutEl) arrDropZone(sitoutEl, src => {
      if (src.loc === 'grid') state._arrangeGrid[src.row][src.col] = null;
      state._arrangeSitOut.add(src.name);
      renderArrangeGames();
    });
  }

  function updateClearBtn(scope, week, totalRounds, lockedRounds) {
    const clearBtn = document.getElementById('btn-clear-pairings');
    if (!clearBtn) return;
    let roundLabel;
    if (scope === 'all') {
      roundLabel = 'Rounds 1-' + totalRounds;
    } else if (scope === 'remaining') {
      const scoredRounds = new Set(
        state.scores
          .filter(s => parseInt(s.week) === week &&
            s.score1 !== '' && s.score1 !== null &&
            s.score2 !== '' && s.score2 !== null)
          .map(s => parseInt(s.round))
      );
      const unscored = (lockedRounds || []).filter(r => !scoredRounds.has(r));
      roundLabel = unscored.length ? 'Rounds ' + unscored.join(', ') : 'no unscored rounds';
    } else {
      roundLabel = 'Round ' + scope;
    }
    clearBtn.textContent = '\uD83D\uDDD1 Clear \u2014 Session ' + week + ', ' + roundLabel;
  }

  // ── Print / PDF Scoresheet ─────────────────────────────────
  function printScoresheet() {
    const week    = state.currentScoreWeek;
    const c       = state.config;
    const lName   = Auth.getSession()?.leagueName || c.leagueName || 'League';
    const dateStr = formatDateTime(week, c);
    const sessTitle = c[`title_${week}`] ? `: ${c[`title_${week}`]}` : '';
    const title   = dateStr ? `${lName} — Session ${week}${sessTitle} — ${dateStr}` : `${lName} — Session ${week}${sessTitle}`;
    const loc     = c.location    ? `📍 ${c.location}`    : '';
    const tim     = c.sessionTime ? `🕐 ${c.sessionTime}` : '';

    const allWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const rounds = [...new Set(allWeekPairings.map(p => p.round))].sort((a,b) => a-b);

    let body = '';
    rounds.forEach(r => {
      const games = allWeekPairings.filter(p => p.round == r && p.type !== 'bye' && p.type !== 'tourn-bye');
      const byeNames = [...new Set(
        allWeekPairings.filter(p => p.round == r && (p.type === 'bye' || p.type === 'tourn-bye'))
                       .flatMap(p => [p.p1, p.p2].filter(Boolean))
      )];

      body += `<div class="round"><div class="round-label">Round ${r}</div>`;

      games.forEach(game => {
        const score = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) && String(s.court) === String(game.court)
        );
        const s1 = score && score.score1 !== '' && score.score1 !== null ? score.score1 : '';
        const s2 = score && score.score2 !== '' && score.score2 !== null ? score.score2 : '';
        const cn = courtName(game.court, week);

        body += `<div class="game">
          <div class="court">${cn}</div>
          <div class="teams">
            <div class="team">
              <span class="name">${esc(game.p1)}</span>
              ${game.p2 ? `<span class="name">${esc(game.p2)}</span>` : ''}
            </div>
            <div class="score-box">
              <span class="score">${s1 !== '' ? s1 : '<span class="blank">___</span>'}</span>
              <span class="dash">–</span>
              <span class="score">${s2 !== '' ? s2 : '<span class="blank">___</span>'}</span>
            </div>
            <div class="team right">
              <span class="name">${esc(game.p3)}</span>
              ${game.p4 ? `<span class="name">${esc(game.p4)}</span>` : ''}
            </div>
          </div>
        </div>`;
      });

      if (byeNames.length) {
        body += `<div class="bye">⏸ Bye: ${byeNames.map(p => esc(p)).join(', ')}</div>`;
      }

      body += `</div>`;
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #111; padding: 20px 28px; }
    h1 { font-size: 14pt; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 9pt; color: #555; margin-bottom: 18px; display: flex; gap: 16px; }
    .round { margin-bottom: 18px; page-break-inside: avoid; }
    .round-label { font-size: 9pt; font-weight: 700; text-transform: uppercase;
                   letter-spacing: 0.08em; color: #555; border-bottom: 1px solid #ccc;
                   padding-bottom: 3px; margin-bottom: 6px; }
    .game { display: grid; grid-template-columns: 60px 1fr; gap: 6px;
            align-items: center; padding: 5px 0; border-bottom: 1px solid #eee; }
    .court { font-size: 8pt; font-weight: 700; text-transform: uppercase;
             letter-spacing: 0.06em; color: #777; }
    .teams { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
    .team { display: flex; flex-direction: column; gap: 1px; }
    .team.right { text-align: right; }
    .name { font-size: 10.5pt; }
    .score-box { display: flex; align-items: center; gap: 6px;
                 justify-content: center; white-space: nowrap; }
    .score { font-size: 13pt; font-weight: 700; min-width: 22px; text-align: center; }
    .blank { font-size: 11pt; color: #aaa; letter-spacing: 2px; }
    .dash { font-size: 11pt; color: #999; }
    .bye { font-size: 9pt; color: #777; padding: 4px 0 2px; font-style: italic; }
    @media print {
      body { padding: 12px 20px; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${[loc, tim].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div>
  ${body}
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=720,height=900');
    if (win) {
      win.document.write(html);
      win.document.close();
    } else {
      toast('Pop-up blocked — please allow pop-ups for this page and try again.', 'warn');
    }
  }

  // ── Scoresheet ─────────────────────────────────────────────
  function renderScoresheet() {
    const week = state.currentScoreWeek;
    document.getElementById('score-week-label').textContent = `Session ${week}`;
    const scoreWkSel = document.getElementById('score-week-select');
    if (scoreWkSel && scoreWkSel.value != week) scoreWkSel.value = week;

    // Block score entry while background data fetch is still in flight
    if (state._initialDataLoading) {
      document.getElementById('scoresheet').innerHTML =
        '<div style="padding:24px; text-align:center; color:var(--muted); font-size:0.88rem;">⏳ Loading scores…</div>';
      state._scoresheetTouched = false;
      return;
    }

    renderFinishScenarios();

    // Update card title with session number, optional title, and date
    const scoresheetTitle = document.querySelector('#page-scores .card-title');
    if (scoresheetTitle) {
      const date = formatDateTime(week, state.config);
      const lName = Auth.getSession()?.leagueName || state.config.leagueName || '';
      const sessT = state.config[`title_${week}`] ? `: ${state.config[`title_${week}`]}` : '';
      const sessLabel = `Session ${week}${sessT}`;
      scoresheetTitle.textContent = lName
        ? (date ? `${lName}  ·  ${sessLabel}  ·  ${date}` : `${lName}  ·  ${sessLabel}`)
        : (date ? `${sessLabel}  ·  ${date}` : sessLabel);
    }

    const allWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const weekPairings    = allWeekPairings.filter(p => p.type === 'game' || p.type === 'tourn-game');

    if (!allWeekPairings.length) {
      document.getElementById('scoresheet').innerHTML =
        '<p class="text-muted" style="font-size:0.88rem;">No pairings for this session yet. Generate pairings first.</p>';
      return;
    }

    const rounds = [...new Set(allWeekPairings.map(p => p.round))].sort((a,b) => a-b);
    let html = '';
    const isQueueMode = state.config.pairingMode === 'queue-based';

    // Build rank map for rank-differential and upset indicators
    const ssRankMap = {};
    state.standings.forEach(s => { if (s.rank != null && isFinite(s.rank)) ssRankMap[s.name] = s.rank; });
    state.players.forEach(p => { if (ssRankMap[p.name] == null && p.initialRank) ssRankMap[p.name] = p.initialRank; });

    rounds.forEach(r => {
      const roundGames = weekPairings.filter(p => p.round == r);
      const roundByes  = allWeekPairings.filter(p => p.round == r && p.type === 'bye');
      const total      = roundGames.length;
      const scored     = roundGames.filter(g => {
        const sc = state.scores.find(s => parseInt(s.week) === week && parseInt(s.round) === r && String(s.court) === String(g.court));
        return sc && sc.score1 !== '' && sc.score1 !== null && sc.score2 !== '' && sc.score2 !== null;
      }).length;
      const remaining  = total - scored;
      const allDone    = remaining === 0 && total > 0;

      if (isQueueMode) {
        // Queue mode: flat list with simple batch label, no collapsible details
        const doneStyle = allDone ? 'color:var(--green);' : '';
        html += `<div style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; padding:4px 2px 3px; margin-top:4px; display:flex; justify-content:space-between;">
          <span>Batch ${r}</span>
          <span style="${doneStyle}">${allDone ? `${scored}/${total} ✓` : scored > 0 ? `${scored}/${total}` : `${total} game${total !== 1 ? 's' : ''}`}</span>
        </div>
        <div>`;
      } else {
        // Round-based mode: collapsible details with progress badge
        const badgeColor = allDone ? 'var(--green)' : scored > 0 ? 'var(--gold)' : 'var(--muted)';
        const badgeText  = allDone ? `${scored}/${total} ✓`
                         : scored > 0 ? `${scored}/${total} · ${remaining} left`
                         : `${total} game${total !== 1 ? 's' : ''}`;

        html += `<details open style="margin-bottom:3px;">
          <summary style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;
                          padding:3px 8px; border-radius:6px; background:var(--card-bg);
                          list-style:none; user-select:none;"
                   class="round-summary">
            <span style="display:flex; align-items:center; gap:6px;">
              <span class="collapse-arrow" style="font-size:0.72rem; color:var(--green); opacity:0.6;">${!allDone ? '▲' : '▼'}</span>
              <span style="font-size:0.76rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Round ${r}</span>
            </span>
            <span class="round-badge" style="font-size:0.73rem; color:${badgeColor}; font-weight:600;">${badgeText}</span>
          </summary>
          <div style="padding-top:3px;">`;
      }

      roundGames.forEach(game => {
        const existingScore = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) && String(s.court) === String(game.court)
        );
        const s1 = existingScore ? existingScore.score1 : '';
        const s2 = existingScore ? existingScore.score2 : '';
        const entered  = s1 !== '' && s2 !== '';
        const t1win    = entered && parseInt(s1) > parseInt(s2);
        const t2win    = entered && parseInt(s2) > parseInt(s1);
        const winStyle  = 'color:var(--green); font-weight:700;';
        const loseStyle = 'color:var(--muted);';
        const readOnly  = !session.isAdmin ? 'readonly style="opacity:0.5;pointer-events:none;"' : '';

        // Rank differential: Team 1 avg rank minus Team 2 avg rank
        const t1Names  = [game.p1, game.p2].filter(Boolean);
        const t2Names  = [game.p3, game.p4].filter(Boolean);
        const t1Ranks  = t1Names.map(n => ssRankMap[n]).filter(r => r != null);
        const t2Ranks  = t2Names.map(n => ssRankMap[n]).filter(r => r != null);
        const t1Avg    = t1Ranks.length ? t1Ranks.reduce((a, b) => a + b, 0) / t1Ranks.length : null;
        const t2Avg    = t2Ranks.length ? t2Ranks.reduce((a, b) => a + b, 0) / t2Ranks.length : null;
        const rankDiff = (t1Avg !== null && t2Avg !== null) ? t1Avg - t2Avg : null;
        const isUpset  = entered && rankDiff !== null && rankDiff !== 0
          ? (rankDiff < 0 ? t2win : t1win)   // rankDiff<0 → T1 ranked higher; if T2 won → upset
          : false;
        const diffStr  = rankDiff !== null ? (rankDiff > 0 ? '+' : '') + rankDiff.toFixed(1) : '—';
        const diffColor = rankDiff === null ? 'var(--muted)' : rankDiff < 0 ? 'var(--green)' : rankDiff > 0 ? 'var(--danger)' : 'var(--muted)';

        html += `<div style="background:var(--card-bg); border-radius:7px; padding:6px 10px; margin-bottom:4px; position:relative;"
            data-week="${week}" data-round="${game.round}" data-court="${game.court}">
          <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center; gap:6px;">
            <div style="font-size:0.7rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court, week)}</div>
            <div data-team="1" style="min-width:0; text-align:right;">
              <div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
              ${game.p2 ? `<div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px; flex-shrink:0; padding:0 4px;">
              <input type="number" class="score-input" data-score="1"
                     value="${s1}" min="0" max="30" placeholder="0" ${readOnly}
                     inputmode="numeric"
                     style="width:44px; text-align:center; padding:4px; -moz-appearance:textfield;">
              <div style="color:var(--muted); font-size:0.8rem;">—</div>
              <input type="number" class="score-input" data-score="2"
                     value="${s2}" min="0" max="30" placeholder="0" ${readOnly}
                     inputmode="numeric"
                     style="width:44px; text-align:center; padding:4px; -moz-appearance:textfield;">
            </div>
            <div data-team="2" style="min-width:0;">
              <div style="${entered ? (t2win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
              ${game.p4 ? `<div style="${entered ? (t2win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
            </div>
          </div>
          ${(t1Avg !== null || t2Avg !== null) ? `<div style="display:grid; grid-template-columns:auto 1fr auto 1fr; gap:6px; font-size:0.68rem; color:var(--muted); margin-top:4px; padding-top:3px; border-top:1px solid rgba(255,255,255,0.06);">
            <div></div>
            <div style="text-align:right;" title="Team 1 average rank">${t1Avg !== null ? '#' + t1Avg.toFixed(1) : ''}</div>
            <div style="text-align:center;" title="Rank difference (Team 1 avg rank − Team 2 avg rank). Negative = Team 1 ranked higher. U = upset." style="color:${diffColor}; cursor:help;"><span style="color:${diffColor};">Rnk&thinsp;Δ&thinsp;${diffStr}${isUpset ? '&thinsp;<strong style="color:var(--gold);">U</strong>' : ''}</span></div>
            <div title="Team 2 average rank">${t2Avg !== null ? '#' + t2Avg.toFixed(1) : ''}</div>
          </div>` : ''}
          ${canDeletePairings && !entered ? `<button class="btn-delete-game" tabindex="-1" data-week="${week}" data-round="${game.round}" data-court="${game.court}"
              style="position:absolute; top:5px; right:8px; font-size:0.7rem; color:var(--danger);
                     background:none; border:1px solid var(--danger); border-radius:4px;
                     padding:1px 7px; cursor:pointer; opacity:0.6;"
              title="Delete this game">Delete game</button>` : ''}
        </div>`;
      });

      // Byes after games — all players on one compact line
      const byePlayerNames = [...new Set(
        roundByes.flatMap(b => [b.p1, b.p2].filter(Boolean))
      )];
      if (byePlayerNames.length) {
        html += `<div style="padding:4px 8px; font-size:0.8rem; color:var(--muted); display:flex; align-items:center; gap:6px;">
          <span>⏸ Bye:</span>
          <strong style="color:var(--white);">${byePlayerNames.map(p => esc(p)).join(', ')}</strong>
        </div>`;
      }

      html += isQueueMode ? `</div>` : `</div></details>`;
    });

    // Snapshot which rounds are currently collapsed before overwriting the DOM (round-based only)
    const collapsedRounds = new Set();
    if (!isQueueMode) {
      document.querySelectorAll('#scoresheet details').forEach(d => {
        if (!d.open) {
          const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
          if (m) collapsedRounds.add(parseInt(m[1]));
        }
      });
    }

    document.getElementById('scoresheet').innerHTML = html;

    // Assign sequential tabindex to all score inputs so Tab skips round headings.
    // Also remove summary elements from tab order — they are natively focusable
    // (tabIndex=0) and would intercept Tab between rounds without this.
    document.querySelectorAll('#scoresheet summary').forEach(s => { s.tabIndex = -1; });
    document.querySelectorAll('#scoresheet .score-input').forEach((input, i) => {
      input.tabIndex = i + 1;
      input.addEventListener('input', () => { state._scoresheetTouched = true; }, { once: true });
    });

    // Restore collapsed state (round-based mode only)
    if (!isQueueMode && collapsedRounds.size) {
      document.querySelectorAll('#scoresheet details').forEach(d => {
        const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
        if (m && collapsedRounds.has(parseInt(m[1]))) d.open = false;
      });
    }

    // ── Delete game buttons ─────────────────────────────────
    document.querySelectorAll('#scoresheet .btn-delete-game').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wk    = parseInt(btn.dataset.week);
        const round = parseInt(btn.dataset.round);
        const court = String(btn.dataset.court);
        const game  = state.pairings.find(
          p => parseInt(p.week) === wk && parseInt(p.round) === round && String(p.court) === court
        );
        if (!game) return;
        const players = [game.p1, game.p2, game.p3, game.p4].filter(Boolean).join(' / ');
        if (!confirm(`Delete this game?\n${courtName(court)}  ·  Round ${round}\n${players}\n\nThis cannot be undone.`)) return;

        btn.disabled = true;
        btn.textContent = 'Deleting…';
        try {
          state.pairings = state.pairings.filter(
            p => !(parseInt(p.week) === wk && parseInt(p.round) === round && String(p.court) === court)
          );
          const weekPairings = state.pairings.filter(p => parseInt(p.week) === wk);
          await API.savePairings(wk, weekPairings);
          renderScoresheet();
          // In queue mode: put the deleted game's players back in the queue
          if (state.config.pairingMode === 'queue-based') {
            const deletedPlayers = [game.p1, game.p2, game.p3, game.p4].filter(Boolean);
            const inQueueSet = new Set(state.queue.map(e => e.player));
            deletedPlayers.forEach(name => {
              if (!inQueueSet.has(name)) {
                state.queue.push({ player: name, waitWeight: 0, stayGames: 0 });
              }
            });
            try {
              await API.saveQueue(wk, state.queue.map(e => ({ ...e, week: wk })));
            } catch (_) { /* non-fatal */ }
            renderQueuePanel();
          }
        } catch (e) {
          toast('Failed to delete game — please try again', 'error');
          btn.disabled = false;
          btn.textContent = 'Delete game';
        }
      });
    });

    // ── Auto-save scores on input ───────────────────────────
    document.querySelectorAll('#scoresheet [data-round]').forEach(card => {
      const inputs = card.querySelectorAll('.score-input');
      if (!inputs.length) return;

      inputs.forEach(input => {
        input.addEventListener('change', async () => {
          const s1val = card.querySelector('[data-score="1"]').value;
          const s2val = card.querySelector('[data-score="2"]').value;
          if (s1val === '' || s2val === '') return; // wait until both filled

          const round   = card.dataset.round;
          const court   = card.dataset.court;
          const wk      = parseInt(card.dataset.week);
          const weekPairings = state.pairings.filter(p => parseInt(p.week) === wk && (p.type === 'game' || p.type === 'tourn-game'));
          const pairing = weekPairings.find(p => String(p.round) === String(round) && String(p.court) === String(court));
          if (!pairing) return;

          const score1 = parseInt(s1val) || 0;
          const score2 = parseInt(s2val) || 0;

          // Warn on suspicious scores — non-blocking toast since this is auto-save
          if (score1 < 0 || score2 < 0) {
            toast(`Negative score on Round ${round} ${courtName(court)} — correct if this is a mistake.`, 'warn');
          } else if (score1 > 20 || score2 > 20) {
            toast(`Score over 20 on Round ${round} ${courtName(court)} — correct if this is a mistake.`, 'warn');
          } else if (score1 === score2) {
            toast(`Tied score ${score1}–${score2} on Round ${round} ${courtName(court)} — correct if this is a mistake.`, 'warn');
          }

          // Check for overwrite by assistant
          const existing = state.scores.find(e =>
            parseInt(e.week) === wk && parseInt(e.round) === parseInt(round) && String(e.court) === String(court)
          );
          if (isAssistant && existing &&
              (String(existing.score1) !== String(score1) || String(existing.score2) !== String(score2))) {
            // Revert the input
            card.querySelector('[data-score="1"]').value = existing.score1;
            card.querySelector('[data-score="2"]').value = existing.score2;
            toast('Admin assistants cannot overwrite existing scores.', 'warn');
            return;
          }

          const newScore = { week: wk, round: parseInt(round), court,
            p1: pairing.p1, p2: pairing.p2, score1,
            p3: pairing.p3, p4: pairing.p4, score2 };

          // Merge into state.scores
          state.scores = state.scores.filter(s =>
            !(parseInt(s.week) === wk && parseInt(s.round) === parseInt(round) && String(s.court) === String(court))
          );
          state.scores.push(newScore);
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance, state.config.pairingMode);

          // Save to server silently — show small indicator on the card
          const indicator = document.createElement('div');
          indicator.style.cssText = 'font-size:0.65rem; color:var(--muted); text-align:center; margin-top:2px;';
          indicator.textContent = '⏳ saving…';
          card.appendChild(indicator);

          try {
            // Queue saves per week — prevents concurrent writes causing duplicate rows
            // IMPORTANT: weekScores must be captured INSIDE the lock callback, not outside,
            // so it always reflects the latest state.scores at the moment of actual
            // transmission — not a stale snapshot that could be overwritten by auto-refresh.
            const prevLock = state.saveLocks[wk] || Promise.resolve();
            const thisLock = prevLock.then(async () => {
              const weekScores = state.scores.filter(s => parseInt(s.week) === wk);
              await API.saveScores(wk, weekScores);
            });
            state.saveLocks[wk] = thisLock.catch(() => {});

            await thisLock;
            indicator.textContent = '✓ saved';
            indicator.style.color = 'var(--green)';
            setTimeout(() => indicator.remove(), 1800);
            // Update finish scenarios as scores are entered
            renderFinishScenarios();
            // Queue mode: update player queue based on game outcome
            if (state.config.pairingMode === 'queue-based') updateQueueAfterScore(newScore, pairing);
            // Re-render just this card to apply win/loss styling, without touching
            // the rest of the scoresheet (preserves focus and other in-progress inputs)
            const s1now = parseInt(card.querySelector('[data-score="1"]').value) || 0;
            const s2now = parseInt(card.querySelector('[data-score="2"]').value) || 0;
            const t1win = s1now > s2now;
            const t2win = s2now > s1now;
            const winSty  = 'color:var(--green); font-weight:700; font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            const loseSty = 'color:var(--muted); font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            card.querySelectorAll('[data-team="1"] div').forEach(el => el.style.cssText = t1win ? winSty : loseSty);
            card.querySelectorAll('[data-team="2"] div').forEach(el => el.style.cssText = t2win ? winSty : loseSty);
          } catch (e) {
            // Persistent failure indicator — stays until retried or manually saved
            indicator.style.cssText = 'font-size:0.65rem; color:var(--danger); text-align:center; margin-top:2px; cursor:pointer; text-decoration:underline;';
            indicator.textContent = '⚠ save failed — tap to retry';
            indicator.title = e.message || 'Network error';
            indicator.addEventListener('click', async () => {
              indicator.style.cssText = 'font-size:0.65rem; color:var(--muted); text-align:center; margin-top:2px;';
              indicator.textContent = '⏳ retrying…';
              try {
                const weekScores = state.scores.filter(s => parseInt(s.week) === wk);
                await API.saveScores(wk, weekScores);
                indicator.textContent = '✓ saved';
                indicator.style.color = 'var(--green)';
                setTimeout(() => indicator.remove(), 1800);
                toast('Scores saved after retry.');
              } catch (e2) {
                indicator.style.cssText = 'font-size:0.65rem; color:var(--danger); text-align:center; margin-top:2px; cursor:pointer; text-decoration:underline;';
                indicator.textContent = '⚠ still failing — use Save Scores button';
                toast('Auto-save failed. Use the Save Scores button to save all scores.', 'error');
              }
            });
            // Also show a toast directing them to the manual save button
            toast('⚠ Score auto-save failed — use the Save Scores button below.', 'error');
          }
        });
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ── Queue-based pairing mode ────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  function updatePairingModeUI() {
    const isQueue = state.config.pairingMode === 'queue-based';
    document.getElementById('round-pairing-card')?.classList.toggle('hidden', isQueue);
    document.getElementById('queue-pairing-card')?.classList.toggle('hidden', !isQueue);
    document.getElementById('cfg-queue-wait-group')?.classList.toggle('hidden', !isQueue);
  }

  async function loadQueueForWeek(week) {
    state._queueLoading = true;
    renderQueuePanel(); // show loading indicator immediately
    try {
      const data = await API.getQueue(week);
      state.queue = (data.queue || [])
        .filter(e => parseInt(e.week) === week)
        .map(e => ({
          player: e.player,
          waitWeight: parseFloat(e.waitWeight) || 0,
          stayGames: parseInt(e.stayGames) || 0
        }));
    } catch (e) {
      state.queue = [];
    } finally {
      state._queueLoading = false;
    }
    renderQueuePanel();
  }

  // Returns array of court ID strings ["1","2",...] for all configured courts
  function getQueueCourtIds() {
    return Array.from({ length: parseInt(state.config.courts || 3) }, (_, i) => String(i + 1));
  }

  // Returns Set of court IDs where the most recent batch FOR THAT COURT has an unscored game.
  // Each court is checked independently — a court is occupied if its own latest batch is unscored,
  // regardless of whether other courts have already moved on to a newer batch.
  function getOccupiedCourts(week) {
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');
    if (!weekPairings.length) return new Set();

    // Find the highest batch number each court appears in
    const courtMaxBatch = {};
    weekPairings.forEach(p => {
      const batch = parseInt(p.round);
      const court = String(p.court);
      if (!(court in courtMaxBatch) || batch > courtMaxBatch[court]) {
        courtMaxBatch[court] = batch;
      }
    });

    // A court is occupied if its most recent batch game is unscored
    const occupied = new Set();
    Object.entries(courtMaxBatch).forEach(([court, maxBatch]) => {
      const scored = state.scores.find(s =>
        parseInt(s.week) === week && parseInt(s.round) === maxBatch &&
        String(s.court) === court &&
        s.score1 !== '' && s.score1 !== null && s.score2 !== '' && s.score2 !== null
      );
      if (!scored) occupied.add(court);
    });
    return occupied;
  }

  function getNextQueueBatchNum(week) {
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    return weekPairings.length ? Math.max(...weekPairings.map(p => parseInt(p.round))) + 1 : 1;
  }

  // Returns arrays of stayer players who were partners in their most recent batch
  function findStayerTeams(week) {
    const stayerNames = new Set(state.queue.filter(e => e.stayGames > 0).map(e => e.player));
    if (!stayerNames.size) return [];
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');
    if (!weekPairings.length) return [];
    const batches = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a, b) => b - a);
    const teams = [];
    for (const batch of batches) {
      const batchGames = weekPairings.filter(p => parseInt(p.round) === batch);
      for (const p of batchGames) {
        const t1stayers = [p.p1, p.p2].filter(n => n && stayerNames.has(n));
        const t2stayers = [p.p3, p.p4].filter(n => n && stayerNames.has(n));
        if (t1stayers.length >= 2) teams.push(t1stayers);
        if (t2stayers.length >= 2) teams.push(t2stayers);
      }
      if (teams.length) break; // stop at most recent batch with stayer pairs
    }
    return teams;
  }

  // Post-process optimizer output: rearrange so each stayer-teammate pair ends up on
  // opposite teams of the SAME court. Handles both "same court, same team" and the common
  // case where the optimizer places them on different courts entirely.
  function applyOppositeSplit(pairings, stayerTeams, gameMode) {
    if (!stayerTeams.length) return pairings;
    const singles = gameMode === 'singles' || gameMode === 'fixed-pairs';
    if (singles) return pairings;

    // Work on a mutable copy so multi-team corrections compose correctly
    const result = pairings.map(p => ({ ...p }));

    const findPos = (name) => {
      for (const game of result) {
        if (game.type !== 'game') continue;
        if (game.p1 === name) return { game, teamNum: 1, slot: 'p1' };
        if (game.p2 === name) return { game, teamNum: 1, slot: 'p2' };
        if (game.p3 === name) return { game, teamNum: 2, slot: 'p3' };
        if (game.p4 === name) return { game, teamNum: 2, slot: 'p4' };
      }
      return null;
    };

    for (const team of stayerTeams) {
      if (team.length < 2) continue;
      const [nameA, nameB] = team;

      const posA = findPos(nameA);
      const posB = findPos(nameB);
      if (!posA || !posB) continue;

      if (posA.game === posB.game) {
        // Same court — ensure they are on opposite teams
        if (posA.teamNum === posB.teamNum) {
          // Same team: swap B into the first slot of the opposite team
          const oppSlot = posA.teamNum === 1 ? 'p3' : 'p1';
          const displaced = posA.game[oppSlot];
          posA.game[oppSlot] = nameB;
          posA.game[posB.slot] = displaced;
        }
        // else already opponents on same court — nothing to do
      } else {
        // Different courts: bring B to A's court onto the opposite team.
        // Swap B with the first slot on A's opposite team; place the displaced
        // player into B's old slot on B's court.
        const oppSlot = posA.teamNum === 1 ? 'p3' : 'p1';
        const displaced = posA.game[oppSlot];
        posA.game[oppSlot] = nameB;
        posB.game[posB.slot] = displaced;
      }
    }

    return result;
  }

  function updateWinnerSummary() {
    const el = document.getElementById('queue-winner-summary');
    if (!el) return;
    const stay  = parseInt(document.getElementById('cfg-queue-winner-stay')?.value) || 0;
    const split = document.getElementById('cfg-queue-winner-split')?.value || 'none';
    if (stay === 0) {
      el.textContent = 'off';
    } else {
      const splitLabel = split === 'opposite' ? 'split/same court'
                       : split === 'separate'  ? 'split/any court'
                       :                         'same team';
      el.textContent = `${stay} replay${stay !== 1 ? 's' : ''}, ${splitLabel}`;
    }
  }

  // ── Shared optimizer breakdown table (used by both round-based and queue-based) ──
  function buildBreakdownTable(bd, nw, label, weights) {
    if (!bd) return '';
    const LABELS = {
      mixedViolations: 'Mixed doubles violations',
      sessionPartner:  'Repeat Partner (this session)',
      sessionOpponent: 'Repeat Opponent (this session)',
      historyPartner:  'Repeat Partner (prior weeks)',
      historyOpponent: 'Repeat Opponent (prior weeks)',
      sessionBye:      'Byes this session',
      byeVariance:     'Bye spread (season)',
      rankBalance:     'Rank imbalance',
      rankStdDev:      'Rank std dev (all-player spread)',
    };
    const WEIGHT_KEYS = {
      sessionPartner:  'sessionPartnerWeight',  sessionOpponent: 'sessionOpponentWeight',
      historyPartner:  'historyPartnerWeight',  historyOpponent: 'historyOpponentWeight',
      sessionBye:      'sessionByeWeight',      byeVariance:     'byeVarianceWeight',
      rankBalance:     'rankBalanceWeight',      rankStdDev:      'rankStdDevWeight',
    };
    let bhtml = `<table style="font-size:0.78rem; width:100%; border-collapse:collapse; margin-top:4px;">
      <thead><tr>
        <th style="text-align:left; padding:3px 8px; color:var(--muted); font-weight:500;">${label || 'Criterion'}</th>
        <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Raw</th>
        <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">User Weight</th>
        <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Norm. Weight</th>
        <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Score</th>
      </tr></thead><tbody>`;
    Object.entries(bd).forEach(([key, v]) => {
      const nonzero = v.weighted > 0;
      const wKey  = WEIGHT_KEYS[key];
      const userW = wKey ? (weights?.[wKey] ?? Pairings.DEFAULTS[wKey] ?? '—') : '—';
      const normW = (wKey && nw?.[wKey] != null) ? nw[wKey].toFixed(2) : '—';
      bhtml += `<tr style="${nonzero ? 'color:var(--white);' : 'color:var(--muted);'}">
        <td style="padding:3px 8px;">${LABELS[key] || key}</td>
        <td style="text-align:right; padding:3px 8px;">${typeof v.raw === 'number' ? v.raw.toFixed(2) : '—'}</td>
        <td style="text-align:right; padding:3px 8px;">${userW}</td>
        <td style="text-align:right; padding:3px 8px; color:var(--muted);">${normW}</td>
        <td style="text-align:right; padding:3px 8px; font-weight:${nonzero?'600':'400'};">${typeof v.weighted === 'number' ? v.weighted.toFixed(1) : '—'}</td>
      </tr>`;
    });
    bhtml += '</tbody></table>';
    return bhtml;
  }

  function renderQueuePanel() {
    const week = state.currentPairWeek;
    const gameMode = state.config.gameMode || 'doubles';
    const ppc = (gameMode === 'singles' || gameMode === 'fixed-pairs') ? 2 : 4;
    const allCourtIds = getQueueCourtIds();
    const occupied = getOccupiedCourts(week);
    const freeCourts = allCourtIds.filter(c => !occupied.has(c));
    const stayers = state.queue.filter(e => e.stayGames > 0);
    const regularQueue = state.queue.filter(e => e.stayGames === 0)
      .sort((a, b) => b.waitWeight - a.waitWeight);

    // Sync winner-stay config display
    const stayInput = document.getElementById('cfg-queue-winner-stay');
    if (stayInput) stayInput.value = state.config.queueWinnerStay ?? 0;
    const splitSel = document.getElementById('cfg-queue-winner-split');
    if (splitSel) {
      splitSel.value = state.config.queueWinnerSplit || 'none';
      splitSel.disabled = (state.config.queueWinnerStay ?? 0) == 0;
    }
    updateWinnerSummary();

    // ── Court selection state ────────────────────────────────
    // Keep a persistent Set of which free courts the admin has chosen.
    // Auto-add newly free courts; auto-remove newly occupied courts.
    if (!state.selectedQueueCourts) {
      // First render after page navigation — default to all free courts selected
      state.selectedQueueCourts = new Set(freeCourts);
    }
    // Always remove courts that have since become occupied
    occupied.forEach(c => state.selectedQueueCourts.delete(c));
    // Clamp to courts that actually exist
    [...state.selectedQueueCourts].forEach(c => {
      if (!allCourtIds.includes(c)) state.selectedQueueCourts.delete(c);
    });

    // ── Loading state — block interaction while queue data is being fetched ──
    // selectedQueueCourts is always a Set by this point, so any lingering click
    // handlers from a previous render will not throw a null error.
    if (state._queueLoading) {
      const loadCourtEl = document.getElementById('queue-court-select');
      const loadGenBtn  = document.getElementById('btn-queue-generate');
      const loadLockBtn = document.getElementById('btn-queue-lock');
      if (loadCourtEl) loadCourtEl.innerHTML =
        `<span style="color:var(--muted); font-size:0.78rem; display:flex; align-items:center; gap:6px;">` +
        `<span style="animation:spin 0.8s linear infinite; display:inline-block;">⏳</span> Loading queue…</span>`;
      if (loadGenBtn)  { loadGenBtn.disabled  = true; loadGenBtn.textContent = '🎲 Generate'; }
      if (loadLockBtn) loadLockBtn.disabled = true;
      return;
    }

    const selectedFreeCourts = freeCourts.filter(c => state.selectedQueueCourts.has(c));

    // Status line
    const inQueue = state.queue.length;
    const statusEl = document.getElementById('queue-status');
    if (statusEl) {
      const freeStr = `${freeCourts.length} court${freeCourts.length !== 1 ? 's' : ''} free`;
      const qStr = `${inQueue} in queue`;
      const stayStr = stayers.length ? `<span style="color:var(--gold);">${stayers.length} staying</span>` : '';
      statusEl.innerHTML = [freeStr, qStr, stayStr].filter(Boolean)
        .join(' <span style="color:var(--muted);">·</span> ');
    }

    // ── Court selector pills ─────────────────────────────────
    const courtSelectEl = document.getElementById('queue-court-select');
    if (courtSelectEl) {
      if (allCourtIds.length <= 1) {
        courtSelectEl.innerHTML = '';
      } else {
        let chtml = `<div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
          <span style="font-size:0.75rem; color:var(--muted); white-space:nowrap; margin-right:2px;">Fill:</span>`;
        allCourtIds.forEach(c => {
          const isFree = !occupied.has(c);
          const isSelected = isFree && state.selectedQueueCourts.has(c);
          const name = courtName(c);
          if (isFree) {
            const bg     = isSelected ? 'rgba(94,194,106,0.2)'   : 'rgba(122,155,181,0.08)';
            const border = isSelected ? 'rgba(94,194,106,0.5)'   : 'rgba(122,155,181,0.2)';
            const color  = isSelected ? 'var(--green)' : 'var(--muted)';
            chtml += `<button class="queue-court-btn" data-court="${c}"
              style="padding:3px 9px; font-size:0.75rem; border-radius:5px;
                     border:1px solid ${border}; background:${bg}; color:${color};
                     cursor:pointer; user-select:none; transition:all 0.15s;"
              >${isSelected ? '✓ ' : ''}${name}</button>`;
          } else {
            chtml += `<span style="padding:3px 9px; font-size:0.75rem; border-radius:5px;
              border:1px solid rgba(122,155,181,0.1); background:rgba(122,155,181,0.04);
              color:var(--muted); opacity:0.45;" title="Court occupied">${name} ●</span>`;
          }
        });
        chtml += '</div>';
        courtSelectEl.innerHTML = chtml;

        courtSelectEl.querySelectorAll('.queue-court-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const c = btn.dataset.court;
            if (state.selectedQueueCourts.has(c)) state.selectedQueueCourts.delete(c);
            else state.selectedQueueCourts.add(c);
            const nowSel = state.selectedQueueCourts.has(c);
            btn.style.background   = nowSel ? 'rgba(94,194,106,0.2)'  : 'rgba(122,155,181,0.08)';
            btn.style.borderColor  = nowSel ? 'rgba(94,194,106,0.5)'  : 'rgba(122,155,181,0.2)';
            btn.style.color        = nowSel ? 'var(--green)' : 'var(--muted)';
            btn.textContent = (nowSel ? '✓ ' : '') + courtName(c);
            // Recompute and refresh generate button
            const selFree = freeCourts.filter(x => state.selectedQueueCourts.has(x));
            const fc = Math.min(selFree.length, Math.floor(inQueue / ppc));
            if (genBtn) {
              genBtn.disabled = fc === 0;
              genBtn.textContent = fc > 0
                ? `🎲 Generate — ${fc} court${fc !== 1 ? 's' : ''}`
                : '🎲 Generate';
            }
          });
        });
      }
    }

    // Button states
    const genBtn  = document.getElementById('btn-queue-generate');
    const lockBtn = document.getElementById('btn-queue-lock');
    const fullCourts = Math.min(selectedFreeCourts.length, Math.floor(inQueue / ppc));
    if (genBtn) {
      genBtn.disabled = fullCourts === 0;
      genBtn.textContent = fullCourts > 0
        ? `🎲 Generate — ${fullCourts} court${fullCourts !== 1 ? 's' : ''}`
        : '🎲 Generate';
    }
    if (lockBtn) lockBtn.disabled = !state.pendingPairings;

    // Pending preview (shown after Generate, before Lock)
    const previewEl = document.getElementById('queue-pending-preview');
    if (previewEl) {
      if (state.pendingPairings) {
        const batchNum = state.pendingPairings[0]?.round ?? '?';
        let html = `<div style="font-size:0.75rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.07em; margin:8px 0 6px;">Pending — Batch ${batchNum}</div>`;
        state.pendingPairings.filter(p => p.type === 'game').forEach(game => {
          html += `<div style="background:var(--card-bg); border-radius:7px; padding:5px 10px; margin-bottom:3px;">
            <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center; gap:4px;">
              <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court, week)}</div>
              <div style="min-width:0; text-align:right;">
                <div style="font-size:0.85rem;">${esc(game.p1)}</div>
                ${game.p2 ? `<div style="font-size:0.85rem;">${esc(game.p2)}</div>` : ''}
              </div>
              <div style="text-align:center; color:var(--muted); font-size:0.72rem; padding:0 4px;">VS</div>
              <div style="min-width:0;">
                <div style="font-size:0.85rem;">${esc(game.p3)}</div>
                ${game.p4 ? `<div style="font-size:0.85rem;">${esc(game.p4)}</div>` : ''}
              </div>
            </div>
          </div>`;
        });
        previewEl.innerHTML = html;
        previewEl.classList.remove('hidden');
      } else {
        previewEl.innerHTML = '';
        previewEl.classList.add('hidden');
      }
    }

    // Optimizer breakdown (shown after Generate, cleared after Lock)
    const qStatusEl = document.getElementById('queue-optimizer-status');
    if (qStatusEl) {
      if (state.queueGeneration) {
        const gen = state.queueGeneration;
        const showing = gen.showing || 'best';
        const activeScore     = showing === 'second' ? gen.secondScore     : gen.score;
        const activeBreakdown = showing === 'second' ? gen.secondBreakdown : gen.breakdown;

        const cfgWeights = {
          sessionPartnerWeight:  state.config.wSessionPartner  ?? Pairings.DEFAULTS.sessionPartnerWeight,
          sessionOpponentWeight: state.config.wSessionOpponent ?? Pairings.DEFAULTS.sessionOpponentWeight,
          historyPartnerWeight:  state.config.wHistoryPartner  ?? Pairings.DEFAULTS.historyPartnerWeight,
          historyOpponentWeight: state.config.wHistoryOpponent ?? Pairings.DEFAULTS.historyOpponentWeight,
          byeVarianceWeight:     state.config.wByeVariance     ?? Pairings.DEFAULTS.byeVarianceWeight,
          sessionByeWeight:      state.config.wSessionBye      ?? Pairings.DEFAULTS.sessionByeWeight,
          rankBalanceWeight:     state.config.wRankBalance      ?? Pairings.DEFAULTS.rankBalanceWeight,
          rankStdDevWeight:      state.config.wRankStdDev       ?? Pairings.DEFAULTS.rankStdDevWeight,
        };
        const swapInfo = (state.config.localImprove === false || state.config.localImprove === 'false')
          ? ' · no swap' : ` · swap ${(v => isNaN(v) ? 5 : v)(parseInt(state.config.swapPasses))} passes`;

        const has2nd = gen.secondPairings && gen.secondScore < Infinity;
        const secondBtnHtml = has2nd
          ? `<button id="btn-queue-show-second" class="btn btn-secondary"
               style="padding:3px 10px; font-size:0.75rem;"
               data-showing="${showing}">
               ${showing === 'second' ? 'Show Best' : 'Show 2nd Best'}
             </button>`
          : '';

        // Extra row for queue wait priority weight (informational — controls queue ordering, not optimizer)
        const wQueueWait = gen.wQueueWait ?? (state.config.wQueueWait ?? 10);
        const queueWaitRow = `<tr style="color:var(--muted);">
          <td style="padding:3px 8px;">Queue wait priority</td>
          <td style="text-align:right; padding:3px 8px;">—</td>
          <td style="text-align:right; padding:3px 8px;">${wQueueWait}</td>
          <td style="text-align:right; padding:3px 8px; color:var(--muted);">—</td>
          <td style="text-align:right; padding:3px 8px; font-style:italic; font-size:0.72rem;">queue order</td>
        </tr>`;

        const tableHtml = buildBreakdownTable(
          activeBreakdown, gen.normalizedWeights,
          `Criterion — ${showing === 'second' ? `2nd Best (score ${gen.secondScore?.toFixed(1)})` : `Best (score ${activeScore.toFixed(1)})`}`,
          cfgWeights
        );
        // Inject queue wait row before closing </tbody>
        const tableWithQueueRow = tableHtml.replace('</tbody>', queueWaitRow + '</tbody>');

        qStatusEl.innerHTML =
          `<div style="display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:6px;">
            <span>Total Score: <span class="score">${activeScore.toFixed(1)}</span></span>
            <span style="font-size:0.78rem; color:var(--muted);">${gen.tries} iterations${swapInfo} · ${gen.playerCount} players</span>
            ${secondBtnHtml}
          </div>` + tableWithQueueRow;
        qStatusEl.classList.remove('hidden');

        // Wire up 2nd best toggle
        document.getElementById('btn-queue-show-second')?.addEventListener('click', () => {
          const next = gen.showing === 'second' ? 'best' : 'second';
          gen.showing = next;
          state.pendingPairings = next === 'second' ? gen.secondPairings : gen.bestPairings;
          renderQueuePanel();
        });
      } else {
        qStatusEl.innerHTML = '';
        qStatusEl.classList.add('hidden');
      }
    }

    // Queue table
    const tableEl = document.getElementById('queue-table-content');
    if (tableEl) {
      if (!state.queue.length) {
        tableEl.innerHTML = '<p class="text-muted" style="font-size:0.85rem; padding:8px 0;">Queue is empty. Use Initialize Queue to add all present players.</p>';
      } else {
        const isMixed = gameMode === 'mixed-doubles';
        const rankMap = {};
        state.standings.forEach(s => { if (s.rank != null && s.rank !== '-') rankMap[s.name] = s.rank; });
        const groupMap = {};
        state.players.forEach(p => { groupMap[p.name] = p.group || 'M'; });

        let html = `<table style="width:100%; font-size:0.85rem; border-collapse:collapse;">
          <thead><tr style="color:var(--muted); font-size:0.72rem; text-transform:uppercase;">
            <th style="text-align:left; padding:4px 6px;">Player</th>
            <th style="text-align:center; padding:4px 6px;" title="Current rank">#</th>
            ${isMixed ? `<th style="text-align:center; padding:4px 6px;" title="Gender group (M/F/Either)">Grp</th>` : ''}
            <th style="text-align:center; padding:4px 6px;" title="Wait weight — higher means waited longer">Wt</th>
            <th style="text-align:center; padding:4px 6px;" title="Stay games remaining (winners)">Stay</th>
          </tr></thead><tbody>`;
        [...stayers, ...regularQueue].forEach(e => {
          const isStayer = e.stayGames > 0;
          const rank = rankMap[e.player] ?? '—';
          const grp  = isMixed ? (groupMap[e.player] === 'Either' ? 'E' : (groupMap[e.player] || 'M')) : '';
          html += `<tr style="${isStayer ? 'color:var(--gold);' : ''}">
            <td style="padding:3px 6px; font-weight:${isStayer ? '600' : '400'};">${esc(e.player)}</td>
            <td style="text-align:center; padding:3px 6px; color:var(--muted); font-size:0.78rem;">${rank}</td>
            ${isMixed ? `<td style="text-align:center; padding:3px 6px; font-size:0.78rem;">${grp}</td>` : ''}
            <td style="text-align:center; padding:3px 6px;">${isStayer ? '—' : e.waitWeight}</td>
            <td style="text-align:center; padding:3px 6px;">${isStayer ? e.stayGames : '—'}</td>
          </tr>`;
        });
        html += '</tbody></table>';
        tableEl.innerHTML = html;
      }
    }
  }

  async function runQueueGenerate() {
    const week = state.currentPairWeek;
    const gameMode = state.config.gameMode || 'doubles';
    const singles = gameMode === 'singles' || gameMode === 'fixed-pairs';
    const ppc = singles ? 2 : 4;
    const allCourtIds = getQueueCourtIds();
    const occupied = getOccupiedCourts(week);
    const freeCourts = allCourtIds.filter(c => !occupied.has(c));
    if (!freeCourts.length) { toast('No free courts available.', 'warn'); return; }

    // Unified priority: stayGames × wQueueWait bonus + waitWeight
    // wQueueWait=0 → pure wait-time order (no stayer advantage)
    // wQueueWait=10 (default) → each stay game is worth 10 wait-weight points
    const wQueueWait = state.config.wQueueWait ?? 10;
    const ordered = [...state.queue].sort((a, b) => {
      const pa = a.waitWeight + wQueueWait * a.stayGames;
      const pb = b.waitWeight + wQueueWait * b.stayGames;
      return pb - pa;
    });
    // Use only the courts the admin has selected; fall back to all free if no selection state exists
    const selectedFreeCourts = freeCourts.filter(c =>
      !state.selectedQueueCourts || state.selectedQueueCourts.size === 0 || state.selectedQueueCourts.has(c)
    );
    if (!selectedFreeCourts.length) { toast('No courts selected. Choose which courts to fill.', 'warn'); return; }

    const fullCourts = Math.min(selectedFreeCourts.length, Math.floor(ordered.length / ppc));
    if (!fullCourts) { toast('Not enough players in queue to fill a court.', 'warn'); return; }

    // Block generation if scores already exist for the next batch number
    // (can happen if pairings were cleared but scores were not)
    const nextBatch = getNextQueueBatchNum(week);
    const hasScores = state.scores.some(s =>
      parseInt(s.week) === week && parseInt(s.round) === nextBatch
    );
    if (hasScores) {
      toast(`Scores already exist for Batch ${nextBatch}. Use "Clear" to remove them first.`, 'warn');
      return;
    }

    const playersToAssign = ordered.slice(0, fullCourts * ppc).map(e => e.player);
    const actualCourts = selectedFreeCourts.slice(0, fullCourts);

    const pastPairings = state.pairings.filter(p => parseInt(p.week) < week);
    const sessionHistory = state.pairings.filter(p => parseInt(p.week) === week);

    // For "separate" and "opposite" splits: inject fake partner-history for stayer-teammate
    // pairs so the optimizer strongly avoids re-partnering them. For "opposite", we further
    // post-process to bring them onto the same court on opposite teams.
    const stayerTeams = findStayerTeams(week);
    let augmentedHistory = sessionHistory;
    if ((state.config.queueWinnerSplit || 'none') !== 'none' && stayerTeams.length) {
      const fakePairings = stayerTeams.map((team, i) => ({
        week, round: -1 - i, court: '0', type: 'game',
        p1: team[0], p2: team[1] || team[0], p3: '_phantom_a_', p4: '_phantom_b_'
      }));
      augmentedHistory = [...sessionHistory, ...fakePairings];
    }

    const tries = parseInt(state.config.optimizerTries || 100);
    const weights = {
      sessionPartnerWeight:  state.config.wSessionPartner  ?? Pairings.DEFAULTS.sessionPartnerWeight,
      sessionOpponentWeight: state.config.wSessionOpponent ?? Pairings.DEFAULTS.sessionOpponentWeight,
      historyPartnerWeight:  state.config.wHistoryPartner  ?? Pairings.DEFAULTS.historyPartnerWeight,
      historyOpponentWeight: state.config.wHistoryOpponent ?? Pairings.DEFAULTS.historyOpponentWeight,
      byeVarianceWeight:     state.config.wByeVariance     ?? Pairings.DEFAULTS.byeVarianceWeight,
      sessionByeWeight:      state.config.wSessionBye      ?? Pairings.DEFAULTS.sessionByeWeight,
      rankBalanceWeight:     state.config.wRankBalance      ?? Pairings.DEFAULTS.rankBalanceWeight,
      rankStdDevWeight:      state.config.wRankStdDev       ?? Pairings.DEFAULTS.rankStdDevWeight,
    };
    const playerGroups = {};
    state.players.forEach(pl => { playerGroups[pl.name] = pl.group || 'M'; });
    const useLocalImprove = state.config.localImprove === undefined ? true : (state.config.localImprove === true || state.config.localImprove === 'true');
    const swapPasses = (v => isNaN(v) ? 5 : v)(parseInt(state.config.swapPasses));
    const useInitialRank = state.config.useInitialRank === true || state.config.useInitialRank === 'true';
    const verbose = document.getElementById('cfg-verbose-optimizer')?.checked === true;

    const workerParams = {
      presentPlayers: playersToAssign,
      courts: actualCourts.length,
      rounds: 1,
      pastPairings,
      tries,
      weights,
      standings: state.standings,
      gameMode,
      playerGroups,
      startRound: 1,
      sessionHistory: augmentedHistory,
      players: state.players,
      useLocalImprove,
      swapPasses,
      useInitialRank,
      verbose,
    };

    // Show the shared generation overlay
    const overlay    = document.getElementById('pairing-overlay');
    const overlayMsg = document.getElementById('pairing-overlay-msg');
    overlayMsg.textContent = `${tries} iterations · ${playersToAssign.length} players`;
    overlay.classList.remove('hidden');
    overlay.style.display = 'flex';

    // Run optimizer in Web Worker with progress updates; chunked fallback if unavailable
    const runOptimize = () => new Promise((resolve, reject) => {
      if (typeof Worker !== 'undefined') {
        try {
          const workerUrl = new URL('js/pairing-worker.js', window.location.href).href;
          const worker = new Worker(workerUrl);
          worker.onmessage = (e) => {
            if (e.data.progress) {
              const { phase, iteration, tries: t } = e.data;
              const pct = Math.round((iteration / t) * 100);
              overlayMsg.textContent = phase === 'swap'
                ? `Iteration ${iteration}/${t} · Swap optimising… (${pct}%)`
                : `Iteration ${iteration}/${t} · Generating… (${pct}%)`;
              return;
            }
            worker.terminate();
            if (e.data.ok) resolve(e.data.result);
            else reject(new Error(e.data.error));
          };
          worker.onerror = () => { worker.terminate(); runInChunks(resolve, reject); };
          worker.postMessage(workerParams);
          return;
        } catch (e) { /* fall through to chunked */ }
      }
      runInChunks(resolve, reject);
    });

    function runInChunks(resolve, reject) {
      const CHUNK = 25;
      let remaining = workerParams.tries;
      let best = null;
      const accumulatedScores = workerParams.verbose ? [] : null;
      function nextChunk() {
        try {
          const batchTries = Math.min(CHUNK, remaining);
          const res = Pairings.optimize({ ...workerParams, tries: batchTries });
          if (accumulatedScores && res.allScores) accumulatedScores.push(...res.allScores);
          if (res.pairings) {
            if (!best || res.score < best.score) {
              if (best && best.pairings) {
                if (!res.secondPairings || best.score < res.secondScore) {
                  res.secondPairings  = best.pairings;
                  res.secondScore     = best.score;
                  res.secondBreakdown = best.breakdown;
                }
              }
              best = res;
            } else if (!best.secondPairings || res.score < best.secondScore) {
              best.secondPairings  = res.pairings;
              best.secondScore     = res.score;
              best.secondBreakdown = res.breakdown;
            }
          }
          remaining -= batchTries;
          overlayMsg.textContent = `${workerParams.tries - remaining}/${workerParams.tries} iterations · ${workerParams.presentPlayers.length} players`;
          if (remaining > 0) { setTimeout(nextChunk, 0); }
          else {
            if (accumulatedScores && best) best.allScores = accumulatedScores;
            resolve(best || { pairings: null, score: Infinity, error: 'No valid pairings could be generated.' });
          }
        } catch (err) { reject(err); }
      }
      setTimeout(nextChunk, 0);
    }

    // Helper: remap raw optimizer pairings to real court IDs and batch number
    function remapPairings(raw, batchNum) {
      return raw.map(p => ({
        ...p, week, round: batchNum,
        court: actualCourts[parseInt(p.court) - 1] ?? p.court,
        type: 'game'
      }));
    }

    try {
      const { pairings: result, score, breakdown, normalizedWeights,
              secondPairings: rawSecond, secondScore, secondBreakdown, allScores } = await runOptimize();

      overlay.classList.add('hidden');
      overlay.style.display = 'none';

      if (!result) {
        toast('Could not generate queue pairings.', 'error');
        renderQueuePanel();
        return;
      }

      const batchNum = getNextQueueBatchNum(week);
      // Remap optimizer court indices (1-based) to actual court IDs
      let pairings = remapPairings(result, batchNum);

      // Apply opposite split: ensure stayer-teammates end up on opposite teams
      if ((state.config.queueWinnerSplit || 'none') === 'opposite') {
        pairings = applyOppositeSplit(pairings, stayerTeams, gameMode);
      }

      // Remap 2nd best pairings the same way
      let secondPairings = rawSecond ? remapPairings(rawSecond, batchNum) : null;
      if (secondPairings && (state.config.queueWinnerSplit || 'none') === 'opposite') {
        secondPairings = applyOppositeSplit(secondPairings, stayerTeams, gameMode);
      }

      state.pendingPairings = pairings;
      state.queueGeneration = {
        score, breakdown, normalizedWeights, tries, playerCount: playersToAssign.length,
        bestPairings: pairings,
        secondPairings, secondScore, secondBreakdown,
        allScores, showing: 'best',
        wQueueWait: state.config.wQueueWait ?? 10,
      };
      renderQueuePanel();
    } catch (e) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
      toast('Queue generation failed: ' + e.message, 'error');
      renderQueuePanel();
    }
  }

  async function queueLockAndSave() {
    if (!state.pendingPairings) return;
    const week = state.currentPairWeek;
    const assignedPlayers = new Set(
      state.pendingPairings.flatMap(p => [p.p1, p.p2, p.p3, p.p4].filter(Boolean))
    );
    const assignedCount = assignedPlayers.size;

    showLoading(true);
    try {
      // Merge new batch with existing pairings for this week
      const allWeekPairings = [
        ...state.pairings.filter(p => parseInt(p.week) === week),
        ...state.pendingPairings
      ];
      await API.savePairings(week, allWeekPairings);
      state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
      state.pairings.push(...allWeekPairings);
      state.pendingPairings = null;
      state.queueGeneration = null;

      // Remove assigned players; bump wait weight for those remaining
      state.queue = state.queue
        .filter(e => !assignedPlayers.has(e.player))
        .map(e => ({ ...e, waitWeight: e.waitWeight + assignedCount }));

      await API.saveQueue(week, state.queue.map(e => ({ ...e, week })));

      // Clear the unsaved-pairings warning (shown when pendingPairings was set)
      const unsavedWarn = document.getElementById('pairings-unsaved-warning');
      if (unsavedWarn) unsavedWarn.style.display = 'none';

      toast(`Batch saved for Session ${week}.`);
      renderQueuePanel();
      renderScoresheet();
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // Called after a score is auto-saved in queue mode.
  // Adds players back to the queue based on win/loss outcome.
  async function updateQueueAfterScore(newScore, pairing) {
    const week = newScore.week;
    const winnerStay = parseInt(state.config.queueWinnerStay ?? 0);
    const t1players = [pairing.p1, pairing.p2].filter(Boolean);
    const t2players = [pairing.p3, pairing.p4].filter(Boolean);
    const t1wins = newScore.score1 > newScore.score2;
    const t2wins = newScore.score2 > newScore.score1;
    const winners = t1wins ? t1players : t2wins ? t2players : [];
    const losers  = t1wins ? t2players : t2wins ? t1players : [...t1players, ...t2players];

    const inQueueMap = new Map(state.queue.map(e => [e.player, e]));

    winners.forEach(name => {
      const existing = inQueueMap.get(name);
      if (!existing) {
        state.queue.push({ player: name, waitWeight: 0, stayGames: winnerStay });
      } else if (winnerStay > 0) {
        existing.stayGames = winnerStay; // re-scored: reset stay counter
      }
    });

    losers.forEach(name => {
      const existing = inQueueMap.get(name);
      if (!existing) {
        state.queue.push({ player: name, waitWeight: 0, stayGames: 0 });
      } else {
        existing.stayGames = 0; // re-scored: loss clears stay
      }
    });

    try {
      await API.saveQueue(week, state.queue.map(e => ({ ...e, week })));
    } catch (e) { /* non-fatal — queue state updated in memory */ }

    renderQueuePanel();
  }

  async function initializeQueue(week) {
    const presentPlayers = state.players
      .filter(p => p.active === true && p.role !== 'spectator')
      .filter(p => {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
        return rec && rec.status === 'present';
      })
      .map(p => p.name);

    if (!presentPlayers.length) {
      toast('No present players found. Mark players as present first.', 'warn'); return;
    }

    if (!state.queue.length) {
      // Empty queue — full initialization, no confirm needed
      state.queue = presentPlayers.map(name => ({ player: name, waitWeight: 0, stayGames: 0 }));
    } else {
      // Smart refresh: add newly-present players, remove absent ones, preserve existing entries
      const inQueue    = new Set(state.queue.map(e => e.player));
      const presentSet = new Set(presentPlayers);

      const toAdd    = presentPlayers.filter(n => !inQueue.has(n));
      const toRemove = state.queue.filter(e => !presentSet.has(e.player));

      if (!toAdd.length && !toRemove.length) {
        toast('Queue is already up to date — no changes needed.', 'info'); return;
      }

      const summary = [
        toAdd.length    ? `Adding ${toAdd.length} player(s): ${toAdd.join(', ')}`          : '',
        toRemove.length ? `Removing ${toRemove.length} player(s): ${toRemove.map(e => e.player).join(', ')}` : '',
      ].filter(Boolean).join('\n');

      if (!confirm(`Refresh queue?\n\n${summary}`)) return;

      // Apply changes: keep existing order, remove absent, append new arrivals at end
      state.queue = [
        ...state.queue.filter(e => presentSet.has(e.player)),
        ...toAdd.map(name => ({ player: name, waitWeight: 0, stayGames: 0 })),
      ];
    }

    showLoading(true);
    try {
      await API.saveQueue(week, state.queue.map(e => ({ ...e, week })));
      toast(`Queue updated — ${state.queue.length} player(s) in queue.`);
      renderQueuePanel();
    } catch (e) {
      toast('Failed to save queue: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
  }

  // ── Final Round Finish Scenarios ───────────────────────────
  function renderFinishScenarios() {
    const card    = document.getElementById('finish-scenarios-card');
    const content = document.getElementById('finish-scenarios-content');
    if (!card || !content) return;

    const totalWeeks  = parseInt(state.config.weeks || 0);
    const totalRounds = parseInt(state.config.gamesPerSession || 0);
    const week        = state.currentScoreWeek;

    // Only show on the last session
    if (!totalWeeks || !totalRounds || week !== totalWeeks) {
      card.style.display = 'none';
      return;
    }

    // Don't show possible outcomes when the last session is a tournament
    const lastWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    if (lastWeekPairings.some(p => p.type === 'tourn-game')) {
      card.style.display = 'none';
      return;
    }

    // Check that the final round has pairings
    const finalPairings = lastWeekPairings.filter(p =>
      parseInt(p.round) === totalRounds && (p.type === 'game' || p.type === 'tourn-game')
    );
    if (!finalPairings.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';

    const result = Reports.computeFinishScenarios(
      state.scores, state.players, state.pairings,
      week, totalRounds,
      state.config.rankingMethod || 'avgptdiff',
      state.attendance
    );

    if (!result) {
      content.innerHTML = '<p class="text-muted" style="font-size:0.85rem; padding:8px 0;">All final round scores entered — standings are final.</p>';
      return;
    }

    const { results, games, enteredCount } = result;

    if (!results.length) {
      content.innerHTML = '<p class="text-muted" style="font-size:0.85rem; padding:8px 0;">No players can reach the top 3.</p>';
      return;
    }

    const remaining = games.length;
    let html = `<p style="font-size:0.82rem; color:var(--muted); margin-bottom:12px;">
      ${enteredCount} of ${enteredCount + remaining} final round game${enteredCount + remaining !== 1 ? 's' : ''} scored.
      ${remaining} game${remaining !== 1 ? 's' : ''} remaining.
      Showing all possible top-3 finishes.
    </p>`;

    results.forEach(r => {
      const medal = r.bestRank === 1 ? '🥇' : r.bestRank === 2 ? '🥈' : '🥉';
      const rankLabel = r.bestRank === 1 ? '1st' : r.bestRank === 2 ? '2nd' : '3rd';
      const currentLabel = r.currentRank === 1 ? '1st' : r.currentRank === 2 ? '2nd' : r.currentRank === 3 ? '3rd' : `${r.currentRank}th`;

      html += `<div style="margin-bottom:14px; padding:10px 14px; background:var(--card-bg); border-radius:8px; border-left:3px solid ${r.bestRank === 1 ? '#ffd700' : r.bestRank === 2 ? '#c0c0c0' : '#cd7f32'};">`;
      html += `<div style="font-weight:700; font-size:0.95rem; margin-bottom:6px;">${medal} ${esc(r.name)} <span style="color:var(--muted); font-weight:400; font-size:0.82rem;">currently ${currentLabel}</span></div>`;

      if (r.guaranteed) {
        html += `<div style="color:var(--green); font-size:0.85rem;">Guaranteed to finish ${rankLabel} regardless of remaining results.</div>`;
      } else if (r.scenarios.length === 0) {
        html += `<div style="color:var(--muted); font-size:0.82rem;">Can finish ${rankLabel} — calculating scenarios…</div>`;
      } else {
        html += `<div style="font-size:0.82rem; color:var(--muted); margin-bottom:4px;">Can finish ${rankLabel} if:</div>`;
        html += `<ul style="margin:0; padding-left:18px; font-size:0.82rem; line-height:1.8;">`;
        r.scenarios.forEach(s => {
          html += `<li>${esc(s)}</li>`;
        });
        html += `</ul>`;
      }
      html += `</div>`;
    });

    content.innerHTML = html;
  }

  // ── Standings ──────────────────────────────────────────────
  function renderStandings() {
    // Update page title with league name
    const standTitle = document.getElementById('standings-page-title');
    if (standTitle) {
      const name = Auth.getSession()?.leagueName || state.config.leagueName || '';
      standTitle.textContent = name ? `${name} — Standings` : 'Standings';
    }
    const isLadder = (state.config.standingsMethod || 'standard') === 'ladder';

    // Podium shared setup
    const podiumPhotosOn = !state._tierDisablePhotos;
    const podiumPhotoMap = {};
    if (podiumPhotosOn) state.players.forEach(p => { if (p.photo) podiumPhotoMap[p.name] = p.photo; });
    const podiumFullNameMap = {};
    state.players.forEach(p => { if (p.fullName) podiumFullNameMap[p.name] = p.fullName; });

    // Detect whether the final session is fully scored (season complete)
    const seasonDone = (() => {
      const totalWeeks = parseInt(state.config.weeks) || 0;
      if (!totalWeeks) return false;
      const lastGames = state.pairings.filter(p => parseInt(p.week) === totalWeeks && (p.type === 'game' || p.type === 'tourn-game'));
      if (!lastGames.length) return false;
      return lastGames.every(g => {
        const sc = state.scores.find(s => parseInt(s.week) === totalWeeks && parseInt(s.round) === parseInt(g.round) && String(s.court) === String(g.court));
        return sc && sc.score1 !== '' && sc.score1 !== null && sc.score2 !== '' && sc.score2 !== null;
      });
    })();

    if (isLadder) {
      // Build rankMap from standard standings (used to determine which wins are upsets)
      const stdAll = Reports.computeStandings(state.scores, state.players, state.pairings, null,
        state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const rankMap = {};
      stdAll.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = s.rank; });
      state.players.forEach(p => { if (rankMap[p.name] == null && p.initialRank) rankMap[p.name] = p.initialRank; });

      const season = Reports.computeLadderStandings(state.scores, state.players, state.pairings,
        null, state.attendance, state.config, rankMap);
      const topThree = season.filter(s => s.totalPts !== undefined).slice(0, 3);
      document.getElementById('season-podium').innerHTML = buildPodiumHTML(topThree, podiumPhotoMap, podiumPhotosOn, seasonDone, podiumFullNameMap);

      const detailsOpen  = s => `<details open style="margin-bottom:10px;">
        <summary class="card-header collapsible-header" style="list-style:none; cursor:pointer; display:flex;
          align-items:center; justify-content:space-between; background:var(--surface);
          border-radius:var(--radius); padding:10px 16px; user-select:none;">
          <div class="card-title" style="margin:0;">${s}</div>
          <span class="collapse-arrow" style="font-size:0.72rem; color:var(--green); opacity:0.6;">▼</span>
        </summary><div style="padding:10px 0 4px;">`;
      const detailsClose = '</div></details>';

      document.getElementById('standings-season-table').innerHTML =
        detailsOpen('Ladder Standings') + renderLadderStandingsTable(season, state.config) + detailsClose +
        detailsOpen('Season Win&nbsp;% Standings') + renderStandingsTable(stdAll) + detailsClose;

      const weekStand = Reports.computeWeeklyLadderStandings(state.scores, state.players, state.pairings,
        state.currentStandWeek, state.attendance, state.config, rankMap);
      const weekWinPct = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings,
        state.currentStandWeek, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      document.getElementById('standings-weekly-table').innerHTML =
        detailsOpen('Ladder Standings') + renderLadderStandingsTable(weekStand, state.config) + detailsClose +
        detailsOpen('Session Win&nbsp;% Standings') + renderStandingsTable(weekWinPct) + detailsClose;
    } else {
      const season = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const topThree = season.filter(s => s.games > 0).slice(0, 3);
      document.getElementById('season-podium').innerHTML = buildPodiumHTML(topThree, podiumPhotoMap, podiumPhotosOn, seasonDone, podiumFullNameMap);
      document.getElementById('standings-season-table').innerHTML = renderStandingsTable(season);

      const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const overallThisWeek = Reports.computeStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const overallPrevWeek = state.currentStandWeek > 1
        ? Reports.computeStandings(state.scores, state.players, state.pairings, state.currentStandWeek - 1, state.config.rankingMethod, state.attendance, state.config.pairingMode)
        : null;
      document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand, false, overallThisWeek, overallPrevWeek);
    }
    const _swTitle = state.config[`title_${state.currentStandWeek}`];
    document.getElementById('stand-week-label').textContent = _swTitle
      ? `Session ${state.currentStandWeek}: ${_swTitle}`
      : `Session ${state.currentStandWeek}`;
    const standWkSel = document.getElementById('stand-week-select');
    if (standWkSel && standWkSel.value != state.currentStandWeek) standWkSel.value = state.currentStandWeek;

    // Default to season tab active
    document.querySelectorAll('#standings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#standings-tabs .tab-btn[data-tab="season"]').classList.add('active');
    document.getElementById('standings-season').classList.add('active');
    document.getElementById('standings-weekly').classList.remove('active');
    document.getElementById('standings-trend').classList.remove('active');

    // Tab switching
    document.querySelectorAll('#standings-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#standings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('standings-season').classList.toggle('active', tab === 'season');
        document.getElementById('standings-weekly').classList.toggle('active', tab === 'weekly');
        document.getElementById('standings-trend').classList.toggle('active', tab === 'trend');
        if (tab === 'trend') renderRankTrend();
      });
    });
  }


  // ── Rank Trend Chart (shared drawing logic) ────────────────
  // DASH_PATTERNS: 5 distinct dash styles cycled across players
  // combined with colors gives 100 unique combinations
  const DASH_PATTERNS = [
    [],             // solid
    [8, 4],         // dashed
    [2, 4],         // dotted
    [10, 4, 2, 4],  // dash-dot
    [6, 3, 2, 3, 2, 3], // dash-dot-dot
  ];

  function drawRankTrendChart(canvasId, legendId, chartState, highlightPlayer) {
    const canvas = document.getElementById(canvasId);
    const legend = document.getElementById(legendId);
    if (!canvas || !legend) return;

    const totalWeeks   = parseInt(chartState.config.weeks || 8);
    const activePlayers = chartState.players.filter(p => p.active === true);
    if (!activePlayers.length) {
      legend.innerHTML = '<span class="text-muted">No players yet.</span>';
      return;
    }

    // Build cumulative rank per player per scored week
    const weeksWithData = [];
    const ranksByWeek   = {};
    activePlayers.forEach(p => { ranksByWeek[p.name] = []; });

    for (let w = 1; w <= totalWeeks; w++) {
      if (!chartState.scores.some(s => parseInt(s.week) === w)) continue;
      weeksWithData.push(w);
      const scoresThrough = chartState.scores.filter(s => parseInt(s.week) <= w);
      const standings     = Reports.computeStandings(scoresThrough, chartState.players, chartState.pairings);
      activePlayers.forEach(p => {
        const entry = standings.find(s => s.name === p.name);
        ranksByWeek[p.name].push(entry ? entry.rank : null);
      });
    }

    if (!weeksWithData.length) {
      legend.innerHTML = '<span class="text-muted">No scored weeks yet.</span>';
      canvas.style.display = 'none';
      return;
    }
    canvas.style.display = 'block';

    const COLORS = [
      '#5EC26A','#F5C842','#5B9BD5','#E07B54','#A78BFA',
      '#34D399','#FB7185','#60A5FA','#FBBF24','#A3E635',
      '#38BDF8','#F472B6','#4ADE80','#FB923C','#818CF8',
      '#E879F9','#2DD4BF','#FCA5A5','#86EFAC','#93C5FD',
    ];

    const PAD  = { top: 24, right: 20, bottom: 36, left: 40 };
    const W    = Math.max(canvas.parentElement.clientWidth || 600, 320);
    const H    = Math.max(240, Math.min(420, W * 0.45));
    canvas.width  = W;
    canvas.height = H;
    const ctx  = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const maxRank = activePlayers.length;
    const plotW   = W - PAD.left - PAD.right;
    const plotH   = H - PAD.top  - PAD.bottom;

    // Grid lines + Y labels
    ctx.lineWidth   = 1;
    ctx.font        = '11px system-ui, sans-serif';
    ctx.textAlign   = 'right';
    const rankStep  = maxRank <= 10 ? 1 : maxRank <= 20 ? 2 : 5;
    for (let r = 1; r <= maxRank; r += rankStep) {
      const y = PAD.top + ((r - 1) / (maxRank - 1 || 1)) * plotH;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText(r, PAD.left - 6, y + 4);
    }

    // X labels
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    weeksWithData.forEach((w, i) => {
      const x     = PAD.left + (i / (weeksWithData.length - 1 || 1)) * plotW;
      const label = formatDateTime(w, chartState.config) || ('S' + w);
      ctx.fillText(label, x, H - PAD.bottom + 16);
    });

    // Y-axis label
    ctx.save();
    ctx.translate(12, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Rank', 0, 0);
    ctx.restore();

    // Draw lines — non-highlighted players first (dimmed), highlighted on top
    const drawPlayer = (player, pi, isHighlighted) => {
      const color   = COLORS[pi % COLORS.length];
      const dash    = DASH_PATTERNS[pi % DASH_PATTERNS.length];
      const ranks   = ranksByWeek[player.name];
      const points  = ranks.map((r, i) => {
        if (r === null) return null;
        return {
          x: PAD.left + (i / (weeksWithData.length - 1 || 1)) * plotW,
          y: PAD.top  + ((r - 1) / (maxRank - 1 || 1)) * plotH,
        };
      });

      const anyHighlight = highlightPlayer && activePlayers.some(p => p.name === highlightPlayer);
      const dimmed = anyHighlight && !isHighlighted;

      ctx.globalAlpha  = dimmed ? 0.25 : 1;
      ctx.strokeStyle  = color;
      ctx.lineWidth    = isHighlighted ? 4 : 2.5;
      ctx.lineJoin     = 'round';
      ctx.setLineDash(isHighlighted ? [] : dash); // highlighted always solid + thicker

      ctx.beginPath();
      let started = false;
      points.forEach(pt => {
        if (!pt) { started = false; return; }
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Dots — larger for highlighted player
      const dotR = isHighlighted ? 6 : 4;
      points.forEach(pt => {
        if (!pt) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dotR, 0, Math.PI * 2);
        ctx.fillStyle   = color;
        ctx.fill();
        ctx.strokeStyle = isHighlighted ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
        ctx.lineWidth   = isHighlighted ? 2 : 1.5;
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };

    // Draw background (non-highlighted) players first
    activePlayers.forEach((player, pi) => {
      if (player.name !== highlightPlayer) drawPlayer(player, pi, false);
    });
    // Draw highlighted player last so it renders on top
    activePlayers.forEach((player, pi) => {
      if (player.name === highlightPlayer) drawPlayer(player, pi, true);
    });
    ctx.setLineDash([]);

    // Legend — show color swatch with dash pattern
    legend.innerHTML = activePlayers.map((p, pi) => {
      const color = COLORS[pi % COLORS.length];
      const dash  = DASH_PATTERNS[pi % DASH_PATTERNS.length];
      const isMe  = p.name === highlightPlayer;
      const dashArray = (!isMe && dash.length) ? dash.join(',') : 'none';
      const lineW = isMe ? 4 : 2.5;
      const svgLine = `<svg width="28" height="10" style="vertical-align:middle;overflow:visible">
        <line x1="0" y1="5" x2="28" y2="5"
          stroke="${color}" stroke-width="${lineW}"
          stroke-dasharray="${dashArray}"/>
      </svg>`;
      const nameStyle = isMe
        ? 'color:var(--white); font-weight:700;'
        : 'color:rgba(255,255,255,0.55);';
      return `<span style="display:flex;align-items:center;gap:5px;white-space:nowrap;">
        ${svgLine}
        <span style="${nameStyle}">${p.name.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</span>
      </span>`;
    }).join('');
  }
  function renderRankTrend() {
    drawRankTrendChart('rank-trend-chart', 'rank-trend-legend', state, session.name);
  }

  function renderStandingsTable(standings, compact = false, overallStandings = null, prevOverallStandings = null) {
    if (!standings || !standings.length) return '<p class="text-muted">No standings data yet.</p>';
    const rm = state.config.rankingMethod || 'avgptdiff';
    const usePtsPct = rm === 'ptspct';
    const minPct = (state.config.minParticipation !== null && state.config.minParticipation !== undefined)
      ? parseFloat(state.config.minParticipation) / 100 : 0.50;
    const hasParticipation = standings.some(s => s.participationPct !== null && s.participationPct !== undefined);

    // Build rank lookups from overall standings for rank column and movement indicator
    const overallRankMap = {};
    if (overallStandings) {
      overallStandings.forEach(s => { if (s.rank && s.rank !== '-') overallRankMap[s.name] = s.rank; });
    }
    const prevOverallRankMap = {};
    if (prevOverallStandings) {
      prevOverallStandings.forEach(s => { if (s.rank && s.rank !== '-') prevOverallRankMap[s.name] = s.rank; });
    }

    const photoMap = {};
    if (!state._tierDisablePhotos) state.players.forEach(p => { if (p.photo) photoMap[p.name] = p.photo; });

    const rows = standings.filter(s => s.games > 0).map((s, i) => {
      const top = i < 3 ? 'top' : '';
      const ptsTot = s.points + s.pointsAgainst;
      const ptsPctVal = ptsTot > 0 ? (s.points / ptsTot * 100).toFixed(1) + '%' : '—';
      const secCol = usePtsPct
        ? `<td>${ptsPctVal}</td>`
        : `<td>${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</td>`;

      let partHtml = '';
      if (hasParticipation) {
        if (s.participationPct === null || s.participationPct === undefined) {
          partHtml = `<td style="color:var(--muted);">—</td>`;
        } else {
          const eligible = s.participationPct >= minPct;
          const pctStr = Math.round(s.participationPct * 100) + '%';
          partHtml = `<td style="white-space:nowrap;">
            <span style="color:${eligible ? 'var(--green)' : 'var(--danger)'}; font-weight:600;">${pctStr}</span>
            <span title="${eligible ? 'Prize eligible' : 'Below minimum participation — ineligible for prizes'}"
              style="margin-left:3px; font-size:0.82rem;">${eligible ? '✓' : '✗'}</span>
          </td>`;
        }
      }

      let overallHtml = '';
      let movHtml = '';
      if (overallStandings) {
        const curOverall = overallRankMap[s.name] || null;
        overallHtml = `<td style="color:var(--muted);">${curOverall !== null ? curOverall : '—'}</td>`;

        const prevOverall = prevOverallRankMap[s.name] || null;
        if (curOverall === null) {
          movHtml = `<td style="color:var(--muted);">—</td>`;
        } else if (!prevOverall) {
          movHtml = `<td style="color:var(--muted); font-size:0.8rem;">new</td>`;
        } else {
          const delta = prevOverall - curOverall; // positive = moved up (lower rank number = better)
          if (delta > 0) {
            movHtml = `<td style="color:var(--green); font-weight:600;">▲${delta}</td>`;
          } else if (delta < 0) {
            movHtml = `<td style="color:var(--danger); font-weight:600;">▼${Math.abs(delta)}</td>`;
          } else {
            movHtml = `<td style="color:var(--muted);">—</td>`;
          }
        }
      }

      const avatar = state._tierDisablePhotos ? '' : `<img src="${playerPhotoSrc(s.name, photoMap[s.name], 24)}"
        style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0;">`;
      return `<tr>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" style="white-space:nowrap;">
          ${avatar}<span data-report-player="${esc(s.name)}" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px;" title="View player report">${esc(s.name)}</span>
        </td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        ${hasParticipation ? partHtml : ''}
        ${overallStandings ? overallHtml : ''}
        ${overallStandings ? movHtml : ''}
      </tr>`;
    });

    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th title="Average point differential per game — your average score minus your opponent&#39;s average score. Positive means you score more than your opponents on average; used as a tiebreaker when win percentage is equal." style="cursor:help;">Avg+/-</th>';
    const pctHeader = hasParticipation
      ? `<th title="(Games played + byes) / total league rounds. Min ${Math.round(minPct*100)}% for prize eligibility." style="cursor:help;">Partic.</th>`
      : '';
    const overallHeader = overallStandings
      ? `<th title="Overall season rank through this session" style="cursor:help;">Overall</th>`
      : '';
    const movHeader = overallStandings
      ? `<th title="Change in overall season rank vs. previous session" style="cursor:help;">±</th>`
      : '';
    return `<table class="compact-table">
      <thead><tr>
        <th>#</th><th>Player</th><th>W/L</th><th>Win%</th>
        ${secHeader}
        ${pctHeader}
        ${overallHeader}
        ${movHeader}
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  function renderLadderStandingsTable(standings, config, compact = false) {
    if (!standings || !standings.length) return '<p class="text-muted">No standings data yet.</p>';
    const cfg = config || {};
    const fmt = v => { const n = parseFloat(v) || 0; return n % 1 === 0 ? n.toFixed(0) : n.toFixed(1); };
    const attendPts = parseFloat(cfg.ladderAttendPts) || 0;
    const playPts   = parseFloat(cfg.ladderPlayPts)   || 0;
    const ranges = [1, 2, 3, 4, 5, 6].map(i => ({
      min: parseFloat(cfg[`ladderRange${i}Min`] ?? 0),
      max: parseFloat(cfg[`ladderRange${i}Max`] ?? 0),
      pts: parseFloat(cfg[`ladderRange${i}Pts`] ?? 0),
    }));
    // A range is active when max > min (also handles negative ranges)
    const activeRanges = ranges.map((r, i) => ({ ...r, idx: i })).filter(r => r.max > r.min);

    const rank1Pts = parseFloat(cfg.ladderRank1Pts) || 0;
    const rank2Pts = parseFloat(cfg.ladderRank2Pts) || 0;
    const rank3Pts = parseFloat(cfg.ladderRank3Pts) || 0;
    const hasRankBonus = !!(rank1Pts || rank2Pts || rank3Pts);

    const ladderPhotoMap = {};
    if (!state._tierDisablePhotos) state.players.forEach(p => { if (p.photo) ladderPhotoMap[p.name] = p.photo; });

    // ── Points legend ─────────────────────────────────────────
    const legendRows = [];
    if (attendPts) legendRows.push(`<tr><td>Attend a session</td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(attendPts)} pt${attendPts !== 1 ? 's' : ''}</td></tr>`);
    if (playPts)   legendRows.push(`<tr><td>Play any game</td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(playPts)} pt${playPts !== 1 ? 's' : ''}</td></tr>`);
    activeRanges.forEach((r, ci) => {
      const isUpset   = r.max < 0;
      const isFavored = r.min >= 0;
      const typeLabel = isUpset ? 'Upset win' : isFavored ? 'Favored win' : 'Win';
      legendRows.push(`<tr><td><strong>R${r.idx + 1}:</strong> ${typeLabel} <span style="color:var(--muted); font-size:0.78rem;">(rank adv ${r.min} to ${r.max})</span></td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(r.pts)} pt${r.pts !== 1 ? 's' : ''}</td></tr>`);
    });
    if (rank1Pts) legendRows.push(`<tr><td>🥇 Finish 1st in a session (win&nbsp;%)</td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(rank1Pts)} pt${rank1Pts !== 1 ? 's' : ''}</td></tr>`);
    if (rank2Pts) legendRows.push(`<tr><td>🥈 Finish 2nd in a session (win&nbsp;%)</td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(rank2Pts)} pt${rank2Pts !== 1 ? 's' : ''}</td></tr>`);
    if (rank3Pts) legendRows.push(`<tr><td>🥉 Finish 3rd in a session (win&nbsp;%)</td><td style="text-align:right; font-weight:600; color:var(--gold);">${fmt(rank3Pts)} pt${rank3Pts !== 1 ? 's' : ''}</td></tr>`);
    const legendHtml = legendRows.length ? `
      <details style="margin-bottom:14px;">
        <summary class="card-header collapsible-header" style="list-style:none; cursor:pointer; display:flex;
          align-items:center; justify-content:space-between; background:rgba(255,255,255,0.04);
          border-radius:6px; padding:7px 12px; user-select:none;">
          <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--muted);">Points Legend</span>
          <span class="collapse-arrow" style="font-size:0.72rem; color:var(--green); opacity:0.6;">▼</span>
        </summary>
        <div style="padding:10px 12px 4px; display:inline-block; min-width:260px;">
          <table style="font-size:0.82rem; border-collapse:collapse; width:100%;">
            <tbody>${legendRows.join('')}</tbody>
          </table>
        </div>
      </details>` : '';

    const rows = standings.map((s, i) => {
      const top = i < 3 ? 'top' : '';
      let rangeCols = activeRanges.map(r =>
        `<td style="text-align:center;">${fmt(s.rangePts[r.idx])}</td>`
      ).join('');
      const rankBonusCol = hasRankBonus
        ? `<td style="text-align:center;">${fmt(s.sessionRankPts || 0)}</td>`
        : '';
      const avatar = state._tierDisablePhotos ? '' : `<img src="${playerPhotoSrc(s.name, ladderPhotoMap[s.name], 24)}"
        style="width:24px;height:24px;border-radius:50%;object-fit:cover;vertical-align:middle;margin-right:6px;flex-shrink:0;">`;
      return `<tr>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" style="white-space:nowrap;">
          ${avatar}<span data-report-player="${esc(s.name)}" style="cursor:pointer; text-decoration:underline; text-decoration-style:dotted; text-underline-offset:3px;" title="View player report">${esc(s.name)}</span>
        </td>
        <td style="text-align:center; font-weight:600; color:var(--gold);">${fmt(s.totalPts)}</td>
        <td style="text-align:center;">${fmt(s.attendPts)}</td>
        <td style="text-align:center;">${fmt(s.playPts)}</td>
        ${rangeCols}${rankBonusCol}
      </tr>`;
    });

    const rangeHeaders = activeRanges.map(r => {
      const isUpset   = r.max < 0;
      const isFavored = r.min >= 0;
      const typeLabel = isUpset ? 'Upset' : isFavored ? 'Favored' : 'Win';
      return `<th title="${typeLabel} win: rank advantage ${r.min} to ${r.max} → ${fmt(r.pts)} pts each" style="cursor:help; text-align:center;">R${r.idx+1}</th>`;
    }).join('');
    const rankBonusHeader = hasRankBonus
      ? `<th style="text-align:center;" title="Session ranking bonus (1st/2nd/3rd by win %)">S.Rnk</th>`
      : '';

    return `${legendHtml}<table class="compact-table">
      <thead><tr>
        <th>#</th><th>Player</th>
        <th style="text-align:center;" title="Total ladder points">Total</th>
        <th style="text-align:center;" title="Points for attending sessions">Attend</th>
        <th style="text-align:center;" title="Points for playing games">Play</th>
        ${rangeHeaders}${rankBonusHeader}
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  // ── Player Report ──────────────────────────────────────────
  function renderPlayerReportSelect() {
    const sel = document.getElementById('report-player-select');
    sel.innerHTML = '<option value="">— Select Player —</option>';
    state.players.filter(p => p.active === true && p.role !== 'spectator' && p.role !== 'sub').forEach(p => {
      const o = document.createElement('option');
      o.value = p.name; o.textContent = p.name;
      sel.appendChild(o);
    });
  }

  function renderPlayerReport(playerName) {
    if (!playerName) { document.getElementById('player-report-content').innerHTML = ''; return; }
    const report = Reports.computePlayerReport(playerName, state.scores, state.standings);
    document.getElementById('player-report-content').innerHTML = buildPlayerReportHTML(report);
  }

  // ── Edit Pairing Form ─────────────────────────────────────
  function renderEditPairingForm() {
    // Populate datalist with active player names
    const dl = document.getElementById('ep-player-list');
    if (!dl) return;
    dl.innerHTML = state.players
      .filter(p => p.active === true)
      .map(p => `<option value="${esc(p.name)}">`)
      .join('');

    // Populate court select with named courts
    const courtSel = document.getElementById('ep-court');
    if (courtSel) {
      const numCourts = parseInt(state.config.courts || 3);
      courtSel.innerHTML = '';
      for (let cn = 1; cn <= numCourts; cn++) {
        const opt = document.createElement('option');
        opt.value = String(cn);
        opt.textContent = courtName(cn);
        courtSel.appendChild(opt);
      }
    }

    // Default week to current pair week
    const weekEl = document.getElementById('ep-week');
    if (weekEl && !weekEl.value) weekEl.value = state.currentPairWeek;
  }

  function setupEditPairing() {
    const weekEl  = document.getElementById('ep-week');
    const roundEl = document.getElementById('ep-round');
    const courtEl = document.getElementById('ep-court');
    const typeEl  = document.getElementById('ep-type');
    const fields  = document.getElementById('ep-fields');
    if (!weekEl) return;

    // Load button — find existing pairing and fill fields
    document.getElementById('btn-ep-load').addEventListener('click', () => {
      const week  = parseInt(weekEl.value);
      const round = parseInt(roundEl.value);
      const court = String(courtEl.value).trim();
      if (!week || !round || !court) { toast('Enter week, round, and court first.', 'warn'); return; }

      const existing = state.pairings.find(p =>
        parseInt(p.week) === week &&
        parseInt(p.round) === round &&
        String(p.court) === court
      );

      if (existing) {
        // Preserve tourn-game type — don't allow changing it via the selector
        const isTournGame = existing.type === 'tourn-game';
        if (isTournGame) {
          typeEl.value = 'game'; // selector default (hidden)
          typeEl.dataset.override = 'tourn-game';
          typeEl.disabled = true;
          typeEl.title = 'Tournament game type is preserved automatically';
          const typeGroup = typeEl.closest('.form-group');
          if (typeGroup) {
            let lbl = typeGroup.querySelector('.tourn-type-note');
            if (!lbl) {
              lbl = document.createElement('div');
              lbl.className = 'tourn-type-note';
              lbl.style.cssText = 'font-size:0.72rem; color:var(--gold); margin-top:4px;';
              lbl.textContent = '⚠ Tournament game — type locked';
              typeGroup.appendChild(lbl);
            }
          }
        } else {
          typeEl.value = existing.type || 'game';
          typeEl.disabled = false;
          delete typeEl.dataset.override;
          const lbl = typeEl.closest('.form-group')?.querySelector('.tourn-type-note');
          if (lbl) lbl.remove();
        }
        document.getElementById('ep-p1').value = existing.p1 || '';
        document.getElementById('ep-p2').value = existing.p2 || '';
        document.getElementById('ep-p3').value = existing.p3 || '';
        document.getElementById('ep-p4').value = existing.p4 || '';
      } else {
        typeEl.value = 'game';
        typeEl.disabled = false;
        delete typeEl.dataset.override;
        const existingNote = typeEl.closest('.form-group')?.querySelector('.tourn-type-note');
        if (existingNote) existingNote.remove();
        ['ep-p1','ep-p2','ep-p3','ep-p4'].forEach(id => {
          document.getElementById(id).value = '';
        });
        toast(`No existing pairing found for Session ${week} Round ${round} Court ${court} — fill in to create new.`, 'warn');
      }

      // Populate existing score if one exists for this slot
      const existingScore = state.scores.find(s =>
        parseInt(s.week) === week && parseInt(s.round) === round && String(s.court) === court
      );
      const scoreRow = document.getElementById('ep-score-row');
      if (existingScore && existingScore.score1 !== '' && existingScore.score1 !== null &&
          existingScore.score2 !== '' && existingScore.score2 !== null) {
        document.getElementById('ep-score1').value = existingScore.score1;
        document.getElementById('ep-score2').value = existingScore.score2;
        if (scoreRow) scoreRow.style.display = '';
      } else {
        document.getElementById('ep-score1').value = '';
        document.getElementById('ep-score2').value = '';
        if (scoreRow) scoreRow.style.display = 'none';
      }

      fields.classList.remove('hidden');
    });

    // Save button
    document.getElementById('btn-ep-save').addEventListener('click', async () => {
      const week  = parseInt(weekEl.value);
      const round = parseInt(roundEl.value);
      const court = String(courtEl.value).trim();
      const type  = typeEl.dataset.override || typeEl.value;
      const p1 = document.getElementById('ep-p1').value.trim();
      const p2 = document.getElementById('ep-p2').value.trim();
      const p3 = document.getElementById('ep-p3').value.trim();
      const p4 = document.getElementById('ep-p4').value.trim();

      if (!week || !round || !court) { toast('Week, round, and court are required.', 'warn'); return; }
      if (!p1) { toast('Player 1 is required.', 'warn'); return; }
      if (type === 'game' && !p3) { toast('Player 3 is required for a game.', 'warn'); return; }

      // Remove existing entry for this slot, then add new one
      state.pairings = state.pairings.filter(p =>
        !(parseInt(p.week) === week && parseInt(p.round) === round && String(p.court) === court)
      );
      const newPairing = { week, round, court, p1, p2, p3, p4, type };
      state.pairings.push(newPairing);
      state.pairings.sort((a, b) => parseInt(a.week) - parseInt(b.week) || parseInt(a.round) - parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, { numeric: true }));

      // Build full week pairings sorted by round then court to preserve display order
      const weekPairings = state.pairings
        .filter(p => parseInt(p.week) === week)
        .sort((a, b) => parseInt(a.round) - parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, { numeric: true }));

      showLoading(true);
      try {
        await API.savePairings(week, weekPairings);
        toast(`Pairing saved — Session ${week} Round ${round} Court ${court}.`);
        renderPairingsPreview();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Delete button
    document.getElementById('btn-ep-delete').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot delete pairings.', 'warn'); return; }
      const week  = parseInt(weekEl.value);
      const round = parseInt(roundEl.value);
      const court = String(courtEl.value).trim();
      if (!confirm(`Delete pairing for Session ${week} Round ${round} Court ${court}?`)) return;

      state.pairings = state.pairings.filter(p =>
        !(parseInt(p.week) === week && parseInt(p.round) === round && String(p.court) === court)
      );
      state.pairings.sort((a, b) => parseInt(a.week) - parseInt(b.week) || parseInt(a.round) - parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, { numeric: true }));
      const weekPairings = state.pairings
        .filter(p => parseInt(p.week) === week);

      showLoading(true);
      try {
        await API.savePairings(week, weekPairings);
        toast('Pairing deleted.');
        document.getElementById('ep-fields').classList.add('hidden');
        ['ep-p1','ep-p2','ep-p3','ep-p4'].forEach(id => {
          document.getElementById(id).value = '';
        });
        renderPairingsPreview();
      } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });
  }

  // ── Shared bracket renderer ───────────────────────────────
  // Builds bracket HTML from pairings + scores.
  // seeds: array of { seed, name, name2 } for labelling (optional)
  // highlightPlayer: name to highlight in green border (optional)
  function buildBracketHTML(weekPairings, scores, week, seeds, highlightPlayer) {
    const lockedRounds = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a,b)=>a-b);
    if (!lockedRounds.length) return '<p class="text-muted">No rounds played yet.</p>';

    // Build seed lookup from provided seeds array
    // If no seeds provided, derive from round 1 pairing order
    const seedMap = {}; // name -> { seed, name2 }
    if (seeds && seeds.length) {
      seeds.forEach(s => {
        seedMap[s.name] = s;
        if (s.name2) seedMap[s.name2] = s;
      });
    } else {
      // Derive seeds from round 1 game order: game 1 team1=seed1, team2=seed2, game 2 team1=seed3 etc.
      const r1games = weekPairings
        .filter(p => parseInt(p.round) === lockedRounds[0] && (p.type === 'game' || p.type === 'tourn-game'))
        .sort((a,b) => String(a.court).localeCompare(String(b.court), undefined, {numeric:true}));
      // Also include byes — top seeds get byes in round 1
      const r1byes = weekPairings.filter(p => parseInt(p.round) === lockedRounds[0] && p.type === 'bye');
      let seed = 1;
      // Bye recipients are top seeds
      r1byes.forEach(b => {
        if (b.p1 && !seedMap[b.p1]) { seedMap[b.p1] = { seed, name: b.p1, name2: b.p2 || '' }; seed++; }
      });
      r1games.forEach(g => {
        if (g.p1 && !seedMap[g.p1]) { seedMap[g.p1] = { seed, name: g.p1, name2: g.p2 || '' }; seed++; }
        if (g.p3 && !seedMap[g.p3]) { seedMap[g.p3] = { seed, name: g.p3, name2: g.p4 || '' }; seed++; }
      });
    }

    function getSeed(name) {
      const s = seedMap[name];
      return s ? `<span style="font-size:0.7rem; color:var(--muted);">#${s.seed}</span> ` : '';
    }

    function teamLabel(p1, p2) {
      return `${getSeed(p1)}${p2 ? esc(p1) + ' <span style="color:var(--muted);">&amp;</span> ' + esc(p2) : esc(p1)}`;
    }

    let html = `<div style="overflow-x:auto; padding-bottom:8px;">
      <div style="display:flex; gap:0; min-width:fit-content;">`;

    lockedRounds.forEach((r, ri) => {
      const roundGames = weekPairings.filter(g => g.round === r && (g.type === 'game' || g.type === 'tourn-game'));
      const roundByes  = weekPairings.filter(g => g.round === r && g.type === 'bye');
      const isLast     = ri === lockedRounds.length - 1;

      html += `<div style="display:flex; flex-direction:column; min-width:210px;">
        <div style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase;
                    letter-spacing:0.05em; padding:4px 8px; margin-bottom:6px; text-align:center;">
          Round ${r}
        </div>`;

      roundGames.forEach(g => {
        const score = scores.find(s =>
          parseInt(s.week) === week && parseInt(s.round) === r &&
          String(s.court) === String(g.court)
        );
        const s1 = score ? score.score1 : '';
        const s2 = score ? score.score2 : '';
        const scored = s1 !== '' && s1 !== null && s2 !== '' && s2 !== null;
        const t1win  = scored && parseInt(s1) > parseInt(s2);
        const isMe1  = highlightPlayer && [g.p1, g.p2].includes(highlightPlayer);
        const isMe2  = highlightPlayer && [g.p3, g.p4].includes(highlightPlayer);
        const winStyle  = 'color:var(--green); font-weight:700;';
        const loseStyle = 'color:rgba(255,255,255,0.35);';
        const defStyle  = 'color:var(--white);';
        const t1style = scored ? (t1win ? winStyle : loseStyle) : (isMe1 ? 'color:var(--white); font-weight:700;' : defStyle);
        const t2style = scored ? (!t1win ? winStyle : loseStyle) : (isMe2 ? 'color:var(--white); font-weight:700;' : defStyle);
        const score1Html = scored
          ? `<span style="font-size:0.82rem; font-weight:700; color:${t1win ? 'var(--green)' : 'rgba(255,255,255,0.5)'}; min-width:22px; text-align:right;">${s1}</span>`
          : `<span style="font-size:0.72rem; color:var(--muted); min-width:22px; text-align:right;">—</span>`;
        const score2Html = scored
          ? `<span style="font-size:0.82rem; font-weight:700; color:${!t1win ? 'var(--green)' : 'rgba(255,255,255,0.5)'}; min-width:22px; text-align:right;">${s2}</span>`
          : `<span style="font-size:0.72rem; color:var(--muted); min-width:22px; text-align:right;">—</span>`;
        const border = (isMe1 || isMe2)
          ? 'border:1px solid rgba(94,194,106,0.4);'
          : 'border:1px solid rgba(255,255,255,0.08);';

        html += `<div style="background:var(--card-bg); ${border} border-radius:8px; padding:7px 10px; margin:2px 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="${t1style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">
              ${teamLabel(g.p1, g.p2)}
            </div>
            <div style="margin-left:6px; flex-shrink:0;">${score1Html}</div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06); margin:3px 0;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <div style="${t2style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">
              ${teamLabel(g.p3, g.p4)}
            </div>
            <div style="margin-left:6px; flex-shrink:0;">${score2Html}</div>
          </div>
        </div>`;
      });

      roundByes.forEach(g => {
        html += `<div style="background:rgba(122,155,181,0.07); border:1px dashed rgba(255,255,255,0.1);
                    border-radius:8px; padding:7px 10px; margin:2px 4px;">
          <div style="font-size:0.7rem; color:var(--muted); margin-bottom:2px;">⏸ BYE</div>
          <div style="font-size:0.8rem; color:var(--white);">${teamLabel(g.p1, g.p2)}</div>
        </div>`;
      });

      html += `</div>`;
      if (!isLast) {
        html += `<div style="display:flex; align-items:center; padding:0 2px; color:rgba(255,255,255,0.2); font-size:1.2rem;">›</div>`;
      }
    });

    html += `</div></div>`;

    // Champion banner — only show when the tournament is truly complete
    // (every team except the winner has been eliminated).
    const lastRound = lockedRounds[lockedRounds.length - 1];
    const lastGames = weekPairings.filter(g => g.round === lastRound && (g.type === 'game' || g.type === 'tourn-game'));

    // Determine whether all teams except one have been eliminated.
    // When seeds are available (active tournament), use the seed state directly.
    // Otherwise derive from scored games: count losses per team and check that
    // only 1 team remains below the elimination threshold (1 for single-elim,
    // 2 for double-elim — inferred from the highest loss count seen).
    function isTournamentDone() {
      if (seeds) return seeds.filter(s => !s.eliminated).length === 1;
      const lossMap = {};
      const teamKeys = new Set();
      weekPairings.filter(g => g.type === 'tourn-game' || g.type === 'game').forEach(g => {
        const k1 = g.p1 + (g.p2 ? '|' + g.p2 : '');
        const k2 = g.p3 + (g.p4 ? '|' + g.p4 : '');
        if (g.p1) teamKeys.add(k1);
        if (g.p3) teamKeys.add(k2);
        const sc = scores.find(s => parseInt(s.week) === week && parseInt(s.round) === parseInt(g.round) && String(s.court) === String(g.court));
        if (!sc || sc.score1 === '' || sc.score1 === null) return;
        const loser = parseInt(sc.score1) > parseInt(sc.score2) ? k2 : k1;
        lossMap[loser] = (lossMap[loser] || 0) + 1;
      });
      const maxLosses = Math.max(0, ...Object.values(lossMap));
      const threshold = maxLosses >= 2 ? 2 : 1;
      return [...teamKeys].filter(k => (lossMap[k] || 0) < threshold).length === 1;
    }

    if (lastGames.length === 1 && isTournamentDone()) {
      const fg = lastGames[0];
      const fs = scores.find(s => parseInt(s.week) === week && parseInt(s.round) === lastRound && String(s.court) === String(fg.court));
      if (fs && fs.score1 !== '' && fs.score1 !== null && fs.score2 !== '' && fs.score2 !== null) {
        const t1win = parseInt(fs.score1) > parseInt(fs.score2);
        const cP1 = t1win ? fg.p1 : fg.p3;
        const cP2 = t1win ? fg.p2 : fg.p4;
        const champName = cP2 ? `${esc(cP1)} &amp; ${esc(cP2)}` : esc(cP1);
        const isMe = highlightPlayer && [cP1, cP2].includes(highlightPlayer);
        const photosOn = !state._tierDisablePhotos;
        const champAvatars = photosOn ? [cP1, cP2].filter(Boolean).map(name => {
          const photo = state.players.find(p => p.name === name)?.photo || '';
          return `<img src="${playerPhotoSrc(name, photo, 64)}"
            style="width:64px;height:64px;border-radius:50%;object-fit:cover;
                   border:2px solid rgba(245,200,66,0.6);">`;
        }).join('') : '';
        html += `<div style="margin-top:16px; padding:14px 16px;
          background:linear-gradient(135deg, rgba(245,200,66,0.15), rgba(245,200,66,0.05));
          border:1px solid rgba(245,200,66,0.4); border-radius:10px; text-align:center;">
          <div style="font-size:1.1rem; color:var(--gold); font-weight:700; margin-bottom:${photosOn ? '10px' : '4px'};">🏆 Tournament Champion</div>
          ${photosOn ? `<div style="display:flex;justify-content:center;gap:10px;margin-bottom:8px;">${champAvatars}</div>` : ''}
          <div style="font-size:1rem; color:${isMe ? 'var(--green)' : 'var(--white)'}; font-weight:700;">${champName}</div>
          <div style="font-size:0.78rem; color:var(--muted); margin-top:4px;">Final: ${fs.score1} – ${fs.score2}</div>
        </div>`;
      }
    }

    return html;
  }

  // ── Admin Tournament Results page ─────────────────────────
  function renderAdminTournamentResults() {
    const week = state.currentTournWeek || state.currentSheetWeek;
    state.currentTournWeek = week;
    document.getElementById('tourn-week-label').textContent = `Session ${week}`;

    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const isTournament = weekPairings.some(p => p.type === 'tourn-game');
    const el = document.getElementById('admin-tourn-bracket');

    if (!isTournament) {
      el.innerHTML = '<p class="text-muted">No tournament data for this session.</p>';
      return;
    }

    // Use seeds from active tournament state if available, else derive from pairings
    const seeds = state.tournaments[week] ? state.tournaments[week].seeds : null;
    const weekScores = state.scores.filter(s => parseInt(s.week) === week);
    el.innerHTML = buildBracketHTML(weekPairings, weekScores, week, seeds, null);
  }

  // ── Tournament ────────────────────────────────────────────
  function renderTournamentStatus() {
    const t = state.tournaments[state.currentPairWeek];
    if (!t) return;
    const el = document.getElementById('tourn-status');
    if (!el) return;

    const week = t.week;
    const modeLabel = t.mode === 'rr'         ? 'Round Robin Doubles (Reseeded)'
                   : t.mode === 'rr-singles' ? 'Round Robin Singles (Reseeded)'
                   : t.mode === 'double'     ? 'Double Elimination' : 'Single Elimination';

    // RR mode: bracket view for current pairings + collapsible standings table
    if ((t.mode === 'rr' || t.mode === 'rr-singles') && t.rrSeeds) {
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === t.week);
      const weekScores   = state.scores.filter(s => parseInt(s.week) === t.week);

      // Recompute live standings by replaying locked rounds
      const liveSeeds = t.rrSeeds.map(s => ({ ...s, wins: 0, losses: 0, byes: 0 }));
      const lockedRounds = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a,b)=>a-b);
      lockedRounds.forEach(r => {
        weekPairings.filter(p => parseInt(p.round) === r).forEach(p => {
          if (p.type === 'tourn-bye' || p.type === 'bye') {
            const pl = liveSeeds.find(s => s.name === p.p1); if (pl) pl.byes++; return;
          }
          const sc = weekScores.find(s => parseInt(s.round) === r && String(s.court) === String(p.court));
          if (!sc || sc.score1 === '' || sc.score1 === null) return;
          const t1win = parseInt(sc.score1) > parseInt(sc.score2);
          [p.p1, p.p2].filter(Boolean).forEach(n => { const pl = liveSeeds.find(s => s.name === n); if (pl) { if (t1win) pl.wins++; else pl.losses++; } });
          [p.p3, p.p4].filter(Boolean).forEach(n => { const pl = liveSeeds.find(s => s.name === n); if (pl) { if (!t1win) pl.wins++; else pl.losses++; } });
        });
      });
      liveSeeds.sort((a, b) => b.wins !== a.wins ? b.wins - a.wins : a.seed - b.seed);

      // Build seed array for buildBracketHTML using each player's initial tournament seed
      const rrSeedsForBracket = t.rrSeeds.map(s => ({ seed: s.seed, name: s.name, name2: '' }));

      let rrHtml = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:8px;">${modeLabel} · Session ${t.week} · Round ${t.round}</div>`;

      // Bracket-style pairings (same format as elimination modes)
      if (weekPairings.length) {
        rrHtml += buildBracketHTML(weekPairings, weekScores, week, rrSeedsForBracket, null);
      } else {
        rrHtml += '<p class="text-muted" style="font-size:0.82rem;">No rounds locked yet.</p>';
      }

      // Collapsible standings table
      rrHtml += `<details style="margin-top:10px;">
        <summary style="font-size:0.78rem; color:var(--muted); cursor:pointer; user-select:none;">
          Tournament Standings
        </summary>
        <table style="font-size:0.82rem; width:100%; margin-top:6px; border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:4px 8px;color:var(--muted);font-weight:500;">#</th>
            <th style="text-align:left;padding:4px 8px;color:var(--muted);font-weight:500;">Player</th>
            <th style="text-align:center;padding:4px 8px;color:var(--muted);font-weight:500;">W</th>
            <th style="text-align:center;padding:4px 8px;color:var(--muted);font-weight:500;">L</th>
            <th style="text-align:center;padding:4px 8px;color:var(--muted);font-weight:500;">Bye</th>
          </tr></thead><tbody>`;
      liveSeeds.forEach((s, i) => {
        const gold = i === 0 && s.wins > 0;
        rrHtml += `<tr style="${gold ? 'color:var(--gold);font-weight:700;' : ''}">
          <td style="padding:4px 8px;">${i + 1}</td>
          <td style="padding:4px 8px;">${esc(s.name)}</td>
          <td style="padding:4px 8px;text-align:center;">${s.wins}</td>
          <td style="padding:4px 8px;text-align:center;">${s.losses}</td>
          <td style="padding:4px 8px;text-align:center;">${s.byes}</td>
        </tr>`;
      });
      rrHtml += `</tbody></table></details>`;

      el.innerHTML = rrHtml;
      return;
    }

    // Helper: get seed label for a player name
    function getSeed(name) {
      const s = t.seeds.find(s => s.name === name || s.name2 === name);
      if (!s) return '';
      return s.name2 ? `#${s.seed}` : `#${s.seed}`;
    }

    function teamLabel(p1, p2) {
      const seed = getSeed(p1);
      const names = p2 ? `${esc(p1)} &amp; ${esc(p2)}` : esc(p1);
      return `<span style="font-size:0.7rem; color:var(--muted);">${seed}</span> ${names}`;
    }

    // Collect all rounds that have been locked (exist in state.pairings for this week)
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const lockedRounds = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a,b)=>a-b);

    // Separate winners and losers bracket games
    const wGames = []; // { round, p1,p2,p3,p4, score1,score2, winner }
    const lGames = [];
    const byes   = [];

    weekPairings.forEach(p => {
      const score = state.scores.find(s =>
        parseInt(s.week) === week && parseInt(s.round) === parseInt(p.round) &&
        String(s.court) === String(p.court)
      );
      const s1 = score ? score.score1 : '';
      const s2 = score ? score.score2 : '';
      const scored = s1 !== '' && s1 !== null && s2 !== '' && s2 !== null;
      const t1win  = scored && parseInt(s1) > parseInt(s2);
      const entry  = { round: parseInt(p.round), p1:p.p1, p2:p.p2, p3:p.p3, p4:p.p4,
                       score1:s1, score2:s2, scored, t1win, court: p.court };
      if (p.type === 'bye') {
        byes.push(entry);
      } else {
        wGames.push(entry);
      }
    });

    if (!lockedRounds.length && !t.seeds.length) {
      el.innerHTML = '';
      return;
    }

    // ── Bracket diagram ──────────────────────────────────────
    // One column per round, match boxes stacked vertically
    const allRounds = lockedRounds.length ? lockedRounds : [];
    // Add pending round label if not yet locked
    const pendingRound = t.round;
    const displayRounds = allRounds.includes(pendingRound) ? allRounds
      : [...allRounds, pendingRound];

    let html = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:8px;">
      ${modeLabel} · Session ${week} · Current Round: ${t.round}
    </div>`;

    // Status summary badges
    const active   = t.seeds.filter(s => !s.eliminated);
    const inW      = active.filter(s => !s.inLosersBracket);
    const inL      = active.filter(s => s.inLosersBracket);
    html += `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <span style="background:rgba(94,194,106,0.15); color:var(--green); border-radius:4px; padding:2px 8px; font-size:0.75rem;">
        🏆 Winners: ${inW.length}
      </span>
      ${t.mode === 'double' && inL.length ? `<span style="background:rgba(245,200,66,0.15); color:var(--gold); border-radius:4px; padding:2px 8px; font-size:0.75rem;">⚡ Losers: ${inL.length}</span>` : ''}
      <span style="background:rgba(255,255,255,0.06); color:var(--muted); border-radius:4px; padding:2px 8px; font-size:0.75rem;">
        Eliminated: ${t.seeds.filter(s=>s.eliminated).length}
      </span>
    </div>`;

    // Build bracket using shared renderer
    if (allRounds.length) {
      html += buildBracketHTML(weekPairings, state.scores, week, t.seeds, null);
    }

    // ── Seed reference table ──────────────────────────────────
    html += `<details style="margin-top:10px;">
      <summary style="font-size:0.78rem; color:var(--muted); cursor:pointer; user-select:none;">
        Seed Reference
      </summary>
      <table style="font-size:0.75rem; width:100%; margin-top:6px;">
        <thead><tr><th>Seed</th><th>Team</th><th>Status</th><th>W</th><th>L</th></tr></thead>
        <tbody>`;
    t.seeds.forEach(s => {
      const status = s.eliminated
        ? `<span style="color:var(--danger);">Out</span>`
        : s.inLosersBracket
          ? `<span style="color:var(--gold);">Losers</span>`
          : `<span style="color:var(--green);">Winners</span>`;
      const w = s.wBracketWins + s.lBracketWins;
      const l = s.wBracketLosses + s.lBracketLosses;
      const name = s.name2 ? `${esc(s.name)} &amp; ${esc(s.name2)}` : esc(s.name);
      html += `<tr>
        <td>#${s.seed}</td>
        <td style="font-weight:600;">${name}</td>
        <td>${status}</td>
        <td>${w}</td><td>${l}</td>
      </tr>`;
    });
    html += `</tbody></table></details>`;

    el.innerHTML = html;
  }

  function setupTournament() {
    const genBtn  = document.getElementById('btn-tourn-generate');
    const advBtn  = document.getElementById('btn-tourn-advance');
    const lockBtn = document.getElementById('btn-tourn-lock');
    const resetBtn = document.getElementById('btn-tourn-reset');
    if (!genBtn) return;

    genBtn.addEventListener('click', () => {
      const week   = state.currentPairWeek;
      const mode   = document.getElementById('tourn-mode').value;
      const courts = parseInt(state.config.courts || 3);

      const presentPlayers = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        })
        .map(p => p.name);

      const gameMode = state.config.gameMode || 'doubles';
      // rr-singles forces singles regardless of league gameMode
      const doubles       = mode === 'rr-singles' ? false : (gameMode !== 'singles' && gameMode !== 'fixed-pairs');
      const mixedDoubles  = doubles && gameMode === 'mixed-doubles';

      if (presentPlayers.length < 2) {
        toast('Need at least 2 present players for a tournament.', 'warn'); return;
      }

      // Doubles (elimination or RR) requires an even number of players
      if (doubles && (mode === 'single' || mode === 'double' || mode === 'rr') && presentPlayers.length % 2 !== 0) {
        toast(
          `Doubles tournament requires an even number of players. ` +
          `You currently have ${presentPlayers.length} marked present. ` +
          `Please mark one more player as present, or mark one as absent, then try again.`,
          'warn'
        );
        return;
      }

      const existing = state.pairings.filter(p => parseInt(p.week) === week);
      if (existing.length && !confirm(`Session ${week} already has pairings. Replace with tournament bracket?`)) return;
      const result = Tournament.generateTournament(presentPlayers, courts, week, mode, state.standings, doubles, state.players, mixedDoubles);
      if (result.error) { toast(result.error, 'error'); return; }

      // Build tournament state — RR modes use rrSeeds; elimination modes use seeds
      const tournState = { week, mode, round: 1, doubles };
      if (result.rrSeeds) {
        tournState.rrSeeds    = result.rrSeeds;
        tournState.mixedDoubles = mixedDoubles;
      } else {
        tournState.seeds = result.seeds;
      }
      state.tournaments[week] = tournState;
      state.pendingPairings = result.pairings;
      document.getElementById('btn-lock-pairings').disabled = false;
      if (lockBtn) lockBtn.classList.remove('hidden');
      document.getElementById('optimizer-status').classList.add('hidden');
      renderPairingsPreview();

      const modeLabels = { single: 'Single elimination', double: 'Double elimination', rr: 'Round robin doubles', 'rr-singles': 'Round robin singles' };
      toast(`${modeLabels[mode] || 'Tournament'} bracket generated for ${presentPlayers.length} players.`);
    });

    advBtn.addEventListener('click', async () => {
      const week = state.currentPairWeek;
      const t = state.tournaments[week];
      if (!t) return;

      // Check all games in current round have scores
      const roundPairings = state.pairings.filter(p =>
        parseInt(p.week) === week && parseInt(p.round) === t.round && (p.type === 'game' || p.type === 'tourn-game')
      );
      const roundScores = state.scores.filter(s => parseInt(s.week) === week && parseInt(s.round) === t.round);
      const unscoredGames = roundPairings.filter(game =>
        !roundScores.find(s => String(s.court) === String(game.court) &&
          s.score1 !== '' && s.score2 !== '' && s.score1 !== null && s.score2 !== null)
      );

      if (unscoredGames.length) {
        if (!confirm(`${unscoredGames.length} game(s) in round ${t.round} have no scores. Advance anyway? Those players will be treated as tied.`)) return;
      }

      if (t.mode === 'rr' || t.mode === 'rr-singles') {
        const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
        const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
        const rrResult = Tournament.advanceRoundRR(
          t.rrSeeds, weekPairings, weekScores, t.round,
          parseInt(state.config.courts || 3), week, t.doubles,
          t.mixedDoubles, state.players
        );
        t.rrSeeds = rrResult.rrSeeds;
        t.round++;
        state.pendingPairings = rrResult.pairings;
        document.getElementById('btn-lock-pairings').disabled = false;
        if (lockBtn) lockBtn.classList.remove('hidden');
        renderPairingsPreview();
        toast(`Round ${t.round} ready — review and lock to save.`);
        return;
      }

      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
      const result = Tournament.advanceTournament(t.seeds, roundScores, t.round, parseInt(state.config.courts || 3), week, t.mode, weekPairings);

      t.seeds = result.seeds;

      if (result.done) {
        delete state.tournaments[week];
        const msg = result.champion ? `🏆 Tournament complete! Champion: ${result.champion}` : '🏆 Tournament complete!';
        toast(msg);
        const statusEl = document.getElementById('tourn-status');
        if (statusEl) statusEl.innerHTML = `<div style="font-size:1rem; color:var(--gold); font-weight:700; padding:8px 0;">${esc(msg)}</div>`;
        advBtn.classList.add('hidden');
        resetBtn.classList.add('hidden');
        if (lockBtn) lockBtn.classList.add('hidden');
        renderPairingsPreview();
        return;
      }

      t.round++;
      // Keep tourn- types in pendingPairings for display/advance logic,
      // they get normalized to game/bye at lock time
      state.pendingPairings = result.pairings;
      document.getElementById('btn-lock-pairings').disabled = false;
      if (lockBtn) lockBtn.classList.remove('hidden');
      renderPairingsPreview();
      toast(`Round ${t.round} bracket ready — review and lock to save.`);
    });

    lockBtn?.addEventListener('click', () => {
      // Trigger the main lock & save button — identical behaviour
      document.getElementById('btn-lock-pairings').click();
      lockBtn.classList.add('hidden');
    });

    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset tournament? This clears tournament tracking but keeps existing pairings.')) return;
      delete state.tournaments[state.currentPairWeek];
      state.pendingPairings = null;
      advBtn.classList.add('hidden');
      resetBtn.classList.add('hidden');
      if (lockBtn) lockBtn.classList.add('hidden');
      const statusEl = document.getElementById('tourn-status');
      if (statusEl) statusEl.innerHTML = '';
      renderPairingsPreview();
      // Re-enable generate bracket and format dropdown after explicit reset
      const tournGenBtn = document.getElementById('btn-tourn-generate');
      const tournModeEl = document.getElementById('tourn-mode');
      if (tournGenBtn) tournGenBtn.disabled = false;
      if (tournModeEl) tournModeEl.disabled = false;
      toast('Tournament reset.');
    });
  }

  // ── Events ─────────────────────────────────────────────────
  function wireEditLimits() {
    document.querySelectorAll('[data-edit-limits]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lid = btn.dataset.editLimits;
        const cur = JSON.parse(btn.dataset.limits || '{}');
        const leagueName = btn.dataset.leagueName || lid;
        const intOrEmpty = v => (v !== null && v !== undefined && v !== '') ? String(v) : '';

        document.getElementById('limits-modal-league').textContent = leagueName;
        // Populate tier dropdown from TIERS constant in settings.js
        const tierSel = document.getElementById('lim-tier');
        tierSel.innerHTML = '<option value="">(no tier)</option>' +
          (typeof TIERS !== 'undefined' ? TIERS : [])
            .map(t => `<option value="${esc(t.version)}">${esc(t.version)}</option>`)
            .join('');
        tierSel.value = cur.tier || '';
        document.getElementById('lim-expiry').value   = intOrEmpty(cur.expiryDays);
        document.getElementById('lim-players').value  = intOrEmpty(cur.maxPlayers);
        document.getElementById('lim-courts').value   = intOrEmpty(cur.maxCourts);
        document.getElementById('lim-rounds').value   = intOrEmpty(cur.maxRounds);
        document.getElementById('lim-sessions').value = intOrEmpty(cur.maxSessions);
        document.getElementById('lim-customer').value = cur.customerId || '';

        // Replace save button to remove stale listeners
        const saveBtn = document.getElementById('lim-save-btn');
        const newSave = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSave, saveBtn);
        newSave.addEventListener('click', async () => {
          const parse = id => {
            const v = document.getElementById(id).value.trim();
            return v === '' ? null : parseInt(v);
          };
          const custId = document.getElementById('lim-customer').value.trim();
          const tierVal = document.getElementById('lim-tier').value.trim();
          const limits = {
            tier:        tierVal === '' ? null : tierVal,
            expiryDays:  parse('lim-expiry'),
            maxPlayers:  parse('lim-players'),
            maxCourts:   parse('lim-courts'),
            maxRounds:   parse('lim-rounds'),
            maxSessions: parse('lim-sessions'),
            customerId:  custId === '' ? null : custId,
          };
          newSave.disabled = true; newSave.textContent = '\u23f3 Saving\u2026';
          try {
            await API.updateLeague(lid, undefined, undefined, undefined, undefined, undefined, undefined, limits);
            document.getElementById('limits-modal').style.display = 'none';
            toast('Limits updated.');
            renderLeagues();
          } catch (e) {
            toast('Failed: ' + e.message, 'error');
          } finally {
            newSave.disabled = false; newSave.textContent = 'Save Limits';
          }
        });

        document.getElementById('limits-modal').style.display = 'flex';
      });
    });
  }

    function setupEvents() {
    setupEditPairing();
    setupTournament();
    // Dashboard refresh button
    document.getElementById('btn-refresh-dashboard')?.addEventListener('click', () => refreshDashboard());

    // ── Auto-save: admin email (blur) and admin-only-email (change) ──────────
    async function saveMessagingSettings() {
      const replyTo      = document.getElementById('cfg-reply-to')?.value.trim() || '';
      const adminOnly    = document.getElementById('cfg-admin-only-email')?.checked === true;
      const newConfig    = { ...state.config, replyTo, adminOnlyEmail: adminOnly };
      try {
        await API.saveConfig(newConfig);
        state.config = sanitizeConfig(newConfig);
        // Also update registry so app manager sees current admin email
        const sess = Auth.getSession();
        if (sess?.leagueId && replyTo) {
          API.updateLeague(sess.leagueId, undefined, undefined, undefined, undefined, undefined, replyTo)
            .catch(() => {});
        }
      } catch (e) { toast('Auto-save failed: ' + e.message, 'error'); }
    }
    document.getElementById('cfg-reply-to')?.addEventListener('blur', saveMessagingSettings);
    document.getElementById('cfg-admin-only-email')?.addEventListener('change', saveMessagingSettings);

    // ── Personal email script: Save and Test buttons ────────────────────────
    document.getElementById('btn-save-email-script')?.addEventListener('click', async () => {
      const url    = document.getElementById('cfg-email-script-url')?.value.trim() || '';
      const secret = document.getElementById('cfg-email-script-secret')?.value.trim() || '';
      const statusEl = document.getElementById('email-script-status');
      const newConfig = { ...state.config, emailScriptUrl: url, emailScriptSecret: secret };
      try {
        await API.saveConfig(newConfig);
        state.config = sanitizeConfig(newConfig);
        // Update code snippet with new secret
        const codeEl = document.getElementById('email-script-code');
        if (codeEl) codeEl.textContent = getEmailRelayScript(secret || 'YOUR_SECRET_HERE');
        const activeLabel = document.getElementById('email-script-active-label');
        if (activeLabel) {
          activeLabel.textContent = url
            ? '✓ Personal email script active — league emails will be sent from your account.'
            : 'No personal script configured — emails will be sent from the app developer\'s account.';
          activeLabel.style.color = url ? 'var(--green)' : '';
        }
        if (statusEl) { statusEl.textContent = '✓ Saved'; statusEl.style.color = 'var(--green)'; }
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        toast('Email script settings saved.');
      } catch (e) {
        if (statusEl) { statusEl.textContent = '⚠ Save failed'; statusEl.style.color = 'var(--danger)'; }
        toast('Save failed: ' + e.message, 'error');
      }
    });

    document.getElementById('btn-test-email-script')?.addEventListener('click', async () => {
      const url    = document.getElementById('cfg-email-script-url')?.value.trim();
      const secret = document.getElementById('cfg-email-script-secret')?.value.trim();
      const statusEl = document.getElementById('email-script-status');
      if (!url || !secret) {
        toast('Enter the Web App URL and secret first.', 'warn'); return;
      }
      const testEmail = state.config.replyTo;
      if (!testEmail) {
        toast('Set your Admin Email (reply-to) first — test email will be sent there.', 'warn'); return;
      }
      if (statusEl) { statusEl.textContent = '⏳ Sending test…'; statusEl.style.color = 'var(--muted)'; }
      try {
        const result = await API.testEmailRelay({ emailScriptUrl: url, emailScriptSecret: secret }, testEmail);
        if (result.success) {
          if (statusEl) { statusEl.textContent = `✓ Test sent to ${testEmail} via ${result.via}`; statusEl.style.color = 'var(--green)'; }
          toast(`Test email sent to ${testEmail}! Check your inbox.`);
        } else {
          throw new Error(result.error || 'Unknown error');
        }
      } catch (e) {
        if (statusEl) { statusEl.textContent = '⚠ Test failed: ' + e.message; statusEl.style.color = 'var(--danger)'; }
        toast('Test failed: ' + e.message, 'error');
      }
    });

    // ── Auto-save: optimizer weight fields (blur/change) ────────────────────
    async function saveOptimizerSettings() {
      const D = Pairings.DEFAULTS;
      const newConfig = {
        ...state.config,
        optimizerTries:   parseInt(document.getElementById('cfg-tries')?.value) || 100,
        localImprove:     document.getElementById('cfg-local-improve')?.checked === true,
        swapPasses:       (v => isNaN(v) ? 5 : v)(parseInt(document.getElementById('cfg-swap-passes')?.value)),
        useInitialRank:   document.getElementById('cfg-use-initial-rank')?.checked === true,
        wSessionPartner:  parseFloat(document.getElementById('cfg-w-session-partner')?.value) ?? D.sessionPartnerWeight,
        wSessionOpponent: parseFloat(document.getElementById('cfg-w-session-opponent')?.value) ?? D.sessionOpponentWeight,
        wHistoryPartner:  parseFloat(document.getElementById('cfg-w-history-partner')?.value) ?? D.historyPartnerWeight,
        wHistoryOpponent: parseFloat(document.getElementById('cfg-w-history-opponent')?.value) ?? D.historyOpponentWeight,
        wByeVariance:     parseFloat(document.getElementById('cfg-w-bye-variance')?.value) ?? D.byeVarianceWeight,
        wSessionBye:      parseFloat(document.getElementById('cfg-w-session-bye')?.value) ?? D.sessionByeWeight,
        wRankBalance:     parseFloat(document.getElementById('cfg-w-rank-balance')?.value) ?? D.rankBalanceWeight,
        wRankStdDev:      parseFloat(document.getElementById('cfg-w-rank-std-dev')?.value) ?? D.rankStdDevWeight,
        wMixedViolation:  parseFloat(document.getElementById('cfg-w-mixed-violation')?.value) || D.mixedViolationWeight,
        wQueueWait:       parseFloat(document.getElementById('cfg-w-queue-wait')?.value) ?? 10,
      };
      try {
        await API.saveConfig(newConfig);
        state.config = sanitizeConfig(newConfig);
      } catch (e) { toast('Auto-save failed: ' + e.message, 'error'); }
    }
    ['cfg-tries','cfg-local-improve','cfg-swap-passes','cfg-use-initial-rank',
     'cfg-w-session-partner','cfg-w-session-opponent','cfg-w-history-partner',
     'cfg-w-history-opponent','cfg-w-bye-variance','cfg-w-session-bye',
     'cfg-w-rank-balance','cfg-w-rank-std-dev','cfg-w-mixed-violation','cfg-w-queue-wait'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = el.type === 'checkbox' ? 'change' : 'blur';
      el.addEventListener(evt, saveOptimizerSettings);
    });

    // Save config
    // Rebuild session accordion when number of sessions or courts changes
    document.getElementById('cfg-weeks')?.addEventListener('change', renderSessionsAccordion);
    document.getElementById('cfg-courts')?.addEventListener('change', renderSessionsAccordion);

    // Pending config held here while the confirm-current-password modal is open
    let _pendingConfigSave = null;

    async function doSaveConfig(config) {
      showLoading(true);
      try {
        await API.saveConfig(config);
        state.config = sanitizeConfig(config);

        // Update registry with league name and admin email so the app manager sees current values
        const session = Auth.getSession();
        if (session && session.leagueId) {
          const registryName  = config.leagueName || undefined;
          const registryEmail = config.replyTo    || undefined;
          API.updateLeague(session.leagueId, registryName, undefined, undefined, undefined, undefined, registryEmail)
            .catch(() => {});
        }

        toast('Configuration saved!');
        state._setupDirty = false;
        document.getElementById('cfg-admin-pin').value = '';
        renderDashboard();
        renderAttendance();
        // Rebuild all week/session dropdowns to reflect new session count or dates
        populateWeekSelect('pair-week-select',  'currentPairWeek');
        populateWeekSelect('score-week-select', 'currentScoreWeek');
        populateWeekSelect('tourn-week-select', 'currentTournWeek');
        populateWeekSelect('stand-week-select', 'currentStandWeek');
        initAvailUI();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    }

    // Confirm-current-password modal — wired once, reads _pendingConfigSave at click time
    document.getElementById('confirm-pw-save-btn').addEventListener('click', async () => {
      const currentPw = document.getElementById('confirm-pw-input').value.trim();
      const errEl     = document.getElementById('confirm-pw-error');
      errEl.style.display = 'none';
      if (!currentPw) { errEl.textContent = 'Please enter your current password.'; errEl.style.display = 'block'; return; }

      const btn = document.getElementById('confirm-pw-save-btn');
      btn.disabled = true; btn.textContent = '…';
      try {
        const result = await API.validateAdminPassword(currentPw);
        if (result.valid) {
          document.getElementById('confirm-pw-modal').style.display = 'none';
          document.getElementById('confirm-pw-input').value = '';
          if (_pendingConfigSave) await doSaveConfig(_pendingConfigSave);
          _pendingConfigSave = null;
        } else {
          errEl.textContent = result.reason || 'Incorrect password.';
          errEl.style.display = 'block';
          document.getElementById('confirm-pw-input').value = '';
        }
      } catch (e) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false; btn.textContent = 'Confirm & Save';
      }
    });

    document.getElementById('confirm-pw-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('confirm-pw-save-btn').click();
    });

    // ── Offline scoresheet generator ────────────────────────────
    function generateOfflineScoresheet() {
      const week       = state.currentPairWeek || 1;
      const leagueId   = Auth.getSession()?.leagueId || 'league';
      const leagueName = state.config.leagueName || leagueId;
      const gameMode   = state.config.gameMode || 'doubles';
      const defCourts  = Math.max(1, parseInt(state.config.courts        || 3));
      const defRounds  = Math.max(1, parseInt(state.config.gamesPerSession || 7));
      const maxCourts  = Math.max(defCourts, 8);
      const maxRounds  = Math.max(defRounds, 12);
      const today      = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const pairingsForWeek = (state.pairings || []).filter(
        p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game')
      );

      const rosterNames = (state.players || [])
        .map(p => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b));

      // Collect custom court names from config, matching courtName() priority:
      // per-session name first (courtName_1_w2), then generic (courtName_1).
      const usePerSession = state.config.courtNamesPerSession === true || state.config.courtNamesPerSession === 'true';
      const courtNamesMap = {};
      for (let c = 1; c <= maxCourts; c++) {
        const n = (usePerSession && state.config[`courtName_${c}_w${week}`]) || state.config['courtName_' + c] || '';
        if (n.trim()) courtNamesMap[c] = n.trim();
      }

      const lsKey = 'offline_sheet_' + leagueId + '_w' + week;

      const courtsOpts = Array.from({length: maxCourts}, (_, i) => {
        const n = i + 1;
        return `<option value="${n}"${n === defCourts ? ' selected' : ''}>${n}</option>`;
      }).join('');
      const roundsOpts = Array.from({length: maxRounds}, (_, i) => {
        const n = i + 1;
        return `<option value="${n}"${n === defRounds ? ' selected' : ''}>${n}</option>`;
      }).join('');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scoresheet \u2013 ${esc(leagueName)} \u2013 Session ${week}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0d1b2a;color:#f0f4f8;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;padding:16px;min-height:100vh}
h1{font-size:1.25rem;font-weight:700}
.controls-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;background:#1a2f45;border-radius:10px}
.controls-bar label{font-size:0.85rem;color:#7a9bb5;display:flex;align-items:center;gap:6px}
select{background:#243b55;color:#f0f4f8;border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:4px 8px;font-size:0.9rem;cursor:pointer}
.btn{padding:7px 14px;border:none;border-radius:7px;cursor:pointer;font-size:0.85rem;font-weight:600;transition:opacity 0.15s}
.btn:hover{opacity:0.85}
.btn-clear{background:#243b55;color:#f0f4f8;border:1px solid rgba(255,255,255,0.15)}
.btn-export{background:#2a5c8a;color:#f0f4f8;border:1px solid rgba(94,194,255,0.3)}
.btn-print{background:#5ec26a;color:#0d1b2a}
.sheet-header{margin-bottom:18px}
.sheet-header h1{font-size:1.15rem;margin-bottom:5px}
.meta{font-size:0.85rem;color:#7a9bb5;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.meta-input{background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.2);color:#f0f4f8;font-size:0.85rem;padding:2px 6px;outline:none}
.session-input{width:42px;text-align:center;-moz-appearance:textfield}
.session-input::-webkit-outer-spin-button,.session-input::-webkit-inner-spin-button{-webkit-appearance:none}
.date-input{width:210px}
.round-block{margin-bottom:14px}
.round-label{font-size:0.72rem;font-weight:700;color:#7a9bb5;text-transform:uppercase;letter-spacing:0.08em;padding:4px 2px 5px;border-bottom:1px solid rgba(255,255,255,0.07);margin-bottom:5px}
.round-label strong{font-size:0.82rem;color:#f0f4f8}
.game-card{background:#243b55;border-radius:7px;padding:6px 10px;margin-bottom:4px}
.game-grid{display:grid;grid-template-columns:auto 1fr auto 1fr;align-items:center;gap:6px}
.court-lbl-input{background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.12);color:#7a9bb5;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;width:72px;padding:0 4px 1px;outline:none;cursor:text}
.court-lbl-input:focus{border-bottom-color:#5ec26a}
.team{display:flex;flex-direction:column;gap:3px;min-width:0}
.team1{text-align:right;align-items:flex-end}
.team2{text-align:left;align-items:flex-start}
.name-input{background:#1a2f45;border:1px solid rgba(255,255,255,0.12);border-radius:5px;color:#f0f4f8;font-size:0.88rem;padding:4px 7px;width:100%;max-width:170px;outline:none;transition:border-color 0.15s}
.name-input:focus{border-color:#5ec26a}
.scores{display:flex;align-items:center;justify-content:center;gap:4px;flex-shrink:0;padding:0 4px}
.score-input{width:44px;text-align:center;background:#1a2f45;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#f0f4f8;font-size:1.2rem;font-weight:700;padding:4px;outline:none;transition:border-color 0.15s;-moz-appearance:textfield}
.score-input:focus{border-color:#5ec26a}
.score-input::-webkit-outer-spin-button,.score-input::-webkit-inner-spin-button{-webkit-appearance:none}
.score-sep{color:#7a9bb5;font-size:0.85rem}
@media print{
  .no-print{display:none!important}
  body{background:#fff;color:#000;padding:8px}
  .sheet-header h1,.round-label strong{color:#000}
  .meta,.round-label{color:#555}
  .meta-input{color:#000;border-bottom:1px solid #aaa}
  .round-label{border-bottom:1px solid #ccc}
  .game-card{background:#f5f7fa;border:1px solid #ddd;break-inside:avoid}
  .court-lbl-input{color:#555;border-bottom:none}
  .name-input{background:#fff;border:1px solid #bbb;color:#000}
  .score-input{background:#fff;border:1px solid #bbb;color:#000}
  .score-sep{color:#555}
  input::placeholder{color:transparent}
}
</style>
</head>
<body>
<div class="no-print controls-bar">
  <div style="flex:1"><h1>${esc(leagueName)}</h1></div>
  <label>Courts: <select id="sel-courts">${courtsOpts}</select></label>
  <label>Rounds: <select id="sel-rounds">${roundsOpts}</select></label>
  <button class="btn btn-clear" onclick="clearSheet()">Clear Names &amp; Scores</button>
  <button class="btn btn-export" onclick="downloadForImport()" title="Save a file you can import back into League Manager">&#128229; Save for Import</button>
  <button class="btn btn-print" onclick="window.print()">Print / PDF</button>
</div>
<div class="sheet-header">
  <h1>${esc(leagueName)}</h1>
  <div class="meta">
    Session&nbsp;<input class="meta-input session-input" id="session-num" data-key="session" type="number" min="1" max="99" value="${week}">&nbsp;&bull;&nbsp;Date:&nbsp;<input class="meta-input date-input" id="date-field" data-key="date" type="text" value="${today}">
  </div>
</div>
<div id="sheet"></div>
<datalist id="roster-list">
${rosterNames.map(n => `  <option value="${esc(n)}">`).join('\n')}
</datalist>
<script>
var P=${JSON.stringify(pairingsForWeek)};
var GM=${JSON.stringify(gameMode)};
var CN=${JSON.stringify(courtNamesMap)};
var LSK=${JSON.stringify(lsKey)};
var GID='${Date.now()}';
var FN=${JSON.stringify(`${safeName}-session${week}-scoresheet`)};
var mem={};
function defaultCn(c){return CN[c]||('Court '+c);}
function xe(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function pf(r,c,slot){
  for(var i=0;i<P.length;i++){
    var x=P[i];
    if(String(x.round)===String(r)&&String(x.court)===String(c)){
      return [x.p1,x.p2,x.p3,x.p4][slot-1]||'';
    }
  }
  return '';
}
function mk(t,r,c,s){return t+'_r'+r+'_c'+c+'_'+s;}
function saveMem(){
  var els=document.querySelectorAll('[data-key]');
  for(var i=0;i<els.length;i++) mem[els[i].dataset.key]=els[i].value;
  mem['__gen__']=GID;
  try{localStorage.setItem(LSK,JSON.stringify(mem));}catch(e){}
}
function restoreMem(){
  try{var s=JSON.parse(localStorage.getItem(LSK)||'{}');Object.assign(mem,s);}catch(e){}
  // If this is a newly generated file, discard stale player names and scores
  // but keep court name and header edits (cn_*, session, date).
  if(mem['__gen__']!==GID){
    Object.keys(mem).forEach(function(k){if(/^[ns]_/.test(k)) delete mem[k];});
    mem['__gen__']=GID;
  }
  var els=document.querySelectorAll('[data-key]');
  for(var i=0;i<els.length;i++){var k=els[i].dataset.key;if(mem[k]!==undefined)els[i].value=mem[k];}
}
function render(){
  saveMem();
  var courts=parseInt(document.getElementById('sel-courts').value);
  var rounds=parseInt(document.getElementById('sel-rounds').value);
  var dbl=GM!=='singles';
  var h='';
  for(var r=1;r<=rounds;r++){
    h+='<div class="round-block"><div class="round-label"><strong>Round '+r+'</strong></div>';
    for(var c=1;c<=courts;c++){
      var courtKey='cn_c'+c;
      var courtVal=xe(mem[courtKey]!==undefined?mem[courtKey]:defaultCn(c));
      var p1=pf(r,c,1),p2=dbl?pf(r,c,2):'',p3=pf(r,c,3),p4=dbl?pf(r,c,4):'';
      h+='<div class="game-card"><div class="game-grid">';
      h+='<input class="court-lbl-input" data-key="'+courtKey+'" value="'+courtVal+'" title="Edit court name">';
      h+='<div class="team team1">';
      h+='<input class="name-input" list="roster-list" data-key="'+mk('n',r,c,1)+'" value="'+xe(p1)+'" placeholder="Player 1">';
      if(dbl)h+='<input class="name-input" list="roster-list" data-key="'+mk('n',r,c,2)+'" value="'+xe(p2)+'" placeholder="Player 2">';
      h+='</div><div class="scores">';
      h+='<input type="number" class="score-input" data-key="'+mk('s',r,c,1)+'" min="0" max="99" inputmode="numeric">';
      h+='<span class="score-sep">\u2014</span>';
      h+='<input type="number" class="score-input" data-key="'+mk('s',r,c,2)+'" min="0" max="99" inputmode="numeric">';
      h+='</div><div class="team team2">';
      h+='<input class="name-input" list="roster-list" data-key="'+mk('n',r,c,3)+'" value="'+xe(p3)+'" placeholder="Player 3">';
      if(dbl)h+='<input class="name-input" list="roster-list" data-key="'+mk('n',r,c,4)+'" value="'+xe(p4)+'" placeholder="Player 4">';
      h+='</div></div></div>';
    }
    h+='</div>';
  }
  document.getElementById('sheet').innerHTML=h;
  restoreMem();
  var els=document.querySelectorAll('[data-key]');
  for(var i=0;i<els.length;i++) els[i].addEventListener('input',saveMem);
  setupTabGroups();
}
function setupTabGroups(){
  // Court label inputs are purely editorial — remove from tab order entirely
  document.querySelectorAll('.court-lbl-input').forEach(function(el){el.tabIndex=-1;});
  // Name inputs: Tab/Shift+Tab only cycles within name inputs
  var names=Array.from(document.querySelectorAll('.name-input'));
  names.forEach(function(el,i){
    el.addEventListener('keydown',function(e){
      if(e.key!=='Tab') return;
      e.preventDefault();
      var target=e.shiftKey?names[i-1]:names[i+1];
      if(target) target.focus();
    });
  });
  // Score inputs: Tab/Shift+Tab only cycles within score inputs
  var scores=Array.from(document.querySelectorAll('.score-input'));
  scores.forEach(function(el,i){
    el.addEventListener('keydown',function(e){
      if(e.key!=='Tab') return;
      e.preventDefault();
      var target=e.shiftKey?scores[i-1]:scores[i+1];
      if(target) target.focus();
    });
  });
}
function clearSheet(){
  var names=document.querySelectorAll('.name-input');
  for(var i=0;i<names.length;i++){names[i].value='';if(names[i].dataset.key)mem[names[i].dataset.key]='';}
  var scores=document.querySelectorAll('.score-input');
  for(var i=0;i<scores.length;i++){scores[i].value='';if(scores[i].dataset.key)mem[scores[i].dataset.key]='';}
  try{localStorage.setItem(LSK,JSON.stringify(mem));}catch(e){}
}
function downloadForImport(){
  saveMem();
  var sess=mem['session']||document.getElementById('session-num').value||'?';
  var payload=JSON.stringify(mem);
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Scoresheet Import \u2013 Session '+xe(String(sess))+'</title>'
    +'<script id="lm-import-data" type="application/json">'+payload+'<\\/script>'
    +'</head><body style="font-family:sans-serif;padding:24px;color:#333;">'
    +'<p>Scoresheet import file for <strong>Session '+xe(String(sess))+'</strong>.</p>'
    +'<p style="margin-top:8px;font-size:0.9rem;color:#666;">Open League Manager Admin \u2192 Score Entry \u2192 Import Scoresheet to load these scores.</p>'
    +'</body></html>';
  var blob=new Blob([html],{type:'text/html'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=FN+'-import.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}
document.getElementById('sel-courts').addEventListener('change',render);
document.getElementById('sel-rounds').addEventListener('change',render);
document.getElementById('session-num').addEventListener('input',saveMem);
document.getElementById('date-field').addEventListener('input',saveMem);
try{Object.assign(mem,JSON.parse(localStorage.getItem(LSK)||'{}'));}catch(e){}
render();
<\/script>
</body>
</html>`;

      const safeName = leagueName.replace(/[^a-z0-9]/gi, '-').toLowerCase();
      _triggerDownload(html, `${safeName}-session${week}-scoresheet.html`, 'text/html');
      showToast('Offline scoresheet downloaded — open the HTML file in any browser', 'success');
    }

    // ── Import offline scoresheet ───────────────────────────────
    function importOfflineScoresheet() {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.html,text/html';
      fileInput.onchange = async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/html');

          // Read the embedded JSON blob written by downloadForImport()
          let mem = null;
          const dataEl = doc.getElementById('lm-import-data');
          if (dataEl) {
            try { mem = JSON.parse(dataEl.textContent); } catch(e) {}
          }

          // Fallback: read value= attributes on data-key inputs (e.g. "Save Page As")
          if (!mem) {
            mem = {};
            doc.querySelectorAll('[data-key]').forEach(el => {
              const v = el.getAttribute('value');
              if (v != null) mem[el.dataset.key] = v;
            });
          }

          if (!mem || !Object.keys(mem).length) {
            toast('No scoresheet data found in the file.', 'error');
            return;
          }

          const importWeek = parseInt(mem['session']) || state.currentScoreWeek;
          const isDoubles  = (state.config.gameMode || 'doubles') !== 'singles';

          // Parse all round/court entries that have the required players.
          // Split into: entries with scores (both s1+s2 present) and pairing-only (no scores).
          const withScores = [];
          const pairingOnly = [];
          // Collect all round/court combos present in mem via name keys
          const seen = new Set();
          for (const key of Object.keys(mem)) {
            const m = key.match(/^n_r(\d+)_c(\d+)_1$/);
            if (!m) continue;
            const r = parseInt(m[1]), c = parseInt(m[2]);
            const ck = `${r}_${c}`;
            if (seen.has(ck)) continue;
            seen.add(ck);

            const p1 = (mem[`n_r${r}_c${c}_1`] || '').trim();
            const p2 = (mem[`n_r${r}_c${c}_2`] || '').trim();
            const p3 = (mem[`n_r${r}_c${c}_3`] || '').trim();
            const p4 = (mem[`n_r${r}_c${c}_4`] || '').trim();

            // Must have all required players
            if (isDoubles && (!p1 || !p2 || !p3 || !p4)) continue;
            if (!isDoubles && (!p1 || !p3)) continue;

            const s1 = mem[`s_r${r}_c${c}_1`];
            const s2 = mem[`s_r${r}_c${c}_2`];
            const hasScores = (s1 !== '' && s1 != null) && (s2 !== '' && s2 != null);
            const entry = {
              week: importWeek, round: r, court: String(c),
              p1, p2: isDoubles ? p2 : '', p3, p4: isDoubles ? p4 : '',
            };
            if (hasScores) {
              withScores.push({ ...entry, score1: parseInt(s1) || 0, score2: parseInt(s2) || 0 });
            } else {
              pairingOnly.push(entry);
            }
          }

          if (!withScores.length && !pairingOnly.length) {
            toast('No complete games found — each court needs all players assigned.', 'warn');
            return;
          }

          // Check for score conflicts
          const conflicts = withScores.filter(s =>
            state.scores.some(e =>
              parseInt(e.week) === s.week && parseInt(e.round) === s.round &&
              String(e.court) === String(s.court) &&
              e.score1 !== '' && e.score1 != null && e.score2 !== '' && e.score2 != null
            )
          );

          if (conflicts.length) {
            const noun = conflicts.length === 1 ? 'game' : 'games';
            if (!confirm(`${conflicts.length} ${noun} in Session ${importWeek} already have scores recorded. Overwrite them?`)) return;
          }

          const wk = importWeek;

          // Apply scores
          for (const s of withScores) {
            state.scores = state.scores.filter(e =>
              !(parseInt(e.week) === s.week && parseInt(e.round) === s.round && String(e.court) === String(s.court))
            );
            state.scores.push(s);
          }

          // Apply pairing-only entries — add to state.pairings if not already present
          const newPairings = [];
          for (const p of pairingOnly) {
            const exists = state.pairings.some(e =>
              parseInt(e.week) === p.week && parseInt(e.round) === p.round && String(e.court) === String(p.court)
            );
            if (!exists) {
              const newP = { ...p, type: 'game' };
              state.pairings.push(newP);
              newPairings.push(newP);
            }
          }

          if (withScores.length) {
            state.standings = Reports.computeStandings(
              state.scores, state.players, state.pairings, null,
              state.config.rankingMethod, state.attendance, state.config.pairingMode
            );
          }

          // Save scores
          if (withScores.length) {
            const prevLock = state.saveLocks[wk] || Promise.resolve();
            const thisLock = prevLock.then(async () => {
              await API.saveScores(wk, state.scores.filter(s => parseInt(s.week) === wk));
            });
            state.saveLocks[wk] = thisLock.catch(() => {});
            await thisLock;
          }

          // Save pairings if any new ones were added
          if (newPairings.length) {
            await API.savePairings(wk, state.pairings.filter(p => parseInt(p.week) === wk));
          }

          if (state.currentScoreWeek !== wk) {
            state.currentScoreWeek = wk;
            populateWeekSelect('score-week-select', 'currentScoreWeek');
          }
          renderScoresheet();
          renderStandings();
          const total = withScores.length + pairingOnly.length;
          const parts = [];
          if (withScores.length) parts.push(`${withScores.length} scored`);
          if (pairingOnly.length) parts.push(`${newPairings.length} pairing${newPairings.length !== 1 ? 's' : ''} added`);
          toast(`Imported for Session ${wk}: ${parts.join(', ')}.`, 'success');
        } catch(e) {
          toast('Import failed: ' + e.message, 'error');
        }
      };
      fileInput.click();
    }

    document.getElementById('btn-import-scoresheet')?.addEventListener('click', importOfflineScoresheet);

    // ── Export helpers ──────────────────────────────────────────
    function _triggerDownload(content, filename, type) {
      const blob = new Blob([content], { type });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function exportLeagueJSON() {
      const leagueName = state.config.leagueName || Auth.getSession()?.leagueId || 'league';
      const dateStr    = new Date().toISOString().slice(0, 10);
      const payload = {
        exportVersion: 1,
        exportDate:    new Date().toISOString(),
        leagueId:      Auth.getSession()?.leagueId || '',
        leagueName,
        config:     state.config,
        players:    state.players,
        attendance: state.attendance,
        pairings:   state.pairings,
        scores:     state.scores,
        queue:      state.queue      || [],
        challenges: state.challenges || [],
      };
      const filename = (leagueName.replace(/[^a-z0-9]/gi, '-') + '-' + dateStr + '.json').toLowerCase();
      _triggerDownload(JSON.stringify(payload, null, 2), filename, 'application/json');
      showToast('League exported as JSON — ready to reimport', 'success');
    }

    function exportLeagueCSV() {
      const leagueName = state.config.leagueName || Auth.getSession()?.leagueId || 'league';
      const dateStr    = new Date().toISOString().slice(0, 10);
      const csvCell = v => {
        const s = (v === null || v === undefined) ? '' : String(v);
        return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const csvRow = arr => arr.map(csvCell).join(',');
      const lines  = [];

      lines.push('# Pickleball League Manager — CSV Data Export');
      lines.push('# League: ' + leagueName);
      lines.push('# Exported: ' + new Date().toISOString());
      lines.push('# NOTE: This file is for viewing in Excel/Sheets only.');
      lines.push('#        Use the JSON backup to reimport data.');
      lines.push('#        Player photos and Stripe keys are not included.');
      lines.push('');

      // Config (skip photo and payment keys)
      lines.push('=== CONFIG ===');
      lines.push('key,value');
      Object.entries(state.config).forEach(([k, v]) => {
        if (k !== 'coordinatorPhoto' && k !== 'stripeSecretKey') lines.push(csvRow([k, v]));
      });

      // Players (skip photo/avtoken to keep file manageable)
      const pCols = ['name','pin','group','active','email','notify','canScore',
                     'initialRank','role','fullName','phone','stripePaid','stripeRef','stripePaymentDate'];
      lines.push(''); lines.push('=== PLAYERS ===');
      lines.push(pCols.join(','));
      (state.players || []).forEach(p => lines.push(csvRow(pCols.map(c => p[c]))));

      // Attendance
      lines.push(''); lines.push('=== ATTENDANCE ===');
      lines.push('player,week,status');
      (state.attendance || []).forEach(a => lines.push(csvRow([a.player, a.week, a.status])));

      // Pairings
      lines.push(''); lines.push('=== PAIRINGS ===');
      lines.push('week,round,court,p1,p2,p3,p4,type');
      (state.pairings || []).forEach(p => lines.push(csvRow([p.week,p.round,p.court,p.p1,p.p2,p.p3,p.p4,p.type])));

      // Scores
      lines.push(''); lines.push('=== SCORES ===');
      lines.push('week,round,court,p1,p2,score1,p3,p4,score2');
      (state.scores || []).forEach(s => lines.push(csvRow([s.week,s.round,s.court,s.p1,s.p2,s.score1,s.p3,s.p4,s.score2])));

      // Queue
      if ((state.queue || []).length > 0) {
        lines.push(''); lines.push('=== QUEUE ===');
        lines.push('week,player,waitWeight,stayGames');
        state.queue.forEach(q => lines.push(csvRow([q.week, q.player, q.waitWeight, q.stayGames])));
      }

      // Challenges
      if ((state.challenges || []).length > 0) {
        const chCols = Object.keys(state.challenges[0]);
        lines.push(''); lines.push('=== CHALLENGES ===');
        lines.push(chCols.join(','));
        state.challenges.forEach(c => lines.push(csvRow(chCols.map(k => c[k]))));
      }

      const filename = (leagueName.replace(/[^a-z0-9]/gi, '-') + '-' + dateStr + '.csv').toLowerCase();
      _triggerDownload(lines.join('\n'), filename, 'text/csv;charset=utf-8;');
      showToast('CSV exported — open in Excel or Google Sheets to view. Use JSON to reimport.', 'info', 6000);
    }

    document.getElementById('btn-export-json')?.addEventListener('click', exportLeagueJSON);
    document.getElementById('btn-export-csv')?.addEventListener('click', exportLeagueCSV);
    document.getElementById('btn-offline-scoresheet')?.addEventListener('click', generateOfflineScoresheet);

    document.getElementById('btn-save-config').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot change league settings.', 'warn'); return; }
      const weeks = parseInt(document.getElementById('cfg-weeks').value);
      const config = {
        leagueName:        document.getElementById('cfg-name').value.trim(),
        location:          document.getElementById('cfg-location').value.trim(),
        sessionTime:       document.getElementById('cfg-time').value.trim(),
        notes:             document.getElementById('cfg-notes').value.trim(),
        coordinatorName:   document.getElementById('cfg-coordinator-name')?.value.trim() || '',
        coordinatorPhone:  document.getElementById('cfg-coordinator-phone')?.value.trim() || '',
        coordinatorPhoto:  state.config.coordinatorPhoto || '',
        leagueUrl:           document.getElementById('cfg-league-url').value.trim(),
        allowRegistration:            document.getElementById('cfg-allow-registration').checked,
        challengesEnabled:            document.getElementById('cfg-challenges-enabled')?.checked || false,
        adminOnlyEmail:               state.config.adminOnlyEmail || false,
        registrationCode:             document.getElementById('cfg-reg-code').value.trim(),
        maxPendingReg:                parseInt(document.getElementById('cfg-reg-max-pending').value) || 10,
        maxParticipants:              document.getElementById('cfg-reg-max-participants').value !== '' ? parseInt(document.getElementById('cfg-reg-max-participants').value) : null,
        registrationFee:              parseFloat(document.getElementById('cfg-reg-fee').value) || 0,
        stripeSecretKey:              document.getElementById('cfg-stripe-secret-key').value.trim(),
        registrationPaymentRequired:  document.getElementById('cfg-reg-payment-required').checked,
        rules:          document.getElementById('cfg-rules').value.trim(),
        adminPin:       document.getElementById('cfg-admin-pin').value || state.config.adminPin,
        replyTo:        state.config.replyTo || '',
        weeks,
        courts:         parseInt(document.getElementById('cfg-courts').value),
        gamesPerSession:parseInt(document.getElementById('cfg-games').value),
        optimizerTries: parseInt(document.getElementById('cfg-tries').value),
        eventType:      document.getElementById('cfg-event-type').value,
        gameMode:       document.getElementById('cfg-game-mode').value,
        pairingMode:      document.getElementById('cfg-pairing-mode').value,
        queueWinnerStay:  parseInt(document.getElementById('cfg-queue-winner-stay')?.value) || 0,
        queueWinnerSplit: document.getElementById('cfg-queue-winner-split')?.value || 'none',
        wQueueWait:       parseFloat(document.getElementById('cfg-w-queue-wait')?.value) ?? 10,
        rankingMethod:  document.getElementById('cfg-ranking-method').value,
        standingsMethod: document.getElementById('cfg-standings-method')?.value || 'standard',
        ladderAttendPts:    parseFloat(document.getElementById('cfg-ladder-attend-pts')?.value)    || 0,
        ladderPlayPts:      parseFloat(document.getElementById('cfg-ladder-play-pts')?.value)      || 0,
        ladderRange1Min:    parseFloat(document.getElementById('cfg-ladder-range1-min')?.value)    || 0,
        ladderRange1Max:    parseFloat(document.getElementById('cfg-ladder-range1-max')?.value)    || 0,
        ladderRange1Pts:    parseFloat(document.getElementById('cfg-ladder-range1-pts')?.value)    || 0,
        ladderRange2Min:    parseFloat(document.getElementById('cfg-ladder-range2-min')?.value)    || 0,
        ladderRange2Max:    parseFloat(document.getElementById('cfg-ladder-range2-max')?.value)    || 0,
        ladderRange2Pts:    parseFloat(document.getElementById('cfg-ladder-range2-pts')?.value)    || 0,
        ladderRange3Min:    parseFloat(document.getElementById('cfg-ladder-range3-min')?.value)    || 0,
        ladderRange3Max:    parseFloat(document.getElementById('cfg-ladder-range3-max')?.value)    || 0,
        ladderRange3Pts:    parseFloat(document.getElementById('cfg-ladder-range3-pts')?.value)    || 0,
        ladderRange4Min:    parseFloat(document.getElementById('cfg-ladder-range4-min')?.value)    || 0,
        ladderRange4Max:    parseFloat(document.getElementById('cfg-ladder-range4-max')?.value)    || 0,
        ladderRange4Pts:    parseFloat(document.getElementById('cfg-ladder-range4-pts')?.value)    || 0,
        ladderRange5Min:    parseFloat(document.getElementById('cfg-ladder-range5-min')?.value)    || 0,
        ladderRange5Max:    parseFloat(document.getElementById('cfg-ladder-range5-max')?.value)    || 0,
        ladderRange5Pts:    parseFloat(document.getElementById('cfg-ladder-range5-pts')?.value)    || 0,
        ladderRange6Min:    parseFloat(document.getElementById('cfg-ladder-range6-min')?.value)    || 0,
        ladderRange6Max:    parseFloat(document.getElementById('cfg-ladder-range6-max')?.value)    || 0,
        ladderRange6Pts:    parseFloat(document.getElementById('cfg-ladder-range6-pts')?.value)    || 0,
        ladderRank1Pts:     parseFloat(document.getElementById('cfg-ladder-rank1-pts')?.value)     || 0,
        ladderRank2Pts:     parseFloat(document.getElementById('cfg-ladder-rank2-pts')?.value)     || 0,
        ladderRank3Pts:     parseFloat(document.getElementById('cfg-ladder-rank3-pts')?.value)     || 0,
        minParticipation: document.getElementById('cfg-min-participation').value !== '' ? parseFloat(document.getElementById('cfg-min-participation').value) : null,
        wSessionPartner:  parseFloat(document.getElementById('cfg-w-session-partner').value),
        wSessionOpponent: parseFloat(document.getElementById('cfg-w-session-opponent').value),
        wHistoryPartner:  parseFloat(document.getElementById('cfg-w-history-partner').value),
        wHistoryOpponent: parseFloat(document.getElementById('cfg-w-history-opponent').value),
        wByeVariance:     parseFloat(document.getElementById('cfg-w-bye-variance').value),
        wSessionBye:      parseFloat(document.getElementById('cfg-w-session-bye').value),
        wRankBalance:     parseFloat(document.getElementById('cfg-w-rank-balance').value),
        wRankStdDev:      parseFloat(document.getElementById('cfg-w-rank-std-dev').value),
        localImprove:     document.getElementById('cfg-local-improve')?.checked === true,
        swapPasses:       (v => isNaN(v) ? 5 : v)(parseInt(document.getElementById('cfg-swap-passes')?.value)),
      };
      const numCourts = parseInt(document.getElementById('cfg-courts').value);
      for (let w = 1; w <= weeks; w++) {
        const el   = document.getElementById(`cfg-date-${w}`);
        const tel  = document.getElementById(`cfg-time-${w}`);
        const ttel = document.getElementById(`cfg-title-${w}`);
        if (el)   config[`date_${w}`]  = el.value;
        if (tel)  config[`time_${w}`]  = tel.value;
        if (ttel) config[`title_${w}`] = ttel.value.trim();
      }
      config.courtNamesPerSession = true;
      for (let cn = 1; cn <= numCourts; cn++) {
        for (let w = 1; w <= weeks; w++) {
          const el = document.getElementById(`cfg-court-name-${cn}-w${w}`);
          if (el) config[`courtName_${cn}_w${w}`] = el.value.trim();
        }
      }
      // Validate ladder range min/max
      for (let ri = 1; ri <= 6; ri++) {
        const mn = config[`ladderRange${ri}Min`];
        const mx = config[`ladderRange${ri}Max`];
        if (mn === 0 && mx === 0) continue; // disabled row
        if (mx <= mn) {
          toast(`Win Range ${ri}: Max (${mx}) must be greater than Min (${mn}).`, 'warn');
          return;
        }
      }

      // Enforce registry limits on config save
      const cfgCourts  = parseInt(config.courts)  || 0;
      const cfgWeeks   = parseInt(config.weeks)   || 0;
      const cfgRounds  = parseInt(config.gamesPerSession) || 0;
      const maxC = state.limits && state.limits.maxCourts;
      const maxS = state.limits && state.limits.maxSessions;
      const maxR = state.limits && state.limits.maxRounds;
      if (maxC !== null && maxC !== undefined && cfgCourts > maxC) {
        toast(`Court limit exceeded: this league allows up to ${maxC} courts.`, 'warn'); return;
      }
      if (maxS !== null && maxS !== undefined && cfgWeeks > maxS) {
        toast(`Session limit exceeded: this league allows up to ${maxS} sessions.`, 'warn'); return;
      }
      if (maxR !== null && maxR !== undefined && cfgRounds > maxR) {
        toast(`Round limit exceeded: this league allows up to ${maxR} rounds per session.`, 'warn'); return;
      }

      // If the admin PIN field has a value, the admin is changing the password —
      // require them to confirm their current password before saving.
      // App manager bypasses this check (they have authority over all leagues).
      const newPin = document.getElementById('cfg-admin-pin').value;
      if (newPin && newPin !== state.config.adminPin && userRole !== 'manager') {
        _pendingConfigSave = config;
        document.getElementById('confirm-pw-input').value = '';
        document.getElementById('confirm-pw-error').style.display = 'none';
        document.getElementById('confirm-pw-modal').style.display = 'flex';
        return;
      }

      await doSaveConfig(config);
    });

    // ── Availability Request — event wiring only (functions at outer scope) ───
    document.getElementById('avail-week-select')?.addEventListener('change', updateAvailPreview);
    document.getElementById('avail-filter')?.addEventListener('change', updateAvailPreview);
    document.querySelector('.card:has(#avail-week-select) details')?.addEventListener('toggle', function() {
      if (this.open) initAvailUI();
    });
    // Refresh send message UI when the collapsible is opened
    document.querySelector('.card:has(#msg-subject) details')?.addEventListener('toggle', function() {
      if (this.open) refreshSendMessageUI();
    });
    // Refresh SMS UI when the SMS collapsible is opened
    document.querySelector('.card:has(#sms-recipients) details')?.addEventListener('toggle', function() {
      if (this.open) refreshSmsUI();
      else { // hide number box when card is collapsed
        const box = document.getElementById('sms-number-box');
        if (box) box.style.display = 'none';
      }
    });
    document.getElementById('btn-copy-numbers')?.addEventListener('click', () => {
      const listEl = document.getElementById('sms-number-list');
      if (!listEl) return;
      navigator.clipboard.writeText(listEl.value).then(() => {
        const btn = document.getElementById('btn-copy-numbers');
        const orig = btn.textContent;
        btn.textContent = '✓ Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
      });
    });
    document.getElementById('btn-open-text')?.addEventListener('click', () => {
      const selected = getCheckboxSelections(document.getElementById('sms-recipients'));
      const useAll = selected.has('__all__');
      const eligible = state.players.filter(p => p.active === true && p.phone);
      const targets = useAll ? eligible : eligible.filter(p => selected.has(p.name));
      if (!targets.length) { toast('No selected players have phone numbers on file.', 'warn'); return; }
      // Normalize numbers: strip everything except digits and leading +
      const numbers = targets.map(p => p.phone.replace(/[^\d+]/g, '')).filter(Boolean);
      // Show the numbers in a copyable field — multi-recipient sms: URIs
      // are unreliable across platforms, so the user can paste them manually.
      const box = document.getElementById('sms-number-box');
      const listEl = document.getElementById('sms-number-list');
      if (box && listEl) {
        listEl.value = numbers.join(', ');
        box.style.display = '';
      }
      const a = document.createElement('a');
      a.href = 'sms:' + numbers[0]; // open app with first number; user pastes the rest
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    document.getElementById('btn-send-avail')?.addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot send emails.', 'warn'); return; }
      const week   = parseInt(document.getElementById('avail-week-select').value) || 1;
      const filter = document.getElementById('avail-filter').value;
      const statusEl = document.getElementById('avail-status');

      const recipients = getAvailRecipients(week, filter);

      if (!recipients.length) {
        statusEl.textContent = 'No eligible recipients.';
        statusEl.style.color = 'var(--gold)';
        return;
      }

      const sess = Auth.getSession();
      const leagueId = sess?.leagueId || '';
      const gasUrl = typeof GAS_URL !== 'undefined' ? GAS_URL : '';
      if (!gasUrl) {
        statusEl.textContent = 'GAS_URL not configured in settings.js.';
        statusEl.style.color = 'var(--danger)';
        return;
      }

      statusEl.textContent = `⏳ Sending to ${recipients.length} player(s)…`;
      statusEl.style.color = 'var(--muted)';
      showLoading(true);
      try {
        const result = await API.sendAvailabilityRequest({ relayConfig: getRelayConfig(),
          week,
          leagueId,
          leagueName: sess?.leagueName || state.config.leagueName || 'League',
          replyTo:    state.config.replyTo || '',
          gasUrl,
          note:       document.getElementById('avail-note')?.value.trim() || '',
          recipients: recipients.map(p => ({ name: p.name, email: p.email })),
        });
        statusEl.textContent = `✓ Sent to ${result.sent} player(s).`;
        statusEl.style.color = 'var(--green)';
        if (result.errors?.length) {
          statusEl.textContent += ' Errors: ' + result.errors.join(', ');
        }
      } catch (e) {
        statusEl.textContent = 'Send failed: ' + e.message;
        statusEl.style.color = 'var(--danger)';
      } finally { showLoading(false); }
    });

    // Load BMAC donations (manager only)
    document.getElementById('btn-load-donations')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-load-donations');
      const listEl = document.getElementById('donations-list');
      btn.disabled = true; btn.textContent = '⏳ Loading…';
      try {
        const { donations } = await API.getDonations();
        if (!donations || donations.length === 0) {
          listEl.innerHTML = '<p style="font-size:0.82rem; color:var(--muted);">No donations recorded yet.</p>';
        } else {
          listEl.innerHTML = `<table style="width:100%; font-size:0.82rem; border-collapse:collapse;">
            <thead><tr style="color:var(--muted); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">
              <th style="text-align:left; padding:4px 8px;">Supporter</th>
              <th style="text-align:right; padding:4px 8px;">Amount</th>
              <th style="text-align:left; padding:4px 8px; min-width:100px;">Via</th>
              <th style="text-align:left; padding:4px 8px;">Note</th>
              <th style="text-align:left; padding:4px 8px; min-width:120px;">Date</th>
            </tr></thead>
            <tbody>${donations.map(d => `<tr style="border-top:1px solid rgba(255,255,255,0.06);">
              <td style="padding:5px 8px;">${esc(d.name)}</td>
              <td style="padding:5px 8px; text-align:right; color:var(--green);">$${parseFloat(d.amount||0).toFixed(2)}</td>
              <td style="padding:5px 8px; color:var(--muted);">${esc(d.platform||'bmac')}</td>
              <td style="padding:5px 8px; color:var(--muted);">${esc(d.note||'')}</td>
              <td style="padding:5px 8px; color:var(--muted); font-size:0.75rem;">${esc(d.createdAt||'')}</td>
            </tr>`).join('')}</tbody>
          </table>`;
        }
      } catch(e) {
        listEl.innerHTML = `<p style="font-size:0.82rem; color:var(--danger);">Failed: ${esc(e.message)}</p>`;
      } finally {
        btn.disabled = false; btn.textContent = 'Refresh';
      }
    });

    // Send league message
    document.getElementById('btn-send-feedback').addEventListener('click', async () => {
      const type    = document.getElementById('fb-type').value;
      const name    = document.getElementById('fb-name').value.trim();
      const email   = document.getElementById('fb-email').value.trim();
      const message = document.getElementById('fb-message').value.trim();
      const statusEl = document.getElementById('fb-status');

      if (!message) { statusEl.innerHTML = '<span style="color:var(--danger);">Please enter a message.</span>'; return; }

      const btn = document.getElementById('btn-send-feedback');
      btn.disabled = true; btn.textContent = '⏳ Sending…';
      statusEl.innerHTML = '';

      try {
        const sess = Auth.getSession();
        await API.sendFeedback({
          feedbackType: type, name, email, message,
          leagueId: sess?.leagueId, leagueName: sess?.leagueName
        });
        statusEl.innerHTML = '<span style="color:var(--green);">✓ Feedback sent — thank you!</span>';
        document.getElementById('fb-message').value = '';
        document.getElementById('fb-name').value = '';
        document.getElementById('fb-email').value = '';
        document.getElementById('fb-type').value = 'Bug Report';
      } catch(e) {
        statusEl.innerHTML = `<span style="color:var(--danger);">Failed: ${esc(e.message)}</span>`;
      } finally {
        btn.disabled = false; btn.textContent = '📨 Send Feedback';
      }
    });

    document.getElementById('btn-send-message').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot send league messages.', 'warn'); return; }
      const subject = document.getElementById('msg-subject').value.trim();
      const body    = document.getElementById('msg-body').value.trim();
      if (!subject) { toast('Please enter a subject.', 'warn'); return; }
      if (!body)    { toast('Please enter a message.', 'warn'); return; }

      const selected = getCheckboxSelections(document.getElementById('msg-recipients'));
      const useAll = selected.has('__all__');
      const eligible = state.players.filter(p => p.active === true && p.email);
      const recipients = useAll ? eligible : eligible.filter(p => selected.has(p.name));
      if (!recipients.length) {
        toast('No selected players have email addresses on file.', 'warn'); return;
      }
      if (!confirm(`Send to ${recipients.length} player(s)?`)) return;

      // Build optional league info sections
      const c = state.config;
      const incName     = document.getElementById('msg-inc-name').checked;
      const incLocation = document.getElementById('msg-inc-location').checked;
      const incTime     = document.getElementById('msg-inc-time').checked;
      const incRules    = document.getElementById('msg-inc-rules').checked;
      const incDates    = document.getElementById('msg-inc-dates').checked;
      const incUrl       = document.getElementById('msg-inc-url').checked;
      const incPlayers   = document.getElementById('msg-inc-players').checked;
      const incStandings = document.getElementById('msg-inc-standings').checked;

      const isLadder = (c.standingsMethod || 'standard') === 'ladder';
      let emailStandings = [];
      if (incStandings) {
        if (isLadder) {
          const initRankMap = {};
          state.standings.forEach(s => { if (s.rank && s.rank !== '-') initRankMap[s.name] = parseInt(s.rank); });
          state.players.forEach(p => { if (initRankMap[p.name] == null && p.initialRank) initRankMap[p.name] = p.initialRank; });
          emailStandings = Reports.computeLadderStandings(state.scores, state.players, state.pairings,
            null, state.attendance, state.config, initRankMap)
            .filter(s => state.players.find(p => p.name === s.name && p.active === true));
        } else {
          emailStandings = Reports.computeStandings(state.scores, state.players, state.pairings, null,
            state.config.rankingMethod, state.attendance, state.config.pairingMode)
            .filter(s => state.players.find(p => p.name === s.name && p.active === true));
        }
      }

      // Build active range descriptors for the email standings table
      const emailActiveRanges = isLadder
        ? [1,2,3,4,5,6].map(i => ({
            idx: i - 1,
            label: `R${i}`,
            min: parseFloat(c[`ladderRange${i}Min`]) || 0,
            max: parseFloat(c[`ladderRange${i}Max`]) || 0,
            pts: parseFloat(c[`ladderRange${i}Pts`]) || 0,
          })).filter(r => r.max > r.min)
        : [];

      const leagueInfo = {
        leagueName:  incName     ? (c.leagueName  || '') : '',
        location:    incLocation ? (c.location    || '') : '',
        sessionTime: incTime     ? (c.sessionTime || '') : '',
        rules:       incRules    ? (c.rules       || '') : '',
        leagueUrl:   incUrl      ? getLeagueUrl() : '',
        isLadder,
        ladderRanges: emailActiveRanges,
        players:     incPlayers  ? state.players.filter(p => p.active === true)
                                    .map(p => ({ name: p.name, fullName: p.fullName || '' })) : [],
        standings:   emailStandings,
        dates:       incDates    ? (() => {
          const weeks = parseInt(c.weeks || 8);
          const d = [];
          for (let w = 1; w <= weeks; w++) {
            if (c['date_' + w] || c['time_' + w]) d.push({ week: w, date: c['date_' + w] || '', time: c['time_' + w] || '' });
          }
          return d;
        })() : [],
      };

      showLoading(true);
      const statusEl = document.getElementById('msg-status');
      try {
        const result = await API.sendLeagueMessage({ relayConfig: getRelayConfig(),
          subject,
          body,
          leagueInfo,
          replyTo: c.replyTo || '',
          recipients: (state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true') && c.replyTo
            ? [{ name: 'Admin', email: c.replyTo }]
            : recipients.map(p => ({ name: p.name, email: p.email })),
        });
        statusEl.textContent = `✓ Sent to ${result.sent} player(s).`;
        statusEl.style.color = 'var(--green)';
        if (result.errors && result.errors.length) {
          statusEl.textContent += ' Some failed: ' + result.errors.join(', ');
        }
      } catch (e) {
        statusEl.textContent = 'Send failed: ' + e.message;
        statusEl.style.color = 'var(--danger)';
      } finally { showLoading(false); }
    });

    document.getElementById('btn-open-email')?.addEventListener('click', () => {
      if (isAssistant) { toast('Admin assistants cannot send league messages.', 'warn'); return; }
      const subject = document.getElementById('msg-subject').value.trim();
      const body    = document.getElementById('msg-body').value.trim();
      if (!subject) { toast('Please enter a subject.', 'warn'); return; }
      if (!body)    { toast('Please enter a message.', 'warn'); return; }

      const selected = getCheckboxSelections(document.getElementById('msg-recipients'));
      const useAll = selected.has('__all__');
      const eligible = state.players.filter(p => p.active === true && p.email);
      const recipients = useAll ? eligible : eligible.filter(p => selected.has(p.name));
      if (!recipients.length) { toast('No selected players have email addresses on file.', 'warn'); return; }

      // Build plain-text footer from checked include options
      const c = state.config;
      const lines = [];
      if (document.getElementById('msg-inc-name').checked    && c.leagueName)    lines.push('League: ' + c.leagueName);
      if (document.getElementById('msg-inc-location').checked && c.location)      lines.push('Location: ' + c.location);
      if (document.getElementById('msg-inc-time').checked    && c.sessionTime)    lines.push('Session time: ' + c.sessionTime);
      if (document.getElementById('msg-inc-url').checked)                          lines.push('App: ' + getLeagueUrl());
      if (document.getElementById('msg-inc-rules').checked   && c.rules)          lines.push('\nRules:\n' + c.rules);
      if (document.getElementById('msg-inc-dates').checked) {
        const weeks = parseInt(c.weeks || 8);
        for (let w = 1; w <= weeks; w++) {
          if (c['date_' + w] || c['time_' + w])
            lines.push(`Session ${w}: ${c['date_' + w] || ''} ${c['time_' + w] || ''}`.trim());
        }
      }
      if (document.getElementById('msg-inc-players').checked) {
        const names = state.players.filter(p => p.active === true).map(p => p.name);
        if (names.length) lines.push('\nPlayers:\n' + names.join(', '));
      }

      const fullBody = lines.length ? body + '\n\n' + lines.join('\n') : body;
      const mailto = 'mailto:' + recipients.map(p => encodeURIComponent(p.email)).join(',')
        + '?subject=' + encodeURIComponent(subject)
        + '&body='    + encodeURIComponent(fullBody);

      const a = document.createElement('a');
      a.href = mailto;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    // Generate random invite code
    document.getElementById('btn-gen-reg-code')?.addEventListener('click', () => {
      const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
      document.getElementById('cfg-reg-code').value = code;
    });

    // Add player
    document.getElementById('btn-add-player').addEventListener('click', () => {
      if (isAssistant) { toast('Admin assistants cannot manage players.', 'warn'); return; }
      state.players.push({ name: '', pin: '', group: 'M', active: true });
      renderPlayers();
    });

    // Save players
    // Track unsaved changes on the setup page (exclude auto-saving optimizer/messaging fields)
    const AUTO_SAVE_IDS = new Set([
      'cfg-reply-to', 'cfg-admin-only-email',
      'cfg-local-improve', 'cfg-swap-passes', 'cfg-use-initial-rank', 'cfg-verbose-optimizer',
      'cfg-w-session-partner', 'cfg-w-session-opponent', 'cfg-w-history-partner',
      'cfg-w-history-opponent', 'cfg-w-bye-variance', 'cfg-w-session-bye',
      'cfg-w-rank-balance', 'cfg-w-rank-std-dev', 'cfg-w-mixed-violation', 'cfg-tries',
    ]);
    document.getElementById('page-setup')?.addEventListener('input',  e => {
      if (!AUTO_SAVE_IDS.has(e.target?.id)) state._setupDirty = true;
    });
    document.getElementById('page-setup')?.addEventListener('change', e => {
      if (!AUTO_SAVE_IDS.has(e.target?.id)) state._setupDirty = true;
    });

    // Track unsaved changes on the players page
    document.getElementById('player-list')?.addEventListener('input',  () => { state._playersDirty = true; });
    document.getElementById('player-list')?.addEventListener('change', () => { state._playersDirty = true; });

    document.getElementById('btn-save-players').addEventListener('click', async () => {
      state._playersDirty = false; // clear before save attempt — reset on error below if needed
      if (isAssistant) { toast('Admin assistants cannot manage players.', 'warn'); return; }
      // state.players is kept in sync by the [data-field] change listeners,
      // so read directly from it rather than scraping the DOM.
      const players = state.players.filter(p => p.name && p.name.trim());
      // Safety guard — never save an empty player list (would wipe the sheet)
      if (players.length === 0) {
        toast('No players to save — player list is empty. Reload the page and try again.', 'warn');
        return;
      }

      // Enforce maxPlayers limit
      const newActiveCount = players.filter(p => p.active === true).length;
      const maxP = state.limits && state.limits.maxPlayers;
      if (maxP !== null && maxP !== undefined && newActiveCount > maxP) {
        toast(`Player limit exceeded: this league allows up to ${maxP} active players (${newActiveCount} selected). Deactivate some players first.`, 'warn');
        return;
      }

      showLoading(true);
      try {
        // Sort by role order before saving
      const roleRank = r => { const k = ROLE_ORDER.indexOf(r || ''); return k === -1 ? 99 : k; };
      players.sort((a, b) => roleRank(a.role) - roleRank(b.role) || (a.name||'').localeCompare(b.name||''));
      await API.savePlayers(players);
        state.players = players;
        toast('Players saved!');
        renderDashboard();
        renderAttendance();
        renderPlayerReportSelect();
      } catch (e) { state._playersDirty = true; toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Week navigators
    // Warn before changing session if pending pairings exist.
    // _prevPairWeek captures the current week before setupWeekSelect updates state.
    const pairSel = document.getElementById('pair-week-select');
    let _prevPairWeek = state.currentPairWeek;

    setupWeekSelect('pair-week-select', 'currentPairWeek', () => {
      if (state.pendingPairings) {
        if (!confirm('Pairings have been generated but not locked and saved. Switch session and discard them?')) {
          // Revert to previous week
          if (pairSel) pairSel.value = _prevPairWeek;
          state.currentPairWeek = _prevPairWeek;
          saveWeekPrefs();
          renderPairingsPreview();
          return;
        }
      }
      _prevPairWeek = state.currentPairWeek; // update after confirmed change
      state.pendingPairings = null;
      state.bestGeneration  = null;
      state._pairSkipPlayers.clear();
      document.getElementById('btn-generate-fresh')?.classList.add('hidden');
      // Sync score selector to match
      state.currentScoreWeek = state.currentPairWeek;
      const scoreSelEl = document.getElementById('score-week-select');
      if (scoreSelEl && scoreSelEl.value != state.currentPairWeek) scoreSelEl.value = state.currentPairWeek;
      renderPairingsPreview();
      renderScoresheet();
      updatePairingModeUI();
      if (state.config.pairingMode === 'queue-based') loadQueueForWeek(state.currentPairWeek);
      const epWeek = document.getElementById('ep-week');
      if (epWeek) epWeek.value = state.currentPairWeek;
    });
    setupWeekSelect('score-week-select', 'currentScoreWeek', async () => {
      // Sync pair selector to match
      state.currentPairWeek = state.currentScoreWeek;
      const pairSelEl = document.getElementById('pair-week-select');
      if (pairSelEl && pairSelEl.value != state.currentScoreWeek) pairSelEl.value = state.currentScoreWeek;
      const epWeek = document.getElementById('ep-week');
      if (epWeek) epWeek.value = state.currentScoreWeek;
      renderPairingsPreview();
      saveWeekPrefs();
      const scoreEl = document.getElementById('scoresheet');
      if (scoreEl) scoreEl.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
          <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
          <div>Loading Session ${state.currentScoreWeek}…</div>
        </div>`;
      const sel = document.getElementById('score-week-select');
      if (sel) sel.disabled = true;
      try {
        const data = await API.getScores(state.currentScoreWeek);
        if (data && data.scores) {
          const week = state.currentScoreWeek;
          state.scores = state.scores.filter(s => parseInt(s.week) !== week);
          state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
        }
      } catch (e) { /* use cached */ }
      finally { if (sel) sel.disabled = false; }
      renderScoresheet();
    });

    document.getElementById('btn-print-scoresheet').addEventListener('click', () => {
      printScoresheet();
    });

    document.getElementById('btn-refresh-scoresheet').addEventListener('click', async () => {
      const btn = document.getElementById('btn-refresh-scoresheet');
      btn.disabled = true; btn.textContent = '⏳';
      try {
        const data = await API.getScores(state.currentScoreWeek);
        if (data && data.scores) {
          const week = state.currentScoreWeek;
          state.scores = state.scores.filter(s => parseInt(s.week) !== week);
          state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
        }
        renderScoresheet();
        toast('Scores refreshed.');
      } catch (e) { toast('Refresh failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    });

    // Auto-refresh scores every 30 seconds when the scores page is active
    setInterval(async () => {
      const scoresPageActive = document.getElementById('page-scores')?.classList.contains('active');
      if (!scoresPageActive) return;
      // Don't refresh if the user is mid-edit (any score input is focused)
      if (document.activeElement && document.activeElement.classList.contains('score-input')) return;
      // Don't refresh if a save is in flight — would overwrite state.scores mid-save
      if (state.saveLocks[state.currentScoreWeek]) return;
      try {
        const week = state.currentScoreWeek;
        const data = await API.getScores(week);
        if (data && data.scores) {
          state.scores = state.scores.filter(s => parseInt(s.week) !== week);
          state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
          renderScoresheet();
        }
      } catch (e) { /* silent — manual refresh available if needed */ }
    }, 30000);
    // Tournament results week nav
    setupWeekSelect('tourn-week-select', 'currentTournWeek', renderAdminTournamentResults);

    // Refresh button for tournament results
    document.getElementById('btn-refresh-tourn-results').addEventListener('click', () => {
      renderAdminTournamentResults();
      toast('Bracket refreshed.');
    });

    // Email tournament bracket results
    document.getElementById('btn-send-tourn-report').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot send email reports.', 'warn'); return; }
      const week = state.currentTournWeek || state.currentSheetWeek;
      const recipients = state.players.filter(p => p.active === true && p.notify && p.email);
      if (!recipients.length) {
        toast('No players have email notifications enabled.', 'warn'); return;
      }
      if (!confirm(`Send Session ${week} tournament bracket to ${recipients.length} player(s)?`)) return;

      const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week &&
        (p.type === 'game' || p.type === 'tourn-game' || p.type === 'bye'));
      const weekDate     = formatDateTime(week, state.config);

      showLoading(true);
      try {
        await API.sendTournamentReport({ relayConfig: getRelayConfig(),
          week,
          weekDate,
          leagueName: Auth.getSession()?.leagueName || state.config.leagueName || 'League',
          replyTo:    state.config.replyTo    || '',
          leagueUrl:  getLeagueUrl(),
          weekScores,
          weekPairings,
          recipients: (state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true') && state.config.replyTo
            ? [{ name: 'Admin', email: state.config.replyTo }]
            : recipients.map(p => ({ name: p.name, email: p.email })),
        });
        const sentCount = (state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true') && state.config.replyTo ? 1 : recipients.length;
        toast(`Session ${week} tournament bracket sent to ${sentCount} recipient(s)!`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Click player name in any standings table → navigate to their player report
    document.getElementById('page-standings')?.addEventListener('click', e => {
      const span = e.target.closest('[data-report-player]');
      if (!span) return;
      const name = span.dataset.reportPlayer;
      document.querySelector('.nav-item[data-page="player-report"]')?.click();
      const sel = document.getElementById('report-player-select');
      if (sel) { sel.value = name; renderPlayerReport(name); }
      document.getElementById('btn-email-player-report').disabled = !name;
    });

    // Also handle the dashboard standings widget
    document.getElementById('dash-standings')?.addEventListener('click', e => {
      const span = e.target.closest('[data-report-player]');
      if (!span) return;
      const name = span.dataset.reportPlayer;
      document.querySelector('.nav-item[data-page="player-report"]')?.click();
      const sel = document.getElementById('report-player-select');
      if (sel) { sel.value = name; renderPlayerReport(name); }
      document.getElementById('btn-email-player-report').disabled = !name;
    });

    setupWeekSelect('stand-week-select', 'currentStandWeek', () => {
      const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const overallThisWeek = Reports.computeStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const overallPrevWeek = state.currentStandWeek > 1
        ? Reports.computeStandings(state.scores, state.players, state.pairings, state.currentStandWeek - 1, state.config.rankingMethod, state.attendance, state.config.pairingMode)
        : null;
      document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand, false, overallThisWeek, overallPrevWeek);
      const swDate = formatDateTime(state.currentStandWeek, state.config);
      const _swT2 = state.config[`title_${state.currentStandWeek}`];
      const _swBase = _swT2 ? `Session ${state.currentStandWeek}: ${_swT2}` : `Session ${state.currentStandWeek}`;
      document.getElementById('stand-week-label').textContent = _swBase + (swDate ? ' — ' + swDate : '');
    });

    // Generate pairings — keep-best across multiple attempts
    // Queue mode button listeners
    document.getElementById('btn-queue-generate')?.addEventListener('click', runQueueGenerate);
    document.getElementById('btn-queue-lock')?.addEventListener('click', queueLockAndSave);
    document.getElementById('btn-queue-init')?.addEventListener('click', () => initializeQueue(state.currentPairWeek));
    document.getElementById('btn-queue-clear')?.addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot delete pairings.', 'warn'); return; }
      const week = state.currentPairWeek;
      const lockedBatches = [...new Set(
        state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
      )].sort((a, b) => a - b);

      // If only a pending (unlocked) generation exists, just discard it
      if (!lockedBatches.length) {
        if (state.pendingPairings) {
          state.pendingPairings = null;
          state.queueGeneration = null;
          renderQueuePanel();
          toast('Pending generation discarded.');
        } else {
          toast('No batches to clear for this session.', 'warn');
        }
        return;
      }

      const affectedScores = state.scores.filter(s =>
        parseInt(s.week) === week && lockedBatches.includes(parseInt(s.round))
      );
      const batchLabel = lockedBatches.length === 1
        ? `Batch ${lockedBatches[0]}`
        : `Batches ${lockedBatches.join(', ')}`;
      const msg = affectedScores.length
        ? `Clear ${batchLabel} pairings AND scores for Session ${week}? This cannot be undone.`
        : `Clear ${batchLabel} pairings for Session ${week}?`;
      if (!confirm(msg)) return;

      showLoading(true);
      try {
        await API.savePairings(week, []);
        state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        state.pendingPairings = null;
        state.queueGeneration = null;

        if (affectedScores.length) {
          await API.saveScores(week, []);
          state.scores = state.scores.filter(s => parseInt(s.week) !== week);
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance, state.config.pairingMode);
        }
        toast(`${batchLabel} cleared for Session ${week}.`);
        renderQueuePanel();
        renderScoresheet();
      } catch (e) { toast('Failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });
    document.getElementById('cfg-queue-winner-stay')?.addEventListener('change', e => {
      const val = parseInt(e.target.value) || 0;
      state.config.queueWinnerStay = val;
      const splitSel = document.getElementById('cfg-queue-winner-split');
      if (splitSel) splitSel.disabled = val === 0;
      updateWinnerSummary();
    });
    document.getElementById('cfg-queue-winner-split')?.addEventListener('change', e => {
      state.config.queueWinnerSplit = e.target.value;
      updateWinnerSummary();
    });

    document.getElementById('btn-generate').addEventListener('click', () => runGenerate(false));
    document.getElementById('btn-generate-fresh')?.addEventListener('click', () => runGenerate(true));

    async function runGenerate(forceFresh) {
      const week = state.currentPairWeek;
      const scope = document.getElementById('round-scope')?.value || 'all';
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(
        state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
      )].sort((a,b)=>a-b);

      let startRound, rounds;
      if (scope === 'all') {
        startRound = 1; rounds = totalRounds;
      } else if (scope === 'remaining') {
        const nextRound = lockedRounds.length ? Math.max(...lockedRounds) + 1 : 1;
        startRound = nextRound; rounds = totalRounds - nextRound + 1;
        if (rounds <= 0) { toast(`All ${totalRounds} rounds are already generated for Session ${week}.`, 'warn'); return; }
      } else {
        startRound = parseInt(scope); rounds = 1;
      }

      const hasScores = state.scores.some(s =>
        parseInt(s.week) === week && parseInt(s.round) >= startRound && parseInt(s.round) < startRound + rounds
      );
      if (hasScores) { toast('Scores already exist for the selected round(s). Clear them first.', 'warn'); return; }

      // Ensure full pairings history is loaded before generating —
      // Phase 2 loads it in the background and may not have completed yet.
      // Without this, pastPairings is empty and historical penalties are ignored.
      if (!state._pairingsLoaded) {
        try {
          const fullData = await API.getAllData();
          state.pairings  = fullData.pairings  || [];
          state.scores    = fullData.scores    || [];
          state.standings = fullData.standings || [];
          state._pairingsLoaded = true;
        } catch (e) { /* non-fatal — generate with whatever is cached */ }
      }

      // Always fetch fresh attendance from server before generating —
      // avoids using stale cached data that could include wrong player counts.
      try {
        const attData = await API.getAttendance();
        if (attData && attData.attendance) state.attendance = attData.attendance;
      } catch (e) { /* non-fatal — use cached state.attendance if fetch fails */ }

      let courts = parseInt(state.config.courts || 3);
      const baseTries = parseInt(state.config.optimizerTries || 100);

      const presentPlayers = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        })
        .filter(p => !state._pairSkipPlayers.has(p.name))
        .filter(p => !state._arrangeSitOut.has(p.name))
        .map(p => p.name);

      const gameMode = state.config.gameMode || 'doubles';
      const singles  = gameMode === 'singles' || gameMode === 'fixed-pairs';
      const playersPerCourt = singles ? 2 : 4;
      if (presentPlayers.length < courts * playersPerCourt) {
        const maxCourts = Math.floor(presentPlayers.length / playersPerCourt);
        if (maxCourts === 0) { toast(`Not enough players to fill even one court (${presentPlayers.length} present, need ${playersPerCourt}). No pairings generated.`, 'warn'); return; }
        toast(`Only ${presentPlayers.length} players present — pairings generated for ${maxCourts} of ${courts} court${maxCourts !== 1 ? 's' : ''}. Remaining players will receive a bye.`, 'warn');
        courts = maxCourts; // ← actually use the capped value
      }

      const maxR = state.limits && state.limits.maxRounds;
      if (maxR !== null && maxR !== undefined && rounds > maxR) {
        toast(`Round limit exceeded: this league allows up to ${maxR} rounds per session.`, 'warn'); return;
      }

      const tries = baseTries;

      // Input hash — detect when inputs change so best is automatically reset
      const inputHash = JSON.stringify({
        week, scope, courts, gameMode,
        players: [...presentPlayers].sort().join(','), tries: baseTries,
        arrangeGrid: state._arrangeGrid ? JSON.stringify(state._arrangeGrid) : '',
      });
      const inputsChanged = !state.bestGeneration || state.bestGeneration.inputHash !== inputHash;
      if (forceFresh || inputsChanged) {
        state.bestGeneration = null;
        document.getElementById('btn-generate-fresh').classList.add('hidden');
      }

      gaEvent('generate_pairings', { session: week, mode: gameMode });
      const overlay    = document.getElementById('pairing-overlay');
      const overlayMsg = document.getElementById('pairing-overlay-msg');
      const totalTriesSoFar = (state.bestGeneration?.totalTries || 0) + tries;
      overlayMsg.textContent = state.bestGeneration
        ? `${tries} more iterations · ${totalTriesSoFar} total · ${presentPlayers.length} players`
        : `${tries} iterations · ${presentPlayers.length} players`;
      // If user was viewing 2nd best, reset to best before starting a new run
      if (state.bestGeneration) state.pendingPairings = state.bestGeneration.pairings;
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';

      // Yield to the browser so the overlay renders before we start heavy work
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

      // Run optimizer in a Web Worker so the main thread stays responsive
      // and the browser never shows an "unresponsive page" dialog.
      const pastPairings = state.pairings.filter(p => parseInt(p.week) < week);
      let   lockedThisWeek = state.pairings.filter(p => parseInt(p.week) === week && parseInt(p.round) < startRound);

      // ── Arrange-grid: build Round 1 from pre-arranged courts (Max tier) ──
      let arrangeRound1WithWeek = [];
      if (state._arrangeGrid && state._arrangeGrid.some(row => row.some(Boolean))) {
        const ppc = playersPerCourt;

        // Rank lookup (points or initialRank)
        const rankLookup = {};
        state.players.forEach(p => {
          const st = state.standings.find(s => s.player === p.name);
          rankLookup[p.name] = st ? (st.points || st.rank || 500) : (p.initialRank || 500);
        });

        // Past partner count helper
        const pastPairCount = (a, b) => pastPairings.filter(g =>
          ppc === 2
            ? (g.p1===a&&g.p3===b)||(g.p1===b&&g.p3===a)
            : (g.p1===a&&g.p2===b)||(g.p1===b&&g.p2===a)||(g.p3===a&&g.p4===b)||(g.p3===b&&g.p4===a)
        ).length;

        // Pool = present players not pre-placed (used to fill partial rows)
        const inGrid   = new Set(state._arrangeGrid.flat().filter(Boolean));
        let fillPool   = presentPlayers.filter(n => !inGrid.has(n));
        let courtNum   = 0;
        const round1   = [];

        // Slice to effective courts (courts is already capped by available players)
        state._arrangeGrid.slice(0, courts).forEach(row => {
          if (!row.some(Boolean)) return; // skip fully empty rows

          // Work with a positional copy so column indices are preserved.
          // Column layout: 0=T1P1, 1=T1P2, 2=T2P1, 3=T2P2  (or 0=P1, 1=P2 for singles).
          // The admin's placement IS the team assignment — never permute it.
          const slots = [...row]; // slots[ci] = name | null

          // Fill each empty slot with the best available player, scoring the
          // candidate against their would-be teammates (same-team columns).
          const emptySlots = slots.reduce((acc, v, i) => v ? acc : [...acc, i], []);
          for (const ci of emptySlots) {
            if (!fillPool.length) break;
            const teamCols = ppc === 2 ? [1 - ci] : (ci < 2 ? [0, 1] : [2, 3]);
            const teammates = teamCols.map(ti => slots[ti]).filter(Boolean);
            let bestIdx = 0, bestScore = Infinity;
            fillPool.forEach((cand, idx) => {
              let sc = 0;
              teammates.forEach(p => { sc += pastPairCount(cand, p) * 10; });
              const filled = slots.filter(Boolean);
              const ranks  = [...filled, cand].map(n => rankLookup[n] || 500);
              const mean   = ranks.reduce((s,v)=>s+v,0) / ranks.length;
              sc += ranks.reduce((s,v)=>s+(v-mean)**2,0) / ranks.length / 1000;
              if (sc < bestScore) { bestScore = sc; bestIdx = idx; }
            });
            slots[ci] = fillPool[bestIdx];
            fillPool.splice(bestIdx, 1);
          }

          if (slots.some(v => !v)) return; // still gaps — not enough players, skip

          courtNum++;
          // Column position determines team: use slots directly, no permutation.
          round1.push(ppc === 2
            ? { round: startRound, court: courtNum, p1: slots[0], p2: null,    p3: slots[1], p4: null,    type: 'game' }
            : { round: startRound, court: courtNum, p1: slots[0], p2: slots[1], p3: slots[2], p4: slots[3], type: 'game' }
          );
        });

        // Assign remaining fillPool players to the courts that had no pre-arranged players.
        // Sort by rank so the snake-draft below produces balanced matchups.
        if (fillPool.length >= ppc && courtNum < courts) {
          fillPool.sort((a, b) => (rankLookup[a] || 500) - (rankLookup[b] || 500));
          while (fillPool.length >= ppc && courtNum < courts) {
            const group = fillPool.splice(0, ppc);
            courtNum++;
            if (ppc === 2) {
              // Singles: best vs next-best
              round1.push({ round: startRound, court: courtNum, p1: group[0], p2: null, p3: group[1], p4: null, type: 'game' });
            } else {
              // Doubles snake-draft: [0,3] vs [1,2] balances rank when sorted ascending
              round1.push({ round: startRound, court: courtNum, p1: group[0], p2: group[3], p3: group[1], p4: group[2], type: 'game' });
            }
          }
          // Any players who didn't fit into a full court get byes for this round
          fillPool.forEach(name => {
            round1.push({ round: startRound, court: 0, p1: name, p2: null, p3: null, p4: null, type: 'bye' });
          });
          fillPool = [];
        }

        if (round1.length > 0) {
          lockedThisWeek = [...lockedThisWeek, ...round1]; // treat as locked history for optimizer
          arrangeRound1WithWeek = round1.map(p => ({ ...p, week }));
          startRound++;
          rounds--;

          // If arrange covers all rounds requested, skip optimizer entirely
          if (rounds <= 0) {
            const kept = state.pairings.filter(p =>
              parseInt(p.week) === week && parseInt(p.round) !== startRound - 1
            );
            state.pendingPairings = [...kept, ...arrangeRound1WithWeek]
              .sort((a,b) => parseInt(a.round)-parseInt(b.round));
            overlay.classList.add('hidden');
            overlay.style.display = 'none';
            document.getElementById('btn-lock-pairings').disabled = false;
            document.getElementById('optimizer-status').classList.add('hidden');
            document.getElementById('btn-generate-fresh').classList.add('hidden');
            toast(`Round ${startRound - 1} arranged — press Lock & Save to confirm.`);
            renderPairingsPreview();
            return;
          }
        }
      }

      const weights = {
        sessionPartnerWeight:  state.config.wSessionPartner  ?? Pairings.DEFAULTS.sessionPartnerWeight,
        sessionOpponentWeight: state.config.wSessionOpponent ?? Pairings.DEFAULTS.sessionOpponentWeight,
        historyPartnerWeight:  state.config.wHistoryPartner  ?? Pairings.DEFAULTS.historyPartnerWeight,
        historyOpponentWeight: state.config.wHistoryOpponent ?? Pairings.DEFAULTS.historyOpponentWeight,
        byeVarianceWeight:     state.config.wByeVariance     ?? Pairings.DEFAULTS.byeVarianceWeight,
        sessionByeWeight:      state.config.wSessionBye      ?? Pairings.DEFAULTS.sessionByeWeight,
        rankBalanceWeight:     state.config.wRankBalance      ?? Pairings.DEFAULTS.rankBalanceWeight,
        rankStdDevWeight:      state.config.wRankStdDev       ?? Pairings.DEFAULTS.rankStdDevWeight,
      };
      const playerGroups = {};
      state.players.forEach(p => { playerGroups[p.name] = p.group || 'M'; });

      const useLocalImprove = state.config.localImprove === undefined ? true : (state.config.localImprove === true || state.config.localImprove === 'true');
      const swapPasses = (v => isNaN(v) ? 5 : v)(parseInt(state.config.swapPasses));
      const useInitialRank = state.config.useInitialRank === true || state.config.useInitialRank === 'true';
      const verbose = document.getElementById('cfg-verbose-optimizer')?.checked === true;

      // Capture historical stats now so the result display can show what was loaded.
      // pastPairings.length = 0 means history is unavailable (race condition or first session).
      const pastGames    = pastPairings.filter(p => p.type === 'game' || !p.type);
      const priorWeeks   = [...new Set(pastPairings.map(p => parseInt(p.week)))].sort((a,b)=>a-b);
      const historyStats = { games: pastGames.length, sessions: priorWeeks.length };

      // In ladder-league mode use ladder-point rankings so the rank-balance /
      // rank-std-dev weights group similarly-skilled players together correctly.
      // state.standings is always win%-based and would give the wrong rank order.
      let optimizerStandings = state.standings;
      if ((state.config.standingsMethod || 'standard') === 'ladder') {
        const initRankMap = {};
        state.standings.forEach(s => { if (s.rank && s.rank !== '-') initRankMap[s.name] = parseInt(s.rank); });
        state.players.forEach(p => { if (initRankMap[p.name] == null && p.initialRank) initRankMap[p.name] = p.initialRank; });
        optimizerStandings = Reports.computeLadderStandings(
          state.scores, state.players, state.pairings, null, state.attendance, state.config, initRankMap
        );
      }

      const workerParams = {
        presentPlayers, courts, rounds, pastPairings, tries, weights,
        standings: optimizerStandings, gameMode, playerGroups,
        startRound, sessionHistory: lockedThisWeek, players: state.players,
        useLocalImprove, swapPasses, useInitialRank, verbose,
      };

      // Derive worker URL from the page location so it works on any deployment.
      const workerUrl = new URL('js/pairing-worker.js', window.location.href).href;

      // Run optimizer in a Web Worker so the main thread stays responsive.
      // Falls back to chunked async execution if workers aren't available.
      const runOptimize = () => new Promise((resolve, reject) => {
        // Try Worker first
        if (typeof Worker !== 'undefined') {
          try {
            const worker = new Worker(workerUrl);
            worker.onmessage = (e) => {
              if (e.data.progress) {
                const { phase, iteration, tries: t } = e.data;
                const pct = Math.round((iteration / t) * 100);
                overlayMsg.textContent = phase === 'swap'
                  ? `Iteration ${iteration}/${t} · Swap optimising… (${pct}%)`
                  : `Iteration ${iteration}/${t} · Generating… (${pct}%)`;
                return;
              }
              worker.terminate();
              if (e.data.ok) resolve(e.data.result);
              else reject(new Error(e.data.error));
            };
            worker.onerror = () => {
              worker.terminate();
              // Worker failed to load — run in chunks on main thread
              runInChunks(resolve, reject);
            };
            worker.postMessage(workerParams);
            return;
          } catch (e) { /* fall through */ }
        }
        // No Worker support — run in chunks
        runInChunks(resolve, reject);
      });

      // Chunked fallback: runs batches of attempts with setTimeout(0) between
      // each batch so the browser can repaint and stay responsive.
      function runInChunks(resolve, reject) {
        const CHUNK = 25; // attempts per chunk — larger = fewer setTimeout yields = faster overall
        let remaining = workerParams.tries;
        let best = null;
        let cancelled = false;
        const accumulatedScores = workerParams.verbose ? [] : null;

        // Cancel if user navigates away from pairings page mid-generation
        const cancelIfNavAway = () => {
          const onPairings = document.getElementById('page-pairings')?.classList.contains('active');
          if (!onPairings) { cancelled = true; overlay.classList.add('hidden'); overlay.style.display = 'none'; }
        };

        // We run optimize with small try counts and accumulate the best result
        function nextChunk() {
          cancelIfNavAway();
          if (cancelled) {
            resolve(best || { pairings: null, score: Infinity, error: 'Generation cancelled.' });
            return;
          }
          try {
            const batchTries = Math.min(CHUNK, remaining);
            const res = Pairings.optimize({ ...workerParams, tries: batchTries });

            // Accumulate all scores across chunks
            if (accumulatedScores && res.allScores) {
              accumulatedScores.push(...res.allScores);
            }

            // Only consider valid results (pairings may be null if not enough players)
            if (res.pairings) {
              if (!best || res.score < best.score) {
                // New best — demote old best to second if better than current second
                if (best && best.pairings) {
                  if (!res.secondPairings || best.score < res.secondScore) {
                    res.secondPairings  = best.pairings;
                    res.secondScore     = best.score;
                    res.secondBreakdown = best.breakdown;
                  }
                }
                best = res;
              } else if (!best.secondPairings || res.score < best.secondScore) {
                // This chunk's best is worse than overall best but better than current 2nd
                best.secondPairings  = res.pairings;
                best.secondScore     = res.score;
                best.secondBreakdown = res.breakdown;
              }
            }

            remaining -= batchTries;
            overlayMsg.textContent = `${workerParams.tries - remaining}/${workerParams.tries} iterations · ${workerParams.presentPlayers.length} players`;
            if (remaining > 0) {
              setTimeout(nextChunk, 0);
            } else {
              // Attach accumulated scores to final result
              if (accumulatedScores && best) best.allScores = accumulatedScores;
              resolve(best || { pairings: null, score: Infinity, error: 'No valid pairings could be generated.' });
            }
          } catch (err) {
            reject(err);
          }
        }
        setTimeout(nextChunk, 0);
      }

      runOptimize().then(({ pairings: result, score, breakdown, normalizedWeights, error, secondPairings, secondScore, secondBreakdown, allScores }) => {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
          if (error) { toast(error, 'error'); return; }
          if (!result) { toast('No valid pairings could be generated — check player count and court settings.', 'error'); return; }

          if (gameMode === 'mixed-doubles' && breakdown?.mixedViolations?.raw > 0) {
            toast(`⚠️ Mixed doubles: ${breakdown.mixedViolations.raw} same-gender partnership(s) could not be avoided — check player groups and attendance.`, 'warn');
          }

          // ── Keep best — only replace pairings if this attempt scored better ──
          const previousBest  = state.bestGeneration;
          const isImprovement = !previousBest || score < previousBest.score;

          if (isImprovement) {
            const otherRounds = state.pairings.filter(p =>
              parseInt(p.week) === week &&
              (parseInt(p.round) < startRound || parseInt(p.round) >= startRound + rounds)
            );
            const newRounds = result.map(p => ({ ...p, week, round: p.round + startRound - 1 }));
            const sortPairings = arr => arr.sort((a,b) => parseInt(a.round)-parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, {numeric:true}));
            const merged = sortPairings([...otherRounds, ...arrangeRound1WithWeek, ...newRounds]);

            state.bestGeneration = {
              score, pairings: merged, breakdown, normalizedWeights, inputHash,
              totalTries: totalTriesSoFar,
              secondPairings: secondPairings ? sortPairings([...arrangeRound1WithWeek, ...secondPairings.map(p => ({ ...p, week, round: p.round + startRound - 1 }))]) : null,
              secondScore, secondBreakdown,
              allScores: allScores ? [...(previousBest?.allScores || []), ...allScores] : null,
            };
            state.pendingPairings = merged;
          }

          const best        = state.bestGeneration;
          const improvedEl  = document.getElementById('optimizer-improved');
          if (previousBest) {
            if (isImprovement) {
              const delta = previousBest.score - score;
              improvedEl.innerHTML = `<span style="color:var(--green);">▲ Improved by ${delta.toFixed(1)}</span>`;
            } else {
              improvedEl.innerHTML = `<span style="color:var(--muted);">No improvement this attempt</span>`;
            }
          } else {
            improvedEl.innerHTML = '';
          }

          // Accumulate allScores across runs even when not improving
          if (allScores && allScores.length) {
            if (!state.bestGeneration.allScores) state.bestGeneration.allScores = [];
            // Only push scores not already accumulated during the isImprovement branch
            if (!isImprovement) state.bestGeneration.allScores.push(...allScores);
          }

          document.getElementById('optimizer-status').classList.remove('hidden');
          document.getElementById('optimizer-score').textContent = best.score.toFixed(1);
          const swapInfo = useLocalImprove ? ` · swap ${swapPasses} passes` : ' · no swap';
          document.getElementById('optimizer-msg').textContent =
            `${best.totalTries} iterations${swapInfo} · ${courts} court${courts!==1?'s':''} · ${presentPlayers.length} players — press again to keep searching`;
          document.getElementById('btn-generate-fresh').classList.remove('hidden');

          const LABELS = {
            mixedViolations: 'Mixed doubles violations',
            sessionPartner:  'Repeat Partner (this session)',
            sessionOpponent: 'Repeat Opponent (this session)',
            historyPartner:  'Repeat Partner (prior weeks)',
            historyOpponent: 'Repeat Opponent (prior weeks)',
            sessionBye:      'Byes this session',
            byeVariance:     'Bye spread (season)',
            rankBalance:     'Rank imbalance',
            rankStdDev:      'Rank std dev (all-player spread)',
          };
          const USER_WEIGHT_KEYS = {
            sessionPartner:  'sessionPartnerWeight',  sessionOpponent: 'sessionOpponentWeight',
            historyPartner:  'historyPartnerWeight',  historyOpponent: 'historyOpponentWeight',
            sessionBye:      'sessionByeWeight',      byeVariance:     'byeVarianceWeight',
            rankBalance:     'rankBalanceWeight',      rankStdDev:      'rankStdDevWeight',
          };

          // ── Breakdown table renderer ────────────────────────
          function renderBreakdownTable(bd, nw, label) {
            if (!bd) return '';
            let bhtml = `<table style="font-size:0.78rem; width:100%; border-collapse:collapse; margin-top:4px;">
              <thead><tr>
                <th style="text-align:left; padding:3px 8px; color:var(--muted); font-weight:500;">${label || 'Criterion'}</th>
                <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Raw</th>
                <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">User Weight</th>
                <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Norm. Weight</th>
                <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Score</th>
              </tr></thead><tbody>`;
            Object.entries(bd).forEach(([key, v]) => {
              const nonzero = v.weighted > 0;
              const wKey  = USER_WEIGHT_KEYS[key];
              const userW = wKey ? (weights[wKey] ?? Pairings.DEFAULTS[wKey] ?? '—') : '—';
              const normW = (wKey && nw?.[wKey] != null) ? nw[wKey].toFixed(2) : '—';
              bhtml += `<tr style="${nonzero ? 'color:var(--white);' : 'color:var(--muted);'}">
                <td style="padding:3px 8px;">${LABELS[key] || key}</td>
                <td style="text-align:right; padding:3px 8px;">${typeof v.raw === 'number' ? v.raw.toFixed(2) : '—'}</td>
                <td style="text-align:right; padding:3px 8px;">${userW}</td>
                <td style="text-align:right; padding:3px 8px; color:var(--muted);">${normW}</td>
                <td style="text-align:right; padding:3px 8px; font-weight:${nonzero?'600':'400'};">${typeof v.weighted === 'number' ? v.weighted.toFixed(1) : '—'}</td>
              </tr>`;
            });
            bhtml += `</tbody></table>`;
            return bhtml;
          }

          // Historical context note — shown above breakdown table.
          // Lets the admin verify history was loaded even when raw repeat counts are 0
          // (which just means the optimizer successfully avoided all historical repeats).
          const histNote = historyStats.games > 0
            ? `<div style="font-size:0.74rem; color:var(--muted); margin-bottom:4px;">` +
              `Historical data: ${historyStats.games} game${historyStats.games!==1?'s':''} from ` +
              `${historyStats.sessions} prior session${historyStats.sessions!==1?'s':''} loaded — ` +
              `"Repeat" rows show repeats <em>in the generated output</em>; 0 means the optimizer avoided all historical repeats.</div>`
            : `<div style="font-size:0.74rem; color:var(--gold); margin-bottom:4px;">` +
              `⚠ No historical pairing data found — this is either Session 1 or history failed to load.</div>`;

          // Show best breakdown by default
          document.getElementById('optimizer-breakdown').innerHTML =
            histNote + renderBreakdownTable(best.breakdown, best.normalizedWeights, `Criterion — Best (score ${best.score.toFixed(1)})`);

          // ── 2nd best toggle ─────────────────────────────────
          const secondBtn = document.getElementById('btn-show-second');
          if (best.secondBreakdown && best.secondScore < Infinity && best.secondPairings) {
            secondBtn.classList.remove('hidden');
            secondBtn.dataset.showing = 'best';
            // Remove any previous listener by cloning
            const freshBtn = secondBtn.cloneNode(true);
            secondBtn.parentNode.replaceChild(freshBtn, secondBtn);
            freshBtn.addEventListener('click', () => {
              const showing = freshBtn.dataset.showing;
              if (showing === 'best') {
                // Switch to 2nd best
                document.getElementById('optimizer-breakdown').innerHTML =
                  histNote + renderBreakdownTable(best.secondBreakdown, best.normalizedWeights,
                    `Criterion — 2nd Best (score ${best.secondScore.toFixed(1)})`);
                document.getElementById('optimizer-score').textContent = best.secondScore.toFixed(1);
                state.pendingPairings = best.secondPairings;
                freshBtn.textContent = 'Show Best';
                freshBtn.dataset.showing = 'second';
              } else {
                // Switch back to best
                document.getElementById('optimizer-breakdown').innerHTML =
                  histNote + renderBreakdownTable(best.breakdown, best.normalizedWeights,
                    `Criterion — Best (score ${best.score.toFixed(1)})`);
                document.getElementById('optimizer-score').textContent = best.score.toFixed(1);
                state.pendingPairings = best.pairings;
                freshBtn.textContent = 'Show 2nd Best';
                freshBtn.dataset.showing = 'best';
              }
              renderPairingsPreview();
            });
          } else {
            secondBtn.classList.add('hidden');
          }

          // ── Score distribution histogram (verbose mode only) ─
          const distEl = document.getElementById('optimizer-distribution');
          const scores = best.allScores;
          if (scores && scores.length > 1) {
            distEl.style.display = '';
            const minS = Math.min(...scores);
            const maxS = Math.max(...scores);
            const range = maxS - minS || 1;
            const BINS = Math.min(20, Math.ceil(Math.sqrt(scores.length)));
            const binSize = range / BINS;
            const bins = Array(BINS).fill(0);
            scores.forEach(s => {
              const idx = Math.min(BINS - 1, Math.floor((s - minS) / binSize));
              bins[idx]++;
            });
            const maxBin = Math.max(...bins);
            const BAR_H = 40; // max bar height px

            let dhtml = `<div style="font-size:0.75rem; color:var(--muted); margin-bottom:6px; letter-spacing:0.06em; text-transform:uppercase;">
              Score Distribution — ${scores.length} attempts · best ${minS.toFixed(1)} · worst ${maxS.toFixed(1)} · spread ${range.toFixed(1)}
            </div>`;
            dhtml += `<div style="display:flex; align-items:flex-end; gap:2px; height:${BAR_H + 18}px;">`;
            bins.forEach((count, i) => {
              const h = maxBin > 0 ? Math.round((count / maxBin) * BAR_H) : 0;
              const lo = (minS + i * binSize).toFixed(1);
              const hi = (minS + (i + 1) * binSize).toFixed(1);
              const isBest = (minS + i * binSize) <= minS && minS < (minS + (i + 1) * binSize);
              const color = isBest ? 'var(--green)' : 'rgba(122,155,181,0.5)';
              dhtml += `<div style="display:flex; flex-direction:column; align-items:center; flex:1; min-width:0;" title="${count} attempt${count!==1?'s':''}: ${lo}–${hi}">
                <div style="font-size:0.6rem; color:var(--muted); margin-bottom:1px;">${count||''}</div>
                <div style="width:100%; height:${h}px; background:${color}; border-radius:2px 2px 0 0; min-height:${count>0?2:0}px;"></div>
                <div style="font-size:0.6rem; color:var(--muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i===0||i===BINS-1?lo:''}</div>
              </div>`;
            });
            dhtml += `</div>`;
            distEl.innerHTML = dhtml;
          } else {
            distEl.style.display = 'none';
          }

          document.getElementById('btn-lock-pairings').disabled = false;
          renderPairingsPreview();
        }).catch(err => {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
          toast('Generation failed: ' + err.message, 'error');
        });
    }

    // Lock pairings
    document.getElementById('btn-lock-pairings').addEventListener('click', async () => {
      if (!state.pendingPairings) return;
      state._pairSkipPlayers.clear(); // skips only apply until pairings are locked
      state._arrangeGrid   = null;    // reset arrange grid after locking
      state._arrangeSitOut = new Set();
      const week = state.currentPairWeek;
      showLoading(true);
      try {
        // Preserve tourn-game as a distinct type so tournament sessions
        // can be detected later. Only tourn-bye normalizes to bye.
        const normalizedPairings = state.pendingPairings.map(p => ({
          ...p,
          type: p.type === 'tourn-bye' ? 'bye'
              : (p.type === 'tourn-game' || p.type === 'tourn-loser-game' || p.type === 'tourn-grand-final') ? 'tourn-game'
              : p.type
        }));

        // For tournament mode, merge new round with existing locked rounds.
        // For regular mode, pendingPairings already contains all rounds for
        // the week (merged during generation) so replace the whole week.
        const inTournament = !!state.tournaments[week];
        let finalPairings;
        if (inTournament) {
          const existingWeek = state.pairings.filter(p => parseInt(p.week) === week);
          const newRounds = new Set(normalizedPairings.map(p => p.round));
          // Keep existing rounds not covered by the new lock, add new rounds
          finalPairings = [
            ...existingWeek.filter(p => !newRounds.has(p.round)),
            ...normalizedPairings,
          ].sort((a,b) => a.round - b.round);
        } else {
          finalPairings = normalizedPairings;
        }

        await API.savePairings(week, finalPairings);
        // Update local state
        state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        state.pairings.push(...finalPairings);
        state.pendingPairings = null;
        state.bestGeneration  = null;
        document.getElementById('btn-generate-fresh')?.classList.add('hidden');
        document.getElementById('btn-lock-pairings').disabled = true;
        toast(`Pairings for Session ${week} saved!`);
        renderPairingsPreview();
        renderScoresheet();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Clear pairings (and scores for that week)
    document.getElementById('btn-clear-pairings').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot delete pairings.', 'warn'); return; }
      const week = state.currentPairWeek;
      const scope = document.getElementById('round-scope')?.value || 'all';
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(
        state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
      )].sort((a,b)=>a-b);

      // Determine which rounds to clear
      let clearRounds;
      if (scope === 'all') {
        clearRounds = null; // all rounds
      } else if (scope === 'remaining') {
        // "Remaining" for clear = rounds with no scores entered yet
        const scoredRounds = new Set(
          state.scores
            .filter(s => parseInt(s.week) === week && (s.score1 !== '' && s.score1 !== null && s.score2 !== '' && s.score2 !== null))
            .map(s => parseInt(s.round))
        );
        clearRounds = lockedRounds.filter(r => !scoredRounds.has(r));
        if (!clearRounds.length) {
          toast(`No unscored rounds to clear for Session ${week}.`, 'warn');
          return;
        }
      } else {
        clearRounds = [parseInt(scope)];
      }

      const scopeLabel = scope === 'all' ? `all rounds of Session ${week}`
        : scope === 'remaining' ? `${clearRounds.length} unscored round${clearRounds.length !== 1 ? 's' : ''} of Session ${week} (Round${clearRounds.length !== 1 ? 's' : ''} ${clearRounds.join(', ')})`
        : `Round ${scope} of Session ${week}`;

      const affectedScores = state.scores.filter(s =>
        parseInt(s.week) === week &&
        (!clearRounds || clearRounds.includes(parseInt(s.round)))
      );
      const msg = affectedScores.length
        ? `Clear pairings AND scores for ${scopeLabel}? This cannot be undone.`
        : `Clear pairings for ${scopeLabel}?`;
      if (!confirm(msg)) return;

      showLoading(true);
      try {
        if (clearRounds) {
          // Partial clear — keep other rounds, save updated set
          const kept = state.pairings.filter(p =>
            parseInt(p.week) !== week || !clearRounds.includes(parseInt(p.round))
          );
          const weekKept = kept.filter(p => parseInt(p.week) === week);
          await API.savePairings(week, weekKept);
          state.pairings = kept;
        } else {
          // Clear entire week
          await API.savePairings(week, []);
          state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        }
        state.pendingPairings = null;
        state.bestGeneration  = null;
        document.getElementById('btn-generate-fresh')?.classList.add('hidden');

        if (affectedScores.length) {
          const keptScores = state.scores.filter(s =>
            parseInt(s.week) !== week || !(!clearRounds || clearRounds.includes(parseInt(s.round)))
          );
          const weekKeptScores = keptScores.filter(s => parseInt(s.week) === week);
          await API.saveScores(week, weekKeptScores);
          state.scores = keptScores;
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance, state.config.pairingMode);
        }
        toast(`${scopeLabel.charAt(0).toUpperCase() + scopeLabel.slice(1)} cleared.`);
        renderPairingsPreview();
        renderScoresheet();
      } catch (e) { toast('Failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Save scores
    document.getElementById('btn-save-scores').addEventListener('click', async () => {
      const week = state.currentScoreWeek;
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));
      const scores = [];

      document.querySelectorAll('#scoresheet [data-round]').forEach(card => {
        const round = card.dataset.round;
        const court = card.dataset.court;
        const pairing = weekPairings.find(p => String(p.round) === String(round) && String(p.court) === String(court));
        if (!pairing) return;
        const s1 = card.querySelector('[data-score="1"]').value;
        const s2 = card.querySelector('[data-score="2"]').value;
        if (s1 !== '' || s2 !== '') {
          scores.push({
            week, round: parseInt(round), court,
            p1: pairing.p1, p2: pairing.p2,
            score1: parseInt(s1) || 0,
            p3: pairing.p3, p4: pairing.p4,
            score2: parseInt(s2) || 0
          });
        }
      });

      // Warn about partially-entered scores (one side filled, other blank)
      document.querySelectorAll('#scoresheet [data-round]').forEach(card => {
        const s1 = card.querySelector('[data-score="1"]')?.value;
        const s2 = card.querySelector('[data-score="2"]')?.value;
        if ((s1 !== '' && s2 === '') || (s1 === '' && s2 !== '')) {
          const round = card.dataset.round;
          const court = card.dataset.court;
          card.style.outline = '2px solid var(--danger)';
          setTimeout(() => card.style.outline = '', 4000);
        }
      });
      const partial = [...document.querySelectorAll('#scoresheet [data-round]')].filter(card => {
        const s1 = card.querySelector('[data-score="1"]')?.value;
        const s2 = card.querySelector('[data-score="2"]')?.value;
        return (s1 !== '' && s2 === '') || (s1 === '' && s2 !== '');
      });
      if (partial.length) {
        if (!confirm(`⚠️ ${partial.length} game(s) have only one score entered. They will not be saved.\n\nSave the complete scores anyway?`)) return;
      }

      // Warn if any scores being saved would overwrite existing different scores
      const overwritten = scores.filter(s => {
        const existing = state.scores.find(e =>
          parseInt(e.week) === week && parseInt(e.round) === s.round && String(e.court) === String(s.court)
        );
        return existing &&
          (String(existing.score1) !== String(s.score1) || String(existing.score2) !== String(s.score2));
      });
      if (isAssistant && overwritten.length) {
        toast('Scores already exist for some games. Admin assistants cannot overwrite existing scores.', 'warn');
        return;
      }
      if (overwritten.length) {
        const msg = overwritten.map(s => {
          const ex = state.scores.find(e =>
            parseInt(e.week) === week && parseInt(e.round) === s.round && String(e.court) === String(s.court)
          );
          return `Round ${s.round} ${courtName(s.court)}: existing ${ex.score1}–${ex.score2} → new ${s.score1}–${s.score2}`;
        }).join('\n');
        if (!confirm(`⚠️ These scores already exist and will be overwritten:\n${msg}\n\nSave anyway?`)) return;
      }

      // Warn on suspicious scores before saving
      const negatives = scores.filter(s => s.score1 < 0 || s.score2 < 0);
      if (negatives.length) {
        const msg = negatives.map(s => `Round ${s.round} ${courtName(s.court)}: ${s.score1}–${s.score2}`).join(', ');
        if (!confirm(`⚠️ Negative scores detected:\n${msg}\n\nSave anyway?`)) return;
      }
      const overMax = scores.filter(s => s.score1 > 20 || s.score2 > 20);
      if (overMax.length) {
        const msg = overMax.map(s => `Round ${s.round} ${courtName(s.court)}: ${s.score1}–${s.score2}`).join(', ');
        if (!confirm(`⚠️ Scores over 20 detected:\n${msg}\n\nSave anyway?`)) return;
      }
      const ties = scores.filter(s => s.score1 === s.score2);
      if (ties.length) {
        const msg = ties.map(s => `Round ${s.round} ${courtName(s.court)}: ${s.score1}–${s.score2}`).join(', ');
        if (!confirm(`⚠️ Tied scores detected:\n${msg}\n\nSave anyway?`)) return;
      }

      showLoading(true);
      try {
        await API.saveScores(week, scores);
        state.scores = state.scores.filter(s => parseInt(s.week) !== week);
        state.scores.push(...scores);
        // Refresh standings
        state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance, state.config.pairingMode);
        toast(`Scores for Session ${week} saved!`);
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Send session email report
    document.getElementById('btn-send-report').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot send email reports.', 'warn'); return; }
      const week = state.currentScoreWeek;
      const adminOnly = state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true';
      const recipients = state.players.filter(p => p.active === true && p.notify && p.email);

      if (adminOnly) {
        if (!state.config.replyTo) {
          toast('Admin-only email is enabled but no Admin Email is set. Set it on the Messaging page.', 'warn');
          return;
        }
        if (!confirm(`Send Session ${week} results to admin (${state.config.replyTo})?`)) return;
      } else {
        if (!recipients.length) {
          toast('No players have email notifications enabled.', 'warn');
          return;
        }
        if (!confirm(`Send Session ${week} results to ${recipients.length} player(s)${state.config.replyTo ? ' + admin' : ''}?`)) return;
      }

      // Build report data
      const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));
      const weekStand    = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week, state.config.rankingMethod, state.attendance, state.config.pairingMode);
      const seasonStand  = Reports.computeStandings(state.scores, state.players, state.pairings);
      const weekDate     = formatDateTime(week, state.config);

      showLoading(true);
      try {
        await API.sendWeeklyReport({ relayConfig: getRelayConfig(),
          week,
          weekDate,
          leagueName:   Auth.getSession()?.leagueName || state.config.leagueName || 'League',
          location:     state.config.location   || '',
          sessionTime:  state.config.sessionTime || '',
          notes:        state.config.notes       || '',
          replyTo:      state.config.replyTo     || '',
          leagueUrl:    getLeagueUrl(),
          weekScores,
          weekPairings,
          weekStandings:  weekStand,
          seasonStandings: seasonStand,
          recipients:   (() => {
            const list = adminOnly && state.config.replyTo
              ? []
              : recipients.map(p => ({ name: p.name, email: p.email }));
            // Always include admin email when set (as CC on player sends, or sole recipient in admin-only mode)
            if (state.config.replyTo && !list.find(r => r.email === state.config.replyTo)) {
              list.push({ name: 'Admin', email: state.config.replyTo });
            }
            return list;
          })(),
          courtNames:   Object.fromEntries(
            Array.from({ length: parseInt(state.config.courts || 3) }, (_, i) => {
              const cn = i + 1;
              const perSess = state.config.courtNamesPerSession === true || state.config.courtNamesPerSession === 'true';
              const sName = perSess ? state.config[`courtName_${cn}_w${week}`] : null;
              return [cn, (sName && sName.trim()) ? sName.trim() : (state.config['courtName_' + cn] || ('Court ' + cn))];
            })
          ),
        });
        const actualCount = adminOnly && state.config.replyTo ? 1 : recipients.length + (state.config.replyTo ? 1 : 0);
        toast(`Session ${week} results sent to ${actualCount} recipient(s)!`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Player report select
    document.getElementById('report-player-select').addEventListener('change', e => {
      renderPlayerReport(e.target.value);
      document.getElementById('btn-email-player-report').disabled = !e.target.value;
    });

    document.getElementById('btn-email-player-report').addEventListener('click', async () => {
      const playerName = document.getElementById('report-player-select').value;
      if (!playerName) return;
      const player = state.players.find(p => p.name === playerName);
      if (!player || !player.email) {
        toast(`${playerName} has no email address on file.`, 'warn'); return;
      }
      if (!confirm(`Email report for ${playerName} to ${player.email}?`)) return;
      const report = Reports.computePlayerReport(playerName, state.scores, state.standings);
      showLoading(true);
      try {
        await API.sendPlayerReport({ relayConfig: getRelayConfig(),
          playerName,
          email: player.email,
          report,
          leagueName: Auth.getSession()?.leagueName || state.config.leagueName || 'League',
          replyTo:    state.config.replyTo    || '',
        });
        toast(`Report emailed to ${player.email}.`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // ── Import league from JSON file ────────────────────────────
    let _importData = null;

    document.getElementById('btn-show-import-league')?.addEventListener('click', () => {
      document.getElementById('import-league-form').classList.remove('hidden');
      document.getElementById('add-league-form').classList.add('hidden');
    });

    document.getElementById('btn-cancel-import-league')?.addEventListener('click', () => {
      document.getElementById('import-league-form').classList.add('hidden');
      _importData = null;
    });

    document.getElementById('import-file')?.addEventListener('change', function() {
      const file    = this.files[0];
      const infoEl  = document.getElementById('import-file-info');
      const errEl   = document.getElementById('import-error');
      infoEl.style.display = 'none';
      errEl.style.display  = 'none';
      _importData = null;
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const parsed = JSON.parse(ev.target.result);
          if (!parsed.exportVersion) throw new Error('Not a valid League Manager export file (missing exportVersion)');
          _importData = parsed;
          // Pre-fill fields from file metadata
          const idEl   = document.getElementById('import-league-id');
          const nameEl = document.getElementById('import-league-name');
          if (idEl   && !idEl.value   && parsed.leagueId)   idEl.value   = (parsed.leagueId   + '-copy').replace(/[^a-z0-9-]/g, '-');
          if (nameEl && !nameEl.value && parsed.leagueName) nameEl.value = parsed.leagueName + ' (copy)';
          // Show summary
          infoEl.innerHTML = [
            '✓ <strong>' + esc(parsed.leagueName || '(unnamed)') + '</strong>',
            'Exported: ' + (parsed.exportDate ? new Date(parsed.exportDate).toLocaleDateString() : 'unknown'),
            [
              ((parsed.players    || []).length) + ' players',
              ((parsed.pairings   || []).length) + ' pairings',
              ((parsed.scores     || []).length) + ' scores',
              ((parsed.attendance || []).length) + ' attendance records',
              ((parsed.challenges || []).length) + ' challenges',
            ].filter(s => !s.startsWith('0')).join(' · '),
          ].join('<br>');
          infoEl.style.display = '';
        } catch(err) {
          errEl.textContent = 'Invalid file: ' + err.message;
          errEl.style.display = '';
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btn-import-league')?.addEventListener('click', async () => {
      const errEl   = document.getElementById('import-error');
      errEl.style.display = 'none';
      if (!_importData) { errEl.textContent = 'Please select a JSON backup file first.'; errEl.style.display = ''; return; }
      const newId   = (document.getElementById('import-league-id')?.value   || '').trim();
      const newName = (document.getElementById('import-league-name')?.value  || '').trim();
      const pin     = (document.getElementById('import-admin-pin')?.value    || '').trim();
      if (!newId)   { errEl.textContent = 'League ID is required.';       errEl.style.display = ''; return; }
      if (!newName) { errEl.textContent = 'League name is required.';     errEl.style.display = ''; return; }
      if (!pin)     { errEl.textContent = 'Admin password is required.';  errEl.style.display = ''; return; }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(newId)) {
        errEl.textContent = 'League ID must start with a letter or digit and contain only lowercase letters, numbers, and hyphens.';
        errEl.style.display = ''; return;
      }
      const btn = document.getElementById('btn-import-league');
      btn.disabled = true; btn.textContent = '⏳ Importing…';
      showLoading(true);
      try {
        const result = await API.importLeague(newId, newName, pin, _importData);
        if (!result || result.error) throw new Error(result?.error || 'Import failed');
        let msg = `"${newName}" created successfully`;
        if (result.warnings && result.warnings.length) msg += ' with warnings: ' + result.warnings.join('; ');
        showToast(msg, 'success', 8000);
        document.getElementById('import-league-form').classList.add('hidden');
        ['import-file','import-league-id','import-league-name','import-admin-pin'].forEach(id => {
          const el = document.getElementById(id); if (el) el.value = '';
        });
        document.getElementById('import-file-info').style.display = 'none';
        _importData = null;
        await renderLeagues();
      } catch(err) {
        errEl.textContent = 'Import failed: ' + err.message;
        errEl.style.display = '';
      } finally {
        btn.disabled = false; btn.textContent = '⬆ Import League';
        showLoading(false);
      }
    });

    // Add league toggle
    document.getElementById('btn-show-add-league').addEventListener('click', () => {
      document.getElementById('add-league-form').classList.remove('hidden');
      document.getElementById('btn-show-add-league').classList.add('hidden');
      // Auto-populate Customer ID from current league if available
      const sess = Auth.getSession();
      const custField = document.getElementById('new-league-customer-id');
      if (custField && !custField.value) {
        // Try current league's customerId from loaded leagues
        API.getLeaguesAll().then(data => {
          const me = (data.leagues || []).find(l => l.leagueId === sess?.leagueId);
          if (me && me.customerId) custField.value = me.customerId;
          // Fallback: sessionStorage (set from ?id= URL param)
          else {
            const stored = sessionStorage.getItem('pb_customer_id');
            if (stored) custField.value = stored;
          }
        }).catch(() => {
          const stored = sessionStorage.getItem('pb_customer_id');
          if (stored && custField) custField.value = stored;
        });
      }
    });

    document.getElementById('btn-cancel-add-league').addEventListener('click', () => {
      document.getElementById('add-league-form').classList.add('hidden');
      document.getElementById('btn-show-add-league').classList.remove('hidden');
      document.getElementById('new-league-customer-id').value = '';
    });

    document.getElementById('new-league-storage').addEventListener('change', function() {
      const sheetGroup  = document.getElementById('new-league-sheet-group');
      const pinGroup    = document.getElementById('new-league-pin-group');
      const ownSbGroup  = document.getElementById('new-league-own-sb-group');
      const isSupabase  = this.value === 'supabase';
      const isOwnSb     = this.value === 'supabase-own';
      sheetGroup.style.display = (isSupabase || isOwnSb) ? 'none' : '';
      if (pinGroup)   pinGroup.classList.toggle('hidden',   !(isSupabase || isOwnSb));
      if (ownSbGroup) ownSbGroup.classList.toggle('hidden', !isOwnSb);
      // Populate the SQL preview textarea when the own-supabase option is first shown
      if (isOwnSb) {
        const sqlEl = document.getElementById('own-sb-sql-preview');
        if (sqlEl && !sqlEl.value) { _loadOwnSbSql(sqlEl); }
      }
    });

    // ── Self-hosted Supabase helpers ───────────────────────────
    function _loadOwnSbSql(el) {
      // Fetch the SQL setup script from the same directory and display it
      fetch('supabase_setup.sql')
        .then(r => r.ok ? r.text() : Promise.reject(r.status))
        .then(sql => { if (el) el.value = sql; })
        .catch(() => {
          if (el) el.value = '-- Could not load supabase_setup.sql\n-- Please copy it manually from the repository.';
        });
    }

    document.addEventListener('click', async function(e) {
      if (e.target && e.target.id === 'btn-copy-sb-sql') {
        const sqlEl = document.getElementById('own-sb-sql-preview');
        if (!sqlEl || !sqlEl.value) { toast('SQL not loaded yet.', 'warn'); return; }
        try {
          await navigator.clipboard.writeText(sqlEl.value);
          toast('SQL copied to clipboard!');
        } catch {
          sqlEl.select();
          document.execCommand('copy');
          toast('SQL copied!');
        }
      }
      if (e.target && e.target.id === 'btn-validate-sb') {
        const urlEl = document.getElementById('new-league-sb-url');
        const keyEl = document.getElementById('new-league-sb-key');
        const url   = urlEl?.value.trim() || '';
        const key   = keyEl?.value.trim() || '';
        if (!url || !key) { toast('Enter the Supabase URL and service_role key first.', 'warn'); return; }
        e.target.disabled = true;
        e.target.textContent = 'Validating…';
        try {
          const res = await API.validateOwnSupabase(url, key);
          if (res.success) {
            toast(`Connection OK — all ${res.tables.length} tables found.`);
          } else if (res.missing && res.missing.length) {
            toast('Connected, but missing tables: ' + res.missing.join(', ') + '. Run the setup SQL script.', 'warn');
          } else {
            toast('Validation failed: ' + (res.error || 'Unknown error'), 'error');
          }
        } catch (err) { toast('Validation failed: ' + err.message, 'error'); }
        finally { e.target.disabled = false; e.target.textContent = 'Validate Connection'; }
      }
    });

    document.getElementById('btn-save-new-league').addEventListener('click', async () => {
      const leagueId = document.getElementById('new-league-id').value.trim().replace(/\s+/g, '-');
      const name     = document.getElementById('new-league-name').value.trim();
      const sheetId  = document.getElementById('new-league-sheet').value.trim();
      const storage     = document.getElementById('new-league-storage')?.value || 'google';
      const adminPin    = document.getElementById('new-league-admin-pin')?.value.trim() || '';
      const supabaseUrl = document.getElementById('new-league-sb-url')?.value.trim() || '';
      const supabaseKey = document.getElementById('new-league-sb-key')?.value.trim() || '';

      if (!leagueId || !name) {
        toast('League ID and Display Name are required.', 'warn'); return;
      }
      if ((storage === 'supabase' || storage === 'supabase-own') && !adminPin) {
        toast('Admin PIN is required for Supabase leagues.', 'warn'); return;
      }
      if (storage === 'supabase-own' && (!supabaseUrl || !supabaseKey)) {
        toast('Supabase URL and service_role key are required for self-hosted Supabase.', 'warn'); return;
      }

      showLoading(true);
      try {
        const sourceLeagueId  = Auth.getSession()?.leagueId;
        const copyConfig      = document.getElementById('new-league-copy-config').checked;
        const copyPlayers     = document.getElementById('new-league-copy-players').checked;
        const canCreateLeagues = document.getElementById('new-league-can-create').checked;
        const hidden     = document.getElementById('new-league-hidden').checked;
        const customerId  = document.getElementById('new-league-customer-id').value.trim() || null;
        const adminEmail  = document.getElementById('new-league-admin-email').value.trim() || null;
        const result = await API.addLeague(leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail, storage, adminPin || null, supabaseUrl || null, supabaseKey || null);
        if (result.warnings && result.warnings.length) {
          result.warnings.forEach(w => toast('Warning: ' + w, 'warn'));
        }
        if (result.sheetUrl) {
          toast(`League "${name}" added! Sheet created: ${result.sheetUrl}`);
        } else {
          toast(`League "${name}" added!${result.shared ? ' Sheet shared with ' + adminEmail + '.' : ''}`);
        }
        document.getElementById('new-league-id').value = '';
        document.getElementById('new-league-name').value = '';
        document.getElementById('new-league-sheet').value = '';
        document.getElementById('new-league-admin-email').value = '';
        document.getElementById('new-league-customer-id').value = '';
        const pinEl = document.getElementById('new-league-admin-pin');
        if (pinEl) pinEl.value = '';
        const sbUrlEl = document.getElementById('new-league-sb-url');
        const sbKeyEl = document.getElementById('new-league-sb-key');
        if (sbUrlEl) sbUrlEl.value = '';
        if (sbKeyEl) sbKeyEl.value = '';
        const ownSbGroup = document.getElementById('new-league-own-sb-group');
        if (ownSbGroup) ownSbGroup.classList.add('hidden');
        document.getElementById('new-league-storage').value = 'google';
        document.getElementById('new-league-sheet-group').style.display = '';
        document.getElementById('add-league-form').classList.add('hidden');
        document.getElementById('btn-show-add-league').classList.remove('hidden');
        renderLeagues();
      } catch (e) { toast('Failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });
  }

  // ── Tier feature restrictions ──────────────────────────────
  function applyTierRestrictions(tier) {
    if (!tier || typeof TIERS === 'undefined') return;
    const tierDef = TIERS.find(t => t.version.toLowerCase() === tier.toLowerCase());
    if (!tierDef) return;
    const disabled = new Set(tierDef.disableList || []);

    const hideEl = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
    const hideNav = page => document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(el => {
      el.classList.add('hidden');
      el.dataset.tierHidden = '1';
    });

    if (disabled.has('messaging')) {
      hideNav('messaging');
      hideNav('chat');
    }
    if (disabled.has('timers'))             hideNav('timers');
    if (disabled.has('headToHead'))         hideNav('head-to-head');
    if (disabled.has('playerReport'))       hideNav('player-report');
    if (disabled.has('pushNotifications'))  hideEl('push-notif-card');
    if (disabled.has('hostedDb'))           hideEl('new-league-sheet-group');
    if (disabled.has('tournamentPairings')) hideEl('tournament-card');
    if (disabled.has('queuePairings')) {
      hideEl('queue-pairing-card');
      const opt = document.querySelector('#cfg-pairing-mode option[value="queue-based"]');
      if (opt) { opt.disabled = true; opt.textContent = 'Queue Based (not available on this tier)'; }
      const sel = document.getElementById('cfg-pairing-mode');
      if (sel && sel.value === 'queue-based') sel.value = 'round-based';
    }
    if (disabled.has('ladderLeague')) {
      const opt = document.querySelector('#cfg-standings-method option[value="ladder"]');
      if (opt) { opt.disabled = true; opt.textContent = 'Ladder League (not available on this tier)'; }
      const sel = document.getElementById('cfg-standings-method');
      if (sel && sel.value === 'ladder') sel.value = 'standard';
    }
    if (disabled.has('pairingEditor'))      hideEl('edit-pairing-card');
    if (disabled.has('arrangeGames'))       hideEl('arrange-games-wrap');
    if (disabled.has('challenges')) {
      const el = document.getElementById('cfg-challenges-enabled');
      if (el) { el.disabled = true; el.checked = false; }
      const row = document.getElementById('cfg-challenges-row');
      if (row) row.title = 'Not available on this subscription tier';
    }
    if (disabled.has('playerRegistration')) {
      hideEl('cfg-registration-row');
      hideEl('cfg-registration-options');
    }
    if (disabled.has('playerScoring')) {
      const hdr = document.getElementById('col-can-score');
      if (hdr) hdr.style.visibility = 'hidden';
      document.querySelectorAll('[data-field="canScore"]').forEach(el => {
        el.style.visibility = 'hidden';
        el.disabled = true;
      });
      state._tierDisableScoring = true;
    }
    if (disabled.has('playerPhotos')) {
      state._tierDisablePhotos = true;
      document.querySelectorAll('.btn-photo').forEach(el => { el.style.visibility = 'hidden'; });
    }
    if (disabled.has('createLeagues')) {
      state._tierDisableCreateLeagues = true;
      const btn = document.getElementById('btn-show-add-league');
      if (btn) { btn.disabled = true; btn.title = 'Not available on this subscription tier'; btn.style.opacity = '0.45'; }
    }
    if (disabled.has('deleteLeagues')) {
      state._tierDisableDeleteLeagues = true;
    }
    if (disabled.has('deletePlayers')) {
      state._tierDisableDeletion = true;
      document.querySelectorAll('[data-remove]').forEach(el => { el.style.display = 'none'; });
    }
    if (disabled.has('changePasswords')) {
      state._tierDisableChangePasswords = true;
      document.querySelectorAll('[data-field="pin"]').forEach(el => {
        el.disabled = true;
        el.title = 'Password changes not available on this subscription tier';
        el.style.opacity = '0.45';
      });
    }
  }

  // ── Leagues ────────────────────────────────────────────────
  function applyLimitRestrictions() {
    const L = state.limits;
    if (!L) return;

    // ── Expired: disable generate, lock, tournament, score save ──
    if (L.expired) {
      const disableIds = ['btn-generate', 'btn-lock-pairings', 'btn-tourn-generate', 'btn-save-scores', 'btn-send-report'];
      disableIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = true; el.title = 'League subscription has expired'; }
      });
      toast('This league subscription has expired. Generate and score functions are disabled.', 'warn');
    }

    // ── Enforce input field max attributes from registry limits ──
    // Helper: set max on an input and add/update a hint note beside its label
    const capInput = (inputId, max, noun) => {
      if (max == null) return;
      const el = document.getElementById(inputId);
      if (!el) return;
      el.max = max;
      // Cap current value if over limit
      if (parseInt(el.value) > max) el.value = max;
      // Add or update hint label
      const fg = el.closest('.form-group');
      if (!fg) return;
      let hint = fg.querySelector('.limit-hint');
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'limit-hint';
        hint.style.cssText = 'font-size:0.7rem; color:var(--gold); margin-top:3px;';
        fg.appendChild(hint);
      }
      hint.textContent = `Max ${max} ${noun} (plan limit)`;
    };

    capInput('cfg-weeks',  L.maxSessions, 'sessions');
    capInput('cfg-courts', L.maxCourts,   'courts');
    capInput('cfg-games',  L.maxRounds,   'rounds/session');
  }

  function updateTournamentResultsNav() {
    const hasTournament = state.pairings.some(p => p.type === 'tourn-game');
    const navEl = document.getElementById('nav-tourn-results');
    if (navEl) navEl.classList.toggle('hidden', !hasTournament);
    if (hasTournament && !state.currentTournWeek) {
      // Default to latest tournament week
      const tournWeeks = [...new Set(
        state.pairings.filter(p => p.type === 'tourn-game').map(p => parseInt(p.week))
      )].sort((a,b)=>b-a);
      if (tournWeeks.length) state.currentTournWeek = tournWeeks[0];
    }
  }



  // ── Applications (app manager only) ────────────────────────
  async function loadApplications() {
    const listEl = document.getElementById('applications-list');
    const errEl  = document.getElementById('applications-error');
    if (!listEl) return;
    errEl.style.display = 'none';
    listEl.innerHTML = '<div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">Loading…</div>';
    try {
      const result  = await API.getApplications();
      if (!result.success) throw new Error(result.error || 'Failed to load applications');
      renderApplications(result.applications || []);
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      listEl.innerHTML = '';
    }
  }

  function renderApplications(apps) {
    const listEl = document.getElementById('applications-list');
    if (!listEl) return;

    const statusBadge = s => {
      const map = {
        pending:  ['⏳ Pending',  'rgba(255,193,7,0.15)',  '#ffc107'],
        approved: ['✅ Approved', 'rgba(45,122,58,0.15)',  '#3fa050'],
        complete: ['🏁 Complete', 'rgba(94,194,106,0.15)', '#5ec26a'],
      };
      const [label, bg, color] = map[s] || ['● ' + s, 'rgba(255,255,255,0.07)', 'var(--muted)'];
      return `<span style="font-size:0.72rem; font-weight:600; padding:2px 9px; border-radius:10px;
        background:${bg}; color:${color}; white-space:nowrap;">${label}</span>`;
    };

    if (!apps.length) {
      listEl.innerHTML = `<div class="card" style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
        No applications yet.</div>`;
      return;
    }

    // Sort: pending first, then by date descending
    apps = [...apps].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return (b.submittedAt || '').localeCompare(a.submittedAt || '');
    });

    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const rows = apps.map(a => {
      const date = a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—';
      const canApprove = a.status === 'pending';
      return `<tr>
        <td style="padding:10px 12px; font-weight:600; color:var(--white);">${esc(a.name)}</td>
        <td style="padding:10px 12px; font-size:0.82rem;">${esc(a.email)}</td>
        <td style="padding:10px 12px; font-size:0.82rem;">${esc(a.phone) || '—'}</td>
        <td style="padding:10px 12px; font-size:0.82rem;">${esc(a.leagueName)}</td>
        <td style="padding:10px 12px; font-family:monospace; font-size:0.82rem; color:var(--gold);">${esc(a.slug)}</td>
        <td style="padding:10px 12px; font-size:0.8rem; color:var(--muted);">${esc(a.leagueType) || '—'}</td>
        <td style="padding:10px 12px; font-size:0.8rem; color:var(--muted);">${date}</td>
        <td style="padding:10px 12px;">${statusBadge(a.status)}</td>
        <td style="padding:10px 12px; white-space:nowrap;">
          ${canApprove
            ? `<button class="btn btn-primary" style="font-size:0.78rem; padding:4px 14px;"
                data-approve-id="${esc(a.id)}" data-approve-name="${esc(a.name)}">Approve</button>`
            : ''}
        </td>
      </tr>`;
    }).join('');

    listEl.innerHTML = `<div class="card" style="padding:0; overflow:hidden;">
      <div class="table-wrap" style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; color:var(--white);">
          <thead>
            <tr style="background:rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.08);">
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Name</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Email</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Phone</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">League Name</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Slug</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Type</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Date</th>
              <th style="padding:8px 12px; text-align:left; font-size:0.72rem; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted); font-weight:600;">Status</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody id="applications-tbody" style="border-top:1px solid rgba(255,255,255,0.06);">
            ${rows}
          </tbody>
        </table>
      </div>
    </div>`;

    // Approve button handlers
    listEl.querySelectorAll('[data-approve-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const appId   = btn.dataset.approveId;
        const appName = btn.dataset.approveName;
        if (!confirm(`Approve application from ${appName}? This will send them an email with a setup link and password.`)) return;
        btn.disabled = true; btn.textContent = '⏳…';
        try {
          const result  = await API.approveApplication(appId);
          if (!result.success) throw new Error(result.error || 'Approval failed');
          await loadApplications(); // refresh list
        } catch(e) {
          alert('Approval failed: ' + e.message);
          btn.disabled = false; btn.textContent = 'Approve';
        }
      });
    });
  }

  document.getElementById('btn-refresh-applications')?.addEventListener('click', loadApplications);

  async function renderLeagues() {
    const session = Auth.getSession();
    let allLeagues = [];
    try {
      const data = await API.getLeaguesAll(); // returns all leagues; we filter client-side below
      allLeagues = data.leagues || [];
    } catch (e) {
      toast('Failed to load leagues: ' + e.message, 'error');
    }

    // Gate + Add League button from the registry entry for this league.
    // App manager always has full access regardless of canCreateLeagues flag.
    const isMgr = (userRole === 'manager') || (typeof isManager !== 'undefined' && isManager);
    const currentId = session?.leagueId;
    const thisLeague = allLeagues.find(l => l.leagueId === currentId);

    // Scope the visible list:
    //  • App manager → sees every league (no filter)
    //  • Admin in a customerID org → sees own org + leagues with no customerID
    //  • Admin with no customerID → sees only leagues with no customerID
    const currentCustomerId = thisLeague?.customerId || sessionStorage.getItem('pb_customer_id') || null;

    // Cache the registry-sourced customerId into state so URL builders always have
    // the authoritative value — even when the league's customerId was assigned after
    // the original config was written (making c.leagueUrl and sessionStorage unreliable).
    if (currentCustomerId && !state.currentLeagueCustomerId) {
      state.currentLeagueCustomerId = currentCustomerId;
      // Re-render the dashboard and setup tab URL field now that we have the correct value
      renderDashboard();
      renderSetup();
    } else if (currentCustomerId) {
      state.currentLeagueCustomerId = currentCustomerId;
    }

    const leagues = isMgr
      ? allLeagues
      : allLeagues.filter(l => !currentCustomerId || !l.customerId || l.customerId === currentCustomerId);

    const canCreate = isMgr || !thisLeague || thisLeague.canCreateLeagues !== false;
    document.getElementById('btn-show-add-league').style.display = canCreate ? '' : 'none';

    const chip = (label, color) =>
      `<span style="font-size:0.7rem; padding:2px 8px; border-radius:4px; white-space:nowrap;
        background:${color}22; border:1px solid ${color}55; color:${color};">${label}</span>`;

    let html = leagues.length ? '' : '<p class="text-muted">No leagues yet. Add one above.</p>';

    leagues.forEach(l => {
      const isCurrent      = l.leagueId === currentId;
      const isActive       = !!l.active;
      const isHidden       = !!l.hidden;
      const canToggleCreate = isMgr || canCreate;
      const canCreateNow   = l.canCreateLeagues !== false;

      // Storage badge
      const storageBadge = l.storage === 'supabase'
        ? chip('Supabase', '#5ec272')
        : l.storage === 'supabase-own'
          ? chip('Own Supabase', '#3b8ed4')
          : `<code style="font-size:0.7rem; color:var(--muted);" title="${esc(l.sheetId || '')}">${l.sheetId ? l.sheetId.substring(0,10)+'…' : '—'}</code>`;

      // Expiry string (manager view)
      const expiryStr = l.expiryDays !== null && l.expiryDays !== undefined ? (() => {
        if (!l.createdDate) return l.expiryDays + ' days';
        const exp = new Date(new Date(l.createdDate).getTime() + l.expiryDays * 86400000);
        const rem = Math.ceil((exp - new Date()) / 86400000);
        return rem <= 0 ? '<span style="color:var(--danger);">Expired</span>'
          : `<span style="color:${rem <= 14 ? 'var(--gold)' : 'var(--muted)'};">${rem}d left</span>`;
      })() : '<span style="color:var(--muted);">None</span>';

      const limitsStr = [
        l.maxPlayers  != null ? 'Players: '  + l.maxPlayers  : '',
        l.maxCourts   != null ? 'Courts: '   + l.maxCourts   : '',
        l.maxRounds   != null ? 'Rounds: '   + l.maxRounds   : '',
        l.maxSessions != null ? 'Sessions: ' + l.maxSessions : '',
      ].filter(Boolean).join(' · ') || 'No limits';

      const btnStyle = 'padding:4px 12px; font-size:0.75rem; min-width:88px;';

      html += `<details class="league-accordion" style="margin-bottom:6px; border:1px solid rgba(255,255,255,0.08); border-radius:8px; background:rgba(255,255,255,0.02);">
        <summary style="list-style:none; cursor:pointer; display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:8px; user-select:none; flex-wrap:wrap;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${esc(l.name)}${isCurrent ? ' <span style="font-size:0.65rem; background:#5ec27233; border:1px solid #5ec27255; color:#5ec272; border-radius:4px; padding:1px 6px; vertical-align:middle;">current</span>' : ''}
            </div>
            <div style="font-size:0.7rem; color:var(--muted); margin-top:2px;">${esc(l.leagueId)}</div>
          </div>
          <div style="display:flex; gap:5px; flex-wrap:wrap; align-items:center;">
            ${chip(isActive ? '● Active' : '○ Inactive', isActive ? '#5ec272' : '#888')}
            ${l.tier ? chip(l.tier, '#5ec272') : ''}
            ${isHidden ? chip('Hidden', '#f0a030') : ''}
          </div>
          <span class="collapse-arrow" style="font-size:0.7rem; color:var(--muted); flex-shrink:0;">▼</span>
        </summary>
        <div style="padding:14px 16px; border-top:1px solid rgba(255,255,255,0.06); display:grid; grid-template-columns:1fr 1fr; gap:10px 16px;">

          <div>
            <div class="label" style="margin-bottom:4px;">Storage</div>
            ${storageBadge}
          </div>
          <div>
            <div class="label" style="margin-bottom:4px;">Tier</div>
            ${l.tier
              ? `<a href="#" onclick="showTierInfo('${esc(l.tier)}'); return false;"
                  style="font-size:0.75rem; color:var(--green); text-decoration:none;
                         background:rgba(94,194,106,0.1); border:1px solid rgba(94,194,106,0.3);
                         border-radius:4px; padding:2px 8px;"
                  title="Click to see tier features">${esc(l.tier)}</a>`
              : '<span style="color:var(--muted); font-size:0.8rem;">—</span>'}
          </div>

          <div>
            <div class="label" style="margin-bottom:6px;">Status</div>
            <button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}"
              style="${btnStyle}" title="${isActive ? 'Click to deactivate' : 'Click to activate'}"
              data-toggle-league="${esc(l.leagueId)}" data-active="${isActive}"
              data-league-name="${esc(l.name)}">
              ${isActive ? '● Active' : '○ Inactive'}
            </button>
          </div>
          <div>
            <div class="label" style="margin-bottom:6px;">Visibility</div>
            <button class="btn ${!isHidden ? 'btn-primary' : 'btn-secondary'}"
              style="${btnStyle}" title="${isHidden ? 'Hidden — click to make visible' : 'Visible — click to hide'}"
              data-toggle-hidden="${esc(l.leagueId)}" data-hidden="${isHidden}"
              data-league-name="${esc(l.name)}">
              ${!isHidden ? '● Visible' : '○ Hidden'}
            </button>
          </div>

          <div style="grid-column:1/-1;">
            <div class="label" style="margin-bottom:6px;" title="Whether this league's admin can create new leagues">Can Create Leagues</div>
            <button class="btn ${canCreateNow ? 'btn-primary' : 'btn-secondary'}"
              style="${btnStyle} ${!canToggleCreate ? 'opacity:0.45; cursor:not-allowed;' : ''}"
              data-toggle-create="${esc(l.leagueId)}" data-can-create="${canCreateNow}"
              data-league-name="${esc(l.name)}"
              ${!canToggleCreate ? 'disabled' : ''}>
              ${canCreateNow ? '● Yes' : '○ No'}
            </button>
          </div>

          ${isMgr ? `
          <div>
            <div class="label" style="margin-bottom:4px;">Customer ID</div>
            <span style="font-size:0.8rem; color:var(--muted);">${esc(l.customerId || '—')}</span>
          </div>
          <div>
            <div class="label" style="margin-bottom:4px;">Created</div>
            <span style="font-size:0.8rem; color:var(--muted);">${esc(l.createdDate || '—')}</span>
          </div>
          <div>
            <div class="label" style="margin-bottom:4px;">Expires</div>
            <span style="font-size:0.8rem;">${expiryStr}</span>
          </div>
          <div>
            <div class="label" style="margin-bottom:4px;">Limits</div>
            <span style="font-size:0.75rem; color:var(--muted);">${limitsStr}</span>
          </div>
          <div style="grid-column:1/-1;">
            <button class="btn btn-secondary" style="padding:5px 14px; font-size:0.78rem;"
              data-edit-limits="${esc(l.leagueId)}"
              data-league-name="${esc(l.name)}"
              data-limits='${JSON.stringify({expiryDays:l.expiryDays,maxPlayers:l.maxPlayers,maxCourts:l.maxCourts,maxRounds:l.maxRounds,maxSessions:l.maxSessions,customerId:l.customerId,tier:l.tier||null})}'>
              ✏️ Edit Limits, Tier &amp; Customer ID
            </button>
          </div>` : ''}

        </div>
      </details>`;
    });

    document.getElementById('leagues-table').innerHTML = html;
    applyNavVisibility(); // ensure nav stays correct after async renderLeagues

    document.querySelectorAll('[data-toggle-league]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleLeague;
        const name = btn.dataset.leagueName || lid;
        const nowActive = btn.dataset.active === 'true';
        try {
          await API.updateLeague(lid, undefined, undefined, !nowActive, undefined);
          toast(`"${name}" ${nowActive ? 'deactivated' : 'activated'}.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-hidden]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleHidden;
        const name = btn.dataset.leagueName || lid;
        const nowHidden = btn.dataset.hidden === 'true';
        try {
          await API.updateLeague(lid, undefined, undefined, undefined, undefined, !nowHidden);
          toast(`"${name}" is now ${nowHidden ? 'visible' : 'hidden'}.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-create]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleCreate;
        const name = btn.dataset.leagueName || lid;
        const nowCan = btn.dataset.canCreate === 'true';
        try {
          const callerLeagueId = isMgr ? null : Auth.getSession()?.leagueId;
          await API.updateLeagueWithCaller(lid, undefined, undefined, undefined, !nowCan, callerLeagueId);
          toast(`"${name}" ${nowCan ? 'can no longer' : 'can now'} create leagues.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });

    // Wire the limits edit modal buttons now that the DOM is populated
    wireEditLimits();
  }

  // ── Helpers ────────────────────────────────────────────────
  function populateWeekSelect(selectId, stateKey) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    const max = parseInt(state.config.weeks || 8);
    const current = state[stateKey] || 1;
    sel.innerHTML = '';
    for (let w = 1; w <= max; w++) {
      const opt = document.createElement('option');
      opt.value = w;
      const date = formatDateTime(w, state.config);
      opt.textContent = date ? `Session ${w} — ${date}` : `Session ${w}`;
      if (w === current) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function setupWeekSelect(selectId, stateKey, cb) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    populateWeekSelect(selectId, stateKey);
    sel.addEventListener('change', () => {
      state[stateKey] = parseInt(sel.value);
      saveWeekPrefs();
      cb();
    });
  }

  function setupWeekNav(prevId, nextId, stateKey, cb) {
    // Legacy — kept in case called elsewhere
    document.getElementById(prevId)?.addEventListener('click', () => {
      if (state[stateKey] > 1) { state[stateKey]--; saveWeekPrefs(); cb(); }
    });
    document.getElementById(nextId)?.addEventListener('click', () => {
      const max = parseInt(state.config.weeks || 8);
      if (state[stateKey] < max) { state[stateKey]++; saveWeekPrefs(); cb(); }
    });
  }

  function buildPlayerReportHTML(report) {
    const s = report.standing;
    const name = report.player;

    // Build opponent and partner frequency maps
    const opponentMap = {};
    const partnerMap  = {};
    report.games.forEach(g => {
      g.opponents.forEach(opp => {
        if (!opp) return;
        if (!opponentMap[opp]) opponentMap[opp] = { count: 0, wins: 0, losses: 0 };
        opponentMap[opp].count++;
        if (g.won) opponentMap[opp].wins++; else opponentMap[opp].losses++;
      });
      if (g.partner) {
        if (!partnerMap[g.partner]) partnerMap[g.partner] = { count: 0, wins: 0, losses: 0 };
        partnerMap[g.partner].count++;
        if (g.won) partnerMap[g.partner].wins++; else partnerMap[g.partner].losses++;
      }
    });

    const sortedOpponents = Object.entries(opponentMap).sort((a, b) => b[1].count - a[1].count);
    const sortedPartners  = Object.entries(partnerMap).sort((a, b) => b[1].count - a[1].count);

    const freqTable = (rows, colHeader) => `
      <table class="compact-table">
        <thead><tr><th>Player</th><th>Games</th><th>${colHeader}</th></tr></thead>
        <tbody>${rows.length ? rows.map(([n, d]) =>
          `<tr><td class="player-name">${esc(n)}</td><td>${d.count}</td>
           <td><span class="${d.wins >= d.losses ? 'win' : 'loss'}">${d.wins}W / ${d.losses}L</span></td></tr>`
        ).join('') : '<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody>
      </table>`;

    return `<div class="card">
      <div class="card-header">
        <div class="card-title">${esc(name)}</div>
        ${s ? `<div>
          <span class="badge badge-gold">Rank #${s.rank}</span>
          <span class="badge badge-green ml-1">${Reports.wl(s.wins, s.losses)}</span>
          <span class="badge badge-muted">${Reports.pct(s.winPct)}</span>
        </div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">FACED AS OPPONENT</div>
          ${freqTable(sortedOpponents, 'W/L vs them')}
        </div>
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">PLAYED AS PARTNER</div>
          ${freqTable(sortedPartners, 'W/L together')}
        </div>
      </div>

      <div class="card-title" style="font-size:0.8rem; margin-bottom:4px; padding-top:1px; color:var(--muted);">GAME LOG</div>
      <div class="table-wrap" style="padding-top:1px;">
        <table>
          <thead><tr><th>Ses</th><th>Rd</th><th>Partner</th><th>Opponents</th><th>Score</th>
            <th title="Rank difference: your team's average rank minus opponents' average rank. Negative means your team was ranked higher. U = upset (lower-ranked team won)." style="cursor:help;">Rnk Δ</th>
            <th>Result</th></tr></thead>
          <tbody>${report.games.length ? report.games.map(g => {
            const diffStr = g.rankDiff !== null ? (g.rankDiff > 0 ? '+' : '') + g.rankDiff.toFixed(1) : '—';
            const resultLabel = (g.won ? 'W' : 'L') + (g.isUpset ? ' U' : '');
            return `<tr>
              <td>${g.week}</td><td>${g.round}</td>
              <td class="player-name">${esc(g.partner)}</td>
              <td class="text-muted">${g.opponents.map(o => esc(o)).join(' & ')}</td>
              <td><strong>${g.myScore}</strong> — ${g.oppScore}</td>
              <td style="text-align:center; color:${g.rankDiff === null ? 'var(--muted)' : g.rankDiff < 0 ? 'var(--green)' : g.rankDiff > 0 ? 'var(--danger)' : 'var(--muted)'};">${diffStr}</td>
              <td><span class="badge ${g.won ? 'badge-green' : 'badge-red'}">${resultLabel}</span></td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="text-muted">No games recorded yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;
  }

  function showChangelog() {
    const modal = document.getElementById('changelog-modal');
    const content = document.getElementById('changelog-content');
    if (!modal || !content) return;
    const entries = (typeof CHANGELOG !== 'undefined' ? CHANGELOG : []);
    content.innerHTML = entries.length ? entries.map(entry => `
      <div style="margin-bottom:22px;">
        <div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">
          <span style="font-weight:700; color:var(--green-light); font-size:0.95rem;">v${esc(entry.version)}</span>
          <span style="color:var(--muted); font-size:0.75rem;">${esc(entry.date)}</span>
        </div>
        <ul style="margin:0; padding-left:18px; color:rgba(240,244,240,0.75);">
          ${entry.changes.map(c => `<li style="margin-bottom:3px;">${esc(c)}</li>`).join('')}
        </ul>
      </div>`).join('<hr style="border:none; border-top:1px solid rgba(255,255,255,0.07); margin:4px 0 20px;">')
    : '<p style="color:var(--muted);">No changelog available.</p>';
    modal.style.display = 'flex';
    // Close on backdrop click
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
  }

  function statusLabel(s) {
    return s === 'present' ? 'In' : s === 'absent' ? 'Out' : s === 'sit-out' ? 'Sit Out' : 'TBD';
  }

  function normalizeDate(d) {
    if (!d) return '';
    try {
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        const yyyy = dt.getUTCFullYear();
        const mm   = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const dd   = String(dt.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    } catch {}
    return String(d).slice(0, 10);
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      const parts = d.split('-');
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    } catch { return d; }
  }

  function formatDateTime(w, config) {
    const d = config['date_' + w];
    const t = config['time_' + w];
    if (!d && !t) return '';
    let s = d ? formatDate(d) : '';
    if (t) s += (s ? ' ' : '') + formatTime(t);
    return s;
  }

  function formatTime(t) {
    if (!t) return '';
    try {
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return m === 0 ? `${h12}${ampm}` : `${h12}:${String(m).padStart(2,'0')}${ampm}`;
    } catch { return t; }
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function courtName(courtNum, week) {
    if (week != null && (state.config.courtNamesPerSession === true || state.config.courtNamesPerSession === 'true')) {
      const sName = state.config[`courtName_${courtNum}_w${week}`];
      if (sName && sName.trim()) return esc(sName.trim());
    }
    const name = state.config['courtName_' + courtNum];
    return name && name.trim() ? esc(name.trim()) : `Court ${courtNum}`;
  }

  function toast(msg, type = '') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  function showLoading(show) {
    document.getElementById('loading').classList.toggle('hidden', !show);
  }

  // ── Promo Page Generator ───────────────────────────────────
  (function () {
    const openModal = () => {
      const c = state.config || {};
      document.getElementById('promo-skill-range').value = '';
      document.getElementById('promo-dates').value       = c.sessionTime || '';
      document.getElementById('promo-tagline').value     = '';
      document.getElementById('promo-error').style.display = 'none';
      const modal = document.getElementById('promo-modal');
      modal.style.display = 'flex';
      setTimeout(() => document.getElementById('promo-skill-range').focus(), 80);
    };
    const closeModal = () => {
      document.getElementById('promo-modal').style.display = 'none';
    };

    document.getElementById('btn-gen-promo')?.addEventListener('click', openModal);
    document.getElementById('btn-promo-close')?.addEventListener('click', closeModal);
    document.getElementById('btn-promo-cancel')?.addEventListener('click', closeModal);
    document.getElementById('promo-modal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('promo-modal')) closeModal();
    });

    // Shared helper — validates form and returns {promoData, html} or null
    function buildPromoIfValid() {
      const skillRange = document.getElementById('promo-skill-range').value.trim();
      const errEl = document.getElementById('promo-error');
      if (!skillRange) {
        errEl.textContent = 'Please enter a skill range (e.g. 3.0 – 4.5).';
        errEl.style.display = 'block';
        document.getElementById('promo-skill-range').focus();
        return null;
      }
      errEl.style.display = 'none';
      const promoData = {
        skillRange,
        dates:   document.getElementById('promo-dates').value.trim(),
        tagline: document.getElementById('promo-tagline').value.trim(),
      };
      return { promoData, html: buildPromoHtml(state.config || {}, promoData) };
    }

    document.getElementById('btn-promo-generate')?.addEventListener('click', () => {
      const result = buildPromoIfValid();
      if (!result) return;
      const blob = new Blob([result.html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      closeModal();
    });

    document.getElementById('btn-promo-download')?.addEventListener('click', () => {
      const result = buildPromoIfValid();
      if (!result) return;
      const blob = new Blob([result.html], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const name = (state.config?.leagueName || 'league-promo')
                     .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      a.href     = url;
      a.download = name + '-promo.html';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      // Leave modal open so user can also preview or re-download
    });
  })();

  function buildPromoHtml(c, pd) {
    const evtType    = c.eventType === 'tournament' ? 'Tournament' : 'League';
    const evtName    = esc(c.leagueName  || evtType + ' Event');
    const location   = esc(c.location   || '');
    const dates      = esc(pd.dates     || c.sessionTime || '');
    const tagline    = esc(pd.tagline   || '');
    const skillRange = esc(pd.skillRange || '');
    const coordName  = esc(c.coordinatorName  || '');
    const coordPhone = esc(c.coordinatorPhone || '');
    const coordEmail = esc(c.replyTo          || '');
    const regUrl     = c.leagueUrl           || '';
    const regCode    = esc(c.registrationCode || '');
    const regFee     = parseFloat(c.registrationFee) || 0;
    const feeStr     = regFee > 0 ? regFee.toLocaleString('en-US',{style:'currency',currency:'USD'}) : 'Free';
    const allowReg   = c.allowRegistration === true || c.allowRegistration === 'true';
    const courts     = parseInt(c.courts) || 0;
    const weeks      = parseInt(c.weeks)  || 0;
    const gps        = parseInt(c.gamesPerSession) || 0;
    const maxPart    = parseInt(c.maxParticipants) || 0;

    const formatLabel = { doubles:'Doubles', 'mixed-doubles':'Mixed Doubles',
                          singles:'Singles', 'fixed-pairs':'Fixed Pairs' }[c.gameMode] || 'Doubles';
    const styleLabel  = { standard:'Round Robin', ladder:'Ladder' }[c.standingsMethod] || 'Round Robin';

    const coordPhoto = c.coordinatorPhoto || '';

    // ── SVG Assets ──────────────────────────────────────────
    const paddleSvg = `<svg viewBox="0 0 120 190" xmlns="http://www.w3.org/2000/svg">
      <rect x="44" y="124" width="32" height="62" rx="9" fill="#4a2e14"/>
      <rect x="46" y="132" width="28" height="3.5" rx="1.8" fill="#7a5232" opacity=".7"/>
      <rect x="46" y="141" width="28" height="3.5" rx="1.8" fill="#7a5232" opacity=".7"/>
      <rect x="46" y="150" width="28" height="3.5" rx="1.8" fill="#7a5232" opacity=".7"/>
      <rect x="46" y="159" width="28" height="3.5" rx="1.8" fill="#7a5232" opacity=".7"/>
      <rect x="44" y="118" width="32" height="12" rx="4" fill="#3d2510"/>
      <rect x="8" y="8" width="104" height="122" rx="52" fill="#2d7a3a"/>
      <rect x="8" y="8" width="104" height="122" rx="52" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="3"/>
      <g fill="rgba(255,255,255,.25)">
        <circle cx="40" cy="36" r="4.5"/><circle cx="57" cy="36" r="4.5"/><circle cx="74" cy="36" r="4.5"/>
        <circle cx="31" cy="52" r="4.5"/><circle cx="48" cy="52" r="4.5"/><circle cx="65" cy="52" r="4.5"/><circle cx="82" cy="52" r="4.5"/>
        <circle cx="26" cy="68" r="4.5"/><circle cx="43" cy="68" r="4.5"/><circle cx="60" cy="68" r="4.5"/><circle cx="77" cy="68" r="4.5"/><circle cx="94" cy="68" r="4.5"/>
        <circle cx="31" cy="84" r="4.5"/><circle cx="48" cy="84" r="4.5"/><circle cx="65" cy="84" r="4.5"/><circle cx="82" cy="84" r="4.5"/>
        <circle cx="38" cy="100" r="4.5"/><circle cx="55" cy="100" r="4.5"/><circle cx="72" cy="100" r="4.5"/><circle cx="89" cy="100" r="4.5"/>
        <circle cx="46" cy="115" r="4.5"/><circle cx="63" cy="115" r="4.5"/><circle cx="80" cy="115" r="4.5"/>
      </g>
      <ellipse cx="54" cy="40" rx="22" ry="9" fill="white" opacity=".13" transform="rotate(-6,54,40)"/>
    </svg>`;

    const ballSvg = `<svg viewBox="0 0 90 90" xmlns="http://www.w3.org/2000/svg">
      <circle cx="45" cy="45" r="40" fill="#f2de30"/>
      <circle cx="45" cy="45" r="40" fill="none" stroke="#c8b000" stroke-width="2"/>
      <path d="M10 45 Q45 22 80 45" stroke="#c8aa00" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M10 45 Q45 68 80 45" stroke="#c8aa00" stroke-width="3" fill="none" stroke-linecap="round"/>
      <g fill="#b8a000" opacity=".85">
        <circle cx="31" cy="23" r="3.5"/><circle cx="45" cy="18" r="3.5"/><circle cx="59" cy="23" r="3.5"/>
        <circle cx="20" cy="38" r="3.5"/><circle cx="34" cy="32" r="3.5"/><circle cx="56" cy="32" r="3.5"/><circle cx="70" cy="38" r="3.5"/>
        <circle cx="18" cy="54" r="3.5"/><circle cx="33" cy="60" r="3.5"/><circle cx="57" cy="60" r="3.5"/><circle cx="72" cy="54" r="3.5"/>
        <circle cx="31" cy="67" r="3.5"/><circle cx="45" cy="72" r="3.5"/><circle cx="59" cy="67" r="3.5"/>
      </g>
      <ellipse cx="33" cy="28" rx="11" ry="7" fill="white" opacity=".38" transform="rotate(-25,33,28)"/>
    </svg>`;

    const netSvg = `<svg viewBox="0 0 400 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect x="0" y="8" width="400" height="64" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="1.5"
            style="stroke-dasharray:18 10"/>
      <line x1="0" y1="8"  x2="400" y2="8"  stroke="rgba(255,255,255,.4)" stroke-width="3"/>
      <line x1="0" y1="72" x2="400" y2="72" stroke="rgba(255,255,255,.4)" stroke-width="3"/>
      <line x1="0" y1="40" x2="400" y2="40" stroke="rgba(255,255,255,.2)" stroke-width="1.5"/>
      <line x1="4"   y1="0" x2="4"   y2="80" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-linecap="round"/>
      <line x1="396" y1="0" x2="396" y2="80" stroke="rgba(255,255,255,.55)" stroke-width="5" stroke-linecap="round"/>
    </svg>`;

    // ── Sections ─────────────────────────────────────────────
    const detailRows = [
      location   ? `<tr><td class="dl">📍</td><td class="dk">Location</td><td class="dv">${location}</td></tr>`   : '',
      dates      ? `<tr><td class="dl">📅</td><td class="dk">When</td><td class="dv">${dates}</td></tr>`          : '',
      courts > 0 ? `<tr><td class="dl">🏟</td><td class="dk">Courts</td><td class="dv">${courts}</td></tr>`       : '',
      weeks  > 0 ? `<tr><td class="dl">📋</td><td class="dk">Sessions</td>
                    <td class="dv">${weeks}${gps > 0 ? ` sessions · ${gps} games each` : ''}</td></tr>`           : '',
    ].filter(Boolean).join('');

    const formatChips = [
      `<span class="chip">${formatLabel}</span>`,
      `<span class="chip">${styleLabel}</span>`,
      skillRange ? `<span class="chip gold">⭐ ${skillRange}</span>` : '',
      maxPart > 0 ? `<span class="chip slate">👥 ${maxPart} spots</span>` : '',
    ].filter(Boolean).join('');

    const regSection = allowReg ? `
      <div class="reg-box">
        <div class="reg-title">🎟 Registration</div>
        <div class="reg-items">
          <div class="reg-item"><div class="reg-lbl">Entry Fee</div><div class="reg-val">${feeStr}</div></div>
          ${regCode ? `<div class="reg-item"><div class="reg-lbl">Invite Code</div>
            <div class="reg-val" style="letter-spacing:.1em;font-family:monospace;">${regCode}</div></div>` : ''}
        </div>
        ${regUrl ? `<div class="reg-url-wrap">
          <div class="reg-url-lbl">Register Online</div>
          <div class="reg-url-val">${esc(regUrl)}</div>
        </div>` : ''}
      </div>` : '';

    const avatarHtml = coordPhoto
      ? `<img src="data:image/jpeg;base64,${coordPhoto}" class="avatar-img" alt="${coordName}">`
      : `<div class="avatar-init">${coordName ? coordName.charAt(0).toUpperCase() : '🎾'}</div>`;

    const contactSection = (coordName || coordPhone || coordEmail) ? `
      <div class="contact-box">
        <div class="section-label">Contact</div>
        <div class="contact-row">
          <div class="avatar">${avatarHtml}</div>
          <div>
            ${coordName  ? `<div class="contact-name">${coordName}</div>` : ''}
            <div class="contact-details">
              ${coordPhone ? `<span class="contact-detail">📞&nbsp;${coordPhone}</span>` : ''}
              ${coordEmail ? `<span class="contact-detail">✉️&nbsp;${coordEmail}</span>` : ''}
            </div>
          </div>
        </div>
      </div>` : '';

    // ── Full HTML ─────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${evtName} — ${evtType} Promo</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,Arial,sans-serif;background:#e8f0e8;min-height:100vh;
     display:flex;align-items:flex-start;justify-content:center;padding:24px 16px}
.page{width:760px;background:#fff;border-radius:18px;overflow:hidden;
      box-shadow:0 12px 48px rgba(0,0,0,.18)}

/* ── Header ── */
.hdr{background:linear-gradient(140deg,#1b5e2b 0%,#2d7a3a 55%,#1f6e34 100%);
     padding:44px 48px 38px;position:relative;overflow:hidden;color:#fff}
.hdr-bg{position:absolute;inset:0;opacity:.06;pointer-events:none}
.hdr-inner{position:relative;z-index:1;display:flex;align-items:flex-start;
           justify-content:space-between;gap:20px}
.hdr-text{flex:1;min-width:0}
.evt-badge{display:inline-flex;align-items:center;gap:6px;
           background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.32);
           color:rgba(255,255,255,.92);font-size:11px;font-weight:700;
           letter-spacing:.12em;text-transform:uppercase;padding:4px 13px;
           border-radius:20px;margin-bottom:14px}
.evt-name{font-size:44px;font-weight:900;line-height:1.05;letter-spacing:-.02em;
          text-shadow:0 2px 10px rgba(0,0,0,.22);margin-bottom:10px;word-break:break-word}
.evt-tag{font-size:15px;color:rgba(255,255,255,.8);line-height:1.5;max-width:440px}
.hdr-graphics{display:flex;gap:10px;align-items:flex-end;flex-shrink:0}
.hdr-paddle{width:68px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.3))}
.hdr-ball{width:52px;margin-bottom:8px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.25))}

/* ── Net divider ── */
.net-bar{height:56px;background:linear-gradient(180deg,#1b5e2b,#174f24);
         display:flex;align-items:center;padding:0}
.net-bar svg{width:100%;height:100%}

/* ── Gold accent ── */
.accent{height:5px;background:linear-gradient(90deg,#e08000,#f5c020,#f0a500,#e08000)}

/* ── Body ── */
.body{padding:36px 48px 40px}

/* ── Two-col grid ── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:24px}
.card{background:#f6faf6;border:1px solid #d8ecd8;border-radius:12px;padding:20px 22px}
.section-label{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
               color:#2d7a3a;margin-bottom:14px;display:flex;align-items:center;gap:6px}
.section-label::after{content:'';flex:1;height:1px;background:#c4dfc4}

/* ── Detail table ── */
table.details{border-collapse:collapse;width:100%}
table.details td{padding:5px 0;vertical-align:top;font-size:13.5px}
td.dl{width:24px;font-size:16px;padding-right:6px}
td.dk{color:#666;font-size:10.5px;font-weight:600;text-transform:uppercase;
      letter-spacing:.07em;padding-right:12px;white-space:nowrap;padding-top:7px}
td.dv{font-weight:600;color:#1a2e1a;line-height:1.4}

/* ── Chips ── */
.chip-row{display:flex;flex-wrap:wrap;gap:7px}
.chip{background:#2d7a3a;color:#fff;font-size:12px;font-weight:600;
      padding:5px 13px;border-radius:20px}
.chip.gold{background:linear-gradient(135deg,#e08000,#f5c020);color:#1a0e00}
.chip.slate{background:#4a5568;color:#fff}

/* ── Registration ── */
.reg-box{background:linear-gradient(140deg,#1b5e2b,#2d7a3a);border-radius:12px;
         padding:24px 26px;color:#fff;margin-bottom:24px;position:relative;overflow:hidden}
.reg-box::after{content:'🏓';position:absolute;right:20px;top:50%;transform:translateY(-50%);
                font-size:72px;opacity:.08;pointer-events:none}
.reg-title{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;
           color:rgba(255,255,255,.65);margin-bottom:16px}
.reg-items{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:14px}
.reg-item{}
.reg-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;
         color:rgba(255,255,255,.6);margin-bottom:3px}
.reg-val{font-size:20px;font-weight:800;color:#fff}
.reg-url-wrap{border-top:1px solid rgba(255,255,255,.18);padding-top:12px}
.reg-url-lbl{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;
             color:rgba(255,255,255,.6);margin-bottom:4px}
.reg-url-val{font-size:12.5px;font-weight:600;color:#90eea8;word-break:break-all}

/* ── Contact ── */
.contact-box{background:#f6faf6;border:1px solid #d8ecd8;border-radius:12px;padding:20px 22px}
.contact-row{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.avatar{width:54px;height:54px;border-radius:50%;overflow:hidden;flex-shrink:0;
        background:#2d7a3a;display:flex;align-items:center;justify-content:center;
        font-size:22px;border:2px solid #d8ecd8}
.avatar-img{width:100%;height:100%;object-fit:cover;display:block}
.avatar-init{font-size:22px;font-weight:700;color:#fff}
.contact-name{font-size:17px;font-weight:700;color:#1a2e1a;margin-bottom:5px}
.contact-details{display:flex;gap:16px;flex-wrap:wrap}
.contact-detail{font-size:13px;color:#444;display:flex;align-items:center;gap:4px}

/* ── Footer ── */
.footer{border-top:2px solid #e4f0e4;padding:16px 48px;background:#f6faf6;
        display:flex;justify-content:space-between;align-items:center}
.footer-balls{display:flex;gap:6px}
.fb{width:14px;height:14px;border-radius:50%;background:#f2de30;border:1.5px solid #c8aa00}
.footer-text{font-size:11px;color:#aaa}
.footer-brand{font-size:11px;font-weight:700;color:#2d7a3a;letter-spacing:.06em}

/* ── Print ── */
@media print{
  body{background:#fff;padding:0}
  .page{box-shadow:none;border-radius:0;width:100%}
  @page{margin:.4in;size:letter portrait}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style>
</head>
<body>
<div class="page">

  <div class="hdr">
    <div class="hdr-bg">
      <svg viewBox="0 0 760 200" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">
        <rect x="30" y="10" width="700" height="180" fill="none" stroke="white" stroke-width="3.5" rx="4"/>
        <line x1="30" y1="100" x2="730" y2="100" stroke="white" stroke-width="2"/>
        <line x1="380" y1="10" x2="380" y2="190" stroke="white" stroke-width="2"/>
        <rect x="30" y="10" width="175" height="90" fill="none" stroke="white" stroke-width="2"/>
        <rect x="555" y="10" width="175" height="90" fill="none" stroke="white" stroke-width="2"/>
        <rect x="30" y="100" width="175" height="90" fill="none" stroke="white" stroke-width="2"/>
        <rect x="555" y="100" width="175" height="90" fill="none" stroke="white" stroke-width="2"/>
      </svg>
    </div>
    <div class="hdr-inner">
      <div class="hdr-text">
        <div class="evt-badge">🏓 ${evtType}</div>
        <div class="evt-name">${evtName}</div>
        ${tagline ? `<div class="evt-tag">${tagline}</div>` : ''}
      </div>
      <div class="hdr-graphics">
        <div class="hdr-paddle">${paddleSvg}</div>
        <div class="hdr-ball">${ballSvg}</div>
      </div>
    </div>
  </div>

  <div class="net-bar">${netSvg}</div>
  <div class="accent"></div>

  <div class="body">
    <div class="grid2">

      <div class="card">
        <div class="section-label">Event Details</div>
        ${detailRows ? `<table class="details"><tbody>${detailRows}</tbody></table>`
                     : `<p style="font-size:13px;color:#999;">No details configured.</p>`}
      </div>

      <div class="card">
        <div class="section-label">Format &amp; Skill</div>
        <div class="chip-row">${formatChips}</div>
        ${c.rules ? `<div style="margin-top:16px;font-size:12px;color:#555;line-height:1.6;
          border-top:1px solid #d8ecd8;padding-top:12px;">${esc(c.rules).replace(/\n/g,'<br>')}</div>` : ''}
      </div>

    </div>

    ${regSection}
    ${contactSection}
  </div>

  <div class="footer">
    <div class="footer-balls">
      <div class="fb"></div><div class="fb"></div><div class="fb"></div>
      <div class="fb" style="background:#2d7a3a;border-color:#1b5e2b"></div>
    </div>
    <div class="footer-text">Generated by League Manager · ${new Date().toLocaleDateString()}</div>
    <div class="footer-brand">PICKLEBALL</div>
  </div>

</div>
</body>
</html>`;
  }

})();
