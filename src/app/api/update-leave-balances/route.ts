import { NextResponse } from 'next/server';
import { userService } from '@/lib/appwrite/database';

export async function POST() {
  try {
    // Get all users
    const users = await userService.getAllUsers();
    // Update each user with default leave balances
    const updatePromises = users.map(async (user) => {
      try {
        await userService.updateUser(user.$id, {
          paidLeaves: user.paidLeaves ?? 25,     // Default 25 paid leaves
          sickLeaves: user.sickLeaves ?? 12,     // Default 12 sick leaves  
          compOffs: user.compOffs ?? 8,          // Default 8 comp-off days
        });
        return { success: true, userId: user.$id, name: `${user.firstName} ${user.lastName}` };
      } catch (error) {
        return { 
          success: false, 
          userId: user.$id, 
          name: `${user.firstName} ${user.lastName}`, 
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });
    
    const results = await Promise.all(updatePromises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
    }
    
    return NextResponse.json({
      success: true,
      message: `Updated leave balances for ${successful.length} users`,
      details: {
        successful: successful.length,
        failed: failed.length,
        results
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
