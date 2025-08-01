import { NextRequest, NextResponse } from 'next/server';
import { serverDatabases } from '@/lib/appwrite/server-config';
import { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { Query } from 'node-appwrite';

// Import notification service for bulk notifications
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
    const { shifts } = await request.json();

    if (!Array.isArray(shifts)) {
      return NextResponse.json(
        { error: 'Invalid data format. Expected array of shifts.' },
        { status: 400 }
      );
    }

    // Get all users to validate usernames
    const users = await serverDatabases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.USERS
    );

    const userMap = new Map(users.documents.map(user => [user.username, user]));
    const currentDate = new Date();
    const createdShifts = [];
    const errors = [];
    const userShiftCounts = new Map<string, number>(); // Track user assignments

    for (const shiftData of shifts) {
      const { Primary, Backup, Date: shiftDate } = shiftData;
      
      if (!shiftDate) {
        errors.push(`Skipping row with missing date`);
        continue;
      }

      // Handle Excel date conversion
      let date: Date;
      let dateString: string;
      
      if (typeof shiftDate === 'number') {
        // Excel serial date number (days since 1900-01-01)
        date = new Date((shiftDate - 25569) * 86400 * 1000); // Convert Excel serial to JS Date
        dateString = date.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
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
            errors.push(`Invalid month abbreviation: ${monthAbbr} in date ${shiftDate}`);
            continue;
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
            errors.push(`Invalid date format: ${shiftDate}`);
            continue;
          }
          dateString = date.toISOString().split('T')[0];
        }
      } else {
        errors.push(`Invalid date type for: ${shiftDate}`);
        continue;
      }

      const isPastDate = date < currentDate;
      const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday = 0, Saturday = 6

      // Process Primary shift
      if (Primary) {
        const primaryUser = userMap.get(Primary);
        if (primaryUser) {
          try {
            // Check if shift already exists
            const existingShifts = await serverDatabases.listDocuments(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              [
                Query.equal('userId', primaryUser.$id),
                Query.equal('date', dateString),
                Query.equal('onCallRole', 'PRIMARY')
              ]
            );

            if (existingShifts.documents.length === 0) {
              const now = new Date().toISOString();
              const shiftDoc = await serverDatabases.createDocument(
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
              );

              createdShifts.push({
                ...shiftDoc,
                username: Primary,
                role: 'PRIMARY'
              });

              // Track user assignment for notification
              userShiftCounts.set(primaryUser.$id, (userShiftCounts.get(primaryUser.$id) || 0) + 1);

              // If it's a completed weekend shift, increment comp offs
              if (isPastDate && isWeekend) {
                await serverDatabases.updateDocument(
                  DATABASE_ID,
                  COLLECTIONS.USERS,
                  primaryUser.$id,
                  {
                    compOffs: (primaryUser.compOffs || 0) + 1
                  }
                );
              }
            }
          } catch (error) {
            errors.push(`Failed to create PRIMARY shift for ${Primary} on ${dateString}: ${error}`);
          }
        } else {
          errors.push(`User not found: ${Primary}`);
        }
      }

      // Process Backup shift
      if (Backup) {
        const backupUser = userMap.get(Backup);
        if (backupUser) {
          try {
            // Check if shift already exists
            const existingShifts = await serverDatabases.listDocuments(
              DATABASE_ID,
              COLLECTIONS.SHIFTS,
              [
                Query.equal('userId', backupUser.$id),
                Query.equal('date', dateString),
                Query.equal('onCallRole', 'BACKUP')
              ]
            );

            if (existingShifts.documents.length === 0) {
              const now = new Date().toISOString();
              const shiftDoc = await serverDatabases.createDocument(
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
              );

              createdShifts.push({
                ...shiftDoc,
                username: Backup,
                role: 'BACKUP'
              });

              // Track user assignment for notification
              userShiftCounts.set(backupUser.$id, (userShiftCounts.get(backupUser.$id) || 0) + 1);

              // If it's a completed weekend shift, increment comp offs
              if (isPastDate && isWeekend) {
                await serverDatabases.updateDocument(
                  DATABASE_ID,
                  COLLECTIONS.USERS,
                  backupUser.$id,
                  {
                    compOffs: (backupUser.compOffs || 0) + 1
                  }
                );
              }
            }
          } catch (error) {
            errors.push(`Failed to create BACKUP shift for ${Backup} on ${dateString}: ${error}`);
          }
        } else {
          errors.push(`User not found: ${Backup}`);
        }
      }
    }

    // Create bulk notifications for affected users
    if (userShiftCounts.size > 0) {
      // Send notification to each user with their shift count
      for (const [userId, count] of userShiftCounts) {
        await createBulkImportNotification(userId, count);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Import completed. Created ${createdShifts.length} shifts.`,
      createdShifts,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch {
    return NextResponse.json(
      { error: 'Failed to import shifts' },
      { status: 500 }
    );
  }
}
