// Debug script to check user data in both Auth and Users collection
import dotenv from 'dotenv';
import path from 'path';
import { Client, Databases } from 'node-appwrite';
import { Query } from 'appwrite';
import { userSync } from './sync-cli';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// Initialize Appwrite client
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
  .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

const DATABASE_ID = process.env.NEXT_PUBLIC_DATABASE_ID!;
const COLLECTIONS = {
  USERS: process.env.NEXT_PUBLIC_USERS_COLLECTION_ID || 'users',
};

async function debugUsers() {
  try {
    // Get users from Users collection
    const usersResponse = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS,
      [Query.limit(20)]
    );
    usersResponse.documents.forEach((user: any, index: number) => {
    });

    // Show stats
    const stats = await userSync.stats();
    stats.details.forEach(detail =>);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

debugUsers().catch(console.error);
