import { createContext, useContext, useState } from 'react';
import adminApi from '../api/client';

const AuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = (adminData) => {
    setAdmin(adminData);
  };

  const logout = async () => {
    try { await adminApi.post('/auth/logout'); } catch {}
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAdminAuth() {
  return useContext(AuthContext);
}