import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const mockUsers: User[] = [
  {
    id: '1',
    email: 'demo@market.com',
    name: 'Demo User',
    role: 'admin',
    storeId: 'store1',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    email: 'admin@store1.com',
    name: 'John Admin',
    role: 'admin',
    storeId: 'store1',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '3',
    email: 'manager@store1.com',
    name: 'Jane Manager',
    role: 'manager',
    storeId: 'store1',
    createdAt: '2024-01-01T00:00:00Z'
  },
  {
    id: '4',
    email: 'cashier@store1.com',
    name: 'Bob Cashier',
    role: 'cashier',
    storeId: 'store1',
    createdAt: '2024-01-01T00:00:00Z'
  }
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored user session
    const storedUser = localStorage.getItem('erp_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const foundUser = mockUsers.find(u => u.email === email);
    if (foundUser && (password === 'password' || password === 'demo123')) {
      setUser(foundUser);
      localStorage.setItem('erp_user', JSON.stringify(foundUser));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('erp_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}