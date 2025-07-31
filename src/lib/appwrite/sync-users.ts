// User synchronization script for Appwrite Auth to Users collection
// This script syncs users from Appwrite Authentication to the Users collection

import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { Users } from 'node-appwrite';
import { Query } from 'appwrite';
import { User } from '@/types';
import serverClient from '@/lib/appwrite/server-config';

// Initialize server-side Users service for Auth operations
const authUsers = new Users(serverClient);

interface AuthUser {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  name: string;
  email: string;
  emailVerification: boolean;
  status: boolean;
  labels: string[];
  prefs: Record<string, unknown>;
}

interface SyncResult {
  success: boolean;
  processed: number;
  created: number;
  updated: number;
  errors: Array<{ userId: string; error: string }>;
  details: string[];
}

/**
 * Sync users from Appwrite Auth to Users collection
 * @param dryRun If true, only reports what would be done without making changes
 * @param defaultRole Default role for new users ('EMPLOYEE' | 'MANAGER' | 'ADMIN')
 * @param defaultManager Default manager ID for new employees
 */
export async function syncUsersFromAuth(
  dryRun: boolean = false,
  defaultRole: 'EMPLOYEE' | 'MANAGER' | 'ADMIN' = 'EMPLOYEE',
  defaultManager?: string
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    processed: 0,
    created: 0,
    updated: 0,
    errors: [],
    details: []
  };

  try {
    // Get all users from Auth
    const authResponse = await authUsers.list();
    const authUsersList = authResponse.users as AuthUser[];
    result.details.push(`Found ${authUsersList.length} users in Auth`);

    // Get existing users from Users collection
    const existingUsersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.limit(1000)] // Adjust limit as needed
    );
    
    const existingUsers = existingUsersResponse.documents as unknown as User[];
    const existingUserIds = new Set(existingUsers.map(u => u.$id));
    result.details.push(`Found ${existingUsers.length} users in Users collection`);

    // Process each auth user
    for (const authUser of authUsersList) {
      result.processed++;
      
      try {
        const userExists = existingUserIds.has(authUser.$id);
        
        if (!userExists) {
          // Create new user in Users collection
          // Parse name into firstName and lastName
          const nameParts = authUser.name.trim().split(/\s+/);
          const firstName = nameParts[0] || 'Unknown';
          const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'User';
          
          // Generate username from email
          const username = authUser.email.split('@')[0].toLowerCase();
          
          const newUserData = {
            firstName,
            lastName,
            username,
            email: authUser.email,
            role: defaultRole,
            manager: defaultManager || null,
            paidLeaves: 24,
            sickLeaves: 12,
            compOffs: 0
          };

          if (!dryRun) {
            await databases.createDocument(
              DATABASE_ID,
              COLLECTIONS.USERS,
              authUser.$id, // Use the same ID as Auth user
              newUserData
            );
          }
          
          result.created++;
          result.details.push(`${dryRun ? '[DRY RUN] Would create' : 'Created'} user: ${authUser.email}`);
          
        } else {
          // User exists, check if update is needed
          const existingUser = existingUsers.find(u => u.$id === authUser.$id);
          
          if (existingUser && existingUser.email !== authUser.email) {
            // Email has changed, update it
            if (!dryRun) {
              await databases.updateDocument(
                DATABASE_ID,
                COLLECTIONS.USERS,
                authUser.$id,
                { email: authUser.email }
              );
            }
            
            result.updated++;
            result.details.push(`${dryRun ? '[DRY RUN] Would update' : 'Updated'} email for: ${authUser.email}`);
          } else {
          }
        }
        
      } catch (error) {
        console.error(`❌ Error processing user ${authUser.email}:`, error);
        result.errors.push({
          userId: authUser.$id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.success = false;
      }
    }

    // Check for orphaned users in Users collection (exist in collection but not in Auth)
    const authUserIds = new Set(authUsersList.map(u => u.$id));
    const orphanedUsers = existingUsers.filter(u => !authUserIds.has(u.$id));
    
    if (orphanedUsers.length > 0) {
      result.details.push(`Warning: Found ${orphanedUsers.length} users in collection that don't exist in Auth`);
      
      orphanedUsers.forEach(user => {
        result.details.push(`  - Orphaned user: ${user.email} (${user.$id})`);
      });
    }

    // Summary
    if (result.errors.length > 0) {
      result.errors.forEach(error => {
      });
    }

    return result;

  } catch (error) {
    console.error('💥 Fatal error during user sync:', error);
    result.success = false;
    result.errors.push({
      userId: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Unknown fatal error'
    });
    return result;
  }
}

/**
 * Get sync statistics without making any changes
 */
export async function getSyncStats(): Promise<{
  authUsers: number;
  collectionUsers: number;
  newUsers: number;
  orphanedUsers: number;
  details: string[];
}> {
  try {
    // Get counts from both sources
    const authResponse = await authUsers.list();
    const authUsersList = authResponse.users as AuthUser[];
    
    const existingUsersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.limit(1000)]
    );
    const existingUsers = existingUsersResponse.documents as unknown as User[];
    
    // Calculate differences
    const authUserIds = new Set(authUsersList.map(u => u.$id));
    const existingUserIds = new Set(existingUsers.map(u => u.$id));
    
    const newUsers = authUsersList.filter(u => !existingUserIds.has(u.$id));
    const orphanedUsers = existingUsers.filter(u => !authUserIds.has(u.$id));
    
    const details = [
      `Auth Users: ${authUsersList.length}`,
      `Collection Users: ${existingUsers.length}`,
      `New Users (in Auth but not in collection): ${newUsers.length}`,
      `Orphaned Users (in collection but not in Auth): ${orphanedUsers.length}`
    ];

    if (newUsers.length > 0) {
      details.push('New users:');
      newUsers.forEach(user => details.push(`  - ${user.email}`));
    }

    if (orphanedUsers.length > 0) {
      details.push('Orphaned users:');
      orphanedUsers.forEach(user => details.push(`  - ${user.email}`));
    }

    return {
      authUsers: authUsersList.length,
      collectionUsers: existingUsers.length,
      newUsers: newUsers.length,
      orphanedUsers: orphanedUsers.length,
      details
    };

  } catch (error) {
    console.error('Error getting sync stats:', error);
    throw error;
  }
}

/**
 * Delete orphaned users from Users collection
 * @param dryRun If true, only reports what would be deleted
 */
export async function cleanupOrphanedUsers(dryRun: boolean = true): Promise<{
  success: boolean;
  deleted: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const result = {
    success: true,
    deleted: 0,
    errors: [] as Array<{ userId: string; error: string }>
  };

  try {
    // Get users from both sources
    const authResponse = await authUsers.list();
    const authUserIds = new Set(authResponse.users.map((u: AuthUser) => u.$id));
    
    const existingUsersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.limit(1000)]
    );
    const existingUsers = existingUsersResponse.documents as unknown as User[];
    
    // Find orphaned users
    const orphanedUsers = existingUsers.filter(u => !authUserIds.has(u.$id));
    for (const user of orphanedUsers) {
      try {
        if (!dryRun) {
          await databases.deleteDocument(
            DATABASE_ID,
            COLLECTIONS.USERS,
            user.$id
          );
        }
        
        result.deleted++;
      } catch (error) {
        console.error(`Error deleting user ${user.email}:`, error);
        result.errors.push({
          userId: user.$id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.success = false;
      }
    }

    return result;

  } catch (error) {
    console.error('Error during cleanup:', error);
    result.success = false;
    result.errors.push({
      userId: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Unknown fatal error'
    });
    return result;
  }
}

// CLI-like functions for easy execution
export const userSync = {
  // Show statistics
  stats: getSyncStats,
  
  // Dry run sync (shows what would happen)
  dryRun: () => syncUsersFromAuth(true),
  
  // Live sync with default settings
  sync: () => syncUsersFromAuth(false),
  
  // Sync with custom role and manager
  syncWithRole: (role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN', managerId?: string) => 
    syncUsersFromAuth(false, role, managerId),
  
  // Cleanup orphaned users (dry run)
  cleanupDryRun: () => cleanupOrphanedUsers(true),
  
  // Cleanup orphaned users (live)
  cleanup: () => cleanupOrphanedUsers(false)
};
