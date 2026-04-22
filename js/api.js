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
    addLeague:        (leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail, storage, adminPin, supabaseUrl, supabaseKey) => post({ action: 'addLeague', leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers, canCreateLeagues, hidden, customerId, adminEmail, storage, adminPin, supabaseUrl, supabaseKey }),
    updateLeague:          (leagueId, name, sheetId, active, canCreateLeagues, hidden, adminEmail, limits, storage) => post({ action: 'updateLeague', leagueId, name, sheetId, active, canCreateLeagues, hidden, adminEmail, limits, storage }),
    updateLeagueWithCaller: (leagueId, name, sheetId, active, canCreateLeagues, callerLeagueId, adminEmail) => post({ action: 'updateLeague', leagueId, name, sheetId, active, canCreateLeagues, callerLeagueId, adminEmail }),
    migrateLeague:          ()                           => post({ action: 'migrateLeague' }),
    migrateLeagueToOwnSb:   (supabaseUrl, supabaseKey)   => post({ action: 'migrateLeague', supabaseUrl, supabaseKey }),
    migrateLeagueBack:      ()                           => post({ action: 'migrateLeagueBack' }),
    importLeague:           (newLeagueId, newName, adminPin, data) => post({ action: 'importLeague', newLeagueId, newName, adminPin, data }),

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

    createCheckoutSession: (payload)              => post({ action: 'createCheckoutSession', ...payload }),
    confirmPayment:        (sessionId)            => post({ action: 'confirmPayment', sessionId }),
    validateOwnSupabase:   (supabaseUrl, supabaseKey) => post({ action: 'validateOwnSupabase', supabaseUrl, supabaseKey }),

    validatePIN:             (name, pin)           => post({ action: 'validatePIN', name, pin }),
    validateAdminPassword:   (password, isLogin)   => post({ action: 'validateAdminPassword', password, isLogin: isLogin || false }),
    validateAppManager:      (password)            => post({ action: 'validateAppManager', password }),
    verifyAdminOtp:          (leagueId, otp)       => post({ action: 'verifyAdminOtp', leagueId, otp }),
    registerPlayer:   (payload)        => post({ action: 'registerPlayer', ...payload }),
    submitApplication:  (payload)          => post({ action: 'submitApplication', ...payload }),
    getApplications:    ()       => post({ action: 'getApplications' }),
    approveApplication: (appId) => post({ action: 'approveApplication', appId }),
    submitSetupForm:    (payload)          => post({ action: 'submitSetupForm', ...payload }),
    approvePlayer:    (playerName, relayConfig) => post({ action: 'approvePlayer', playerName, relayConfig }),
    sendFeedback:     (payload)        => post({ action: 'sendFeedback', ...payload }),
    getDonations:     ()               => post({ action: 'getDonations' }),
    saveConfig:       (config)         => post({ action: 'saveConfig', config }),
    savePlayers:      (players)        => post({ action: 'savePlayers', players }),
    savePlayerPhoto:  (playerName, photo) => post({ action: 'savePlayerPhoto', playerName, photo }),
    setAttendance:      (player, week, status) => post({ action: 'setAttendance', player, week, status }),
    batchSetAttendance: (changes)             => post({ action: 'batchSetAttendance', changes }),
    savePairings:     (week, pairings) => post({ action: 'savePairings', week, pairings }),
    saveScores:       (week, scores)   => post({ action: 'saveScores', week, scores }),
    sendWeeklyReport:   (payload)      => post({ action: 'sendWeeklyReport', ...payload }),
    sendLeagueMessage:     (payload)   => post({ action: 'sendLeagueMessage', ...payload }),
    sendTournamentReport:       (payload) => post({ action: 'sendTournamentReport', ...payload }),
    sendAvailabilityRequest:    (payload) => post({ action: 'sendAvailabilityRequest', ...payload }),
    sendPlayerReport:           (payload) => post({ action: 'sendPlayerReport', ...payload }),
    testEmailRelay:     (relayConfig, testEmail) => post({ action: 'testEmailRelay', relayConfig, testEmail }),
    changePin:        (name, currentPin, newPin) => post({ action: 'changePin', name, currentPin, newPin }),
    changePinForce:   (name, newPin)             => post({ action: 'changePinForce', name, newPin }),
    emailPin:         (name)             => post({ action: 'emailPin', name }),
    emailAdminPin:    (leagueId)         => post({ action: 'emailAdminPin', leagueId }),

    // Backup reminders
    getBackupStatus:    ()  => post({ action: 'getBackupStatus' }),
    recordBackupDone:   ()  => post({ action: 'recordBackupDone' }),
    recordBackupSkipped: () => post({ action: 'recordBackupSkipped' }),

    // Push notifications
    saveVapidPrivateKey:    (password, privateKey)         => post({ action: 'saveVapidPrivateKey', password, privateKey }),
    getVapidPrivateKey:     (password)                     => post({ action: 'getVapidPrivateKey',  password }),
    savePushSubscription:   (subscription, playerName)     => post({ action: 'savePushSubscription', subscription, playerName }),
    deletePushSubscription: (endpoint)                     => post({ action: 'deletePushSubscription', endpoint }),
    getPushSubscriptions:   (password)                     => post({ action: 'getPushSubscriptions',  password }),
    sendPushNotifications:  (password, notifications)      => post({ action: 'sendPushNotifications', password, notifications }),

    // Queue-based pairing
    getQueue:           (week)         => get('getQueue', week !== undefined ? { week } : {}),
    saveQueue:          (week, entries) => post({ action: 'saveQueue', week, entries }),

    // Game timers
    getTimerState:      ()                       => get('getTimerState'),
    setTimerState:      (timerState)             => post({ action: 'setTimerState', timerState }),
    getTimerPushSubs:   (adminPin)               => get('getTimerPushSubs', { adminPin }),
    sendTimerPush:      (adminPin, notifications) => post({ action: 'sendTimerPush', adminPin, notifications }),

    // Challenges
    getChallenges:       ()                             => get('getChallenges'),
    submitChallenge:     (payload)                      => post({ action: 'submitChallenge', ...payload }),
    respondToChallenge:  (challengeId, playerName, response) => post({ action: 'respondToChallenge', challengeId, playerName, response }),
    deleteChallenge:     (challengeId, playerName)      => post({ action: 'deleteChallenge', challengeId, playerName }),

    // Chat
    getChatMessages: (sinceId, player) => get('getChatMessages', { sinceId: sinceId || 0, player: player || '' }),
    postChatMessage: (sender, recipient, message) => post({ action: 'postChatMessage', sender, recipient: recipient || '', message }),
  };
})();
