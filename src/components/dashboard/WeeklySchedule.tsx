'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { CalendarDays, Loader2 } from 'lucide-react';
import { User, AuthUser } from '@/types';
import { shiftService, userService, leaveService } from '@/lib/appwrite/database';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import DraggableEmployeeBadge from './DraggableEmployeeBadge';
import DroppableSlot from './DroppableSlot';
import MobileShiftAssignment from './MobileShiftAssignment';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-is-mobile';

// Utility function to ensure unique team members and prevent duplicate React keys
const deduplicateTeamMembers = (members: User[]): User[] => {
  const seen = new Set<string>();
  return members.filter(member => {
    if (seen.has(member.$id)) {

      return false;
    }
    seen.add(member.$id);
    return true;
  });
};

interface WeeklyScheduleDay {
  date: string;
  dayName: string;
  dayNumber: number;
  primary?: User | AuthUser;
  backup?: User | AuthUser;
}

interface WeeklyScheduleProps {
  user: AuthUser;
  teamMembers?: User[];
  onScheduleUpdate?: () => void;
  className?: string;
}

export default function WeeklySchedule({ user, teamMembers = [], onScheduleUpdate, className }: WeeklyScheduleProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [weekSchedule, setWeekSchedule] = useState<WeeklyScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStartDate, setWeekStartDate] = useState<Date>(new Date());
  const [creatingShift, setCreatingShift] = useState<string | null>(null); // Track which slot is creating a shift (format: "date-role")

  // Dialog states for confirmations
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<{
    type: 'replace' | 'delete';
    userId: string;
    date: string;
    role: string;
    existingShiftId?: string;
  } | null>(null);

  // Handle drag and drop
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Extract user ID from draggableId (format: userId-sourceId or just userId for team members)
    const userId = draggableId.split('-')[0];

    // Handle drag outside droppable areas (destination is null)
    if (!destination) {

      // Check if the source was from an assigned shift slot (not from team-members)
      if (source.droppableId !== 'team-members') {
        // Extract date and role from source droppableId (format: YYYY-MM-DD-role)
        const sourceIdParts = source.droppableId.split('-');
        
        // Ensure we have at least 4 parts (year, month, day, role) and it's not team-members
        if (sourceIdParts.length >= 4) {
          const sourceRole = sourceIdParts[sourceIdParts.length - 1]; // Last part is the role
          const sourceDate = sourceIdParts.slice(0, -1).join('-'); // Everything before the last part is the date

          // Validate date format before proceeding
          if (sourceDate && sourceRole && /^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
            // Set up pending delete operation and show dialog
            setPendingOperation({
              type: 'delete',
              userId,
              date: sourceDate,
              role: sourceRole
            });
            setIsDeleteDialogOpen(true);
          } else {

          }
        } else {

        }
      }
      return; // Always return when destination is null
    }

    // Normal drop logic - destination exists
    // Extract date and role from destination droppableId (format: YYYY-MM-DD-role)
    const droppableIdParts = destination.droppableId.split('-');
    const role = droppableIdParts[droppableIdParts.length - 1]; // Last part is the role
    const date = droppableIdParts.slice(0, -1).join('-'); // Everything before the last part is the date
    
    if (!userId || !date || !role) {
      return;
    }

    try {
      // Set loading state for this specific slot
      const slotId = `${date}-${role}`;
      setCreatingShift(slotId);
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return;
      }

      // Check if user is already assigned to the other role for this date
      const daySchedule = weekSchedule.find(day => day.date === date);
      if (daySchedule) {
        const oppositeRole = role === 'primary' ? 'backup' : 'primary';
        const oppositeUser = oppositeRole === 'primary' ? daySchedule.primary : daySchedule.backup;
        
        if (oppositeUser && oppositeUser.$id === userId) {
          const user = teamMembers.find(tm => tm.$id === userId);
          const userName = user ? `${user.firstName} ${user.lastName}` : 'Employee';
          const oppositeRoleName = oppositeRole.charAt(0).toUpperCase() + oppositeRole.slice(1).toLowerCase();
          
          toast({
            title: "Cannot assign shift",
            description: `${userName} is already assigned for ${oppositeRoleName} role for ${date}. Choose a different user.`,
            variant: "destructive",
          });
          
          setCreatingShift(null);
          return;
        }
      }

      // Check if user is on approved leave for this date
      const isUserOnLeave = await leaveService.isUserOnLeave(userId, date);
      if (isUserOnLeave) {
        
        // Find user name for better error message
        const user = teamMembers.find(tm => tm.$id === userId);
        const userName = user ? `${user.firstName} ${user.lastName}` : 'Employee';
        
        toast({
          title: "Cannot assign shift",
          description: `${userName} is on approved leave for ${date}. Please check their leave schedule.`,
          variant: "destructive",
        });
        
        setCreatingShift(null);
        return;
      }

      // Create proper date strings for querying (add time part for consistency)
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      // Check if there's already a shift for this date and role
      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        // Set up pending replace operation and show dialog
        setPendingOperation({
          type: 'replace',
          userId,
          date,
          role,
          existingShiftId: existingShift.$id
        });
        setIsReplaceDialogOpen(true);
        setCreatingShift(null); // Clear loading state
        return;
      } else {
        // Create new shift directly
        const slotId = `${date}-${role}`;
        setCreatingShift(slotId);
        
        // Create new shift with proper date format (same as Schedule page)
        const shiftDate = `${date}T07:30:00.000Z`;

        await shiftService.createShift({
          userId,
          date: shiftDate,
          onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
          status: 'SCHEDULED',
        });

        // Trigger callback to refresh data
        if (onScheduleUpdate) {
          onScheduleUpdate();
        }

        setCreatingShift(null);
      }
    } catch {
      setCreatingShift(null);
    }
  }, [onScheduleUpdate, teamMembers, toast, weekSchedule]);

  // Execute shift replacement
  const executeShiftReplacement = useCallback(async () => {
    if (!pendingOperation || pendingOperation.type !== 'replace') return;
    
    const { userId, existingShiftId } = pendingOperation;
    
    try {
      const slotId = `${pendingOperation.date}-${pendingOperation.role}`;
      setCreatingShift(slotId);
      
      // Update existing shift
      await shiftService.updateShift(existingShiftId!, {
        userId,
        onCallRole: pendingOperation.role.toUpperCase() as 'PRIMARY' | 'BACKUP',
      });

      // Trigger callback to refresh data
      if (onScheduleUpdate) {
        onScheduleUpdate();
      }

    } catch {
      alert('Failed to replace shift. Please try again.');
    } finally {
      setCreatingShift(null);
      setIsReplaceDialogOpen(false);
      setPendingOperation(null);
    }
  }, [pendingOperation, onScheduleUpdate]);

  // Execute shift deletion
  const executeShiftDeletion = useCallback(async () => {
    if (!pendingOperation || pendingOperation.type !== 'delete') return;
    
    const { userId, date, role } = pendingOperation;
    
    try {
      // Find and delete the existing shift
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;
      
      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const shiftToDelete = existingShifts.find(s => 
        s.date.split('T')[0] === date && 
        s.onCallRole === role.toUpperCase() &&
        s.userId === userId
      );
      
      if (shiftToDelete) {
        await shiftService.deleteShift(shiftToDelete.$id);

        // Trigger callback to refresh data
        if (onScheduleUpdate) {
          onScheduleUpdate();
        }
      } else {

      }
    } catch {
      alert('Failed to delete shift. Please try again.');
    } finally {
      setIsDeleteDialogOpen(false);
      setPendingOperation(null);
    }
  }, [pendingOperation, onScheduleUpdate]);

  // Handle mobile assignment (used instead of drag and drop on mobile)
  const handleMobileAssignment = useCallback(async (userId: string, role: 'primary' | 'backup', date: string) => {
    try {
      // Set loading state for this specific slot
      const slotId = `${date}-${role}`;
      setCreatingShift(slotId);
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return;
      }

      // Check if user is on approved leave for this date
      const isUserOnLeave = await leaveService.isUserOnLeave(userId, date);
      if (isUserOnLeave) {
        
        // Find user name for better error message
        const user = teamMembers.find(tm => tm.$id === userId);
        const userName = user ? `${user.firstName} ${user.lastName}` : 'Employee';
        
        toast({
          title: "Cannot assign shift",
          description: `${userName} is on approved leave for ${date}. Please check their leave schedule.`,
          variant: "destructive",
        });
        
        setCreatingShift(null);
        return;
      }

      // Create proper date strings for querying (add time part for consistency)
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      // Check if there's already a shift for this date and role
      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        // Set up pending replace operation and show dialog
        setPendingOperation({
          type: 'replace',
          userId,
          date,
          role,
          existingShiftId: existingShift.$id
        });
        setIsReplaceDialogOpen(true);
        setCreatingShift(null); // Clear loading state
        return;
      } else {
        // Create new shift directly
        const shiftDate = `${date}T07:30:00.000Z`;

        await shiftService.createShift({
          userId,
          date: shiftDate,
          onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
          status: 'SCHEDULED',
        });

        // Trigger callback to refresh data
        if (onScheduleUpdate) {
          onScheduleUpdate();
        }

        setCreatingShift(null);
      }
    } catch {
      setCreatingShift(null);
    }
  }, [onScheduleUpdate, teamMembers, toast]);

  // Handle mobile remove assignment
  const handleMobileRemove = useCallback(async (role: 'primary' | 'backup', date: string) => {
    try {
      // Set loading state for this specific slot
      const slotId = `${date}-${role}`;
      setCreatingShift(slotId);
      
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setCreatingShift(null);
        return;
      }

      // Create proper date strings for querying
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      // Find the existing shift for this date and role
      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        // Delete the existing shift
        await shiftService.deleteShift(existingShift.$id);
        
        // Show success message
        toast({
          title: "Assignment Removed",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment removed for ${date}`,
        });

        // Trigger callback to refresh data
        if (onScheduleUpdate) {
          onScheduleUpdate();
        }
      } else {
        toast({
          title: "No Assignment Found",
          description: `No ${role} assignment found for ${date}`,
          variant: "destructive",
        });
      }

      setCreatingShift(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to remove assignment. Please try again.",
        variant: "destructive",
      });
      setCreatingShift(null);
    }
  }, [onScheduleUpdate, toast]);

  const getWeekDates = useCallback(() => {
    const today = new Date();
    const startOfWeek = new Date(today);
    
    // Get Monday as start of week (day 1)
    const dayOfWeek = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startOfWeek.setDate(diff);
    
    // Store the start date for the title
    setWeekStartDate(new Date(startOfWeek));
    
    const weekDates = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      
      weekDates.push({
        date: date.toISOString().split('T')[0],
        dayName: dayNames[i],
        dayNumber: date.getDate(),
      });
    }
    
    return weekDates;
  }, []);

  const fetchWeeklyData = useCallback(async () => {
    if (!user) {
      
      return;
    }
    
    try {
      setLoading(true);

      // Get this week's date range
      const weekDates = getWeekDates();
      const startDate = weekDates[0].date;
      const endDate = weekDates[6].date;

      // Fetch shifts, users, and leave data
      const [shiftsData, usersData, leavesData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDate, endDate),
        userService.getAllUsers(), // Always fetch all users so employees can see full team schedule
        leaveService.getApprovedLeavesByDateRange(startDate, endDate)
      ]);

      // Create user map for quick lookup - handle both User and AuthUser types
      const userMap = new Map();
      usersData.forEach((u: User | AuthUser) => {
        userMap.set(u.$id, u);
      });
      
      // Map shifts to week days with leave information
      const scheduleData = weekDates.map(day => {
        const dayShifts = shiftsData.filter(shift => 
          shift.date.split('T')[0] === day.date
        );
        
        // Find employees on leave for this specific date
        const employeesOnLeave = leavesData
          .filter(leave => {
            const leaveStart = new Date(leave.startDate);
            const leaveEnd = new Date(leave.endDate);
            const currentDate = new Date(day.date);
            return currentDate >= leaveStart && currentDate <= leaveEnd;
          })
          .map(leave => {
            const user = userMap.get(leave.userId);
            return {
              userId: leave.userId,
              userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
              leaveType: leave.type,
              isOnLeave: true
            };
          });

        const primaryShift = dayShifts.find(s => s.onCallRole === 'PRIMARY');
        const backupShift = dayShifts.find(s => s.onCallRole === 'BACKUP');
        
        return {
          ...day,
          primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
          backup: backupShift ? userMap.get(backupShift.userId) : undefined,
          employeesOnLeave
        };
      });

      setWeekSchedule(scheduleData);
    } catch {
      
    } finally {
      setLoading(false);
    }
  }, [user, getWeekDates]);

  // Silent refetch without loading spinner (for real-time fallback)
  const silentRefetchWeeklyData = useCallback(async () => {
    if (!user) return;
    
    try {

      // Get this week's date range
      const weekDates = getWeekDates();
      const startDate = weekDates[0].date;
      const endDate = weekDates[6].date;
      
      // Fetch shifts, users, and leave data
      const [shiftsData, usersData, leavesData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDate, endDate),
        userService.getAllUsers(),
        leaveService.getApprovedLeavesByDateRange(startDate, endDate)
      ]);
      
      // Create user map for quick lookup
      const userMap = new Map();
      usersData.forEach((u: User | AuthUser) => {
        userMap.set(u.$id, u);
      });
      
      // Map shifts to week days with leave information
      const scheduleData = weekDates.map(day => {
        const dayShifts = shiftsData.filter(shift => 
          shift.date.split('T')[0] === day.date
        );
        
        // Find employees on leave for this specific date
        const employeesOnLeave = leavesData
          .filter(leave => {
            const leaveStart = new Date(leave.startDate);
            const leaveEnd = new Date(leave.endDate);
            const currentDate = new Date(day.date);
            return currentDate >= leaveStart && currentDate <= leaveEnd;
          })
          .map(leave => {
            const user = userMap.get(leave.userId);
            return {
              userId: leave.userId,
              userName: user ? `${user.firstName} ${user.lastName}` : 'Unknown',
              leaveType: leave.type,
              isOnLeave: true
            };
          });
        
        const primaryShift = dayShifts.find(s => s.onCallRole === 'PRIMARY');
        const backupShift = dayShifts.find(s => s.onCallRole === 'BACKUP');
        
        return {
          ...day,
          primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
          backup: backupShift ? userMap.get(backupShift.userId) : undefined,
          employeesOnLeave
        };
      });
      
      setWeekSchedule(scheduleData);
      
    } catch {
      
    }
  }, [user, getWeekDates]);

  useEffect(() => {
    fetchWeeklyData();
  }, [fetchWeeklyData]);

  // Auto-scroll to today in mobile view
  useEffect(() => {
    if (!isMobile || loading || weekSchedule.length === 0) return;

    const todayDate = new Date().toISOString().split('T')[0];
    const todayIndex = weekSchedule.findIndex(day => day.date === todayDate);
    
    if (todayIndex !== -1 && scrollContainerRef.current) {
      // Calculate scroll position to center "today"
      const container = scrollContainerRef.current;
      const cardWidth = 160; // w-40 = 10rem = 160px
      const gap = 12; // space-x-3 = 0.75rem = 12px
      const containerWidth = container.clientWidth;
      const scrollPosition = todayIndex * (cardWidth + gap) - (containerWidth / 2) + (cardWidth / 2);
      
      // Smooth scroll to today
      container.scrollTo({
        left: Math.max(0, scrollPosition),
        behavior: 'smooth'
      });
    }
  }, [isMobile, loading, weekSchedule]);

  // Real-time subscription for shifts with instant updates
  useEffect(() => {
    if (!user) return;

    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {

        const events = response.events || [];
        const payload = response.payload;
        
        // Check for specific event types with more robust pattern matching
        const hasCreateEvent = events.some((event: string) => 
          event.includes('.create') || event.includes('documents.create')
        );
        const hasUpdateEvent = events.some((event: string) => 
          event.includes('.update') || event.includes('documents.update')
        );
        const hasDeleteEvent = events.some((event: string) => 
          event.includes('.delete') || event.includes('documents.delete')
        );

        if (hasCreateEvent || hasUpdateEvent || hasDeleteEvent) {
          // Get current week dates to check if this shift is relevant
          const weekDates = getWeekDates();
          const startDate = weekDates[0].date;
          const endDate = weekDates[6].date;
          
          // Check if the shift date is within current week
          const shiftDate = payload?.date?.split('T')[0];
          if (shiftDate && shiftDate >= startDate && shiftDate <= endDate) {
            
            if (hasCreateEvent || hasUpdateEvent) {
              // For CREATE/UPDATE: Get user info and update state directly
              try {
                const updatedUser = await userService.getUserById(payload.userId);
                
                setWeekSchedule(prevSchedule => {
                  const newSchedule = [...prevSchedule];
                  const dayIndex = newSchedule.findIndex(day => day.date === shiftDate);
                  
                  if (dayIndex !== -1) {
                    const updatedDay = { ...newSchedule[dayIndex] };
                    
                    if (payload.onCallRole === 'PRIMARY') {
                      updatedDay.primary = updatedUser;
                    } else if (payload.onCallRole === 'BACKUP') {
                      updatedDay.backup = updatedUser;
                    }
                    
                    newSchedule[dayIndex] = updatedDay;
                    
                  }
                  
                  return newSchedule;
                });
              } catch {
                
                // Fallback to silent refetch only if user fetch fails (no loading spinner)
                setTimeout(() => {
                  silentRefetchWeeklyData();
                }, 100);
              }
            } else if (hasDeleteEvent) {
              // For DELETE: Remove assignment directly
              setWeekSchedule(prevSchedule => {
                const newSchedule = [...prevSchedule];
                const dayIndex = newSchedule.findIndex(day => day.date === shiftDate);
                
                if (dayIndex !== -1) {
                  const updatedDay = { ...newSchedule[dayIndex] };
                  
                  if (payload.onCallRole === 'PRIMARY') {
                    updatedDay.primary = undefined;
                  } else if (payload.onCallRole === 'BACKUP') {
                    updatedDay.backup = undefined;
                  }
                  
                  newSchedule[dayIndex] = updatedDay;
                  
                }
                
                return newSchedule;
              });
            }
          } else {
            
          }
        }
      }
    );

    return () => {
      
      unsubscribe();
    };
  }, [user, getWeekDates, fetchWeeklyData, silentRefetchWeeklyData]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            This Week&apos;s Schedule
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-4">
        {/* Team Members Panel - Only show for managers and on desktop */}
        {user.role === 'MANAGER' && teamMembers.length > 0 && !isMobile && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            </CardHeader>
            <CardContent>
              <Droppable droppableId="team-members" direction="horizontal">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex flex-wrap gap-2"
                  >
                    {deduplicateTeamMembers(teamMembers).map((member, index) => (
                      <DraggableEmployeeBadge
                        key={member.$id}
                        user={member}
                        index={index}
                        draggableId={member.$id}
                        isDragDisabled={false}
                      />
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </CardContent>
          </Card>
        )}

        {/* Weekly Schedule */}
        <Card className={className}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-5 w-5" />
              Week of {weekStartDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mobile: Touch-friendly assignment view */}
            {isMobile ? (
              <div className="md:hidden">
                <div 
                  ref={scrollContainerRef}
                  className="flex overflow-x-auto pb-4 px-4 space-x-3 scrollbar-thin horizontal-scroll"
                >
                  {weekSchedule.map((day) => (
                    <div key={day.date} className="flex-shrink-0 w-40">
                      <MobileShiftAssignment
                        date={day.date}
                        dayName={day.dayName}
                        dayNumber={day.dayNumber}
                        primaryUser={day.primary as User}
                        backupUser={day.backup as User}
                        teamMembers={deduplicateTeamMembers(teamMembers)}
                        onAssignUser={(userId, role) => handleMobileAssignment(userId, role, day.date)}
                        onRemoveUser={(role) => handleMobileRemove(role, day.date)}
                        isCreating={creatingShift === `${day.date}-primary` || creatingShift === `${day.date}-backup`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Desktop: Original drag and drop view */
              /* Desktop: Grid view */
              <div className="hidden md:block">
                  <div className="grid grid-cols-7 divide-x divide-border">
                    {weekSchedule.map((day, index) => {
                      const isToday = day.date === new Date().toISOString().split('T')[0];
                      const isWeekend = index >= 5; // Saturday (5) and Sunday (6)
                      
                      // Background classes based on day type
                      let backgroundClass = 'hover:bg-muted/50';
                      if (isToday) {
                        backgroundClass = 'bg-gradient-to-b from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-600';
                      } else if (isWeekend) {
                        backgroundClass = 'bg-gradient-to-b from-orange-50 to-amber-25 dark:from-orange-900/20 dark:to-amber-900/10 hover:bg-orange-100/50 dark:hover:bg-orange-900/30';
                      }
                      
                      return (
                        <div 
                          key={day.date} 
                          className={`p-3 space-y-3 min-h-[120px] ${backgroundClass}`}
                        >
                          {/* Day Header */}
                          <div className="text-center">
                            <div className={`text-xs font-medium ${
                              isToday ? 'text-blue-700 dark:text-blue-300 font-semibold' : 
                              isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                              'text-muted-foreground'
                            }`}>
                              {day.dayName}
                            </div>
                            <div className={`text-sm font-semibold ${
                              isToday ? 'text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 rounded-full w-6 h-6 flex items-center justify-center mx-auto' : 
                              isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                              'text-foreground'
                            }`}>
                              {day.dayNumber}
                            </div>
                          </div>

                          {/* Primary Assignment */}
                          <div className="space-y-2">
                            <Badge variant="default" className="text-xs px-2 py-0.5 h-5 bg-blue-600 hover:bg-blue-700">
                              Primary
                            </Badge>
                            <DroppableSlot
                              droppableId={`${day.date}-primary`}
                              assignedUser={day.primary as User}
                              slotType="primary"
                              className="min-h-[50px]"
                              isCreating={creatingShift === `${day.date}-primary`}
                            />
                          </div>

                          {/* Backup Assignment */}
                          <div className="space-y-2">
                            <Badge variant="outline" className="text-xs px-2 py-0.5 h-5 border-green-400 text-green-700 bg-green-50">
                              Backup
                            </Badge>
                            <DroppableSlot
                              droppableId={`${day.date}-backup`}
                              assignedUser={day.backup as User}
                              slotType="backup"
                              className="min-h-[50px]"
                              isCreating={creatingShift === `${day.date}-backup`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Replace Shift Confirmation Dialog */}
      <AlertDialog open={isReplaceDialogOpen} onOpenChange={setIsReplaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Existing Shift</AlertDialogTitle>
            <AlertDialogDescription>
              There&apos;s already a {pendingOperation?.role} shift assigned for {pendingOperation?.date}. 
              Do you want to replace it with this user?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsReplaceDialogOpen(false);
              setPendingOperation(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeShiftReplacement}>
              Replace Shift
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Shift Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User from Shift</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to remove this user from the {pendingOperation?.role} shift on {pendingOperation?.date}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setIsDeleteDialogOpen(false);
              setPendingOperation(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeShiftDeletion} className="bg-red-600 hover:bg-red-700">
              Remove User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
