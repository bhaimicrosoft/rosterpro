import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { ID, Query } from 'appwrite';
import { User, Shift, LeaveRequest, SwapRequest, Notification } from '@/types';
import { notificationService } from '@/lib/appwrite/notification-service';

// Helper function to safely cast Appwrite documents to our types
const castDocument = <T>(doc: unknown): T => doc as T;
const castDocuments = <T>(docs: unknown[]): T[] => docs as T[];

// Helper function to remove read-only fields from updates
const cleanUpdateData = <T extends Record<string, unknown>>(data: T) => {
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
      const response = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId
      );
      return castDocument<Shift>(response);
    } catch (error) {
      console.error('🚀 Error getting shift details:', error);
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
      const cleanedUpdates = cleanUpdateData(updates);
      
      const leave = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        cleanedUpdates
      );
      return castDocument<LeaveRequest>(leave);
    } catch (error) {
      
      throw error;
    }
  },

  async approveLeaveRequest(leaveId: string) {
    console.log('🚀 === approveLeaveRequest called with leaveId:', leaveId);
    console.log('🚀 DATABASE_ID:', DATABASE_ID);
    console.log('🚀 COLLECTIONS.LEAVES:', COLLECTIONS.LEAVES);
    console.log('🚀 COLLECTIONS.USERS:', COLLECTIONS.USERS);
    console.log('🚀 COLLECTIONS.NOTIFICATIONS:', COLLECTIONS.NOTIFICATIONS);
    
    try {
      // First get the leave request to calculate days and get user info
      console.log('🚀 Step 1: Getting leave request...');
      const leaveRequest = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );

      console.log('🚀 Step 1 SUCCESS: Leave request fetched:', {
        id: leaveRequest.$id,
        userId: leaveRequest.userId,
        type: leaveRequest.type,
        startDate: leaveRequest.startDate,
        endDate: leaveRequest.endDate,
        status: leaveRequest.status
      });

      // Calculate number of days (inclusive of start and end date)
      const startDate = new Date(leaveRequest.startDate);
      const endDate = new Date(leaveRequest.endDate);
      const timeDiff = endDate.getTime() - startDate.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates

      console.log(`🚀 Step 2: Calculated ${daysDiff} days for leave request from ${leaveRequest.startDate} to ${leaveRequest.endDate}`);

      // Get current user to get their leave balances
      console.log('🚀 Step 3: Getting user data for userId:', leaveRequest.userId);
      const currentUser = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        leaveRequest.userId
      );

      console.log('🚀 Step 3 SUCCESS: Current user data fetched:', {
        userId: currentUser.$id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        paidLeaves: currentUser.paidLeaves,
        sickLeaves: currentUser.sickLeaves,
        compOffs: currentUser.compOffs,
        leaveTypeRequested: leaveRequest.type,
        daysToDeduct: daysDiff
      });

      // Calculate new balances based on leave type with explicit field checking
      const updateData: { paidLeaves?: number; sickLeaves?: number; compOffs?: number } = {};
      let currentBalance = 0;
      let newBalance = 0;
      
      switch (leaveRequest.type) {
        case 'PAID':
          currentBalance = currentUser.paidLeaves || 0;
          newBalance = Math.max(0, currentBalance - daysDiff);
          updateData.paidLeaves = newBalance;
          console.log(`🚀 PAID LEAVE: Current=${currentBalance}, Deducting=${daysDiff}, New=${newBalance}`);
          break;
        case 'SICK':
          currentBalance = currentUser.sickLeaves || 0;
          newBalance = Math.max(0, currentBalance - daysDiff);
          updateData.sickLeaves = newBalance;
          console.log(`🚀 SICK LEAVE: Current=${currentBalance}, Deducting=${daysDiff}, New=${newBalance}`);
          break;
        case 'COMP_OFF':
          currentBalance = currentUser.compOffs || 0;
          newBalance = Math.max(0, currentBalance - daysDiff);
          updateData.compOffs = newBalance;
          console.log(`🚀 COMP_OFF LEAVE: Current=${currentBalance}, Deducting=${daysDiff}, New=${newBalance}`);
          break;
        default:
          throw new Error(`Unknown leave type: ${leaveRequest.type}`);
      }

      console.log('🚀 Step 4: Update data to be applied:', updateData);

      // Validate that we have enough balance
      if (currentBalance < daysDiff) {
        console.log(`🚀 ERROR: Insufficient balance. Current=${currentBalance}, Required=${daysDiff}`);
        throw new Error(`Insufficient ${leaveRequest.type.toLowerCase().replace('_', ' ')} leave balance. Available: ${currentBalance}, Required: ${daysDiff}`);
      }

      // Update user's leave balance
      console.log('🚀 Step 5: Updating user leave balance...');
      console.log('🚀 Step 5: Calling updateDocument with:', {
        database: DATABASE_ID,
        collection: COLLECTIONS.USERS,
        document: leaveRequest.userId,
        data: updateData
      });
      
      const updatedUser = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        leaveRequest.userId,
        updateData
      );

      console.log('🚀 Step 5 SUCCESS: User leave balance updated. New values:', {
        userId: updatedUser.$id,
        paidLeaves: updatedUser.paidLeaves,
        sickLeaves: updatedUser.sickLeaves,
        compOffs: updatedUser.compOffs
      });

      // Update leave request status to approved
      console.log('🚀 Step 6: Updating leave request status...');
      const leave = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        { status: 'APPROVED' }
      );
      
      console.log('🚀 Step 6 SUCCESS: Leave request status updated to APPROVED');

      // Create notification to employee about approval
      try {
        console.log('🚀 Step 7: Creating approval notification for user:', leaveRequest.userId);
        
        await notificationService.createNotification({
          userId: leaveRequest.userId,
          type: 'LEAVE_APPROVED',
          title: 'Leave Request Approved',
          message: `Your ${leaveRequest.type.toLowerCase().replace('_', ' ')} leave request from ${leaveRequest.startDate} to ${leaveRequest.endDate} has been approved. ${daysDiff} day${daysDiff > 1 ? 's' : ''} have been deducted from your balance.`,
          read: false
        });
        console.log('🚀 Step 7 SUCCESS: Approval notification created successfully');
      } catch (notifError) {
        console.error('🚀 Step 7 FAILED: Failed to create approval notification:', notifError);
        // Don't block the approval if notification fails
      }

      console.log('🚀 ALL STEPS COMPLETED: Returning approved leave request');
      return castDocument<LeaveRequest>(leave);
    } catch (error) {
      console.error('🚀 ERROR in approveLeaveRequest:', error);
      if (error instanceof Error) {
        console.error('🚀 ERROR details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  },

  async isUserOnLeave(userId: string, date: string) {
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
      console.error('Error checking if user is on leave:', error);
      return false;
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
      console.error('Error getting approved leaves by date range:', error);
      throw error;
    }
  },

  async rejectLeaveRequest(leaveId: string) {
    console.log('🚀 === rejectLeaveRequest called with leaveId:', leaveId);
    try {
      // First get the leave request to get user info
      const leaveRequest = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );

      console.log('🚀 Leave request fetched for rejection:', leaveRequest);

      // Update leave request status to rejected
      const leave = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        { status: 'REJECTED' }
      );
      
      console.log('🚀 Leave request status updated to REJECTED');

      // Create notification to employee about rejection
      try {
        console.log('🚀 Creating rejection notification for user:', leaveRequest.userId);
        await notificationService.createNotification({
          userId: leaveRequest.userId,
          type: 'LEAVE_REJECTED',
          title: 'Leave Request Rejected',
          message: `Your ${leaveRequest.type.toLowerCase().replace('_', ' ')} leave request from ${leaveRequest.startDate} to ${leaveRequest.endDate} has been rejected`,
          read: false
        });
        console.log('🚀 Rejection notification created successfully');
      } catch (notifError) {
        console.error('🚀 Failed to create rejection notification:', notifError);
        // Don't block the rejection if notification fails
      }

      return castDocument<LeaveRequest>(leave);
    } catch (error) {
      console.error('🚀 ERROR in rejectLeaveRequest:', error);
      throw error;
    }
  },
};

// Swap request services
export const swapService = {
  async createSwapRequest(swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'>) {
    try {
      const swap = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        ID.unique(),
        {
          ...swapData,
          requestedAt: new Date().toISOString(),
        }
      );
      return castDocument<SwapRequest>(swap);
    } catch (error) {
      
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
      return castDocument<SwapRequest>(swap);
    } catch (error) {
      
      throw error;
    }
  },

  async approveAndExecuteSwap(swapId: string, responseNotes?: string) {
    try {
      console.log('🚀 === approveAndExecuteSwap CALLED with swapId:', swapId);
      
      // First get the swap request details
      const swapResponse = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        swapId
      );
      const swapRequest = castDocument<SwapRequest>(swapResponse);
      
      console.log('🚀 Swap request details:', swapRequest);

      // Perform the actual shift swap
      const [requesterShiftResponse, targetShiftResponse] = await Promise.all([
        databases.getDocument(DATABASE_ID, COLLECTIONS.SHIFTS, swapRequest.requesterShiftId),
        databases.getDocument(DATABASE_ID, COLLECTIONS.SHIFTS, swapRequest.targetShiftId)
      ]);

      const requesterShift = castDocument<Shift>(requesterShiftResponse);
      const targetShift = castDocument<Shift>(targetShiftResponse);
      
      console.log('🚀 Swapping shifts:', { requesterShift, targetShift });

      // Swap the user assignments
      await Promise.all([
        databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.SHIFTS,
          swapRequest.requesterShiftId,
          {
            userId: targetShift.userId,
            status: 'SWAPPED'
          }
        ),
        databases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.SHIFTS,
          swapRequest.targetShiftId,
          {
            userId: requesterShift.userId,
            status: 'SWAPPED'
          }
        )
      ]);

      console.log('🚀 Shifts swapped successfully');

      // Update the swap request status
      const updateData = { 
        status: 'APPROVED' as const,
        respondedAt: new Date().toISOString(),
        ...(responseNotes && { responseNotes })
      };

      const updatedSwap = await this.updateSwapRequest(swapId, updateData);
      
      console.log('🚀 Swap request updated:', updatedSwap);
      
      return updatedSwap;
    } catch (error) {
      console.error('🚀 Error approving and executing swap:', error);
      throw error;
    }
  },
};
