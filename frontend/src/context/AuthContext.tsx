import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface User {
  id: string;
  phone: string;
  name: string;
  avatar: string | null;
  total_distance: number;
  is_admin: boolean;
  route_color: string | null;
  restrictions: any[];
  rewards: any[];
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  register: (phone: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: { name?: string; avatar?: string; route_color?: string }) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('user_data');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        
        try {
          const response = await axios.get(`${API_URL}/api/users/me?token=${storedToken}`);
          setUser(response.data);
          await AsyncStorage.setItem('user_data', JSON.stringify(response.data));
        } catch (error) {
          await AsyncStorage.removeItem('auth_token');
          await AsyncStorage.removeItem('user_data');
          setToken(null);
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Error loading auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (phone: string, password: string) => {
    const response = await axios.post(`${API_URL}/api/auth/login`, {
      phone,
      password,
    });
    
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    
    await AsyncStorage.setItem('auth_token', newToken);
    await AsyncStorage.setItem('user_data', JSON.stringify(userData));
  };

  const register = async (phone: string, name: string, password: string) => {
    const response = await axios.post(`${API_URL}/api/auth/register`, {
      phone,
      name,
      password,
    });
    
    const { token: newToken, user: userData } = response.data;
    setToken(newToken);
    setUser(userData);
    
    await AsyncStorage.setItem('auth_token', newToken);
    await AsyncStorage.setItem('user_data', JSON.stringify(userData));
  };

  const logout = async () => {
    if (token) {
      try {
        await axios.post(`${API_URL}/api/auth/logout?token=${token}`);
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    await AsyncStorage.removeItem('consent_accepted');
    setToken(null);
    setUser(null);
  };

  const updateUser = async (data: { name?: string; avatar?: string; route_color?: string }) => {
    if (!token) throw new Error('Not authenticated');
    
    const response = await axios.put(`${API_URL}/api/users/me?token=${token}`, data);
    setUser(response.data);
    await AsyncStorage.setItem('user_data', JSON.stringify(response.data));
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    if (!token) throw new Error('Not authenticated');
    
    await axios.post(`${API_URL}/api/users/change-password?token=${token}`, {
      old_password: oldPassword,
      new_password: newPassword,
    });
  };

  const refreshUser = async () => {
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_URL}/api/users/me?token=${token}`);
      setUser(response.data);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.data));
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        updateUser,
        changePassword,
        refreshUser,
      }}
    >
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
