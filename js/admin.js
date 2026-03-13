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
    renderScoresheet();
    renderStandings();
    renderPlayerReportSelect();
    renderLeagues();
  }

  // ── Head-to-Head ───────────────────────────────────────────
  let h2hMode = 'partners';

  function renderHeadToHead() {
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
    const players = state.players.filter(p => p.active !== false).map(p => p.name);
    if (!players.length) {
      document.getElementById('h2h-content').innerHTML = '<div class="card"><p class="text-muted">No players yet.</p></div>';
      return;
    }

    // Build count matrix
    const matrix = {};
    players.forEach(a => { matrix[a] = {}; players.forEach(b => { matrix[a][b] = 0; }); });

    state.scores.forEach(s => {
      if (!s.p1) return;
      const team1 = [s.p1, s.p2].filter(Boolean);
      const team2 = [s.p3, s.p4].filter(Boolean);

      if (h2hMode === 'partners') {
        // Count partner pairings
        [[s.p1, s.p2], [s.p3, s.p4]].forEach(([a, b]) => {
          if (a && b && matrix[a] && matrix[b]) {
            matrix[a][b]++;
            matrix[b][a]++;
          }
        });
      } else {
        // Count opponent pairings
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
    document.getElementById('h2h-content').innerHTML =
      `<div class="card"><div class="table-wrap" style="overflow-x:auto;">${tableHtml}</div></div>`;
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

    // Optimizer weights
    const D = Pairings.DEFAULTS;
    document.getElementById('cfg-w-session-partner').value   = c.wSessionPartner   ?? D.sessionPartnerWeight;
    document.getElementById('cfg-w-session-opponent').value  = c.wSessionOpponent  ?? D.sessionOpponentWeight;
    document.getElementById('cfg-w-history-partner').value   = c.wHistoryPartner   ?? D.historyPartnerWeight;
    document.getElementById('cfg-w-history-opponent').value  = c.wHistoryOpponent  ?? D.historyOpponentWeight;
    document.getElementById('cfg-w-bye-variance').value      = c.wByeVariance      ?? D.byeVarianceWeight;
    document.getElementById('cfg-w-session-bye').value       = c.wSessionBye       ?? D.sessionByeWeight;
    document.getElementById('cfg-w-rank-balance').value      = c.wRankBalance      ?? D.rankBalanceWeight;

    // Session dates
    const weeks = parseInt(c.weeks || 8);
    let datesHtml = '<div class="form-row" style="margin-top:12px;">';
    for (let w = 1; w <= weeks; w++) {
      datesHtml += `
        <div class="form-group">
          <label class="form-label">Week ${w} Date</label>
          <input class="form-control" id="cfg-date-${w}" type="date" value="${normalizeDate(c['date_' + w])}">
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
            <div class="court-label">${courtName(game.court)}</div>
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
          <div class="court-label">${courtName(game.court)}</div>
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
        document.getElementById('standings-trend').classList.toggle('active', tab === 'trend');
        if (tab === 'trend') renderRankTrend();
      });
    });
  }

  function renderRankTrend() {
    const canvas = document.getElementById('rank-trend-chart');
    const legend = document.getElementById('rank-trend-legend');
    if (!canvas) return;

    const totalWeeks = parseInt(state.config.weeks || 8);
    const activePlayers = state.players.filter(p => p.active !== false);
    if (!activePlayers.length) {
      legend.innerHTML = '<span class="text-muted">No players yet.</span>';
      return;
    }

    // Build rank for each player at end of each week (cumulative)
    const weeksWithData = [];
    const ranksByWeek = {}; // playerName -> [rank at week 1, week 2, ...]

    activePlayers.forEach(p => { ranksByWeek[p.name] = []; });

    for (let w = 1; w <= totalWeeks; w++) {
      // Only include weeks that have at least one score
      const hasScores = state.scores.some(s => parseInt(s.week) === w);
      if (!hasScores) continue;
      weeksWithData.push(w);
      // Cumulative: include all scores up through and including week w
      const scoresThrough = state.scores.filter(s => parseInt(s.week) <= w);
      const standings = Reports.computeStandings(
        scoresThrough, state.players, state.pairings
      );
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

    // Distinct colors — enough for up to 20 players
    const COLORS = [
      '#5EC26A','#F5C842','#5B9BD5','#E07B54','#A78BFA',
      '#34D399','#FB7185','#60A5FA','#FBBF24','#A3E635',
      '#38BDF8','#F472B6','#4ADE80','#FB923C','#818CF8',
      '#E879F9','#2DD4BF','#FCA5A5','#86EFAC','#93C5FD',
    ];

    // Canvas sizing
    const PAD = { top: 24, right: 20, bottom: 36, left: 40 };
    const W = Math.max(canvas.parentElement.clientWidth || 600, 320);
    const H = Math.max(240, Math.min(420, W * 0.45));
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const maxRank = activePlayers.length;
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top  - PAD.bottom;

    // Grid lines and Y-axis labels (ranks)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.fillStyle   = 'rgba(255,255,255,0.35)';
    ctx.font        = '11px system-ui, sans-serif';
    ctx.textAlign   = 'right';
    ctx.lineWidth   = 1;

    const rankStep = maxRank <= 10 ? 1 : maxRank <= 20 ? 2 : 5;
    for (let r = 1; r <= maxRank; r += rankStep) {
      const y = PAD.top + ((r - 1) / (maxRank - 1 || 1)) * plotH;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
      ctx.fillText(r, PAD.left - 6, y + 4);
    }

    // X-axis labels (weeks)
    ctx.textAlign   = 'center';
    ctx.fillStyle   = 'rgba(255,255,255,0.35)';
    weeksWithData.forEach((w, i) => {
      const x = PAD.left + (i / (weeksWithData.length - 1 || 1)) * plotW;
      const date = state.config['date_' + w];
      const label = date ? formatDate(date) : `Wk ${w}`;
      ctx.fillText(label, x, H - PAD.bottom + 16);
    });

    // Axis labels
    ctx.save();
    ctx.translate(12, PAD.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Rank', 0, 0);
    ctx.restore();

    // Draw a line per player
    activePlayers.forEach((player, pi) => {
      const color  = COLORS[pi % COLORS.length];
      const ranks  = ranksByWeek[player.name];
      const points = ranks.map((r, i) => {
        if (r === null) return null;
        return {
          x: PAD.left + (i / (weeksWithData.length - 1 || 1)) * plotW,
          y: PAD.top  + ((r - 1) / (maxRank - 1 || 1)) * plotH,
        };
      });

      // Draw line segments, skipping nulls
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2.5;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      let started = false;
      points.forEach(pt => {
        if (!pt) { started = false; return; }
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // Draw dots
      points.forEach(pt => {
        if (!pt) return;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    // Legend
    legend.innerHTML = activePlayers.map((p, pi) => {
      const color = COLORS[pi % COLORS.length];
      return `<span style="display:flex; align-items:center; gap:5px; white-space:nowrap;">
        <span style="display:inline-block; width:20px; height:3px; background:${color}; border-radius:2px;"></span>
        <span style="color:rgba(255,255,255,0.75);">${esc(p.name)}</span>
      </span>`;
    }).join('');
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
        wSessionPartner:  parseFloat(document.getElementById('cfg-w-session-partner').value),
        wSessionOpponent: parseFloat(document.getElementById('cfg-w-session-opponent').value),
        wHistoryPartner:  parseFloat(document.getElementById('cfg-w-history-partner').value),
        wHistoryOpponent: parseFloat(document.getElementById('cfg-w-history-opponent').value),
        wByeVariance:     parseFloat(document.getElementById('cfg-w-bye-variance').value),
        wSessionBye:      parseFloat(document.getElementById('cfg-w-session-bye').value),
        wRankBalance:     parseFloat(document.getElementById('cfg-w-rank-balance').value),
      };
      for (let w = 1; w <= weeks; w++) {
        const el = document.getElementById('cfg-date-' + w);
        if (el) config['date_' + w] = el.value;
      }
      const numCourts = parseInt(document.getElementById('cfg-courts').value);
      for (let cn = 1; cn <= numCourts; cn++) {
        const el = document.getElementById('cfg-court-name-' + cn);
        if (el) config['courtName_' + cn] = el.value.trim();
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
          return rec && rec.status === 'present';
        })
        .map(p => p.name);

      if (presentPlayers.length < courts * 4) {
        toast(`Need at least ${courts * 4} players, only ${presentPlayers.length} available.`, 'warn');
      }

      const pastPairings = state.pairings.filter(p => parseInt(p.week) < week);

      const weights = {
        sessionPartnerWeight:  state.config.wSessionPartner  ?? Pairings.DEFAULTS.sessionPartnerWeight,
        sessionOpponentWeight: state.config.wSessionOpponent ?? Pairings.DEFAULTS.sessionOpponentWeight,
        historyPartnerWeight:  state.config.wHistoryPartner  ?? Pairings.DEFAULTS.historyPartnerWeight,
        historyOpponentWeight: state.config.wHistoryOpponent ?? Pairings.DEFAULTS.historyOpponentWeight,
        byeVarianceWeight:     state.config.wByeVariance     ?? Pairings.DEFAULTS.byeVarianceWeight,
        sessionByeWeight:      state.config.wSessionBye      ?? Pairings.DEFAULTS.sessionByeWeight,
        rankBalanceWeight:     state.config.wRankBalance     ?? Pairings.DEFAULTS.rankBalanceWeight,
      };

      const { pairings: result, score, error } = Pairings.optimize({
        presentPlayers, courts, rounds, pastPairings, tries, weights,
        standings: state.standings
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
