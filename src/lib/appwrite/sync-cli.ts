// Standalone user sync script with environment loading
// This version loads environment variables directly for CLI usage

import dotenv from 'dotenv';
import path from 'path';
import { Client, Databases, Users } from 'node-appwrite';
import { Query } from 'appwrite';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Validate required environment variables
const requiredEnvVars = [
  'NEXT_PUBLIC_APPWRITE_ENDPOINT',
  'NEXT_PUBLIC_APPWRITE_PROJECT_ID',
  'APPWRITE_API_KEY',
  'NEXT_PUBLIC_DATABASE_ID'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    console.error('Please check your .env.local file');
    process.exit(1);
  }
}

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const authUsers = new Users(client);

// Database and Collection IDs
const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const COLLECTIONS = {
  USERS: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || 'users',
  SHIFTS: process.env.NEXT_PUBLIC_SHIFTS_COLLECTION_ID || 'shifts',
  LEAVES: process.env.NEXT_PUBLIC_LEAVE_REQUESTS_COLLECTION_ID || 'leaves',
  SWAP_REQUESTS: process.env.NEXT_PUBLIC_SWAP_REQUESTS_COLLECTION_ID || 'swap_requests',
  NOTIFICATIONS: process.env.NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID || 'notifications',
};

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

interface User {
  $id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  manager?: string;
  paidLeaves: number;
  sickLeaves: number;
  compOffs: number;
  $createdAt: string;
  $updatedAt: string;
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
 * Set password for all users in Appwrite Auth
 */
async function setPasswordsForAllUsers(
  password: string = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!',
  dryRun: boolean = false
): Promise<{
  success: boolean;
  processed: number;
  updated: number;
  errors: Array<{ userId: string; email: string; error: string }>;
  details: string[];
}> {
  const result = {
    success: true,
    processed: 0,
    updated: 0,
    errors: [] as Array<{ userId: string; email: string; error: string }>,
    details: [] as string[]
  };

  try {
    // Get all users from Auth
    const authResponse = await authUsers.list();
    const authUsersList = authResponse.users as AuthUser[];
    result.details.push(`Found ${authUsersList.length} users in Auth`);

    // Process each auth user
    for (const authUser of authUsersList) {
      result.processed++;
      
      try {
        if (!dryRun) {
          // Update password for the user
          await authUsers.updatePassword(authUser.$id, password);
        }
        
        result.updated++;
        result.details.push(`${dryRun ? '[DRY RUN] Would set' : 'Set'} password for: ${authUser.email}`);
        
      } catch (error) {
        console.error(`❌ Error setting password for user ${authUser.email}:`, error);
        result.errors.push({
          userId: authUser.$id,
          email: authUser.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.success = false;
      }
    }

    // Summary
    if (result.errors.length > 0) {
      result.errors.forEach(error => {
      });
    }

    return result;

  } catch (error) {
    console.error('💥 Fatal error during password update:', error);
    result.success = false;
    result.errors.push({
      userId: 'SYSTEM',
      email: 'SYSTEM',
      error: error instanceof Error ? error.message : 'Unknown fatal error'
    });
    return result;
  }
}

/**
 * Get sync statistics without making any changes
 */
async function getSyncStats(): Promise<{
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
 * Sync users from Appwrite Auth to Users collection
 */
async function syncUsersFromAuth(
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
      [Query.limit(1000)]
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

    // Check for orphaned users
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
  
  // Password management
  setPasswordsDryRun: (password?: string) => setPasswordsForAllUsers(password, true),
  setPasswords: (password?: string) => setPasswordsForAllUsers(password, false),
  
  // Combined sync and password update
  fullSync: async (password: string = process.env.DEFAULT_USER_PASSWORD || 'ChangeMe123!') => {
    // First sync users
    const syncResult = await syncUsersFromAuth(false);
    // Then set passwords
    const passwordResult = await setPasswordsForAllUsers(password, false);
    
    return {
      sync: syncResult,
      passwords: passwordResult,
      success: syncResult.success && passwordResult.success
    };
  }
};
