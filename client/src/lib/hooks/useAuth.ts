import { useState, useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { createLogger, createErrorMetadata } from '../utils/logger';

const logger = createLogger('useAuth');

interface AuthResult {
  authenticated: boolean;
  user?: {
    isPowerUser: boolean;
    pubkey: string;
  };
  error?: string;
}

const useAuth = () => {
  const { setAuthenticated, setUser, authenticated, user } = useSettingsStore();
  const [authError, setAuthError] = useState<string | null>(null);

  const login = async () => {
    try {
      setAuthError(null);
      // Replace with actual Nostr authentication logic
      const authResult: AuthResult = await new Promise((resolve) => {
        setTimeout(() => {
          resolve({ authenticated: true, user: { isPowerUser: true, pubkey: 'mocked_pubkey' } });
        }, 1000);
      });

      if (authResult.authenticated && authResult.user) {
        setAuthenticated(true);
        setUser(authResult.user);
        logger.info('Login successful');
      } else {
        throw new Error(authResult.error || 'Login failed');
      }
    } catch (error) {
      logger.error('Login failed:', createErrorMetadata(error));
      setAuthError(error instanceof Error ? error.message : 'Login failed');
    }
  };

  const logout = async () => {
    try {
      setAuthError(null);
      // Replace with actual Nostr logout logic
      await new Promise((resolve) => setTimeout(resolve, 500));
      setAuthenticated(false);
      setUser(null);
      logger.info('Logout successful');
    } catch (error) {
      logger.error('Logout failed:', createErrorMetadata(error));
      setAuthError(error instanceof Error ? error.message : 'Logout failed');
    }
  };

  return {
    authenticated,
    user,
    authError,
    login,
    logout,
  };
};

export default useAuth;