import { Client, Account, Databases, Storage, Functions, Users } from 'node-appwrite';

// Server-side Appwrite configuration for API routes
const serverClient = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

// Export server-side services
export const serverAccount = new Account(serverClient);
export const serverDatabases = new Databases(serverClient);
export const serverStorage = new Storage(serverClient);
export const serverFunctions = new Functions(serverClient);
export const serverUsers = new Users(serverClient);

export default serverClient;
