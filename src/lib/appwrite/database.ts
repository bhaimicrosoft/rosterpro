import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { ID, Query } from 'appwrite';
import { User, Shift, LeaveRequest, SwapRequest, Notification } from '@/types';

// Helper function to safely cast Appwrite documents to our types
const castDocument = <T>(doc: unknown): T => doc as T;
const castDocuments = <T>(docs: unknown[]): T[] => docs as T[];

// Helper function to remove read-only fields from updates
const cleanUpdateData = <T extends Record<string, unknown>>(data: T) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId, ...cleanData } = data as T & {
    $id?: string;
    $createdAt?: string;
    $updatedAt?: string;
    $permissions?: string[];
    $collectionId?: string;
    $databaseId?: string;
  };
  return cleanData;
};

// User services
export const userService = {
  async createUser(userData: Omit<User, '$id' | '$createdAt' | '$updatedAt'>) {
    try {
      const user = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        ID.unique(),
        userData
      );
      return castDocument<User>(user);
    } catch (error) {
      
      throw error;
    }
  },

  async getAllUsers() {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.orderAsc('firstName')]
      );
      return castDocuments<User>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getUserById(userId: string) {
    try {
      const user = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId
      );
      return castDocument<User>(user);
    } catch (error) {
      
      throw error;
    }
  },

  async updateUser(userId: string, updates: Partial<User>) {
    try {
      const cleanedUpdates = cleanUpdateData(updates);
      
      const user = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId,
        cleanedUpdates
      );
      return castDocument<User>(user);
    } catch (error) {
      
      throw error;
    }
  },

  async deleteUser(userId: string) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId
      );
    } catch (error) {
      
      throw error;
    }
  },

  async getEmployeesByManager(managerId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.equal('manager', managerId)]
      );
      return castDocuments<User>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },
};

// Shift services
export const shiftService = {
  async createShift(shiftData: Omit<Shift, '$id' | '$createdAt' | '$updatedAt' | 'createdAt' | 'updatedAt'>) {
    try {
      const shift = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        ID.unique(),
        {
          ...shiftData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );
      return castDocument<Shift>(shift);
    } catch (error) {
      
      throw error;
    }
  },

  async getShiftsByDateRange(startDate: string, endDate: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.greaterThanEqual('date', startDate),
          Query.lessThanEqual('date', endDate),
          Query.orderAsc('date'),
        ]
      );
      return castDocuments<Shift>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getShiftsByUser(userId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.equal('userId', userId),
          Query.orderDesc('date'),
        ]
      );
      return castDocuments<Shift>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getShiftsByUserFromToday(userId: string) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.equal('userId', userId),
          Query.greaterThanEqual('date', today),
          Query.orderAsc('date'),
        ]
      );
      return castDocuments<Shift>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async updateShift(shiftId: string, updates: Partial<Shift>) {
    try {
      const cleanedUpdates = cleanUpdateData({
        ...updates,
        updatedAt: new Date().toISOString(),
      });
      
      const shift = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId,
        cleanedUpdates
      );
      return castDocument<Shift>(shift);
    } catch (error) {
      
      throw error;
    }
  },

  async deleteShift(shiftId: string) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId
      );
    } catch (error) {
      
      throw error;
    }
  },

  async getShiftDetails(shiftId: string) {
    try {
      const shift = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId
      );
      return castDocument<Shift>(shift);
    } catch (error) {
      
      throw error;
    }
  },

  async swapShifts(requesterShiftId: string, targetShiftId: string) {
    try {
      // Get both shifts
      const [requesterShift, targetShift] = await Promise.all([
        this.getShiftDetails(requesterShiftId),
        this.getShiftDetails(targetShiftId)
      ]);

      // Swap the userId assignments
      await Promise.all([
        this.updateShift(requesterShiftId, {
          userId: targetShift.userId,
          updatedAt: new Date().toISOString()
        }),
        this.updateShift(targetShiftId, {
          userId: requesterShift.userId,
          updatedAt: new Date().toISOString()
        })
      ]);

      return { success: true };
    } catch (error) {
      console.error('Error swapping shifts:', error);
      throw error;
    }
  },
};

// Leave request services
export const leaveService = {
  async createLeaveRequest(leaveData: Omit<LeaveRequest, '$id' | '$createdAt' | '$updatedAt'>) {
    try {
      const leave = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        ID.unique(),
        leaveData
      );
      return castDocument<LeaveRequest>(leave);
    } catch (error) {
      
      throw error;
    }
  },

  async getLeaveRequestsByUser(userId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('userId', userId),
          Query.orderDesc('$createdAt'),
        ]
      );
      return castDocuments<LeaveRequest>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getAllLeaveRequests() {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [Query.orderDesc('$createdAt')]
      );
      return castDocuments<LeaveRequest>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async updateLeaveRequest(leaveId: string, updates: Partial<LeaveRequest>) {
    try {
      // Get the current leave request to check previous status
      const currentLeave = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );
      const currentLeaveData = castDocument<LeaveRequest>(currentLeave);

      const cleanedUpdates = cleanUpdateData(updates);
      
      const leave = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        cleanedUpdates
      );
      const updatedLeave = castDocument<LeaveRequest>(leave);

      // Handle balance deduction/restoration when status changes
      if (updates.status && updates.status !== currentLeaveData.status) {
        await this.handleLeaveBalanceUpdate(updatedLeave, currentLeaveData.status, updates.status);
      }
      
      return updatedLeave;
    } catch (error) {
      console.error('Error updating leave request:', error);
      throw error;
    }
  },

  // Helper function to handle leave balance updates
  async handleLeaveBalanceUpdate(leaveRequest: LeaveRequest, oldStatus: string, newStatus: string) {
    try {
      const user = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        leaveRequest.userId
      );
      const userData = castDocument<User>(user);

      // Calculate leave days
      const startDate = new Date(leaveRequest.startDate);
      const endDate = new Date(leaveRequest.endDate);
      const leaveDays = Math.ceil(Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      const balanceUpdates: Record<string, number> = {};

      // Determine balance field based on leave type
      const balanceField = leaveRequest.type === 'PAID' ? 'paidLeaves' : 
                          leaveRequest.type === 'SICK' ? 'sickLeaves' : 'compOffs';

      console.log(`🔍 Leave balance update: User ${leaveRequest.userId}, Type: ${leaveRequest.type}, Field: ${balanceField}, Days: ${leaveDays}, ${oldStatus} → ${newStatus}`);

      // Handle status transitions
      if (oldStatus === 'PENDING' && newStatus === 'APPROVED') {
        // Deduct balance when approving
        const currentBalance = userData[balanceField] || 0;
        balanceUpdates[balanceField] = Math.max(0, currentBalance - leaveDays);
        console.log(`💰 Deducting balance: ${currentBalance} - ${leaveDays} = ${balanceUpdates[balanceField]}`);
      } else if (oldStatus === 'APPROVED' && (newStatus === 'REJECTED' || newStatus === 'CANCELLED')) {
        // Restore balance when rejecting or cancelling approved leave
        const currentBalance = userData[balanceField] || 0;
        balanceUpdates[balanceField] = currentBalance + leaveDays;
        console.log(`💰 Restoring balance: ${currentBalance} + ${leaveDays} = ${balanceUpdates[balanceField]}`);
      } else if (oldStatus === 'PENDING' && newStatus === 'CANCELLED') {
        // No balance change needed for cancelled pending requests
        console.log(`ℹ️ No balance change needed for PENDING → CANCELLED`);
        return;
      } else {
        console.log(`ℹ️ No balance change needed for ${oldStatus} → ${newStatus}`);
        return;
      }

      // Update user balance if there are changes
      if (Object.keys(balanceUpdates).length > 0) {
        await databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.USERS,
          leaveRequest.userId,
          balanceUpdates
        );
        console.log(`✅ Updated ${balanceField} for user ${leaveRequest.userId}: ${oldStatus} → ${newStatus}, days: ${leaveDays}`);
      }
    } catch (error) {
      console.error('Error updating leave balance:', error);
      // Don't throw error to prevent leave update from failing
    }
  },

  async approveLeaveRequest(leaveId: string) {
    return this.updateLeaveRequest(leaveId, { status: 'APPROVED' });
  },

  async rejectLeaveRequest(leaveId: string) {
    return this.updateLeaveRequest(leaveId, { status: 'REJECTED' });
  },

  async cancelLeaveRequest(leaveId: string) {
    return this.updateLeaveRequest(leaveId, { status: 'CANCELLED' });
  },

  async deleteLeaveRequest(leaveId: string) {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );
    } catch (error) {
      console.error('Error deleting leave request:', error);
      throw error;
    }
  },

  async getPendingLeaveRequests() {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('status', 'PENDING'),
          Query.orderDesc('$createdAt')
        ]
      );
      return castDocuments<LeaveRequest>(response.documents);
    } catch (error) {
      console.error('Error getting pending leave requests:', error);
      throw error;
    }
  },

  async getApprovedLeavesByDateRange(startDate: string, endDate: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('status', 'APPROVED'),
          Query.lessThanEqual('startDate', endDate),
          Query.greaterThanEqual('endDate', startDate),
          Query.orderAsc('startDate')
        ]
      );
      return castDocuments<LeaveRequest>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getApprovedLeavesForWeek(startDate: string) {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return this.getApprovedLeavesByDateRange(startDate, endDate.toISOString().split('T')[0]);
  },

  async isUserOnLeave(userId: string, date: string): Promise<boolean> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('userId', userId),
          Query.equal('status', 'APPROVED'),
          Query.lessThanEqual('startDate', date),
          Query.greaterThanEqual('endDate', date),
          Query.limit(1)
        ]
      );
      return response.documents.length > 0;
    } catch (error) {
      
      throw error;
    }
  },
};

// Swap request services
export const swapService = {
  async createSwapRequest(swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt' | 'respondedAt' | 'managerComment'>) {
    try {
      // Create a clean data object with only the fields we want to send
      const cleanSwapData = {
        requesterShiftId: swapData.requesterShiftId,
        requesterUserId: swapData.requesterUserId,
        targetShiftId: swapData.targetShiftId,
        targetUserId: swapData.targetUserId,
        reason: swapData.reason,
        status: swapData.status,
        requestedAt: swapData.requestedAt,
        // Only include responseNotes if it exists and is not empty
        ...(swapData.responseNotes && { responseNotes: swapData.responseNotes })
      };

      const swap = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        ID.unique(),
        cleanSwapData
      );

      // Create notification for target user if there's a specific target
      if (swapData.targetUserId) {
        try {
          // Get shift details and user names for better notification
          const [requesterShift, targetShift, requesterUser, targetUser] = await Promise.all([
            shiftService.getShiftDetails(swapData.requesterShiftId),
            shiftService.getShiftDetails(swapData.targetShiftId),
            userService.getUserById(swapData.requesterUserId),
            userService.getUserById(swapData.targetUserId)
          ]);

          if (requesterShift && targetShift && requesterUser && targetUser) {
            const { notificationService } = await import('./notification-service');
            
            // Format dates for notification
            const requesterDate = new Date(requesterShift.date).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            });
            const targetDate = new Date(targetShift.date).toLocaleDateString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: 'numeric'
            });

            await notificationService.createSwapRequestNotification(
              swapData.targetUserId,
              `${requesterUser.firstName} ${requesterUser.lastName}`,
              requesterDate,
              targetDate,
              swap.$id
            );
          }
        } catch (notificationError) {
          // Don't fail the swap creation if notification fails
          console.error('Error creating swap request notification:', notificationError);
        }
      }

      return castDocument<SwapRequest>(swap);
    } catch (error) {
      console.error('Error creating swap request:', error);
      throw error;
    }
  },

  async getSwapRequestsByUser(userId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        [
          Query.or([
            Query.equal('requesterUserId', userId),
            Query.equal('targetUserId', userId),
          ]),
          Query.orderDesc('requestedAt'),
        ]
      );
      return castDocuments<SwapRequest>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async getAllSwapRequests() {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        [Query.orderDesc('requestedAt')]
      );
      return castDocuments<SwapRequest>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async updateSwapRequest(swapId: string, updates: Partial<SwapRequest>) {
    try {
      const cleanedUpdates = cleanUpdateData({
        ...updates,
        respondedAt: updates.status !== 'PENDING' ? new Date().toISOString() : undefined,
      });
      
      const swap = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        swapId,
        cleanedUpdates
      );

      // If the swap was approved, actually swap the shifts
      if (updates.status === 'APPROVED') {
        try {
          const swapRequest = castDocument<SwapRequest>(swap);
          await shiftService.swapShifts(swapRequest.requesterShiftId, swapRequest.targetShiftId);
        } catch (shiftSwapError) {
          console.error('Error swapping shifts after approval:', shiftSwapError);
          // Note: We don't throw here to avoid breaking the approval flow
          // The approval status is saved, but shifts might not be swapped
        }
      }
      
      return castDocument<SwapRequest>(swap);
    } catch (error) {
      
      throw error;
    }
  },
};

// Notification services
export const notificationService = {
  async createNotification(notificationData: Omit<Notification, '$id' | '$createdAt'>) {
    try {
      const notification = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        ID.unique(),
        notificationData
      );
      return castDocument<Notification>(notification);
    } catch (error) {
      
      throw error;
    }
  },

  async getNotificationsByUser(userId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        [
          Query.equal('userId', userId),
          Query.orderDesc('$createdAt'),
          Query.limit(50),
        ]
      );
      return castDocuments<Notification>(response.documents);
    } catch (error) {
      
      throw error;
    }
  },

  async markAsRead(notificationId: string) {
    try {
      const notification = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        notificationId,
        { read: true }
      );
      return castDocument<Notification>(notification);
    } catch (error) {
      
      throw error;
    }
  },

  async markAllAsRead(userId: string) {
    try {
      const notifications = await this.getNotificationsByUser(userId);
      const unreadNotifications = notifications.filter(n => !n.read);
      
      const promises = unreadNotifications.map(notification =>
        this.markAsRead(notification.$id)
      );
      
      await Promise.all(promises);
    } catch (error) {
      
      throw error;
    }
  },
};
