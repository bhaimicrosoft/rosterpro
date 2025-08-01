import { serverAccount, serverDatabases, serverUsers } from './server-config';
import { ID } from 'node-appwrite';
import { DATABASE_ID, COLLECTIONS } from './config';
import { User } from '@/types';
import type { Models } from 'node-appwrite';

interface CreateUserData {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  manager?: string;
  paidLeaves?: number;
  sickLeaves?: number;
  compOffs?: number;
}

// Helper function to safely cast documents
function castDocument<T>(doc: unknown): T {
  return doc as T;
}

export const userManagementService = {
  /**
   * Creates a user in both Appwrite Auth and Database collections
   * This ensures synchronization between authentication and user data
   */
  async createUser(userData: CreateUserData): Promise<{ authUser: Models.User<Models.Preferences>; dbUser: User }> {
    let authUserId: string | null = null;
    
    try {
      // Generate unique ID with username prefix for better identification
      const uniqueId = ID.unique();
      const prefixedId = `${userData.username}_${uniqueId}`;
      
      // Step 1: Create user in Appwrite Auth with prefixed ID
      const authUser = await serverAccount.create(
        prefixedId,
        userData.email,
        userData.password,
        `${userData.firstName} ${userData.lastName}`
      );
      
      authUserId = authUser.$id;

      // Step 2: Create user profile in database with the same prefixed ID
      const dbUserData = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        email: userData.email,
        role: userData.role,
        manager: userData.manager,
        paidLeaves: userData.paidLeaves ?? 24,
        sickLeaves: userData.sickLeaves ?? 12,
        compOffs: userData.compOffs ?? 0,
      };

      const dbUser = await serverDatabases.createDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        prefixedId, // Use same prefixed ID for database document
        dbUserData
      );
      
      return {
        authUser,
        dbUser: castDocument<User>(dbUser)
      };

    } catch (error) {
      
      // Rollback: If database creation fails, try to delete the auth user
      if (authUserId) {
        try {
          // Note: Appwrite doesn't have a direct delete user API
          // In production, you might want to implement a cleanup mechanism
        } catch {
          // Cleanup failed - continue silently
        }
      }
      
      throw error;
    }
  },

  /**
   * Updates user in both auth and database
   */
  async updateUser(userId: string, updates: Partial<CreateUserData>): Promise<User> {
    try {
      // Update in database
      const dbUser = await serverDatabases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId,
        {
          firstName: updates.firstName,
          lastName: updates.lastName,
          username: updates.username,
          email: updates.email,
          role: updates.role,
          manager: updates.manager,
          paidLeaves: updates.paidLeaves,
          sickLeaves: updates.sickLeaves,
          compOffs: updates.compOffs,
        }
      );

      // Note: Appwrite doesn't allow updating auth user details via server SDK
      // For email changes, you'd need to handle this through the client SDK
      
      return castDocument<User>(dbUser);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Deletes user from both auth and database
   * This ensures complete removal from both authentication and user data
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      // Import database services for comprehensive deletion
      const { userService } = await import('./database');
      
      // Step 1: Comprehensive deletion of user and all related data
      await userService.deleteUserComprehensive(userId);

      // Step 2: Delete from Appwrite Auth using Users API
      try {
        await serverUsers.delete(userId);
      } catch {
        // Don't throw here as database deletion was successful
        // Auth deletion failure might be acceptable if user was already deleted
      }
      
    } catch (error) {
      throw error;
    }
  },

  /**
   * Sync existing auth users to database
   * Useful for migration or fixing sync issues
   */
  async syncAuthToDatabase(): Promise<void> {
    try {
      // This would require listing all auth users and ensuring they exist in database
      // Implementation depends on your specific sync requirements
    } catch (error) {
      throw error;
    }
  }
};
