import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { Notification, NotificationType } from '@/types';
import { Query } from 'appwrite';

export class NotificationService {
  async getAllNotifications(): Promise<Notification[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        [Query.orderDesc('$createdAt')]
      );
      return response.documents as unknown as Notification[];
    } catch (error) {
      throw error;
    }
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        [
          Query.equal('userId', userId),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as Notification[];
    } catch (error) {
      throw error;
    }
  }

  async getUnreadNotificationsByUser(userId: string): Promise<Notification[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        [
          Query.equal('userId', userId),
          Query.equal('read', false),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as Notification[];
    } catch (error) {
      throw error;
    }
  }

  async createNotification(notificationData: Omit<Notification, '$id' | '$createdAt'>): Promise<Notification> {
    try {
      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        'unique()',
        notificationData
      );
      return response as unknown as Notification;
    } catch (error) {
      throw error;
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<Notification> {
    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        notificationId,
        { read: true }
      );
      return response as unknown as Notification;
    } catch (error) {
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    try {
      // Get all unread notifications for the user
      const unreadNotifications = await this.getUnreadNotificationsByUser(userId);
      
      // Mark each as read
      await Promise.all(
        unreadNotifications.map(notification => 
          this.markNotificationAsRead(notification.$id)
        )
      );
    } catch (error) {
      throw error;
    }
  }

  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        notificationId
      );
    } catch (error) {
      throw error;
    }
  }

  // Helper method to create leave request notifications
  async createLeaveRequestNotification(
    managerId: string, 
    employeeName: string, 
    leaveType: string, 
    startDate: string, 
    endDate: string,
    leaveRequestId: string
  ): Promise<Notification> {
    return this.createNotification({
      userId: managerId,
      type: 'leave_request' as NotificationType,
      title: 'New Leave Request',
      message: `${employeeName} has requested ${leaveType.toLowerCase().replace('_', ' ')} leave from ${startDate} to ${endDate}`,
      read: false,
      relatedId: leaveRequestId
    });
  }

  // Helper method to create leave response notifications
  async createLeaveResponseNotification(
    employeeId: string,
    status: 'APPROVED' | 'REJECTED',
    leaveType: string,
    startDate: string,
    endDate: string,
    leaveRequestId: string,
    managerComment?: string
  ): Promise<Notification> {
    const statusMessage = status === 'APPROVED' ? 'approved' : 'rejected';
    const message = `Your ${leaveType.toLowerCase().replace('_', ' ')} leave request from ${startDate} to ${endDate} has been ${statusMessage}`;
    const fullMessage = managerComment ? `${message}. Manager's note: ${managerComment}` : message;

    return this.createNotification({
      userId: employeeId,
      type: 'leave_response' as NotificationType,
      title: `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: fullMessage,
      read: false,
      relatedId: leaveRequestId
    });
  }

  // Helper method to create swap request notifications
  async createSwapRequestNotification(
    targetUserId: string,
    requesterName: string,
    shiftDate: string,
    swapRequestId: string
  ): Promise<Notification> {
    return this.createNotification({
      userId: targetUserId,
      type: 'swap_request' as NotificationType,
      title: 'New Shift Swap Request',
      message: `${requesterName} wants to swap shifts with you for ${shiftDate}`,
      read: false,
      relatedId: swapRequestId
    });
  }

  // Helper method to create swap response notifications
  async createSwapResponseNotification(
    requesterId: string,
    status: 'APPROVED' | 'REJECTED',
    shiftDate: string,
    swapRequestId: string,
    responderName: string
  ): Promise<Notification> {
    const statusMessage = status === 'APPROVED' ? 'accepted' : 'declined';
    
    return this.createNotification({
      userId: requesterId,
      type: 'swap_response' as NotificationType,
      title: `Swap Request ${status === 'APPROVED' ? 'Accepted' : 'Declined'}`,
      message: `${responderName} has ${statusMessage} your shift swap request for ${shiftDate}`,
      read: false,
      relatedId: swapRequestId
    });
  }
}

export const notificationService = new NotificationService();
