import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Single axios instance for the whole app. The token is attached per request
 * from localStorage, so callers never pass an Authorization header themselves.
 */
const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    // A rejected sign-in attempt is the caller's to report, not a dead session.
    const isLoginAttempt = error.config?.url?.includes('/api/auth/login');

    // An expired or revoked token should not leave the user on a dead screen.
    // The server says why it ended the session, so carry that to the sign-in
    // screen rather than dumping them there with no explanation.
    if (status === 401 && !isLoginAttempt && localStorage.getItem('token')) {
      const reason = error.response?.data?.message;

      localStorage.removeItem('token');

      try {
        if (reason) sessionStorage.setItem('logapart:signed-out-reason', reason);
      } catch {
        // A browser refusing session storage is not worth failing the redirect.
      }

      window.location.assign('/');
    }

    // The forced password change is surfaced to AuthContext, which routes to it.
    if (status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
      window.dispatchEvent(new CustomEvent('logapart:password-change-required'));
    }

    return Promise.reject(error);
  }
);

// True for a request cancelled on purpose, usually because the screen that
// asked for it has gone. Not an error anyone needs to hear about.
export const wasCancelled = (error) => error?.code === 'ERR_CANCELED';

export default api;
