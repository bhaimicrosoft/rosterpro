import { databases, DATABASE_ID, COLLECTIONS } from './config';
import { User } from '@/types';
import { Query } from 'appwrite';

export class UserService {
  async getAllUsers(): Promise<User[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [Query.orderDesc('$createdAt')]
      );
      return response.documents as unknown as User[];
    } catch (error) {
      console.error('Error fetching all users:', error);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<User> {
    try {
      const response = await databases.getDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId
      );
      return response as unknown as User;
    } catch (error) {
      console.error('Error fetching user by ID:', error);
      throw error;
    }
  }

  async getUsersByRole(role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'): Promise<User[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [
          Query.equal('role', role),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as User[];
    } catch (error) {
      console.error('Error fetching users by role:', error);
      throw error;
    }
  }

  async getUsersByManager(managerId: string): Promise<User[]> {
    try {
      const response = await databases.listDocuments(
        DATABASE_ID,
        COLLECTIONS.USERS,
        [
          Query.equal('manager', managerId),
          Query.orderDesc('$createdAt')
        ]
      );
      return response.documents as unknown as User[];
    } catch (error) {
      console.error('Error fetching users by manager:', error);
      throw error;
    }
  }

  async createUser(userData: Omit<User, '$id' | '$createdAt' | '$updatedAt'>): Promise<User> {
    try {
      const response = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        'unique()',
        userData
      );
      return response as unknown as User;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  async updateUser(userId: string, userData: Partial<Omit<User, '$id' | '$createdAt' | '$updatedAt'>>): Promise<User> {
    try {
      const response = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId,
        userData
      );
      return response as unknown as User;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await databases.deleteDocument(
        DATABASE_ID,
        COLLECTIONS.USERS,
        userId
      );
    } catch (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
  }

  async getManagers(): Promise<User[]> {
    return this.getUsersByRole('MANAGER');
  }

  async getEmployees(): Promise<User[]> {
    return this.getUsersByRole('EMPLOYEE');
  }
}

export const userService = new UserService();
