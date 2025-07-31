'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { AuthUser, AuthContextType } from '@/types';
import { Query } from 'appwrite';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const session = await account.get();
      if (session) {
        const userDoc = await databases.getDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          session.$id
        );
        
        setUser({
          $id: userDoc.$id,
          firstName: userDoc.firstName,
          lastName: userDoc.lastName,
          username: userDoc.username,
          email: userDoc.email,
          role: userDoc.role,
          manager: userDoc.manager,
          paidLeaves: userDoc.paidLeaves || 0,
          sickLeaves: userDoc.sickLeaves || 0,
          compOffs: userDoc.compOffs || 0,
        });
      }
    } catch {
      
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      
      // Try to find user by username first, then by email if not found
      let userQuery = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.equal('username', username)]
      );

      // If not found by username, try by email
      if (userQuery.documents.length === 0) {
        userQuery = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.USERS,
          [Query.equal('email', username)]
        );
      }

      if (userQuery.documents.length === 0) {
        throw new Error('User not found');
      }

      const userDoc = userQuery.documents[0];
      const email = userDoc.email;

      // Create session with email and password
      await account.createEmailPasswordSession(email, password);
      
      setUser({
        $id: userDoc.$id,
        firstName: userDoc.firstName,
        lastName: userDoc.lastName,
        username: userDoc.username,
        email: userDoc.email,
        role: userDoc.role,
        manager: userDoc.manager,
        paidLeaves: userDoc.paidLeaves || 0,
        sickLeaves: userDoc.sickLeaves || 0,
        compOffs: userDoc.compOffs || 0,
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await account.deleteSession('current');
      setUser(null);
    } catch (error) {
      
    }
  };

  const updatePassword = async (newPassword: string): Promise<boolean> => {
    try {
      await account.updatePassword(newPassword);
      return true;
    } catch (error) {
      
      return false;
    }
  };

  const refreshUser = async () => {
    try {
      const currentAccount = await account.get();
      
      // Fetch user document from database
      const userQuery = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.equal('email', currentAccount.email)]
      );

      if (userQuery.documents.length > 0) {
        const userDoc = userQuery.documents[0];
        setUser({
          $id: currentAccount.$id,
          email: currentAccount.email,
          firstName: userDoc.firstName,
          lastName: userDoc.lastName,
          username: userDoc.username,
          role: userDoc.role,
          manager: userDoc.manager,
          paidLeaves: userDoc.paidLeaves || 0,
          sickLeaves: userDoc.sickLeaves || 0,
          compOffs: userDoc.compOffs || 0,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    login,
    logout,
    updatePassword,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
