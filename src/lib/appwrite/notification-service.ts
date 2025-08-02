import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { Notification } from '@/types';
import { ID, Query } from 'appwrite';

// Helper function to safely cast documents
function castDocument<T>(doc: unknown): T {
  return doc as T;
}

function castDocuments<T>(docs: unknown[]): T[] {
  return docs.map(doc => castDocument<T>(doc));
}

/**
 * Notification Service
 * 
 * Note: Shift assignment and swap notifications are now filtered to only send
 * notifications for shifts that are scheduled for today or in the future.
 * This prevents unnecessary notifications for completed/past shifts.
 */
export const notificationService = {
  // Create a new notification
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

  // Get notifications for a specific user
  async getNotificationsByUser(userId: string) {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.NOTIFICATIONS,
        [
          Query.equal('userId', userId),
          Query.orderDesc('$createdAt'),
          Query.limit(50) // Limit to recent notifications
        ]
      );
      return castDocuments<Notification>(response.documents);
    } catch (error) {
      throw error;
    }
  },

  // Mark a notification as read
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

  // Mark all notifications as read for a user
  async markAllAsRead(userId: string) {
    try {
      const notifications = await this.getNotificationsByUser(userId);
      const unreadNotifications = notifications.filter(n => !n.read);
      
      await Promise.all(
        unreadNotifications.map(notification => 
          this.markAsRead(notification.$id)
        )
      );
      
      return true;
    } catch (error) {
      throw error;
    }
  },

  // Helper method to create leave request notifications
  async createLeaveRequestNotification(managerId: string, employeeName: string, leaveType: string, startDate: string, endDate: string, leaveRequestId: string) {
    return this.createNotification({
      userId: managerId,
      type: 'LEAVE_REQUEST',
      title: 'New Leave Request',
      message: `${employeeName} has requested ${leaveType} leave from ${startDate} to ${endDate}`,
      read: false,
      relatedId: leaveRequestId
    });
  },

  // Helper method to create leave response notifications
  async createLeaveResponseNotification(employeeId: string, status: string, leaveType: string, startDate: string, endDate: string, leaveRequestId: string, managerComment?: string) {
    const fullMessage = managerComment 
      ? `Your ${leaveType} leave request from ${startDate} to ${endDate} has been ${status.toLowerCase()}. Manager comment: ${managerComment}`
      : `Your ${leaveType} leave request from ${startDate} to ${endDate} has been ${status.toLowerCase()}.`;
      
    return this.createNotification({
      userId: employeeId,
      type: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      title: `Leave Request ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
      message: fullMessage,
      read: false,
      relatedId: leaveRequestId
    });
  },

  // Helper method to create swap request notifications
  async createSwapRequestNotification(targetUserId: string, requesterName: string, requesterShiftDate: string, targetShiftDate: string, swapRequestId: string) {
    return this.createNotification({
      userId: targetUserId,
      type: 'SHIFT_SWAPPED',
      title: 'New Shift Swap Request',
      message: `${requesterName} wants to swap their ${requesterShiftDate} shift with your ${targetShiftDate} shift`,
      read: false,
      relatedId: swapRequestId
    });
  },

  // Helper method to create swap response notifications
  async createSwapResponseNotification(requesterId: string, status: string, targetShiftDate: string, swapRequestId: string, responderName: string) {
    const statusMessage = status === 'APPROVED' ? 'accepted' : 'declined';
    return this.createNotification({
      userId: requesterId,
      type: 'SHIFT_SWAPPED',
      title: `Swap Request ${status === 'APPROVED' ? 'Accepted' : 'Declined'}`,
      message: `${responderName} has ${statusMessage} your shift swap request for ${targetShiftDate}`,
      read: false,
      relatedId: swapRequestId
    });
  },

  // Helper method to create shift assignment notifications
  async createShiftAssignmentNotification(userId: string, shiftDate: string, onCallRole: string, shiftId: string, assignedBy?: string) {
    const roleText = onCallRole === 'PRIMARY' ? 'primary on-call' : 'backup on-call';
    const assignerText = assignedBy ? ` by ${assignedBy}` : '';
    
    return this.createNotification({
      userId: userId,
      type: 'SHIFT_ASSIGNED',
      title: 'New Shift Assignment',
      message: `You have been assigned as ${roleText} for ${shiftDate}${assignerText}`,
      read: false,
      relatedId: shiftId
    });
  },

  // Helper method to create general system notifications
  async createSystemNotification(userId: string, title: string, message: string, relatedId?: string) {
    return this.createNotification({
      userId: userId,
      type: 'general',
      title: title,
      message: message,
      read: false,
      relatedId: relatedId
    });
  }
};
