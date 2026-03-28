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

  function setSession(name, isAdmin, leagueId, leagueName, canScore = false, role = 'player') {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name, isAdmin, leagueId, leagueName, canScore, role, ts: Date.now() }));
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
    // On file:// each page is its own origin — sessionStorage doesn't cross pages.
    // Skip redirects entirely so local testing doesn't loop.
    if (location.protocol === 'file:') return session;
    if (!session || !session.leagueId) {
      const slug = sessionStorage.getItem('pb_league_slug');
      window.location.href = slug ? 'index.html?league=' + encodeURIComponent(slug) : 'index.html';
      return null;
    }
    if (adminOnly && !session.isAdmin && session.role !== 'assistant') {
      window.location.href = 'player.html';
      return null;
    }
    return session;
  }

  async function login(name, pin, leagueId, leagueName) {
    const result = await API.validatePIN(name, pin);
    if (result.valid) {
      setSession(result.name, result.isAdmin, leagueId, leagueName, result.canScore || false, result.role || 'player');
    }
    return result;
  }

  async function loginAdmin(password, leagueId, leagueName) {
    const result = await API.validateAdminPassword(password);
    if (result.valid) {
      setSession(result.name, true, leagueId, leagueName, true, result.role || 'admin');
    }
    return result;
  }

  async function loginManager(password, leagueId, leagueName) {
    const result = await API.validateAppManager(password);
    if (result.valid) {
      setSession(result.name, true, leagueId, leagueName, true, 'manager');
    }
    return result;
  }

  function logout() {
    const slug = sessionStorage.getItem('pb_league_slug');
    clearSession();
    sessionStorage.removeItem('pb_league_slug');
    window.location.href = slug ? 'index.html?league=' + encodeURIComponent(slug) : 'index.html';
  }

  return { getSession, setSession, clearSession, requireAuth, login, loginAdmin, loginManager, logout };
})();
