import { userService } from './database';

// Script to update all users with default leave balances
export const updateLeaveBalances = async () => {
  try {
    // Get all users
    const users = await userService.getAllUsers();
    let updatedCount = 0;
    
    for (const user of users) {
      try {
        // Check if user already has leave balances set
        const needsUpdate = 
          typeof user.paidLeaves !== 'number' || 
          typeof user.sickLeaves !== 'number' || 
          typeof user.compOffs !== 'number';
        
        if (needsUpdate) {
          await userService.updateUser(user.$id, {
            paidLeaves: user.paidLeaves || 15, // Default: 15 paid leaves
            sickLeaves: user.sickLeaves || 10, // Default: 10 sick leaves
            compOffs: user.compOffs || 5,      // Default: 5 comp-off leaves
          });
          updatedCount++;
        } else {
        }
      } catch (error) {
        console.error(`❌ Failed to update ${user.firstName} ${user.lastName}:`, error);
      }
    }
    return { success: true, updatedCount };
    
  } catch (error) {
    console.error('❌ Error updating leave balances:', error);
    return { success: false, error };
  }
};

// Execute if run directly
if (require.main === module) {
  updateLeaveBalances()
    .then((result) => {
      if (result.success) {
      } else {
        console.error('❌ Script failed:', result.error);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Unexpected error:', error);
      process.exit(1);
    });
}
