'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Grid3X3, CalendarDays, RefreshCw, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { shiftService, userService } from '@/lib/appwrite/database';
import { Shift, User } from '@/types';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  shifts: { primary?: User; backup?: User };
}

export default function SchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], []);

  const generateCalendar = useCallback(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Get first day of month and days in month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    // Get previous month's last days
    const prevMonth = new Date(year, month, 0);
    const daysInPrevMonth = prevMonth.getDate();
    
    const calendarDays: CalendarDay[] = [];
    
    // Add previous month's days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: false,
        shifts: {}
      });
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: true,
        shifts: {}
      });
    }
    
    // Add next month's days to complete the grid
    const remainingDays = 42 - calendarDays.length; // 6 rows * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: false,
        shifts: {}
      });
    }

    return calendarDays;
  }, [currentDate]);

  const generateWeekCalendar = useCallback(() => {
    const date = new Date(currentDate);
    // Get the Monday of current week (start of week)
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    
    const weekDays: CalendarDay[] = [];
    
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      
      weekDays.push({
        date: dayDate.toISOString().split('T')[0],
        day: dayDate.getDate(),
        isCurrentMonth: true, // For week view, treat all days as current
        shifts: {}
      });
    }
    
    return weekDays;
  }, [currentDate]);

  // Get the start of the current week for display
  const getWeekStartDate = useCallback(() => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    date.setDate(diff);
    return date;
  }, [currentDate]);

  const mapShiftsToCalendar = useCallback((calendarDays: CalendarDay[], shiftsData: Shift[]) => {
    const userMap = new Map(allUsers.map(u => [u.$id, u]));
    
    const result = calendarDays.map(day => {
      // Normalize shift dates to YYYY-MM-DD format for comparison
      const dayShifts = shiftsData.filter(shift => {
        const shiftDateOnly = shift.date.split('T')[0]; // Extract date part from datetime string
        return shiftDateOnly === day.date;
      });
      
      const primaryShift = dayShifts.find(s => s.onCallRole === 'PRIMARY');
      const backupShift = dayShifts.find(s => s.onCallRole === 'BACKUP');
      
      const shiftAssignments = {
        primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
        backup: backupShift ? userMap.get(backupShift.userId) : undefined,
      };

      return {
        ...day,
        shifts: shiftAssignments
      };
    });

    return result;
  }, [allUsers]);

  const fetchScheduleData = useCallback(async () => {
    if (!user) return;
    
    try {
      let startDateStr: string;
      let endDateStr: string;

      if (viewMode === 'week') {
        // For week view, get current week range
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(currentDate.getDate() - day);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        startDateStr = startOfWeek.toISOString().split('T')[0];
        endDateStr = endOfWeek.toISOString().split('T')[0];
      } else {
        // For month view, get extended date range
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const startDate = new Date(year, month - 1, 20);
        const endDate = new Date(year, month + 2, 10);
        
        startDateStr = startDate.toISOString().split('T')[0];
        endDateStr = endDate.toISOString().split('T')[0];
      }

      // Fetch data
      const [shiftsData, usersData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDateStr, endDateStr),
        userService.getAllUsers() // Always fetch all users so employees can see full team schedule
      ]);

      setShifts(shiftsData);
      setAllUsers(usersData as User[]);

    } catch (error) {
      console.error('Error fetching schedule data:', error);
    }
  }, [user, currentDate, viewMode]);

  // Filter users for assignment (exclude managers and admins)
  const assignableUsers = useMemo(() => {
    return allUsers.filter(u => u.role === 'EMPLOYEE');
  }, [allUsers]);

  // Separate useEffect for calendar regeneration when currentDate or viewMode changes
  useEffect(() => {
    if (viewMode === 'month') {
      const calendarDays = generateCalendar();
      const calendarWithShifts = mapShiftsToCalendar(calendarDays, shifts);
      setCalendar(calendarWithShifts);
    } else if (viewMode === 'week') {
      // Generate week calendar for week view
      const weekDays = generateWeekCalendar();
      const calendarWithShifts = mapShiftsToCalendar(weekDays, shifts);
      setCalendar(calendarWithShifts);
    }
  }, [currentDate, viewMode, generateCalendar, generateWeekCalendar, mapShiftsToCalendar, shifts, allUsers]);

  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  // Real-time subscription for shifts with instant updates
  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time subscription for schedule management...');
    
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {
        console.log('Schedule management real-time update received:', response);
        console.log('Schedule management: Processing response...');
        
        const events = response.events || [];
        const payload = response.payload;
        
        console.log('Schedule management: Events extracted:', events);
        console.log('Schedule management: Payload extracted:', payload);
        
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
        
        console.log('Event types detected:', { hasCreateEvent, hasUpdateEvent, hasDeleteEvent });
        
        if (hasCreateEvent || hasUpdateEvent || hasDeleteEvent) {
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : 'DELETE';
          console.log(`Processing ${eventType} event for instant schedule update...`, payload);
          
          try {
            if (hasCreateEvent || hasUpdateEvent) {
              // For CREATE/UPDATE: Get user info and update shifts directly
              const updatedUser = await userService.getUserById(payload.userId);
              
              setShifts(prevShifts => {
                const filteredShifts = prevShifts.filter(s => s.$id !== payload.$id);
                if (eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) {
                  const newShift: Shift = {
                    $id: payload.$id,
                    userId: payload.userId,
                    date: payload.date,
                    startTime: payload.startTime,
                    endTime: payload.endTime,
                    type: payload.type,
                    onCallRole: payload.onCallRole,
                    status: payload.status || 'SCHEDULED',
                    createdAt: payload.createdAt || new Date().toISOString(),
                    updatedAt: payload.updatedAt || new Date().toISOString(),
                    $createdAt: payload.$createdAt || new Date().toISOString(),
                    $updatedAt: payload.$updatedAt || new Date().toISOString()
                  };
                  console.log(`Instantly added/updated ${payload.onCallRole} shift for ${payload.date}:`, updatedUser.firstName);
                  return [...filteredShifts, newShift];
                }
                return filteredShifts;
              });
            } else if (hasDeleteEvent) {
              // For DELETE: Remove shift directly
              setShifts(prevShifts => {
                const filtered = prevShifts.filter(s => s.$id !== payload.$id);
                console.log(`Instantly removed shift for ${payload.date}`);
                return filtered;
              });
            }
            
            // Show toast notification
            const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
            toast({
              title: "Schedule Updated",
              description: `Assignment ${eventTypeText} instantly`,
              duration: 2000,
            });
            
          } catch (error) {
            console.error('Error in instant schedule update, falling back to refetch:', error);
            // Fallback to full refetch only if instant update fails
            setTimeout(async () => {
              await fetchScheduleData();
            }, 100);
          }
        }
      }
    );

    return () => {
      console.log('Cleaning up schedule management real-time subscription...');
      unsubscribe();
    };
  }, [user, toast, fetchScheduleData]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 7);
      } else {
        newDate.setDate(prev.getDate() + 7);
      }
      return newDate;
    });
  };

  const assignEmployee = async (date: string, role: 'primary' | 'backup', userId: string) => {
    const loadingKey = `${date}-${role}`;
    
    try {
      // Set loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      // Convert to uppercase for database
      const dbRole = role.toUpperCase() as 'PRIMARY' | 'BACKUP';
      
      // Check if shift already exists for this date and role (normalize date comparison)
      const existingShift = shifts.find(s => {
        const shiftDate = s.date.split('T')[0]; // Extract date part
        return shiftDate === date && s.onCallRole === dbRole;
      });
      
      if (existingShift) {
        // Update existing shift with new user
        await shiftService.updateShift(existingShift.$id, { userId });
        toast({
          title: "Assignment Updated",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment updated successfully.`,
        });
      } else {
        // Create new shift
        await shiftService.createShift({
          userId,
          date,
          onCallRole: dbRole,
          status: 'SCHEDULED'
        });
        toast({
          title: "Assignment Created",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment created successfully.`,
        });
      }

      // Refresh data
      await fetchScheduleData();
    } catch (error) {
      console.error('Error assigning employee:', error);
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error instanceof Error ? error.message : "Failed to assign employee. Please try again.",
      });
    } finally {
      // Clear loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const removeAssignment = async (date: string, role: 'primary' | 'backup') => {
    const loadingKey = `${date}-${role}-remove`;
    
    try {
      // Set loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      // Convert to uppercase for database lookup
      const dbRole = role.toUpperCase() as 'PRIMARY' | 'BACKUP';
      
      // Find shift to remove (normalize date comparison)
      const shiftToRemove = shifts.find(s => {
        const shiftDate = s.date.split('T')[0]; // Extract date part
        return shiftDate === date && s.onCallRole === dbRole;
      });
      
      if (shiftToRemove) {
        await shiftService.deleteShift(shiftToRemove.$id);
        toast({
          title: "Assignment Removed",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment removed successfully.`,
        });
        await fetchScheduleData();
      } else {
        toast({
          variant: "destructive",
          title: "No Assignment Found",
          description: `No ${role} assignment found for this date.`,
        });
      }
    } catch (error) {
      console.error('Error removing assignment:', error);
      toast({
        variant: "destructive",
        title: "Removal Failed",
        description: error instanceof Error ? error.message : "Failed to remove assignment. Please try again.",
      });
    } finally {
      // Clear loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchScheduleData();
      toast({
        variant: "success",
        title: "Data Refreshed",
        description: "Schedule data has been updated successfully.",
      });
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Failed to refresh data. Please try again.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <CalendarIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Please log in to view the schedule.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
              Schedule Management
            </h1>
            <p className="text-muted-foreground mt-1">
              {user.role === 'EMPLOYEE' ? 'View your scheduled shifts' : 'Manage team schedule and assignments'}
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshData}
              disabled={isRefreshing}
              className="h-8 px-3 text-xs"
            >
              {isRefreshing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Refresh
            </Button>
            
            {/* View Mode Toggle */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <Button
                variant={viewMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('week')}
                className="h-8 px-3 text-xs"
              >
                <Grid3X3 className="h-3 w-3 mr-1" />
                Week View
              </Button>
              <Button
                variant={viewMode === 'month' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('month')}
                className="h-8 px-3 text-xs"
              >
                <CalendarDays className="h-3 w-3 mr-1" />
                Month View
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar Card */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <span className="hidden sm:inline">{viewMode === 'week' ? 'Weekly Schedule' : 'Monthly Schedule'}</span>
                  <span className="sm:hidden">{viewMode === 'week' ? 'Week' : 'Month'}</span>
                </CardTitle>
                
                {/* View Mode Toggle - Mobile positioned */}
                <div className="flex md:hidden">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                    className="rounded-l-none"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Month/Year Display and Navigation */}
              <div className="flex items-center justify-between md:justify-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => viewMode === 'month' ? navigateMonth('prev') : navigateWeek('prev')} 
                  className="p-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <h2 className="text-lg md:text-xl font-semibold px-4 text-center min-w-[140px] md:min-w-[180px]">
                  {viewMode === 'month' ? (
                    <>
                      <span className="hidden sm:inline">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
                      <span className="sm:hidden">{monthNames[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Week of {getWeekStartDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="sm:hidden">Week {getWeekStartDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </>
                  )}
                </h2>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => viewMode === 'month' ? navigateMonth('next') : navigateWeek('next')} 
                  className="p-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* View Mode Toggle and Actions - Desktop */}
              <div className="hidden md:flex items-center gap-2">
                <div className="flex">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4 mr-2" />
                    Month
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                    className="rounded-l-none"
                  >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Week
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="p-0">
            {viewMode === 'month' ? (
              <>
                {/* Monthly Calendar Grid */}
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
                  {dayNames.map((day) => (
                    <div key={day} className="p-2 md:p-3 text-center font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                      <span className="hidden sm:inline">{day}</span>
                      <span className="sm:hidden">{day.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Calendar Days */}
                <div className="grid grid-cols-7">
                  {calendar.map((day, index) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0];
                    const isWeekend = index % 7 === 0 || index % 7 === 6; // Sunday (0) or Saturday (6)
                    
                    // Background classes based on day type
                    let backgroundClass = !day.isCurrentMonth ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900';
                    if (isToday && day.isCurrentMonth) {
                      backgroundClass = 'bg-gradient-to-b from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-600';
                    } else if (isWeekend && day.isCurrentMonth) {
                      backgroundClass = 'bg-gradient-to-b from-orange-50 to-amber-25 dark:from-orange-900/20 dark:to-amber-900/10';
                    }
                    
                    return (
                      <div
                        key={`${day.date}-${index}`}
                        className={`min-h-[80px] md:min-h-[120px] border-r border-b border-slate-200 dark:border-slate-700 last:border-r-0 p-1 md:p-2 ${backgroundClass}`}
                      >
                        {/* Day Number */}
                        <div className={`text-xs md:text-sm font-medium mb-1 md:mb-2 ${
                          !day.isCurrentMonth ? 'text-slate-400' : 
                          isToday ? 'text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-xs font-bold' :
                          isWeekend ? 'text-orange-600 dark:text-orange-400 font-semibold' :
                          'text-slate-900 dark:text-slate-100'
                        }`}>
                          {day.day}
                        </div>
                      
                      {/* Assignments */}
                      <div className="space-y-0.5 md:space-y-1">
                        {/* Primary Assignment */}
                        {day.shifts.primary ? (
                          <div className="text-xs bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 px-1 md:px-2 py-0.5 md:py-1 rounded flex items-center justify-between">
                            <span className="truncate">
                              <span className="hidden sm:inline">P: {day.shifts.primary.firstName?.toUpperCase()}</span>
                              <span className="sm:hidden">P</span>
                            </span>
                            {(user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-4 w-4 p-0 hover:bg-pink-200 dark:hover:bg-pink-800"
                                    disabled={loadingStates[`${day.date}-primary`] || loadingStates[`${day.date}-primary-remove`]}
                                  >
                                    {loadingStates[`${day.date}-primary`] || loadingStates[`${day.date}-primary-remove`] ? (
                                      <Loader2 className="h-2 w-2 animate-spin" />
                                    ) : (
                                      <Plus className="h-2 w-2" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel>Change Primary</DropdownMenuLabel>
                                  {assignableUsers.map((employee) => (
                                    <DropdownMenuItem
                                      key={`primary-${employee.$id}`}
                                      onClick={() => assignEmployee(day.date, 'primary', employee.$id)}
                                      className="text-sm"
                                      disabled={loadingStates[`${day.date}-primary`]}
                                    >
                                      {employee.firstName} {employee.lastName}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => removeAssignment(day.date, 'primary')}
                                    className="text-sm text-red-600"
                                    disabled={loadingStates[`${day.date}-primary-remove`]}
                                  >
                                    {loadingStates[`${day.date}-primary-remove`] ? (
                                      <>
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        Removing...
                                      </>
                                    ) : (
                                      'Remove Primary'
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        ) : (
                          (user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  className="w-full h-6 md:h-7 text-xs border-2 border-dashed border-pink-300 dark:border-pink-700 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950"
                                  disabled={loadingStates[`${day.date}-primary`]}
                                >
                                  {loadingStates[`${day.date}-primary`] ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3 mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {loadingStates[`${day.date}-primary`] ? 'Assigning...' : 'Primary'}
                                  </span>
                                  <span className="sm:hidden">P</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>Assign Primary</DropdownMenuLabel>
                                {assignableUsers.map((employee) => (
                                  <DropdownMenuItem
                                    key={`primary-${employee.$id}`}
                                    onClick={() => assignEmployee(day.date, 'primary', employee.$id)}
                                    className="text-sm"
                                    disabled={loadingStates[`${day.date}-primary`]}
                                  >
                                    {employee.firstName} {employee.lastName}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1 md:px-2 py-0.5 md:py-1 rounded border-2 border-dashed">
                              <span className="hidden sm:inline">No Primary</span>
                              <span className="sm:hidden">-</span>
                            </div>
                          )
                        )}
                        
                        {/* Backup Assignment */}
                        {day.shifts.backup ? (
                          <div className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-1 md:px-2 py-0.5 md:py-1 rounded flex items-center justify-between">
                            <span className="truncate">
                              <span className="hidden sm:inline">B: {day.shifts.backup.firstName?.toUpperCase()}</span>
                              <span className="sm:hidden">B</span>
                            </span>
                            {(user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-4 w-4 p-0 hover:bg-purple-200 dark:hover:bg-purple-800"
                                    disabled={loadingStates[`${day.date}-backup`] || loadingStates[`${day.date}-backup-remove`]}
                                  >
                                    {loadingStates[`${day.date}-backup`] || loadingStates[`${day.date}-backup-remove`] ? (
                                      <Loader2 className="h-2 w-2 animate-spin" />
                                    ) : (
                                      <Plus className="h-2 w-2" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel>Change Backup</DropdownMenuLabel>
                                  {assignableUsers.map((employee) => (
                                    <DropdownMenuItem
                                      key={`backup-${employee.$id}`}
                                      onClick={() => assignEmployee(day.date, 'backup', employee.$id)}
                                      className="text-sm"
                                      disabled={loadingStates[`${day.date}-backup`]}
                                    >
                                      {employee.firstName} {employee.lastName}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => removeAssignment(day.date, 'backup')}
                                    className="text-sm text-red-600"
                                    disabled={loadingStates[`${day.date}-backup-remove`]}
                                  >
                                    {loadingStates[`${day.date}-backup-remove`] ? (
                                      <>
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        Removing...
                                      </>
                                    ) : (
                                      'Remove Backup'
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        ) : (
                          (user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  className="w-full h-6 md:h-7 text-xs border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950"
                                  disabled={loadingStates[`${day.date}-backup`]}
                                >
                                  {loadingStates[`${day.date}-backup`] ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3 mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {loadingStates[`${day.date}-backup`] ? 'Assigning...' : 'Backup'}
                                  </span>
                                  <span className="sm:hidden">B</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>Assign Backup</DropdownMenuLabel>
                                {assignableUsers.map((employee) => (
                                  <DropdownMenuItem
                                    key={`backup-${employee.$id}`}
                                    onClick={() => assignEmployee(day.date, 'backup', employee.$id)}
                                    className="text-sm"
                                    disabled={loadingStates[`${day.date}-backup`]}
                                  >
                                    {employee.firstName} {employee.lastName}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1 md:px-2 py-0.5 md:py-1 rounded border-2 border-dashed">
                              <span className="hidden sm:inline">No Backup</span>
                              <span className="sm:hidden">-</span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Weekly View */
              <div className="p-2 md:p-4">
                {/* Week Header */}
                <div className="grid grid-cols-7 gap-1 md:gap-4 mb-4">
                  {dayNames.map((dayName, index) => {
                    const date = new Date(currentDate);
                    // Get the Monday of current week
                    const monday = new Date(date.setDate(date.getDate() - date.getDay() + 1));
                    const dayDate = new Date(monday);
                    dayDate.setDate(monday.getDate() + index);
                    
                    const isToday = dayDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
                    const isWeekend = index >= 5; // Saturday (5) and Sunday (6)
                    
                    return (
                      <div key={dayName} className="text-center">
                        <div className={`font-medium text-sm md:text-base ${
                          isToday ? 'text-blue-700 dark:text-blue-300 font-semibold' : 
                          isWeekend ? 'text-orange-600 dark:text-orange-400 font-semibold' : 
                          'text-slate-900 dark:text-slate-100'
                        }`}>
                          <span className="hidden sm:inline">{dayName}</span>
                          <span className="sm:hidden">{dayName.slice(0, 3)}</span>
                        </div>
                        <div className={`text-xs md:text-sm ${
                          isToday ? 'text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded-full font-semibold' : 
                          isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                          'text-slate-500 dark:text-slate-400'
                        }`}>
                          {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Week Grid */}
                <div className="grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-4">
                  {Array.from({ length: 7 }, (_, index) => {
                    const date = new Date(currentDate);
                    // Get the Monday of current week
                    const monday = new Date(date.setDate(date.getDate() - date.getDay() + 1));
                    const dayDate = new Date(monday);
                    dayDate.setDate(monday.getDate() + index);
                    const dateString = dayDate.toISOString().split('T')[0];
                    
                    // Check if it's today, weekend
                    const isToday = dateString === new Date().toISOString().split('T')[0];
                    const isWeekend = index >= 5; // Saturday (5) and Sunday (6)
                    
                    // Background classes based on day type
                    let backgroundClass = 'bg-slate-50 dark:bg-slate-800';
                    if (isToday) {
                      backgroundClass = 'bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-600';
                    } else if (isWeekend) {
                      backgroundClass = 'bg-gradient-to-br from-orange-50 to-amber-25 dark:from-orange-900/20 dark:to-amber-900/10';
                    }
                    
                    // Find shifts for this day from our calendar data
                    const dayFromCalendar = calendar.find(calDay => 
                      calDay.date === dateString
                    );
                    
                    return (
                      <div key={index} className={`${backgroundClass} rounded-lg p-3 md:p-4 min-h-[200px] md:min-h-[300px]`}>
                        {/* Mobile day header */}
                        <div className="md:hidden flex justify-between items-center mb-3 pb-2 border-b border-slate-200 dark:border-slate-700">
                          <div className={`font-medium ${
                            isToday ? 'text-blue-700 dark:text-blue-300 font-semibold' : 
                            isWeekend ? 'text-orange-600 dark:text-orange-400 font-semibold' : 
                            'text-slate-900 dark:text-slate-100'
                          }`}>
                            {dayNames[index]}
                          </div>
                          <div className={`text-sm ${
                            isToday ? 'text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-800 px-2 py-1 rounded-full font-semibold' : 
                            isWeekend ? 'text-orange-600 dark:text-orange-400' : 
                            'text-slate-500 dark:text-slate-400'
                          }`}>
                            {dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        </div>
                        
                        <div className={`hidden md:block font-medium mb-4 ${
                          isToday ? 'text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 rounded-full w-8 h-8 flex items-center justify-center font-bold' : 
                          isWeekend ? 'text-orange-600 dark:text-orange-400 font-semibold' : 
                          'text-slate-900 dark:text-slate-100'
                        }`}>
                          {dayDate.getDate()}
                        </div>
                        
                        <div className="space-y-3">
                          {/* Primary Assignment */}
                          {dayFromCalendar?.shifts.primary ? (
                            <div className="bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200 p-3 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm">Primary On-Call</div>
                                  <div className="text-sm">
                                    {dayFromCalendar.shifts.primary.firstName} {dayFromCalendar.shifts.primary.lastName}
                                  </div>
                                </div>
                                {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0 hover:bg-pink-200 dark:hover:bg-pink-800"
                                        disabled={loadingStates[`${dateString}-primary`] || loadingStates[`${dateString}-primary-remove`]}
                                      >
                                        {loadingStates[`${dateString}-primary`] || loadingStates[`${dateString}-primary-remove`] ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Plus className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48">
                                      <DropdownMenuLabel className="text-xs">Change Primary</DropdownMenuLabel>
                                      {assignableUsers.map((employee) => (
                                        <DropdownMenuItem
                                          key={`primary-${employee.$id}`}
                                          onClick={() => assignEmployee(dateString, 'primary', employee.$id)}
                                          className="text-xs"
                                          disabled={loadingStates[`${dateString}-primary`]}
                                        >
                                          {employee.firstName} {employee.lastName}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => removeAssignment(dateString, 'primary')}
                                        className="text-xs text-red-600"
                                        disabled={loadingStates[`${dateString}-primary-remove`]}
                                      >
                                        {loadingStates[`${dateString}-primary-remove`] ? (
                                          <>
                                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            Removing...
                                          </>
                                        ) : (
                                          'Remove Primary'
                                        )}
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
                                    className="w-full h-16 border-2 border-dashed border-pink-300 dark:border-pink-700 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950"
                                    disabled={loadingStates[`${dateString}-primary`]}
                                  >
                                    <div className="text-center">
                                      {loadingStates[`${dateString}-primary`] ? (
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
                                  {assignableUsers.map((employee) => (
                                    <DropdownMenuItem
                                      key={`primary-${employee.$id}`}
                                      onClick={() => assignEmployee(dateString, 'primary', employee.$id)}
                                      className="text-xs"
                                      disabled={loadingStates[`${dateString}-primary`]}
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
                          
                          {/* Backup Assignment */}
                          {dayFromCalendar?.shifts.backup ? (
                            <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 p-3 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-medium text-sm">Backup On-Call</div>
                                  <div className="text-sm">
                                    {dayFromCalendar.shifts.backup.firstName} {dayFromCalendar.shifts.backup.lastName}
                                  </div>
                                </div>
                                {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-8 w-8 p-0 hover:bg-purple-200 dark:hover:bg-purple-800"
                                        disabled={loadingStates[`${dateString}-backup`] || loadingStates[`${dateString}-backup-remove`]}
                                      >
                                        {loadingStates[`${dateString}-backup`] || loadingStates[`${dateString}-backup-remove`] ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Plus className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="center" className="w-48">
                                      <DropdownMenuLabel className="text-xs">Change Backup</DropdownMenuLabel>
                                      {assignableUsers.map((employee) => (
                                        <DropdownMenuItem
                                          key={`backup-${employee.$id}`}
                                          onClick={() => assignEmployee(dateString, 'backup', employee.$id)}
                                          className="text-xs"
                                          disabled={loadingStates[`${dateString}-backup`]}
                                        >
                                          {employee.firstName} {employee.lastName}
                                        </DropdownMenuItem>
                                      ))}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => removeAssignment(dateString, 'backup')}
                                        className="text-xs text-red-600"
                                        disabled={loadingStates[`${dateString}-backup-remove`]}
                                      >
                                        {loadingStates[`${dateString}-backup-remove`] ? (
                                          <>
                                            <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                            Removing...
                                          </>
                                        ) : (
                                          'Remove Backup'
                                        )}
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
                                    className="w-full h-16 border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950"
                                    disabled={loadingStates[`${dateString}-backup`]}
                                  >
                                    <div className="text-center">
                                      {loadingStates[`${dateString}-backup`] ? (
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
                                  {assignableUsers.map((employee) => (
                                    <DropdownMenuItem
                                      key={`backup-${employee.$id}`}
                                      onClick={() => assignEmployee(dateString, 'backup', employee.$id)}
                                      className="text-xs"
                                      disabled={loadingStates[`${dateString}-backup`]}
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
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
