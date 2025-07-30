import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { Shift } from '@/types';
import { Query } from 'appwrite';

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
      console.error('Error fetching all shifts:', error);
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
      console.error('Error fetching shifts by user:', error);
      throw error;
    }
  }

  async getShiftsByDateRange(startDate: string, endDate: string): Promise<Shift[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SHIFTS,
        [
          Query.greaterThanEqual('date', startDate),
          Query.lessThanEqual('date', endDate),
          Query.orderAsc('date')
        ]
      );
      return response.documents as unknown as Shift[];
    } catch (error) {
      console.error('Error fetching shifts by date range:', error);
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
      console.error('Error fetching upcoming shifts:', error);
      throw error;
    }
  }

  async createShift(shiftData: Omit<Shift, '$id' | 'createdAt' | 'updatedAt'>): Promise<Shift> {
    try {
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
      console.error('Error creating shift:', error);
      throw error;
    }
  }

  async updateShift(shiftId: string, shiftData: Partial<Omit<Shift, '$id' | 'createdAt' | 'updatedAt'>>): Promise<Shift> {
    try {
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
      console.error('Error updating shift:', error);
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
      console.error('Error deleting shift:', error);
      throw error;
    }
  }
}

export const shiftService = new ShiftService();
