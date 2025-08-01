import { NextRequest, NextResponse } from 'next/server';
import { serverDatabases } from '@/lib/appwrite/server-config';
import { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { Query } from 'node-appwrite';

export async function POST(request: NextRequest) {
  try {
    const currentDate = new Date();
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];

    // Find all scheduled shifts from yesterday and before that need to be marked as completed
    const pastShifts = await serverDatabases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SHIFTS,
      [
        Query.equal('status', 'SCHEDULED'),
        Query.lessThanEqual('date', `${yesterdayString}T23:59:59.999Z`)
      ]
    );

    const updatedShifts = [];
    const compOffUpdates = [];

    for (const shift of pastShifts.documents) {
      try {
        // Update shift status to COMPLETED
        const updatedShift = await serverDatabases.updateDocument(
          DATABASE_ID,
          COLLECTIONS.SHIFTS,
          shift.$id,
          {
            status: 'COMPLETED'
          }
        );

        updatedShifts.push(updatedShift);

        // Check if it's a weekend shift to increment comp offs
        const shiftDate = new Date(shift.date);
        const isWeekend = shiftDate.getDay() === 0 || shiftDate.getDay() === 6; // Sunday = 0, Saturday = 6

        if (isWeekend) {
          // Get user and increment comp offs
          const user = await serverDatabases.getDocument(
            DATABASE_ID,
            COLLECTIONS.USERS,
            shift.userId
          );

          const updatedUser = await serverDatabases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.USERS,
            shift.userId,
            {
              compOffs: (user.compOffs || 0) + 1
            }
          );

          compOffUpdates.push({
            userId: shift.userId,
            username: user.username,
            newCompOffs: updatedUser.compOffs
          });
        }
      } catch (error) {
        console.error(`Failed to update shift ${shift.$id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Auto-completion completed. Updated ${updatedShifts.length} shifts.`,
      updatedShifts: updatedShifts.length,
      compOffUpdates
    });

  } catch (error) {
    console.error('Auto-completion error:', error);
    return NextResponse.json(
      { error: 'Failed to auto-complete shifts' },
      { status: 500 }
    );
  }
}

// GET endpoint to check status
export async function GET() {
  try {
    const currentDate = new Date();
    const yesterday = new Date(currentDate);
    yesterday.setDate(currentDate.getDate() - 1);
    const yesterdayString = yesterday.toISOString().split('T')[0];

    // Count shifts that need to be auto-completed
    const pastShifts = await serverDatabases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.SHIFTS,
      [
        Query.equal('status', 'SCHEDULED'),
        Query.lessThanEqual('date', `${yesterdayString}T23:59:59.999Z`)
      ]
    );

    return NextResponse.json({
      pendingCompletion: pastShifts.documents.length,
      lastChecked: new Date().toISOString()
    });

  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check completion status' },
      { status: 500 }
    );
  }
}
