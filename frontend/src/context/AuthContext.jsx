import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../lib/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [loading, setLoading] = useState(true);

  // True while the user still holds a one-time password. Every route except the
  // change-password screen is closed to them until they replace it.
  const mustChangePassword = Boolean(user?.must_change_password);

  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/api/auth/me');
        setUser(response.data);
      } catch (error) {
        console.error('Error fetching user', error);
        setToken('');
        localStorage.removeItem('token');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [token]);

  // The API client raises this when a request is refused for an unchanged
  // password, which keeps a stale client in sync with the server.
  useEffect(() => {
    const onChangeRequired = () => {
      setUser((current) => (current ? { ...current, must_change_password: true } : current));
    };

    window.addEventListener('logapart:password-change-required', onChangeRequired);
    return () => window.removeEventListener('logapart:password-change-required', onChangeRequired);
  }, []);

  // Signing out, or in as someone else, in one tab reaches every other tab.
  // The storage event fires only in the tabs that did not make the change.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== 'token' && event.key !== null) return;

      const nextToken = localStorage.getItem('token') || '';
      setToken(nextToken);
      if (!nextToken) setUser(null);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password });
      const { token: nextToken, user: nextUser } = response.data;

      localStorage.setItem('token', nextToken);
      setToken(nextToken);
      setUser(nextUser);

      return { success: true, user: nextUser };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      const response = await api.post('/api/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });

      const { token: nextToken, user: nextUser } = response.data;

      // The server issues a fresh token, since the old one still says the
      // password is unchanged.
      localStorage.setItem('token', nextToken);
      setToken(nextToken);
      setUser(nextUser);

      return { success: true, user: nextUser };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Could not update password'
      };
    }
  }, []);

  // Tell the server first, so the token stops working everywhere rather than
  // only disappearing from this browser. The local state is cleared either way:
  // a failed request must never leave somebody stuck signed in.
  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Could not end the session on the server', error);
    } finally {
      localStorage.removeItem('token');
      setToken('');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, mustChangePassword, login, changePassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
