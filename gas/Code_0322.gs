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
const MASTER_SHEET_ID = '1VPWAWqN1376ewwWUz7laZ8e-_oKbFA2cjv3p0yTvGZ4';
// for Beta project:
// const MASTER_SHEET_ID = '1PQ02DkjJP0qPCN_s36lxIVaNR58_-7sR1iTX3-J8Whs';

// ── Registry helpers ─────────────────────────────────────────

function getMasterSheet() {
  return SpreadsheetApp.openById(MASTER_SHEET_ID);
}

function getRegistrySheet() {
  const ss = getMasterSheet();
  let sheet = ss.getSheetByName('leagues');
  if (!sheet) {
    sheet = ss.insertSheet('leagues');
    sheet.getRange(1, 1, 1, 13).setValues([['leagueId', 'name', 'sheetId', 'active', 'canCreateLeagues', 'hidden', 'createdDate', 'expiryDays', 'maxPlayers', 'maxCourts', 'maxRounds', 'maxSessions', 'customerId']]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sheet;
}

function submitApplication(body) {
  const { name, email, leagueType, location, playerCount, sessionCount } = body;
  if (!name || !email) return { success: false, error: 'Name and email are required.' };

  const DEV_EMAIL = 'dougjt@yahoo.com';
  const subject = `PB League Manager — New Application from ${name}`;
  const html = `<div style="font-family:sans-serif; max-width:560px; color:#222;">
    <h2 style="color:#2d7a3a; margin-bottom:4px;">New League Application</h2>
    <hr style="border:none; border-top:1px solid #ddd; margin:12px 0;">
    <table style="width:100%; font-size:0.95rem; border-collapse:collapse;">
      <tr><td style="padding:6px 12px 6px 0; color:#666; width:180px; vertical-align:top;">Name</td>
          <td style="padding:6px 0; font-weight:600;">${name}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px 6px 0; color:#666; vertical-align:top;">Email</td>
          <td style="padding:6px 0;">${email}</td></tr>
      <tr><td style="padding:6px 12px 6px 0; color:#666; vertical-align:top;">League Type</td>
          <td style="padding:6px 0;">${leagueType || '—'}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px 6px 0; color:#666; vertical-align:top;">Location / Venue</td>
          <td style="padding:6px 0;">${location || '—'}</td></tr>
      <tr><td style="padding:6px 12px 6px 0; color:#666; vertical-align:top;">Approx. Players</td>
          <td style="padding:6px 0;">${playerCount || '—'}</td></tr>
      <tr style="background:#f9f9f9;"><td style="padding:6px 12px 6px 0; color:#666; vertical-align:top;">Approx. Sessions</td>
          <td style="padding:6px 0;">${sessionCount || '—'}</td></tr>
    </table>
    <hr style="border:none; border-top:1px solid #ddd; margin:16px 0 10px;">
    <p style="font-size:0.8em; color:#aaa;">Sent from Pickleball League Manager application form</p>
  </div>`;

  try {
    GmailApp.sendEmail(DEV_EMAIL, subject, '', {
      htmlBody: html,
      replyTo: email,
      name: 'PB League Manager'
    });
  } catch(e) {
    return { success: false, error: 'Failed to send: ' + e.toString() };
  }

  // Send confirmation to applicant
  try {
    const confirmHtml = `<div style="font-family:sans-serif; max-width:500px; color:#222;">
      <h2 style="color:#2d7a3a;">Thanks for your interest, ${name}!</h2>
      <p>Your application to use Pickleball League Manager has been received.</p>
      <p>Due to limited hosting bandwidth, the number of organizations that can be supported
         is restricted. I'll review your application and get back to you soon.</p>
      <p style="margin-top:20px;">— Doug Tucker</p>
      <p style="font-size:0.8em; color:#aaa;">dougjt@yahoo.com</p>
    </div>`;
    GmailApp.sendEmail(email, 'Your Pickleball League Manager application', '', {
      htmlBody: confirmHtml,
      name: 'Doug Tucker — PB League Manager'
    });
  } catch(e) { /* confirmation email failure is non-critical */ }

  return { success: true };
}

// Returns all leagues from the registry
function getLeagueList(includeHidden) {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  const leagues = [];
  const boolFalse = v => v === false || String(v).toUpperCase() === 'FALSE';
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0] || boolFalse(data[i][3])) continue; // skip blank/inactive
    const hidden = boolFalse(data[i][5]) ? false : (data[i][5] === true || String(data[i][5]).toUpperCase() === 'TRUE');
    if (hidden && !includeHidden) continue; // skip hidden unless requested
    const intOrNull = v => (v !== '' && v !== null && !isNaN(parseInt(v))) ? parseInt(v) : null;
    leagues.push({
      leagueId:         String(data[i][0]),
      name:             String(data[i][1]),
      sheetId:          String(data[i][2]),
      active:           !boolFalse(data[i][3]),
      canCreateLeagues: !boolFalse(data[i][4]),
      hidden:           hidden,
      createdDate:      data[i][6] ? String(data[i][6]) : null,
      expiryDays:       intOrNull(data[i][7]),
      maxPlayers:       intOrNull(data[i][8]),
      maxCourts:        intOrNull(data[i][9]),
      maxRounds:        intOrNull(data[i][10]),
      maxSessions:      intOrNull(data[i][11]),
      customerId:       data[i][12] ? String(data[i][12]).trim() : null,
    });
  }
  return leagues;
}

// Resolve a leagueId → Google Sheet for that league's data
function getLeagueSpreadsheet(leagueId) {
  const leagues = getLeagueList(true); // include hidden — routing must work for all leagues
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
  } else if (headers) {
    // Add any missing columns to existing sheet
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach((h, i) => {
      if (!existingHeaders.includes(h)) {
        const col = sheet.getLastColumn() + 1;
        sheet.getRange(1, col).setValue(h);
        sheet.getRange(1, col).setFontWeight('bold');
      }
    });
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
    if (action === 'getLeagues') {
      const includeHidden = e.parameter.includeHidden === 'true' || !!e.parameter.leagueId;
      const customerId = e.parameter.customerId || null;
      let leagues = getLeagueList(includeHidden);
      // Filter by customerId:
      // - If ?id= supplied: show leagues matching that ID or with no ID (backward compat)
      // - If no ?id= supplied: show only leagues with no ID assigned
      if (customerId) {
        leagues = leagues.filter(l => !l.customerId || l.customerId === customerId);
      } else {
        leagues = leagues.filter(l => !l.customerId);
      }
      result = { leagues };
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
        case 'getAllData':       result = getAllData(ss, e.parameter.sinceWeek ? parseInt(e.parameter.sinceWeek) : undefined); break;
        case 'getEarlyData':        result = getEarlyData(ss); break;
        case 'getLeagueAndPlayers':  result = getLeagueAndPlayers(e.parameter.leagueId, e.parameter.customerId || null); break;
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
    if (action === 'submitApplication') {
      result = submitApplication(body);
    } else if (action === 'addLeague') {
      result = addLeague(body.leagueId, body.name, body.sheetId, body.sourceLeagueId, body.copyConfig, body.copyPlayers, body.canCreateLeagues, body.hidden, body.customerId);
    } else if (action === 'updateLeague') {
      result = updateLeague(body.leagueId, body.name, body.sheetId, body.active, body.canCreateLeagues, body.hidden, body.callerLeagueId, body.limits);
    } else {
      const leagueId = body.leagueId;
      if (!leagueId) throw new Error('leagueId is required');
      const ss = getLeagueSpreadsheet(leagueId);
      switch (action) {
        case 'validatePIN':          result = validatePIN(ss, body.name, body.pin); break;
        case 'validateAdminPassword':  result = validateAdminPassword(ss, body.password); break;
        case 'validateAppManager':     result = validateAppManager(body.password); break;
        case 'saveConfig':    result = saveConfig(ss, body.config); break;
        case 'savePlayers':   result = savePlayers(ss, body.players); break;
        case 'setAttendance': result = setAttendance(ss, body.player, body.week, body.status); break;
        case 'savePairings':  result = savePairings(ss, body.week, body.pairings); break;
        case 'saveScores':    result = saveScores(ss, body.week, body.scores); break;
        case 'sendWeeklyReport':   result = sendWeeklyReport(ss, body); break;
        case 'sendLeagueMessage':      result = sendLeagueMessage(ss, body); break;
        case 'sendTournamentReport':    result = sendTournamentReport(ss, body); break;
        case 'sendPlayerReport':    result = sendPlayerReport(ss, body); break;
        case 'changePin':     result = changePin(ss, body.name, body.currentPin, body.newPin); break;
        case 'emailPin':         result = emailPin(ss, body.name); break;
        case 'registerPlayer':     result = registerPlayer(ss, body); break;
        case 'approvePlayer':      result = approvePlayer(ss, body); break;
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

function addLeague(leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId) {
  if (!leagueId || !name) throw new Error('leagueId and name are required');

  let createdSheetUrl = null;

  // Auto-create a new Google Sheet if no sheetId provided
  if (!sheetId) {
    try {
      const newSS = SpreadsheetApp.create(name + ' — League Data');
      sheetId = newSS.getId();
      createdSheetUrl = newSS.getUrl();
    } catch (err) {
      throw new Error('Failed to create Google Sheet: ' + err.toString());
    }
  }

  // Check for duplicate
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(leagueId)) throw new Error('League ID already exists: ' + leagueId);
  }

  // Register the new league — write each column explicitly so sheet width doesn't matter
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1).setValue(leagueId);
  sheet.getRange(newRow, 2).setValue(name);
  sheet.getRange(newRow, 3).setValue(sheetId);
  sheet.getRange(newRow, 4).setValue(true);
  sheet.getRange(newRow, 5).setValue(canCreateLeagues === true);
  sheet.getRange(newRow, 6).setValue(hidden === true);
  sheet.getRange(newRow, 7).setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')); // createdDate
  // cols 8-12 (expiryDays, maxPlayers, maxCourts, maxRounds, maxSessions) left blank = no limit
  if (customerId) sheet.getRange(newRow, 13).setValue(String(customerId).trim()); // customerId
  SpreadsheetApp.flush();

  const copyWarnings = [];

  if (sourceLeagueId) {
    try {
      const sourceSS = getLeagueSpreadsheet(sourceLeagueId);
      const newSS    = SpreadsheetApp.openById(sheetId);

      // Pre-create sheets so writes don't fail on blank spreadsheets
      getOrCreateSheet(newSS, 'config',  ['key', 'value']);
      getOrCreateSheet(newSS, 'players', ['name', 'pin', 'group', 'active', 'email', 'notify']);

      const { config  } = getConfig(sourceSS);
      const { players } = getPlayers(sourceSS);

      // ── Copy configuration ──────────────────────────────
      // Always copy adminPin so admin login works on the new league.
      // If copyConfig is true, copy all other settings too but reset
      // the league name to the new display name so it shows correctly.
      if (copyConfig) {
        // Copy all config keys, override leagueName with the new league's name
        const newConfig = Object.assign({}, config, { leagueName: name });
        delete newConfig.canCreateLeagues;
        saveConfig(newSS, newConfig);
      } else {
        // Minimal copy: just adminPin so admin can log in
        if (config.adminPin !== undefined) {
          saveConfig(newSS, { adminPin: config.adminPin });
        } else {
          copyWarnings.push('adminPin not found in source config');
        }
      }

      // ── Copy players ────────────────────────────────────
      if (copyPlayers) {
        // Copy all active players — reset attendance-related state
        // but keep name, pin, group, email, notify, active
        if (players.length > 0) {
          savePlayers(newSS, players);
        } else {
          copyWarnings.push('No players found in source league');
        }
      } else {
        // Always copy Admin player so admin login works
        const adminPlayer = players.find(p => p.name === 'Admin');
        if (adminPlayer) {
          savePlayers(newSS, [adminPlayer]);
        } else {
          copyWarnings.push('Admin player not found in source league');
        }
      }

    } catch (err) {
      copyWarnings.push('Copy failed: ' + err.toString());
      Logger.log('addLeague copy error: ' + err.toString());
    }
  }

  // If the sheet was auto-created, store its URL in the new league's config
  if (createdSheetUrl) {
    try {
      const newSS2 = SpreadsheetApp.openById(sheetId);
      const existingConfig = getConfig(newSS2).config;
      existingConfig.leagueUrl = 'https://pb-league.github.io/league/index.html?league=' + leagueId;
      saveConfig(newSS2, existingConfig);
    } catch (err) {
      copyWarnings.push('Could not save sheet URL to config: ' + err.toString());
    }
  }

  const appUrl = createdSheetUrl ? 'https://pb-league.github.io/league/index.html?league=' + leagueId : null;
  return { success: true, warnings: copyWarnings, sheetUrl: appUrl, sheetId };
}

function updateLeague(leagueId, name, sheetId, active, canCreateLeagues, hidden, callerLeagueId, limits) {
  const sheet = getRegistrySheet();
  const data = sheet.getDataRange().getValues();

  // If trying to change canCreateLeagues, verify the calling league is permitted to do so
  if (canCreateLeagues !== undefined && callerLeagueId) {
    const leagues = getLeagueList(true); // include hidden
    const caller = leagues.find(l => l.leagueId === callerLeagueId);
    if (caller && !caller.canCreateLeagues) {
      throw new Error('Your league does not have permission to change league creation settings.');
    }
  }

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(leagueId)) {
      if (name              !== undefined) sheet.getRange(i + 1, 2).setValue(name);
      if (sheetId           !== undefined) sheet.getRange(i + 1, 3).setValue(sheetId);
      if (active            !== undefined) sheet.getRange(i + 1, 4).setValue(active);
      if (canCreateLeagues  !== undefined) sheet.getRange(i + 1, 5).setValue(canCreateLeagues === true || canCreateLeagues === 'true');
      if (hidden !== undefined) sheet.getRange(i + 1, 6).setValue(hidden === true || hidden === 'true');
      // Limits — only written when supplied (manager-only, enforced caller-side)
      if (limits) {
        if (limits.expiryDays  !== undefined) sheet.getRange(i + 1, 8).setValue(limits.expiryDays  === null ? '' : parseInt(limits.expiryDays));
        if (limits.maxPlayers  !== undefined) sheet.getRange(i + 1, 9).setValue(limits.maxPlayers  === null ? '' : parseInt(limits.maxPlayers));
        if (limits.maxCourts   !== undefined) sheet.getRange(i + 1, 10).setValue(limits.maxCourts  === null ? '' : parseInt(limits.maxCourts));
        if (limits.maxRounds   !== undefined) sheet.getRange(i + 1, 11).setValue(limits.maxRounds  === null ? '' : parseInt(limits.maxRounds));
        if (limits.maxSessions !== undefined) sheet.getRange(i + 1, 12).setValue(limits.maxSessions=== null ? '' : parseInt(limits.maxSessions));
        if (limits.customerId  !== undefined) sheet.getRange(i + 1, 13).setValue(limits.customerId === null ? '' : String(limits.customerId).trim());
      }
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
  if (rows.length > 0) {
    // Format entire value column as plain text BEFORE writing values.
    // This prevents Sheets from misinterpreting numeric config values
    // (e.g. wRankBalance = 15 → read as a date, adminPin = 0000 → stripped to 0).
    sheet.getRange(2, 2, rows.length, 1).setNumberFormat('@STRING@');

    // Write all values as strings so the plain-text format is respected
    const stringRows = rows.map(([k, v]) => [k, String(v)]);
    sheet.getRange(2, 1, stringRows.length, 2).setValues(stringRows);
  }
  return { success: true };
}

// ============================================================
// PLAYERS
// ============================================================

function getPlayers(ss) {
  const sheet = getOrCreateSheet(ss, 'players', ['name', 'pin', 'group', 'active', 'email', 'notify', 'canScore', 'initialRank', 'role']);
  const data = sheet.getDataRange().getValues();
  if (data.length < 1) return { players: [] };

  // Read by header name so column order does not matter
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const col = h => headers.indexOf(h);

  const players = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][col('name')]) continue;
    const boolVal = (v) => v === true || String(v).toUpperCase() === 'TRUE';
    players.push({
      name:     data[i][col('name')],
      pin:      String(data[i][col('pin')] || ''),
      group:    data[i][col('group')] || 'M',
      active:   col('active') >= 0 ? (String(data[i][col('active')]).toLowerCase() === 'pend' ? 'pend' : data[i][col('active')] !== false) : true,
      email:    col('email')    >= 0 ? String(data[i][col('email')]    || '') : '',
      notify:   col('notify')   >= 0 ? boolVal(data[i][col('notify')])   : false,
      canScore:    col('canscore')    >= 0 ? boolVal(data[i][col('canscore')]) : false,
      initialRank: col('initialrank') >= 0 && data[i][col('initialrank')] ? parseInt(data[i][col('initialrank')]) : null,
      role:        col('role')        >= 0 && data[i][col('role')] ? String(data[i][col('role')]).toLowerCase() : null,
    });
  }
  return { players };
}

function savePlayers(ss, players) {
  const sheet = getOrCreateSheet(ss, 'players', ['name', 'pin', 'group', 'active', 'email', 'notify', 'canScore', 'initialRank', 'role']);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 9).setValues([['name', 'pin', 'group', 'active', 'email', 'notify', 'canScore', 'initialRank', 'role']]);
  sheet.getRange(1, 1, 1, 9).setFontWeight('bold');

  if (players.length > 0) {
    // Format entire PIN column (col 2) as plain text first so leading zeros are preserved
    const pinColRange = sheet.getRange(2, 2, players.length, 1);
    pinColRange.setNumberFormat('@STRING@');

    const rows = players.map(p => [
      p.name, String(p.pin || ''), p.group || 'M', p.active === 'pend' ? 'pend' : p.active !== false,
      p.email || '', p.notify === true || p.notify === 'true',
      p.canScore === true || p.canScore === 'true',
      p.initialRank || '',
      p.role || ''
    ]);
    sheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  return { success: true };
}

function validatePIN(ss, name, pin) {
  const { players } = getPlayers(ss);
  const player = players.find(p => p.name === name);
  if (!player) return { valid: false, reason: 'Player not found' };
  if (String(player.pin) === String(pin)) {
    // Role from player record: manager > admin > assistant > scorer > player
    const role = player.role || (player.canScore ? 'scorer' : 'player');
    const isAdmin = (role === 'admin' || role === 'manager');
    return { valid: true, name: player.name, role, isAdmin, canScore: role === 'scorer' || isAdmin || role === 'assistant' };
  }
  return { valid: false, reason: 'Incorrect PIN' };
}

// Separate admin password login — checks config adminPin, not player PINs
function validateAdminPassword(ss, password) {
  if (!password) return { valid: false, reason: 'Password required' };
  const config = getConfig(ss).config;
  const adminPw = String(config.adminPin || '');
  if (!adminPw) return { valid: false, reason: 'No admin password configured' };
  if (String(password) === adminPw) {
    return { valid: true, name: 'Admin', role: 'admin', isAdmin: true, canScore: true };
  }
  return { valid: false, reason: 'Incorrect admin password' };
}

// App manager login — checks GAS Script Properties
function validateAppManager(password) {
  if (!password) return { valid: false, reason: 'Password required' };
  try {
    const stored = PropertiesService.getScriptProperties().getProperty('APP_MANAGER_PASSWORD');
    if (!stored) return { valid: false, reason: 'App manager not configured' };
    if (String(password) === String(stored)) {
      return { valid: true, name: 'App Manager', role: 'manager', isAdmin: true, canScore: true };
    }
  } catch (e) { Logger.log('validateAppManager error: ' + e); }
  return { valid: false, reason: 'Incorrect password' };
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
    // Skip games where scores have not been entered
    if (s.score1 === '' || s.score1 === null || s.score1 === undefined ||
        s.score2 === '' || s.score2 === null || s.score2 === undefined) return;
    const score1 = parseInt(s.score1);
    const score2 = parseInt(s.score2);
    if (isNaN(score1) || isNaN(score2)) return;
    const team1 = [s.p1, s.p2].filter(Boolean);
    const team2 = [s.p3, s.p4].filter(Boolean);
    const t1win = score1 > score2;
    team1.forEach(p => {
      if (!stats[p]) return; // not a registered league player — skip
      stats[p].wins += t1win ? 1 : 0; stats[p].losses += t1win ? 0 : 1;
      stats[p].points += score1; stats[p].pointsAgainst += score2; stats[p].games++;
    });
    team2.forEach(p => {
      if (!stats[p]) return; // not a registered league player — skip
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
    const ptDiff = s.points - s.pointsAgainst;
    const ptsPct = (s.points + s.pointsAgainst) > 0 ? s.points / (s.points + s.pointsAgainst) : 0;
    return { ...s, winPct: total > 0 ? s.wins / total : 0, ptDiff, avgPtDiff: s.games > 0 ? ptDiff / s.games : 0, ptsPct };
  });
  const rankingMethod = config.rankingMethod || 'avgptdiff';
  standings.sort((a, b) => {
    if (Math.abs(b.winPct - a.winPct) > 0.0001) return b.winPct - a.winPct;
    if (rankingMethod === 'ptspct') return b.ptsPct - a.ptsPct;
    return b.avgPtDiff - a.avgPtDiff;
  });
  standings.forEach((s, i) => { s.rank = i + 1; });
  return { standings };
}

function getPlayerReport(ss, playerName) {
  const { scores }    = getScores(ss);
  const { standings } = getStandings(ss);
  const games = [];

  scores.forEach(s => {
    if (!s.p1) return;
    // Skip unscored games
    if (s.score1 === '' || s.score1 === null || s.score1 === undefined ||
        s.score2 === '' || s.score2 === null || s.score2 === undefined) return;
    if (isNaN(parseInt(s.score1)) || isNaN(parseInt(s.score2))) return;
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
// PIN MANAGEMENT
// ============================================================

function changePin(ss, name, currentPin, newPin) {
  if (!name || !currentPin || !newPin) throw new Error('name, currentPin and newPin are required');
  if (String(newPin).length < 1) throw new Error('New PIN cannot be empty');

  const { players } = getPlayers(ss);
  const player = players.find(p => p.name === name);
  if (!player) return { success: false, reason: 'Player not found' };
  if (String(player.pin) !== String(currentPin)) return { success: false, reason: 'Current PIN is incorrect' };

  // Update PIN in the players list and save
  const updated = players.map(p => p.name === name ? { ...p, pin: String(newPin) } : p);
  savePlayers(ss, updated);
  return { success: true };
}

function emailPin(ss, name) {
  if (!name) throw new Error('name is required');

  const { players } = getPlayers(ss);
  const player = players.find(p => p.name === name);
  if (!player) return { success: false, reason: 'Player not found' };
  if (!player.email) return { success: false, noEmail: true, reason: 'No email address on file' };

  const { config } = getConfig(ss);
  const leagueName = config.leagueName || 'Pickleball League';
  const replyTo    = config.replyTo    || '';

  const subject = `${leagueName} — Your PIN`;
  const html = `
    <div style="font-family:sans-serif; max-width:480px; margin:0 auto; color:#222;">
      <h2 style="color:#2d7a3a;">${leagueName}</h2>
      <p>Hi ${player.name},</p>
      <p>Your PIN is: <strong style="font-size:1.4em; letter-spacing:0.15em;">${player.pin}</strong></p>
      <p style="color:#888; font-size:0.85em;">
        If you didn't request this, you can ignore this email.
        Contact your league manager if you need help.
      </p>
    </div>`;

  try {
    const mailOpts = { htmlBody: html, name: leagueName };
    if (replyTo) mailOpts.replyTo = replyTo;
    GmailApp.sendEmail(player.email, subject, '', mailOpts);
    return { success: true };
  } catch (e) {
    return { success: false, reason: 'Email failed: ' + e.toString() };
  }
}

// ============================================================
// WEEKLY EMAIL REPORT
// ============================================================

function sendPlayerReport(ss, body) {
  const { playerName, email, report, leagueName, replyTo } = body;
  if (!email) return { success: false, error: 'No email address' };

  const subject = `${leagueName} — Player Report: ${playerName}`;

  const s = report.standing;
  let html = `<div style="font-family:sans-serif; max-width:600px; margin:0 auto; color:#222;">
    <h2 style="color:#2d7a3a;">${leagueName}</h2>
    <h3>${playerName} — Player Report</h3>`;

  if (s) {
    html += `<p style="font-size:0.9em;">
      Rank: <strong>#${s.rank}</strong> &nbsp;·&nbsp;
      Record: <strong>${s.wins}/${s.losses}</strong> &nbsp;·&nbsp;
      Win%: <strong>${(s.winPct * 100).toFixed(1)}%</strong> &nbsp;·&nbsp;
      Avg+/-: <strong>${s.avgPtDiff > 0 ? '+' : ''}${(s.avgPtDiff || 0).toFixed(1)}</strong>
    </p>`;
  }

  // Opponent frequency
  if (report.oppFreq && Object.keys(report.oppFreq).length) {
    html += `<h4 style="color:#2d7a3a;">Times Faced as Opponent</h4>
      <table style="border-collapse:collapse; font-size:0.88em; width:100%;">
      <thead><tr style="background:#f0f0f0;"><th style="padding:4px 12px 4px 0; text-align:left;">Player</th><th style="padding:4px 8px; text-align:left;">Games</th></tr></thead><tbody>`;
    Object.entries(report.oppFreq).sort((a,b)=>b[1]-a[1]).forEach(([name,count]) => {
      html += `<tr><td style="padding:3px 12px 3px 0;">${name}</td><td style="padding:3px 8px;">${count}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Partner frequency
  if (report.partnerFreq && Object.keys(report.partnerFreq).length) {
    html += `<h4 style="color:#2d7a3a; margin-top:16px;">Times as Partner</h4>
      <table style="border-collapse:collapse; font-size:0.88em; width:100%;">
      <thead><tr style="background:#f0f0f0;"><th style="padding:4px 12px 4px 0; text-align:left;">Player</th><th style="padding:4px 8px; text-align:left;">Games</th></tr></thead><tbody>`;
    Object.entries(report.partnerFreq).sort((a,b)=>b[1]-a[1]).forEach(([name,count]) => {
      html += `<tr><td style="padding:3px 12px 3px 0;">${name}</td><td style="padding:3px 8px;">${count}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Game log
  if (report.games && report.games.length) {
    html += `<h4 style="color:#2d7a3a; margin-top:16px;">Game Log</h4>
      <table style="border-collapse:collapse; font-size:0.85em; width:100%;">
      <thead><tr style="background:#f0f0f0;">
        <th style="padding:4px 8px;">Wk</th><th style="padding:4px 8px;">Rd</th>
        <th style="padding:4px 8px;">Partner</th><th style="padding:4px 8px;">Opponents</th>
        <th style="padding:4px 8px;">Score</th><th style="padding:4px 8px;">Result</th>
      </tr></thead><tbody>`;
    report.games.forEach(g => {
      const result = g.won ? `<span style="color:#2d7a3a;font-weight:bold;">W</span>`
                           : `<span style="color:#cc0000;font-weight:bold;">L</span>`;
      html += `<tr>
        <td style="padding:3px 8px;">${g.week}</td>
        <td style="padding:3px 8px;">${g.round}</td>
        <td style="padding:3px 8px;">${g.partner || '—'}</td>
        <td style="padding:3px 8px;">${(g.opponents||[]).join(' & ')}</td>
        <td style="padding:3px 8px;font-weight:bold;">${g.myScore}—${g.oppScore}</td>
        <td style="padding:3px 8px;">${result}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  html += `<p style="font-size:0.8em;color:#aaa;margin-top:24px;">Sent by ${leagueName} League Manager</p></div>`;

  try {
    const opts = { htmlBody: html, name: leagueName };
    if (replyTo) opts.replyTo = replyTo;
    GmailApp.sendEmail(email, subject, '', opts);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function sendLeagueMessage(ss, body) {
  const { subject, body: msgBody, leagueInfo, replyTo, recipients } = body;

  if (!recipients || !recipients.length) return { success: false, error: 'No recipients' };
  if (!subject || !msgBody) return { success: false, error: 'Subject and message are required' };

  const leagueName = leagueInfo.leagueName || getConfig(ss).config.leagueName || 'Pickleball League';

  let html = `<div style="font-family:sans-serif; max-width:600px; margin:0 auto; color:#222;">`;

  // League info header
  if (leagueInfo.leagueName || leagueInfo.location || leagueInfo.sessionTime) {
    html += `<h2 style="color:#2d7a3a;">${leagueInfo.leagueName || leagueName}</h2>`;
    if (leagueInfo.location || leagueInfo.sessionTime) {
      html += `<p style="color:#666; font-size:0.9em;">`;
      if (leagueInfo.location)    html += `<strong>Location:</strong> ${leagueInfo.location}&nbsp;&nbsp;&nbsp;`;
      if (leagueInfo.sessionTime) html += `<strong>Time:</strong> ${leagueInfo.sessionTime}`;
      html += `</p>`;
    }
  }

  // Message body — preserve line breaks
  html += `<div style="margin:16px 0; line-height:1.7; white-space:pre-wrap;">${msgBody}</div>`;

  // Session dates
  if (leagueInfo.dates && leagueInfo.dates.length) {
    html += `<h3 style="color:#2d7a3a; margin-top:20px;">Session Dates</h3>`;
    html += `<table style="border-collapse:collapse; font-size:0.9em;">`;
    leagueInfo.dates.forEach(d => {
      const dateParts = d.date ? (() => { try { const p=d.date.split('-'); return `${parseInt(p[1])}/${parseInt(p[2])}`; } catch(e){return d.date;} })() : '';
      const timeParts = d.time ? (() => { try { const [h,m]=d.time.split(':').map(Number); const ap=h>=12?'PM':'AM'; const h12=h%12||12; return m===0?`${h12}${ap}`:`${h12}:${String(m).padStart(2,'0')}${ap}`; } catch(e){return d.time;} })() : '';
      const label = [dateParts, timeParts].filter(Boolean).join(' ');
      html += `<tr>
        <td style="padding:3px 16px 3px 0; font-weight:bold;">Session ${d.week}</td>
        <td style="padding:3px 0;">${label}</td>
      </tr>`;
    });
    html += `</table>`;
  }

  // App link
  if (leagueInfo.leagueUrl) {
    html += `<p style="margin-top:20px; font-size:0.9em; line-height:1.7;">
      Follow this link to access league information, view standings, and set your availability:<br>
      <a href="${leagueInfo.leagueUrl}" style="color:#2d7a3a;">${leagueInfo.leagueUrl}</a>
    </p>`;
  }

  // Player list
  if (leagueInfo.players && leagueInfo.players.length) {
    html += `<h3 style="color:#2d7a3a; margin-top:20px;">League Players</h3>`;
    html += `<ul style="font-size:0.9em; line-height:1.8; margin:0; padding-left:20px;">`;
    leagueInfo.players.forEach(name => {
      html += `<li>${name}</li>`;
    });
    html += `</ul>`;
  }

  // Rules
  if (leagueInfo.rules) {
    html += `<h3 style="color:#2d7a3a; margin-top:20px;">League Rules</h3>`;
    html += `<div style="font-size:0.9em; line-height:1.7; white-space:pre-wrap;">${leagueInfo.rules}</div>`;
  }

  html += `<p style="font-size:0.8em; color:#aaa; margin-top:24px;">
    Sent by ${leagueName} League Manager
  </p></div>`;

  let sent = 0;
  const errors = [];
  recipients.forEach(r => {
    try {
      const opts = { htmlBody: html, name: leagueName };
      if (replyTo) opts.replyTo = replyTo;
      GmailApp.sendEmail(r.email, subject, '', opts);
      sent++;
    } catch (e) {
      errors.push(r.email + ': ' + e.toString());
    }
  });

  return { success: true, sent, errors };
}

function sendTournamentReport(ss, body) {
  const { week, weekDate, leagueName, weekPairings, weekScores, recipients, replyTo, leagueUrl } = body;

  if (!recipients || !recipients.length) return { success: false, error: 'No recipients' };

  const subject = `${leagueName} — Session ${week} Tournament Results${weekDate ? ' (' + weekDate + ')' : ''}`;

  // Build seed map from round 1 order (bye recipients = top seeds, then game teams).
  // Index every player individually so we can look up a seed from any team member.
  const seedMap = {}; // playerName -> seedNumber
  // Also track team pairs: { seed, p1, p2 } so teamStr can show the right seed
  const teamSeeds = []; // [{ seed, players: Set }]
  const r1 = (weekPairings || []).filter(p => parseInt(p.round) === 1);
  const r1byes  = r1.filter(p => p.type === 'bye').sort((a,b)=>String(a.court).localeCompare(String(b.court),undefined,{numeric:true}));
  const r1games = r1.filter(p => p.type === 'game' || p.type === 'tourn-game').sort((a,b)=>String(a.court).localeCompare(String(b.court),undefined,{numeric:true}));
  let seed = 1;
  function registerTeam(p1, p2) {
    if (!p1) return;
    const s = seed++;
    [p1, p2].filter(Boolean).forEach(n => { seedMap[n] = s; });
  }
  r1byes.forEach(b  => registerTeam(b.p1, b.p2));
  r1games.forEach(g => { registerTeam(g.p1, g.p2); registerTeam(g.p3, g.p4); });

  // Get seed number for a team — check p1 first, then p2 (partner may have moved to p1 slot)
  function getTeamSeed(p1, p2) {
    return seedMap[p1] || (p2 && seedMap[p2]) || 0;
  }
  function seedLabel(p1, p2) {
    const s = getTeamSeed(p1, p2);
    return s ? '#' + s + ' ' : '';
  }
  function teamStr(p1, p2) { return seedLabel(p1, p2) + (p2 ? p1 + ' & ' + p2 : p1); }

  const rounds = [...new Set((weekPairings||[]).map(g=>parseInt(g.round)))].sort((a,b)=>a-b);

  let html = `<div style="font-family:sans-serif; max-width:700px; margin:0 auto; color:#222;">
    <h2 style="color:#2d7a3a;">${leagueName}</h2>
    <h3>Session ${week} Tournament${weekDate ? ' — ' + weekDate : ''}</h3>`;

  // Bracket as rounds-side-by-side table
  rounds.forEach(r => {
    const games = (weekPairings||[]).filter(p => (p.type === 'game' || p.type === 'tourn-game') && parseInt(p.round) === r);
    const byes  = (weekPairings||[]).filter(p => p.type === 'bye' && parseInt(p.round) === r);

    html += `<p style="font-weight:bold; margin:16px 0 6px; color:#2d7a3a;">Round ${r}</p>`;

    if (games.length) {
      html += `<table style="width:100%; border-collapse:collapse; margin-bottom:8px;">`;
      games.forEach(game => {
        const sc = (weekScores||[]).find(s =>
          parseInt(s.week) === parseInt(week) && parseInt(s.round) === r && String(s.court) === String(game.court)
        );
        const s1 = sc && sc.score1 !== '' && sc.score1 !== null ? sc.score1 : '—';
        const s2 = sc && sc.score2 !== '' && sc.score2 !== null ? sc.score2 : '—';
        const scored = s1 !== '—' && s2 !== '—';
        const t1win  = scored && parseInt(s1) > parseInt(s2);
        const t1style = scored ? (t1win ? 'font-weight:bold; color:#2d7a3a;' : 'color:#999;') : '';
        const t2style = scored ? (!t1win ? 'font-weight:bold; color:#2d7a3a;' : 'color:#999;') : '';
        html += `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:6px 10px; ${t1style}">${teamStr(game.p1, game.p2)}</td>
          <td style="padding:6px 10px; text-align:center; font-weight:bold; white-space:nowrap;">${s1} — ${s2}</td>
          <td style="padding:6px 10px; text-align:right; ${t2style}">${teamStr(game.p3, game.p4)}</td>
        </tr>`;
      });
      html += `</table>`;
    }

    if (byes.length) {
      byes.forEach(b => {
        html += `<p style="font-size:0.9em; color:#888; margin:2px 0;">⏸ BYE: ${teamStr(b.p1, b.p2)}</p>`;
      });
    }
  });

  // Champion
  const lastRound = rounds[rounds.length - 1];
  const finalGames = (weekPairings||[]).filter(p => parseInt(p.round) === lastRound && (p.type === 'game' || p.type === 'tourn-game'));
  if (finalGames.length === 1) {
    const fg = finalGames[0];
    const fs = (weekScores||[]).find(s => parseInt(s.week) === parseInt(week) && parseInt(s.round) === lastRound && String(s.court) === String(fg.court));
    if (fs && fs.score1 !== '' && fs.score1 !== null && fs.score2 !== '' && fs.score2 !== null) {
      const t1win = parseInt(fs.score1) > parseInt(fs.score2);
      const cP1 = t1win ? fg.p1 : fg.p3, cP2 = t1win ? fg.p2 : fg.p4;
      html += `<div style="margin-top:20px; padding:14px 16px; background:#fffbea; border:2px solid #f5c842; border-radius:8px; text-align:center;">
        <div style="font-size:1.1em; font-weight:bold; color:#b8860b;">*** Tournament Champion ***</div>
        <div style="font-size:1.1em; font-weight:bold; margin-top:6px;">${teamStr(cP1, cP2)}</div>
        <div style="color:#888; margin-top:4px;">Final: ${fs.score1} – ${fs.score2}</div>
      </div>`;
    }
  }

  if (leagueUrl) {
    html += `<p style="margin-top:20px; font-size:0.9em; color:#444;">
      View full results: <a href="${leagueUrl}" style="color:#2d7a3a;">${leagueUrl}</a>
    </p>`;
  }

  html += `<p style="font-size:0.8em; color:#aaa; margin-top:24px;">Sent by ${leagueName} League Manager</p></div>`;

  let sent = 0; const errors = [];
  recipients.forEach(r => {
    try {
      const opts = { htmlBody: html, name: leagueName };
      if (replyTo) opts.replyTo = replyTo;
      GmailApp.sendEmail(r.email, subject, '', opts);
      sent++;
    } catch (e) { errors.push(r.email + ': ' + e.toString()); }
  });
  return { success: true, sent, errors };
}

function sendWeeklyReport(ss, body) {
  const {
    week, weekDate, leagueName, location, sessionTime, notes,
    weekScores, weekPairings, weekStandings, seasonStandings,
    recipients, courtNames
  } = body;

  if (!recipients || !recipients.length) {
    return { success: false, error: 'No recipients' };
  }

  const subject = `${leagueName} — Session ${week} Results${weekDate ? ' (' + weekDate + ')' : ''}`;

  // ── Build HTML email ──────────────────────────────────────
  let html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;">
    <h2 style="color:#2d7a3a;">${leagueName}</h2>`;

  if (location || sessionTime || notes) {
    html += `<p style="color:#666;font-size:0.9em;">`;
    if (location)    html += `<strong>Location:</strong> ${location}&nbsp;&nbsp;&nbsp;`;
    if (sessionTime) html += `<strong>Time:</strong> ${sessionTime}&nbsp;&nbsp;&nbsp;`;
    if (notes)       html += `<strong>Note:</strong> ${notes}`;
    html += `</p>`;
  }

  html += `<h3>Session ${week} Scores${weekDate ? ' — ' + weekDate : ''}</h3>`;

  // Group games by round
  const rounds = [...new Set((weekPairings || []).map(g => g.round))].sort((a,b)=>a-b);
  if (rounds.length) {
    rounds.forEach(r => {
      html += `<p style="font-weight:bold;margin-bottom:4px;">Round ${r}</p>`;
      html += `<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">`;
      const games = weekPairings.filter(g => g.round == r);
      games.forEach(game => {
        const cname = (courtNames && courtNames[game.court]) || ('Court ' + game.court);
        const sc = (weekScores || []).find(s =>
          parseInt(s.week) === parseInt(week) &&
          parseInt(s.round) === parseInt(game.round) &&
          String(s.court) === String(game.court)
        );
        const s1 = sc && (sc.score1 !== '' && sc.score1 !== null) ? sc.score1 : '—';
        const s2 = sc && (sc.score2 !== '' && sc.score2 !== null) ? sc.score2 : '—';
        const t1win = sc && parseInt(sc.score1) > parseInt(sc.score2);
        const t2win = sc && parseInt(sc.score2) > parseInt(sc.score1);
        html += `<tr>
          <td style="padding:4px 8px;font-size:0.85em;color:#888;">${cname}</td>
          <td style="padding:4px 8px;font-weight:${t1win?'bold':'normal'};">
            ${game.p1}${game.p2 ? ' &amp; ' + game.p2 : ''}
          </td>
          <td style="padding:4px 8px;text-align:center;font-weight:bold;">
            ${s1} — ${s2}
          </td>
          <td style="padding:4px 8px;font-weight:${t2win?'bold':'normal'};">
            ${game.p3}${game.p4 ? ' &amp; ' + game.p4 : ''}
          </td>
        </tr>`;
      });
      html += `</table>`;
    });
  } else {
    html += `<p style="color:#888;">No games recorded for this session.</p>`;
  }

  // Week standings
  html += `<h3>Session ${week} Standings</h3>`;
  html += buildStandingsTable(weekStandings);

  // Season standings
  html += `<h3>Season Standings</h3>`;
  html += buildStandingsTable(seasonStandings);

  if (body.leagueUrl) {
    html += `<p style="margin-top:20px; font-size:0.88em; color:#444;">
      To see more detailed results follow this link:
      <a href="${body.leagueUrl}" style="color:#2d7a3a;">${body.leagueUrl}</a>
    </p>`;
  }
  html += `<p style="font-size:0.8em;color:#aaa;margin-top:12px;">
    Sent by ${leagueName} League Manager · Reply to unsubscribe
  </p></div>`;

  // ── Send to each recipient ────────────────────────────────
  let sent = 0;
  const errors = [];
  recipients.forEach(r => {
    try {
      const mailOpts = { htmlBody: html, name: leagueName };
      if (body.replyTo) mailOpts.replyTo = body.replyTo;
      GmailApp.sendEmail(r.email, subject, '', mailOpts);
      sent++;
    } catch (e) {
      errors.push(r.email + ': ' + e.toString());
    }
  });

  return { success: true, sent, errors };
}

function buildStandingsTable(standings) {
  if (!standings || !standings.length) return '<p style="color:#888;">No data yet.</p>';
  const rows = standings.filter(s => s.games > 0).map(s =>
    `<tr>
      <td style="padding:4px 8px;text-align:center;">${s.rank}</td>
      <td style="padding:4px 8px;">${s.name}</td>
      <td style="padding:4px 8px;text-align:center;">${s.wins}/${s.losses}</td>
      <td style="padding:4px 8px;text-align:center;">${(s.winPct*100).toFixed(1)}%</td>
      <td style="padding:4px 8px;text-align:center;">${s.avgPtDiff > 0 ? '+' : ''}${(s.avgPtDiff||0).toFixed(1)}</td>
    </tr>`
  ).join('');
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <thead><tr style="background:#f0f0f0;">
      <th style="padding:6px 8px;">#</th>
      <th style="padding:6px 8px;">Player</th>
      <th style="padding:6px 8px;">W/L</th>
      <th style="padding:6px 8px;">Win%</th>
      <th style="padding:6px 8px;">Avg+/-</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ============================================================
// ALL DATA (initial load for a league)
// ============================================================

// Returns the league list AND players for a specific league in one round-trip.
// Used by the login page when a league slug is known (e.g. from URL param).
function getLeagueAndPlayers(leagueId, customerId) {
  let leagues = getLeagueList(false); // visible leagues only for login
  // Apply same customerId filter as getLeagues
  if (customerId) {
    leagues = leagues.filter(l => !l.customerId || l.customerId === customerId);
  } else {
    leagues = leagues.filter(l => !l.customerId);
  }
  let players = [];
  if (leagueId) {
    try {
      const ss = getLeagueSpreadsheet(leagueId);
      players = getPlayers(ss).players.filter(p => p.active === true);
    } catch (e) {
      // League not found in visible list — try including hidden
      try {
        const ss = getLeagueSpreadsheet(leagueId);
        players = getPlayers(ss).players.filter(p => p.active === true);
      } catch (e2) { /* ignore */ }
    }
  }
  return { leagues, players, leagueId };
}

// Warmup function — called by a time-based trigger every 5 minutes
// to keep the GAS script warm and avoid cold-start delays for players.
function warmup() {
  try {
    getLeagueList(false); // lightweight read to keep script alive
  } catch (e) {
    // ignore errors — this is best-effort
  }
}

function registerPlayer(ss, body) {
  const { playerName, email, notify, group, pin, inviteCode, role } = body;
  if (!playerName || !pin) return { success: false, error: 'Name and PIN are required.' };

  // Check registration is enabled
  const config = getConfig(ss).config;
  if (!config.allowRegistration) return { success: false, error: 'Registration is not enabled for this league.' };

  // Check invite code
  const expectedCode = (config.registrationCode || '').trim().toLowerCase();
  if (expectedCode && (inviteCode || '').trim().toLowerCase() !== expectedCode) {
    return { success: false, error: 'Invalid invite code.' };
  }

  const existing = getPlayers(ss).players;

  // Check max pending registrations
  const maxPending = parseInt(config.maxPendingReg) || 10;
  const pendingCount = existing.filter(p => p.active === false || p.active === 'pend').length;
  if (pendingCount >= maxPending) {
    return { success: false, error: 'Registration is temporarily full. Please contact the league admin.' };
  }

  // Check for duplicate name (case-insensitive)
  const dupe = existing.find(p => p.name.toLowerCase() === playerName.trim().toLowerCase());
  if (dupe) return { success: false, error: 'taken' };

  // Add player as inactive — admin must approve
  const allowedRoles = ['player', 'spectator'];
  const newPlayer = {
    name:        playerName.trim(),
    pin:         String(pin),
    group:       group || 'M',
    active:      'pend',
    email:       email || '',
    notify:      notify === true || notify === 'true',
    canScore:    false,
    initialRank: null,
    role:        allowedRoles.includes(role) ? role : 'player',
  };

  const allPlayers = [...existing, newPlayer];
  savePlayers(ss, allPlayers);

  // Notify admin via email if replyTo is configured
  const adminEmail = config.replyTo || '';
  if (adminEmail) {
    try {
      const leagueName = config.leagueName || 'Pickleball League';
      const subject = `${leagueName} — New player registration: ${newPlayer.name}`;
      const html = `<div style="font-family:sans-serif; max-width:500px; color:#222;">
        <h3 style="color:#2d7a3a;">${leagueName} — New Registration</h3>
        <p><strong>${newPlayer.name}</strong> has registered and is awaiting your approval.</p>
        <table style="font-size:0.9em; border-collapse:collapse;">
          <tr><td style="padding:3px 12px 3px 0; color:#666;">Email</td><td>${newPlayer.email || '—'}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#666;">Group</td><td>${newPlayer.group}</td></tr>
          <tr><td style="padding:3px 12px 3px 0; color:#666;">Notify</td><td>${newPlayer.notify ? 'Yes' : 'No'}</td></tr>
        </table>
        <p style="margin-top:16px; font-size:0.9em; color:#444;">
          Log in to the admin panel and go to Players to approve or reject this registration.
        </p>
        <p style="font-size:0.8em; color:#aaa; margin-top:20px;">
          Pending registrations: ${pendingCount + 1} of ${maxPending} max
        </p>
      </div>`;
      GmailApp.sendEmail(adminEmail, subject, '', { htmlBody: html, name: leagueName });
    } catch (e) {
      Logger.log('Registration notify failed: ' + e.toString());
    }
  }

  return { success: true };
}

function approvePlayer(ss, body) {
  const { playerName } = body;
  if (!playerName) return { success: false, error: 'playerName required' };

  const { players } = getPlayers(ss);
  const idx = players.findIndex(p => p.name === playerName);
  if (idx === -1) return { success: false, error: 'Player not found' };

  // Activate the player
  players[idx].active = true;
  savePlayers(ss, players);

  // Send approval email if player has an email address
  const player = players[idx];
  const config = getConfig(ss).config;
  const leagueUrl  = config.leagueUrl  || '';
  const leagueName = config.leagueName || 'Pickleball League';
  const replyTo    = config.replyTo    || '';

  if (player.email) {
    try {
      const subject = `${leagueName} — Your registration has been approved!`;
      const html = `<div style="font-family:sans-serif; max-width:500px; color:#222;">
        <h2 style="color:#2d7a3a;">${leagueName}</h2>
        <p>Hi ${player.name},</p>
        <p>Your registration has been <strong>approved</strong>! You can now log in to the league.</p>
        ${leagueUrl ? `<p style="margin-top:20px;">
          <a href="${leagueUrl}" style="background:#2d7a3a; color:#fff; padding:10px 24px;
             border-radius:8px; text-decoration:none; font-weight:600;">Log In Now</a>
        </p>
        <p style="font-size:0.85em; color:#666; margin-top:12px;">
          Or copy this link: <a href="${leagueUrl}" style="color:#2d7a3a;">${leagueUrl}</a>
        </p>` : ''}
        <p style="font-size:0.8em; color:#aaa; margin-top:24px;">Sent by ${leagueName} League Manager</p>
      </div>`;
      const opts = { htmlBody: html, name: leagueName };
      if (replyTo) opts.replyTo = replyTo;
      GmailApp.sendEmail(player.email, subject, '', opts);
    } catch (e) {
      Logger.log('approvePlayer email failed: ' + e.toString());
    }
  }

  return { success: true, emailSent: !!(player.email) };
}

function getEarlyData(ss) {
  // Fast subset: only what's needed to show the UI shell immediately.
  // Pairings, scores, and standings are loaded separately.
  return {
    config:     getConfig(ss).config,
    players:    getPlayers(ss).players,
    attendance: getAttendance(ss).attendance,
  };
}

function getAllData(ss, sinceWeek) {
  // If sinceWeek provided, only return pairings/scores for that week and later.
  // Config, players, attendance, and standings are always returned in full.
  const pairings = sinceWeek
    ? getPairingsFrom(ss, sinceWeek).pairings
    : getPairings(ss).pairings;
  const scores = sinceWeek
    ? getScoresFrom(ss, sinceWeek).scores
    : getScores(ss).scores;
  return {
    config:     getConfig(ss).config,
    players:    getPlayers(ss).players,
    attendance: getAttendance(ss).attendance,
    pairings,
    scores,
    standings:  getStandings(ss).standings,
    sinceWeek:  sinceWeek || null
  };
}

// Return pairings for week >= sinceWeek
function getPairingsFrom(ss, sinceWeek) {
  const sheet = getOrCreateSheet(ss, 'pairings', ['week', 'round', 'court', 'p1', 'p2', 'p3', 'p4', 'type']);
  const data = sheet.getDataRange().getValues();
  const pairings = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && parseInt(data[i][0]) >= parseInt(sinceWeek)) {
      pairings.push({
        week: data[i][0], round: data[i][1], court: data[i][2],
        p1: data[i][3], p2: data[i][4], p3: data[i][5], p4: data[i][6],
        type: data[i][7] || 'game'
      });
    }
  }
  return { pairings };
}

// Return scores for week >= sinceWeek
function getScoresFrom(ss, sinceWeek) {
  const sheet = getOrCreateSheet(ss, 'scores', ['week', 'round', 'court', 'p1', 'p2', 'score1', 'p3', 'p4', 'score2']);
  const data = sheet.getDataRange().getValues();
  const scores = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && parseInt(data[i][0]) >= parseInt(sinceWeek)) {
      scores.push({
        week: data[i][0], round: data[i][1], court: data[i][2],
        p1: data[i][3], p2: data[i][4], score1: data[i][5],
        p3: data[i][6], p4: data[i][7], score2: data[i][8]
      });
    }
  }
  return { scores };
}
