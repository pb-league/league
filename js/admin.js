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
function showLeagueQR(event, url) {
  event.preventDefault();
  const modal = document.getElementById('qr-modal');
  const wrap  = document.getElementById('qr-canvas-wrap');
  const label = document.getElementById('qr-url-label');
  if (!modal || !wrap) return;

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
      `🥒 <span>${esc(session.leagueName)}</span> <span style="color:var(--muted);font-size:0.75rem;font-weight:400;margin-left:4px;">Admin</span>`;
  }

  // ── State ──────────────────────────────────────────────────
  let state = {
    config: {}, players: [], attendance: [],
    pairings: [], scores: [], standings: [],
    currentPairWeek: 1, currentScoreWeek: 1,
    currentStandWeek: 1, currentTournWeek: 1, pendingPairings: null,
    tournament: null  // { week, mode, round, seeds }
  };

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

  // ── Boot ───────────────────────────────────────────────────
  showLoading(true);
  try {
    const data = await API.getAllData();
    state.config     = data.config || {};
    state.players    = data.players || [];
    state.attendance = data.attendance || [];
    state.pairings   = data.pairings || [];
    state.scores     = data.scores || [];
    state.standings  = data.standings || [];
  } catch (e) {
    toast('Failed to load data: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }

  loadWeekPrefs(); // restore last-used session selections
  gaPage('Admin Dashboard');
  gaEvent('login', { role: userRole });
  renderAll();
  setupNav();
  setupEvents();

  applyNavVisibility(); // Re-apply after setup in case anything changed it

  // ── Nav ────────────────────────────────────────────────────
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
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
        if (page === 'scores') {
          // Fetch latest scores from server before rendering — players may have entered scores
          API.getScores(state.currentScoreWeek).then(data => {
            if (data && data.scores) {
              const week = state.currentScoreWeek;
              state.scores = state.scores.filter(s => parseInt(s.week) !== week);
              state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
            }
            renderScoresheet();
          }).catch(() => renderScoresheet());
        }
        if (page === 'pairings') { renderPairingsPreview(); renderEditPairingForm(); }
        if (page === 'attendance') renderAttendance();
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
    const isSingles   = gameMode === 'singles' || gameMode === 'fixed-pair';
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

  // ── Dashboard ──────────────────────────────────────────────
  function renderDashboard() {
    document.getElementById('dash-league-name').textContent =
      state.config.leagueName || 'League Dashboard';

    const c = state.config;
    const infoParts = [];
    if (c.location)    infoParts.push(`<span>📍 ${esc(c.location)}</span>`);
    if (c.sessionTime) infoParts.push(`<span>🕐 ${esc(c.sessionTime)}</span>`);
    if (c.notes)       infoParts.push(`<span>📌 ${esc(c.notes)}</span>`);
    if (c.leagueUrl) {
      infoParts.push(`<span style="display:inline-flex; align-items:center; gap:6px;">
        🔗 <a href="${esc(c.leagueUrl)}" target="_blank" style="color:var(--green);">League Link</a>
        <a href="#" onclick="showLeagueQR(event, '${esc(c.leagueUrl)}')"
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
    document.getElementById('cfg-name').value     = c.leagueName  || '';
    document.getElementById('cfg-location').value = c.location    || '';
    document.getElementById('cfg-time').value     = c.sessionTime || '';
    document.getElementById('cfg-notes').value    = c.notes       || '';
    // Auto-populate URL if blank using current leagueId
    const leagueId = Auth.getSession()?.leagueId || '';
    const defaultUrl = 'https://pb-league.github.io/league/index.html?league=' + leagueId;
    document.getElementById('cfg-league-url').value = c.leagueUrl || defaultUrl;
    document.getElementById('cfg-allow-registration').checked = c.allowRegistration === true;
    document.getElementById('cfg-reg-code').value         = c.registrationCode   || '';
    document.getElementById('cfg-reg-max-pending').value  = c.maxPendingReg      || 10;
    // Show/hide registration options based on checkbox
    document.getElementById('cfg-registration-options').style.display =
      c.allowRegistration ? '' : 'none';
    document.getElementById('cfg-allow-registration').addEventListener('change', function() {
      document.getElementById('cfg-registration-options').style.display = this.checked ? '' : 'none';
    });
    document.getElementById('cfg-rules').value    = c.rules       || '';
    document.getElementById('cfg-admin-pin').value = '';
    document.getElementById('cfg-reply-to').value    = c.replyTo || '';
    document.getElementById('cfg-weeks').value   = c.weeks || 8;
    document.getElementById('cfg-courts').value  = c.courts || 3;
    document.getElementById('cfg-games').value   = c.gamesPerSession || 7;
    document.getElementById('cfg-tries').value   = c.optimizerTries || 100;
    document.getElementById('cfg-game-mode').value      = c.gameMode      || 'doubles';
    document.getElementById('cfg-ranking-method').value = c.rankingMethod || 'avgptdiff';

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

    // Session dates
    const weeks = parseInt(c.weeks || 8);
    let datesHtml = '<div class="form-row" style="margin-top:12px;">';
    for (let w = 1; w <= weeks; w++) {
      datesHtml += `
        <div class="form-group">
          <label class="form-label">Session ${w} Date</label>
          <input class="form-control" id="cfg-date-${w}" type="date" value="${normalizeDate(c['date_' + w])}">
        </div>
        <div class="form-group">
          <label class="form-label">Session ${w} Time</label>
          <input class="form-control" id="cfg-time-${w}" type="time" value="${c['time_' + w] || ''}">
        </div>`;
    }
    datesHtml += '</div>';
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
  function renderPlayers() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    state.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.style.gridTemplateColumns = 'minmax(120px,1fr) 68px 90px minmax(140px,180px) 44px 44px 54px 90px 72px 34px';
      row.innerHTML = `
        <input class="form-control" data-field="name" data-idx="${i}" value="${esc(p.name)}" placeholder="Player name">
        <input class="form-control" data-field="pin" data-idx="${i}" type="text" value="${esc(String(p.pin || ''))}" placeholder="PIN" maxlength="8">
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
          <option value="" ${!p.role?'selected':''}>Player</option>
          <option value="scorer" ${p.role==='scorer'?'selected':''}>Scorer</option>
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
      list.appendChild(row);
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
            API.approvePlayer(pName).then(r => {
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
  function renderAttendance() {
    const weeks = parseInt(state.config.weeks || 8);
    const players = state.players.filter(p => p.active !== false);

    let html = '<div class="att-grid">';

    // Header row
    html += '<div class="att-row">';
    html += '<div></div>';
    for (let w = 1; w <= weeks; w++) {
      const date = formatDateTime(w, state.config) || `S${w}`;
      html += `<div class="att-week-header">S${w}<br><span style="font-size:0.6rem;font-weight:400;">${date}</span></div>`;
    }
    html += '</div>';

    players.forEach(p => {
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
      const count = players.filter(p => {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
        return rec && rec.status === 'present';
      }).length;
      html += `<div class="att-week-header att-total" data-week="${w}" style="font-weight:700; color:${count > 0 ? 'var(--green)' : 'var(--muted)'}; font-size:0.85rem;">${count}</div>`;
    }
    html += '</div>';

    html += '</div>';
    document.getElementById('attendance-grid').innerHTML = html;

    document.querySelectorAll('.att-cell.editable').forEach(cell => {
      cell.addEventListener('click', async () => {
        const isSpectatorRole = (() => { const p = state.players.find(pl => pl.name === cell.dataset.player); return p && p.role === 'spectator'; })();
        const states = isSpectatorRole ? ['absent', 'tbd'] : ['present', 'absent', 'tbd', 'sit-out'];
        const cur = states.indexOf(cell.className.split(' ').find(c => states.includes(c)));
        const next = states[(cur + 1) % states.length];
        const player = cell.dataset.player;
        const week = cell.dataset.week;

        cell.className = `att-cell editable ${next}`;
        cell.textContent = statusLabel(next);

        // Update local state
        const rec = state.attendance.find(a => a.player === player && String(a.week) === String(week));
        if (rec) { rec.status = next; } else { state.attendance.push({ player, week, status: next }); }

        // Live-update the totals cell for this week
        const players = state.players.filter(p => p.active !== false);
        const count = players.filter(p => {
          const r = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return r && r.status === 'present';
        }).length;
        const totalCell = document.querySelector(`.att-total[data-week="${week}"]`);
        if (totalCell) {
          totalCell.textContent = count;
          totalCell.style.color = count > 0 ? 'var(--green)' : 'var(--muted)';
        }

        try {
          await API.setAttendance(player, week, next);
        } catch (e) {
          toast('Failed to save attendance', 'error');
        }
      });
    });
  }

  // ── Pairings ───────────────────────────────────────────────
  function renderPairingsPreview() {
    const week = state.currentPairWeek;
    const genBtn = document.getElementById('btn-generate');
    if (genBtn) genBtn.textContent = `🎲 Generate Pairings for Session ${week}`;

    // Update tournament advance button visibility
    const advBtn   = document.getElementById('btn-tourn-advance');
    const resetBtn = document.getElementById('btn-tourn-reset');
    const lockBtn  = document.getElementById('btn-tourn-lock');
    if (advBtn && resetBtn) {
      const inTournament = state.tournament && state.tournament.week === week;
      advBtn.classList.toggle('hidden', !inTournament);
      resetBtn.classList.toggle('hidden', !inTournament);
      if (lockBtn) lockBtn.classList.toggle('hidden', !inTournament || !state.pendingPairings);
      if (inTournament) {
        renderTournamentStatus();
      } else {
        const statusEl = document.getElementById('tourn-status');
        if (statusEl) statusEl.innerHTML = '';
      }
    }
    document.getElementById('pair-week-label').textContent = `Session ${week}`;

    const existing = state.pairings.filter(p => parseInt(p.week) === week);
    const toShow = state.pendingPairings || existing;

    if (!toShow.length) {
      document.getElementById('pairings-preview').innerHTML =
        '<div class="card"><p class="text-muted" style="font-size:0.88rem;">No pairings generated yet for this session.</p></div>';
      return;
    }

    const rounds = [...new Set(toShow.map(p => p.round))].sort((a,b) => a-b);
    let html = '';
    rounds.forEach(r => {
      html += `<div class="round-header">Round ${r}</div>`;
      toShow.filter(p => p.round == r).forEach(game => {
        if (game.type === 'bye' || game.type === 'tourn-bye') {
          html += `<div class="game-card" style="grid-template-columns:1fr; background:rgba(122,155,181,0.07);">
            <span class="text-muted" style="font-size:0.8rem;">⏸ BYE: <strong style="color:var(--white);">${esc(game.p1)}${game.p2 ? ' &amp; ' + esc(game.p2) : ''}</strong></span>
          </div>`;
        } else {
          html += `<div style="background:var(--card-bg); border-radius:10px; padding:10px 12px; margin-bottom:8px;">
            <div class="court-label" style="font-size:0.7rem; margin-bottom:6px;">${courtName(game.court)}</div>
            <div style="display:grid; grid-template-columns:1fr 40px 1fr; align-items:center; gap:6px;">
              <div style="min-width:0;">
                <div style="font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
                ${game.p2 ? `<div style="font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
              </div>
              <div style="text-align:center; color:var(--muted); font-size:0.8rem; font-weight:600; flex-shrink:0;">VS</div>
              <div style="min-width:0; text-align:right;">
                <div style="font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
                ${game.p4 ? `<div style="font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
              </div>
            </div>
          </div>`;
        }
      });
    });

    document.getElementById('pairings-preview').innerHTML = html;
    document.getElementById('btn-lock-pairings').disabled = !state.pendingPairings;

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
        const locked = lockedRounds.includes(r) ? ' ✓' : '';
        opt.textContent = `Round ${r}${locked}`;
        scopeSel.appendChild(opt);
      }
      // Restore selection if still valid
      if ([...scopeSel.options].some(o => o.value === cur)) scopeSel.value = cur;
    }
  }

  // ── Scoresheet ─────────────────────────────────────────────
  function renderScoresheet() {
    const week = state.currentScoreWeek;
    document.getElementById('score-week-label').textContent = `Session ${week}`;

    // Update card title with session number and date
    const scoresheetTitle = document.querySelector('#page-scores .card-title');
    if (scoresheetTitle) {
      const date = formatDateTime(week, state.config);
      scoresheetTitle.textContent = date ? `Session ${week}  ·  ${date}` : `Session ${week}`;
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

      html += `<details ${!allDone ? 'open' : ''} style="margin-bottom:6px;">
        <summary style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;
                        padding:5px 8px; border-radius:7px; background:var(--card-bg);
                        list-style:none; user-select:none;"
                 class="round-summary">
          <span style="display:flex; align-items:center; gap:6px;">
            <span class="collapse-arrow" style="font-size:0.72rem; color:var(--green); opacity:0.6;">${!allDone ? '▲' : '▼'}</span>
            <span style="font-size:0.78rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Round ${r}</span>
          </span>
          <span style="font-size:0.73rem; color:${badgeColor}; font-weight:600;">${badgeText}</span>
        </summary>
        <div style="padding-top:4px;">`;

      // Byes
      roundByes.forEach(bye => {
        html += `<div style="padding:3px 8px; margin-bottom:3px; color:var(--muted); font-size:0.82rem;
                             background:rgba(122,155,181,0.07); border-radius:6px;">
          ⏸ <strong style="color:var(--white);">${esc(bye.p1)}${bye.p2 ? ' &amp; ' + esc(bye.p2) : ''}</strong> — Bye
        </div>`;
      });

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

        html += `<div style="background:var(--card-bg); border-radius:7px; padding:5px 10px; margin-bottom:4px;"
            data-week="${week}" data-round="${game.round}" data-court="${game.court}">
          <div style="display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:6px;">
            <div style="min-width:0;">
              <div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
              ${game.p2 ? `<div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
              <div style="font-size:0.65rem; color:var(--muted); margin-top:1px;">${courtName(game.court)}</div>
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px; flex-shrink:0;">
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
            <div style="min-width:0; text-align:right;">
              <div style="${entered ? (t2win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
              ${game.p4 ? `<div style="${entered ? (t2win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
            </div>
          </div>
        </div>`;
      });

      html += `</div></details>`;
    });

    document.getElementById('scoresheet').innerHTML = html;

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
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);

          // Save to server silently — show small indicator on the card
          const indicator = document.createElement('div');
          indicator.style.cssText = 'font-size:0.65rem; color:var(--muted); text-align:center; margin-top:2px;';
          indicator.textContent = '⏳ saving…';
          card.appendChild(indicator);

          try {
            // Build full week scores to send (merge this score with existing week scores)
            const weekScores = state.scores.filter(s => parseInt(s.week) === wk);
            await API.saveScores(wk, weekScores);
            indicator.textContent = '✓ saved';
            indicator.style.color = 'var(--green)';
            setTimeout(() => indicator.remove(), 1800);
            // Update round badge without full re-render
            renderScoresheet();
          } catch (e) {
            indicator.textContent = '⚠ save failed';
            indicator.style.color = 'var(--danger)';
            setTimeout(() => indicator.remove(), 3000);
          }
        });
      });
    });
  }

  // ── Standings ──────────────────────────────────────────────
  function renderStandings() {
    const season = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);
    document.getElementById('standings-season-table').innerHTML = renderStandingsTable(season);

    const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod);
    document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
    document.getElementById('stand-week-label').textContent = `Session ${state.currentStandWeek}`;

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
    const rows = standings.filter(s => s.games > 0).map((s, i) => {
      const top = i < 3 ? 'top' : '';
      const ptsTot = s.points + s.pointsAgainst;
      const ptsPctVal = ptsTot > 0 ? (s.points / ptsTot * 100).toFixed(1) + '%' : '—';
      const secCol = usePtsPct
        ? `<td>${ptsPctVal}</td>`
        : `<td>${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</td>`;
      return `<tr>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name">${esc(s.name)}</td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        ${!compact ? `<td class="text-muted">${s.games}</td><td class="text-muted">${s.byes}</td>` : ''}
      </tr>`;
    });
    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th title="Average point differential per game — your average score minus your opponent\'s average score. Positive means you score more than your opponents on average; used as a tiebreaker when win percentage is equal." style="cursor:help;">Avg+/-</th>';
    return `<table>
      <thead><tr>
        <th>#</th><th>Player</th><th>W/L</th><th>Win%</th>
        ${secHeader}
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
        const scoreHtml = scored
          ? `<span style="font-size:0.78rem; font-weight:700; color:var(--white);">${s1}–${s2}</span>`
          : `<span style="font-size:0.72rem; color:var(--muted);">pending</span>`;
        const border = (isMe1 || isMe2)
          ? 'border:1px solid rgba(94,194,106,0.4);'
          : 'border:1px solid rgba(255,255,255,0.08);';

        html += `<div style="background:var(--card-bg); ${border} border-radius:8px; padding:7px 10px; margin:2px 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="${t1style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">
              ${teamLabel(g.p1, g.p2)}
            </div>
            <div style="margin-left:6px; flex-shrink:0;">${scoreHtml}</div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06); margin:3px 0;"></div>
          <div style="${t2style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px; margin-top:4px;">
            ${teamLabel(g.p3, g.p4)}
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

    // Champion banner
    const lastRound = lockedRounds[lockedRounds.length - 1];
    const lastGames = weekPairings.filter(g => g.round === lastRound && (g.type === 'game' || g.type === 'tourn-game'));
    if (lastGames.length === 1) {
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
      const doubles  = gameMode !== 'singles';

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

      const result = Tournament.advanceTournament(t.seeds, roundScores, t.round, parseInt(state.config.courts || 3), week, t.mode);

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
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.editLimits;
        const cur = JSON.parse(btn.dataset.limits || '{}');
        const v = p => (cur[p] !== null && cur[p] !== undefined) ? cur[p] : '';
        const inp = s => prompt(s);
        const expiryDays  = inp(`Expiry days (blank = no expiry)\nCurrent: ${v('expiryDays') || 'none'}`);
        if (expiryDays === null) return;
        const maxPlayers  = inp(`Max active players (blank = no limit)\nCurrent: ${v('maxPlayers') || 'none'}`);
        if (maxPlayers === null) return;
        const maxCourts   = inp(`Max courts (blank = no limit)\nCurrent: ${v('maxCourts') || 'none'}`);
        if (maxCourts === null) return;
        const maxRounds   = inp(`Max rounds per session (blank = no limit)\nCurrent: ${v('maxRounds') || 'none'}`);
        if (maxRounds === null) return;
        const maxSessions = inp(`Max sessions (blank = no limit)\nCurrent: ${v('maxSessions') || 'none'}`);
        if (maxSessions === null) return;
        const custId      = inp(`Customer ID (blank to clear)\nCurrent: ${v('customerId') || 'none'}`);
        if (custId === null) return;
        const parse = s => (s === null || s.trim() === '') ? null : parseInt(s);
        const limits = {
          expiryDays:  parse(expiryDays),
          maxPlayers:  parse(maxPlayers),
          maxCourts:   parse(maxCourts),
          maxRounds:   parse(maxRounds),
          maxSessions: parse(maxSessions),
          customerId:  custId.trim() === '' ? null : custId.trim(),
        };
        showLoading(true);
        try {
          await API.updateLeague(lid, undefined, undefined, undefined, undefined, undefined, undefined, limits);
          toast('Limits updated.');
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
        finally { showLoading(false); }
      });
    });
  }

    function setupEvents() {
    setupEditPairing();
    setupTournament();
    // Save config
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
        registrationCode:    document.getElementById('cfg-reg-code').value.trim(),
        maxPendingReg:       parseInt(document.getElementById('cfg-reg-max-pending').value) || 10,
        rules:          document.getElementById('cfg-rules').value.trim(),
        adminPin:       document.getElementById('cfg-admin-pin').value || state.config.adminPin,
        replyTo:        document.getElementById('cfg-reply-to').value.trim(),
        weeks,
        courts:         parseInt(document.getElementById('cfg-courts').value),
        gamesPerSession:parseInt(document.getElementById('cfg-games').value),
        optimizerTries: parseInt(document.getElementById('cfg-tries').value),
        gameMode:       document.getElementById('cfg-game-mode').value,
        rankingMethod:  document.getElementById('cfg-ranking-method').value,
        wSessionPartner:  parseFloat(document.getElementById('cfg-w-session-partner').value),
        wSessionOpponent: parseFloat(document.getElementById('cfg-w-session-opponent').value),
        wHistoryPartner:  parseFloat(document.getElementById('cfg-w-history-partner').value),
        wHistoryOpponent: parseFloat(document.getElementById('cfg-w-history-opponent').value),
        wByeVariance:     parseFloat(document.getElementById('cfg-w-bye-variance').value),
        wSessionBye:      parseFloat(document.getElementById('cfg-w-session-bye').value),
        wRankBalance:     parseFloat(document.getElementById('cfg-w-rank-balance').value),
        wRankStdDev:      parseFloat(document.getElementById('cfg-w-rank-std-dev').value),
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
      const maxC = state.limits && state.limits.maxCourts;
      const maxS = state.limits && state.limits.maxSessions;
      if (maxC !== null && maxC !== undefined && cfgCourts > maxC) {
        toast(`Court limit exceeded: this league allows up to ${maxC} courts.`, 'warn'); return;
      }
      if (maxS !== null && maxS !== undefined && cfgWeeks > maxS) {
        toast(`Session limit exceeded: this league allows up to ${maxS} sessions.`, 'warn'); return;
      }

      showLoading(true);
      try {
        await API.saveConfig(config);
        state.config = config;
        toast('Configuration saved!');
        renderDashboard();
        renderAttendance();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Send league message
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
      const incUrl      = document.getElementById('msg-inc-url').checked;
      const incPlayers  = document.getElementById('msg-inc-players').checked;

      const leagueInfo = {
        leagueName:  incName     ? (c.leagueName  || '') : '',
        location:    incLocation ? (c.location    || '') : '',
        sessionTime: incTime     ? (c.sessionTime || '') : '',
        rules:       incRules    ? (c.rules       || '') : '',
        leagueUrl:   incUrl      ? (c.leagueUrl || '') : '',
        players:     incPlayers  ? state.players.filter(p => p.active === true).map(p => p.name) : [],
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
        const result = await API.sendLeagueMessage({
          subject,
          body,
          leagueInfo,
          replyTo: c.replyTo || '',
          recipients: recipients.map(p => ({ name: p.name, email: p.email })),
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
    document.getElementById('btn-save-players').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot manage players.', 'warn'); return; }
      // Collect from DOM
      const rows = document.querySelectorAll('#player-list .player-row');
      const players = [];
      rows.forEach(row => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        if (name) {
          players.push({
            name,
            pin:    row.querySelector('[data-field="pin"]').value.trim(),
            group:  row.querySelector('[data-field="group"]').value,
            email:  row.querySelector('[data-field="email"]').value.trim(),
            notify:       row.querySelector('[data-field="notify"]').checked,
            canScore:     row.querySelector('[data-field="canScore"]').checked,
            initialRank:  (() => { const v = row.querySelector('[data-field="initialRank"]').value; return v ? parseInt(v) : null; })(),
            role:         row.querySelector('[data-field="role"]').value || null,
            active:       row.querySelector('[data-field="active"]').value === 'true' ? true : row.querySelector('[data-field="active"]').value === 'pend' ? 'pend' : false
          });
        }
      });
      // Enforce maxPlayers limit
      const newActiveCount = players.filter(p => p.active === true).length;
      const maxP = state.limits && state.limits.maxPlayers;
      if (maxP !== null && maxP !== undefined && newActiveCount > maxP) {
        toast(`Player limit exceeded: this league allows up to ${maxP} active players (${newActiveCount} selected). Deactivate some players first.`, 'warn');
        return;
      }

      showLoading(true);
      try {
        await API.savePlayers(players);
        state.players = players;
        toast('Players saved!');
        renderDashboard();
        renderAttendance();
        renderPlayerReportSelect();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Week navigators
    setupWeekNav('pair-week-prev', 'pair-week-next', 'currentPairWeek', () => {
      state.pendingPairings = null;
      renderPairingsPreview();
      const epWeek = document.getElementById('ep-week');
      if (epWeek) epWeek.value = state.currentPairWeek;
    });
    setupWeekNav('score-week-prev', 'score-week-next', 'currentScoreWeek', async () => {
      saveWeekPrefs(); // persist immediately before async fetch
      // Show busy indicator immediately so user knows the change is registered
      const scoreEl = document.getElementById('scoresheet');
      if (scoreEl) scoreEl.innerHTML = `
        <div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
          <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
          <div>Loading Session ${state.currentScoreWeek}…</div>
        </div>`;
      document.getElementById('score-week-label').textContent = `Session ${state.currentScoreWeek}`;
      // Disable nav buttons during load
      ['score-week-prev','score-week-next'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = true;
      });
      try {
        const data = await API.getScores(state.currentScoreWeek);
        if (data && data.scores) {
          const week = state.currentScoreWeek;
          state.scores = state.scores.filter(s => parseInt(s.week) !== week);
          state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
        }
      } catch (e) { /* use cached */ }
      finally {
        ['score-week-prev','score-week-next'].forEach(id => {
          const el = document.getElementById(id); if (el) el.disabled = false;
        });
      }
      renderScoresheet();
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
    // Tournament results week nav
    setupWeekNav('tourn-week-prev', 'tourn-week-next', 'currentTournWeek', renderAdminTournamentResults);

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
        await API.sendTournamentReport({
          week,
          weekDate,
          leagueName: state.config.leagueName || 'Pickleball League',
          replyTo:    state.config.replyTo    || '',
          leagueUrl:  state.config.leagueUrl  || '',
          weekScores,
          weekPairings,
          recipients: recipients.map(p => ({ name: p.name, email: p.email })),
        });
        toast(`Session ${week} tournament bracket sent to ${recipients.length} player(s)!`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    setupWeekNav('stand-week-prev', 'stand-week-next', 'currentStandWeek', () => {
      const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek, state.config.rankingMethod);
      document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
      const swDate = formatDateTime(state.currentStandWeek, state.config);
      document.getElementById('stand-week-label').textContent = `Session ${state.currentStandWeek}${swDate ? ' — ' + swDate : ''}`;
    });

    // Generate pairings
    document.getElementById('btn-generate').addEventListener('click', () => {
      const week = state.currentPairWeek;
      const scope = document.getElementById('round-scope')?.value || 'all';
      const totalRounds = parseInt(state.config.gamesPerSession || 7);
      const lockedRounds = [...new Set(
        state.pairings.filter(p => parseInt(p.week) === week).map(p => parseInt(p.round))
      )].sort((a,b)=>a-b);

      // Determine which rounds to generate
      let startRound, rounds;
      if (scope === 'all') {
        startRound = 1;
        rounds = totalRounds;
      } else if (scope === 'remaining') {
        const nextRound = lockedRounds.length ? Math.max(...lockedRounds) + 1 : 1;
        startRound = nextRound;
        rounds = totalRounds - nextRound + 1;
        if (rounds <= 0) {
          toast(`All ${totalRounds} rounds are already generated for Session ${week}.`, 'warn'); return;
        }
      } else {
        // Specific round
        startRound = parseInt(scope);
        rounds = 1;
      }

      // Block generation if scores exist for the rounds being generated
      const hasScores = state.scores.some(s =>
        parseInt(s.week) === week && parseInt(s.round) >= startRound &&
        parseInt(s.round) < startRound + rounds
      );
      if (hasScores) {
        toast(`Scores already exist for the selected round(s). Clear them first.`, 'warn');
        return;
      }

      const weeks = parseInt(state.config.weeks || 8);
      const courts = parseInt(state.config.courts || 3);
      const tries = parseInt(state.config.optimizerTries || 100);

      // Get present players for this week — exclude spectators, pending, and spectating
      const presentPlayers = state.players
        .filter(p => p.active === true && p.role !== 'spectator')
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return rec && rec.status === 'present';
        })
        .map(p => p.name);

      const gameMode     = state.config.gameMode || 'doubles';
      const singles      = gameMode === 'singles';
      const playersPerCourt = singles ? 2 : 4;
      if (presentPlayers.length < courts * playersPerCourt) {
        const maxCourts = Math.floor(presentPlayers.length / playersPerCourt);
        if (maxCourts === 0) {
          toast(`Not enough players to fill even one court (${presentPlayers.length} present, need ${playersPerCourt}). No pairings generated.`, 'warn');
          return;
        }
        toast(`Only ${presentPlayers.length} players present — pairings generated for ${maxCourts} of ${courts} court${maxCourts !== 1 ? 's' : ''}. Remaining players will receive a bye.`, 'warn');
      }

      // Enforce maxRounds limit
      const maxR = state.limits && state.limits.maxRounds;
      if (maxR !== null && maxR !== undefined && rounds > maxR) {
        toast(`Round limit exceeded: this league allows up to ${maxR} rounds per session.`, 'warn');
        return;
      }

      gaEvent('generate_pairings', { session: week, mode: gameMode });
      // Show pickleball spinner and defer heavy work so browser paints first
      const overlay = document.getElementById('pairing-overlay');
      const overlayMsg = document.getElementById('pairing-overlay-msg');
      overlayMsg.textContent = `${tries} iterations · ${presentPlayers.length} players`;
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';

      setTimeout(() => {
        try {
          // Include already-locked rounds of this week as session history for the optimizer
          const pastPairings = state.pairings.filter(p => parseInt(p.week) < week);
          const lockedThisWeek = state.pairings.filter(p =>
            parseInt(p.week) === week && parseInt(p.round) < startRound
          );

          const weights = {
            sessionPartnerWeight:  state.config.wSessionPartner  ?? Pairings.DEFAULTS.sessionPartnerWeight,
            sessionOpponentWeight: state.config.wSessionOpponent ?? Pairings.DEFAULTS.sessionOpponentWeight,
            historyPartnerWeight:  state.config.wHistoryPartner  ?? Pairings.DEFAULTS.historyPartnerWeight,
            historyOpponentWeight: state.config.wHistoryOpponent ?? Pairings.DEFAULTS.historyOpponentWeight,
            byeVarianceWeight:     state.config.wByeVariance     ?? Pairings.DEFAULTS.byeVarianceWeight,
            sessionByeWeight:      state.config.wSessionBye      ?? Pairings.DEFAULTS.sessionByeWeight,
            rankBalanceWeight:          state.config.wRankBalance           ?? Pairings.DEFAULTS.rankBalanceWeight,
            rankStdDevWeight:           state.config.wRankStdDev            ?? Pairings.DEFAULTS.rankStdDevWeight,
          };

          const playerGroups = {};
          state.players.forEach(p => { playerGroups[p.name] = p.group || 'M'; });

          const { pairings: result, score, breakdown, normalizedWeights, error } = Pairings.optimize({
            presentPlayers, courts, rounds, pastPairings, tries, weights,
            standings: state.standings,
            gameMode,
            playerGroups,
            startRound,
            sessionHistory: lockedThisWeek,
          });

          overlay.classList.add('hidden');
          overlay.style.display = 'none';

          if (error) { toast(error, 'error'); return; }

          if (gameMode === 'mixed-doubles' && breakdown && breakdown.mixedViolations && breakdown.mixedViolations.raw > 0) {
            toast(`⚠️ Mixed doubles: ${breakdown.mixedViolations.raw} same-gender partnership(s) could not be avoided — check player groups and attendance.`, 'warn');
          }

          // Merge newly generated rounds with already-locked rounds of this week
          const otherRounds = state.pairings.filter(p =>
            parseInt(p.week) === week &&
            (parseInt(p.round) < startRound || parseInt(p.round) >= startRound + rounds)
          );
          const newRounds = result.map(p => ({ ...p, week,
            round: p.round + startRound - 1  // offset round numbers to correct position
          }));
          state.pendingPairings = [
            ...otherRounds,
            ...newRounds,
          ].sort((a,b) => parseInt(a.round)-parseInt(b.round) || String(a.court).localeCompare(String(b.court), undefined, {numeric:true}));

          document.getElementById('optimizer-status').classList.remove('hidden');
          document.getElementById('optimizer-score').textContent = score.toFixed(1);
          document.getElementById('optimizer-msg').textContent = `${tries} iterations · ${presentPlayers.length} players`;

          // Breakdown table
          const LABELS = {
        mixedViolations: 'Mixed doubles violations',
        sessionPartner:  'Repeat Partner (this session)',
        sessionOpponent: 'Repeat Opponent (this session)',
        historyPartner:  'Repeat Partner (prior weeks)',
        historyOpponent: 'Repeat Opponent (prior weeks)',
        sessionBye:      'Byes this session',
        byeVariance:     'Bye spread (season)',
        rankBalance:         'Rank imbalance',
        rankStdDev:          'Rank std dev (all-player spread)',
      };
          if (breakdown) {
        // Map criterion key -> user weight and normalized weight
        const USER_WEIGHT_KEYS = {
          sessionPartner:  'sessionPartnerWeight',
          sessionOpponent: 'sessionOpponentWeight',
          historyPartner:  'historyPartnerWeight',
          historyOpponent: 'historyOpponentWeight',
          sessionBye:      'sessionByeWeight',
          byeVariance:     'byeVarianceWeight',
          rankBalance:         'rankBalanceWeight',
          rankStdDev:          'rankStdDevWeight',
        };
        let bhtml = `<table style="font-size:0.78rem; width:100%; border-collapse:collapse; margin-top:4px;">
          <thead><tr>
            <th style="text-align:left; padding:3px 8px; color:var(--muted); font-weight:500;">Criterion</th>
            <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Raw</th>
            <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">User Weight</th>
            <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Norm. Weight</th>
            <th style="text-align:right; padding:3px 8px; color:var(--muted); font-weight:500;">Score</th>
          </tr></thead><tbody>`;
        Object.entries(breakdown).forEach(([key, v]) => {
          const nonzero = v.weighted > 0;
          const wKey = USER_WEIGHT_KEYS[key];
          // User weight from the weights object passed to optimize
          const userW = wKey ? (weights[wKey] ?? Pairings.DEFAULTS[wKey] ?? '—') : '—';
          // Normalized weight from calibration (v.weight is now the normalized value)
          const normW = (wKey && normalizedWeights && normalizedWeights[wKey] != null) ? normalizedWeights[wKey].toFixed(2) : '—';
          bhtml += `<tr style="${nonzero ? 'color:var(--white);' : 'color:var(--muted);'}">
            <td style="padding:3px 8px;">${LABELS[key] || key}</td>
            <td style="text-align:right; padding:3px 8px;">${(v.raw != null && typeof v.raw === 'number') ? v.raw.toFixed(2) : '—'}</td>
            <td style="text-align:right; padding:3px 8px;">${typeof userW === 'number' ? userW : userW}</td>
            <td style="text-align:right; padding:3px 8px; color:var(--muted);">${normW}</td>
            <td style="text-align:right; padding:3px 8px; font-weight:${nonzero ? '600' : '400'};">${(v.weighted != null && typeof v.weighted === 'number') ? v.weighted.toFixed(1) : '—'}</td>
          </tr>`;
        });
        bhtml += `</tbody></table>`;
            document.getElementById('optimizer-breakdown').innerHTML = bhtml;
          }
          document.getElementById('btn-lock-pairings').disabled = false;

          renderPairingsPreview();
        } catch (err) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
          toast('Generation failed: ' + err.message, 'error');
        }
      }, 50); // 50ms delay lets browser paint the spinner
    });

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
        // For tournament rounds, preserve existing rounds by merging all week pairings
        // (savePairings replaces the whole week, so we must send all rounds together)
        const existingWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
        const allWeekPairings = [...existingWeekPairings, ...normalizedPairings];
        await API.savePairings(week, allWeekPairings);
        // Update local state — add new round without removing existing rounds
        state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        state.pairings.push(...allWeekPairings);
        state.pendingPairings = null;
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
        const nextRound = lockedRounds.length ? Math.max(...lockedRounds) + 1 : 1;
        clearRounds = Array.from({length: totalRounds - nextRound + 1}, (_, i) => nextRound + i);
      } else {
        clearRounds = [parseInt(scope)];
      }

      const scopeLabel = scope === 'all' ? `all rounds of Session ${week}`
        : scope === 'remaining' ? `remaining rounds of Session ${week}`
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

        if (affectedScores.length) {
          const keptScores = state.scores.filter(s =>
            parseInt(s.week) !== week || !(!clearRounds || clearRounds.includes(parseInt(s.round)))
          );
          const weekKeptScores = keptScores.filter(s => parseInt(s.week) === week);
          await API.saveScores(week, weekKeptScores);
          state.scores = keptScores;
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);
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
        state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);
        toast(`Scores for Session ${week} saved!`);
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Send session email report
    document.getElementById('btn-send-report').addEventListener('click', async () => {
      if (isAssistant) { toast('Admin assistants cannot send email reports.', 'warn'); return; }
      const week = state.currentScoreWeek;
      const recipients = state.players.filter(p => p.active === true && p.notify && p.email);
      if (!recipients.length) {
        toast('No players have email notifications enabled.', 'warn');
        return;
      }
      if (!confirm(`Send Session ${week} results to ${recipients.length} player(s)?`)) return;

      // Build report data
      const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));
      const weekStand    = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week);
      const seasonStand  = Reports.computeStandings(state.scores, state.players, state.pairings);
      const weekDate     = formatDateTime(week, state.config);

      showLoading(true);
      try {
        await API.sendWeeklyReport({
          week,
          weekDate,
          leagueName:   state.config.leagueName || 'Pickleball League',
          location:     state.config.location   || '',
          sessionTime:  state.config.sessionTime || '',
          notes:        state.config.notes       || '',
          replyTo:      state.config.replyTo     || '',
          leagueUrl:    state.config.leagueUrl    || '',
          weekScores,
          weekPairings,
          weekStandings:  weekStand,
          seasonStandings: seasonStand,
          recipients:   recipients.map(p => ({ name: p.name, email: p.email })),
          courtNames:   Object.fromEntries(
            Array.from({ length: parseInt(state.config.courts || 3) }, (_, i) => [
              i + 1, state.config['courtName_' + (i + 1)] || ('Court ' + (i + 1))
            ])
          ),
        });
        toast(`Session ${week} results sent to ${recipients.length} player(s)!`);
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
        await API.sendPlayerReport({
          playerName,
          email: player.email,
          report,
          leagueName: state.config.leagueName || 'Pickleball League',
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
        const customerId = document.getElementById('new-league-customer-id').value.trim() || null;
        const result = await API.addLeague(leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId);
        if (result.warnings && result.warnings.length) {
          result.warnings.forEach(w => toast('Copy warning: ' + w, 'warn'));
        }
        if (result.sheetUrl) {
          toast(`League "${name}" added! Sheet created: ${result.sheetUrl}`);
        } else {
          toast(`League "${name}" added!`);
        }
        document.getElementById('new-league-id').value = '';
        document.getElementById('new-league-name').value = '';
        document.getElementById('new-league-sheet').value = '';
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

    // Expired: disable generate, lock, tournament, score save
    if (L.expired) {
      const disableIds = ['btn-generate', 'btn-lock-pairings', 'btn-tourn-generate', 'btn-save-scores', 'btn-send-report'];
      disableIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.disabled = true; el.title = 'League subscription has expired'; }
      });
      toast('This league subscription has expired. Generate and score functions are disabled.', 'warn');
    }
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

    // Gate + Add League button from the registry entry for this league
    const currentId = session?.leagueId;
    const thisLeague = leagues.find(l => l.leagueId === currentId);
    const canCreate = !thisLeague || thisLeague.canCreateLeagues !== false;
    document.getElementById('btn-show-add-league').style.display = canCreate ? '' : 'none';
    const isMgr = (userRole === 'manager') || (typeof isManager !== 'undefined' && isManager);
    let html = `<table>
      <thead><tr><th>ID</th><th>Name</th><th>Sheet ID</th><th>Status</th><th>Can Create</th><th>Visibility</th>${isMgr ? '<th>Customer</th><th>Created</th><th>Expires</th><th>Limits</th><th>Edit Limits</th>' : ''}<th></th></tr></thead>
      <tbody>`;

    if (!leagues.length) {
      html += '<tr><td colspan="5" class="text-muted">No leagues yet. Add one above.</td></tr>';
    }

    leagues.forEach(l => {
      const isCurrent = l.leagueId === currentId;
      html += `<tr>
        <td><code style="font-size:0.8rem; color:var(--muted);">${esc(l.leagueId)}</code></td>
        <td class="player-name">${esc(l.name)}${isCurrent ? ' <span class="badge badge-green">current</span>' : ''}</td>
        <td><code style="font-size:0.72rem; color:var(--muted);">${esc(l.sheetId)}</code></td>
        <td><span class="badge ${l.active ? 'badge-green' : 'badge-muted'}">${l.active ? 'Active' : 'Inactive'}</span></td>
        <td><span class="badge ${l.canCreateLeagues !== false ? 'badge-green' : 'badge-muted'}">${l.canCreateLeagues !== false ? 'Yes' : 'No'}</span></td>
        <td><span class="badge ${l.hidden ? 'badge-muted' : 'badge-green'}">${l.hidden ? 'Hidden' : 'Visible'}</span></td>
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
        <td><button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;"
          data-edit-limits="${esc(l.leagueId)}"
          data-limits='${JSON.stringify({expiryDays:l.expiryDays,maxPlayers:l.maxPlayers,maxCourts:l.maxCourts,maxRounds:l.maxRounds,maxSessions:l.maxSessions,customerId:l.customerId})}'>
          ✏️ Limits
        </button></td>` : ''}
        <td style="display:flex; gap:4px;">
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;"
            data-toggle-league="${esc(l.leagueId)}" data-active="${l.active}">
            ${l.active ? 'Deactivate' : 'Activate'}
          </button>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;"
            data-toggle-create="${esc(l.leagueId)}" data-can-create="${l.canCreateLeagues !== false}"
            ${!canCreate ? 'disabled title="Your league cannot create leagues"' : ''}>
            ${l.canCreateLeagues !== false ? 'Disallow Create' : 'Allow Create'}
          </button>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;"
            data-toggle-hidden="${esc(l.leagueId)}" data-hidden="${!!l.hidden}">
            ${l.hidden ? 'Make Visible' : 'Hide'}
          </button>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('leagues-table').innerHTML = html;
    applyNavVisibility(); // ensure nav stays correct after async renderLeagues

    document.querySelectorAll('[data-toggle-league]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleLeague;
        const nowActive = btn.dataset.active === 'true';
        try {
          await API.updateLeague(lid, undefined, undefined, !nowActive, undefined);
          toast(`League ${nowActive ? 'deactivated' : 'activated'}.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-hidden]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleHidden;
        const nowHidden = btn.dataset.hidden === 'true';
        try {
          await API.updateLeague(lid, undefined, undefined, undefined, undefined, !nowHidden);
          toast(`League is now ${nowHidden ? 'visible' : 'hidden'}.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-create]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleCreate;
        const nowCan = btn.dataset.canCreate === 'true';
        try {
          const callerLeagueId = Auth.getSession()?.leagueId;
          await API.updateLeagueWithCaller(lid, undefined, undefined, undefined, !nowCan, callerLeagueId);
          toast(`League ${nowCan ? 'can no longer' : 'can now'} create leagues.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });
  }

  // ── Helpers ────────────────────────────────────────────────
  function setupWeekNav(prevId, nextId, stateKey, cb) {
    document.getElementById(prevId).addEventListener('click', () => {
      if (state[stateKey] > 1) { state[stateKey]--; saveWeekPrefs(); cb(); }
    });
    document.getElementById(nextId).addEventListener('click', () => {
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
