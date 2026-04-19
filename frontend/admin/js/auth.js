function getToken() {
  return localStorage.getItem('token');
}

async function authFetch(url, options = {}) {
  const token = getToken();

  const headers = {
    ...(options.headers || {}),
    'Authorization': `Bearer ${token}`
  };

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
