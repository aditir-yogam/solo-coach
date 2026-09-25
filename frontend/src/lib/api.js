// Single place for talking to the backend (same origin, cookie session).

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', json, formData, signal } = {}) {
  const init = { method, credentials: 'same-origin', signal, headers: {} };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (formData) {
    init.body = formData;
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network_error', "We can't reach the server right now. Check that the app is running and try again.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) throw new ApiError(res.status, body?.error || 'error', body?.message || 'Something went wrong. Please try again.');
  return body;
}

const coach = (id) => `/api/v1/app/coaches/${encodeURIComponent(id)}`;

export const api = {
  me: (opts) => request('/api/v1/app/me', opts),
  requestMagicLink: (name, email, org, resend = false) =>
    request('/api/v1/auth/magic-link', { method: 'POST', json: { name, email, org, resend } }),
  // Epic 1 addendum: set password after the one-time link, then email + password login.
  passwordSetup: () => request('/api/v1/auth/password-setup'),
  setPassword: (password, confirmPassword) =>
    request('/api/v1/auth/set-password', { method: 'POST', json: { password, confirm_password: confirmPassword } }),
  login: (email, password) => request('/api/v1/auth/login', { method: 'POST', json: { email, password } }),
  personalize: (id, formData) => request(`${coach(id)}/personalize`, { method: 'POST', formData }),
  generateStory: (id) => request(`${coach(id)}/story/generate`, { method: 'POST' }),
  getPortfolio: (id, opts) => request(`${coach(id)}/portfolio`, opts),
  patchCoach: (id, fields) => request(coach(id), { method: 'PATCH', json: fields }),
  uploadPhoto: (id, file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request(`${coach(id)}/photo`, { method: 'POST', formData: fd });
  },
};
