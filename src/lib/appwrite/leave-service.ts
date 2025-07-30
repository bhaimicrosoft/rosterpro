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
      console.error('Error fetching all leave requests:', error);
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
      console.error('Error fetching leave requests by user:', error);
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
      console.error('Error fetching pending leave requests:', error);
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
      console.error('Error creating leave request:', error);
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
      console.error('Error updating leave request:', error);
      throw error;
    }
  }

  async approveLeaveRequest(leaveId: string): Promise<LeaveRequest> {
    return this.updateLeaveRequest(leaveId, { status: 'approved' });
  }

  async rejectLeaveRequest(leaveId: string): Promise<LeaveRequest> {
    return this.updateLeaveRequest(leaveId, { status: 'rejected' });
  }

  async deleteLeaveRequest(leaveId: string): Promise<void> {
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
  }
}

export const leaveService = new LeaveService();
