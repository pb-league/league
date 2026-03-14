// ============================================================
// api.js — All communication with Google Apps Script backend
//
// MULTI-LEAGUE: Set GAS_URL once. Every request automatically
// includes the current leagueId from the active session.
// ============================================================

const API = (() => {
  // !! REPLACE THIS with your deployed GAS Web App URL !!
  // const GAS_URL = 'https://script.google.com/macros/s/AKfycby007PfussW_bqnfTP2pD-vDpVgC__ubdHetMk586q4iNFXJIdu1_tgYL5kZaJlkieL/exec';
  // const GAS_URL = 'https://script.google.com/macros/s/AKfycbziZPrG5fSM_ufJYei6r_DoFTCjt4ymGuof-UBJRRj84oChtHtE67r6orMUJnGk7hbk/exec';
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzudYO4IDqCJt92kR4gu6dVJyGN5LoKtxpD3RYR1pNHepxU_liEdpogjCnE8mWTOXqU/exec';
  // Get the active leagueId from session (set at login)
  function leagueId() {
    try {
      const raw = sessionStorage.getItem('pb_session');
      return raw ? JSON.parse(raw).leagueId : null;
    } catch { return null; }
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
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function post(body) {
    // Inject leagueId for all league-scoped actions
    const registryActions = ['addLeague', 'updateLeague'];
    if (!registryActions.includes(body.action)) {
      const lid = leagueId();
      if (lid) body.leagueId = lid;
    }
    const res = await fetch(GAS_URL, {
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
    getLeagues:       ()                      => get('getLeagues'),
    addLeague:        (leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers) => post({ action: 'addLeague', leagueId, name, sheetId, sourceLeagueId, copyConfig, copyPlayers }),
    updateLeague:     (leagueId, name, sheetId, active) => post({ action: 'updateLeague', leagueId, name, sheetId, active }),

    // League-scoped (leagueId auto-injected from session)
    getAllData:        ()               => get('getAllData'),
    getConfig:        ()               => get('getConfig'),
    getPlayers:       ()               => get('getPlayers'),
    getAttendance:    ()               => get('getAttendance'),
    getPairings:      (week)           => get('getPairings', { week }),
    getScores:        (week)           => get('getScores', { week }),
    getStandings:     (week)           => get('getStandings', { week }),
    getPlayerReport:  (player)         => get('getPlayerReport', { player }),

    validatePIN:      (name, pin)      => post({ action: 'validatePIN', name, pin }),
    saveConfig:       (config)         => post({ action: 'saveConfig', config }),
    savePlayers:      (players)        => post({ action: 'savePlayers', players }),
    setAttendance:    (player, week, status) => post({ action: 'setAttendance', player, week, status }),
    savePairings:     (week, pairings) => post({ action: 'savePairings', week, pairings }),
    saveScores:       (week, scores)   => post({ action: 'saveScores', week, scores }),
    sendWeeklyReport: (payload)        => post({ action: 'sendWeeklyReport', ...payload }),
    changePin:        (name, currentPin, newPin) => post({ action: 'changePin', name, currentPin, newPin }),
    emailPin:         (name)             => post({ action: 'emailPin', name }),
  };
})();
