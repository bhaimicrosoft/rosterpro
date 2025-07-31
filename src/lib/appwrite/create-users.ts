// Create users script - Creates users in both Appwrite Auth and Users collection
import dotenv from 'dotenv';
import path from 'path';
import { Client, Databases, Users } from 'node-appwrite';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);
const authUsers = new Users(client);

const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const COLLECTIONS = {
  USERS: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || 'users',
};

// User definitions
const usersToCreate = [
  {
    username: 'imukherjee',
    email: 'imukherjee@microsoft.com',
    firstName: 'INDRANIL',
    lastName: 'MUKHERJEE',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'nikhkumar',
    email: 'nikhkumar@microsoft.com',
    firstName: 'NIKHILESH',
    lastName: 'KUMAR',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'prikushwaha',
    email: 'prikushwaha@microsoft.com',
    firstName: 'PRIYANKA',
    lastName: 'KUSHWAHA',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'rashisahu',
    email: 'rashisahu@microsoft.com',
    firstName: 'RASHI',
    lastName: 'SAHU',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'pabitra',
    email: 'pabitra@microsoft.com',
    firstName: 'PABITRA KUMAR',
    lastName: 'SIKDAR',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'shdav',
    email: 'shdav@microsoft.com',
    firstName: 'SHRUTI',
    lastName: 'DAVE',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'dibyendu',
    email: 'dibyendu@microsoft.com',
    firstName: 'DIBYENDU',
    lastName: 'PAL',
    role: 'EMPLOYEE' as const,
    manager: null as string | null
  },
  {
    username: 'jegupta',
    email: 'jegupta@microsoft.com',
    firstName: 'JEET KUMAR',
    lastName: 'GUPTA',
    role: 'MANAGER' as const,
    manager: null as string | null
  }
];

const DEFAULT_PASSWORD = 'Welcome123!';

interface CreateUserResult {
  success: boolean;
  created: number;
  errors: Array<{ username: string; error: string; step: string }>;
  details: string[];
}

async function createAllUsers(dryRun: boolean = false): Promise<CreateUserResult> {
  const result: CreateUserResult = {
    success: true,
    created: 0,
    errors: [],
    details: []
  };
  // First, set manager IDs for employees (manager should be jegupta)
  const managerUser = usersToCreate.find(u => u.role === 'MANAGER');
  const managerId = managerUser ? `jegupta_${Date.now()}` : null;
  
  // Update employees to have the manager
  usersToCreate.forEach(user => {
    if (user.role === 'EMPLOYEE') {
      user.manager = managerId;
    }
  });

  for (const userData of usersToCreate) {
    const userId = `${userData.username}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Step 1: Create user in Appwrite Auth
      if (!dryRun) {
        const authUser = await authUsers.create(
          userId,
          userData.email,
          undefined, // phone (optional)
          DEFAULT_PASSWORD,
          `${userData.firstName} ${userData.lastName}` // name
        );
      } else {
      }

      // Step 2: Create user in Users collection
      const userDocData = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        username: userData.username,
        email: userData.email,
        role: userData.role,
        manager: userData.manager,
        paidLeaves: 20,
        sickLeaves: 12,
        compOffs: 0
      };

      if (!dryRun) {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          userId, // Use same ID as Auth user
          userDocData
        );
      } else {
      }

      result.created++;
      result.details.push(`${dryRun ? '[DRY RUN] Would create' : 'Created'} user: ${userData.username} (${userData.email})`);
    } catch (error) {
      console.error(`  ❌ Error creating user ${userData.username}:`, error);
      result.errors.push({
        username: userData.username,
        error: error instanceof Error ? error.message : 'Unknown error',
        step: 'Creation process'
      });
      result.success = false;
    }
  }

  // Summary
  if (result.errors.length > 0) {
    result.errors.forEach(error => {
    });
  }

  if (result.success) {
    usersToCreate.forEach(user => {
    });
  }

  return result;
}

async function clearAllUsers(dryRun: boolean = false): Promise<void> {
  try {
    // Clear Users collection
    const usersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      []
    );
    for (const user of usersResponse.documents) {
      if (!dryRun) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.USERS, user.$id);
      } else {
      }
    }

    // Clear Auth users
    const authResponse = await authUsers.list();
    for (const user of authResponse.users) {
      if (!dryRun) {
        await authUsers.delete(user.$id);
      } else {
      }
    }
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Export functions for CLI usage
export const userCreation = {
  // Show what users will be created
  preview: () => {
    usersToCreate.forEach((user, index) => {
    });
  },
  
  // Clear all users (dry run)
  clearDryRun: () => clearAllUsers(true),
  
  // Clear all users (live)
  clear: () => clearAllUsers(false),
  
  // Create users (dry run)
  createDryRun: () => createAllUsers(true),
  
  // Create users (live)
  create: () => createAllUsers(false),
  
  // Full process: clear + create
  fullReset: async (dryRun: boolean = false) => {
    await clearAllUsers(dryRun);
    if (!dryRun) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return await createAllUsers(dryRun);
  }
};
