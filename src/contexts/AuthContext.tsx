'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { account, databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { AuthUser, AuthContextType } from '@/types';
import { Query } from 'appwrite';
import client from '@/lib/appwrite/config';

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

    // Subscribe to user document updates for real-time leave balance updates
    let unsubscribe: (() => void) | null = null;

    const setupUserSubscription = async () => {
      try {
        const session = await account.get();
        if (session) {
          console.log('Setting up user subscription for real-time updates:', session.$id);
          unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents.${session.$id}`, 
            (response) => {
              console.log('User document updated:', response);
              if (response.events.some((event: string) => event.includes('update'))) {
                const updatedUserData = response.payload as {
                  paidLeaves?: number;
                  sickLeaves?: number;
                  compOffs?: number;
                  [key: string]: unknown;
                };
                console.log('Updating user state with new leave balances:', {
                  paidLeaves: updatedUserData.paidLeaves,
                  sickLeaves: updatedUserData.sickLeaves,
                  compOffs: updatedUserData.compOffs
                });
                
                setUser(prevUser => prevUser ? {
                  ...prevUser,
                  paidLeaves: updatedUserData.paidLeaves || 0,
                  sickLeaves: updatedUserData.sickLeaves || 0,
                  compOffs: updatedUserData.compOffs || 0,
                } : null);
              }
            }
          );
        }
      } catch {
        console.log('User not logged in, no subscription needed');
      }
    };

    setupUserSubscription();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
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
      
      // First, get the user document to find the email
      const userQuery = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.equal('username', username)]
      );

      if (userQuery.documents.length === 0) {
        throw new Error('User not found');
      }

      const userDoc = userQuery.documents[0];
      const email = userDoc.email || `${username}@rosterpro.local`;

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
    } catch {
      
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await account.deleteSession('current');
      setUser(null);
    } catch {
      
    }
  };

  const updatePassword = async (newPassword: string): Promise<boolean> => {
    try {
      await account.updatePassword(newPassword);
      return true;
    } catch {
      
      return false;
    }
  };

  const refreshUser = async (): Promise<void> => {
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
      console.error('Failed to refresh user data');
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
