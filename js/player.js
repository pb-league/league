// ============================================================
// player.js — Player dashboard logic
// ============================================================

(async function init() {
  const session = Auth.requireAuth(false);
  if (!session) return;

  const playerName = session.name;
  document.getElementById('topbar-name').textContent = playerName;
  document.getElementById('topbar-league').textContent = session.leagueName || 'Pickleball';

  let state = {
    config: {}, players: [], attendance: [],
    pairings: [], scores: [], standings: [],
    currentSheetWeek: 1, currentWstandWeek: 1
  };

  // ── Load ───────────────────────────────────────────────────
  showLoading(true);
  try {
    const data = await API.getAllData();
    state.config     = data.config || {};
    state.players    = data.players || [];
    state.attendance = data.attendance || [];
    state.pairings   = data.pairings || [];
    state.scores     = data.scores || [];
    state.standings  = data.standings || [];

    // Default to latest week with pairings
    const weeksWithPairings = [...new Set(state.pairings.map(p => parseInt(p.week)))];
    if (weeksWithPairings.length) {
      state.currentSheetWeek = Math.max(...weeksWithPairings);
    }
    const weeksWithScores = [...new Set(state.scores.map(s => parseInt(s.week)))];
    if (weeksWithScores.length) {
      state.currentWstandWeek = Math.max(...weeksWithScores);
    }

  } catch (e) {
    toast('Failed to load data: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }

  renderAll();
  setupNav();
  setupEvents();

  // ── Nav ────────────────────────────────────────────────────
  function setupNav() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        item.classList.add('active');
        const page = item.dataset.page;
        document.getElementById('page-' + page)?.classList.add('active');
        if (page === 'player-report') renderPlayerReportSelect();
        if (page === 'standings-trend') drawRankTrendChart('player-rank-trend-chart', 'player-rank-trend-legend', state, playerName);
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
    renderWeeklyStandings();
    renderSeasonStandings();
    renderFullAttendance();
    renderPlayerReportSelect();
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
    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');
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
      const date = state.config['date_' + week] ? ' · ' + formatDate(state.config['date_' + week]) : '';

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
    const date = state.config['date_' + week] ? ' · ' + formatDate(state.config['date_' + week]) : '';

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
      document.getElementById('my-game-history').innerHTML = '<p class="text-muted">No games recorded yet.</p>';
      return;
    }

    let html = `<table>
      <thead><tr><th>Wk</th><th>Rd</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
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
      const date = state.config['date_' + w] ? formatDate(state.config['date_' + w]) : '';

      html += `<div style="text-align:center; min-width:90px;">
        <div class="label" style="margin-bottom:6px;">Week ${w}${date ? `<br>${date}` : ''}</div>
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
        const states = ['present', 'absent', 'tbd'];
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
          Receive weekly results by email after each session.
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
    document.getElementById('sheet-week-label').textContent = `Week ${week}`;

    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');

    if (!weekPairings.length) {
      document.getElementById('player-scoresheet').innerHTML =
        '<p class="text-muted">No pairings for this week yet.</p>';
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
          ⏸ <strong style="${isMe ? 'color:var(--gold);' : 'color:var(--white);'}">${esc(bye.p1)}</strong>
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
              ${game.p2 ? `<div style="${t1style} font-size:0.8rem; opacity:0.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p2)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:4px; ${tieBoxStyle}">
              <div class="score-display ${entered ? (t1win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s1 : '—'}</div>
              <div style="color:var(--muted); font-size:0.75rem;">vs</div>
              <div class="score-display ${entered ? (t2win ? 'winner' : 'loser') : 'pending'}" style="min-width:28px; text-align:center;">${entered ? s2 : '—'}</div>
            </div>
            <div style="min-width:0; text-align:right;">
              <div style="${t2style} font-size:0.9rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p3)}</div>
              ${game.p4 ? `<div style="${t2style} font-size:0.8rem; opacity:0.85; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(game.p4)}</div>` : ''}
            </div>
          </div>
          ${tieWarning ? `<div style="margin-top:6px; font-size:0.72rem; color:var(--danger); text-align:center;">⚠️ Tied score — please verify</div>` : ''}
        </div>`;
      });
    });

    document.getElementById('player-scoresheet').innerHTML = html;
  }

  // ── Weekly Standings ───────────────────────────────────────
  function renderWeeklyStandings() {
    const week = state.currentWstandWeek;
    const wstandDate = state.config['date_' + week] ? ' — ' + formatDate(state.config['date_' + week]) : '';
    document.getElementById('wstand-label').textContent = `Week ${week}${wstandDate}`;
    const s = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week, state.config.rankingMethod);
    document.getElementById('weekly-standings-table').innerHTML = renderStandingsTable(s, playerName);
  }

  // ── Season Standings ───────────────────────────────────────
  function renderSeasonStandings() {
    const s = Reports.computeStandings(state.scores, state.players, state.pairings, null, state.config.rankingMethod);
    document.getElementById('season-standings-table').innerHTML = renderStandingsTable(s, playerName);
  }

  // ── Full Attendance ────────────────────────────────────────
  function renderFullAttendance() {
    const weeks = parseInt(state.config.weeks || 8);
    const players = state.players.filter(p => p.active !== false);

    let html = '<div class="att-grid">';
    html += '<div class="att-row"><div></div>';
    for (let w = 1; w <= weeks; w++) {
      const date = state.config['date_' + w] ? formatDate(state.config['date_' + w]) : '';
      html += `<div class="att-week-header">Wk${w}${date ? `<br><span style="font-size:0.6rem;font-weight:400;">${date}</span>` : ''}</div>`;
    }
    html += '</div>';

    players.forEach(p => {
      const isMe = p.name === playerName;
      html += `<div class="att-row" ${isMe ? 'style="background:rgba(94,194,106,0.05); border-radius:6px;"' : ''}>`;
      html += `<div class="att-player-name" ${isMe ? 'style="color:var(--green); font-weight:600;"' : ''}>${esc(p.name)}</div>`;
      for (let w = 1; w <= weeks; w++) {
        const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(w));
        const status = rec ? rec.status : 'tbd';
        html += `<div class="att-cell ${status}" title="${esc(p.name)} Week ${w}: ${status}">${statusLabel(status)}</div>`;
      }
      html += '</div>';
    });

    html += '</div>';
    document.getElementById('full-attendance-grid').innerHTML = html;
  }

  // ── Events ─────────────────────────────────────────────────
  function setupEvents() {
    // Scoresheet week nav
    document.getElementById('sheet-week-prev').addEventListener('click', () => {
      if (state.currentSheetWeek > 1) { state.currentSheetWeek--; renderScoresheet(); }
    });
    document.getElementById('sheet-week-next').addEventListener('click', () => {
      const max = parseInt(state.config.weeks || 8);
      if (state.currentSheetWeek < max) { state.currentSheetWeek++; renderScoresheet(); }
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
    const current = sel.value;
    sel.innerHTML = '<option value="">— Select Player —</option>';
    state.players.filter(p => p.active !== false).forEach(p => {
      const o = document.createElement('option');
      o.value = p.name;
      o.textContent = p.name;
      if (p.name === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => renderPlayerReport(sel.value);
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
          <table>
            <thead><tr><th>Player</th><th>Games</th><th>W/L vs them</th></tr></thead>
            <tbody>${sortedOpponents.length ? sortedOpponents.map(([n, d]) =>
              `<tr><td class="player-name">${esc(n)}</td><td>${d.count}</td>
               <td><span class="${d.wins >= d.losses ? 'win' : 'loss'}">${d.wins}W / ${d.losses}L</span></td></tr>`
            ).join('') : '<tr><td colspan="3" class="text-muted">No data</td></tr>'}</tbody>
          </table>
        </div>
        <div>
          <div class="card-title" style="font-size:0.8rem; margin-bottom:8px; color:var(--muted);">PLAYED AS PARTNER</div>
          <table>
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
          <thead><tr><th>Wk</th><th>Rd</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
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
        : `<td class="${s.avgPtDiff > 0 ? 'win' : s.avgPtDiff < 0 ? 'loss' : 'neutral'}">${s.avgPtDiff > 0 ? '+' : ''}${s.avgPtDiff.toFixed(1)}</td>`;
      return `<tr ${isMe ? 'style="background:rgba(94,194,106,0.08);"' : ''}>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" ${isMe ? 'style="color:var(--green);"' : ''}>${esc(s.name)}${isMe ? ' ◀' : ''}</td>
        <td>${s.wins}/${s.losses}</td>
        <td>${Reports.pct(s.winPct)}</td>
        ${secCol}
        <td class="text-muted">${s.games}</td>
      </tr>`;
    });
    const secHeader = usePtsPct ? '<th>Pts%</th>' : '<th>Avg+/-</th>';
    return `<table>
      <thead><tr><th>#</th><th>Player</th><th>W/L</th><th>Win%</th>${secHeader}<th>Games</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  function statusLabel(s) {
    return s === 'present' ? 'In' : s === 'absent' ? 'Out' : 'TBD';
  }

  function statusIcon(s) {
    return s === 'present' ? '✅' : s === 'absent' ? '❌' : '❓';
  }

  function formatDate(d) {
    if (!d) return '';
    try { const p = d.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; } catch { return d; }
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
    const activePlayers = chartState.players.filter(p => p.active !== false);
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
      const date  = chartState.config['date_' + w];
      const label = date ? formatDate(date) : 'Wk ' + w;
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
