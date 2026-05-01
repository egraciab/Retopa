function getToken() {
  return localStorage.getItem('token');
}

function authHeaders(extraHeaders = {}) {
  const token = getToken();
  return token
    ? {
      ...extraHeaders,
      Authorization: `Bearer ${token}`
    }
    : { ...extraHeaders };
}

async function authFetch(url, options = {}) {
  const headers = authHeaders(options.headers || {});

  const res = await fetch(url, {
    ...options,
    headers
  });

  if (res.status === 401) {
    console.warn('Unauthorized, redirecting to login');
    localStorage.removeItem('token');
    window.location.href = '/admin/login.html';
    return null;
  }

  return res;
}

async function requireSession() {
  const res = await authFetch('/api/auth/me');
  if (!res) return null;

  if (!res.ok) {
    if (res.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/admin/login.html';
      return null;
    }
    throw new Error('Failed to validate session');
  }

  const json = await res.json();
  return json.data || null;
}
