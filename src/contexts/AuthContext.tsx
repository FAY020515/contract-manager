import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface User {
  id: string | number;
  username: string;
  display_name: string;
  role: string;
  department: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const API_BASE = '/api';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // On mount, check for a saved token and verify it with the server.
  useEffect(() => {
    const verifyToken = async () => {
      const savedToken = localStorage.getItem('auth_token');
      if (!savedToken) {
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE}/auth/me`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${savedToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const userData: User = data.user || data;
          setToken(savedToken);
          setUser(userData);
        } else {
          // Token is invalid — clean up.
          localStorage.removeItem('auth_token');
          setUser(null);
          setToken(null);
        }
      } catch {
        // Network or server error — do not clear the token; let the user retry.
        console.error('Failed to verify token on mount.');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, []);

  const login = async (username: string, password: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message = errorBody?.error ?? '登录失败，请检查用户名和密码。';
      throw new Error(message);
    }

    const data = await response.json();
    const newToken: string = data.token;
    const newUser: User = data.user;

    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = (): void => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
