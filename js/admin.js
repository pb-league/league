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
    // Players: hidden from assistants
    document.querySelectorAll('.nav-item[data-page="players"]').forEach(el =>
      el.classList.toggle('hidden', isAssistant)
    );
    // Setup: hidden from assistants (contains admin PIN, weights, league settings)
    document.querySelectorAll('.nav-item[data-page="setup"]').forEach(el =>
      el.classList.toggle('hidden', isAssistant)
    );
    // These pages are always visible to all admin roles — explicitly ensure never hidden
    ['pairings', 'scores', 'attendance', 'standings', 'player-report', 'head-to-head', 'dashboard'].forEach(page => {
      document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(el =>
        el.classList.remove('hidden')
      );
    });
  }
  applyNavVisibility();

  // Show push notification card for App Manager only
  if (isManager) {
    document.getElementById('push-notif-card')?.classList.remove('hidden');
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
    currentPairWeek: 1, currentScoreWeek: 1,
    currentStandWeek: 1, currentTournWeek: 1, pendingPairings: null,
    tournament: null,  // { week, mode, round, seeds }
    bestGeneration: null, // { score, pairings, breakdown, normalizedWeights, inputHash, totalTries }
    saveLocks: {}       // per-week save queue to prevent concurrent writes
  };

  // Helper: returns relay config from state.config for inclusion in email API calls.
  // This lets Code.gs route emails through the admin's personal Apps Script if configured.
  function getRelayConfig() {
    return {
      emailScriptUrl:    state.config.emailScriptUrl    || '',
      emailScriptSecret: state.config.emailScriptSecret || '',
    };
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
    state.config = sanitizeConfig(early.config     || {});
    state.players    = early.players    || [];
    state.attendance = early.attendance || [];
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

  API.getAllData().then(data => {
    state.pairings  = data.pairings  || [];
    state.scores    = data.scores    || [];
    state.standings = data.standings || [];
    if (data.limits) state.limits = data.limits;
    renderDashboard();
    renderPairingsPreview();
    renderScoresheet();
    renderStandings();
    applyLimitRestrictions();
    // Reconcile week selectors now that pairings are loaded
    const reconciled = Math.max(state.currentPairWeek || 1, state.currentScoreWeek || 1);
    state.currentPairWeek  = reconciled;
    state.currentScoreWeek = reconciled;
    populateWeekSelect('pair-week-select',  'currentPairWeek');
    populateWeekSelect('score-week-select', 'currentScoreWeek');
  }).catch(e => {
    const errHtml = `<p style="padding:12px; color:var(--danger); font-size:0.82rem;">⚠ Could not load scores/pairings: ${e.message}</p>`;
    if (standEl) standEl.innerHTML = errHtml;
    if (progEl)  progEl.innerHTML  = errHtml;
  });

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
          API.getScores(state.currentScoreWeek).then(data => {
            if (state._scoresFetchId !== fetchId) return;
            if (data && data.scores) {
              const week = state.currentScoreWeek;
              state.scores = state.scores.filter(s => parseInt(s.week) !== week);
              state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
            }
            renderScoresheet();
          }).catch(() => {
            if (state._scoresFetchId !== fetchId) return;
            renderScoresheet();
          });
        }
        if (page === 'pairings') { renderPairingsPreview(); renderEditPairingForm(); }
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
          // Wait for any in-flight attendance saves to complete before fetching
          // fresh data — prevents the refresh from returning stale pre-save values
          const doFetch = () => {
            API.getAttendance().then(data => {
              if (data && data.attendance) {
                const generationActive = !document.getElementById('pairing-overlay')?.classList.contains('hidden');
                if (!generationActive) {
                  // Apply server data but preserve any locally-queued unsaved changes
                  // (queue entries are intentional admin changes not yet confirmed by server)
                  const queue = state._attQueue || {};
                  state.attendance = data.attendance.map(a => {
                    const queued = queue[`${a.player}|${a.week}`];
                    return queued ? { ...a, status: queued.status } : a;
                  });
                  // Add queued entries for player+week combos not yet in server data
                  Object.values(queue).forEach(q => {
                    if (!state.attendance.find(a => a.player === q.player && String(a.week) === String(q.week))) {
                      state.attendance.push({ player: q.player, week: q.week, status: q.status });
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
          };
          // Attempt to flush any queued saves before fetching, but don't block
          flushAttQueue();
          doFetch();
        }
        if (page === 'leagues') renderLeagues();
        if (page === 'head-to-head') renderHeadToHead();
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
  }

  // ── Head-to-Head ───────────────────────────────────────────
  let h2hMode = 'partners';
  let h2hWeek = 'all';

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
    const players = state.players.filter(p => p.active === true && p.role !== 'spectator' && p.role !== 'sub').map(p => p.name);
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
    // Build a rank lookup from current standings (rank by name)
    const rankMap = {};
    state.standings.forEach(s => { if (s.rank && s.rank !== '-') rankMap[s.name] = s.rank; });
    // Fallback: use initialRank from players array
    state.players.forEach(p => {
      if (!rankMap[p.name] && p.initialRank) rankMap[p.name] = p.initialRank;
    });
    // Fallback: median rank for players with no rank
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

  function refreshSendMessageUI() {
    const adminOnly = state.config.adminOnlyEmail === true || state.config.adminOnlyEmail === 'true';
    const replyTo   = state.config.replyTo || '';
    const preview   = document.getElementById('msg-recipient-preview');
    const statusEl  = document.getElementById('msg-status');

    // Clear previous send status
    if (statusEl) { statusEl.textContent = ''; statusEl.style.color = ''; }

    if (!preview) return;
    if (adminOnly) {
      preview.textContent = replyTo
        ? `Admin-only mode: will send only to ${replyTo}`
        : 'Admin-only mode is on but no Admin Email is set — set it above.';
      preview.style.color = replyTo ? 'var(--gold)' : 'var(--danger)';
    } else {
      const recips = state.players.filter(p => p.active === true && p.email);
      preview.textContent = recips.length
        ? `Will send to ${recips.length} player${recips.length !== 1 ? 's' : ''} with email addresses.`
        : 'No active players have email addresses on file.';
      preview.style.color = recips.length ? 'var(--muted)' : 'var(--danger)';
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
  }

  function refreshPushActiveUI() {
    const privKey = sessionStorage.getItem(PUSH_PRIV_KEY);
    document.getElementById('push-unlock-section').style.display = privKey ? 'none' : '';
    document.getElementById('push-send-section').style.display   = privKey ? ''     : 'none';
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

    const password = prompt('Enter your App Manager password to fetch subscribers:');
    if (!password) return;

    btn.disabled    = true;
    btn.textContent = '⏳ Sending…';
    statusEl.textContent = '';
    statusEl.style.color = 'var(--muted)';

    try {
      const { subscriptions } = await API.getPushSubscriptions(password);
      if (!subscriptions.length) {
        statusEl.textContent = 'No subscribers yet — players need to subscribe first.';
        statusEl.style.color = 'var(--gold)';
        return;
      }

      statusEl.textContent = `Encrypting and sending to ${subscriptions.length} subscriber(s)…`;

      const vapidPub = state.config.vapidPublicKey;
      const subject  = `mailto:${state.config.replyTo || 'noreply@example.com'}`;
      const payload  = JSON.stringify({ title, body, url });

      // Encrypt all payloads in the browser, then deliver via GAS proxy.
      // Direct fetch() to push endpoints is blocked by CORS on Apple devices.
      const notifications = await VapidPush.buildNotifications(
        subscriptions, payload, privKey, vapidPub, subject
      );
      const { results } = await API.sendPushNotifications(password, notifications);

      let sent = 0, failed = 0;
      const expired = [];
      results.forEach(r => {
        if (r.ok) { sent++; }
        else {
          failed++;
          if (r.status === 404 || r.status === 410) expired.push(r.endpoint);
        }
      });

      // Clean up expired subscriptions automatically
      if (expired.length) {
        await Promise.allSettled(expired.map(ep => API.deletePushSubscription(ep)));
      }

      statusEl.textContent = `✓ Sent to ${sent} subscriber(s).${failed ? ` ${failed} failed.` : ''}${expired.length ? ` ${expired.length} expired subscription(s) removed.` : ''}`;
      statusEl.style.color = sent > 0 ? 'var(--green)' : 'var(--danger)';
    } catch (e) {
      statusEl.textContent = 'Send failed: ' + e.message;
      statusEl.style.color = 'var(--danger)';
    } finally {
      btn.disabled    = false;
      btn.textContent = '🔔 Send to All Subscribers';
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
      const base = (c.leagueUrl || '').replace(/([?&]league=)[^&]*.*$/, '').replace(/[?&]$/, '')
                || 'https://pb-league.github.io/league/index.html';
      const leagueUrl = lid ? base + '?league=' + encodeURIComponent(lid) : (c.leagueUrl || '');
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

    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-tile"><div class="stat-value">${activePlayers}</div><div class="stat-label">Players</div></div>
      <div class="stat-tile"><div class="stat-value">${state.config.weeks || '—'}${L.maxSessions ? '<span style="font-size:0.6em;color:var(--muted);">/' + L.maxSessions + '</span>' : ''}</div><div class="stat-label">Total Sessions</div></div>
      <div class="stat-tile"><div class="stat-value">${weeksWithScores}</div><div class="stat-label">Sessions Played</div></div>
      <div class="stat-tile"><div class="stat-value">${totalGames}</div><div class="stat-label">Games Entered</div></div>
    `;

    const activeNames = new Set(state.players.filter(p => p.active === true).map(p => p.name));
    const dashStandings = state.standings.filter(s => activeNames.has(s.name));
    document.getElementById('dash-standings').innerHTML = renderStandingsTable(dashStandings, true);

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
    // URL is always derived from leagueId — not editable, preserves any custom base URL from config
    const baseUrl = (c.leagueUrl || '').replace(/([?&]league=)[^&]*.*$/, '').replace(/[?&]$/, '')
                 || 'https://pb-league.github.io/league/index.html';
    const generatedUrl = leagueId ? baseUrl + '?league=' + encodeURIComponent(leagueId) : (c.leagueUrl || '');
    const urlEl = document.getElementById('cfg-league-url');
    if (urlEl) urlEl.value = generatedUrl;
    const idDisplay = document.getElementById('cfg-league-id-display');
    if (idDisplay) idDisplay.value = leagueId;
    document.getElementById('cfg-allow-registration').checked = c.allowRegistration === true || c.allowRegistration === 'true';
    document.getElementById('cfg-reg-code').value         = c.registrationCode   || '';
    document.getElementById('cfg-reg-max-pending').value  = c.maxPendingReg      || 10;
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
    document.getElementById('cfg-game-mode').value      = c.gameMode      || 'doubles';
    document.getElementById('cfg-ranking-method').value = c.rankingMethod || 'avgptdiff';
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
    const localImproveEl = document.getElementById('cfg-local-improve');
    if (localImproveEl) localImproveEl.checked = c.localImprove === undefined ? true : (c.localImprove === true || c.localImprove === 'true');
    const swapPassesEl = document.getElementById('cfg-swap-passes');
    if (swapPassesEl) swapPassesEl.value = c.swapPasses !== undefined ? c.swapPasses : 5;
    const useInitialRankEl = document.getElementById('cfg-use-initial-rank');
    if (useInitialRankEl) useInitialRankEl.checked = c.useInitialRank === true || c.useInitialRank === 'true';

    // Session dates — each session on its own row, date+time side by side
    const weeks = parseInt(c.weeks || 8);
    let datesHtml = '';
    for (let w = 1; w <= weeks; w++) {
      datesHtml += `
        <div class="form-row" style="margin-top:6px; align-items:flex-end;">
          <div class="form-group" style="flex:0 0 auto;">
            <label class="form-label">Session ${w}</label>
            <input class="form-control" id="cfg-date-${w}" type="date" value="${normalizeDate(c['date_' + w])}" style="width:160px;">
          </div>
          <div class="form-group" style="flex:0 0 auto;">
            <label class="form-label" title="Optional — leave blank if time varies">
              Time <span style="color:var(--muted); font-size:0.75rem; cursor:help;" title="Optional — leave blank if time varies">ℹ</span>
            </label>
            <input class="form-control" id="cfg-time-${w}" type="time" value="${c['time_' + w] || ''}" style="width:130px;">
          </div>
        </div>`;
    }
    document.getElementById('cfg-dates-area').innerHTML = datesHtml;

    // Court names
    const numCourts = parseInt(c.courts || 3);
    let courtNamesHtml = '<div class="form-row" style="margin-top:12px;">';
    for (let cn = 1; cn <= numCourts; cn++) {
      courtNamesHtml += `
        <div class="form-group">
          <label class="form-label">Court ${cn} Name</label>
          <input class="form-control" id="cfg-court-name-${cn}" placeholder="Court ${cn}" value="${esc(c['courtName_' + cn] || '')}">
        </div>`;
    }
    courtNamesHtml += '</div>';
    document.getElementById('cfg-court-names-area').innerHTML = courtNamesHtml;
  }

  // ── Players ────────────────────────────────────────────────
  function makePlayerRow(p, i) {
    const isFixedPairs = (state.config.gameMode || 'doubles') === 'fixed-pairs';
    const row = document.createElement('div');
    row.className = 'player-row';
    row.style.gridTemplateColumns = 'minmax(120px,1fr) 68px 90px minmax(140px,180px) 44px 44px 54px 90px 72px 34px';
    row.innerHTML = `
      <input class="form-control" data-field="name" data-idx="${i}" value="${esc(p.name)}" placeholder="${isFixedPairs ? 'Team name e.g. Doug&Kim' : 'Player name'}">
      <input class="form-control" data-field="pin" data-idx="${i}" type="text" value="${esc(String(p.pin || ''))}" placeholder="Password" maxlength="20">
      <select class="form-control" data-field="group" data-idx="${i}">
        <option value="M" ${p.group==='M'?'selected':''}>Male</option>
        <option value="F" ${p.group==='F'?'selected':''}>Female</option>
        <option value="Either" ${p.group==='Either'?'selected':''}>Either</option>
      </select>
      <input class="form-control" data-field="email" data-idx="${i}" type="email" value="${esc(p.email || '')}" placeholder="email@example.com">
      <input type="checkbox" data-field="notify" data-idx="${i}" ${p.notify ? 'checked' : ''} style="width:18px;height:18px;margin:auto;">
      <input type="checkbox" data-field="canScore" data-idx="${i}" ${p.canScore ? 'checked' : ''} style="width:18px;height:18px;margin:auto;">
      <input class="form-control" data-field="initialRank" data-idx="${i}" type="number" min="1" value="${p.initialRank || ''}" placeholder="—" style="text-align:center;">
      <select class="form-control" data-field="role" data-idx="${i}">
        <option value="" ${!p.role||p.role===''?'selected':''}>Player</option>
        ${p.role==='scorer' ? `<option value="scorer" selected>Scorer (use Can Score instead)</option>` : ''}
        <option value="assistant" ${p.role==='assistant'?'selected':''}>Assistant</option>
        <option value="admin" ${p.role==='admin'?'selected':''}>Admin</option>
        <option value="spectator" ${p.role==='spectator'?'selected':''}>Spectator</option>
        <option value="sub" ${p.role==='sub'?'selected':''}>Sub (substitute)</option>
      </select>
      <select class="form-control" data-field="active" data-idx="${i}">
        <option value="true" ${p.active===true?'selected':''}>Active</option>
        <option value="pend" ${p.active==='pend'?'selected':''}>Pending</option>
        <option value="false" ${p.active===false?'selected':''}>Inactive</option>
      </select>
      <button class="btn btn-danger" data-remove="${i}" style="padding:6px 10px;">✕</button>
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
    const nameLabel = document.querySelector('#page-players .label');
    if (nameLabel) nameLabel.textContent = isFixedPairs ? 'Team Name' : 'Name';

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
          // Trigger approval email when transitioning pend → active
          if (prev === 'pend' && val === true) {
            const pName = state.players[idx].name;
            API.approvePlayer(pName, getRelayConfig()).then(r => {
              if (r.emailSent) toast(`${esc(pName)} approved — approval email sent.`);
              else toast(`${esc(pName)} approved (no email on file).`);
            }).catch(err => toast(`${esc(pName)} approved but approval email failed: ` + err.message, 'warn'));
          }
        }
        if (field === 'initialRank') val = val ? parseInt(val) : null;
        state.players[idx][field] = val;
      });
    });

    list.querySelectorAll('[data-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.players.splice(parseInt(btn.dataset.remove), 1);
        renderPlayers();
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

  // ── Attendance save queue ───────────────────────────────────
  // Allows offline attendance changes — saves queue locally and flush
  // automatically when connectivity returns. Generate uses local state
  // so it works offline with whatever attendance is currently showing.
  let _attFlushInProgress = false;
  async function flushAttQueue() {
    if (_attFlushInProgress) return;
    const queue = state._attQueue || {};
    const entries = Object.values(queue);
    if (!entries.length) return;
    _attFlushInProgress = true;

    // Show a subtle indicator if there are pending saves
    const pendingCount = entries.length;
    const indicator = document.getElementById('att-pending-indicator');
    if (indicator) {
      indicator.textContent = `⏳ ${pendingCount} attendance change${pendingCount !== 1 ? 's' : ''} pending sync…`;
      indicator.style.display = '';
    }

    let anyFailed = false;
    for (const entry of entries) {
      try {
        await API.setAttendance(entry.player, entry.week, entry.status);
        // Remove from queue on success
        delete state._attQueue[`${entry.player}|${entry.week}`];
      } catch (e) {
        anyFailed = true;
      }
    }
    _attFlushInProgress = false;

    if (indicator) {
      const remaining = Object.keys(state._attQueue || {}).length;
      if (remaining === 0) {
        indicator.textContent = '✓ Attendance synced';
        indicator.style.color = 'var(--green)';
        setTimeout(() => { indicator.style.display = 'none'; indicator.style.color = ''; }, 2500);
      } else {
        indicator.textContent = `⚠ ${remaining} attendance change${remaining !== 1 ? 's' : ''} not yet synced — will retry when online`;
        indicator.style.color = 'var(--gold)';
      }
    }
  }

  // Retry queued attendance saves when connectivity returns
  window.addEventListener('online', () => {
    if (state._attQueue && Object.keys(state._attQueue).length > 0) {
      flushAttQueue();
    }
  });

  function renderAttendance() {
    const weeks = parseInt(state.config.weeks || 8);
    // Exclude pending players — not yet authorized
    const attPlayers = state.players.filter(p => p.active !== 'pend');

    let html = '<div class="att-grid">';

    // Header row
    html += '<div class="att-row">';
    html += '<div></div>';
    for (let w = 1; w <= weeks; w++) {
      const date = formatDateTime(w, state.config) || `S${w}`;
      html += `<div class="att-week-header">S${w}<br><span style="font-size:0.6rem;font-weight:400;">${date}</span></div>`;
    }
    html += '</div>';

    attPlayers.forEach(p => {
      html += '<div class="att-row">';
      html += `<div class="att-player-name">${esc(p.name)}</div>`;
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

    document.querySelectorAll('.att-cell.editable').forEach(cell => {
      cell.addEventListener('click', async () => {
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

        // Queue the save — local state already updated above, so generate works offline.
        // The queue flushes automatically when connectivity returns.
        if (!state._attQueue) state._attQueue = {};
        state._attQueue[`${player}|${week}`] = { player, week, status: next };
        flushAttQueue(); // attempt immediately; retries on reconnect if offline
      });
    });
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
      const presentCount = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        }).length;
      const configCourts = state.config.courts || 3;
      const effectiveCourts = presentCount < configCourts * ppc
        ? Math.max(1, Math.floor(presentCount / ppc))
        : configCourts;
      if (presentCount > 0) {
        genBtn.textContent += ` · ${effectiveCourts} court${effectiveCourts !== 1 ? 's' : ''}, ${presentCount} players`;
      }
    }

    // Update tournament advance button visibility
    const advBtn   = document.getElementById('btn-tourn-advance');
    const resetBtn = document.getElementById('btn-tourn-reset');
    const lockBtn  = document.getElementById('btn-tourn-lock');
    if (advBtn && resetBtn) {
      const inTournament = state.tournament && state.tournament.week === week;
      advBtn.classList.toggle('hidden', !inTournament);
      resetBtn.classList.toggle('hidden', !inTournament);
      if (lockBtn) lockBtn.classList.toggle('hidden', !inTournament || !state.pendingPairings);
      // Hide the regular Generate button when a tournament is in progress
      if (genBtn) genBtn.classList.toggle('hidden', !!inTournament);
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
    const inTournament = state.tournament && state.tournament.week === week;
    const toShow = inTournament && state.pendingPairings
      ? [...existing, ...state.pendingPairings.filter(p => !existing.find(e => e.round === p.round && e.court === p.court))]
      : (state.pendingPairings || existing);

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
              <div style="font-size:0.68rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court)}</div>
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

    // Populate round-scope dropdown with locked rounds + individual options
    const scopeSel = document.getElementById('round-scope');
    if (scopeSel) {
      const cur = scopeSel.value;
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(existing.map(p => parseInt(p.round)))].sort((a,b)=>a-b);
      scopeSel.innerHTML = '<option value="all">All rounds</option><option value="remaining">All remaining rounds</option>';
      for (let r = 1; r <= totalRounds; r++) {
        const opt = document.createElement('option');
        opt.value = String(r);
        const locked = lockedRounds.includes(r) ? ' \u2713' : '';
        opt.textContent = `Round ${r}${locked}`;
        scopeSel.appendChild(opt);
      }
      // Restore selection if still valid
      if ([...scopeSel.options].some(o => o.value === cur)) scopeSel.value = cur;
      // Update clear button text to match scope
      updateClearBtn(scopeSel.value, week, totalRounds, lockedRounds);
      // Update generate and clear button text when scope changes
      if (!scopeSel._genBtnListenerAdded) {
        scopeSel.addEventListener('change', () => renderPairingsPreview());
        scopeSel._genBtnListenerAdded = true;
      }
    }
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
    const title   = dateStr ? `${lName} — Session ${week} — ${dateStr}` : `${lName} — Session ${week}`;
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
        const cn = courtName(game.court);

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

    renderFinishScenarios();

    // Update card title with session number and date
    const scoresheetTitle = document.querySelector('#page-scores .card-title');
    if (scoresheetTitle) {
      const date = formatDateTime(week, state.config);
      const lName = Auth.getSession()?.leagueName || state.config.leagueName || '';
      scoresheetTitle.textContent = lName
        ? (date ? `${lName}  ·  Session ${week}  ·  ${date}` : `${lName}  ·  Session ${week}`)
        : (date ? `Session ${week}  ·  ${date}` : `Session ${week}`);
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

      // Summary badge: green when all done, gold when in progress, muted when not started
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

        html += `<div style="background:var(--card-bg); border-radius:7px; padding:6px 10px; margin-bottom:4px;"
            data-week="${week}" data-round="${game.round}" data-court="${game.court}">
          <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center; gap:6px;">
            <div style="font-size:0.7rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court)}</div>
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

      html += `</div></details>`;
    });

    // Snapshot which rounds are currently collapsed before overwriting the DOM
    const collapsedRounds = new Set();
    document.querySelectorAll('#scoresheet details').forEach(d => {
      if (!d.open) {
        const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
        if (m) collapsedRounds.add(parseInt(m[1]));
      }
    });

    document.getElementById('scoresheet').innerHTML = html;

    // Assign sequential tabindex to all score inputs so Tab skips round headings.
    // Also remove summary elements from tab order — they are natively focusable
    // (tabIndex=0) and would intercept Tab between rounds without this.
    document.querySelectorAll('#scoresheet summary').forEach(s => { s.tabIndex = -1; });
    document.querySelectorAll('#scoresheet .score-input').forEach((input, i) => {
      input.tabIndex = i + 1;
    });

    // Restore collapsed state
    if (collapsedRounds.size) {
      document.querySelectorAll('#scoresheet details').forEach(d => {
        const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
        if (m && collapsedRounds.has(parseInt(m[1]))) d.open = false;
      });
    }

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

          // Warn on tied scores — non-blocking toast since this is auto-save
          if (score1 === score2) {
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
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);

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

    // Check that the final round has pairings
    const finalPairings = state.pairings.filter(p =>
      parseInt(p.week) === week && parseInt(p.round) === totalRounds &&
      (p.type === 'game' || p.type === 'tourn-game')
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
    const season = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
    document.getElementById('standings-season-table').innerHTML = renderStandingsTable(season);

    const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance);
    document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
    document.getElementById('stand-week-label').textContent = `Session ${state.currentStandWeek}`;
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

  function renderStandingsTable(standings, compact = false) {
    if (!standings || !standings.length) return '<p class="text-muted">No standings data yet.</p>';
    const rm = state.config.rankingMethod || 'avgptdiff';
    const usePtsPct = rm === 'ptspct';
    const minPct = (state.config.minParticipation !== null && state.config.minParticipation !== undefined)
      ? parseFloat(state.config.minParticipation) / 100 : 0.50;
    const hasParticipation = standings.some(s => s.participationPct !== null && s.participationPct !== undefined);

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

      return `<tr>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name">${esc(s.name)}</td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        ${hasParticipation ? partHtml : ''}
        ${!compact ? `<td class="text-muted">${s.games}</td><td class="text-muted">${s.byes}</td>` : ''}
      </tr>`;
    });

    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th title="Average point differential per game — your average score minus your opponent&#39;s average score. Positive means you score more than your opponents on average; used as a tiebreaker when win percentage is equal." style="cursor:help;">Avg+/-</th>';
    const pctHeader = hasParticipation
      ? `<th title="(Games played + byes) / total league rounds. Min ${Math.round(minPct*100)}% for prize eligibility." style="cursor:help;">Partic.</th>`
      : '';
    return `<table class="compact-table">
      <thead><tr>
        <th>#</th><th>Player</th><th>W/L</th><th>Win%</th>
        ${secHeader}
        ${pctHeader}
        ${!compact ? '<th>Games</th><th>Byes</th>' : ''}
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

    // Champion banner — only show when the last game is truly the final:
    // all players who received byes in earlier rounds must have since played a real game.
    const lastRound = lockedRounds[lockedRounds.length - 1];
    const lastGames = weekPairings.filter(g => g.round === lastRound && (g.type === 'game' || g.type === 'tourn-game'));

    // Collect all players who had a bye in any round
    const byePlayerNames = new Set();
    weekPairings.filter(g => g.type === 'tourn-bye' || g.type === 'bye').forEach(g => {
      if (g.p1) byePlayerNames.add(g.p1);
      if (g.p2) byePlayerNames.add(g.p2);
    });
    // Collect all players who appeared in a real game in any round
    const gamePlayers = new Set();
    weekPairings.filter(g => g.type === 'game' || g.type === 'tourn-game').forEach(g => {
      [g.p1, g.p2, g.p3, g.p4].filter(Boolean).forEach(n => gamePlayers.add(n));
    });
    // All bye recipients must have also played a real game before we declare a champion
    const byesUnresolved = [...byePlayerNames].some(n => !gamePlayers.has(n));

    if (lastGames.length === 1 && !byesUnresolved) {
      const fg = lastGames[0];
      const fs = scores.find(s => parseInt(s.week) === week && parseInt(s.round) === lastRound && String(s.court) === String(fg.court));
      if (fs && fs.score1 !== '' && fs.score1 !== null && fs.score2 !== '' && fs.score2 !== null) {
        const t1win = parseInt(fs.score1) > parseInt(fs.score2);
        const cP1 = t1win ? fg.p1 : fg.p3;
        const cP2 = t1win ? fg.p2 : fg.p4;
        const champName = cP2 ? `${esc(cP1)} &amp; ${esc(cP2)}` : esc(cP1);
        const isMe = highlightPlayer && [cP1, cP2].includes(highlightPlayer);
        html += `<div style="margin-top:16px; padding:14px 16px;
          background:linear-gradient(135deg, rgba(245,200,66,0.15), rgba(245,200,66,0.05));
          border:1px solid rgba(245,200,66,0.4); border-radius:10px; text-align:center;">
          <div style="font-size:1.1rem; color:var(--gold); font-weight:700; margin-bottom:4px;">🏆 Tournament Champion</div>
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
    const seeds = (state.tournament && state.tournament.week === week) ? state.tournament.seeds : null;
    const weekScores = state.scores.filter(s => parseInt(s.week) === week);
    el.innerHTML = buildBracketHTML(weekPairings, weekScores, week, seeds, null);
  }

  // ── Tournament ────────────────────────────────────────────
  function renderTournamentStatus() {
    const t = state.tournament;
    if (!t) return;
    const el = document.getElementById('tourn-status');
    if (!el) return;

    const week = t.week;
    const modeLabel = t.mode === 'rr'     ? 'Round Robin (Reseeded)'
                   : t.mode === 'double' ? 'Double Elimination' : 'Single Elimination';

    // RR mode: show live standings table instead of bracket
    if (t.mode === 'rr' && t.rrSeeds) {
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === t.week);
      const weekScores   = state.scores.filter(s => parseInt(s.week) === t.week);
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
      let rrHtml = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:8px;">${modeLabel} · Session ${t.week} · Round ${t.round}</div>`;
      rrHtml += `<table style="font-size:0.82rem; width:100%; border-collapse:collapse;">
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
      rrHtml += `</tbody></table>`;
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
      const doubles  = gameMode !== 'singles' && gameMode !== 'fixed-pairs';

      if (presentPlayers.length < 2) {
        toast('Need at least 2 present players for a tournament.', 'warn'); return;
      }

      // Doubles requires an even number of players so every team has 2 members
      if (doubles && presentPlayers.length % 2 !== 0) {
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
      const result = Tournament.generateTournament(presentPlayers, courts, week, mode, state.standings, doubles, state.players);
      if (result.error) { toast(result.error, 'error'); return; }

      state.tournament = { week, mode, round: 1, seeds: result.seeds };
      state.pendingPairings = result.pairings;
      document.getElementById('btn-lock-pairings').disabled = false;
      if (lockBtn) lockBtn.classList.remove('hidden');
      document.getElementById('optimizer-status').classList.add('hidden');
      renderPairingsPreview();
      toast(`${mode === 'double' ? 'Double' : 'Single'} elimination bracket generated for ${presentPlayers.length} players.`);
    });

    advBtn.addEventListener('click', async () => {
      const t = state.tournament;
      if (!t) return;
      const week = t.week;

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

      if (t.mode === 'rr') {
        const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
        const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
        const rrResult = Tournament.advanceRoundRR(
          t.rrSeeds, weekPairings, weekScores, t.round,
          parseInt(state.config.courts || 3), week, t.doubles
        );
        t.rrSeeds = rrResult.rrSeeds;
        state.tournament.round++;
        state.pendingPairings = rrResult.pairings;
        document.getElementById('btn-lock-pairings').disabled = false;
        if (lockBtn) lockBtn.classList.remove('hidden');
        renderPairingsPreview();
        toast(`Round ${state.tournament.round} ready — review and lock to save.`);
        return;
      }

      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);
      const result = Tournament.advanceTournament(t.seeds, roundScores, t.round, parseInt(state.config.courts || 3), week, t.mode, weekPairings);

      state.tournament.seeds = result.seeds;

      if (result.done) {
        state.tournament = null;
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

      state.tournament.round++;
      // Keep tourn- types in pendingPairings for display/advance logic,
      // they get normalized to game/bye at lock time
      state.pendingPairings = result.pairings;
      document.getElementById('btn-lock-pairings').disabled = false;
      if (lockBtn) lockBtn.classList.remove('hidden');
      renderPairingsPreview();
      toast(`Round ${state.tournament.round} bracket ready — review and lock to save.`);
    });

    lockBtn?.addEventListener('click', () => {
      // Trigger the main lock & save button — identical behaviour
      document.getElementById('btn-lock-pairings').click();
      lockBtn.classList.add('hidden');
    });

    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset tournament? This clears tournament tracking but keeps existing pairings.')) return;
      state.tournament = null;
      state.pendingPairings = null;
      advBtn.classList.add('hidden');
      resetBtn.classList.add('hidden');
      if (lockBtn) lockBtn.classList.add('hidden');
      const statusEl = document.getElementById('tourn-status');
      if (statusEl) statusEl.innerHTML = '';
      renderPairingsPreview();
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
          const limits = {
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
      };
      try {
        await API.saveConfig(newConfig);
        state.config = sanitizeConfig(newConfig);
      } catch (e) { toast('Auto-save failed: ' + e.message, 'error'); }
    }
    ['cfg-tries','cfg-local-improve','cfg-swap-passes','cfg-use-initial-rank',
     'cfg-w-session-partner','cfg-w-session-opponent','cfg-w-history-partner',
     'cfg-w-history-opponent','cfg-w-bye-variance','cfg-w-session-bye',
     'cfg-w-rank-balance','cfg-w-rank-std-dev','cfg-w-mixed-violation'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = el.type === 'checkbox' ? 'change' : 'blur';
      el.addEventListener(evt, saveOptimizerSettings);
    });

    // Save config
    // Rebuild session dates rows when number of sessions changes
    document.getElementById('cfg-weeks')?.addEventListener('change', () => {
      const weeks = parseInt(document.getElementById('cfg-weeks').value) || 8;
      let datesHtml = '';
      for (let w = 1; w <= weeks; w++) {
        const existingDate = document.getElementById(`cfg-date-${w}`)?.value || '';
        const existingTime = document.getElementById(`cfg-time-${w}`)?.value || '';
        datesHtml += `
          <div class="form-row" style="margin-top:6px; align-items:flex-end;">
            <div class="form-group" style="flex:0 0 auto;">
              <label class="form-label">Session ${w}</label>
              <input class="form-control" id="cfg-date-${w}" type="date" value="${existingDate}" style="width:160px;">
            </div>
            <div class="form-group" style="flex:0 0 auto;">
              <label class="form-label" title="Optional — leave blank if time varies">
                Time <span style="color:var(--muted); font-size:0.75rem; cursor:help;" title="Optional — leave blank if time varies">ℹ</span>
              </label>
              <input class="form-control" id="cfg-time-${w}" type="time" value="${existingTime}" style="width:130px;">
            </div>
          </div>`;
      }
      document.getElementById('cfg-dates-area').innerHTML = datesHtml;
    });

    document.getElementById('btn-save-config').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot change league settings.', 'warn'); return; }
      const weeks = parseInt(document.getElementById('cfg-weeks').value);
      const config = {
        leagueName:     document.getElementById('cfg-name').value.trim(),
        location:       document.getElementById('cfg-location').value.trim(),
        sessionTime:    document.getElementById('cfg-time').value.trim(),
        notes:          document.getElementById('cfg-notes').value.trim(),
        leagueUrl:           document.getElementById('cfg-league-url').value.trim(),
        allowRegistration:   document.getElementById('cfg-allow-registration').checked,
        adminOnlyEmail:      state.config.adminOnlyEmail || false,
        registrationCode:    document.getElementById('cfg-reg-code').value.trim(),
        maxPendingReg:       parseInt(document.getElementById('cfg-reg-max-pending').value) || 10,
        rules:          document.getElementById('cfg-rules').value.trim(),
        adminPin:       document.getElementById('cfg-admin-pin').value || state.config.adminPin,
        replyTo:        state.config.replyTo || '',
        weeks,
        courts:         parseInt(document.getElementById('cfg-courts').value),
        gamesPerSession:parseInt(document.getElementById('cfg-games').value),
        optimizerTries: parseInt(document.getElementById('cfg-tries').value),
        gameMode:       document.getElementById('cfg-game-mode').value,
        rankingMethod:  document.getElementById('cfg-ranking-method').value,
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
      for (let w = 1; w <= weeks; w++) {
        const el = document.getElementById('cfg-date-' + w);
        if (el) config['date_' + w] = el.value;
        const tel = document.getElementById('cfg-time-' + w);
        if (tel) config['time_' + w] = tel.value;
      }
      const numCourts = parseInt(document.getElementById('cfg-courts').value);
      for (let cn = 1; cn <= numCourts; cn++) {
        const el = document.getElementById('cfg-court-name-' + cn);
        if (el) config['courtName_' + cn] = el.value.trim();
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
            .catch(() => {}); // fire-and-forget — config save already succeeded
        }

        toast('Configuration saved!');
        state._setupDirty = false;
        renderDashboard();
        renderAttendance();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
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

      const recipients = state.players.filter(p => p.active === true && p.email);
      if (!recipients.length) {
        toast('No players have email addresses on file.', 'warn'); return;
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

      const leagueInfo = {
        leagueName:  incName     ? (c.leagueName  || '') : '',
        location:    incLocation ? (c.location    || '') : '',
        sessionTime: incTime     ? (c.sessionTime || '') : '',
        rules:       incRules    ? (c.rules       || '') : '',
        leagueUrl:   incUrl      ? (c.leagueUrl || '') : '',
        players:     incPlayers  ? state.players.filter(p => p.active === true).map(p => p.name) : [],
        standings:   incStandings ? Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance)
                                      .filter(s => state.players.find(p => p.name === s.name && p.active === true))
                                  : [],
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
      // Collect from DOM
      const rows = document.querySelectorAll('#player-list .player-row');
      const players = [];
      rows.forEach(row => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        if (name) {
          // Look up avtoken from state.players — it's not in the DOM but must be preserved
          const existing = state.players.find(p => p.name === name);
          players.push({
            name,
            pin:    row.querySelector('[data-field="pin"]').value.trim(),
            group:  row.querySelector('[data-field="group"]').value,
            email:  row.querySelector('[data-field="email"]').value.trim(),
            notify:       row.querySelector('[data-field="notify"]').checked,
            canScore:     row.querySelector('[data-field="canScore"]').checked,
            initialRank:  (() => { const v = row.querySelector('[data-field="initialRank"]').value; return v ? parseInt(v) : null; })(),
            role:         row.querySelector('[data-field="role"]').value || null,
            active:       row.querySelector('[data-field="active"]').value === 'true' ? true : row.querySelector('[data-field="active"]').value === 'pend' ? 'pend' : false,
            avtoken:      existing?.avtoken || ''
          });
        }
      });
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
      document.getElementById('btn-generate-fresh')?.classList.add('hidden');
      // Sync score selector to match
      state.currentScoreWeek = state.currentPairWeek;
      const scoreSelEl = document.getElementById('score-week-select');
      if (scoreSelEl && scoreSelEl.value != state.currentPairWeek) scoreSelEl.value = state.currentPairWeek;
      renderPairingsPreview();
      renderScoresheet();
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
          leagueUrl:  state.config.leagueUrl  || '',
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

    setupWeekSelect('stand-week-select', 'currentStandWeek', () => {
      const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod, state.attendance);
      document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
      const swDate = formatDateTime(state.currentStandWeek, state.config);
      document.getElementById('stand-week-label').textContent = `Session ${state.currentStandWeek}${swDate ? ' — ' + swDate : ''}`;
    });

    // Generate pairings — keep-best across multiple attempts
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

      // Always fetch fresh attendance from server before generating —
      // avoids using stale cached data that could include wrong player counts.
      try {
        const attData = await API.getAttendance();
        if (attData && attData.attendance) state.attendance = attData.attendance;
      } catch (e) { /* non-fatal — use cached state.attendance if fetch fails */ }

      let courts = parseInt(state.config.courts || 3);
      const tries  = parseInt(state.config.optimizerTries || 100);

      const presentPlayers = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        })
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

      // Input hash — detect when inputs change so best is automatically reset
      const inputHash = JSON.stringify({
        week, scope, courts, gameMode,
        players: [...presentPlayers].sort().join(','), tries
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
      const pastPairings   = state.pairings.filter(p => parseInt(p.week) < week);
      const lockedThisWeek = state.pairings.filter(p => parseInt(p.week) === week && parseInt(p.round) < startRound);

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
      const workerParams = {
        presentPlayers, courts, rounds, pastPairings, tries, weights,
        standings: state.standings, gameMode, playerGroups,
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
            const merged = [...otherRounds, ...newRounds]
              .sort((a,b) => parseInt(a.round)-parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, {numeric:true}));

            state.bestGeneration = {
              score, pairings: merged, breakdown, normalizedWeights, inputHash,
              totalTries: totalTriesSoFar,
              secondPairings: secondPairings ? secondPairings.map(p => ({ ...p, week, round: p.round + startRound - 1 })) : null,
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

          // Show best breakdown by default
          document.getElementById('optimizer-breakdown').innerHTML =
            renderBreakdownTable(best.breakdown, best.normalizedWeights, `Criterion — Best (score ${best.score.toFixed(1)})`);

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
                  renderBreakdownTable(best.secondBreakdown, best.normalizedWeights,
                    `Criterion — 2nd Best (score ${best.secondScore.toFixed(1)})`);
                document.getElementById('optimizer-score').textContent = best.secondScore.toFixed(1);
                state.pendingPairings = best.secondPairings;
                freshBtn.textContent = 'Show Best';
                freshBtn.dataset.showing = 'second';
              } else {
                // Switch back to best
                document.getElementById('optimizer-breakdown').innerHTML =
                  renderBreakdownTable(best.breakdown, best.normalizedWeights,
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
        const inTournament = state.tournament && state.tournament.week === week;
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
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
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

      // Warn on tied scores before saving
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
        state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
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
      const weekStand    = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week, state.config.rankingMethod, state.attendance);
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
          leagueUrl:    state.config.leagueUrl    || '',
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
            Array.from({ length: parseInt(state.config.courts || 3) }, (_, i) => [
              i + 1, state.config['courtName_' + (i + 1)] || ('Court ' + (i + 1))
            ])
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

    document.getElementById('btn-save-new-league').addEventListener('click', async () => {
      const leagueId = document.getElementById('new-league-id').value.trim().replace(/\s+/g, '-');
      const name     = document.getElementById('new-league-name').value.trim();
      const sheetId  = document.getElementById('new-league-sheet').value.trim();

      if (!leagueId || !name) {
        toast('League ID and Display Name are required.', 'warn'); return;
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
        const result = await API.addLeague(leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail);
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
        document.getElementById('add-league-form').classList.add('hidden');
        document.getElementById('btn-show-add-league').classList.remove('hidden');
        renderLeagues();
      } catch (e) { toast('Failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });
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



  async function renderLeagues() {
    const session = Auth.getSession();
    let leagues = [];
    try {
      const data = await API.getLeaguesAll(); // admin always sees all leagues including hidden
      leagues = data.leagues || [];
    } catch (e) {
      toast('Failed to load leagues: ' + e.message, 'error');
    }

    // Gate + Add League button from the registry entry for this league.
    // App manager always has full access regardless of canCreateLeagues flag.
    const isMgr = (userRole === 'manager') || (typeof isManager !== 'undefined' && isManager);
    const currentId = session?.leagueId;
    const thisLeague = leagues.find(l => l.leagueId === currentId);
    const canCreate = isMgr || !thisLeague || thisLeague.canCreateLeagues !== false;
    document.getElementById('btn-show-add-league').style.display = canCreate ? '' : 'none';
    let html = `<table>
      <thead><tr>
        <th>ID</th><th>Name</th><th title="Google Sheet ID — hover for full ID">Sheet</th>
        <th>Status</th>
        <th title="Whether this league's admin can create new leagues">Create</th>
        <th>Visibility</th>
        ${isMgr ? '<th>Customer</th><th>Created</th><th>Expires</th><th>Limits</th><th></th>' : ''}
      </tr></thead>
      <tbody>`;

    if (!leagues.length) {
      html += '<tr><td colspan="6" class="text-muted">No leagues yet. Add one above.</td></tr>';
    }

    leagues.forEach(l => {
      const isCurrent  = l.leagueId === currentId;
      const isActive   = !!l.active;
      const canToggleCreate = isMgr || canCreate;

      // Truncate sheet ID — show first 8 chars, full on hover
      const sheetShort = l.sheetId ? l.sheetId.substring(0, 8) + '…' : '—';

      // Single toggle buttons: show current state, click to toggle
      const btnActive = `<button class="btn ${isActive ? 'btn-primary' : 'btn-secondary'}"
        style="padding:3px 10px; font-size:0.72rem; min-width:76px;"
        title="${isActive ? 'Click to deactivate' : 'Click to activate'}"
        data-toggle-league="${esc(l.leagueId)}" data-active="${isActive}"
        data-league-name="${esc(l.name)}">
        ${isActive ? '● Active' : '○ Inactive'}
      </button>`;

      const canCreateNow = l.canCreateLeagues !== false;
      const btnCreate = `<button class="btn ${canCreateNow ? 'btn-primary' : 'btn-secondary'}"
        style="padding:3px 10px; font-size:0.72rem; min-width:60px; ${!canToggleCreate ? 'opacity:0.45; cursor:not-allowed;' : ''}"
        title="${canCreateNow ? 'Can create leagues — click to disallow' : 'Cannot create leagues — click to allow'}${!canToggleCreate ? ' (no permission)' : ''}"
        data-toggle-create="${esc(l.leagueId)}" data-can-create="${canCreateNow}"
        data-league-name="${esc(l.name)}"
        ${!canToggleCreate ? 'disabled' : ''}>
        ${canCreateNow ? '● Yes' : '○ No'}
      </button>`;

      const isHidden = !!l.hidden;
      const btnVisible = `<button class="btn ${!isHidden ? 'btn-primary' : 'btn-secondary'}"
        style="padding:3px 10px; font-size:0.72rem; min-width:72px;"
        title="${isHidden ? 'Hidden — click to make visible' : 'Visible — click to hide'}"
        data-toggle-hidden="${esc(l.leagueId)}" data-hidden="${isHidden}"
        data-league-name="${esc(l.name)}">
        ${!isHidden ? '● Visible' : '○ Hidden'}
      </button>`;

      html += `<tr>
        <td><code style="font-size:0.78rem; color:var(--muted);">${esc(l.leagueId)}</code></td>
        <td class="player-name">${esc(l.name)}${isCurrent ? ' <span class="badge badge-green">current</span>' : ''}</td>
        <td><code style="font-size:0.72rem; color:var(--muted);" title="${esc(l.sheetId || '')}">${esc(sheetShort)}</code></td>
        <td>${btnActive}</td>
        <td>${btnCreate}</td>
        <td>${btnVisible}</td>
        ${isMgr ? `
        <td style="font-size:0.75rem; color:var(--muted);">${l.customerId || '<span style="opacity:0.4;">—</span>'}</td>
        <td style="font-size:0.75rem; color:var(--muted);">${l.createdDate || '—'}</td>
        <td style="font-size:0.75rem;">${l.expiryDays !== null && l.expiryDays !== undefined ? (() => {
          if (!l.createdDate) return l.expiryDays + ' days';
          const exp = new Date(new Date(l.createdDate).getTime() + l.expiryDays * 86400000);
          const rem = Math.ceil((exp - new Date()) / 86400000);
          return rem <= 0 ? '<span style="color:var(--danger);">Expired</span>' : `<span style="color:${rem <= 14 ? 'var(--gold)' : 'var(--muted)'};">${rem}d left</span>`;
        })() : '<span style="color:var(--muted);">None</span>'}</td>
        <td style="font-size:0.72rem; color:var(--muted); line-height:1.6;">${[
          l.maxPlayers  !== null && l.maxPlayers  !== undefined ? 'Players: ' + l.maxPlayers  : '',
          l.maxCourts   !== null && l.maxCourts   !== undefined ? 'Courts: '  + l.maxCourts   : '',
          l.maxRounds   !== null && l.maxRounds   !== undefined ? 'Rounds: '  + l.maxRounds   : '',
          l.maxSessions !== null && l.maxSessions !== undefined ? 'Sessions: '+ l.maxSessions : '',
        ].filter(Boolean).join(' · ') || 'No limits'}</td>
        <td><button class="btn btn-secondary" style="padding:3px 10px; font-size:0.72rem;"
          data-edit-limits="${esc(l.leagueId)}"
          data-league-name="${esc(l.name)}"
          data-limits='${JSON.stringify({expiryDays:l.expiryDays,maxPlayers:l.maxPlayers,maxCourts:l.maxCourts,maxRounds:l.maxRounds,maxSessions:l.maxSessions,customerId:l.customerId})}'>
          ✏️ Limits
        </button></td>` : ''}
      </tr>`;
    });

    html += '</tbody></table>';
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

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">FACED AS OPPONENT</div>
          ${freqTable(sortedOpponents, 'W/L vs them')}
        </div>
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">PLAYED AS PARTNER</div>
          ${freqTable(sortedPartners, 'W/L together')}
        </div>
      </div>

      <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">GAME LOG</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Ses</th><th>Rd</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
          <tbody>${report.games.length ? report.games.map(g =>
            `<tr>
              <td>${g.week}</td><td>${g.round}</td>
              <td class="player-name">${esc(g.partner)}</td>
              <td class="text-muted">${g.opponents.map(o => esc(o)).join(' & ')}</td>
              <td><strong>${g.myScore}</strong> — ${g.oppScore}</td>
              <td><span class="badge ${g.won ? 'badge-green' : 'badge-red'}">${g.won ? 'W' : 'L'}</span></td>
            </tr>`
          ).join('') : '<tr><td colspan="6" class="text-muted">No games recorded yet.</td></tr>'}</tbody>
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

  function courtName(courtNum) {
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
})();
