import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { LeaveRequest } from '@/types';
import { Query } from 'appwrite';

export class LeaveService {
  async getAllLeaveRequests(): Promise<LeaveRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [Query.orderDesc('$createdAt')]
      );
      return response.documents as unknown as LeaveRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async getLeaveRequestsByUser(userId: string): Promise<LeaveRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('userId', userId),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as LeaveRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async getPendingLeaveRequests(): Promise<LeaveRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        [
          Query.equal('status', 'pending'),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as LeaveRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async createLeaveRequest(leaveData: Omit<LeaveRequest, '$id' | '$createdAt' | '$updatedAt'>): Promise<LeaveRequest> {
    try {
      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        'unique()',
        leaveData
      );
      return response as unknown as LeaveRequest;
    } catch (error) {
      
      throw error;
    }
  }

  async updateLeaveRequest(leaveId: string, leaveData: Partial<Omit<LeaveRequest, '$id' | '$createdAt' | '$updatedAt'>>): Promise<LeaveRequest> {
    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId,
        leaveData
      );
      return response as unknown as LeaveRequest;
    } catch (error) {
      
      throw error;
    }
  }

  async approveLeaveRequest(leaveId: string): Promise<LeaveRequest> {
    return this.updateLeaveRequest(leaveId, { status: 'APPROVED' });
  }

  async rejectLeaveRequest(leaveId: string): Promise<LeaveRequest> {
    return this.updateLeaveRequest(leaveId, { status: 'REJECTED' });
  }

  async deleteLeaveRequest(leaveId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.LEAVES,
        leaveId
      );
    } catch (error) {
      
      throw error;
    }
  }

  async getApprovedLeavesByDateRange(startDate: string, endDate: string): Promise<LeaveRequest[]> {
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
      return response.documents as unknown as LeaveRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async getApprovedLeavesForWeek(startDate: string): Promise<LeaveRequest[]> {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    return this.getApprovedLeavesByDateRange(startDate, endDate.toISOString().split('T')[0]);
  }

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
      console.error('Error checking if user is on leave:', error);
      return false;
    }
  }

  async cancelLeaveRequest(leaveId: string): Promise<LeaveRequest> {
    return this.updateLeaveRequest(leaveId, { status: 'CANCELLED' });
  }
}

export const leaveService = new LeaveService();
