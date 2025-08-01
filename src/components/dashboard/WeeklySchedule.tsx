'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  CalendarDays,
  Loader2,
  RefreshCw,
  Plus
} from 'lucide-react';
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
import { User, AuthUser } from '@/types';
import { shiftService, userService, leaveService } from '@/lib/appwrite/database';
import { useToast } from '@/hooks/use-toast';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import DraggableEmployeeBadge from './DraggableEmployeeBadge';
import DroppableSlot from './DroppableSlot';
import MobileShiftAssignment from './MobileShiftAssignment';

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
  isToday: boolean;
  isWeekend: boolean;
  primary?: User | AuthUser;
  backup?: User | AuthUser;
  employeesOnLeave?: Array<{
    userId: string;
    userName: string;
    leaveType: string;
    isOnLeave: boolean;
  }>;
}

interface WeeklyScheduleProps {
  user: AuthUser;
  teamMembers?: User[];
  onScheduleUpdate?: () => void;
  className?: string;
  // Schedule management mode - hides drag functionality and shows + buttons
  isScheduleManagement?: boolean;
  // External week control for schedule management
  externalWeekStartDate?: Date;
  // Function to notify parent when week changes
  onWeekStartDateChange?: (date: Date) => void;
  // External trigger to go to current week
  goToCurrentWeek?: boolean;
}

export default function WeeklySchedule({ 
  user, 
  teamMembers = [], 
  // onScheduleUpdate, // Removed - using real-time updates instead
  className,
  isScheduleManagement = false,
  externalWeekStartDate,
  onWeekStartDateChange,
  goToCurrentWeek
}: WeeklyScheduleProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Check if we're in mobile/tablet layout (below lg breakpoint)
  const [isHorizontalScrollLayout, setIsHorizontalScrollLayout] = useState(false);

  useEffect(() => {
    const checkLayout = () => {
      setIsHorizontalScrollLayout(window.innerWidth < 1024); // lg breakpoint
    };

    checkLayout();
    window.addEventListener('resize', checkLayout);
    return () => window.removeEventListener('resize', checkLayout);
  }, []);
  
  // Core state
  const [weekSchedule, setWeekSchedule] = useState<WeeklyScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Animation state for smooth week transitions
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right' | 'none'>('none');
  
  // Week navigation state - Monday-Sunday structure
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => {
    // Use external date if provided (for schedule management), otherwise calculate from today
    if (isScheduleManagement && externalWeekStartDate) {
      return externalWeekStartDate;
    }
    
    const today = new Date();
    const dayOfWeek = today.getDay();
    // Convert Sunday (0) to 7 for easier calculation
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = adjustedDay - 1; // Monday is day 1
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    return monday;
  });

  // Update internal week state when external week changes (for schedule management)
  useEffect(() => {
    if (isScheduleManagement && externalWeekStartDate) {
      setWeekStartDate(externalWeekStartDate);
    }
  }, [isScheduleManagement, externalWeekStartDate]);

  // Handle external "go to current week" trigger
  useEffect(() => {
    if (isScheduleManagement && goToCurrentWeek) {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
      const daysToMonday = adjustedDay - 1;
      const monday = new Date(today);
      monday.setDate(today.getDate() - daysToMonday);
      
      setWeekStartDate(monday);
      
      // Notify parent of the week change
      if (onWeekStartDateChange) {
        onWeekStartDateChange(monday);
      }
    }
  }, [isScheduleManagement, goToCurrentWeek, onWeekStartDateChange]);
  
  // Operation tracking
  const [creatingShift, setCreatingShift] = useState<string | null>(null);
  
  // Dialog states
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<{
    type: 'replace' | 'delete';
    userId: string;
    date: string;
    role: string;
    existingShiftId?: string;
  } | null>(null);

  // Generate Monday-Sunday week dates
  const getWeekDates = useCallback(() => {
    const startOfWeek = new Date(weekStartDate);
    const weekDates: WeeklyScheduleDay[] = [];
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const shortDayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date().toISOString().split('T')[0];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      
      weekDates.push({
        date: dateString,
        dayName: isMobile ? shortDayNames[i] : dayNames[i],
        dayNumber: date.getDate(),
        isToday: dateString === today,
        isWeekend: i >= 5, // Saturday (5) and Sunday (6)
      });
    }
    
    return weekDates;
  }, [weekStartDate, isMobile]);

  // Navigation functions with animation support
  const navigateToPreviousWeek = useCallback(async () => {
    if (!isScheduleManagement) {
      setIsAnimating(true);
      setAnimationDirection('right');
    }
    
    const newDate = new Date(weekStartDate);
    newDate.setDate(weekStartDate.getDate() - 7);
    setWeekStartDate(newDate);
    
    // Notify parent if this is schedule management mode
    if (isScheduleManagement && onWeekStartDateChange) {
      onWeekStartDateChange(newDate);
    }
    
    // Reset animation after a short delay
    if (!isScheduleManagement) {
      setTimeout(() => {
        setIsAnimating(false);
        setAnimationDirection('none');
      }, 300);
    }
  }, [weekStartDate, isScheduleManagement, onWeekStartDateChange]);

  const navigateToNextWeek = useCallback(async () => {
    if (!isScheduleManagement) {
      setIsAnimating(true);
      setAnimationDirection('left');
    }
    
    const newDate = new Date(weekStartDate);
    newDate.setDate(weekStartDate.getDate() + 7);
    setWeekStartDate(newDate);
    
    // Notify parent if this is schedule management mode
    if (isScheduleManagement && onWeekStartDateChange) {
      onWeekStartDateChange(newDate);
    }
    
    // Reset animation after a short delay
    if (!isScheduleManagement) {
      setTimeout(() => {
        setIsAnimating(false);
        setAnimationDirection('none');
      }, 300);
    }
  }, [weekStartDate, isScheduleManagement, onWeekStartDateChange]);

  const navigateToCurrentWeek = useCallback(async () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const daysToMonday = adjustedDay - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMonday);
    
    if (!isScheduleManagement) {
      setIsAnimating(true);
      setAnimationDirection('none'); // No specific direction for today
    }
    
    setWeekStartDate(monday);
    
    // Notify parent if this is schedule management mode
    if (isScheduleManagement && onWeekStartDateChange) {
      onWeekStartDateChange(monday);
    }
    
    // Reset animation and scroll to today on mobile
    if (!isScheduleManagement) {
      setTimeout(() => {
        setIsAnimating(false);
        setAnimationDirection('none');
        
        // Auto-scroll to today on mobile/tablet after week change
        if (isHorizontalScrollLayout && scrollContainerRef.current) {
          const todayDate = new Date().toISOString().split('T')[0];
          const todayIndex = weekSchedule.findIndex(day => day.date === todayDate);
          
          if (todayIndex !== -1) {
            const container = scrollContainerRef.current;
            const cardWidth = 176; // w-44 = 11rem = 176px
            const gap = 16;
            const containerWidth = container.clientWidth;
            const totalCardWidth = cardWidth + gap;
            const scrollPosition = (todayIndex * totalCardWidth) - (containerWidth / 2) + (cardWidth / 2);
            
            container.scrollTo({
              left: Math.max(0, scrollPosition),
              behavior: 'smooth'
            });
          }
        }
      }, 300);
    }
  }, [isScheduleManagement, onWeekStartDateChange, isHorizontalScrollLayout, weekSchedule]);

  // Enhanced data fetching with better date handling
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
        shiftService.getShiftsByDateRange(`${startDate}T00:00:00.000Z`, `${endDate}T23:59:59.999Z`),
        userService.getAllUsers(),
        leaveService.getApprovedLeavesByDateRange(startDate, endDate)
      ]);

      // Create user map for quick lookup
      const userMap = new Map();
      usersData.forEach((u: User | AuthUser) => {
        userMap.set(u.$id, u);
      });
      
      // Map shifts to week days with leave information
      const scheduleData: WeeklyScheduleDay[] = weekDates.map(baseDayData => {
        const dayShifts = shiftsData.filter(shift => 
          shift.date.split('T')[0] === baseDayData.date
        );
        
        // Find employees on leave for this specific date
        const employeesOnLeave = leavesData
          .filter(leave => {
            const leaveStart = new Date(leave.startDate);
            const leaveEnd = new Date(leave.endDate);
            const currentDate = new Date(baseDayData.date);
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
          date: baseDayData.date,
          dayName: baseDayData.dayName,
          dayNumber: baseDayData.dayNumber,
          isToday: baseDayData.isToday,
          isWeekend: baseDayData.isWeekend,
          primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
          backup: backupShift ? userMap.get(backupShift.userId) : undefined,
          employeesOnLeave
        };
      });

      setWeekSchedule(scheduleData);
    } catch (error) {
      console.error('Error fetching weekly data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, getWeekDates]);

  // Handle drag and drop
  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    // Extract user ID from draggableId
    const userId = draggableId.split('-')[0];

    // Handle drag outside droppable areas (destination is null)
    if (!destination) {
      // Check if the source was from an assigned shift slot (not from team-members)
      if (source.droppableId !== 'team-members') {
        // Extract date and role from source droppableId (format: YYYY-MM-DD-role)
        const sourceIdParts = source.droppableId.split('-');
        
        if (sourceIdParts.length >= 4) {
          const sourceRole = sourceIdParts[sourceIdParts.length - 1];
          const sourceDate = sourceIdParts.slice(0, -1).join('-');

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
          }
        }
      }
      return;
    }

    // Normal drop logic - destination exists
    const droppableIdParts = destination.droppableId.split('-');
    const role = droppableIdParts[droppableIdParts.length - 1];
    const date = droppableIdParts.slice(0, -1).join('-');
    
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

      // Create proper date strings for querying
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      // Check if there's already a shift for this date and role
      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        // For drag and drop, replace directly to save resources
        await shiftService.updateShift(existingShift.$id, {
          userId,
          onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
        }, `${user?.firstName} ${user?.lastName}`);

        toast({
          title: "Shift Updated",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment updated for ${date}`,
        });

        // Real-time subscription will handle UI updates automatically - no manual refresh needed
        setCreatingShift(null);
        return;
      } else {
        // Create new shift directly
        const shiftDate = `${date}T07:30:00.000Z`;

        await shiftService.createShift({
          userId,
          date: shiftDate,
          onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
          status: 'SCHEDULED',
        }, `${user?.firstName} ${user?.lastName}`);

        // Real-time subscription will handle UI updates automatically - no manual refresh needed
        setCreatingShift(null);
      }
    } catch (error) {
      console.error('Error in handleDragEnd:', error);
      setCreatingShift(null);
    }
  }, [teamMembers, toast, weekSchedule, user?.firstName, user?.lastName]);

  // Execute shift replacement
  const executeShiftReplacement = useCallback(async () => {
    if (!pendingOperation || pendingOperation.type !== 'replace') return;
    
    const { userId, existingShiftId } = pendingOperation;
    
    try {
      const slotId = `${pendingOperation.date}-${pendingOperation.role}`;
      setCreatingShift(slotId);
      
      await shiftService.updateShift(existingShiftId!, {
        userId,
        onCallRole: pendingOperation.role.toUpperCase() as 'PRIMARY' | 'BACKUP',
      }, `${user?.firstName} ${user?.lastName}`);

      // Real-time subscription will handle UI updates automatically - no manual refresh needed

    } catch (error) {
      console.error('Error replacing shift:', error);
      toast({
        title: "Error",
        description: "Failed to replace shift. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCreatingShift(null);
      setIsReplaceDialogOpen(false);
      setPendingOperation(null);
    }
  }, [pendingOperation, user?.firstName, user?.lastName, toast]);

  // Execute shift deletion
  const executeShiftDeletion = useCallback(async () => {
    if (!pendingOperation || pendingOperation.type !== 'delete') return;
    
    const { userId, date, role } = pendingOperation;
    
    try {
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

        // Real-time subscription will handle UI updates automatically - no manual refresh needed

        toast({
          title: "Assignment Removed",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment removed for ${date}`,
        });
      }
    } catch (error) {
      console.error('Error deleting shift:', error);
      toast({
        title: "Error",
        description: "Failed to remove assignment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setPendingOperation(null);
    }
  }, [pendingOperation, toast]);

  // Handle mobile assignment
  const handleMobileAssignment = useCallback(async (userId: string, role: 'primary' | 'backup', date: string) => {
    try {
      const slotId = `${date}-${role}`;
      setCreatingShift(slotId);
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setCreatingShift(null);
        return;
      }

      // Check if user is already assigned to the opposite role for this date
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

      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        // For Schedule Management mode, replace directly without dialog
        if (isScheduleManagement) {
          await shiftService.updateShift(existingShift.$id, {
            userId,
            onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
          }, `${user?.firstName} ${user?.lastName}`);

          toast({
            title: "Shift Updated",
            description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment updated for ${date}`,
          });

          // Real-time subscription will handle UI updates automatically - no manual refresh needed
        } else {
          // For home dashboard mode, show confirmation dialog
          setPendingOperation({
            type: 'replace',
            userId,
            date,
            role,
            existingShiftId: existingShift.$id
          });
          setIsReplaceDialogOpen(true);
        }
        
        setCreatingShift(null);
        return;
      } else {
        const shiftDate = `${date}T07:30:00.000Z`;

        await shiftService.createShift({
          userId,
          date: shiftDate,
          onCallRole: role.toUpperCase() as 'PRIMARY' | 'BACKUP',
          status: 'SCHEDULED',
        }, `${user?.firstName} ${user?.lastName}`);

        // Real-time subscription will handle UI updates automatically - no manual refresh needed

        setCreatingShift(null);
      }
    } catch (error) {
      console.error('Error in mobile assignment:', error);
      setCreatingShift(null);
    }
  }, [teamMembers, toast, weekSchedule, user?.firstName, user?.lastName, isScheduleManagement]);

  // Handle mobile remove assignment
  const handleMobileRemove = useCallback(async (role: 'primary' | 'backup', date: string) => {
    try {
      const slotId = `${date}-${role}`;
      setCreatingShift(slotId);
      
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setCreatingShift(null);
        return;
      }

      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const existingShifts = await shiftService.getShiftsByDateRange(startOfDay, endOfDay);
      const existingShift = existingShifts.find(s => 
        s.date.split('T')[0] === date && s.onCallRole === role.toUpperCase()
      );

      if (existingShift) {
        await shiftService.deleteShift(existingShift.$id);
        
        toast({
          title: "Assignment Removed",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment removed for ${date}`,
        });

        // Real-time subscription will handle UI updates automatically - no manual refresh needed
      } else {
        toast({
          title: "No Assignment Found",
          description: `No ${role} assignment found for ${date}`,
          variant: "destructive",
        });
      }

      setCreatingShift(null);
    } catch (error) {
      console.error('Error removing mobile assignment:', error);
      toast({
        title: "Error",
        description: "Failed to remove assignment. Please try again.",
        variant: "destructive",
      });
      setCreatingShift(null);
    }
  }, [toast]);

  useEffect(() => {
    fetchWeeklyData();
  }, [fetchWeeklyData]);

  // Enhanced auto-scroll to today in mobile/tablet view with better centering
  useEffect(() => {
    if (!isHorizontalScrollLayout || loading || weekSchedule.length === 0) return;

    const todayDate = new Date().toISOString().split('T')[0];
    const todayIndex = weekSchedule.findIndex(day => day.date === todayDate);
    
    if (todayIndex !== -1 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 176; // w-44 = 11rem = 176px
      const gap = 16; // space-x-4 = 1rem = 16px
      const containerWidth = container.clientWidth;
      const totalCardWidth = cardWidth + gap;
      
      // Calculate position to center TODAY card perfectly
      const scrollPosition = (todayIndex * totalCardWidth) - (containerWidth / 2) + (cardWidth / 2);
      
      // Add small delay to ensure DOM is ready
      setTimeout(() => {
        container.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [isHorizontalScrollLayout, loading, weekSchedule]);

  // Also scroll to today when week changes on mobile/tablet
  useEffect(() => {
    if (!isHorizontalScrollLayout) return;
    
    const todayDate = new Date().toISOString().split('T')[0];
    const todayIndex = weekSchedule.findIndex(day => day.date === todayDate);
    
    if (todayIndex !== -1 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cardWidth = 176; // w-44 = 11rem = 176px
      const gap = 16;
      const containerWidth = container.clientWidth;
      const totalCardWidth = cardWidth + gap;
      
      const scrollPosition = (todayIndex * totalCardWidth) - (containerWidth / 2) + (cardWidth / 2);
      
      setTimeout(() => {
        container.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: 'smooth'
        });
      }, 200);
    }
  }, [weekStartDate, isHorizontalScrollLayout, weekSchedule]);

  // Real-time subscription for shifts with optimized instant updates
  useEffect(() => {
    if (!user) return;

    const unsubscribe = client.subscribe(
      [`databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: Record<string, any>) => {
        const events = response.events || [];
        const payload = response.payload;
        
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
          const weekDates = getWeekDates();
          const startDate = weekDates[0].date;
          const endDate = weekDates[6].date;
          
          const shiftDate = payload?.date?.split('T')[0];
          if (shiftDate && shiftDate >= startDate && shiftDate <= endDate) {
            // Optimized real-time update: Update only the specific day without full component refresh
            setWeekSchedule(prevSchedule => {
              const updatedSchedule = [...prevSchedule];
              const dayIndex = updatedSchedule.findIndex(day => day.date === shiftDate);
              
              if (dayIndex !== -1) {
                const updatedDay = { ...updatedSchedule[dayIndex] };
                
                if (hasDeleteEvent) {
                  // Clear the specific role assignment instantly
                  if (payload.onCallRole === 'PRIMARY') {
                    updatedDay.primary = undefined;
                  } else if (payload.onCallRole === 'BACKUP') {
                    updatedDay.backup = undefined;
                  }
                } else if (hasCreateEvent || hasUpdateEvent) {
                  // Update the specific role assignment instantly
                  const userId = payload.userId;
                  const user = teamMembers.find(tm => tm.$id === userId);
                  
                  if (user) {
                    if (payload.onCallRole === 'PRIMARY') {
                      updatedDay.primary = user;
                    } else if (payload.onCallRole === 'BACKUP') {
                      updatedDay.backup = user;
                    }
                  }
                }
                
                updatedSchedule[dayIndex] = updatedDay;
              }
              
              return updatedSchedule;
            });
            
            // Clear any loading states for this slot instantly after successful real-time update
            const slotId = `${shiftDate}-${payload.onCallRole?.toLowerCase()}`;
            setCreatingShift(prev => prev === slotId ? null : prev);
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user, getWeekDates, teamMembers]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="h-5 w-5" />
            Weekly Schedule
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

  // Conditionally wrap with DragDropContext only for home dashboard mode
  if (isScheduleManagement) {
    return (
      <div className="space-y-4">
        {/* Weekly Schedule - No header for schedule management mode */}
        <Card className={className}>
          <CardContent className="p-0">
            {/* Mobile: Enhanced Touch-friendly assignment view */}
            {isMobile ? (
              <div className="md:hidden">
                {/* Mobile Day Indicator */}
                <div className="px-4 py-3 border-b bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    Swipe left or right to navigate days
                  </p>
                </div>
                <div 
                  ref={scrollContainerRef}
                  className={`flex overflow-x-auto pb-6 pt-4 px-4 space-x-4 scrollbar-thin horizontal-scroll snap-x snap-mandatory transition-all duration-300 ${
                    isAnimating ? (
                      animationDirection === 'left' ? 'animate-slide-left' : 
                      animationDirection === 'right' ? 'animate-slide-right' : 
                      'animate-fade-in'
                    ) : ''
                  }`}
                  style={{ scrollbarWidth: 'thin' }}
                >
                  {weekSchedule.map((day) => {
                    // Enhanced mobile styling for TODAY
                    const isToday = day.isToday;
                    const isWeekend = day.isWeekend;
                    
                    let cardClass = 'flex-shrink-0 w-44 snap-center transition-all duration-300';
                    let innerCardClass = 'h-full border rounded-lg';
                    
                    if (isToday) {
                      cardClass += ' scale-105'; // Slightly larger for TODAY
                      innerCardClass += ' border-blue-500 bg-gradient-to-b from-blue-50 to-blue-100/70 dark:from-blue-950/70 dark:to-blue-900/50 shadow-lg ring-2 ring-blue-200 dark:ring-blue-800';
                    } else if (isWeekend) {
                      innerCardClass += ' border-orange-200 bg-gradient-to-b from-orange-25 to-amber-25 dark:from-orange-950/30 dark:to-amber-950/20';
                    } else {
                      innerCardClass += ' border-border bg-card hover:bg-muted/30';
                    }
                    
                    return (
                      <div key={day.date} className={cardClass}>
                        <div className={innerCardClass}>
                          {/* Enhanced Mobile Day Header */}
                          <div className="p-3 text-center border-b">
                            <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${
                              isToday ? 'text-blue-700 dark:text-blue-300' : 
                              isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                              'text-muted-foreground'
                            }`}>
                              {day.dayName}
                            </div>
                            <div className={`text-xl font-bold ${
                              isToday ? 'text-blue-700 dark:text-blue-300' : 
                              isWeekend ? 'text-orange-700 dark:text-orange-300' : 
                              'text-foreground'
                            }`}>
                              {day.dayNumber}
                            </div>
                            {isToday && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1 bg-blue-200 dark:bg-blue-800 rounded-full px-2 py-0.5">
                                TODAY
                              </div>
                            )}
                          </div>
                          
                          {/* Mobile Shift Assignment */}
                          <div className="p-3">
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
                            
                            {/* Mobile Leave Indicator */}
                            {day.employeesOnLeave && day.employeesOnLeave.length > 0 && (
                              <div className="mt-3 pt-2 border-t">
                                <Badge variant="secondary" className="text-xs">
                                  {day.employeesOnLeave.length} on leave
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Mobile Navigation Dots */}
                <div className="flex justify-center py-3 space-x-2">
                  {weekSchedule.map((day, index) => (
                    <button
                      key={day.date}
                      onClick={() => {
                        if (scrollContainerRef.current) {
                          const container = scrollContainerRef.current;
                          const cardWidth = 180;
                          const gap = 16;
                          const containerWidth = container.clientWidth;
                          const totalCardWidth = cardWidth + gap;
                          const scrollPosition = (index * totalCardWidth) - (containerWidth / 2) + (cardWidth / 2);
                          
                          container.scrollTo({
                            left: Math.max(0, scrollPosition),
                            behavior: 'smooth'
                          });
                        }
                      }}
                      aria-label={`Go to ${day.dayName}, ${day.dayNumber}`}
                      className={`w-2 h-2 rounded-full transition-all duration-200 ${
                        day.isToday ? 'bg-blue-500 scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
                      }`}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /* Desktop: Enhanced responsive grid view */
              <div className="hidden md:block">
                <div className={`grid grid-cols-7 divide-x divide-border border-t transition-all duration-300 ${
                  isAnimating ? (
                    animationDirection === 'left' ? 'animate-slide-left' : 
                    animationDirection === 'right' ? 'animate-slide-right' : 
                    'animate-fade-in'
                  ) : ''
                }`}>
                  {weekSchedule.map((day) => {
                    // Enhanced styling for different day types with better responsiveness
                    let backgroundClass = 'hover:bg-muted/30 transition-colors duration-200';
                    let headerClass = 'text-muted-foreground';
                    let numberClass = 'text-foreground';
                    
                    if (day.isToday) {
                      backgroundClass = 'bg-gradient-to-b from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-l-4 border-l-blue-500 hover:bg-blue-100/70 dark:hover:bg-blue-900/40';
                      headerClass = 'text-blue-700 dark:text-blue-300 font-semibold';
                      numberClass = 'text-blue-700 dark:text-blue-300 font-bold';
                    } else if (day.isWeekend) {
                      backgroundClass = 'bg-gradient-to-b from-orange-25 to-amber-25 dark:from-orange-950/20 dark:to-amber-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/30';
                      headerClass = 'text-orange-600 dark:text-orange-400';
                      numberClass = 'text-orange-700 dark:text-orange-300';
                    }
                    
                    return (
                      <div 
                        key={day.date} 
                        className={`p-3 lg:p-4 space-y-3 lg:space-y-4 min-h-[140px] lg:min-h-[160px] ${backgroundClass}`}
                      >
                        {/* Enhanced Responsive Day Header */}
                        <div className="text-center space-y-1">
                          <div className={`text-xs font-medium uppercase tracking-wide ${headerClass}`}>
                            {day.dayName}
                          </div>
                          <div className={`text-lg lg:text-xl font-bold ${numberClass} ${day.isToday ? 'bg-blue-200 dark:bg-blue-800 rounded-full w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center mx-auto' : ''}`}>
                            {day.dayNumber}
                          </div>
                          {day.isToday && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                              Today
                            </div>
                          )}
                        </div>

                        {/* Primary Assignment */}
                        <div className="space-y-2">
                          <Badge variant="default" className="text-xs px-2 py-1 h-6 bg-blue-600 hover:bg-blue-700 font-medium">
                            Primary
                          </Badge>
                          {isScheduleManagement ? (
                            /* Schedule Management Mode - Clickable assignments */
                            day.primary ? (
                              (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-lg cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors border-2 border-transparent hover:border-blue-300 dark:hover:border-blue-700">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium text-sm">Primary On-Call</div>
                                          <div className="text-sm">
                                            {(day.primary as User).firstName} {(day.primary as User).lastName}
                                          </div>
                                        </div>
                                        {creatingShift === `${day.date}-primary` && (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        )}
                                      </div>
                                    </div>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="center" className="w-48">
                                    <DropdownMenuLabel className="text-xs">Change Primary</DropdownMenuLabel>
                                    {deduplicateTeamMembers(teamMembers)
                                      .filter((employee) => {
                                        // Exclude manager/admin
                                        if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                        // Exclude current primary user
                                        if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                        // Exclude current backup user to prevent same person being both
                                        if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                        return true;
                                      })
                                      .map((employee) => (
                                      <DropdownMenuItem
                                        key={`primary-${employee.$id}`}
                                        onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                        className="text-xs"
                                        disabled={creatingShift === `${day.date}-primary`}
                                      >
                                        {employee.firstName} {employee.lastName}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleMobileRemove('primary', day.date)}
                                      className="text-xs text-red-600 dark:text-red-400"
                                      disabled={creatingShift === `${day.date}-primary`}
                                    >
                                      Remove Primary
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm">Primary On-Call</div>
                                      <div className="text-sm">
                                        {(day.primary as User).firstName} {(day.primary as User).lastName}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            ) : (
                              /* Show + button for unassigned primary shift - managers only */
                              (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      className="w-full h-16 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                                      disabled={creatingShift === `${day.date}-primary`}
                                    >
                                      <div className="text-center">
                                        {creatingShift === `${day.date}-primary` ? (
                                          <>
                                            <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                            <div className="text-sm font-medium">Assigning...</div>
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="h-5 w-5 mx-auto mb-1" />
                                            <div className="text-sm font-medium">Assign Primary</div>
                                          </>
                                        )}
                                      </div>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="center" className="w-48">
                                    <DropdownMenuLabel className="text-xs">Assign Primary</DropdownMenuLabel>
                                    {deduplicateTeamMembers(teamMembers)
                                      .filter((employee) => {
                                        // Exclude manager/admin
                                        if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                        // Exclude current backup user to prevent same person being both
                                        if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                        return true;
                                      })
                                      .map((employee) => (
                                      <DropdownMenuItem
                                        key={`primary-${employee.$id}`}
                                        onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                        className="text-xs"
                                        disabled={creatingShift === `${day.date}-primary`}
                                      >
                                        {employee.firstName} {employee.lastName}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                  <div className="text-sm">No Primary Assigned</div>
                                </div>
                              )
                            )
                          ) : (
                            /* Home Dashboard Mode - Show drag & drop */
                            <DroppableSlot
                              droppableId={`${day.date}-primary`}
                              assignedUser={day.primary as User}
                              slotType="primary"
                              className="min-h-[50px] lg:min-h-[60px] border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-lg"
                              isCreating={creatingShift === `${day.date}-primary`}
                            />
                          )}
                        </div>

                        {/* Backup Assignment */}
                        <div className="space-y-2">
                          <Badge variant="outline" className="text-xs px-2 py-1 h-6 border-green-400 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-300 font-medium">
                            Backup
                          </Badge>
                          {isScheduleManagement ? (
                            /* Schedule Management Mode - Clickable assignments */
                            day.backup ? (
                              (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-3 rounded-lg cursor-pointer hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors border-2 border-transparent hover:border-green-300 dark:hover:border-green-700">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium text-sm">Backup On-Call</div>
                                          <div className="text-sm">
                                            {(day.backup as User).firstName} {(day.backup as User).lastName}
                                          </div>
                                        </div>
                                        {creatingShift === `${day.date}-backup` && (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        )}
                                      </div>
                                    </div>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="center" className="w-48">
                                    <DropdownMenuLabel className="text-xs">Change Backup</DropdownMenuLabel>
                                    {deduplicateTeamMembers(teamMembers)
                                      .filter((employee) => {
                                        // Exclude manager/admin
                                        if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                        // Exclude current backup user
                                        if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                        // Exclude current primary user to prevent same person being both
                                        if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                        return true;
                                      })
                                      .map((employee) => (
                                      <DropdownMenuItem
                                        key={`backup-${employee.$id}`}
                                        onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                        className="text-xs"
                                        disabled={creatingShift === `${day.date}-backup`}
                                      >
                                        {employee.firstName} {employee.lastName}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleMobileRemove('backup', day.date)}
                                      className="text-xs text-red-600 dark:text-red-400"
                                      disabled={creatingShift === `${day.date}-backup`}
                                    >
                                      Remove Backup
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-3 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm">Backup On-Call</div>
                                      <div className="text-sm">
                                        {(day.backup as User).firstName} {(day.backup as User).lastName}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            ) : (
                              (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      className="w-full h-16 border-2 border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                                      disabled={creatingShift === `${day.date}-backup`}
                                    >
                                      <div className="text-center">
                                        {creatingShift === `${day.date}-backup` ? (
                                          <>
                                            <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                            <div className="text-sm font-medium">Assigning...</div>
                                          </>
                                        ) : (
                                          <>
                                            <Plus className="h-5 w-5 mx-auto mb-1" />
                                            <div className="text-sm font-medium">Assign Backup</div>
                                          </>
                                        )}
                                      </div>
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="center" className="w-48">
                                    <DropdownMenuLabel className="text-xs">Assign Backup</DropdownMenuLabel>
                                    {deduplicateTeamMembers(teamMembers)
                                      .filter((employee) => {
                                        // Exclude manager/admin
                                        if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                        // Exclude current primary user to prevent same person being both
                                        if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                        return true;
                                      })
                                      .map((employee) => (
                                      <DropdownMenuItem
                                        key={`backup-${employee.$id}`}
                                        onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                        className="text-xs"
                                        disabled={creatingShift === `${day.date}-backup`}
                                      >
                                        {employee.firstName} {employee.lastName}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                  <div className="text-sm">No Backup Assigned</div>
                                </div>
                              )
                            )
                          ) : (
                            /* Home Dashboard Mode - Show drag & drop */
                            <DroppableSlot
                              droppableId={`${day.date}-backup`}
                              assignedUser={day.backup as User}
                              slotType="backup"
                              className="min-h-[50px] lg:min-h-[60px] border-2 border-dashed border-green-200 dark:border-green-800 rounded-lg"
                              isCreating={creatingShift === `${day.date}-backup`}
                            />
                          )}
                        </div>

                        {/* Employees on Leave Indicator */}
                        {day.employeesOnLeave && day.employeesOnLeave.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-muted">
                            <Badge variant="secondary" className="text-xs">
                              {day.employeesOnLeave.length} on leave
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Home dashboard mode with DragDropContext
  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {/* Mobile-First Enhanced Navigation Header */}
          <Card>
            <CardHeader className="pb-3 sm:pb-4">
              {/* Mobile Header - Compact */}
              <div className="block sm:hidden">
                <div className="flex items-center justify-between mb-4">
                  <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                    <Calendar className="h-5 w-5" />
                    Weekly Schedule
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={navigateToCurrentWeek}
                      className="text-xs px-3 py-1.5"
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRefreshing(true);
                        fetchWeeklyData().finally(() => setRefreshing(false));
                      }}
                      disabled={refreshing}
                      className="px-2 py-1.5"
                    >
                      {refreshing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Mobile Week Navigation - Horizontal */}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateToPreviousWeek}
                    className="flex items-center gap-1 px-3 text-xs"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  
                  <div className="flex-1 text-center px-2">
                    <h3 className="font-semibold text-sm leading-tight">
                      {weekStartDate.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })} - {new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric' 
                      })}
                    </h3>
                    <p className="hidden text-xs text-muted-foreground">
                      Mon - Sun
                    </p>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateToNextWeek}
                    className="flex items-center gap-1 px-3 text-xs"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Desktop Header - Full */}
              <div className="hidden sm:block">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Calendar className="h-6 w-6" />
                    Weekly Schedule
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={navigateToCurrentWeek}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRefreshing(true);
                        fetchWeeklyData().finally(() => setRefreshing(false));
                      }}
                      disabled={refreshing}
                    >
                      {refreshing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Desktop Week Navigation */}
                <div className="flex items-center justify-between mt-8">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateToPreviousWeek}
                    className="flex items-center gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous Week
                  </Button>
                  
                  <div className="flex flex-col items-center">
                    <h3 className="font-semibold text-sm lg:text-lg">
                      {weekStartDate.toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric',
                        year: 'numeric' 
                      })} - {new Date(weekStartDate.getTime() + 6 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { 
                        month: 'long', 
                        day: 'numeric',
                        year: 'numeric' 
                      })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Monday to Sunday
                    </p>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={navigateToNextWeek}
                    className="flex items-center gap-1"
                  >
                    Next Week
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Team Members Panel - Only show for managers and on large screens and above and NOT in schedule management mode */}
          <div className="hidden lg:block">
            {user.role === 'MANAGER' && teamMembers.length > 0 && !isScheduleManagement && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Badge variant="secondary" className="px-2 py-1">
                      {deduplicateTeamMembers(teamMembers).length}
                    </Badge>
                    Team Members - Drag to assign shifts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Droppable droppableId="team-members" direction="horizontal">
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="flex flex-wrap gap-3"
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
          </div>

          {/* Weekly Schedule */}
          <Card className={className}>
            <CardContent className="p-0">
              {/* Mobile and Tablet: Enhanced Touch-friendly assignment view (up to lg breakpoint) */}
              <div className="lg:hidden">
                {/* Mobile Day Indicator */}
                <div className="px-4 py-3 border-b bg-muted/30">
                  <p className="text-sm text-muted-foreground text-center">
                    Swipe left or right to navigate days
                  </p>
                </div>
                  <div 
                    ref={scrollContainerRef}
                    className="flex overflow-x-auto pb-6 pt-4 px-4 space-x-4 scrollbar-thin horizontal-scroll snap-x snap-mandatory"
                    style={{ scrollbarWidth: 'thin' }}
                  >
                    {weekSchedule.map((day) => {
                      // Enhanced mobile styling for TODAY
                      const isToday = day.isToday;
                      const isWeekend = day.isWeekend;
                      
                      let cardClass = 'flex-shrink-0 w-44 snap-center transition-all duration-300';
                      let innerCardClass = 'h-full border rounded-lg';
                      
                      if (isToday) {
                        cardClass += ' scale-105'; // Slightly larger for TODAY
                        innerCardClass += ' border-blue-500 bg-gradient-to-b from-blue-50 to-blue-100/70 dark:from-blue-950/70 dark:to-blue-900/50 shadow-lg ring-2 ring-blue-200 dark:ring-blue-800';
                      } else if (isWeekend) {
                        innerCardClass += ' border-orange-200 bg-gradient-to-b from-orange-25 to-amber-25 dark:from-orange-950/30 dark:to-amber-950/20';
                      } else {
                        innerCardClass += ' border-border bg-card hover:bg-muted/30';
                      }
                      
                      return (
                        <div key={day.date} className={cardClass}>
                          <div className={innerCardClass}>
                            {/* Enhanced Mobile Day Header */}
                            <div className="p-3 text-center border-b">
                              <div className={`text-xs font-medium uppercase tracking-wide mb-1 ${
                                isToday ? 'text-blue-700 dark:text-blue-300' : 
                                isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                                'text-muted-foreground'
                              }`}>
                                {day.dayName}
                              </div>
                              <div className={`text-xl font-bold ${
                                isToday ? 'text-blue-700 dark:text-blue-300' : 
                                isWeekend ? 'text-orange-700 dark:text-orange-300' : 
                                'text-foreground'
                              }`}>
                                {day.dayNumber}
                              </div>
                              {isToday && (
                                <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1 bg-blue-200 dark:bg-blue-800 rounded-full px-2 py-0.5">
                                  TODAY
                                </div>
                              )}
                            </div>
                            
                            {/* Mobile Shift Assignment - Remove the component's own header styling */}
                            <div className="p-3">
                              {/* Primary Assignment */}
                              <div className="space-y-2 mb-3">
                                <div className="flex items-center justify-between">
                                  <Badge variant="default" className="text-xs px-2 py-0.5 h-5 bg-blue-600">
                                    Primary
                                  </Badge>
                                  {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          disabled={creatingShift === `${day.date}-primary`}
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="center" className="w-48">
                                        <DropdownMenuLabel className="text-xs">
                                          {day.primary ? 'Change Primary' : 'Assign Primary'}
                                        </DropdownMenuLabel>
                                        {deduplicateTeamMembers(teamMembers)
                                          .filter((employee) => {
                                            // Exclude manager/admin
                                            if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                            // Exclude current primary user
                                            if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                            // Exclude current backup user to prevent same person being both
                                            if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                            return true;
                                          })
                                          .map((employee) => (
                                          <DropdownMenuItem
                                            key={`primary-${employee.$id}`}
                                            onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                            className="text-xs"
                                            disabled={creatingShift === `${day.date}-primary`}
                                          >
                                            {employee.firstName} {employee.lastName}
                                          </DropdownMenuItem>
                                        ))}
                                        {day.primary && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              onClick={() => handleMobileRemove('primary', day.date)}
                                              className="text-xs text-red-600 dark:text-red-400"
                                              disabled={creatingShift === `${day.date}-primary`}
                                            >
                                              Remove Primary
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                                
                                <div className="min-h-[40px] rounded border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-2">
                                  {day.primary ? (
                                    <Badge 
                                      className="bg-blue-600 text-white px-2 py-1 text-xs"
                                    >
                                      {(day.primary as User).firstName[0]}{(day.primary as User).lastName[0]}
                                    </Badge>
                                  ) : creatingShift === `${day.date}-primary` ? (
                                    <div className="flex items-center gap-2 text-xs text-blue-600">
                                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
                                      Creating...
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Unassigned</span>
                                  )}
                                </div>
                              </div>

                              {/* Backup Assignment */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs px-2 py-0.5 h-5 border-green-400 text-green-700 bg-green-50">
                                    Backup
                                  </Badge>
                                  {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          disabled={creatingShift === `${day.date}-backup`}
                                        >
                                          <Plus className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="center" className="w-48">
                                        <DropdownMenuLabel className="text-xs">
                                          {day.backup ? 'Change Backup' : 'Assign Backup'}
                                        </DropdownMenuLabel>
                                        {deduplicateTeamMembers(teamMembers)
                                          .filter((employee) => {
                                            // Exclude manager/admin
                                            if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                            // Exclude current backup user
                                            if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                            // Exclude current primary user to prevent same person being both
                                            if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                            return true;
                                          })
                                          .map((employee) => (
                                          <DropdownMenuItem
                                            key={`backup-${employee.$id}`}
                                            onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                            className="text-xs"
                                            disabled={creatingShift === `${day.date}-backup`}
                                          >
                                            {employee.firstName} {employee.lastName}
                                          </DropdownMenuItem>
                                        ))}
                                        {day.backup && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                              onClick={() => handleMobileRemove('backup', day.date)}
                                              className="text-xs text-red-600 dark:text-red-400"
                                              disabled={creatingShift === `${day.date}-backup`}
                                            >
                                              Remove Backup
                                            </DropdownMenuItem>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                                
                                <div className="min-h-[40px] rounded border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-2">
                                  {day.backup ? (
                                    <Badge 
                                      className="bg-green-600 text-white px-2 py-1 text-xs"
                                    >
                                      {(day.backup as User).firstName[0]}{(day.backup as User).lastName[0]}
                                    </Badge>
                                  ) : creatingShift === `${day.date}-backup` ? (
                                    <div className="flex items-center gap-2 text-xs text-green-600">
                                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-green-600 border-t-transparent"></div>
                                      Creating...
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Unassigned</span>
                                  )}
                                </div>
                              </div>
                              
                              {/* Mobile Leave Indicator */}
                              {day.employeesOnLeave && day.employeesOnLeave.length > 0 && (
                                <div className="mt-3 pt-2 border-t">
                                  <Badge variant="secondary" className="text-xs">
                                    {day.employeesOnLeave.length} on leave
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Mobile Navigation Dots */}
                  <div className="flex justify-center py-3 space-x-2">
                    {weekSchedule.map((day, index) => (
                      <button
                        key={day.date}
                        onClick={() => {
                          if (scrollContainerRef.current) {
                            const container = scrollContainerRef.current;
                            const cardWidth = 176; // w-44 = 11rem = 176px
                            const gap = 16;
                            const containerWidth = container.clientWidth;
                            const totalCardWidth = cardWidth + gap;
                            const scrollPosition = (index * totalCardWidth) - (containerWidth / 2) + (cardWidth / 2);
                            
                            container.scrollTo({
                              left: Math.max(0, scrollPosition),
                              behavior: 'smooth'
                            });
                          }
                        }}
                        aria-label={`Go to ${day.dayName}, ${day.dayNumber}`}
                        className={`w-2 h-2 rounded-full transition-all duration-200 ${
                          day.isToday ? 'bg-blue-500 scale-125' : 'bg-muted-foreground/30 hover:bg-muted-foreground/60'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                
                {/* Desktop: Enhanced responsive grid view */}
                <div className="hidden lg:block">
                  <div className="grid grid-cols-7 divide-x divide-border border-t">
                    {weekSchedule.map((day) => {
                      // Enhanced styling for different day types with better responsiveness
                      let backgroundClass = 'hover:bg-muted/30 transition-colors duration-200';
                      let headerClass = 'text-muted-foreground';
                      let numberClass = 'text-foreground';
                      
                      if (day.isToday) {
                        backgroundClass = 'bg-gradient-to-b from-blue-50 to-blue-100/50 dark:from-blue-950/50 dark:to-blue-900/30 border-l-4 border-l-blue-500 hover:bg-blue-100/70 dark:hover:bg-blue-900/40';
                        headerClass = 'text-blue-700 dark:text-blue-300 font-semibold';
                        numberClass = 'text-blue-700 dark:text-blue-300 font-bold';
                      } else if (day.isWeekend) {
                        backgroundClass = 'bg-gradient-to-b from-orange-25 to-amber-25 dark:from-orange-950/20 dark:to-amber-950/10 hover:bg-orange-50 dark:hover:bg-orange-950/30';
                        headerClass = 'text-orange-600 dark:text-orange-400';
                        numberClass = 'text-orange-700 dark:text-orange-300';
                      }
                      
                      return (
                        <div 
                          key={day.date} 
                          className={`p-3 lg:p-4 space-y-3 lg:space-y-4 min-h-[140px] lg:min-h-[160px] ${backgroundClass}`}
                        >
                          {/* Enhanced Responsive Day Header */}
                          <div className="text-center space-y-1">
                            <div className={`text-xs font-medium uppercase tracking-wide ${headerClass}`}>
                              {day.dayName}
                            </div>
                            <div className={`text-lg lg:text-xl font-bold ${numberClass} ${day.isToday ? 'bg-blue-200 dark:bg-blue-800 rounded-full w-7 h-7 lg:w-8 lg:h-8 flex items-center justify-center mx-auto' : ''}`}>
                              {day.dayNumber}
                            </div>
                            {day.isToday && (
                              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                Today
                              </div>
                            )}
                          </div>

                          {/* Primary Assignment */}
                          <div className="space-y-2">
                            <Badge variant="default" className="text-xs px-2 py-1 h-6 bg-blue-600 hover:bg-blue-700 font-medium">
                              Primary
                            </Badge>
                            {isScheduleManagement ? (
                              /* Schedule Management Mode - Show + button */
                              day.primary ? (
                                <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm">Primary On-Call</div>
                                      <div className="text-sm">
                                        {(day.primary as User).firstName} {(day.primary as User).lastName}
                                      </div>
                                    </div>
                                    {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 w-8 p-0 hover:bg-blue-200 dark:hover:bg-blue-800"
                                            disabled={creatingShift === `${day.date}-primary`}
                                          >
                                            {creatingShift === `${day.date}-primary` ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Plus className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48">
                                          <DropdownMenuLabel className="text-xs">Change Primary</DropdownMenuLabel>
                                          {deduplicateTeamMembers(teamMembers)
                                            .filter((employee) => {
                                              // Exclude manager/admin
                                              if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                              // Exclude current primary user
                                              if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                              // Exclude current backup user to prevent same person being both
                                              if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                              return true;
                                            })
                                            .map((employee) => (
                                            <DropdownMenuItem
                                              key={`primary-${employee.$id}`}
                                              onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                              className="text-xs"
                                              disabled={creatingShift === `${day.date}-primary`}
                                            >
                                              {employee.firstName} {employee.lastName}
                                            </DropdownMenuItem>
                                          ))}
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => handleMobileRemove('primary', day.date)}
                                            className="text-xs text-red-600 dark:text-red-400"
                                            disabled={creatingShift === `${day.date}-primary`}
                                          >
                                            Remove Primary
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        className="w-full h-16 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                                        disabled={creatingShift === `${day.date}-primary`}
                                      >
                                        <div className="text-center">
                                          {creatingShift === `${day.date}-primary` ? (
                                            <>
                                              <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                              <div className="text-sm font-medium">Assigning...</div>
                                            </>
                                          ) : (
                                            <>
                                              <Plus className="h-5 w-5 mx-auto mb-1" />
                                              <div className="text-sm font-medium">Assign Primary</div>
                                            </>
                                          )}
                                        </div>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48">
                                      <DropdownMenuLabel className="text-xs">Assign Primary</DropdownMenuLabel>
                                      {deduplicateTeamMembers(teamMembers)
                                        .filter((employee) => {
                                          // Exclude manager/admin
                                          if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                          // Exclude current backup user to prevent same person being both
                                          if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                          return true;
                                        })
                                        .map((employee) => (
                                        <DropdownMenuItem
                                          key={`primary-${employee.$id}`}
                                          onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                          className="text-xs"
                                          disabled={creatingShift === `${day.date}-primary`}
                                        >
                                          {employee.firstName} {employee.lastName}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : (
                                  <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                    <div className="text-sm">No Primary Assigned</div>
                                  </div>
                                )
                              )
                            ) : (
                              /* Home Dashboard Mode - Show dropdown on md and below, drag & drop on lg+ */
                              <>
                                {/* Medium screens and below - Show dropdown menu */}
                                <div className="block lg:hidden">
                                  {day.primary ? (
                                    <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-lg">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium text-sm">Primary On-Call</div>
                                          <div className="text-sm">
                                            {(day.primary as User).firstName} {(day.primary as User).lastName}
                                          </div>
                                        </div>
                                        {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 w-8 p-0 hover:bg-blue-200 dark:hover:bg-blue-800"
                                                disabled={creatingShift === `${day.date}-primary`}
                                              >
                                                {creatingShift === `${day.date}-primary` ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Plus className="h-4 w-4" />
                                                )}
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="center" className="w-48">
                                              <DropdownMenuLabel className="text-xs">Change Primary</DropdownMenuLabel>
                                              {deduplicateTeamMembers(teamMembers)
                                                .filter((employee) => {
                                                  // Exclude manager/admin
                                                  if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                                  // Exclude current primary user
                                                  if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                                  // Exclude current backup user to prevent same person being both
                                                  if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                                  return true;
                                                })
                                                .map((employee) => (
                                                <DropdownMenuItem
                                                  key={`primary-${employee.$id}`}
                                                  onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                                  className="text-xs"
                                                  disabled={creatingShift === `${day.date}-primary`}
                                                >
                                                  {employee.firstName} {employee.lastName}
                                                </DropdownMenuItem>
                                              ))}
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                onClick={() => handleMobileRemove('primary', day.date)}
                                                className="text-xs text-red-600 dark:text-red-400"
                                                disabled={creatingShift === `${day.date}-primary`}
                                              >
                                                Remove Primary
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            className="w-full h-16 border-2 border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                                            disabled={creatingShift === `${day.date}-primary`}
                                          >
                                            <div className="text-center">
                                              {creatingShift === `${day.date}-primary` ? (
                                                <>
                                                  <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                                  <div className="text-sm font-medium">Assigning...</div>
                                                </>
                                              ) : (
                                                <>
                                                  <Plus className="h-5 w-5 mx-auto mb-1" />
                                                  <div className="text-sm font-medium">Assign Primary</div>
                                                </>
                                              )}
                                            </div>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48">
                                          <DropdownMenuLabel className="text-xs">Assign Primary</DropdownMenuLabel>
                                          {deduplicateTeamMembers(teamMembers)
                                            .filter((employee) => {
                                              // Exclude manager/admin
                                              if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                              // Exclude current backup user to prevent same person being both
                                              if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                              return true;
                                            })
                                            .map((employee) => (
                                            <DropdownMenuItem
                                              key={`primary-${employee.$id}`}
                                              onClick={() => handleMobileAssignment(employee.$id, 'primary', day.date)}
                                              className="text-xs"
                                              disabled={creatingShift === `${day.date}-primary`}
                                            >
                                              {employee.firstName} {employee.lastName}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : (
                                      <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                        <div className="text-sm">No Primary Assigned</div>
                                      </div>
                                    )
                                  )}
                                </div>
                                
                                {/* Large screens and above - Show drag & drop */}
                                <div className="hidden lg:block">
                                  <DroppableSlot
                                    droppableId={`${day.date}-primary`}
                                    assignedUser={day.primary as User}
                                    slotType="primary"
                                    className="min-h-[50px] lg:min-h-[60px] border-2 border-dashed border-blue-200 dark:border-blue-800 rounded-lg"
                                    isCreating={creatingShift === `${day.date}-primary`}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Backup Assignment */}
                          <div className="space-y-2">
                            <Badge variant="outline" className="text-xs px-2 py-1 h-6 border-green-400 text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-300 font-medium">
                              Backup
                            </Badge>
                            {isScheduleManagement ? (
                              /* Schedule Management Mode - Show + button */
                              day.backup ? (
                                <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-3 rounded-lg">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <div className="font-medium text-sm">Backup On-Call</div>
                                      <div className="text-sm">
                                        {(day.backup as User).firstName} {(day.backup as User).lastName}
                                      </div>
                                    </div>
                                    {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-8 w-8 p-0 hover:bg-green-200 dark:hover:bg-green-800"
                                            disabled={creatingShift === `${day.date}-backup`}
                                          >
                                            {creatingShift === `${day.date}-backup` ? (
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                              <Plus className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48">
                                          <DropdownMenuLabel className="text-xs">Change Backup</DropdownMenuLabel>
                                          {deduplicateTeamMembers(teamMembers)
                                            .filter((employee) => {
                                              // Exclude manager/admin
                                              if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                              // Exclude current backup user
                                              if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                              // Exclude current primary user to prevent same person being both
                                              if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                              return true;
                                            })
                                            .map((employee) => (
                                            <DropdownMenuItem
                                              key={`backup-${employee.$id}`}
                                              onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                              className="text-xs"
                                              disabled={creatingShift === `${day.date}-backup`}
                                            >
                                              {employee.firstName} {employee.lastName}
                                            </DropdownMenuItem>
                                          ))}
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={() => handleMobileRemove('backup', day.date)}
                                            className="text-xs text-red-600 dark:text-red-400"
                                            disabled={creatingShift === `${day.date}-backup`}
                                          >
                                            Remove Backup
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        className="w-full h-16 border-2 border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                                        disabled={creatingShift === `${day.date}-backup`}
                                      >
                                        <div className="text-center">
                                          {creatingShift === `${day.date}-backup` ? (
                                            <>
                                              <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                              <div className="text-sm font-medium">Assigning...</div>
                                            </>
                                          ) : (
                                            <>
                                              <Plus className="h-5 w-5 mx-auto mb-1" />
                                              <div className="text-sm font-medium">Assign Backup</div>
                                            </>
                                          )}
                                        </div>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48">
                                      <DropdownMenuLabel className="text-xs">Assign Backup</DropdownMenuLabel>
                                      {deduplicateTeamMembers(teamMembers)
                                        .filter((employee) => {
                                          // Exclude manager/admin
                                          if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                          // Exclude current primary user to prevent same person being both
                                          if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                          return true;
                                        })
                                        .map((employee) => (
                                        <DropdownMenuItem
                                          key={`backup-${employee.$id}`}
                                          onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                          className="text-xs"
                                          disabled={creatingShift === `${day.date}-backup`}
                                        >
                                          {employee.firstName} {employee.lastName}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                ) : (
                                  <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                    <div className="text-sm">No Backup Assigned</div>
                                  </div>
                                )
                              )
                            ) : (
                              /* Home Dashboard Mode - Show dropdown on md and below, drag & drop on lg+ */
                              <>
                                {/* Medium screens and below - Show dropdown menu */}
                                <div className="block lg:hidden">
                                  {day.backup ? (
                                    <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-3 rounded-lg">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="font-medium text-sm">Backup On-Call</div>
                                          <div className="text-sm">
                                            {(day.backup as User).firstName} {(day.backup as User).lastName}
                                          </div>
                                        </div>
                                        {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                className="h-8 w-8 p-0 hover:bg-green-200 dark:hover:bg-green-800"
                                                disabled={creatingShift === `${day.date}-backup`}
                                              >
                                                {creatingShift === `${day.date}-backup` ? (
                                                  <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                  <Plus className="h-4 w-4" />
                                                )}
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="center" className="w-48">
                                              <DropdownMenuLabel className="text-xs">Change Backup</DropdownMenuLabel>
                                              {deduplicateTeamMembers(teamMembers)
                                                .filter((employee) => {
                                                  // Exclude manager/admin
                                                  if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                                  // Exclude current backup user
                                                  if (day.backup && (day.backup as User).$id === employee.$id) return false;
                                                  // Exclude current primary user to prevent same person being both
                                                  if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                                  return true;
                                                })
                                                .map((employee) => (
                                                <DropdownMenuItem
                                                  key={`backup-${employee.$id}`}
                                                  onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                                  className="text-xs"
                                                  disabled={creatingShift === `${day.date}-backup`}
                                                >
                                                  {employee.firstName} {employee.lastName}
                                                </DropdownMenuItem>
                                              ))}
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                onClick={() => handleMobileRemove('backup', day.date)}
                                                className="text-xs text-red-600 dark:text-red-400"
                                                disabled={creatingShift === `${day.date}-backup`}
                                              >
                                                Remove Backup
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    (user.role === 'MANAGER' || user.role === 'ADMIN') ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button 
                                            variant="ghost" 
                                            className="w-full h-16 border-2 border-dashed border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950"
                                            disabled={creatingShift === `${day.date}-backup`}
                                          >
                                            <div className="text-center">
                                              {creatingShift === `${day.date}-backup` ? (
                                                <>
                                                  <Loader2 className="h-5 w-5 mx-auto mb-1 animate-spin" />
                                                  <div className="text-sm font-medium">Assigning...</div>
                                                </>
                                              ) : (
                                                <>
                                                  <Plus className="h-5 w-5 mx-auto mb-1" />
                                                  <div className="text-sm font-medium">Assign Backup</div>
                                                </>
                                              )}
                                            </div>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="w-48">
                                          <DropdownMenuLabel className="text-xs">Assign Backup</DropdownMenuLabel>
                                          {deduplicateTeamMembers(teamMembers)
                                            .filter((employee) => {
                                              // Exclude manager/admin
                                              if (employee.role === 'MANAGER' || employee.role === 'ADMIN') return false;
                                              // Exclude current primary user to prevent same person being both
                                              if (day.primary && (day.primary as User).$id === employee.$id) return false;
                                              return true;
                                            })
                                            .map((employee) => (
                                            <DropdownMenuItem
                                              key={`backup-${employee.$id}`}
                                              onClick={() => handleMobileAssignment(employee.$id, 'backup', day.date)}
                                              className="text-xs"
                                              disabled={creatingShift === `${day.date}-backup`}
                                            >
                                              {employee.firstName} {employee.lastName}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : (
                                      <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 p-3 rounded-lg border-2 border-dashed">
                                        <div className="text-sm">No Backup Assigned</div>
                                      </div>
                                    )
                                  )}
                                </div>
                                
                                {/* Large screens and above - Show drag & drop */}
                                <div className="hidden lg:block">
                                  <DroppableSlot
                                    droppableId={`${day.date}-backup`}
                                    assignedUser={day.backup as User}
                                    slotType="backup"
                                    className="min-h-[50px] lg:min-h-[60px] border-2 border-dashed border-green-200 dark:border-green-800 rounded-lg"
                                    isCreating={creatingShift === `${day.date}-backup`}
                                  />
                                </div>
                              </>
                            )}
                          </div>

                          {/* Employees on Leave Indicator */}
                          {day.employeesOnLeave && day.employeesOnLeave.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-muted">
                              <Badge variant="secondary" className="text-xs">
                                {day.employeesOnLeave.length} on leave
                              </Badge>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
            </CardContent>
          </Card>
        </div>
      </DragDropContext>

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
    </>
  );
}
