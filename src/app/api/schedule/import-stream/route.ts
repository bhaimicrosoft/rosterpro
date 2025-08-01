import { NextRequest, NextResponse } from 'next/server';
import { serverDatabases } from '@/lib/appwrite/server-config';
import { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

interface ShiftData {
  Primary?: string;
  Backup?: string;
  Date?: string | number;
  Day?: string;
}

interface ExistingShift {
  $id: string;
  date: string;
  onCallRole: string;
  userId: string;
}

interface ProcessedShift {
  $id?: string;
  username: string;
  role: string;
  action: string;
}

// Bulk notification for shift imports
const createBulkImportNotification = async (userId: string, shiftsCount: number) => {
  try {
    await serverDatabases.createDocument(
      DATABASE_ID,
      COLLECTIONS.NOTIFICATIONS,
      'unique()',
      {
        userId,
        type: 'SHIFT_ASSIGNED',
        title: 'Schedule Import Complete',
        message: `${shiftsCount} new shifts have been assigned to you via schedule import`,
        read: false
      }
    );
  } catch (error) {
    console.warn('Failed to create bulk import notification:', error);
  }
};

export async function POST(request: NextRequest) {
  try {
    const { shift, existingShifts } = await request.json();

    if (!shift) {
      return NextResponse.json(
        { error: 'Invalid shift data' },
        { status: 400 }
      );
    }

    const { Primary, Backup, Date: shiftDate } = shift;
    
    if (!shiftDate) {
      return NextResponse.json({
        success: false,
        error: 'Missing date',
        skipped: true
      });
    }

    // Get all users to validate usernames (cache this in frontend)
    const users = await serverDatabases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS
    );

    const userMap = new Map(users.documents.map(user => [user.username, user]));
    const currentDate = new Date();
    const createdShifts: ProcessedShift[] = [];
    const errors: string[] = [];
    const skipped: string[] = [];
    const userShiftCounts = new Map<string, number>(); // Track user assignments

    // Handle Excel date conversion
    let date: Date;
    let dateString: string;
    
    if (typeof shiftDate === 'number') {
      // Excel serial date number (days since 1900-01-01)
      date = new Date((shiftDate - 25569) * 86400 * 1000);
      dateString = date.toISOString().split('T')[0];
    } else if (typeof shiftDate === 'string') {
      // Check if it's already in YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
        dateString = shiftDate;
        date = new Date(shiftDate);
      } 
      // Check if it's in DD-MMM-YY format (e.g., "16-Jun-25", "17-Jun-25")
      else if (/^\d{1,2}-[A-Za-z]{3}-\d{2}$/.test(shiftDate)) {
        const parts = shiftDate.split('-');
        const day = parts[0];
        const monthAbbr = parts[1];
        const year = parts[2];
        
        // Convert month abbreviation to number
        const monthMap: { [key: string]: string } = {
          'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
          'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
          'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        
        const monthNum = monthMap[monthAbbr];
        if (!monthNum) {
          return NextResponse.json({
            success: false,
            error: `Invalid month abbreviation: ${monthAbbr}`,
            skipped: false
          });
        }
        
        // Convert 2-digit year to 4-digit (assuming 20xx for years < 50, 19xx for >= 50)
        const fullYear = parseInt(year) < 50 ? `20${year}` : `19${year}`;
        
        dateString = `${fullYear}-${monthNum}-${day.padStart(2, '0')}`;
        date = new Date(dateString);
      } 
      else {
        // Try to parse as regular date string
        date = new Date(shiftDate);
        if (isNaN(date.getTime())) {
          return NextResponse.json({
            success: false,
            error: `Invalid date format: ${shiftDate}`,
            skipped: false
          });
        }
        dateString = date.toISOString().split('T')[0];
      }
    } else {
      return NextResponse.json({
        success: false,
        error: `Invalid date type: ${shiftDate}`,
        skipped: false
      });
    }

    const isPastDate = date < currentDate;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Create promises for parallel processing
    const shiftCreationPromises = [];

    // Process Primary shift
    if (Primary) {
      const primaryUser = userMap.get(Primary);
      if (primaryUser) {
        // Check if this exact shift already exists
        const existingPrimary = existingShifts?.find((shift: ExistingShift) => 
          shift.date === dateString && 
          shift.onCallRole === 'PRIMARY' && 
          shift.userId === primaryUser.$id
        );

        if (existingPrimary) {
          skipped.push(`PRIMARY shift for ${Primary} on ${dateString} already exists`);
        } else {
          // Check if any PRIMARY shift exists for this date (different user)
          const conflictingPrimary = existingShifts?.find((shift: ExistingShift) => 
            shift.date === dateString && 
            shift.onCallRole === 'PRIMARY'
          );

          if (conflictingPrimary) {
            // Different user assigned, update the shift
            const updatePromise = serverDatabases.updateDocument(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              conflictingPrimary.$id,
              {
                userId: primaryUser.$id,
                updatedAt: new Date().toISOString()
              }
            ).then(doc => ({
              ...doc,
              username: Primary,
              role: 'PRIMARY',
              action: 'updated'
            }));
            shiftCreationPromises.push(updatePromise);
          } else {
            // Create new PRIMARY shift
            const now = new Date().toISOString();
            const createPromise = serverDatabases.createDocument(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              'unique()',
              {
                userId: primaryUser.$id,
                date: dateString,
                onCallRole: 'PRIMARY',
                status: isPastDate ? 'COMPLETED' : 'SCHEDULED',
                createdAt: now,
                updatedAt: now
              }
            ).then(doc => {
              // Track for notification
              userShiftCounts.set(primaryUser.$id, (userShiftCounts.get(primaryUser.$id) || 0) + 1);
              return {
                ...doc,
                username: Primary,
                role: 'PRIMARY',
                action: 'created'
              };
            });
            shiftCreationPromises.push(createPromise);
          }

          // Handle comp-off for past weekend shifts
          if (isPastDate && isWeekend) {
            const compOffPromise = serverDatabases.updateDocument(
              DATABASE_ID,
              COLLECTIONS.USERS,
              primaryUser.$id,
              {
                compOffs: (primaryUser.compOffs || 0) + 1
              }
            );
            shiftCreationPromises.push(compOffPromise);
          }
        }
      } else {
        errors.push(`User not found: ${Primary}`);
      }
    }

    // Process Backup shift
    if (Backup) {
      const backupUser = userMap.get(Backup);
      if (backupUser) {
        // Check if this exact shift already exists
        const existingBackup = existingShifts?.find((shift: ExistingShift) => 
          shift.date === dateString && 
          shift.onCallRole === 'BACKUP' && 
          shift.userId === backupUser.$id
        );

        if (existingBackup) {
          skipped.push(`BACKUP shift for ${Backup} on ${dateString} already exists`);
        } else {
          // Check if any BACKUP shift exists for this date (different user)
          const conflictingBackup = existingShifts?.find((shift: ExistingShift) => 
            shift.date === dateString && 
            shift.onCallRole === 'BACKUP'
          );

          if (conflictingBackup) {
            // Different user assigned, update the shift
            const updatePromise = serverDatabases.updateDocument(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              conflictingBackup.$id,
              {
                userId: backupUser.$id,
                updatedAt: new Date().toISOString()
              }
            ).then(doc => ({
              ...doc,
              username: Backup,
              role: 'BACKUP',
              action: 'updated'
            }));
            shiftCreationPromises.push(updatePromise);
          } else {
            // Create new BACKUP shift
            const now = new Date().toISOString();
            const createPromise = serverDatabases.createDocument(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              'unique()',
              {
                userId: backupUser.$id,
                date: dateString,
                onCallRole: 'BACKUP',
                status: isPastDate ? 'COMPLETED' : 'SCHEDULED',
                createdAt: now,
                updatedAt: now
              }
            ).then(doc => {
              // Track for notification
              userShiftCounts.set(backupUser.$id, (userShiftCounts.get(backupUser.$id) || 0) + 1);
              return {
                ...doc,
                username: Backup,
                role: 'BACKUP',
                action: 'created'
              };
            });
            shiftCreationPromises.push(createPromise);
          }

          // Handle comp-off for past weekend shifts
          if (isPastDate && isWeekend) {
            const compOffPromise = serverDatabases.updateDocument(
              DATABASE_ID,
              COLLECTIONS.USERS,
              backupUser.$id,
              {
                compOffs: (backupUser.compOffs || 0) + 1
              }
            );
            shiftCreationPromises.push(compOffPromise);
          }
        }
      } else {
        errors.push(`User not found: ${Backup}`);
      }
    }

    // Execute all promises in parallel
    try {
      const results = await Promise.allSettled(shiftCreationPromises);
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value && 'username' in result.value) {
          createdShifts.push(result.value as ProcessedShift);
        } else if (result.status === 'rejected') {
          errors.push(`Failed to process shift: ${result.reason}`);
        }
      });
    } catch (error) {
      errors.push(`Batch processing error: ${error}`);
    }

    // Send notifications for new shift assignments
    for (const [userId, count] of userShiftCounts) {
      await createBulkImportNotification(userId, count);
    }

    return NextResponse.json({
      success: true,
      createdShifts,
      errors,
      skipped,
      processed: true
    });

  } catch {
    return NextResponse.json(
      { error: 'Failed to process shift', success: false },
      { status: 500 }
    );
  }
}
