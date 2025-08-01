import { NextRequest, NextResponse } from 'next/server';
import { userManagementService } from '@/lib/appwrite/user-management';

export async function POST(request: NextRequest) {
  try {
    const userData = await request.json();

    // Validate required fields
    const requiredFields = ['firstName', 'lastName', 'email', 'password', 'role'];
    for (const field of requiredFields) {
      if (!userData[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Ensure username is provided, fallback to email prefix if not provided
    const username = userData.username || userData.email.split('@')[0];
    
    // Validate username format (only alphanumeric and underscore allowed for clean IDs)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json(
        { error: 'Username must contain only letters, numbers, and underscores' },
        { status: 400 }
      );
    }

    // Create user in both auth and database
    const result = await userManagementService.createUser({
      firstName: userData.firstName,
      lastName: userData.lastName,
      username: username, // Use the validated username
      email: userData.email,
      password: userData.password,
      role: userData.role,
      manager: userData.managerId || userData.manager,
      paidLeaves: userData.paidLeaves ?? 20,
      sickLeaves: userData.sickLeaves ?? 12,
      compOffs: userData.compOffs ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: {
        authUserId: result.authUser.$id,
        dbUser: result.dbUser
      }
    });

  } catch (error) {
    console.error('Error creating user:', error);
    
    // Handle specific Appwrite errors
    if (error && typeof error === 'object' && 'code' in error) {
      const appwriteError = error as { code: number; message: string };
      
      if (appwriteError.code === 409) {
        return NextResponse.json(
          { error: 'User with this email already exists' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { userId, ...updates } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const updatedUser = await userManagementService.updateUser(userId, updates);

    return NextResponse.json({
      success: true,
      data: updatedUser
    });

  } catch (error) {
    console.error('Error updating user:', error);
    
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    await userManagementService.deleteUser(userId);

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
