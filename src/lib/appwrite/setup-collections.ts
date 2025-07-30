// Collection setup script for Appwrite
// Run this script to create the required collections in your Appwrite database

import { databases, DATABASE_ID } from '@/lib/appwrite/config';
import { ID, Permission, Role } from 'appwrite';

interface CollectionAttribute {
  key: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'datetime' | 'email';
  status: 'available';
  required: boolean;
  array?: boolean;
  size?: number;
  default?: string | number | boolean;
}

const collectionsConfig = {
  users: {
    id: 'users',
    name: 'Users',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    documentSecurity: true,
    attributes: [
      { key: 'firstName', type: 'string', status: 'available', required: true, size: 100 },
      { key: 'lastName', type: 'string', status: 'available', required: true, size: 100 },
      { key: 'username', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'email', type: 'email', status: 'available', required: true },
      { key: 'role', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'manager', type: 'string', status: 'available', required: false, size: 50 },
      { key: 'paidLeaves', type: 'integer', status: 'available', required: true, default: 24 },
      { key: 'sickLeaves', type: 'integer', status: 'available', required: true, default: 12 },
      { key: 'compOffs', type: 'integer', status: 'available', required: true, default: 0 },
    ] as CollectionAttribute[],
  },
  shifts: {
    id: 'shifts',
    name: 'Shifts',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    documentSecurity: true,
    attributes: [
      { key: 'userId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'date', type: 'string', status: 'available', required: true, size: 10 },
      { key: 'onCallRole', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'status', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'createdAt', type: 'datetime', status: 'available', required: true },
      { key: 'updatedAt', type: 'datetime', status: 'available', required: true },
    ] as CollectionAttribute[],
  },
  leaves: {
    id: 'leaves',
    name: 'Leave Requests',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    documentSecurity: true,
    attributes: [
      { key: 'userId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'startDate', type: 'string', status: 'available', required: true, size: 10 },
      { key: 'endDate', type: 'string', status: 'available', required: true, size: 10 },
      { key: 'type', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'status', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'reason', type: 'string', status: 'available', required: false, size: 500 },
    ] as CollectionAttribute[],
  },
  swap_requests: {
    id: 'swap_requests',
    name: 'Swap Requests',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    documentSecurity: true,
    attributes: [
      { key: 'requesterShiftId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'requesterUserId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'targetShiftId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'targetUserId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'reason', type: 'string', status: 'available', required: true, size: 500 },
      { key: 'status', type: 'string', status: 'available', required: true, size: 20 },
      { key: 'responseNotes', type: 'string', status: 'available', required: false, size: 500 },
      { key: 'requestedAt', type: 'datetime', status: 'available', required: true },
      { key: 'respondedAt', type: 'datetime', status: 'available', required: false },
    ] as CollectionAttribute[],
  },
  notifications: {
    id: 'notifications',
    name: 'Notifications',
    permissions: [
      Permission.read(Role.any()),
      Permission.create(Role.users()),
      Permission.update(Role.users()),
      Permission.delete(Role.users()),
    ],
    documentSecurity: true,
    attributes: [
      { key: 'userId', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'type', type: 'string', status: 'available', required: true, size: 50 },
      { key: 'title', type: 'string', status: 'available', required: true, size: 200 },
      { key: 'message', type: 'string', status: 'available', required: true, size: 1000 },
      { key: 'read', type: 'boolean', status: 'available', required: true, default: false },
      { key: 'relatedId', type: 'string', status: 'available', required: false, size: 50 },
    ] as CollectionAttribute[],
  },
};

export async function createCollections() {
  try {
    
    
    for (const [key, config] of Object.entries(collectionsConfig)) {
      try {
        
        
        // Create the collection
        const collection = await databases.createCollection(
          DATABASE_ID,
          config.id,
          config.name,
          config.permissions,
          config.documentSecurity
        );
        
        
        
        // Create attributes for the collection
        for (const attr of config.attributes) {
          try {
            switch (attr.type) {
              case 'string':
              case 'email':
                await databases.createStringAttribute(
                  DATABASE_ID,
                  config.id,
                  attr.key,
                  attr.size || 255,
                  attr.required,
                  attr.default,
                  attr.array
                );
                break;
              case 'integer':
                await databases.createIntegerAttribute(
                  DATABASE_ID,
                  config.id,
                  attr.key,
                  attr.required,
                  undefined,
                  undefined,
                  attr.default
                );
                break;
              case 'boolean':
                await databases.createBooleanAttribute(
                  DATABASE_ID,
                  config.id,
                  attr.key,
                  attr.required,
                  attr.default
                );
                break;
              case 'datetime':
                await databases.createDatetimeAttribute(
                  DATABASE_ID,
                  config.id,
                  attr.key,
                  attr.required,
                  attr.default
                );
                break;
            }
            
          } catch (attrError) {
            
          }
        }
        
      } catch (collectionError) {
        
      }
    }
    
    
    return { success: true };
    
  } catch (error) {
    
    return { success: false, error };
  }
}

// Function to check if collections exist
export async function checkCollections() {
  try {
    const collections = await databases.listCollections(DATABASE_ID);
    const existingIds = collections.collections.map(c => c.$id);
    
    const requiredCollections = Object.keys(collectionsConfig);
    const missingCollections = requiredCollections.filter(id => !existingIds.includes(id));
    
    return {
      exists: missingCollections.length === 0,
      existing: existingIds,
      missing: missingCollections,
      total: requiredCollections.length,
    };
  } catch (error) {
    
    return {
      exists: false,
      error,
    };
  }
}
