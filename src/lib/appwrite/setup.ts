// Database setup script for RosterPro
// This script sets up the Appwrite database collections and seed data

import { databases, account, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { ID, Permission, Role } from 'appwrite';

// User colors for visual identification
const USER_COLORS = [
  '#ef4444', // red
  '#f97316', // orange  
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
];

// Default users to create
const DEFAULT_USERS = [
  {
    username: 'jegupta',
    fullName: 'JEET KUMAR GUPTA',
    email: 'jegupta@microsoft.com',
    role: 'manager',
    color: USER_COLORS[0],
    isManager: true,
  },
  {
    username: 'imukherjee',
    fullName: 'INDRANIL MUKHERJEE',
    email: 'imukherjee@microsoft.com',
    role: 'employee',
    color: USER_COLORS[1],
    managerId: '', // Will be set to manager's ID
  },
  {
    username: 'nikhkumar',
    fullName: 'NIKHILESH KUMAR',
    email: 'nikhkumar@microsoft.com',
    role: 'employee',
    color: USER_COLORS[2],
    managerId: '',
  },
  {
    username: 'prikushwaha',
    fullName: 'PRIYANKA KUSHWAHA',
    email: 'prikushwaha@microsoft.com',
    role: 'employee',
    color: USER_COLORS[3],
    managerId: '',
  },
  {
    username: 'rashisahu',
    fullName: 'RASHI SAHU',
    email: 'rashisahu@microsoft.com',
    role: 'employee',
    color: USER_COLORS[4],
    managerId: '',
  },
  {
    username: 'pabitra',
    fullName: 'PABITRA KUMAR SIKDAR',
    email: 'pabitra@microsoft.com',
    role: 'employee',
    color: USER_COLORS[5],
    managerId: '',
  },
  {
    username: 'shdav',
    fullName: 'SHRUTI DAVE',
    email: 'shdav@microsoft.com',
    role: 'employee',
    color: USER_COLORS[6],
    managerId: '',
  },
  {
    username: 'dibyendu',
    fullName: 'DIBYENDU PAL',
    email: 'dibyendu@microsoft.com',
    role: 'employee',
    color: USER_COLORS[7],
    managerId: '',
  },
];

export const setupDatabase = async () => {
  try {
    

    // Create database collections (this should be done in Appwrite console)
    
    
    
    
    
    

    return {
      success: true,
      message: 'Database setup completed. Please create collections in Appwrite console.',
      defaultUsers: DEFAULT_USERS,
    };
  } catch (error) {
    
    return {
      success: false,
      message: 'Database setup failed',
      error,
    };
  }
};

// Helper function to create auth users (this needs to be run server-side)
export const createAuthUsers = async () => {
  
  
  const defaultPassword = 'P@$$w0rd1!';
  const results = [];

  for (const userData of DEFAULT_USERS) {
    try {
      // Create auth user
      const authUser = await account.create(
        ID.unique(),
        userData.email,
        defaultPassword,
        userData.fullName
      );

      results.push({
        success: true,
        username: userData.username,
        authId: authUser.$id,
      });
    } catch (error) {
      results.push({
        success: false,
        username: userData.username,
        error,
      });
    }
  }

  return results;
};
