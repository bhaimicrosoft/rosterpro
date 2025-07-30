'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Loader2 } from 'lucide-react';
import { User, AuthUser } from '@/types';
import { shiftService } from '@/lib/appwrite/shift-service';
import { userService } from '@/lib/appwrite/user-service';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

interface WeeklyScheduleDay {
  date: string;
  dayName: string;
  dayNumber: number;
  primary?: User | AuthUser;
  backup?: User | AuthUser;
}

interface WeeklyScheduleProps {
  user: AuthUser;
  className?: string;
}

export default function WeeklySchedule({ user, className }: WeeklyScheduleProps) {
  const [weekSchedule, setWeekSchedule] = useState<WeeklyScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStartDate, setWeekStartDate] = useState<Date>(new Date());

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
      console.log('WeeklySchedule: No user found, skipping fetch');
      return;
    }
    
    try {
      setLoading(true);
      console.log('WeeklySchedule: Starting fetch for user:', user.role, user.$id);
      
      // Get this week's date range
      const weekDates = getWeekDates();
      const startDate = weekDates[0].date;
      const endDate = weekDates[6].date;
      console.log('WeeklySchedule: Date range:', startDate, 'to', endDate);
      
      // Fetch shifts and users
      const [shiftsData, usersData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDate, endDate),
        user.role === 'MANAGER' || user.role === 'ADMIN' ? userService.getAllUsers() : [user as unknown as User]
      ]);
      
      console.log('WeeklySchedule: Fetched shifts:', shiftsData.length, 'users:', usersData.length);
      console.log('WeeklySchedule: Shifts data:', shiftsData);
      
      // Create user map for quick lookup - handle both User and AuthUser types
      const userMap = new Map();
      usersData.forEach((u: User | AuthUser) => {
        userMap.set(u.$id, u);
      });
      
      // Map shifts to week days
      const scheduleData = weekDates.map(day => {
        const dayShifts = shiftsData.filter(shift => 
          shift.date.split('T')[0] === day.date
        );
        
        console.log(`WeeklySchedule: Day ${day.date} has ${dayShifts.length} shifts:`, dayShifts);
        
        const primaryShift = dayShifts.find(s => s.onCallRole === 'PRIMARY');
        const backupShift = dayShifts.find(s => s.onCallRole === 'BACKUP');
        
        return {
          ...day,
          primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
          backup: backupShift ? userMap.get(backupShift.userId) : undefined,
        };
      });
      
      console.log('WeeklySchedule: Final schedule data:', scheduleData);
      setWeekSchedule(scheduleData);
    } catch (error) {
      console.error('WeeklySchedule: Error fetching weekly schedule:', error);
    } finally {
      setLoading(false);
    }
  }, [user, getWeekDates]);

  useEffect(() => {
    fetchWeeklyData();
  }, [fetchWeeklyData]);

  // Real-time subscription for shifts
  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time subscription for weekly schedule...');
    
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      ],
      (response: { events: string[]; payload?: unknown }) => {
        console.log('Weekly schedule real-time update received:', response);
        
        // Handle different types of events
        const events = response.events || [];
        const shouldRefresh = events.some((event: string) => 
          event.includes('documents.create') ||
          event.includes('documents.update') ||
          event.includes('documents.delete')
        );

        if (shouldRefresh) {
          console.log('Refreshing weekly schedule data due to real-time update...');
          
          // Add a small delay to ensure the database has been updated
          setTimeout(() => {
            fetchWeeklyData();
          }, 300);
        }
      }
    );

    return () => {
      console.log('Cleaning up weekly schedule real-time subscription...');
      unsubscribe();
    };
  }, [user, fetchWeeklyData]);

  const getUserInitials = (user: User | AuthUser) => {
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  };

  const getUserColor = (userId: string) => {
    // Generate consistent colors based on user ID
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'
    ];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

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
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5" />
          Week of {weekStartDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Mobile: Horizontal scrollable view */}
        <div className="md:hidden">
          <div className="flex overflow-x-auto pb-4 px-4 space-x-3 scrollbar-thin horizontal-scroll">
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
                  className={`flex-shrink-0 w-32 p-3 space-y-3 min-h-[140px] rounded-lg border ${backgroundClass}`}
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
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-xs px-1 py-0 h-4 w-full justify-center">
                      Primary
                    </Badge>
                    {day.primary ? (
                      <div className="flex flex-col items-center space-y-1">
                        <Avatar className={`h-7 w-7 text-xs ${getUserColor(day.primary.$id)}`}>
                          <AvatarFallback className="text-white text-xs">
                            {getUserInitials(day.primary)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-xs font-medium text-center leading-tight">
                          {day.primary.firstName.charAt(0).toUpperCase() + day.primary.firstName.slice(1).toLowerCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center">
                        Unassigned
                      </div>
                    )}
                  </div>

                  {/* Backup Assignment */}
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-xs px-1 py-0 h-4 w-full justify-center">
                      Backup
                    </Badge>
                    {day.backup ? (
                      <div className="flex flex-col items-center space-y-1">
                        <Avatar className={`h-7 w-7 text-xs ${getUserColor(day.backup.$id)}`}>
                          <AvatarFallback className="text-white text-xs">
                            {getUserInitials(day.backup)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-xs font-medium text-center leading-tight">
                          {day.backup.firstName.charAt(0).toUpperCase() + day.backup.firstName.slice(1).toLowerCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center">
                        Unassigned
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Desktop: Grid view */}
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
                  <div className="space-y-1">
                    <Badge variant="secondary" className="text-xs px-1 py-0 h-4">
                      Primary
                    </Badge>
                    {day.primary ? (
                      <div className="flex flex-col items-center space-y-1">
                        <Avatar className={`h-6 w-6 text-xs ${getUserColor(day.primary.$id)}`}>
                          <AvatarFallback className="text-white text-xs">
                            {getUserInitials(day.primary)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-xs font-medium text-center leading-tight">
                          {day.primary.firstName.charAt(0).toUpperCase() + day.primary.firstName.slice(1).toLowerCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center">
                        Unassigned
                      </div>
                    )}
                  </div>

                  {/* Backup Assignment */}
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                      Backup
                    </Badge>
                    {day.backup ? (
                      <div className="flex flex-col items-center space-y-1">
                        <Avatar className={`h-6 w-6 text-xs ${getUserColor(day.backup.$id)}`}>
                          <AvatarFallback className="text-white text-xs">
                            {getUserInitials(day.backup)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-xs font-medium text-center leading-tight">
                          {day.backup.firstName.charAt(0).toUpperCase() + day.backup.firstName.slice(1).toLowerCase()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground text-center">
                        Unassigned
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
