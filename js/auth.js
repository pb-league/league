// ============================================================
// auth.js — PIN auth and session management
//
// MULTI-LEAGUE: Session now stores leagueId so all API calls
// are automatically scoped to the correct league.
// ============================================================

const Auth = (() => {
  const SESSION_KEY = 'pb_session';

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function setSession(name, isAdmin, leagueId, leagueName) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name, isAdmin, leagueId, leagueName, ts: Date.now() }));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function requireAuth(adminOnly = false) {
    const session = getSession();
    if (!session || !session.leagueId) {
      window.location.href = 'index.html';
      return null;
    }
    if (adminOnly && !session.isAdmin) {
      window.location.href = 'player.html';
      return null;
    }
    return session;
  }

  async function login(name, pin, leagueId, leagueName) {
    const result = await API.validatePIN(name, pin);
    if (result.valid) {
      setSession(result.name, result.isAdmin, leagueId, leagueName);
    }
    return result;
  }

  function logout() {
    clearSession();
    window.location.href = 'index.html';
  }

  return { getSession, setSession, clearSession, requireAuth, login, logout };
})();
