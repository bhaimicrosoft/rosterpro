import { databases, DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { ID, Query } from 'appwrite';
import { User, Shift, LeaveRequest, SwapRequest, Notification } from '@/types';

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
    console.log('=== approveLeaveRequest called with leaveId:', leaveId);
    try {
      // First get the leave request to calculate days and get user info
      const leaveRequest = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );

      console.log('Leave request fetched:', leaveRequest);

      // Calculate number of days (inclusive of start and end date)
      const startDate = new Date(leaveRequest.startDate);
      const endDate = new Date(leaveRequest.endDate);
      const timeDiff = endDate.getTime() - startDate.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates

      console.log(`Calculated ${daysDiff} days for leave request from ${leaveRequest.startDate} to ${leaveRequest.endDate}`);

      // Get current user to get their leave balances
      const currentUser = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        leaveRequest.userId
      );

      console.log('Current user before deduction:', {
        userId: leaveRequest.userId,
        paidLeaves: currentUser.paidLeaves,
        sickLeaves: currentUser.sickLeaves,
        compOffs: currentUser.compOffs,
        leaveType: leaveRequest.type,
        daysDiff
      });

      // Calculate new balances based on leave type
      const updateData: { paidLeaves?: number; sickLeaves?: number; compOffs?: number } = {};
      
      switch (leaveRequest.type) {
        case 'PAID':
          updateData.paidLeaves = Math.max(0, (currentUser.paidLeaves || 0) - daysDiff);
          break;
        case 'SICK':
          updateData.sickLeaves = Math.max(0, (currentUser.sickLeaves || 0) - daysDiff);
          break;
        case 'COMP_OFF':
          updateData.compOffs = Math.max(0, (currentUser.compOffs || 0) - daysDiff);
          break;
      }

      console.log('Update data to be applied:', updateData);

      // Update user's leave balance
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        leaveRequest.userId,
        updateData
      );

      console.log('User leave balance updated successfully');

      // Update leave request status to approved
      const leave = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        { status: 'APPROVED' }
      );
      
      console.log('Leave request status updated to APPROVED');
      return castDocument<LeaveRequest>(leave);
    } catch (error) {
      console.error('ERROR in approveLeaveRequest:', error);
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
