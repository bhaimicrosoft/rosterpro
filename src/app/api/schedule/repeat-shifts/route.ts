import { NextRequest, NextResponse } from 'next/server';
import { shiftService } from '@/lib/appwrite/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sourceStartDate, 
      sourceEndDate, 
      targetStartDate, 
      targetEndDate,
      repeatDuration,
      repeatUnit 
    } = body;

    // Validate required fields
    if (!sourceStartDate || !sourceEndDate || !targetStartDate) {
      return NextResponse.json({
        error: 'Source start date, source end date, and target start date are required'
      }, { status: 400 });
    }

    const sourceStart = new Date(sourceStartDate);
    const sourceEnd = new Date(sourceEndDate);
    const targetStart = new Date(targetStartDate);

    // Validate source date range
    if (sourceStart >= sourceEnd) {
      return NextResponse.json({
        error: 'Source start date must be before source end date'
      }, { status: 400 });
    }

    // Get source shifts to copy
    const sourceShifts = await shiftService.getShiftsByDateRange(
      sourceStartDate,
      sourceEndDate
    );

    if (sourceShifts.length === 0) {
      return NextResponse.json({
        error: 'No shifts found in the source date range'
      }, { status: 400 });
    }

    // Create a pattern from source shifts (day index -> shifts)
    const sourcePattern = new Map<number, Array<{ userId: string; onCallRole: 'PRIMARY' | 'BACKUP' }>>();
    
    sourceShifts.forEach(shift => {
      const shiftDate = new Date(shift.date);
      const daysSinceSourceStart = Math.floor((shiftDate.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000));
      
      if (!sourcePattern.has(daysSinceSourceStart)) {
        sourcePattern.set(daysSinceSourceStart, []);
      }
      
      sourcePattern.get(daysSinceSourceStart)!.push({
        userId: shift.userId,
        onCallRole: shift.onCallRole
      });
    });

    const sourceDurationDays = Math.ceil((sourceEnd.getTime() - sourceStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    // Calculate target end date if not provided
    let targetEnd: Date;
    if (targetEndDate) {
      targetEnd = new Date(targetEndDate);
      // Validate target date range
      if (targetStart >= targetEnd) {
        return NextResponse.json({
          error: 'Target start date must be before target end date'
        }, { status: 400 });
      }
    } else {
      // Calculate end date based on repeat duration and unit
      if (!repeatDuration || !repeatUnit) {
        return NextResponse.json({
          error: 'Either target end date or repeat duration with unit must be provided'
        }, { status: 400 });
      }

      targetEnd = new Date(targetStart);
      switch (repeatUnit) {
        case 'days':
          targetEnd.setDate(targetEnd.getDate() + parseInt(repeatDuration) - 1);
          break;
        case 'weeks':
          targetEnd.setDate(targetEnd.getDate() + (parseInt(repeatDuration) * 7) - 1);
          break;
        case 'months':
          targetEnd.setMonth(targetEnd.getMonth() + parseInt(repeatDuration));
          targetEnd.setDate(targetEnd.getDate() - 1);
          break;
        default:
          return NextResponse.json({
            error: 'Invalid repeat unit. Must be days, weeks, or months'
          }, { status: 400 });
      }
    }

    // Generate target shifts by repeating the source pattern
    const shiftsToCreate: Array<{
      date: string;
      userId: string;
      onCallRole: 'PRIMARY' | 'BACKUP';
      status: 'SCHEDULED' | 'COMPLETED' | 'SWAPPED';
    }> = [];
    const currentDate = new Date(targetStart);
    let targetDayIndex = 0;

    while (currentDate <= targetEnd) {
      // Map current target day to source pattern day (cycling through source pattern)
      const sourcePatternDay = targetDayIndex % sourceDurationDays;
      const shiftsForDay = sourcePattern.get(sourcePatternDay) || [];

      // Create shifts for this day
      shiftsForDay.forEach(sourceShift => {
        const shiftDate = currentDate.toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        const isPastDate = shiftDate < today;
        
        shiftsToCreate.push({
          date: shiftDate,
          userId: sourceShift.userId,
          onCallRole: sourceShift.onCallRole,
          status: isPastDate ? 'COMPLETED' : 'SCHEDULED'
        });
      });

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      targetDayIndex++;
    }

    // Check for existing shifts to avoid duplicates
    const existingShifts = await shiftService.getShiftsByDateRange(
      targetStartDate,
      targetEnd.toISOString().split('T')[0]
    );

    const existingShiftKeys = new Set(
      existingShifts.map(shift => 
        `${shift.date.split('T')[0]}-${shift.onCallRole}`
      )
    );

    // Filter out duplicates
    const newShifts = shiftsToCreate.filter(shift => 
      !existingShiftKeys.has(`${shift.date}-${shift.onCallRole}`)
    );

    // Create the new shifts
    const createdShifts = [];
    for (const shiftData of newShifts) {
      try {
        const newShift = await shiftService.createShift(shiftData, 'System (Repeat Schedule)');
        createdShifts.push(newShift);
      } catch (error) {
        console.error('Error creating shift:', error);
        // Continue with other shifts even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      createdShifts: createdShifts.length,
      skippedDuplicates: shiftsToCreate.length - newShifts.length,
      totalAttempted: shiftsToCreate.length,
      sourcePattern: Array.from(sourcePattern.entries()).map(([day, shifts]) => ({
        day,
        shifts: shifts.length
      })),
      targetDateRange: {
        start: targetStartDate,
        end: targetEnd.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error in repeat shifts:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to repeat shifts'
    }, { status: 500 });
  }
}
