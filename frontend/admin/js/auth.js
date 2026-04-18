function getToken() {
  return localStorage.getItem('retopa_token');
}

function setToken(token) {
  localStorage.setItem('retopa_token', token);
}

function clearToken() {
  localStorage.removeItem('retopa_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function requireSession() {
  const token = getToken();

  if (!token) {
    window.location.href = '/admin/login.html';
    return null;
  }

  const res = await fetch(`${window.RETOPA_API_BASE}/auth/me`, {
    headers: {
      ...authHeaders()
    }
  });

  if (!res.ok) {
    clearToken();
    window.location.href = '/admin/login.html';
    return null;
  }

  const json = await res.json();
  return json.data;
}
