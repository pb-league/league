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

  function setSession(name, isAdmin, leagueId, leagueName, canScore = false) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name, isAdmin, leagueId, leagueName, canScore, ts: Date.now() }));
    // Preserve the league slug from the original URL so logout can return to it
    // Only preserve league slug if it was explicitly in the URL
    const urlLeague = new URLSearchParams(window.location.search).get('league');
    if (urlLeague) sessionStorage.setItem('pb_league_slug', urlLeague);
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function requireAuth(adminOnly = false) {
    const session = getSession();
    if (!session || !session.leagueId) {
      const slug = sessionStorage.getItem('pb_league_slug');
      window.location.href = slug ? 'index.html?league=' + encodeURIComponent(slug) : 'index.html';
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
      setSession(result.name, result.isAdmin, leagueId, leagueName, result.canScore || false);
    }
    return result;
  }

  function logout() {
    const slug = sessionStorage.getItem('pb_league_slug');
    clearSession();
    sessionStorage.removeItem('pb_league_slug');
    window.location.href = slug ? 'index.html?league=' + encodeURIComponent(slug) : 'index.html';
  }

  return { getSession, setSession, clearSession, requireAuth, login, logout };
})();
