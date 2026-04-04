// ============================================================
// api.js — All communication with Google Apps Script backend
//
// MULTI-LEAGUE: Set GAS_URL once. Every request automatically
// includes the current leagueId from the active session.
// ============================================================

const API = (() => {
  // GAS_URL is defined in settings.js, loaded before this file.
  // Get the active leagueId from session (set at login)
  function leagueId() {
    try {
      const raw = sessionStorage.getItem('pb_session');
      return raw ? JSON.parse(raw).leagueId : null;
    } catch { return null; }
  }

  // Wrap fetch with a timeout using Promise.race — AbortController can silently
  // fail to cancel on file:// or when the browser blocks before the network layer.
  function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const fetchPromise = fetch(url, options);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out — check your internet connection.')), timeoutMs)
    );
    return Promise.race([fetchPromise, timeoutPromise]);
  }

  async function get(action, params = {}) {
    const url = new URL(GAS_URL);
    url.searchParams.set('action', action);
    // Inject leagueId for all league-scoped actions
    if (action !== 'getLeagues') {
      const lid = leagueId();
      if (lid) url.searchParams.set('leagueId', lid);
    }
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetchWithTimeout(url.toString());
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function post(body) {
    // Inject leagueId for all league-scoped actions (don't overwrite if already set in payload)
    const registryActions = ['addLeague', 'updateLeague'];
    if (!registryActions.includes(body.action) && !body.leagueId) {
      const lid = leagueId();
      if (lid) body.leagueId = lid;
    }
    const res = await fetchWithTimeout(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // GAS requires text/plain for CORS
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  return {
    // League registry (no leagueId needed)
    getLeagues:             (customerId) => get('getLeagues', customerId ? { customerId } : {}),
    getLeaguesAll:          ()           => get('getLeagues', { includeHidden: true }),
    getLeagueAndPlayers:    (leagueId, customerId) => get('getLeagueAndPlayers', customerId ? { leagueId, customerId } : { leagueId }),
    addLeague:        (leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail) => post({ action: 'addLeague', leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail }),
    updateLeague:          (leagueId, name, sheetId, active, canCreateLeagues, hidden, adminEmail, limits) => post({ action: 'updateLeague', leagueId, name, sheetId, active, canCreateLeagues, hidden, adminEmail, limits }),
    updateLeagueWithCaller: (leagueId, name, sheetId, active, canCreateLeagues, callerLeagueId, adminEmail) => post({ action: 'updateLeague', leagueId, name, sheetId, active, canCreateLeagues, callerLeagueId, adminEmail }),

    // League-scoped (leagueId auto-injected from session)
    getAllData:        (sinceWeek)      => get('getAllData', sinceWeek ? { sinceWeek } : {}),
    getEarlyData:     ()               => get('getEarlyData'),
    getConfig:        ()               => get('getConfig'),
    getPlayers:       ()               => get('getPlayers'),
    getAttendance:    ()               => get('getAttendance'),
    getPairings:      (week)           => get('getPairings',     week   !== undefined ? { week }   : {}),
    getScores:        (week)           => get('getScores',       week   !== undefined ? { week }   : {}),
    getStandings:     (week)           => get('getStandings',    week   !== undefined ? { week }   : {}),
    getPlayerReport:  (player)         => get('getPlayerReport', player !== undefined ? { player } : {}),

    validatePIN:             (name, pin)  => post({ action: 'validatePIN', name, pin }),
    validateAdminPassword:   (password)   => post({ action: 'validateAdminPassword', password }),
    validateAppManager:      (password)   => post({ action: 'validateAppManager', password }),
    registerPlayer:   (payload)        => post({ action: 'registerPlayer', ...payload }),
    submitApplication:(payload)        => post({ action: 'submitApplication', ...payload }),
    approvePlayer:    (playerName, relayConfig) => post({ action: 'approvePlayer', playerName, relayConfig }),
    sendFeedback:     (payload)        => post({ action: 'sendFeedback', ...payload }),
    saveConfig:       (config)         => post({ action: 'saveConfig', config }),
    savePlayers:      (players)        => post({ action: 'savePlayers', players }),
    setAttendance:    (player, week, status) => post({ action: 'setAttendance', player, week, status }),
    savePairings:     (week, pairings) => post({ action: 'savePairings', week, pairings }),
    saveScores:       (week, scores)   => post({ action: 'saveScores', week, scores }),
    sendWeeklyReport:   (payload)      => post({ action: 'sendWeeklyReport', ...payload }),
    sendLeagueMessage:     (payload)   => post({ action: 'sendLeagueMessage', ...payload }),
    sendTournamentReport:       (payload) => post({ action: 'sendTournamentReport', ...payload }),
    sendAvailabilityRequest:    (payload) => post({ action: 'sendAvailabilityRequest', ...payload }),
    sendPlayerReport:           (payload) => post({ action: 'sendPlayerReport', ...payload }),
    testEmailRelay:     (relayConfig, testEmail) => post({ action: 'testEmailRelay', relayConfig, testEmail }),
    changePin:        (name, currentPin, newPin) => post({ action: 'changePin', name, currentPin, newPin }),
    emailPin:         (name)             => post({ action: 'emailPin', name }),

    // Push notifications
    saveVapidPrivateKey:    (password, privateKey)         => post({ action: 'saveVapidPrivateKey', password, privateKey }),
    getVapidPrivateKey:     (password)                     => post({ action: 'getVapidPrivateKey',  password }),
    savePushSubscription:   (subscription, playerName)     => post({ action: 'savePushSubscription', subscription, playerName }),
    deletePushSubscription: (endpoint)                     => post({ action: 'deletePushSubscription', endpoint }),
    getPushSubscriptions:   (password)                     => post({ action: 'getPushSubscriptions',  password }),
    sendPushNotifications:  (password, notifications)      => post({ action: 'sendPushNotifications', password, notifications }),
  };
})();
