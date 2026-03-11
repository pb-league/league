// ============================================================
// PICKLEBALL LEAGUE MANAGER — Google Apps Script Backend
// Deploy as: Web App, Execute as: Me, Who has access: Anyone
//
// MULTI-LEAGUE ARCHITECTURE:
//   - This single GAS deployment serves all leagues
//   - One "master" Google Sheet holds the league registry
//   - Each league has its own separate Google Sheet for data
//   - All requests include a leagueId that routes to the right Sheet
// ============================================================

// The master registry Sheet ID — create a blank Google Sheet and paste its ID here
const MASTER_SHEET_ID = 'YOUR_MASTER_REGISTRY_SHEET_ID_HERE';

// ── Registry helpers ─────────────────────────────────────────

function getMasterSheet() {
  return SpreadsheetApp.openById(MASTER_SHEET_ID);
}

function getRegistrySheet() {
  const ss = getMasterSheet();
  let sheet = ss.getSheetByName('leagues');
  if (!sheet) {
    sheet = ss.insertSheet('leagues');
    sheet.getRange(1, 1, 1, 4).setValues([['leagueId', 'name', 'sheetId', 'active']]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }
  return sheet;
}

// Returns all leagues from the registry
function getLeagueList() {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  const leagues = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][3] !== false) {
      leagues.push({
        leagueId: String(data[i][0]),
        name:     String(data[i][1]),
        sheetId:  String(data[i][2]),
        active:   data[i][3] !== false
      });
    }
  }
  return leagues;
}

// Resolve a leagueId → Google Sheet for that league's data
function getLeagueSpreadsheet(leagueId) {
  const leagues = getLeagueList();
  const league = leagues.find(l => l.leagueId === leagueId);
  if (!league) throw new Error('League not found: ' + leagueId);
  return SpreadsheetApp.openById(league.sheetId);
}

function getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sheet;
}

// ============================================================
// CORS + ROUTING
// ============================================================

function doGet(e) {
  const action = e.parameter.action;
  let result;
  try {
    // League-registry actions (no leagueId needed)
    if (action === 'getLeagues') {
      result = { leagues: getLeagueList() };
    } else {
      const leagueId = e.parameter.leagueId;
      if (!leagueId) throw new Error('leagueId is required');
      const ss = getLeagueSpreadsheet(leagueId);
      switch (action) {
        case 'getConfig':       result = getConfig(ss); break;
        case 'getPlayers':      result = getPlayers(ss); break;
        case 'getAttendance':   result = getAttendance(ss); break;
        case 'getPairings':     result = getPairings(ss, e.parameter.week); break;
        case 'getScores':       result = getScores(ss, e.parameter.week); break;
        case 'getStandings':    result = getStandings(ss, e.parameter.week); break;
        case 'getPlayerReport': result = getPlayerReport(ss, e.parameter.player); break;
        case 'getAllData':       result = getAllData(ss); break;
        default: result = { error: 'Unknown action: ' + action };
      }
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ error: 'Invalid JSON: ' + err.toString() });
  }
  const action = body.action;
  let result;
  try {
    // Registry-level admin actions
    if (action === 'addLeague') {
      result = addLeague(body.leagueId, body.name, body.sheetId);
    } else if (action === 'updateLeague') {
      result = updateLeague(body.leagueId, body.name, body.sheetId, body.active);
    } else {
      const leagueId = body.leagueId;
      if (!leagueId) throw new Error('leagueId is required');
      const ss = getLeagueSpreadsheet(leagueId);
      switch (action) {
        case 'validatePIN':   result = validatePIN(ss, body.name, body.pin); break;
        case 'saveConfig':    result = saveConfig(ss, body.config); break;
        case 'savePlayers':   result = savePlayers(ss, body.players); break;
        case 'setAttendance': result = setAttendance(ss, body.player, body.week, body.status); break;
        case 'savePairings':  result = savePairings(ss, body.week, body.pairings); break;
        case 'saveScores':    result = saveScores(ss, body.week, body.scores); break;
        default: result = { error: 'Unknown action: ' + action };
      }
    }
  } catch (err) {
    result = { error: err.toString() };
  }
  return respond(result);
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// LEAGUE REGISTRY (admin)
// ============================================================

function addLeague(leagueId, name, sheetId) {
  if (!leagueId || !name || !sheetId) throw new Error('leagueId, name, and sheetId are required');
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(leagueId)) throw new Error('League ID already exists: ' + leagueId);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 4).setValues([[leagueId, name, sheetId, true]]);
  return { success: true };
}

function updateLeague(leagueId, name, sheetId, active) {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(leagueId)) {
      if (name     !== undefined) sheet.getRange(i + 1, 2).setValue(name);
      if (sheetId  !== undefined) sheet.getRange(i + 1, 3).setValue(sheetId);
      if (active   !== undefined) sheet.getRange(i + 1, 4).setValue(active);
      return { success: true };
    }
  }
  throw new Error('League not found: ' + leagueId);
}

// ============================================================
// CONFIG
// ============================================================

function getConfig(ss) {
  const sheet = getOrCreateSheet(ss, 'config', ['key', 'value']);
  const data = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) config[data[i][0]] = data[i][1];
  }
  return { config };
}

function saveConfig(ss, config) {
  const sheet = getOrCreateSheet(ss, 'config', ['key', 'value']);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 2).setValues([['key', 'value']]);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');
  const rows = Object.entries(config).map(([k, v]) => [k, v]);
  if (rows.length > 0) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  return { success: true };
}

// ============================================================
// PLAYERS
// ============================================================

function getPlayers(ss) {
  const sheet = getOrCreateSheet(ss, 'players', ['name', 'pin', 'group', 'active']);
  const data = sheet.getDataRange().getValues();
  const players = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      players.push({
        name:   data[i][0],
        pin:    data[i][1],
        group:  data[i][2] || 'M',
        active: data[i][3] !== false
      });
    }
  }
  return { players };
}

function savePlayers(ss, players) {
  const sheet = getOrCreateSheet(ss, 'players', ['name', 'pin', 'group', 'active']);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([['name', 'pin', 'group', 'active']]);
  sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  if (players.length > 0) {
    const rows = players.map(p => [p.name, p.pin, p.group || 'M', p.active !== false]);
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  return { success: true };
}

function validatePIN(ss, name, pin) {
  const { players } = getPlayers(ss);
  const player = players.find(p => p.name === name);
  if (!player) return { valid: false, reason: 'Player not found' };
  if (String(player.pin) === String(pin)) {
    const adminPin = getConfig(ss).config.adminPin || '0000';
    return { valid: true, name: player.name, isAdmin: String(pin) === String(adminPin) };
  }
  return { valid: false, reason: 'Incorrect PIN' };
}

// ============================================================
// ATTENDANCE
// ============================================================

function getAttendance(ss) {
  const sheet = getOrCreateSheet(ss, 'attendance', ['player', 'week', 'status']);
  const data = sheet.getDataRange().getValues();
  const attendance = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      attendance.push({ player: data[i][0], week: data[i][1], status: data[i][2] || 'tbd' });
    }
  }
  return { attendance };
}

function setAttendance(ss, player, week, status) {
  const sheet = getOrCreateSheet(ss, 'attendance', ['player', 'week', 'status']);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === player && String(data[i][1]) === String(week)) {
      sheet.getRange(i + 1, 3).setValue(status);
      return { success: true };
    }
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 3).setValues([[player, week, status]]);
  return { success: true };
}

// ============================================================
// PAIRINGS
// ============================================================

function getPairings(ss, week) {
  const sheet = getOrCreateSheet(ss, 'pairings', ['week', 'round', 'court', 'p1', 'p2', 'p3', 'p4', 'type']);
  const data = sheet.getDataRange().getValues();
  const pairings = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && (week === undefined || String(data[i][0]) === String(week))) {
      pairings.push({
        week: data[i][0], round: data[i][1], court: data[i][2],
        p1: data[i][3], p2: data[i][4], p3: data[i][5], p4: data[i][6],
        type: data[i][7] || 'game'
      });
    }
  }
  return { pairings };
}

function savePairings(ss, week, pairings) {
  const sheet = getOrCreateSheet(ss, 'pairings', ['week', 'round', 'court', 'p1', 'p2', 'p3', 'p4', 'type']);
  const data = sheet.getDataRange().getValues();
  const toDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(week)) toDelete.push(i + 1);
  }
  toDelete.forEach(r => sheet.deleteRow(r));
  if (pairings.length > 0) {
    const rows = pairings.map(p => [week, p.round, p.court, p.p1||'', p.p2||'', p.p3||'', p.p4||'', p.type||'game']);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  }
  return { success: true };
}

// ============================================================
// SCORES
// ============================================================

function getScores(ss, week) {
  const sheet = getOrCreateSheet(ss, 'scores', ['week', 'round', 'court', 'p1', 'p2', 'score1', 'p3', 'p4', 'score2']);
  const data = sheet.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && (week === undefined || String(data[i][0]) === String(week))) {
      scores.push({
        week: data[i][0], round: data[i][1], court: data[i][2],
        p1: data[i][3], p2: data[i][4], score1: data[i][5],
        p3: data[i][6], p4: data[i][7], score2: data[i][8]
      });
    }
  }
  return { scores };
}

function saveScores(ss, week, scores) {
  const sheet = getOrCreateSheet(ss, 'scores', ['week', 'round', 'court', 'p1', 'p2', 'score1', 'p3', 'p4', 'score2']);
  const data = sheet.getDataRange().getValues();
  const toDelete = [];
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(week)) toDelete.push(i + 1);
  }
  toDelete.forEach(r => sheet.deleteRow(r));
  if (scores.length > 0) {
    const rows = scores.map(s => [week, s.round, s.court, s.p1||'', s.p2||'', s.score1??'', s.p3||'', s.p4||'', s.score2??'']);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  }
  return { success: true };
}

// ============================================================
// STANDINGS (calculated server-side)
// ============================================================

function getStandings(ss, week) {
  const { scores }   = getScores(ss);
  const { players }  = getPlayers(ss);
  const { pairings } = getPairings(ss);
  const { config }   = getConfig(ss);
  const maxWeek = week ? parseInt(week) : parseInt(config.weeks || 8);

  const stats = {};
  players.forEach(p => {
    stats[p.name] = { name: p.name, wins: 0, losses: 0, points: 0, pointsAgainst: 0, games: 0, byes: 0 };
  });

  scores.forEach(s => {
    if (parseInt(s.week) > maxWeek || !s.p1 || !s.p3) return;
    const score1 = parseInt(s.score1) || 0;
    const score2 = parseInt(s.score2) || 0;
    const team1 = [s.p1, s.p2].filter(Boolean);
    const team2 = [s.p3, s.p4].filter(Boolean);
    const t1win = score1 > score2;
    team1.forEach(p => {
      if (!stats[p]) stats[p] = { name: p, wins: 0, losses: 0, points: 0, pointsAgainst: 0, games: 0, byes: 0 };
      stats[p].wins += t1win ? 1 : 0; stats[p].losses += t1win ? 0 : 1;
      stats[p].points += score1; stats[p].pointsAgainst += score2; stats[p].games++;
    });
    team2.forEach(p => {
      if (!stats[p]) stats[p] = { name: p, wins: 0, losses: 0, points: 0, pointsAgainst: 0, games: 0, byes: 0 };
      stats[p].wins += t1win ? 0 : 1; stats[p].losses += t1win ? 1 : 0;
      stats[p].points += score2; stats[p].pointsAgainst += score1; stats[p].games++;
    });
  });

  pairings.forEach(p => {
    if (p.type === 'bye' && parseInt(p.week) <= maxWeek) {
      [p.p1, p.p2, p.p3, p.p4].filter(Boolean).forEach(name => { if (stats[name]) stats[name].byes++; });
    }
  });

  const standings = Object.values(stats).map(s => {
    const total = s.wins + s.losses;
    return { ...s, winPct: total > 0 ? s.wins / total : 0, ptDiff: s.points - s.pointsAgainst };
  });
  standings.sort((a, b) => Math.abs(b.winPct - a.winPct) > 0.0001 ? b.winPct - a.winPct : b.ptDiff - a.ptDiff);
  standings.forEach((s, i) => { s.rank = i + 1; });
  return { standings };
}

function getPlayerReport(ss, playerName) {
  const { scores }   = getScores(ss);
  const { standings } = getStandings(ss);
  const games = [];

  scores.forEach(s => {
    if (!s.p1) return;
    const team1 = [s.p1, s.p2].filter(Boolean);
    const team2 = [s.p3, s.p4].filter(Boolean);
    let partner = '', opponents = [], myScore = 0, oppScore = 0, won = false, inGame = false;
    if (team1.includes(playerName)) {
      inGame = true; partner = team1.find(p => p !== playerName) || '';
      opponents = team2; myScore = parseInt(s.score1)||0; oppScore = parseInt(s.score2)||0; won = myScore > oppScore;
    } else if (team2.includes(playerName)) {
      inGame = true; partner = team2.find(p => p !== playerName) || '';
      opponents = team1; myScore = parseInt(s.score2)||0; oppScore = parseInt(s.score1)||0; won = myScore > oppScore;
    }
    if (inGame) games.push({ week: s.week, round: s.round, court: s.court, partner, opponents, myScore, oppScore, won });
  });

  games.sort((a, b) => (parseInt(a.week) * 100 + parseInt(a.round)) - (parseInt(b.week) * 100 + parseInt(b.round)));
  return { player: playerName, games, standing: standings.find(s => s.name === playerName) || null };
}

// ============================================================
// ALL DATA (initial load for a league)
// ============================================================

function getAllData(ss) {
  return {
    config:     getConfig(ss).config,
    players:    getPlayers(ss).players,
    attendance: getAttendance(ss).attendance,
    pairings:   getPairings(ss).pairings,
    scores:     getScores(ss).scores,
    standings:  getStandings(ss).standings
  };
}
