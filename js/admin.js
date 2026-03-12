// ============================================================
// admin.js — Admin dashboard logic
// ============================================================

(async function init() {
  const session = Auth.requireAuth(true);
  if (!session) return;
  document.getElementById('topbar-name').textContent = session.name;
  if (session.leagueName) {
    document.querySelector('.topbar-brand').innerHTML =
      `🥒 <span>${esc(session.leagueName)}</span> <span style="color:var(--muted);font-size:0.75rem;font-weight:400;margin-left:4px;">Admin</span>`;
  }

  // ── State ──────────────────────────────────────────────────
  let state = {
    config: {}, players: [], attendance: [],
    pairings: [], scores: [], standings: [],
    currentPairWeek: 1, currentScoreWeek: 1,
    currentStandWeek: 1, pendingPairings: null
  };

  // ── Boot ───────────────────────────────────────────────────
  const isBootstrap = session.leagueId === '__registry__';

  if (isBootstrap) {
    // Registry-only mode: skip data load, go straight to Leagues page
    toast('No league selected — add your first league below.', 'warn');
    renderAll();
    setupNav();
    setupEvents();
    // Force-navigate to the Leagues page
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelector('.nav-item[data-page="leagues"]')?.classList.add('active');
    document.getElementById('page-leagues')?.classList.add('active');
    renderLeagues();
  } else {
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
    renderAll();
    setupNav();
    setupEvents();
  }

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
        if (page === 'standings') renderStandings();
        if (page === 'player-report') renderPlayerReportSelect();
        if (page === 'scores') renderScoresheet();
        if (page === 'pairings') renderPairingsPreview();
        if (page === 'attendance') renderAttendance();
        if (page === 'leagues') renderLeagues();
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
    renderScoresheet();
    renderStandings();
    renderPlayerReportSelect();
    renderLeagues();
  }

  // ── Dashboard ──────────────────────────────────────────────
  function renderDashboard() {
    document.getElementById('dash-league-name').textContent =
      state.config.leagueName || 'League Dashboard';

    const activePlayers = state.players.filter(p => p.active !== false).length;
    const weeksWithScores = [...new Set(state.scores.map(s => s.week))].length;
    const totalGames = state.scores.filter(s => s.score1 || s.score2).length;

    document.getElementById('dash-stats').innerHTML = `
      <div class="stat-tile"><div class="stat-value">${activePlayers}</div><div class="stat-label">Players</div></div>
      <div class="stat-tile"><div class="stat-value">${state.config.weeks || '—'}</div><div class="stat-label">Total Weeks</div></div>
      <div class="stat-tile"><div class="stat-value">${weeksWithScores}</div><div class="stat-label">Weeks Played</div></div>
      <div class="stat-tile"><div class="stat-value">${totalGames}</div><div class="stat-label">Games Entered</div></div>
    `;

    document.getElementById('dash-standings').innerHTML = renderStandingsTable(state.standings, true);
  }

  // ── Setup ──────────────────────────────────────────────────
  function renderSetup() {
    const c = state.config;
    document.getElementById('cfg-name').value    = c.leagueName || '';
    document.getElementById('cfg-admin-pin').value = '';
    document.getElementById('cfg-weeks').value   = c.weeks || 8;
    document.getElementById('cfg-courts').value  = c.courts || 3;
    document.getElementById('cfg-games').value   = c.gamesPerSession || 7;
    document.getElementById('cfg-tries').value   = c.optimizerTries || 100;

    // Session dates
    const weeks = parseInt(c.weeks || 8);
    let datesHtml = '<div class="form-row" style="margin-top:12px;">';
    for (let w = 1; w <= weeks; w++) {
      datesHtml += `
        <div class="form-group">
          <label class="form-label">Week ${w} Date</label>
          <input class="form-control" id="cfg-date-${w}" type="date" value="${c['date_' + w] || ''}">
        </div>`;
    }
    datesHtml += '</div>';
    document.getElementById('cfg-dates-area').innerHTML = datesHtml;
  }

  // ── Players ────────────────────────────────────────────────
  function renderPlayers() {
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    state.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'player-row';
      row.innerHTML = `
        <input class="form-control" data-field="name" data-idx="${i}" value="${esc(p.name)}" placeholder="Player name">
        <input class="form-control" data-field="pin" data-idx="${i}" type="text" value="${esc(String(p.pin || ''))}" placeholder="PIN" maxlength="8">
        <select class="form-control" data-field="group" data-idx="${i}">
          <option value="M" ${p.group==='M'?'selected':''}>Male</option>
          <option value="F" ${p.group==='F'?'selected':''}>Female</option>
          <option value="Either" ${p.group==='Either'?'selected':''}>Either</option>
        </select>
        <select class="form-control" data-field="active" data-idx="${i}">
          <option value="true" ${p.active!==false?'selected':''}>Active</option>
          <option value="false" ${p.active===false?'selected':''}>Inactive</option>
        </select>
        <button class="btn btn-danger" data-remove="${i}" style="padding:6px 10px;">✕</button>
      `;
      list.appendChild(row);
    });

    // Live update
    list.querySelectorAll('[data-field]').forEach(el => {
      el.addEventListener('change', e => {
        const idx = parseInt(el.dataset.idx);
        const field = el.dataset.field;
        let val = el.value;
        if (field === 'active') val = val === 'true';
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
      const date = state.config['date_' + w] ? formatDate(state.config['date_' + w]) : `Wk${w}`;
      html += `<div class="att-week-header">Wk${w}<br><span style="font-size:0.6rem;font-weight:400;">${date}</span></div>`;
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

    html += '</div>';
    document.getElementById('attendance-grid').innerHTML = html;

    document.querySelectorAll('.att-cell.editable').forEach(cell => {
      cell.addEventListener('click', async () => {
        const states = ['present', 'absent', 'tbd'];
        const cur = states.indexOf(cell.className.split(' ').find(c => states.includes(c)));
        const next = states[(cur + 1) % states.length];
        const player = cell.dataset.player;
        const week = cell.dataset.week;

        cell.className = `att-cell editable ${next}`;
        cell.textContent = statusLabel(next);

        // Update local state
        const rec = state.attendance.find(a => a.player === player && String(a.week) === String(week));
        if (rec) { rec.status = next; } else { state.attendance.push({ player, week, status: next }); }

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
    document.getElementById('pair-week-label').textContent = `Week ${week}`;

    const existing = state.pairings.filter(p => parseInt(p.week) === week);
    const toShow = state.pendingPairings || existing;

    if (!toShow.length) {
      document.getElementById('pairings-preview').innerHTML =
        '<div class="card"><p class="text-muted" style="font-size:0.88rem;">No pairings generated yet for this week.</p></div>';
      return;
    }

    const rounds = [...new Set(toShow.map(p => p.round))].sort((a,b) => a-b);
    let html = '';
    rounds.forEach(r => {
      html += `<div class="round-header">Round ${r}</div>`;
      toShow.filter(p => p.round == r).forEach(game => {
        if (game.type === 'bye') {
          html += `<div class="game-card" style="grid-template-columns:1fr; background:rgba(122,155,181,0.07);">
            <span class="text-muted" style="font-size:0.8rem;">⏸ BYE: <strong style="color:var(--white);">${esc(game.p1)}</strong></span>
          </div>`;
        } else {
          html += `<div class="game-card">
            <div class="court-label">Court ${game.court}</div>
            <div class="team-names">${esc(game.p1)}<span class="partner">${esc(game.p2)}</span></div>
            <div class="vs-divider">VS</div>
            <div class="team-names">${esc(game.p3)}<span class="partner">${esc(game.p4)}</span></div>
            <div></div>
          </div>`;
        }
      });
    });

    document.getElementById('pairings-preview').innerHTML = html;
    document.getElementById('btn-lock-pairings').disabled = !state.pendingPairings;
  }

  // ── Scoresheet ─────────────────────────────────────────────
  function renderScoresheet() {
    const week = state.currentScoreWeek;
    document.getElementById('score-week-label').textContent = `Week ${week}`;

    const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');

    if (!weekPairings.length) {
      document.getElementById('scoresheet').innerHTML =
        '<p class="text-muted" style="font-size:0.88rem;">No pairings for this week yet. Generate pairings first.</p>';
      return;
    }

    const rounds = [...new Set(weekPairings.map(p => p.round))].sort((a,b) => a-b);
    let html = '';

    rounds.forEach(r => {
      html += `<div class="round-header">Round ${r}</div>`;
      weekPairings.filter(p => p.round == r).forEach(game => {
        const existingScore = state.scores.find(
          s => parseInt(s.week) === week && parseInt(s.round) === parseInt(game.round) && String(s.court) === String(game.court)
        );
        const s1 = existingScore ? existingScore.score1 : '';
        const s2 = existingScore ? existingScore.score2 : '';

        html += `<div class="game-card" data-week="${week}" data-round="${game.round}" data-court="${game.court}">
          <div class="court-label">Court ${game.court}</div>
          <div class="team-names">${esc(game.p1)}<span class="partner">${esc(game.p2)}</span></div>
          <input type="number" class="score-input" data-score="1"
                 value="${s1}" min="0" max="30" placeholder="0">
          <div class="vs-divider">—</div>
          <input type="number" class="score-input" data-score="2"
                 value="${s2}" min="0" max="30" placeholder="0">
          <div class="team-names" style="text-align:right;">${esc(game.p3)}<span class="partner">${esc(game.p4)}</span></div>
        </div>`;
      });
    });

    document.getElementById('scoresheet').innerHTML = html;
  }

  // ── Standings ──────────────────────────────────────────────
  function renderStandings() {
    const season = Reports.computeStandings(state.scores, state.players, state.pairings);
    document.getElementById('standings-season-table').innerHTML = renderStandingsTable(season);

    const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek);
    document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
    document.getElementById('stand-week-label').textContent = `Week ${state.currentStandWeek}`;

    // Tab switching
    document.querySelectorAll('#standings-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#standings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('standings-season').classList.toggle('active', tab === 'season');
        document.getElementById('standings-weekly').classList.toggle('active', tab === 'weekly');
      });
    });
  }

  function renderStandingsTable(standings, compact = false) {
    if (!standings || !standings.length) return '<p class="text-muted">No standings data yet.</p>';
    const rows = standings.filter(s => s.games > 0 || s.rank !== '-').map((s, i) => {
      const top = i < 3 ? 'top' : '';
      return `<tr>
        <td class="rank-cell ${top}">${s.rank}</td>
        <td class="player-name">${esc(s.name)}</td>
        <td>${s.wins}/${s.losses}</td>
        <td><span class="${s.winPct >= 0.5 ? 'win' : 'neutral'}">${Reports.pct(s.winPct)}</span></td>
        ${!compact ? `<td>${s.points}/${s.points + s.pointsAgainst}</td>` : ''}
        <td class="${s.ptDiff > 0 ? 'win' : s.ptDiff < 0 ? 'loss' : 'neutral'}">${s.ptDiff > 0 ? '+' : ''}${s.ptDiff}</td>
        ${!compact ? `<td class="text-muted">${s.games}</td><td class="text-muted">${s.byes}</td>` : ''}
      </tr>`;
    });
    return `<table>
      <thead><tr>
        <th>#</th><th>Player</th><th>W/L</th><th>Win%</th>
        ${!compact ? '<th>Pts/Tot</th>' : ''}
        <th>+/-</th>
        ${!compact ? '<th>Games</th><th>Byes</th>' : ''}
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
  }

  // ── Player Report ──────────────────────────────────────────
  function renderPlayerReportSelect() {
    const sel = document.getElementById('report-player-select');
    sel.innerHTML = '<option value="">— Select Player —</option>';
    state.players.filter(p => p.active !== false).forEach(p => {
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

  // ── Events ─────────────────────────────────────────────────
  function setupEvents() {
    // Save config
    document.getElementById('btn-save-config').addEventListener('click', async () => {
      const weeks = parseInt(document.getElementById('cfg-weeks').value);
      const config = {
        leagueName:     document.getElementById('cfg-name').value.trim(),
        adminPin:       document.getElementById('cfg-admin-pin').value || state.config.adminPin,
        weeks,
        courts:         parseInt(document.getElementById('cfg-courts').value),
        gamesPerSession:parseInt(document.getElementById('cfg-games').value),
        optimizerTries: parseInt(document.getElementById('cfg-tries').value),
      };
      for (let w = 1; w <= weeks; w++) {
        const el = document.getElementById('cfg-date-' + w);
        if (el) config['date_' + w] = el.value;
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

    // Add player
    document.getElementById('btn-add-player').addEventListener('click', () => {
      state.players.push({ name: '', pin: '', group: 'M', active: true });
      renderPlayers();
    });

    // Save players
    document.getElementById('btn-save-players').addEventListener('click', async () => {
      // Collect from DOM
      const rows = document.querySelectorAll('#player-list .player-row');
      const players = [];
      rows.forEach(row => {
        const name = row.querySelector('[data-field="name"]').value.trim();
        if (name) {
          players.push({
            name,
            pin: row.querySelector('[data-field="pin"]').value.trim(),
            group: row.querySelector('[data-field="group"]').value,
            active: row.querySelector('[data-field="active"]').value === 'true'
          });
        }
      });
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
    });
    setupWeekNav('score-week-prev', 'score-week-next', 'currentScoreWeek', renderScoresheet);
    setupWeekNav('stand-week-prev', 'stand-week-next', 'currentStandWeek', () => {
      const weekStand = Reports.computeWeeklyStandings(state.scores, state.players, state.pairings, state.currentStandWeek);
      document.getElementById('standings-weekly-table').innerHTML = renderStandingsTable(weekStand);
      document.getElementById('stand-week-label').textContent = `Week ${state.currentStandWeek}`;
    });

    // Generate pairings
    document.getElementById('btn-generate').addEventListener('click', () => {
      const week = state.currentPairWeek;
      const weeks = parseInt(state.config.weeks || 8);
      const courts = parseInt(state.config.courts || 3);
      const rounds = parseInt(state.config.gamesPerSession || 7);
      const tries = parseInt(state.config.optimizerTries || 100);

      // Get present players for this week
      const presentPlayers = state.players
        .filter(p => p.active !== false)
        .filter(p => {
          const rec = state.attendance.find(a => a.player === p.name && String(a.week) === String(week));
          return !rec || rec.status !== 'absent';
        })
        .map(p => p.name);

      if (presentPlayers.length < courts * 4) {
        toast(`Need at least ${courts * 4} players, only ${presentPlayers.length} available.`, 'warn');
      }

      const pastPairings = state.pairings.filter(p => parseInt(p.week) < week);

      const { pairings: result, score, error } = Pairings.optimize({
        presentPlayers, courts, rounds, pastPairings, tries
      });

      if (error) { toast(error, 'error'); return; }

      // Add week to each pairing
      state.pendingPairings = result.map(p => ({ ...p, week }));

      document.getElementById('optimizer-status').classList.remove('hidden');
      document.getElementById('optimizer-score').textContent = score.toFixed(1);
      document.getElementById('optimizer-msg').textContent = ` (${tries} iterations, ${presentPlayers.length} players)`;
      document.getElementById('btn-lock-pairings').disabled = false;

      renderPairingsPreview();
    });

    // Lock pairings
    document.getElementById('btn-lock-pairings').addEventListener('click', async () => {
      if (!state.pendingPairings) return;
      const week = state.currentPairWeek;
      showLoading(true);
      try {
        await API.savePairings(week, state.pendingPairings);
        // Remove old pairings for this week from local state and add new
        state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        state.pairings.push(...state.pendingPairings);
        state.pendingPairings = null;
        document.getElementById('btn-lock-pairings').disabled = true;
        toast(`Pairings for Week ${week} saved!`);
        renderPairingsPreview();
        renderScoresheet();
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Clear pairings
    document.getElementById('btn-clear-pairings').addEventListener('click', async () => {
      if (!confirm('Clear all pairings for this week?')) return;
      const week = state.currentPairWeek;
      showLoading(true);
      try {
        await API.savePairings(week, []);
        state.pairings = state.pairings.filter(p => parseInt(p.week) !== week);
        state.pendingPairings = null;
        toast(`Pairings for Week ${week} cleared.`);
        renderPairingsPreview();
      } catch (e) { toast('Failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Save scores
    document.getElementById('btn-save-scores').addEventListener('click', async () => {
      const week = state.currentScoreWeek;
      const weekPairings = state.pairings.filter(p => parseInt(p.week) === week && p.type === 'game');
      const scores = [];

      document.querySelectorAll('#scoresheet .game-card').forEach(card => {
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

      showLoading(true);
      try {
        await API.saveScores(week, scores);
        state.scores = state.scores.filter(s => parseInt(s.week) !== week);
        state.scores.push(...scores);
        // Refresh standings
        state.standings = Reports.computeStandings(state.scores, state.players, state.pairings);
        toast(`Scores for Week ${week} saved!`);
      } catch (e) { toast('Save failed: ' + e.message, 'error'); }
      finally { showLoading(false); }
    });

    // Player report select
    document.getElementById('report-player-select').addEventListener('change', e => {
      renderPlayerReport(e.target.value);
    });

    // Add league toggle
    document.getElementById('btn-show-add-league').addEventListener('click', () => {
      document.getElementById('add-league-form').classList.remove('hidden');
      document.getElementById('btn-show-add-league').classList.add('hidden');
    });

    document.getElementById('btn-cancel-add-league').addEventListener('click', () => {
      document.getElementById('add-league-form').classList.add('hidden');
      document.getElementById('btn-show-add-league').classList.remove('hidden');
    });

    document.getElementById('btn-save-new-league').addEventListener('click', async () => {
      const leagueId = document.getElementById('new-league-id').value.trim().replace(/\s+/g, '-');
      const name     = document.getElementById('new-league-name').value.trim();
      const sheetId  = document.getElementById('new-league-sheet').value.trim();

      if (!leagueId || !name || !sheetId) {
        toast('All three fields are required.', 'warn'); return;
      }

      showLoading(true);
      try {
        await API.addLeague(leagueId, name, sheetId);
        toast(`League "${name}" added!`);
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
  async function renderLeagues() {
    const session = Auth.getSession();
    let leagues = [];
    try {
      const data = await API.getLeagues();
      leagues = data.leagues || [];
    } catch (e) {
      toast('Failed to load leagues: ' + e.message, 'error');
    }

    const currentId = session?.leagueId;
    let html = `<table>
      <thead><tr><th>ID</th><th>Name</th><th>Sheet ID</th><th>Status</th><th></th></tr></thead>
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
        <td>
          <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;"
            data-toggle-league="${esc(l.leagueId)}" data-active="${l.active}">
            ${l.active ? 'Deactivate' : 'Activate'}
          </button>
        </td>
      </tr>`;
    });

    html += '</tbody></table>';
    document.getElementById('leagues-table').innerHTML = html;

    document.querySelectorAll('[data-toggle-league]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lid = btn.dataset.toggleLeague;
        const nowActive = btn.dataset.active === 'true';
        try {
          await API.updateLeague(lid, undefined, undefined, !nowActive);
          toast(`League ${nowActive ? 'deactivated' : 'activated'}.`);
          renderLeagues();
        } catch (e) { toast('Failed: ' + e.message, 'error'); }
      });
    });
  }

  // ── Helpers ────────────────────────────────────────────────
  function setupWeekNav(prevId, nextId, stateKey, cb) {
    document.getElementById(prevId).addEventListener('click', () => {
      if (state[stateKey] > 1) { state[stateKey]--; cb(); }
    });
    document.getElementById(nextId).addEventListener('click', () => {
      const max = parseInt(state.config.weeks || 8);
      if (state[stateKey] < max) { state[stateKey]++; cb(); }
    });
  }

  function buildPlayerReportHTML(report) {
    const s = report.standing;
    let html = `<div class="card">
      <div class="card-header">
        <div class="card-title">${esc(report.player)}</div>
        ${s ? `<div>
          <span class="badge badge-gold">Rank #${s.rank}</span>
          <span class="badge badge-green ml-1">${Reports.wl(s.wins, s.losses)}</span>
          <span class="badge badge-muted">${Reports.pct(s.winPct)}</span>
        </div>` : ''}
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Wk</th><th>Rd</th><th>Court</th><th>Partner</th><th>Opponents</th><th>Score</th><th>Result</th></tr></thead>
          <tbody>`;

    report.games.forEach(g => {
      html += `<tr>
        <td>${g.week}</td>
        <td>${g.round}</td>
        <td>${g.court}</td>
        <td class="player-name">${esc(g.partner)}</td>
        <td class="text-muted">${g.opponents.map(o => esc(o)).join(' & ')}</td>
        <td><strong>${g.myScore}</strong> — ${g.oppScore}</td>
        <td><span class="badge ${g.won ? 'badge-green' : 'badge-red'}">${g.won ? 'W' : 'L'}</span></td>
      </tr>`;
    });

    html += `</tbody></table></div></div>`;
    return html;
  }

  function statusLabel(s) {
    return s === 'present' ? 'In' : s === 'absent' ? 'Out' : 'TBD';
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      const parts = d.split('-');
      return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
    } catch { return d; }
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