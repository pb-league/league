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
  document.getElementById('topbar-league').textContent = session.leagueName || 'Pickleball';
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
    dataLoaded: false  // true after phase 2 pairings/scores are loaded
  };

  // ── Phase 1: Fast load — config, players, attendance ────────
  // Renders the UI shell immediately so the player sees content fast.
  showLoading(true);
  try {
    const early = await API.getEarlyData();
    state.config     = early.config     || {};
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

  // ── Phase 2: Background load — pairings, scores, standings ──
  // Fetches the last 3 sessions of data based on what actually exists,
  // not the configured total. This ensures current scores are always loaded.
  (async () => {
    try {
      // First do a lightweight fetch of just the session numbers that have data,
      // then use that to compute a safe sinceWeek based on actual content.
      // Since we don't have pairings/scores yet, use config weeks as a fallback
      // but fetch from 3 sessions before the LAST session (not the total count).
      const totalWeeks = parseInt(state.config.weeks || 8);
      // Fetch all sessions — sinceWeek=1 ensures we never miss current scores.
      // For large leagues (many sessions) this could be optimised later, but
      // correctness matters more than a small payload saving.
      const sinceWeek  = Math.max(1, totalWeeks - 4); // last 5 sessions as safe buffer
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
    } catch (e) {
      toast('Background data load failed: ' + e.message, 'error');
    }
  })();

  // ── Nav ────────────────────────────────────────────────────
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        document.getElementById('page-' + page)?.classList.add('active');
        gaPage('Player: ' + page);
        if (page === 'player-report') renderPlayerReportSelect();
        if (page === 'score-entry') renderScoreEntry();
        if (page === 'standings') renderPlayerStandings();
        if (page === 'tournament') renderTournamentBracket();
      });
    });
  }

  function renderAll() {
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
          <div class="card-title" style="font-size:0.78rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Week ${week}${date} · Round ${lastRound} — All Done</div>
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
        <div class="card-title" style="font-size:0.78rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em;">Week ${week}${date} · Up Next — Round ${nextRound}</div>
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
      if (c.leagueName)   parts.push(`<span>🥒 ${esc(c.leagueName)}</span>`);
      if (c.location)     parts.push(`<span>📍 ${esc(c.location)}</span>`);
      if (c.sessionTime)  parts.push(`<span>🕐 ${esc(c.sessionTime)}</span>`);
      if (c.notes)        parts.push(`<span>📌 ${esc(c.notes)}</span>`);
      infoEl.innerHTML = parts.length
        ? `<div style="display:flex; flex-wrap:wrap; gap:8px 20px; margin-bottom:12px; font-size:0.85rem; color:var(--muted);">${parts.join('')}</div>`
        : '';
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

    if (!report.games.length) {
      document.getElementById('my-game-history').innerHTML = state.dataLoaded
        ? '<p class="text-muted">No games recorded yet.</p>'
        : `<div style="text-align:center; padding:24px; color:var(--muted); font-size:0.85rem;">
             <div style="font-size:1.6rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
             <div>Loading games…</div>
           </div>`;
      return;
    }

    let html = `<table>
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
    const weeks = parseInt(state.config.weeks || 8);
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
        const states = isSpectatorRole ? ['absent', 'tbd'] : ['present', 'absent', 'tbd', 'sit-out'];
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
  function renderScoresheet() {
    const week = state.currentSheetWeek;
    document.getElementById('sheet-week-label').textContent = `Session ${week}`;

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
      html += `<div class="round-header">Round ${r}</div>`;

      // Show byes inline for this round
      allWeekPairings.filter(p => p.round == r && p.type === 'bye').forEach(bye => {
        const isMe = bye.p1 === playerName;
        html += `<div style="padding:6px 10px; margin-bottom:6px; font-size:0.85rem;
                              background:rgba(122,155,181,0.07); border-radius:8px;
                              ${isMe ? 'border-left:3px solid var(--gold);' : ''}">
          ⏸ <strong style="${isMe ? 'color:var(--gold);' : 'color:var(--white);'}">${esc(bye.p1)}${bye.p2 ? ' &amp; ' + esc(bye.p2) : ''}</strong>
          <span style="color:var(--muted);"> — Bye</span>
        </div>`;
      });

      weekPairings.filter(p => p.round == r).forEach(game => {
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
        const tieBoxStyle = tieWarning ? 'border:1px solid var(--danger); border-radius:6px;' : '';

        html += `<div style="background:var(--card-bg); border-radius:10px; padding:10px 12px; margin-bottom:8px;">
          <div style="font-size:0.7rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px;">${courtName(game.court)}</div>
          <div style="display:grid; grid-template-columns:1fr 100px 1fr; align-items:center; gap:6px;">
            <div style="min-width:0;">
              <div style="${t1style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
              ${game.p2 ? `<div style="${t1style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px; ${tieBoxStyle}">
              <div class="score-display ${entered ? (t1win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s1 : '—'}</div>
              <div style="color:var(--muted); font-size:0.75rem;">vs</div>
              <div class="score-display ${entered ? (t2win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s2 : '—'}</div>
            </div>
            <div style="min-width:0; text-align:right;">
              <div style="${t2style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
              ${game.p4 ? `<div style="${t2style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
            </div>
          </div>
          ${tieWarning ? `<div style="margin-top:6px; font-size:0.72rem; color:var(--danger); text-align:center;">⚠️ Tied score — please verify</div>` : ''}
        </div>`;
      });
    });

    document.getElementById('player-scoresheet').innerHTML = html;
  }

  // ── Score Entry (canScore players) ────────────────────────
  function renderScoreEntry() {
    const week = state.currentScoreEntryWeek || state.currentSheetWeek;
    state.currentScoreEntryWeek = week;
    document.getElementById('player-score-week-label').textContent = `Session ${week}`;

    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && (p.type === 'game' || p.type === 'tourn-game'));

    if (!weekPairings.length) {
      document.getElementById('player-scoresheet-entry').innerHTML =
        '<p class="text-muted">No pairings for this session yet.</p>';
      return;
    }

    const rounds = [...new Set(weekPairings.map(p => p.round))].sort((a,b) => a-b);
    let html = '';

    rounds.forEach(r => {
      html += `<div class="round-header">Round ${r}</div>`;
      weekPairings.filter(p => p.round == r).forEach(game => {
        const existingScore = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) &&
               String(s.court) === String(game.court)
        );
        const s1 = existingScore ? existingScore.score1 : '';
        const s2 = existingScore ? existingScore.score2 : '';
        const entered = s1 !== '' && s2 !== '';
        const t1win = entered && parseInt(s1) > parseInt(s2);
        const t2win = entered && parseInt(s2) > parseInt(s1);
        const winStyle  = 'color:var(--green); font-weight:700;';
        const loseStyle = 'color:var(--muted);';

        html += `<div class="game-card" style="background:var(--card-bg); border-radius:10px; padding:10px 12px; margin-bottom:8px;"
            data-week="${week}" data-round="${game.round}" data-court="${game.court}">
          <div class="court-label" style="font-size:0.7rem; margin-bottom:6px;">${courtName(game.court)}</div>
          <div style="display:grid; grid-template-columns:1fr 110px 1fr; align-items:center; gap:6px;">
            <div style="min-width:0;">
              <div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p1)}</div>
              ${game.p2 ? `<div style="${entered ? (t1win ? winStyle : loseStyle) : ''} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px;">
              <input type="number" class="score-input" data-score="1"
                     value="${s1}" min="0" max="30" placeholder="0"
                     inputmode="numeric"
                     style="width:44px; text-align:center; padding:4px; -moz-appearance:textfield;">
              <div style="color:var(--muted); font-size:0.8rem;">—</div>
              <input type="number" class="score-input" data-score="2"
                     value="${s2}" min="0" max="30" placeholder="0"
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
    });

    document.getElementById('player-scoresheet-entry').innerHTML = html;
  }

  // ── Session Standings ───────────────────────────────────────
  function renderPlayerStandings() {
    // Season tab
    const season = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);
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
    const weeks = parseInt(state.config.weeks || 8);
    const players = state.players.filter(p => p.active === true);

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
          leagueName: state.config.leagueName || 'Pickleball League',
          replyTo:    state.config.replyTo    || '',
        });
        toast(`Report emailed to ${me.email}.`);
      } catch (e) { toast('Send failed: ' + e.message, 'error'); }
      finally { btn.disabled = false; }
    });

    // Score entry week nav
    if (canScore) {
      if (!state.currentScoreEntryWeek) state.currentScoreEntryWeek = state.currentSheetWeek;
      document.getElementById('player-score-week-prev').addEventListener('click', () => {
        if (state.currentScoreEntryWeek > 1) { state.currentScoreEntryWeek--; renderScoreEntry(); }
      });
      document.getElementById('player-score-week-next').addEventListener('click', () => {
        const max = parseInt(state.config.weeks || 8);
        if (state.currentScoreEntryWeek < max) { state.currentScoreEntryWeek++; renderScoreEntry(); }
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
          state.standings = Reports.computeStandings(state.scores, state.players, state.pairings);
          toast(`Scores for Session ${week} saved!`);
          renderScoreEntry();
        } catch (e) { toast('Save failed: ' + e.message, 'error'); }
        finally { showLoading(false); }
      });
    }

    // Scoresheet week nav
    document.getElementById('sheet-week-prev').addEventListener('click', async () => {
      if (state.currentSheetWeek > 1) {
        state.currentSheetWeek--;
        document.getElementById('sheet-week-label').textContent = `Session ${state.currentSheetWeek}`;
        document.getElementById('player-scoresheet').innerHTML =
          `<div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
            <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
            <div>Loading Session ${state.currentSheetWeek}…</div>
          </div>`;
        ['sheet-week-prev','sheet-week-next'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
        await ensureWeekLoaded(state.currentSheetWeek);
        ['sheet-week-prev','sheet-week-next'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
        renderScoresheet();
      }
    });
    document.getElementById('sheet-week-next').addEventListener('click', async () => {
      const max = parseInt(state.config.weeks || 8);
      if (state.currentSheetWeek < max) {
        state.currentSheetWeek++;
        document.getElementById('sheet-week-label').textContent = `Session ${state.currentSheetWeek}`;
        document.getElementById('player-scoresheet').innerHTML =
          `<div style="text-align:center; padding:32px; color:var(--muted); font-size:0.85rem;">
            <div style="font-size:1.8rem; margin-bottom:8px; animation:spin 0.8s linear infinite; display:inline-block;">⏳</div>
            <div>Loading Session ${state.currentSheetWeek}…</div>
          </div>`;
        ['sheet-week-prev','sheet-week-next'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
        await ensureWeekLoaded(state.currentSheetWeek);
        ['sheet-week-prev','sheet-week-next'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = false; });
        renderScoresheet();
      }
    });

    // Refresh tournament bracket
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

    // Weekly standings week nav
    document.getElementById('wstand-prev').addEventListener('click', () => {
      if (state.currentWstandWeek > 1) { state.currentWstandWeek--; renderWeeklyStandings(); }
    });
    document.getElementById('wstand-next').addEventListener('click', () => {
      const max = parseInt(state.config.weeks || 8);
      if (state.currentWstandWeek < max) { state.currentWstandWeek++; renderWeeklyStandings(); }
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

    let html = `<div class="card">
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
    const rows = standings.filter(s => s.games > 0).map((s, i) => {
      const isMe = s.name === highlightPlayer;
      const top = i < 3 ? 'top' : '';
      const ptsTot = s.points + s.pointsAgainst;
      const ptsPctVal = ptsTot > 0 ? (s.points / ptsTot * 100).toFixed(1) + '%' : '—';
      const secCol = usePtsPct
        ? `<td>${ptsPctVal}</td>`
        : `<td>${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</td>`;
      return `<tr ${isMe ? 'style="background:rgba(94,194,106,0.08);"' : ''}>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" ${isMe ? 'style="color:var(--green);"' : ''}>${esc(s.name)}${isMe ? ' ◀' : ''}</td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        <td class="text-muted">${s.games}</td>
      </tr>`;
    });
    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th title="Average point differential per game — your average score minus your opponent\'s average score. Positive means you score more than your opponents on average; used as a tiebreaker when win percentage is equal." style="cursor:help;">Avg+/-</th>';
    return `<table class="compact-table">
      <thead><tr><th>#</th><th>Player</th><th>W/L</th><th>Win%</th>${secHeader}<th>Games</th></tr></thead>
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
        const scoreHtml = scored
          ? `<span style="font-size:0.78rem; font-weight:700; color:var(--white);">${s1}–${s2}</span>`
          : `<span style="font-size:0.7rem; color:var(--muted);">pending</span>`;
        const border = (isMe1||isMe2) ? 'border:1px solid rgba(94,194,106,0.4);' : 'border:1px solid rgba(255,255,255,0.08);';

        html += `<div style="background:var(--card-bg); ${border} border-radius:8px; padding:7px 10px; margin:2px 4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div style="${t1style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${teamLabel(g.p1, g.p2)}</div>
            <div style="margin-left:6px; flex-shrink:0;">${scoreHtml}</div>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06); margin:3px 0;"></div>
          <div style="${t2style} font-size:0.8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px; margin-top:4px;">${teamLabel(g.p3, g.p4)}</div>
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
