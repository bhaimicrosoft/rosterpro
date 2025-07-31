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
    return this.updateSwapRequest(swapId, { status: 'APPROVED' });
  }

  async rejectSwapRequest(swapId: string): Promise<SwapRequest> {
    return this.updateSwapRequest(swapId, { status: 'REJECTED' });
  }

  async approveAndExecuteSwap(swapId: string, responseNotes?: string): Promise<SwapRequest> {
    try {
      // First get the swap request details
      const swapResponse = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.SWAP_REQUESTS,
        swapId
      );
      const swapRequest = swapResponse as unknown as SwapRequest;

      // Import shift service to perform the actual swap
      const { shiftService } = await import('./shift-service');
      
      // Perform the actual shift swap
      await shiftService.swapShifts(swapRequest.requesterShiftId, swapRequest.targetShiftId);

      // Update the swap request status
      const updateData: Partial<Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'>> = { 
        status: 'APPROVED',
        respondedAt: new Date().toISOString()
      };
      
      if (responseNotes) {
        updateData.responseNotes = responseNotes;
      }

      return this.updateSwapRequest(swapId, updateData);
    } catch (error) {
      console.error('🚀 Error approving and executing swap:', error);
      throw error;
    }
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
