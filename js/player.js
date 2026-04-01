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

// ============================================================
// player.js — Player dashboard logic
// ============================================================

(async function init() {
  const session = Auth.requireAuth(false);
  if (!session) return;

  const playerName = session.name;
  document.getElementById('topbar-name').textContent = playerName;
  document.getElementById('topbar-league').textContent = session.leagueName || state.config.leagueName || 'League';
  const userRole = session.role || (session.isAdmin ? 'admin' : (session.canScore ? 'scorer' : 'player'));
  const canScore = session.canScore || session.isAdmin || userRole === 'scorer' || userRole === 'assistant';

  // Show role badge for non-standard roles
  const roleLabels = { scorer: 'Scorer', assistant: 'Admin Assistant', spectator: 'Spectator', sub: 'Sub' };
  const roleColors = { scorer: 'rgba(45,122,58,0.2)', assistant: 'rgba(42,63,84,0.8)', spectator: 'rgba(232,184,75,0.15)', sub: 'rgba(122,155,181,0.15)' };
  const roleTextColors = { scorer: 'var(--green)', assistant: 'var(--muted)', spectator: 'var(--gold)', sub: 'var(--muted)' };
  const roleEl = document.getElementById('topbar-role');
  if (roleEl && roleLabels[userRole]) {
    roleEl.textContent = roleLabels[userRole];
    roleEl.style.background = roleColors[userRole] || 'rgba(255,255,255,0.07)';
    roleEl.style.color = roleTextColors[userRole] || 'var(--muted)';
    roleEl.style.display = '';
  }

  if (canScore) {
    document.getElementById('nav-score-entry')?.classList.remove('hidden');
  }

  let state = {
    config: {}, players: [], attendance: [],
    pairings: [], scores: [], standings: [],
    currentSheetWeek: 1, currentWstandWeek: 1,
    dataLoaded: false,  // true after phase 2 pairings/scores are loaded
    saveLocks: {}       // per-week save queue to prevent concurrent writes
  };

  // ── Phase 1: Fast load — config, players, attendance ────────
  // Renders the UI shell immediately so the player sees content fast.
  showLoading(true);
  try {
    const early = await API.getEarlyData();
    state.config = sanitizeConfig(early.config     || {});
    state.players    = early.players    || [];
    state.attendance = early.attendance || [];
  } catch (e) {
    toast('Failed to load data: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }

  renderAll();
  setupNav();
  setupEvents();
  // Reconcile scoresheet and score-entry week — always start on the same session.
  if (canScore) {
    const reconciled = Math.max(state.currentSheetWeek || 1, state.currentScoreEntryWeek || 1);
    state.currentSheetWeek     = reconciled;
    state.currentScoreEntryWeek = reconciled;
  }
  // Populate session selects immediately with phase-1 config
  populateWeekSelect('sheet-week-select', 'currentSheetWeek');
  populateWeekSelect('wstand-select', 'currentWstandWeek');
  if (canScore) populateWeekSelect('player-score-week-select', 'currentScoreEntryWeek');

  // ── Phase 2: Background load — pairings, scores, standings ──
  // Fetches the last 3 sessions of data based on what actually exists,
  // not the configured total. This ensures current scores are always loaded.
  (async () => {
    try {
      // First do a lightweight fetch of just the session numbers that have data,
      // then use that to compute a safe sinceWeek based on actual content.
      // Since we don't have pairings/scores yet, use config weeks as a fallback
      // but fetch from 3 sessions before the LAST session (not the total count).
      // Always load from session 1 so player reports, standings, and history are complete.
      const sinceWeek  = 1;
      const data = await API.getAllData(sinceWeek);
      state.pairings  = data.pairings  || [];
      state.scores    = data.scores    || [];
      state.standings = data.standings || [];
      state.loadedSinceWeek = sinceWeek;

      // Update current week pointers to latest available
      const weeksWithPairings = [...new Set(state.pairings.map(p => parseInt(p.week)))];
      const weeksWithScores = [...new Set(state.scores.map(s => parseInt(s.week)))];

      // Scoresheet defaults to latest session with scores; falls back to latest with pairings
      if (weeksWithScores.length) {
        state.currentSheetWeek = Math.max(...weeksWithScores);
      } else if (weeksWithPairings.length) {
        state.currentSheetWeek = Math.max(...weeksWithPairings);
      }

      // Standings defaults to latest session with scores
      if (weeksWithScores.length) {
        state.currentWstandWeek = Math.max(...weeksWithScores);
      }

      // If the current sheet week falls before our sinceWeek window, we missed
      // its scores — do a full reload to get everything
      if (state.currentSheetWeek < sinceWeek) {
        const fullData = await API.getAllData();
        state.pairings  = fullData.pairings  || [];
        state.scores    = fullData.scores    || [];
        state.standings = fullData.standings || [];
        state.loadedSinceWeek = 1;
        const wp2 = [...new Set(state.pairings.map(p => parseInt(p.week)))];
        const ws2 = [...new Set(state.scores.map(s => parseInt(s.week)))];
        if (ws2.length) state.currentSheetWeek = Math.max(...ws2);
        else if (wp2.length) state.currentSheetWeek = Math.max(...wp2);
        if (ws2.length) state.currentWstandWeek = Math.max(...ws2);
      }

      // Re-render now that we have scores and pairings
      state.dataLoaded = true;
      gaPage('Player Dashboard');
      gaEvent('login', { role: userRole });
      renderAll();
      // Populate session selects now that config and data are loaded
      populateWeekSelect('sheet-week-select', 'currentSheetWeek');
      populateWeekSelect('wstand-select', 'currentWstandWeek');
      if (canScore) populateWeekSelect('player-score-week-select', 'currentScoreEntryWeek');

      // ── New pairings indicator ──────────────────────────────
      // Show a pulsing dot on "My Games" nav if the latest pairing week
      // is newer than what this player last acknowledged.
      const seenKey = `pb_seen_week_${session.leagueId}_${playerName}`;
      const latestPairingWeek = weeksWithPairings.length ? Math.max(...weeksWithPairings) : 0;
      const lastSeenWeek = parseInt(localStorage.getItem(seenKey) || '0');

      if (latestPairingWeek > lastSeenWeek) {
        const myGamesActive = document.getElementById('page-my-games')?.classList.contains('active');
        if (myGamesActive) {
          // Already on My Games — mark seen immediately, no dot needed
          localStorage.setItem(seenKey, String(latestPairingWeek));
        } else {
          const navMyGames = document.querySelector('.nav-item[data-page="my-games"]');
          if (navMyGames && !navMyGames.querySelector('.new-dot')) {
            const dot = document.createElement('span');
            dot.className = 'new-dot';
            dot.title = 'New pairings available';
            navMyGames.appendChild(dot);
          }
        }
      }
    } catch (e) {
      toast('Background data load failed: ' + e.message, 'error');
    }
  })();

  // ── Nav ────────────────────────────────────────────────────
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        // Pre-emptively show spinner on score-entry BEFORE making panel visible
        if (item.dataset.page === 'score-entry') {
          const entryEl = document.getElementById('player-scoresheet-entry');
          if (entryEl) entryEl.innerHTML = `
            <div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
              <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
              <div>Loading scores…</div>
            </div>`;
        }

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        document.getElementById('page-' + page)?.classList.add('active');
        gaPage('Player: ' + page);
        if (page === 'player-report') renderPlayerReportSelect();
        if (page === 'score-entry') {
          const wk = state.currentScoreEntryWeek || state.currentSheetWeek || 1;
          const fetchId = Date.now();
          state._scoreEntryFetchId = fetchId;
          API.getScores(wk).then(data => {
            if (state._scoreEntryFetchId !== fetchId) return;
            if (data && data.scores) {
              state.scores = state.scores.filter(s => parseInt(s.week) !== parseInt(wk));
              state.scores.push(...data.scores.filter(s => parseInt(s.week) === parseInt(wk)));
            }
            renderScoreEntry();
          }).catch(() => {
            if (state._scoreEntryFetchId !== fetchId) return;
            renderScoreEntry();
          });
        }
        if (page === 'standings') {
          // Fetch fresh scores and standings from server before rendering
          API.getScores().then(data => {
            if (data && data.scores) {
              state.scores = data.scores;
              state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
            }
            renderPlayerStandings();
          }).catch(() => renderPlayerStandings());
        }
        if (page === 'tournament') renderTournamentBracket();
        if (page === 'attendance') {
          // Re-fetch attendance so player sees latest state from server
          API.getAttendance().then(data => {
            if (data && data.attendance) state.attendance = data.attendance;
            // If config.weeks still missing, attempt a config re-fetch
            if (!state.config.weeks) {
              API.getConfig().then(cfg => { if (cfg && cfg.config) state.config = sanitizeConfig(cfg.config); }).catch(() => {});
            }
            renderMyAttendance();
          }).catch(() => renderMyAttendance());
        }
        if (page === 'attendance-all') {
          // Re-fetch attendance for the full grid view too
          API.getAttendance().then(data => {
            if (data && data.attendance) state.attendance = data.attendance;
            renderFullAttendance();
          }).catch(() => renderFullAttendance());
        }

        // Clear new-pairings dot when player opens My Games
        if (page === 'my-games') {
          const dot = item.querySelector('.new-dot');
          if (dot) dot.remove();
          const weeksWithPairings = [...new Set(state.pairings.map(p => parseInt(p.week)))];
          const latestPairingWeek = weeksWithPairings.length ? Math.max(...weeksWithPairings) : 0;
          if (latestPairingWeek) {
            const seenKey = `pb_seen_week_${session.leagueId}_${playerName}`;
            localStorage.setItem(seenKey, String(latestPairingWeek));
          }
        }
      });
    });
  }

  function renderAll() {
    updatePageHeaders();
    renderNextGame();
    renderMyGames();
    renderMyAttendance();
    renderEmailPrefs();
    renderChangePin();
    renderScoresheet();
    renderPlayerStandings();
    renderFullAttendance();
    renderPlayerReportSelect();
    renderTournamentBracket();
    if (canScore) renderScoreEntry();
  }

  function updatePageHeaders() {
    const lName = session.leagueName || state.config.leagueName || '';
    const sep = lName ? '  ·  ' : '';
    const h = (id, label) => {
      const el = document.getElementById(id);
      if (el) el.textContent = lName ? lName + sep + label : label;
    };
    h('ph-availability',   'My Availability');
    h('ph-scoresheet',     'Scoresheet');
    h('ph-score-entry',    'Score Entry');
    h('ph-standings',      'Standings');
    h('ph-attendance-all', 'Attendance');
  }

  // ── Next Game Widget ───────────────────────────────────────
  function renderNextGame() {
    const el = document.getElementById('my-next-game');
    if (!el) return;

    // Find the latest week that has pairings
    const weeks = [...new Set(state.pairings.map(p => parseInt(p.week)))].sort((a,b) => a-b);
    if (!weeks.length) { el.innerHTML = ''; return; }
    const week = Math.max(...weeks);

    // Find all rounds this week
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));
    if (!weekPairings.length) { el.innerHTML = ''; return; }

    // Find the earliest round that hasn't been scored yet where this player plays
    const rounds = [...new Set(weekPairings.map(p => p.round))].sort((a,b) => a-b);
    let nextGame = null;
    let nextRound = null;

    for (const r of rounds) {
      const game = weekPairings.find(p => p.round == r &&
        [p.p1, p.p2, p.p3, p.p4].includes(playerName));
      if (!game) continue;
      // Check if this round is already scored
      const scored = state.scores.find(
        s => parseInt(s.week) === week && parseInt(s.round) === parseInt(r) &&
             String(s.court) === String(game.court) &&
             (s.score1 !== '' && s.score2 !== '')
      );
      if (!scored) { nextGame = game; nextRound = r; break; }
    }

    if (!nextGame) {
      // All rounds scored — show last game result instead
      const lastRound = Math.max(...rounds);
      const lastGame = weekPairings.find(p => p.round == lastRound &&
        [p.p1, p.p2, p.p3, p.p4].includes(playerName));
      if (!lastGame) { el.innerHTML = ''; return; }
      const score = state.scores.find(
        s => parseInt(s.week) === week && parseInt(s.round) === lastRound &&
             String(s.court) === String(lastGame.court));
      const myTeam = [lastGame.p1, lastGame.p2].includes(playerName) ? 1 : 2;
      const partner = myTeam === 1
        ? (lastGame.p2 || '—') : (lastGame.p4 || '—');
      const opps = myTeam === 1
        ? [lastGame.p3, lastGame.p4].filter(Boolean)
        : [lastGame.p1, lastGame.p2].filter(Boolean);
      const s1 = score ? score.score1 : '—';
      const s2 = score ? score.score2 : '—';
      const myScore = myTeam === 1 ? s1 : s2;
      const oppScore = myTeam === 1 ? s2 : s1;
      const won = score && parseInt(myScore) > parseInt(oppScore);
      const date = formatDateTime(week, state.config) ? ' · ' + formatDateTime(week, state.config) : '';

      el.innerHTML = `<div class="card mt-1" style="border-left:3px solid ${won ? 'var(--green)' : 'var(--danger)'}; margin-bottom:12px;">
        <div class="card-header" style="padding-bottom:8px;">
          <div class="card-title" style="font-size:0.78rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Session ${week}${date} · Round ${lastRound} — All Done</div>
          <span class="badge ${won ? 'badge-green' : 'badge-red'}">${won ? 'W' : 'L'} ${myScore}–${oppScore}</span>
        </div>
        <div style="display:flex; gap:24px; flex-wrap:wrap; font-size:0.88rem;">
          <div><span class="label">Court</span><br><strong>${courtName(lastGame.court)}</strong></div>
          <div><span class="label">Partner</span><br><strong style="color:var(--green);">${esc(partner)}</strong></div>
          <div><span class="label">Opponents</span><br><strong>${opps.map(o => esc(o)).join(' &amp; ')}</strong></div>
        </div>
      </div>`;
      return;
    }

    const myTeam = [nextGame.p1, nextGame.p2].includes(playerName) ? 1 : 2;
    const partner = myTeam === 1 ? (nextGame.p2 || '—') : (nextGame.p4 || '—');
    const opps = myTeam === 1
      ? [nextGame.p3, nextGame.p4].filter(Boolean)
      : [nextGame.p1, nextGame.p2].filter(Boolean);
    const date = formatDateTime(week, state.config) ? ' · ' + formatDateTime(week, state.config) : '';

    el.innerHTML = `<div class="card mt-1" style="border-left:3px solid var(--gold); margin-bottom:12px;">
      <div class="card-header" style="padding-bottom:8px;">
        <div class="card-title" style="font-size:0.78rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Session ${week}${date} · Up Next — Round ${nextRound}</div>
        <span class="badge badge-gold">${courtName(nextGame.court)}</span>
      </div>
      <div style="display:flex; gap:24px; flex-wrap:wrap; font-size:0.88rem;">
        <div><span class="label">Partner</span><br><strong style="color:var(--green); font-size:1rem;">${esc(partner)}</strong></div>
        <div><span class="label">Opponents</span><br><strong style="font-size:1rem;">${opps.map(o => esc(o)).join(' &amp; ')}</strong></div>
      </div>
    </div>`;
  }

  // ── My Games ───────────────────────────────────────────────
  function renderMyGames() {
    const report = Reports.computePlayerReport(playerName, state.scores, state.standings);
    const s = report.standing;

    document.getElementById('my-games-title').textContent = `${playerName}'s Games`;

    const infoEl = document.getElementById('my-league-info');
    if (infoEl) {
      const c = state.config;
      const parts = [];
      const displayName = session.leagueName || c.leagueName || '';
      if (displayName)     parts.push(`<span>🥒 ${esc(displayName)}</span>`);
      if (c.location)     parts.push(`<span>📍 ${esc(c.location)}</span>`);
      if (c.sessionTime)  parts.push(`<span>🕐 ${esc(c.sessionTime)}</span>`);
      if (c.notes)        parts.push(`<span>📌 ${esc(c.notes)}</span>`);

      // Personal login URL — always derived from session.leagueId so slug is always correct
      let urlHtml = '';
      const lid = session.leagueId || '';
      if (lid) {
        const base = (c.leagueUrl || '').replace(/([?&]league=)[^&]*.*$/, '').replace(/[?&]$/, '')
                  || 'https://pb-league.github.io/league/index.html';
        const leagueUrl  = base + '?league=' + encodeURIComponent(lid);
        const personalUrl = leagueUrl + '&player=' + encodeURIComponent(playerName);
        urlHtml = `<div style="margin-top:10px; padding:10px 12px; background:rgba(255,255,255,0.04);
                               border-radius:8px; border:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:0.72rem; color:var(--muted); text-transform:uppercase;
                      letter-spacing:0.06em; margin-bottom:6px;">Your personal login link</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <code style="font-size:0.75rem; color:var(--green); word-break:break-all;
                         flex:1; min-width:0;">${esc(personalUrl)}</code>
            <button onclick="navigator.clipboard.writeText('${personalUrl.replace(/'/g, "\\'")}').then(()=>{ this.textContent='✓ Copied'; setTimeout(()=>this.textContent='Copy',1500); })"
                    style="flex-shrink:0; font-size:0.72rem; padding:4px 10px; border-radius:5px;
                           background:rgba(94,194,106,0.15); color:var(--green); border:1px solid rgba(94,194,106,0.3);
                           cursor:pointer;">Copy</button>
          </div>
          <div style="font-size:0.7rem; color:var(--muted); margin-top:5px;">
            Bookmark this link to go straight to your PIN entry next time.
          </div>
        </div>`;
      }

      infoEl.innerHTML = (parts.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:8px 20px; margin-bottom:12px; font-size:0.85rem; color:var(--muted);">${parts.join('')}</div>`
        : '') + urlHtml;
    }

    const rulesEl = document.getElementById('player-dash-rules');
    if (rulesEl) {
      const rules = state.config.rules || '';
      rulesEl.innerHTML = rules
        ? `<div class="card mt-1" style="margin-bottom:12px;">
            <div class="card-header"><div class="card-title">League Rules</div></div>
            <pre style="white-space:pre-wrap; font-family:inherit; font-size:0.85rem; color:var(--muted); margin:0; line-height:1.7;">${esc(rules)}</pre>
          </div>`
        : '';
    }

    if (s) {
      document.getElementById('my-rank-badge').innerHTML =
        `<span class="badge badge-gold" style="font-size:0.9rem; padding:6px 16px;">Rank #${s.rank}</span>`;

      document.getElementById('my-stats').innerHTML = `
        <div class="stat-tile"><div class="stat-value">${Reports.pct(s.winPct)}</div><div class="stat-label">Win %</div></div>
        <div class="stat-tile"><div class="stat-value">${s.wins}/${s.losses}</div><div class="stat-label">W / L</div></div>
        ${(state.config.rankingMethod === 'ptspct')
          ? `<div class="stat-tile"><div class="stat-value">${((s.points/(s.points+s.pointsAgainst||1))*100).toFixed(1)}%</div><div class="stat-label">Pts%</div></div>`
          : `<div class="stat-tile"><div class="stat-value">${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</div><div class="stat-label">Avg Pt Diff</div></div>`
        }
        <div class="stat-tile"><div class="stat-value">${s.games}</div><div class="stat-label">Games Played</div></div>
      `;
    }

    // ── Upcoming Games ───────────────────────────────────────
    const upcomingEl = document.getElementById('my-upcoming-games');
    if (upcomingEl) {
      const today = state.currentSheetWeek || 1;
      // Future weeks: have pairings but no scores for this player
      const upcomingWeeks = [...new Set(
        state.pairings
          .filter(p => parseInt(p.week) >= today && (p.type === 'game' || p.type === 'tourn-game' || p.type === 'bye'))
          .map(p => parseInt(p.week))
      )].sort((a,b) => a-b);

      let upHtml = '';
      upcomingWeeks.forEach(w => {
        const weekPairings = state.pairings.filter(p => parseInt(p.week) === w);
        const rounds = [...new Set(weekPairings.map(p => p.round))].sort((a,b) => a-b);

        // Check if player has anything this week
        const hasAny = weekPairings.some(p =>
          [p.p1, p.p2, p.p3, p.p4].includes(playerName)
        );
        if (!hasAny) return;

        const dateStr = formatDateTime(w, state.config);
        const wLabel = dateStr ? `Session ${w} — ${dateStr}` : `Session ${w}`;
        upHtml += `<div style="margin-bottom:6px;">
          <div style="font-size:0.72rem; font-weight:700; text-transform:uppercase;
                      letter-spacing:0.07em; color:var(--muted); margin-bottom:3px;">${esc(wLabel)}</div>`;

        rounds.forEach(r => {
          const roundPairings = weekPairings.filter(p => p.round == r);
          const myRoundGames = roundPairings.filter(p =>
            (p.type === 'game' || p.type === 'tourn-game') &&
            [p.p1, p.p2, p.p3, p.p4].includes(playerName)
          );
          const myRoundBye = roundPairings.some(p =>
            (p.type === 'bye' || p.type === 'tourn-bye') &&
            [p.p1, p.p2].includes(playerName)
          );
          if (!myRoundGames.length && !myRoundBye) return;

          upHtml += `<div style="display:flex; align-items:center; gap:10px; margin:5px 0 3px;">
            <span style="font-size:0.82rem; font-weight:700; color:var(--white); white-space:nowrap;">Round ${r}</span>
            <div style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></div>
          </div>`;

          myRoundGames.forEach(g => {
            const isTeam1 = [g.p1, g.p2].includes(playerName);
            const myTeamP1 = isTeam1 ? g.p1 : g.p3;
            const myTeamP2 = isTeam1 ? g.p2 : g.p4;
            const partner  = (myTeamP1 === playerName ? myTeamP2 : myTeamP1) || '';
            const opp1 = isTeam1 ? g.p3 : g.p1;
            const opp2 = isTeam1 ? g.p4 : g.p2;
            const opponents = [opp1, opp2].filter(Boolean);
            const cn = courtName(g.court);
            upHtml += `<div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center;
                                    gap:6px; padding:4px 8px; background:var(--card-bg);
                                    border-radius:7px; margin-bottom:2px; font-size:0.85rem;">
              <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                          letter-spacing:0.08em; color:var(--muted); padding-right:4px;">${esc(cn)}</div>
              <div style="text-align:right; font-weight:600; color:var(--white);">
                ${esc(playerName)}${partner ? `<br><span style="color:var(--muted); font-weight:400;">${esc(partner)}</span>` : ''}
              </div>
              <div style="color:var(--muted); font-size:0.78rem; padding:0 4px;">vs</div>
              <div style="color:var(--muted);">
                ${opponents.map(o => esc(o)).join('<br>')}
              </div>
            </div>`;
          });

          if (myRoundBye) {
            upHtml += `<div style="padding:4px 10px; font-size:0.82rem; color:var(--muted);">⏸ Bye — Round ${r}</div>`;
          }
        });

        upHtml += `</div>`;
      });

      upcomingEl.innerHTML = upHtml ? `
        <details open style="margin-top:12px;">
          <summary style="list-style:none; cursor:pointer; user-select:none;">
            <div class="card-header" style="display:flex; align-items:center; justify-content:space-between;
                 padding:10px 16px; background:var(--card-bg); border-radius:10px;">
              <div class="card-title">Upcoming Games</div>
              <span class="upcoming-toggle-icon" style="font-size:0.75rem; color:var(--muted);">▲ Hide</span>
            </div>
          </summary>
          <div class="card" style="border-top-left-radius:0; border-top-right-radius:0; margin-top:2px; padding:8px 12px;">
            ${upHtml}
          </div>
        </details>` : '';

      // Update toggle icon when opened/closed
      upcomingEl.querySelectorAll('details').forEach(d => {
        d.addEventListener('toggle', () => {
          const icon = d.querySelector('.upcoming-toggle-icon');
          if (icon) icon.textContent = d.open ? '▲ Hide' : '▼ Show';
        });
      });
    }

    // ── Game History toggle icon ──────────────────────────────
    const histDetails = document.getElementById('my-game-history-details');
    const histIcon = document.getElementById('history-toggle-icon');
    if (histDetails && histIcon && !histDetails.dataset.wired) {
      histDetails.dataset.wired = '1';
      histDetails.addEventListener('toggle', () => {
        histIcon.textContent = histDetails.open ? '▲ Hide' : '▼ Show';
      });
    }

    if (!report.games.length) {
      document.getElementById('my-game-history').innerHTML = state.dataLoaded
        ? '<p class="text-muted">No games recorded yet.</p>'
        : `<div style="text-align:center; padding:24px; color:var(--muted); font-size:0.85rem;">
             <div style="font-size:1.6rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
             <div>Loading games…</div>
           </div>`;
      return;
    }

    let html = `<table class="compact-table" style="width:100%;">
      <thead><tr><th>Ses</th><th>Rd</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
      <tbody>`;

    report.games.forEach(g => {
      html += `<tr>
        <td>${g.week}</td>
        <td>${g.round}</td>
        <td class="player-name">${esc(g.partner)}</td>
        <td class="text-muted">${g.opponents.map(o => esc(o)).join(' & ')}</td>
        <td><strong>${g.myScore}</strong> — ${g.oppScore}</td>
        <td><span class="badge ${g.won ? 'badge-green' : 'badge-red'}">${g.won ? 'W' : 'L'}</span></td>
      </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('my-game-history').innerHTML = html;
  }

  // ── My Attendance ──────────────────────────────────────────
  function renderMyAttendance() {
    const weeks = parseInt(state.config.weeks) || 0;
    if (!weeks) {
      // Config not yet loaded — show spinner, phase 1 renderAll() will re-render
      document.getElementById('my-attendance-grid').innerHTML =
        '<div style="text-align:center; padding:24px; color:var(--muted); font-size:0.85rem;">⏳ Loading…</div>';
      return;
    }
    let html = '<div style="display:flex; flex-wrap:wrap; gap:10px;">';

    for (let w = 1; w <= weeks; w++) {
      const rec = state.attendance.find(a => a.player === playerName && String(a.week) === String(w));
      const status = rec ? rec.status : 'tbd';
      const date = formatDateTime(w, state.config);

      html += `<div style="text-align:center; min-width:90px;">
        <div class="label" style="margin-bottom:6px;">Session ${w}${date ? `<br>${date}` : ''}</div>
        <div class="att-cell editable ${status}" data-week="${w}" style="padding:10px 0; border-radius:8px; cursor:pointer;">
          <div style="font-size:1.2rem; margin-bottom:2px;">${statusIcon(status)}</div>
          ${statusLabel(status)}
        </div>
      </div>`;
    }

    html += '</div>';
    document.getElementById('my-attendance-grid').innerHTML = html;

    document.querySelectorAll('#my-attendance-grid .att-cell.editable').forEach(cell => {
      cell.addEventListener('click', async () => {
        const myPlayer = state.players.find(pl => pl.name === playerName);
        const isSpectatorRole = myPlayer && myPlayer.role === 'spectator';
        const states = isSpectatorRole ? ['absent', 'tbd'] : ['tbd', 'present', 'absent'];
        const curStatus = states.find(s => cell.classList.contains(s)) || 'tbd';
        const next = states[(states.indexOf(curStatus) + 1) % states.length];
        const week = cell.dataset.week;

        cell.className = `att-cell editable ${next}`;
        cell.innerHTML = `<div style="font-size:1.2rem; margin-bottom:2px;">${statusIcon(next)}</div>${statusLabel(next)}`;

        const rec = state.attendance.find(a => a.player === playerName && String(a.week) === String(week));
        if (rec) { rec.status = next; } else { state.attendance.push({ player: playerName, week, status: next }); }

        try {
          await API.setAttendance(playerName, week, next);
        } catch (e) { toast('Failed to save', 'error'); }
      });
    });
  }

  // ── Email Preferences ─────────────────────────────────────
  function renderEmailPrefs() {
    const el = document.getElementById('email-prefs');
    if (!el) return;
    const me = state.players.find(p => p.name === playerName) || {};
    el.innerHTML = `
      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Email Notifications</div></div>
        <p style="font-size:0.85rem; color:var(--muted); margin-bottom:14px;">
          Receive session results by email after each session.
        </p>
        <div class="form-row" style="align-items:center; gap:16px;">
          <div class="form-group" style="flex:2;">
            <label class="form-label">Your Email Address</label>
            <input class="form-control" id="player-email" type="email"
              value="${esc(me.email || '')}" placeholder="you@example.com">
          </div>
          <div class="form-group" style="flex:0; white-space:nowrap;">
            <label class="form-label">Send Results</label>
            <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              <input type="checkbox" id="player-notify" ${me.notify ? 'checked' : ''}
                style="width:18px; height:18px;">
              <span style="font-size:0.85rem; color:var(--white);">Yes, notify me</span>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" id="btn-save-email" style="margin-top:4px;">Save</button>
        <div id="email-save-status" style="font-size:0.8rem; margin-top:8px;"></div>
      </div>`;

    document.getElementById('btn-save-email').addEventListener('click', async () => {
      const email  = document.getElementById('player-email').value.trim();
      const notify = document.getElementById('player-notify').checked;
      const btn    = document.getElementById('btn-save-email');
      const status = document.getElementById('email-save-status');
      btn.disabled = true;
      try {
        // Update local player record then save all players
        const updatedPlayers = state.players.map(pl =>
          pl.name === playerName ? { ...pl, email, notify } : pl
        );
        await API.savePlayers(updatedPlayers);
        state.players = updatedPlayers;
        status.textContent = '✓ Saved';
        status.style.color = 'var(--green)';
      } catch (e) {
        status.textContent = 'Save failed: ' + e.message;
        status.style.color = 'var(--danger)';
      } finally { btn.disabled = false; }
    });
  }

  // ── Change PIN ────────────────────────────────────────────
  function renderChangePin() {
    const el = document.getElementById('change-pin-section');
    if (!el) return;

    el.innerHTML = `
      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Change PIN</div></div>
        <div class="form-row" style="align-items:flex-end; gap:12px; flex-wrap:wrap;">
          <div class="form-group" style="min-width:120px;">
            <label class="form-label">Current PIN</label>
            <input class="form-control" id="pin-current" type="password" maxlength="8" placeholder="••••" autocomplete="off">
          </div>
          <div class="form-group" style="min-width:120px;">
            <label class="form-label">New PIN</label>
            <input class="form-control" id="pin-new" type="password" maxlength="8" placeholder="••••" autocomplete="off">
          </div>
          <div class="form-group" style="min-width:120px;">
            <label class="form-label">Confirm New PIN</label>
            <input class="form-control" id="pin-confirm" type="password" maxlength="8" placeholder="••••" autocomplete="off">
          </div>
          <div class="form-group" style="flex:0;">
            <button class="btn btn-primary" id="btn-change-pin">Update PIN</button>
          </div>
        </div>
        <div id="pin-change-status" style="font-size:0.82rem; margin-top:6px;"></div>
      </div>`;

    document.getElementById('btn-change-pin').addEventListener('click', async () => {
      const current = document.getElementById('pin-current').value.trim();
      const newPin  = document.getElementById('pin-new').value.trim();
      const confirm = document.getElementById('pin-confirm').value.trim();
      const status  = document.getElementById('pin-change-status');
      const btn     = document.getElementById('btn-change-pin');

      status.textContent = '';
      status.style.color = '';

      if (!current || !newPin || !confirm) {
        status.textContent = 'Please fill in all three fields.';
        status.style.color = 'var(--danger)';
        return;
      }
      if (newPin !== confirm) {
        status.textContent = 'New PIN and confirmation do not match.';
        status.style.color = 'var(--danger)';
        return;
      }
      if (newPin.length < 1) {
        status.textContent = 'New PIN cannot be empty.';
        status.style.color = 'var(--danger)';
        return;
      }

      btn.disabled = true;
      btn.textContent = '…';
      try {
        const result = await API.changePin(playerName, current, newPin);
        if (result.success) {
          status.textContent = '✓ PIN updated successfully.';
          status.style.color = 'var(--green)';
          document.getElementById('pin-current').value = '';
          document.getElementById('pin-new').value = '';
          document.getElementById('pin-confirm').value = '';
        } else {
          status.textContent = result.reason || 'Could not update PIN.';
          status.style.color = 'var(--danger)';
        }
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
        status.style.color = 'var(--danger)';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Update PIN';
      }
    });
  }

  // ── Scoresheet (read-only) ─────────────────────────────────
  function renderPlayerFinishScenarios() {
    const card    = document.getElementById('player-finish-scenarios-card');
    const content = document.getElementById('player-finish-scenarios-content');
    if (!card || !content) return;

    const totalWeeks  = parseInt(state.config.weeks || 0);
    const totalRounds = parseInt(state.config.gamesPerSession || 0);
    const week        = state.currentSheetWeek;

    if (!totalWeeks || !totalRounds || week !== totalWeeks) {
      card.style.display = 'none';
      return;
    }

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
    </p>`;

    results.forEach(r => {
      const medal = r.bestRank === 1 ? '🥇' : r.bestRank === 2 ? '🥈' : '🥉';
      const rankLabel = r.bestRank === 1 ? '1st' : r.bestRank === 2 ? '2nd' : '3rd';
      const currentLabel = r.currentRank === 1 ? '1st' : r.currentRank === 2 ? '2nd' : r.currentRank === 3 ? '3rd' : `${r.currentRank}th`;
      const isMe = r.name === session.name;

      html += `<div style="margin-bottom:14px; padding:10px 14px; background:var(--card-bg); border-radius:8px;
        border-left:3px solid ${r.bestRank === 1 ? '#ffd700' : r.bestRank === 2 ? '#c0c0c0' : '#cd7f32'};
        ${isMe ? 'outline:1px solid var(--green);' : ''}">`;
      html += `<div style="font-weight:700; font-size:0.95rem; margin-bottom:6px;">
        ${medal} ${esc(r.name)}${isMe ? ' <span style="color:var(--green); font-size:0.75rem;">(you)</span>' : ''}
        <span style="color:var(--muted); font-weight:400; font-size:0.82rem;">currently ${currentLabel}</span>
      </div>`;

      if (r.guaranteed) {
        html += `<div style="color:var(--green); font-size:0.85rem;">Guaranteed to finish ${rankLabel} regardless of remaining results.</div>`;
      } else if (r.scenarios.length) {
        html += `<div style="font-size:0.82rem; color:var(--muted); margin-bottom:4px;">Can finish ${rankLabel} if:</div>`;
        html += `<ul style="margin:0; padding-left:18px; font-size:0.82rem; line-height:1.8;">`;
        r.scenarios.forEach(s => { html += `<li>${esc(s)}</li>`; });
        html += `</ul>`;
      }
      html += `</div>`;
    });

    content.innerHTML = html;
  }

  function renderScoresheet() {
    const week = state.currentSheetWeek;
    const dateStr = formatDateTime(week, state.config);
    const lName = session.leagueName || state.config.leagueName || '';
    const title = lName
      ? (dateStr ? `${lName}  ·  Session ${week} — ${dateStr}` : `${lName}  ·  Session ${week}`)
      : (dateStr ? `Session ${week} — ${dateStr}` : `Session ${week}`);
    renderPlayerFinishScenarios();
    const weekLabelEl = document.getElementById('sheet-week-label');
    if (weekLabelEl) weekLabelEl.textContent = title;
    const sheetWkSel = document.getElementById('sheet-week-select');
    if (sheetWkSel && sheetWkSel.value != week) sheetWkSel.value = week;

    // Update scoresheet card title
    const sheetTitle = document.getElementById('scoresheet-card-title');
    if (sheetTitle) sheetTitle.textContent = title;

    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));

    if (!weekPairings.length) {
      document.getElementById('player-scoresheet').innerHTML =
        '<p class="text-muted">No pairings for this session yet.</p>';
      return;
    }

    const allWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const rounds = [...new Set(allWeekPairings.map(p => p.round))].sort((a,b) => a-b);
    let html = '';

    rounds.forEach(r => {
      const roundGames = weekPairings.filter(p => p.round == r);
      const scored = roundGames.filter(g => {
        const sc = state.scores.find(s => parseInt(s.week)===week && parseInt(s.round)===parseInt(g.round) && String(s.court)===String(g.court));
        return sc && sc.score1 !== null && sc.score2 !== null;
      }).length;
      const allDone = scored === roundGames.length && roundGames.length > 0;
      const badgeColor = allDone ? 'var(--green)' : scored > 0 ? 'var(--gold)' : 'var(--muted)';
      const badgeText = allDone ? `${scored}/${roundGames.length} ✓` : scored > 0 ? `${scored}/${roundGames.length}` : `${roundGames.length} game${roundGames.length!==1?'s':''}`;

      html += `<details open style="margin-bottom:5px;">
        <summary style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;
          padding:4px 8px; border-radius:7px; background:var(--card-bg); list-style:none; user-select:none;"
          class="round-summary">
          <span style="display:flex; align-items:center; gap:6px;">
            <span class="collapse-arrow" style="font-size:0.68rem; color:var(--green); opacity:0.6;">${!allDone ? '▲' : '▼'}</span>
            <span style="font-size:0.76rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Round ${r}</span>
          </span>
          <span class="round-badge" style="font-size:0.7rem; color:${badgeColor}; font-weight:600;">${badgeText}</span>
        </summary>
        <div style="padding-top:3px;">`;

      // Byes after games — one compact line, highlight if it's me
      const byePlayers1 = [...new Set(
        allWeekPairings.filter(p => p.round == r && p.type === 'bye')
                       .flatMap(p => [p.p1, p.p2].filter(Boolean))
      )];
      if (byePlayers1.length) {
        const isMyBye = byePlayers1.includes(playerName);
        html += `<div style="padding:4px 8px; font-size:0.82rem; display:flex; align-items:center; gap:6px;
          ${isMyBye ? 'border-left:3px solid var(--gold); padding-left:8px;' : ''}">
          <span style="color:var(--muted);">⏸ Bye:</span>
          <strong style="${isMyBye ? 'color:var(--gold)' : 'color:var(--white)'}">${byePlayers1.map(p => esc(p)).join(', ')}</strong>
        </div>`;
      }

      roundGames.forEach(game => {
        const score = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) && String(s.court) === String(game.court)
        );
        const s1 = score ? score.score1 : null;
        const s2 = score ? score.score2 : null;
        const entered = s1 !== null && s2 !== null;
        const t1win = entered && parseInt(s1) > parseInt(s2);
        const t2win = entered && parseInt(s2) > parseInt(s1);
        const myTeam = [game.p1, game.p2].includes(playerName) ? 1 : [game.p3, game.p4].includes(playerName) ? 2 : 0;
        const winStyle  = 'color:var(--green); font-weight:700;';
        const loseStyle = 'color:var(--muted);';
        const t1style = entered ? (t1win ? winStyle : loseStyle) : (myTeam === 1 ? 'font-weight:700; color:var(--white);' : '');
        const t2style = entered ? (t2win ? winStyle : loseStyle) : (myTeam === 2 ? 'font-weight:700; color:var(--white);' : '');
        const tieWarning = entered && !t1win && !t2win;

        html += `<div style="background:var(--card-bg); border-radius:7px; padding:6px 10px; margin-bottom:3px;">
          <div style="display:grid; grid-template-columns:auto 1fr auto 1fr; align-items:center; gap:6px;">
            <div style="font-size:0.7rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); padding-right:4px; white-space:nowrap;">${courtName(game.court)}</div>
            <div style="min-width:0; text-align:right;">
              <div style="${t1style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
              ${game.p2 ? `<div style="${t1style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px; flex-shrink:0; padding:0 4px; ${tieWarning ? 'border:1px solid var(--danger); border-radius:5px;' : ''}">
              <div class="score-display ${entered ? (t1win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s1 : '—'}</div>
              <div style="color:var(--muted); font-size:0.75rem;">vs</div>
              <div class="score-display ${entered ? (t2win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s2 : '—'}</div>
            </div>
            <div style="min-width:0;">
              <div style="${t2style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
              ${game.p4 ? `<div style="${t2style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
            </div>
          </div>
          ${tieWarning ? `<div style="margin-top:3px; font-size:0.68rem; color:var(--danger); text-align:center;">⚠️ Tied score</div>` : ''}
        </div>`;
      });

      html += `</div></details>`;
    });

    document.getElementById('player-scoresheet').innerHTML = html;
  }

  // ── Score Entry (canScore players) ────────────────────────
  function renderScoreEntry() {
    const week = state.currentScoreEntryWeek || state.currentSheetWeek;
    state.currentScoreEntryWeek = week;
    const scoreWkLbl = document.getElementById('player-score-week-label');
    if (scoreWkLbl) scoreWkLbl.textContent = `Session ${week}`;

    const allWeekPairings = state.pairings.filter(p => parseInt(p.week) === week);
    const weekPairings    = allWeekPairings.filter(p => p.type === 'game' || p.type === 'tourn-game');

    if (!allWeekPairings.length) {
      document.getElementById('player-scoresheet-entry').innerHTML =
        '<p class="text-muted">No pairings for this session yet.</p>';
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
      const remaining = total - scored;
      const allDone   = remaining === 0 && total > 0;

      const badgeColor = allDone ? 'var(--green)' : scored > 0 ? 'var(--gold)' : 'var(--muted)';
      const badgeText  = allDone ? `${scored}/${total} ✓`
                       : scored > 0 ? `${scored}/${total} · ${remaining} left`
                       : `${total} game${total !== 1 ? 's' : ''}`;

      html += `<details open style="margin-bottom:6px;">
        <summary style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;
                        padding:5px 8px; border-radius:7px; background:var(--card-bg);
                        list-style:none; user-select:none;"
                 class="round-summary">
          <span style="display:flex; align-items:center; gap:6px;">
            <span class="collapse-arrow" style="font-size:0.72rem; color:var(--green); opacity:0.6;">${!allDone ? '▲' : '▼'}</span>
            <span style="font-size:0.78rem; font-weight:700; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Round ${r}</span>
          </span>
          <span class="round-badge" style="font-size:0.73rem; color:${badgeColor}; font-weight:600;">${badgeText}</span>
        </summary>
        <div style="padding-top:4px;">`;

      roundGames.forEach(game => {
        const existingScore = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) &&
               String(s.court) === String(game.court)
        );
        const s1 = existingScore ? existingScore.score1 : '';
        const s2 = existingScore ? existingScore.score2 : '';
        const entered  = s1 !== '' && s2 !== '';
        const t1win    = entered && parseInt(s1) > parseInt(s2);
        const t2win    = entered && parseInt(s2) > parseInt(s1);
        const winStyle  = 'color:var(--green); font-weight:700;';
        const loseStyle = 'color:var(--muted);';

        const p2div = game.p2 ? '<div style="' + (entered ? (t1win ? winStyle : loseStyle) : '') + ' font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(game.p2) + '</div>' : '';
        const p4div = game.p4 ? '<div style="' + (entered ? (t2win ? winStyle : loseStyle) : '') + ' font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(game.p4) + '</div>' : '';

        html += '<div class="game-card" style="background:var(--card-bg); border-radius:10px; padding:10px 12px; margin-bottom:8px;"'
             +  ' data-week="' + week + '" data-round="' + game.round + '" data-court="' + game.court + '">'
             +  '<div style="font-size:0.7rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin-bottom:5px;">' + courtName(game.court) + '</div>'
             +  '<div style="display:grid; grid-template-columns:1fr 110px 1fr; align-items:center; gap:6px;">'
             +    '<div style="min-width:0;">'
             +      '<div style="' + (entered ? (t1win ? winStyle : loseStyle) : '') + ' font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(game.p1) + '</div>'
             +      p2div
             +    '</div>'
             +    '<div style="display:flex; align-items:center; justify-content:center; gap:4px;">'
             +      '<input type="number" class="score-input" data-score="1" value="' + s1 + '" min="0" max="30" placeholder="0" inputmode="numeric" style="width:44px; text-align:center; padding:4px; -moz-appearance:textfield;">'
             +      '<div style="color:var(--muted); font-size:0.8rem;">–</div>'
             +      '<input type="number" class="score-input" data-score="2" value="' + s2 + '" min="0" max="30" placeholder="0" inputmode="numeric" style="width:44px; text-align:center; padding:4px; -moz-appearance:textfield;">'
             +    '</div>'
             +    '<div style="min-width:0; text-align:right;">'
             +      '<div style="' + (entered ? (t2win ? winStyle : loseStyle) : '') + ' font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(game.p3) + '</div>'
             +      p4div
             +    '</div>'
             +  '</div>'
             + '</div>';
      });

      // Byes after games — one compact line
      const byePlayers = [...new Set(
        roundByes.flatMap(b => [b.p1, b.p2].filter(Boolean))
      )];
      if (byePlayers.length) {
        const isMyBye = byePlayers.includes(playerName);
        html += `<div style="padding:4px 8px; font-size:0.82rem; display:flex; align-items:center; gap:6px;
          ${isMyBye ? 'border-left:3px solid var(--gold); padding-left:8px;' : ''}">
          <span style="color:var(--muted);">⏸ Bye:</span>
          <strong style="${isMyBye ? 'color:var(--gold)' : 'color:var(--white)'}">${byePlayers.map(p => esc(p)).join(', ')}</strong>
        </div>`;
      }

      html += `</div></details>`;
    });

    // Snapshot which rounds are currently collapsed before overwriting the DOM
    const collapsedRounds = new Set();
    document.querySelectorAll('#player-scoresheet-entry details').forEach(d => {
      if (!d.open) {
        const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
        if (m) collapsedRounds.add(parseInt(m[1]));
      }
    });

    document.getElementById('player-scoresheet-entry').innerHTML = html;

    // Assign sequential tabindex to all score inputs so Tab skips round headings.
    // Also remove summary elements from tab order — they are natively focusable
    // (tabIndex=0) and would intercept Tab between rounds without this.
    document.querySelectorAll('#player-scoresheet-entry summary').forEach(s => { s.tabIndex = -1; });
    document.querySelectorAll('#player-scoresheet-entry .score-input').forEach((input, i) => {
      input.tabIndex = i + 1;
    });

    // Restore collapsed state
    if (collapsedRounds.size) {
      document.querySelectorAll('#player-scoresheet-entry details').forEach(d => {
        const m = (d.querySelector('.round-summary')?.textContent || '').match(/Round\s*(\d+)/);
        if (m && collapsedRounds.has(parseInt(m[1]))) d.open = false;
      });
    }

    // ── Auto-save on input — same as admin ──────────────────
    // As soon as both score inputs for a game are filled, save
    // immediately to the server without requiring the Save button.
    document.querySelectorAll('#player-scoresheet-entry .game-card').forEach(card => {
      const inputs = card.querySelectorAll('.score-input');
      if (!inputs.length) return;

      inputs.forEach(input => {
        input.addEventListener('change', async () => {
          const s1val = card.querySelector('[data-score="1"]').value;
          const s2val = card.querySelector('[data-score="2"]').value;
          if (s1val === '' || s2val === '') return; // wait until both filled

          const round  = card.dataset.round;
          const court  = card.dataset.court;
          const wk     = parseInt(card.dataset.week);
          const wkPairings = state.pairings.filter(p => parseInt(p.week) === wk && (p.type === 'game' || p.type === 'tourn-game'));
          const pairing = wkPairings.find(p => String(p.round) === String(round) && String(p.court) === String(court));
          if (!pairing) return;

          const score1 = parseInt(s1val) || 0;
          const score2 = parseInt(s2val) || 0;

          // Warn if overwriting a score entered by someone else
          const existing = state.scores.find(e =>
            parseInt(e.week) === wk && parseInt(e.round) === parseInt(round) && String(e.court) === String(court)
          );
          if (existing &&
              (String(existing.score1) !== String(score1) || String(existing.score2) !== String(score2))) {
            if (!confirm(`⚠️ ${courtName(court)} Round ${round} already has scores ${existing.score1}–${existing.score2}. Overwrite with ${score1}–${score2}?`)) {
              // Revert inputs to existing values
              card.querySelector('[data-score="1"]').value = existing.score1;
              card.querySelector('[data-score="2"]').value = existing.score2;
              return;
            }
          }

          // Warn on tie
          if (score1 === score2) {
            if (!confirm(`⚠️ Tied score ${score1}–${score2} on ${courtName(court)}. Save anyway?`)) return;
          }

          const newScore = {
            week: wk, round: parseInt(round), court,
            p1: pairing.p1, p2: pairing.p2, score1,
            p3: pairing.p3, p4: pairing.p4, score2
          };

          // Merge into local state
          state.scores = state.scores.filter(s =>
            !(parseInt(s.week) === wk && parseInt(s.round) === parseInt(round) && String(s.court) === String(court))
          );
          state.scores.push(newScore);
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);

          // Show saving indicator on the card
          const indicator = document.createElement('div');
          indicator.style.cssText = 'font-size:0.65rem; color:var(--muted); text-align:center; margin-top:2px;';
          indicator.textContent = '⏳ saving…';
          card.appendChild(indicator);

          try {
            // Queue saves per week — prevents concurrent writes causing duplicate rows.
            // weekScores captured INSIDE the lock so it uses latest state at send time,
            // not a stale snapshot that could be overwritten by a concurrent refresh.
            const prevLock = state.saveLocks[wk] || Promise.resolve();
            const thisLock = prevLock.then(async () => {
              const weekScores = state.scores.filter(s => parseInt(s.week) === wk);
              await API.saveScores(wk, weekScores);
            });
            state.saveLocks[wk] = thisLock.catch(() => {}); // keep chain alive on error

            await thisLock;
            indicator.textContent = '✓ saved';
            indicator.style.color = 'var(--green)';
            setTimeout(() => indicator.remove(), 1800);
            // No re-render needed — badge is hidden on open rounds so there's
            // nothing to update, and re-rendering would lose focus and clear
            // any scores currently being typed.
          } catch (e) {
            indicator.textContent = '⚠ save failed';
            indicator.style.color = 'var(--danger)';
            setTimeout(() => indicator.remove(), 3000);
          }
        });
      });
    });
  }

  // ── Session Standings ───────────────────────────────────────
  function renderPlayerStandings() {
    const lName = session.leagueName || state.config.leagueName || '';
    const prefix = lName ? lName + '  ·  ' : '';

    // Update card titles with league name
    const seasonTitle  = document.getElementById('season-standings-title');
    const weeklyTitle  = document.getElementById('weekly-standings-title');
    const trendTitle   = document.getElementById('trend-standings-title');
    if (seasonTitle) seasonTitle.textContent = prefix + 'Season Standings';
    if (weeklyTitle) weeklyTitle.textContent = prefix + 'Session Standings';
    if (trendTitle)  trendTitle.textContent  = prefix + 'Overall Ranking by Session';

    // Season tab
    const season = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
    document.getElementById('season-standings-table').innerHTML = renderStandingsTable(season, playerName);

    // Weekly tab
    const week = state.currentWstandWeek;
    const wstandDate = formatDateTime(week, state.config) ? ' — ' + formatDateTime(week, state.config) : '';
    document.getElementById('wstand-label').textContent = `Session ${week}${wstandDate}`;
    const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week, state.config.rankingMethod);
    document.getElementById('weekly-standings-table').innerHTML = renderStandingsTable(weekStand, playerName);

    // Default to season tab active
    document.querySelectorAll('#player-standings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    const seasonBtn = document.querySelector('#player-standings-tabs .tab-btn[data-tab="season"]');
    if (seasonBtn) seasonBtn.classList.add('active');
    document.getElementById('player-stand-season')?.classList.add('active');
    document.getElementById('player-stand-weekly')?.classList.remove('active');
    document.getElementById('player-stand-trend')?.classList.remove('active');

    // Wire tabs (guard against duplicate listeners with a flag)
    const tabsEl = document.getElementById('player-standings-tabs');
    if (tabsEl && !tabsEl.dataset.wired) {
      tabsEl.dataset.wired = '1';
      tabsEl.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          tabsEl.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const tab = btn.dataset.tab;
          document.getElementById('player-stand-season').classList.toggle('active', tab === 'season');
          document.getElementById('player-stand-weekly').classList.toggle('active', tab === 'weekly');
          document.getElementById('player-stand-trend').classList.toggle('active', tab === 'trend');
          if (tab === 'trend') drawRankTrendChart('player-rank-trend-chart', 'player-rank-trend-legend', state, playerName);
        });
      });
    }
  }

  // kept for backward compat (called via week nav)
  function renderWeeklyStandings() {
    const week = state.currentWstandWeek;
    const wstandDate = formatDateTime(week, state.config) ? ' — ' + formatDateTime(week, state.config) : '';
    document.getElementById('wstand-label').textContent = `Session ${week}${wstandDate}`;
    const s = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week, state.config.rankingMethod);
    document.getElementById('weekly-standings-table').innerHTML = renderStandingsTable(s, playerName);
  }

  // ── Full Attendance ────────────────────────────────────────
  function renderFullAttendance() {
    const weeks = parseInt(state.config.weeks) || 0;
    const players = state.players.filter(p => p.active === true);

    if (!weeks || !players.length) {
      document.getElementById('full-attendance-grid').innerHTML =
        '<p class="text-muted">Attendance data not yet loaded.</p>';
      return;
    }

    let html = '<div class="att-grid">';
    html += '<div class="att-row"><div></div>';
    for (let w = 1; w <= weeks; w++) {
      const date = formatDateTime(w, state.config);
      html += `<div class="att-week-header">S${w}${date ? `<br><span style="font-size:0.6rem;font-weight:400;">${date}</span>` : ''}</div>`;
    }
    html += '</div>';

    players.forEach(p => {
      const isMe = p.name === playerName;
      html += `<div class="att-row" ${isMe ? 'style="background:rgba(94,194,106,0.05); border-radius:6px;"' : ''}>`;
      html += `<div class="att-player-name" ${isMe ? 'style="color:var(--green); font-weight:600;"' : ''}>${esc(p.name)}</div>`;
      for (let w = 1; w <= weeks; w++) {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
        const status = rec ? rec.status : 'tbd';
        html += `<div class="att-cell ${status}" title="${esc(p.name)} Session ${w}: ${status}">${statusLabel(status)}</div>`;
      }
      html += '</div>';
    });

    html += '</div>';
    document.getElementById('full-attendance-grid').innerHTML = html;
  }

  // ── Events ─────────────────────────────────────────────────

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

  function setupEvents() {
    // Email my player report
    document.getElementById('btn-email-my-report')?.addEventListener('click', async () => {
      const me = state.players.find(pl => pl.name === playerName);
      if (!me || !me.email) {
        toast('No email address on file. Add one in the Availability page.', 'warn'); return;
      }
      // Email the currently selected player's report (defaults to own)
      const sel = document.getElementById('report-player-select');
      const targetPlayer = sel?.value || playerName;
      const report = Reports.computePlayerReport(targetPlayer, state.scores, state.standings);
      const btn = document.getElementById('btn-email-my-report');
      btn.disabled = true;
      try {
        await API.sendPlayerReport({
          playerName: targetPlayer,
          email:      me.email,
          report,
          leagueName: session.leagueName || state.config.leagueName || 'League',
          replyTo:    state.config.replyTo    || '',
        });
        toast(`Report emailed to ${me.email}.`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; }
    });

    // Score entry week nav
    if (canScore) {
      if (!state.currentScoreEntryWeek) state.currentScoreEntryWeek = state.currentSheetWeek;
      document.getElementById('player-score-week-select')?.addEventListener('change', (e) => {
        state.currentScoreEntryWeek = parseInt(e.target.value);
        // Sync scoresheet selector to match
        state.currentSheetWeek = state.currentScoreEntryWeek;
        const sheetSel = document.getElementById('sheet-week-select');
        if (sheetSel && sheetSel.value != state.currentScoreEntryWeek) sheetSel.value = state.currentScoreEntryWeek;
        // Show spinner and fetch before rendering — prevents stale scores overwriting new entries
        const entryEl = document.getElementById('player-scoresheet-entry');
        if (entryEl) entryEl.innerHTML = `
          <div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
            <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
            <div>Loading scores…</div>
          </div>`;
        const wk = state.currentScoreEntryWeek;
        const sel = document.getElementById('player-score-week-select');
        if (sel) sel.disabled = true;
        API.getScores(wk).then(data => {
          if (data && data.scores) {
            state.scores = state.scores.filter(s => parseInt(s.week) !== wk);
            state.scores.push(...data.scores.filter(s => parseInt(s.week) === wk));
          }
        }).catch(() => {}).finally(() => {
          if (sel) sel.disabled = false;
          renderScoreEntry();
          renderScoresheet();
        });
      });

      document.getElementById('player-btn-save-scores').addEventListener('click', async () => {
        const week = state.currentScoreEntryWeek;
        const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));
        const scores = [];

        document.querySelectorAll('#player-scoresheet-entry .game-card').forEach(card => {
          const round = card.dataset.round;
          const court = card.dataset.court;
          const pairing = weekPairings.find(p => String(p.round) === String(round) && String(p.court) === String(court));
          if (!pairing) return;
          const s1 = card.querySelector('[data-score="1"]').value;
          const s2 = card.querySelector('[data-score="2"]').value;
          if (s1 !== '' || s2 !== '') {
            scores.push({
              week, round: parseInt(round), court,
              p1: pairing.p1, p2: pairing.p2, score1: parseInt(s1) || 0,
              p3: pairing.p3, p4: pairing.p4, score2: parseInt(s2) || 0
            });
          }
        });

        // Merge with existing scores for this week so games left blank are preserved
        const existingWeekScores = state.scores.filter(s => parseInt(s.week) === week);
        existingWeekScores.forEach(existing => {
          const alreadyIncluded = scores.some(
            s => String(s.round) === String(existing.round) && String(s.court) === String(existing.court)
          );
          if (!alreadyIncluded) scores.push(existing);
        });

        // Warn if any entered scores would overwrite existing different scores
        const overwritten = scores.filter(s => {
          const existing = state.scores.find(e =>
            parseInt(e.week) === week && parseInt(e.round) === s.round && String(e.court) === String(s.court)
          );
          return existing &&
            (String(existing.score1) !== String(s.score1) || String(existing.score2) !== String(s.score2));
        });
        if (overwritten.length) {
          const msg = overwritten.map(s => {
            const ex = state.scores.find(e =>
              parseInt(e.week) === week && parseInt(e.round) === s.round && String(e.court) === String(s.court)
            );
            return `Round ${s.round} ${courtName(s.court)}: existing ${ex.score1}–${ex.score2} → new ${s.score1}–${s.score2}`;
          }).join('\n');
          if (!confirm(`⚠️ These scores already exist and will be overwritten:\n${msg}\n\nSave anyway?`)) return;
        }

        // Warn on ties
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
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, null, state.attendance);
          toast(`Scores for Session ${week} saved!`);
          renderScoreEntry();
        } catch (e) { toast('Save failed: ' + e.message, 'error'); }
        finally { showLoading(false); }
      });

      // Refresh button — fetch latest scores from server
      const refreshScoreEntry = async () => {
        const btn = document.getElementById('btn-refresh-score-entry');
        if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
        const week = state.currentScoreEntryWeek || state.currentSheetWeek;
        if (!week) {
          if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
          return;
        }
        // Timeout after 15 seconds so the button never hangs forever
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
          const data = await API.getScores(week);
          if (data && data.scores) {
            state.scores = state.scores.filter(s => parseInt(s.week) !== week);
            state.scores.push(...data.scores.filter(s => parseInt(s.week) === week));
          }
          renderScoreEntry();
        } catch (e) {
          const msg = e.name === 'AbortError' ? 'Refresh timed out — try again' : e.message;
          toast('Refresh failed: ' + msg, 'error');
        } finally {
          clearTimeout(timer);
          if (btn) { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
        }
      };

      document.getElementById('btn-refresh-score-entry')?.addEventListener('click', refreshScoreEntry);

      // Auto-refresh every 60 seconds when on the score-entry page
      const autoRefreshInterval = setInterval(() => {
        const scoreEntryActive = document.getElementById('page-score-entry')?.classList.contains('active');
        if (scoreEntryActive) refreshScoreEntry();
      }, 60000);
    }

    // Scoresheet week select
    document.getElementById('sheet-week-select')?.addEventListener('change', async (e) => {
      state.currentSheetWeek = parseInt(e.target.value);
      // Sync score entry selector to match
      if (canScore) {
        state.currentScoreEntryWeek = state.currentSheetWeek;
        const scoreSel = document.getElementById('player-score-week-select');
        if (scoreSel && scoreSel.value != state.currentSheetWeek) scoreSel.value = state.currentSheetWeek;
      }
      document.getElementById('player-scoresheet').innerHTML =
        `<div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
          <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
          <div>Loading Session ${state.currentSheetWeek}…</div>
        </div>`;
      e.target.disabled = true;
      await ensureWeekLoaded(state.currentSheetWeek);
      e.target.disabled = false;
      renderScoresheet();
      if (canScore) renderScoreEntry();
    });

    // Refresh tournament bracket
    document.getElementById('btn-refresh-standings')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-refresh-standings');
      btn.disabled = true; btn.textContent = '⏳';
      try {
        const data = await API.getScores();
        if (data && data.scores) {
          state.scores = data.scores;
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod, state.attendance);
        }
        renderPlayerStandings();
      } catch (e) { /* silent — stale data still shown */ }
      finally { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    });

    document.getElementById('btn-refresh-bracket')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-refresh-bracket');
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const data = await API.getAllData();
        state.scores   = data.scores   || [];
        state.pairings = data.pairings || [];
        state.standings = data.standings || [];
        renderTournamentBracket();
        toast('Bracket refreshed.');
      } catch (e) { toast('Refresh failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    });

    // Refresh button — re-fetches latest scores and pairings from server
    document.getElementById('btn-refresh-scores').addEventListener('click', async () => {
      const btn = document.getElementById('btn-refresh-scores');
      btn.disabled = true;
      btn.textContent = '⏳';
      try {
        const data = await API.getAllData();
        state.scores   = data.scores   || [];
        state.pairings = data.pairings || [];
        state.standings = data.standings || [];
        renderScoresheet();
        renderTournamentBracket();
        renderNextGame();
        toast('Scores refreshed.');
      } catch (e) { toast('Refresh failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = '🔄 Refresh'; }
    });

    // Weekly standings week select
    document.getElementById('wstand-select')?.addEventListener('change', (e) => {
      state.currentWstandWeek = parseInt(e.target.value);
      renderWeeklyStandings();
    });
  }

  // ── Player Report ──────────────────────────────────────────
  function renderPlayerReportSelect() {
    const sel = document.getElementById('report-player-select');
    if (!sel) return;

    // Show email button only if logged-in player has an email
    const me = state.players.find(pl => pl.name === playerName);
    const emailBtn = document.getElementById('btn-email-my-report');
    if (emailBtn) {
      if (me && me.email) {
        emailBtn.classList.remove('hidden');
      } else {
        emailBtn.classList.add('hidden');
      }
    }

    const current = sel.value || playerName;  // default to logged-in player
    sel.innerHTML = '<option value="">— Select Player —</option>';
    state.players.filter(p => p.active === true).forEach(p => {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      if (p.name === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => renderPlayerReport(sel.value);

    // Auto-render on first load if no report shown yet
    if (sel.value) renderPlayerReport(sel.value);
  }

  function renderPlayerReport(name) {
    const el = document.getElementById('player-report-content');
    if (!el) return;
    if (!name) { el.innerHTML = ''; return; }

    const report = Reports.computePlayerReport(name, state.scores, state.standings);
    const s = report.standing;

    // Opponent & partner frequency maps
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

    const lName = session.leagueName || state.config.leagueName || '';
    const reportTitle = lName ? `${esc(lName)}  ·  ${esc(name)}` : esc(name);

    let html = `<div class="card">
      <div class="card-header">
        <div class="card-title">${reportTitle}</div>
        ${s ? `<div>
          <span class="badge badge-gold">Rank #${s.rank}</span>
          <span class="badge badge-green ml-1">${Reports.wl(s.wins, s.losses)}</span>
          <span class="badge badge-muted">${Reports.pct(s.winPct)}</span>
        </div>` : ''}
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">FACED AS OPPONENT</div>
          <table class="compact-table">
            <thead><tr><th>Player</th><th>Games</th><th>W/L vs them</th></tr></thead>
            <tbody>${sortedOpponents.length ? sortedOpponents.map(([n, d]) =>
              `<tr><td class="player-name">${esc(n)}</td><td>${d.count}</td>
               <td><span class="${d.wins >= d.losses ? 'win' : 'loss'}">${d.wins}W / ${d.losses}L</span></td></tr>`
            ).join('') : '<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody>
          </table>
        </div>
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">PLAYED AS PARTNER</div>
          <table class="compact-table">
            <thead><tr><th>Player</th><th>Games</th><th>W/L together</th></tr></thead>
            <tbody>${sortedPartners.length ? sortedPartners.map(([n, d]) =>
              `<tr><td class="player-name">${esc(n)}</td><td>${d.count}</td>
               <td><span class="${d.wins >= d.losses ? 'win' : 'loss'}">${d.wins}W / ${d.losses}L</span></td></tr>`
            ).join('') : '<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody>
          </table>
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
          ).join('') : '<tr><td colspan="7" class="text-muted">No games recorded yet.</td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

    el.innerHTML = html;
  }

  // ── Shared Helpers ─────────────────────────────────────────
  function renderStandingsTable(standings, highlightPlayer = null) {
    if (!standings || !standings.length) return '<p class="text-muted">No standings data yet.</p>';
    const rm = state.config.rankingMethod || 'avgptdiff';
    const usePtsPct = rm === 'ptspct';
    const minPct = state.config.minParticipation !== null && state.config.minParticipation !== undefined
      ? parseFloat(state.config.minParticipation) / 100 : 0.50;
    const hasParticipation = standings.some(s => s.participationPct !== null);

    const rows = standings.filter(s => s.games > 0).map((s, i) => {
      const isMe = s.name === highlightPlayer;
      const top = i < 3 ? 'top' : '';
      const ptsTot = s.points + s.pointsAgainst;
      const ptsPctVal = ptsTot > 0 ? (s.points / ptsTot * 100).toFixed(1) + '%' : '—';
      const secCol = usePtsPct
        ? `<td>${ptsPctVal}</td>`
        : `<td>${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</td>`;

      let partHtml = '';
      if (hasParticipation) {
        if (s.participationPct === null) {
          partHtml = `<td style="color:var(--muted);">—</td>`;
        } else {
          const eligible = s.participationPct >= minPct;
          const pctStr = Math.round(s.participationPct * 100) + '%';
          partHtml = `<td style="white-space:nowrap;">
            <span style="color:${eligible ? 'var(--green)' : 'var(--danger)'}; font-weight:600;">${pctStr}</span>
            <span title="${eligible ? 'Prize eligible' : 'Below minimum — ineligible for prizes'}"
              style="margin-left:4px; font-size:0.8rem;">${eligible ? '✓' : '✗'}</span>
          </td>`;
        }
      }

      return `<tr ${isMe ? 'style="background:rgba(94,194,106,0.08);"' : ''}>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" ${isMe ? 'style="color:var(--green);"' : ''}>${esc(s.name)}${isMe ? ' ◀' : ''}</td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        ${hasParticipation ? partHtml : ''}
        <td class="text-muted">${s.games}</td>
      </tr>`;
    });
    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th title="Average point differential per game — your average score minus your opponent&#39;s average score. Positive means you score more than your opponents on average; used as a tiebreaker when win percentage is equal." style="cursor:help;">Avg+/-</th>';
    const pctHeader = hasParticipation
      ? `<th title="(Games + byes) / total league rounds. Min: ${Math.round(minPct*100)}% for prize eligibility" style="cursor:help;">Partic.</th>`
      : '';
    return `<table class="compact-table">
      <thead><tr><th>#</th><th>Player</th><th>W/L</th><th>Win%</th>${secHeader}${pctHeader}<th>Games</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  function statusLabel(s) {
    return s === 'present' ? 'In' : s === 'absent' ? 'Out' : s === 'sit-out' ? 'Sit Out' : 'TBD';
  }

  function statusIcon(s) {
    return s === 'present' ? '✅' : s === 'absent' ? '❌' : s === 'sit-out' ? '⏸' : '❓';
  }

  function formatDate(d) {
    if (!d) return '';
    try { const p = d.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; } catch { return d; }
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

  function formatDateTime(w, config) {
    const d = config['date_' + w];
    const t = config['time_' + w];
    if (!d && !t) return '';
    let s = d ? formatDate(d) : '';
    if (t) s += (s ? ' ' : '') + formatTime(t);
    return s;
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
      const standings     = Reports.computeStandings(scoresThrough, chartState.players, chartState.pairings, null, chartState.config.rankingMethod);
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
  // ── Tournament Bracket ─────────────────────────────────────
  function renderTournamentBracket() {
    const el = document.getElementById('player-bracket-content');
    if (!el) return;

    const week = state.currentSheetWeek;
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week);

    const isTournament = weekPairings.some(p => p.type === 'tourn-game');
    const navEl = document.getElementById('nav-tournament');
    if (navEl) navEl.classList.toggle('hidden', !isTournament);

    if (!isTournament) { el.innerHTML = '<p class="text-muted">No tournament data for this session.</p>'; return; }

    const weekScores   = state.scores.filter(s => parseInt(s.week) === week);
    const lockedRounds = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a,b)=>a-b);

    // Detect RR mode: all rounds have same number of games (no elimination shrinkage)
    // and byes appear in multiple rounds
    const gamesPerRound = lockedRounds.map(r =>
      weekPairings.filter(p => parseInt(p.round) === r && p.type === 'tourn-game').length
    );
    const isRR = lockedRounds.length > 1 && gamesPerRound.every(g => g === gamesPerRound[0]);

    if (isRR) {
      // Build standings from all scored rounds
      const playerNames = [...new Set(weekPairings.flatMap(p =>
        [p.p1, p.p2, p.p3, p.p4].filter(Boolean)
      ))];
      const stats = {};
      playerNames.forEach(n => { stats[n] = { wins: 0, losses: 0, byes: 0 }; });
      lockedRounds.forEach(r => {
        weekPairings.filter(p => parseInt(p.round) === r).forEach(p => {
          if (p.type === 'tourn-bye' || p.type === 'bye') {
            if (stats[p.p1]) stats[p.p1].byes++; return;
          }
          const sc = weekScores.find(s => parseInt(s.round) === r && String(s.court) === String(p.court));
          if (!sc || sc.score1 === '' || sc.score1 === null) return;
          const t1win = parseInt(sc.score1) > parseInt(sc.score2);
          [p.p1, p.p2].filter(Boolean).forEach(n => { if (stats[n]) { if (t1win) stats[n].wins++; else stats[n].losses++; } });
          [p.p3, p.p4].filter(Boolean).forEach(n => { if (stats[n]) { if (!t1win) stats[n].wins++; else stats[n].losses++; } });
        });
      });
      const ranked = Object.entries(stats).sort((a, b) => b[1].wins - a[1].wins);
      let html = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:10px;">Round Robin (Reseeded) · Session ${week} · ${lockedRounds.length} round(s)</div>`;
      html += `<table style="font-size:0.85rem; width:100%; border-collapse:collapse;">
        <thead><tr>
          <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:500;">#</th>
          <th style="text-align:left;padding:5px 8px;color:var(--muted);font-weight:500;">Player</th>
          <th style="text-align:center;padding:5px 8px;color:var(--muted);font-weight:500;">W</th>
          <th style="text-align:center;padding:5px 8px;color:var(--muted);font-weight:500;">L</th>
          <th style="text-align:center;padding:5px 8px;color:var(--muted);font-weight:500;">Bye</th>
        </tr></thead><tbody>`;
      ranked.forEach(([name, s], i) => {
        const isMe = name === playerName;
        const isFirst = i === 0 && s.wins > 0;
        html += `<tr style="${isFirst ? 'color:var(--gold);font-weight:700;' : isMe ? 'color:var(--green);font-weight:700;' : ''}">
          <td style="padding:4px 8px;">${i + 1}</td>
          <td style="padding:4px 8px;">${esc(name)}</td>
          <td style="padding:4px 8px;text-align:center;">${s.wins}</td>
          <td style="padding:4px 8px;text-align:center;">${s.losses}</td>
          <td style="padding:4px 8px;text-align:center;">${s.byes}</td>
        </tr>`;
      });
      html += `</tbody></table>`;
      el.innerHTML = html;
      return;
    }

    let html = `<div style="font-size:0.78rem; color:var(--muted); margin-bottom:12px;">
      Session ${week} · ${lockedRounds.length} round(s) played
    </div>`;

    html += buildBracketHTML(weekPairings, weekScores, week, null, playerName);

    el.innerHTML = html;
  }

  // Shared bracket HTML builder — mirrors admin.js buildBracketHTML
  function buildBracketHTML(weekPairings, scores, week, seeds, highlightPlayer) {
    const lockedRounds = [...new Set(weekPairings.map(p => parseInt(p.round)))].sort((a,b)=>a-b);
    if (!lockedRounds.length) return '<p class="text-muted">No rounds played yet.</p>';

    const seedMap = {};
    if (seeds && seeds.length) {
      seeds.forEach(s => { seedMap[s.name] = s; if (s.name2) seedMap[s.name2] = s; });
    } else {
      const r1games = weekPairings
        .filter(p => parseInt(p.round) === lockedRounds[0] && (p.type === 'game' || p.type === 'tourn-game'))
        .sort((a,b) => String(a.court).localeCompare(String(b.court), undefined, {numeric:true}));
      const r1byes = weekPairings.filter(p => parseInt(p.round) === lockedRounds[0] && p.type === 'bye');
      let seed = 1;
      r1byes.forEach(b => { if (b.p1 && !seedMap[b.p1]) { seedMap[b.p1] = { seed, name: b.p1, name2: b.p2||'' }; seed++; } });
      r1games.forEach(g => {
        if (g.p1 && !seedMap[g.p1]) { seedMap[g.p1] = { seed, name: g.p1, name2: g.p2||'' }; seed++; }
        if (g.p3 && !seedMap[g.p3]) { seedMap[g.p3] = { seed, name: g.p3, name2: g.p4||'' }; seed++; }
      });
    }

    function getSeed(name) {
      const s = seedMap[name];
      return s ? `<span style="font-size:0.7rem; color:var(--muted);">#${s.seed}</span> ` : '';
    }
    function teamLabel(p1, p2) {
      return `${getSeed(p1)}${p2 ? esc(p1) + ' <span style="color:var(--muted);">&amp;</span> ' + esc(p2) : esc(p1)}`;
    }

    let html = `<div style="overflow-x:auto; padding-bottom:8px;"><div style="display:flex; gap:0; min-width:fit-content;">`;

    lockedRounds.forEach((r, ri) => {
      const roundGames = weekPairings.filter(g => g.round === r && (g.type === 'game' || g.type === 'tourn-game'));
      const roundByes  = weekPairings.filter(g => g.round === r && g.type === 'bye');
      const isLast     = ri === lockedRounds.length - 1;

      html += `<div style="display:flex; flex-direction:column; min-width:210px;">
        <div style="font-size:0.72rem; font-weight:700; color:var(--muted); text-transform:uppercase;
                    letter-spacing:0.05em; padding:4px 8px; margin-bottom:6px; text-align:center;">Round ${r}</div>`;

      roundGames.forEach(g => {
        const score = scores.find(s => parseInt(s.week) === week && parseInt(s.round) === r && String(s.court) === String(g.court));
        const s1 = score ? score.score1 : '', s2 = score ? score.score2 : '';
        const scored = s1 !== '' && s1 !== null && s2 !== '' && s2 !== null;
        const t1win  = scored && parseInt(s1) > parseInt(s2);
        const isMe1  = highlightPlayer && [g.p1, g.p2].includes(highlightPlayer);
        const isMe2  = highlightPlayer && [g.p3, g.p4].includes(highlightPlayer);
        const winStyle = 'color:var(--green); font-weight:700;', loseStyle = 'color:rgba(255,255,255,0.35);';
        const t1style = scored ? (t1win ? winStyle : loseStyle) : (isMe1 ? 'color:var(--white); font-weight:700;' : 'color:var(--white);');
        const t2style = scored ? (!t1win ? winStyle : loseStyle) : (isMe2 ? 'color:var(--white); font-weight:700;' : 'color:var(--white);');
        const score1Html = scored
          ? `<span style="font-size:0.82rem; font-weight:700; color:${t1win ? 'var(--green)' : 'rgba(255,255,255,0.5)'}; min-width:22px; text-align:right;">${s1}</span>`
          : `<span style="font-size:0.72rem; color:var(--muted); min-width:22px; text-align:right;">—</span>`;
        const score2Html = scored
          ? `<span style="font-size:0.82rem; font-weight:700; color:${!t1win ? 'var(--green)' : 'rgba(255,255,255,0.5)'}; min-width:22px; text-align:right;">${s2}</span>`
          : `<span style="font-size:0.72rem; color:var(--muted); min-width:22px; text-align:right;">—</span>`;
        const border = (isMe1||isMe2) ? 'border:1px solid rgba(94,194,106,0.4);' : 'border:1px solid rgba(255,255,255,0.08);';

        html += `<div style="background:var(--card-bg); ${border} border-radius:8px; padding:7px 10px; margin:2px 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="${t1style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${teamLabel(g.p1, g.p2)}</div>
            <div style="margin-left:6px; flex-shrink:0;">${score1Html}</div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06); margin:3px 0;"></div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <div style="${t2style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${teamLabel(g.p3, g.p4)}</div>
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
      if (!isLast) html += `<div style="display:flex; align-items:center; padding:0 2px; color:rgba(255,255,255,0.2); font-size:1.2rem;">›</div>`;
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
        const cP1 = t1win ? fg.p1 : fg.p3, cP2 = t1win ? fg.p2 : fg.p4;
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

  // Lazy-load historical weeks if the player navigates before sinceWeek
  async function ensureWeekLoaded(week) {
    if (!state.loadedSinceWeek || week >= state.loadedSinceWeek) return;
    // Need older data — reload everything
    try {
      showLoading(true);
      const data = await API.getAllData();
      state.pairings  = data.pairings  || [];
      state.scores    = data.scores    || [];
      state.standings = data.standings || [];
      state.loadedSinceWeek = 1; // all weeks now loaded
    } catch (e) {
      toast('Failed to load older data: ' + e.message, 'error');
    } finally {
      showLoading(false);
    }
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
