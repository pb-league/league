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
      });
    });
  }

  function renderAll() {
    renderMyGames();
    renderMyAttendance();
    renderScoresheet();
    renderWeeklyStandings();
    renderSeasonStandings();
    renderFullAttendance();
    renderPlayerReportSelect();
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
        <div class="stat-tile"><div class="stat-value">${s.ptDiff > 0 ? '+' : ''}${s.ptDiff}</div><div class="stat-label">Point Diff</div></div>
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

    const rounds = [...new Set(weekPairings.map(p => p.round))].sort((a,b) => a-b);
    let html = '';

    rounds.forEach(r => {
      html += `<div class="round-header">Round ${r}</div>`;
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

        const highlight1 = myTeam === 1 ? 'style="font-weight:700; color:var(--white);"' : '';
        const highlight2 = myTeam === 2 ? 'style="font-weight:700; color:var(--white);"' : '';

        html += `<div class="game-card">
          <div class="court-label">Court ${game.court}</div>
          <div class="team-names" ${highlight1}>${esc(game.p1)}<span class="partner">${esc(game.p2)}</span></div>
          <div class="score-display ${entered ? (t1win ? 'winner' : 'loser') : 'pending'}">${entered ? s1 : '—'}</div>
          <div class="vs-divider">—</div>
          <div class="score-display ${entered ? (t2win ? 'winner' : 'loser') : 'pending'}">${entered ? s2 : '—'}</div>
          <div class="team-names" ${highlight2} style="text-align:right;">${esc(game.p3)}<span class="partner">${esc(game.p4)}</span></div>
        </div>`;
      });
    });

    // Byes
    const byes = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'bye');
    if (byes.length) {
      html += '<div class="round-header">Byes</div>';
      byes.forEach(b => {
        html += `<div style="padding:6px 8px; color:var(--muted); font-size:0.85rem;">⏸ ${esc(b.p1)}</div>`;
      });
    }

    document.getElementById('player-scoresheet').innerHTML = html;
  }

  // ── Weekly Standings ───────────────────────────────────────
  function renderWeeklyStandings() {
    const week = state.currentWstandWeek;
    const wstandDate = state.config['date_' + week] ? ' — ' + formatDate(state.config['date_' + week]) : '';
    document.getElementById('wstand-label').textContent = `Week ${week}${wstandDate}`;
    const s = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, week);
    document.getElementById('weekly-standings-table').innerHTML = renderStandingsTable(s, playerName);
  }

  // ── Season Standings ───────────────────────────────────────
  function renderSeasonStandings() {
    const s = Reports.computeStandings(state.scores, state.players, state.pairings);
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
          <thead><tr><th>Wk</th><th>Rd</th><th>Court</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
          <tbody>${report.games.length ? report.games.map(g =>
            `<tr>
              <td>${g.week}</td><td>${g.round}</td><td>${g.court}</td>
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
    const rows = standings.filter(s => s.games > 0).map((s, i) => {
      const isMe = s.name === highlightPlayer;
      const top = i < 3 ? 'top' : '';
      return `<tr ${isMe ? 'style="background:rgba(94,194,106,0.08);"' : ''}>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name" ${isMe ? 'style="color:var(--green);"' : ''}>${esc(s.name)}${isMe ? ' ◀' : ''}</td>
        <td>${s.wins}/${s.losses}</td>
        <td><span class="${s.winPct >= 0.5 ? 'win' : 'neutral'}">${Reports.pct(s.winPct)}</span></td>
        <td class="${s.ptDiff > 0 ? 'win' : s.ptDiff < 0 ? 'loss' : 'neutral'}">${s.ptDiff > 0 ? '+' : ''}${s.ptDiff}</td>
        <td class="text-muted">${s.games}</td>
      </tr>`;
    });
    return `<table>
      <thead><tr><th>#</th><th>Player</th><th>W/L</th><th>Win%</th><th>+/-</th><th>Games</th></tr></thead>
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

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
