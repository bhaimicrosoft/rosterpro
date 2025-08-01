import { NextRequest, NextResponse } from 'next/server';
import { serverDatabases } from '@/lib/appwrite/server-config';
import { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { Users } from 'node-appwrite';
import serverClient from '@/lib/appwrite/server-config';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const params = await context.params;
    const { userId } = params;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // First, get the user document to find their email
    const userDoc = await serverDatabases.getDocument(
      DATABASE_ID,
      COLLECTIONS.USERS,
      userId
    );

    if (!userDoc) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userEmail = userDoc.email;

    try {
      // Create Users service for managing auth users
      const users = new Users(serverClient);
      
      // Try to find and delete the auth user by email
      const usersList = await users.list();
      const authUser = usersList.users.find((u: { email: string; $id: string }) => u.email === userEmail);
      
      if (authUser) {
        // Delete from Appwrite Auth
        await users.delete(authUser.$id);
      }
    } catch {
      // Auth user might not exist or already deleted, continue with database deletion
    }

    // Delete from database
    await serverDatabases.deleteDocument(
      DATABASE_ID,
      COLLECTIONS.USERS,
      userId
    );

    return NextResponse.json({ 
      success: true, 
      message: 'User deleted successfully' 
    });

  } catch {
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
