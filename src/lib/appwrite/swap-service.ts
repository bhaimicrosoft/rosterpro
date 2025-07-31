import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { SwapRequest } from '@/types';
import { Query } from 'appwrite';

export class SwapService {
  async getAllSwapRequests(): Promise<SwapRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        [Query.orderDesc('$createdAt')]
      );
      return response.documents as unknown as SwapRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async getSwapRequestsByUser(userId: string): Promise<SwapRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        [
          Query.or([
            Query.equal('requesterUserId', userId),
            Query.equal('targetUserId', userId)
          ]),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as SwapRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async getPendingSwapRequests(): Promise<SwapRequest[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        [
          Query.equal('status', 'pending'),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as SwapRequest[];
    } catch (error) {
      
      throw error;
    }
  }

  async createSwapRequest(swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'>): Promise<SwapRequest> {
    try {
      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        'unique()',
        swapData
      );
      return response as unknown as SwapRequest;
    } catch (error) {
      
      throw error;
    }
  }

  async updateSwapRequest(swapId: string, swapData: Partial<Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'>>): Promise<SwapRequest> {
    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        swapId,
        swapData
      );
      return response as unknown as SwapRequest;
    } catch (error) {
      
      throw error;
    }
  }

  async approveSwapRequest(swapId: string): Promise<SwapRequest> {
    return this.updateSwapRequest(swapId, { status: 'approved' });
  }

  async rejectSwapRequest(swapId: string): Promise<SwapRequest> {
    return this.updateSwapRequest(swapId, { status: 'rejected' });
  }

  async deleteSwapRequest(swapId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        swapId
      );
    } catch (error) {
      
      throw error;
    }
  }
}

export const swapService = new SwapService();
