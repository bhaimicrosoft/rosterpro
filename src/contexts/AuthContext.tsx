'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const checkAuth = useCallback(async (retryCount = 0) => {
    try {   
      
      // Try to get current account - this should work if session cookies exist
      const session = await account.get();     
      
      if (session) {
        // Try to get user document using email instead of session ID
        // This is more reliable as the session ID might not match the user document ID
        const userQuery = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.USERS,
          [Query.equal('email', session.email)]
        );
        
        if (userQuery.documents.length > 0) {
          const userDoc = userQuery.documents[0];
          
          setUser({
            $id: session.$id, // Use session ID, not document ID
            documentId: userDoc.$id, // Store document ID separately
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
          
         
        } else {
         
          setUser(null);
        }
      } else {
      
        setUser(null);
      }
    } catch (error: unknown) {
      
      const appwriteError = error as { code?: number; type?: string; message?: string };
      
      // If it's a 401 error and we haven't retried yet, try once more after a short delay
      if (appwriteError?.code === 401 && retryCount < 2) {
       
        setTimeout(() => {
          checkAuth(retryCount + 1);
        }, 200);
        return; // Don't set loading to false yet
      }
      
      
      // Clear user state when authentication fails
      setUser(null);
    } finally {
      // Only set loading to false on final attempt
      if (retryCount >= 2) {
       
        setIsLoading(false);
      } else if (retryCount === 0) {
        // First successful attempt or no retry needed
    
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // Small delay to ensure Appwrite client is fully initialized
    // This is crucial for proper cookie handling
    const initAuth = async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      checkAuth();
    };
    
    initAuth();
  }, [checkAuth]);

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
      console.log('Creating session for:', email);
      const session = await account.createEmailPasswordSession(email, password);
      console.log('Session created successfully:', session);
      
      // Set user immediately from the data we already have
      // No need to verify since session creation was successful
      setUser({
        $id: userDoc.$id,
        documentId: userDoc.$id, // For login, document ID is the same as session user ID
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

      console.log('Login successful for user:', userDoc.username);
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
    } catch {
      // Logout failed, but we'll clear the user state anyway
      setUser(null);
    }
  };

  const updatePassword = async (newPassword: string): Promise<boolean> => {
    try {
      await account.updatePassword(newPassword);
      return true;
    } catch {
      // Password update failed
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
          documentId: userDoc.$id, // Store document ID separately
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
