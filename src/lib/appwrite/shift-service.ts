import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { Shift } from '@/types';
import { Query } from 'appwrite';
import { leaveService } from './database';

export class ShiftService {
  async getAllShifts(): Promise<Shift[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [Query.orderDesc('date')]
      );
      return response.documents as unknown as Shift[];
    } catch (error) {
      
      throw error;
    }
  }

  async getShiftsByUser(userId: string): Promise<Shift[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.equal('userId', userId),
          Query.orderDesc('date')
        ]
      );
      return response.documents as unknown as Shift[];
    } catch (error) {
      
      throw error;
    }
  }

  async getShiftsByDateRange(startDate: string, endDate: string | null = null): Promise<Shift[]> {
    try {
      const queries = [
        Query.greaterThanEqual('date', startDate),
        Query.orderAsc('date')
      ];
      
      // Only add end date filter if endDate is provided
      if (endDate) {
        queries.splice(1, 0, Query.lessThanEqual('date', endDate));
      }
      
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        queries
      );
      return response.documents as unknown as Shift[];
    } catch (error) {
      
      throw error;
    }
  }

  async getTodayShifts(): Promise<Shift[]> {
    const today = new Date().toISOString().split('T')[0];
    return this.getShiftsByDateRange(today, today);
  }

  async getUpcomingShifts(userId: string, days: number = 7): Promise<Shift[]> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.equal('userId', userId),
          Query.greaterThanEqual('date', today),
          Query.lessThanEqual('date', futureDate),
          Query.orderAsc('date')
        ]
      );
      return response.documents as unknown as Shift[];
    } catch (error) {
      
      throw error;
    }
  }

  async createShift(shiftData: Omit<Shift, '$id' | 'createdAt' | 'updatedAt'>): Promise<Shift> {
    try {
      // Check if user is on approved leave for this date
      const isOnLeave = await leaveService.isUserOnLeave(shiftData.userId, shiftData.date);
      if (isOnLeave) {
        throw new Error(`Cannot assign shift to employee who is on approved leave for ${shiftData.date}. Please check their leave schedule.`);
      }

      // Check for existing shift with same date and role
      const existingShifts = await this.getShiftsByDateRange(shiftData.date, shiftData.date);
      const conflictingShift = existingShifts.find(shift => 
        shift.onCallRole === shiftData.onCallRole
      );
      
      if (conflictingShift) {
        throw new Error(`A ${shiftData.onCallRole.toLowerCase()} shift already exists for ${shiftData.date}. Please remove the existing assignment first.`);
      }

      // Only include valid Appwrite attributes
      const validData = {
        userId: shiftData.userId,
        date: shiftData.date,
        onCallRole: shiftData.onCallRole,
        status: shiftData.status || 'SCHEDULED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        'unique()',
        validData
      );
      return response as unknown as Shift;
    } catch (error) {
      
      throw error;
    }
  }

  async updateShift(shiftId: string, shiftData: Partial<Omit<Shift, '$id' | 'createdAt' | 'updatedAt'>>): Promise<Shift> {
    try {
      // If updating userId or date, check if user is on approved leave
      if (shiftData.userId || shiftData.date) {
        // Get current shift data to determine which user/date to check
        const currentShift = await databases.getDocument(DATABASE_ID, COLLECTIONS.SHIFTS, shiftId);
        const userIdToCheck = shiftData.userId || currentShift.userId;
        const dateToCheck = shiftData.date || currentShift.date;
        
        const isOnLeave = await leaveService.isUserOnLeave(userIdToCheck, dateToCheck);
        if (isOnLeave) {
          throw new Error(`Cannot assign shift to employee who is on approved leave for ${dateToCheck}. Please check their leave schedule.`);
        }
      }

      // Only include valid Appwrite attributes
      const validData: Record<string, unknown> = {
        updatedAt: new Date().toISOString()
      };
      
      if (shiftData.userId) validData.userId = shiftData.userId;
      if (shiftData.date) validData.date = shiftData.date;
      if (shiftData.onCallRole) validData.onCallRole = shiftData.onCallRole;
      if (shiftData.status) validData.status = shiftData.status;

      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId,
        validData
      );
      return response as unknown as Shift;
    } catch (error) {
      
      throw error;
    }
  }

  async deleteShift(shiftId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        shiftId
      );
    } catch (error) {
      
      throw error;
    }
  }
}

export const shiftService = new ShiftService();
