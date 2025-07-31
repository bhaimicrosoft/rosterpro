import { Client, Account, Databases, Storage, Functions } from 'appwrite';

// Appwrite configuration for client-side
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

// Note: Client-side applications should NOT use setKey() or setDevKey()
// The platform (localhost:3000) must be configured in Appwrite Console

// Export Appwrite services
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);
export const functions = new Functions(client);

// Database and Collection IDs
export const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
export const COLLECTIONS = {
  USERS: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID!,
  SHIFTS: process.env.NEXT_PUBLIC_SHIFTS_COLLECTION_ID!,
  LEAVES: process.env.NEXT_PUBLIC_LEAVE_REQUESTS_COLLECTION_ID!,
  SWAP_REQUESTS: process.env.NEXT_PUBLIC_SWAP_REQUESTS_COLLECTION_ID!,
  NOTIFICATIONS: process.env.NEXT_PUBLIC_NOTIFICATIONS_COLLECTION_ID!,
};

export default client;
