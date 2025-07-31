'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CalendarX, Users, Clock } from 'lucide-react';
import { WeeklyLeaveData, LeaveType, User } from '@/types';
import { leaveService } from '@/lib/appwrite/database';

interface EmployeesOnLeaveProps {
  teamMembers: User[];
  isLoading?: boolean;
  className?: string;
}

const getLeaveTypeColor = (leaveType: LeaveType) => {
  switch (leaveType) {
    case 'PAID':
      return 'bg-gradient-to-r from-blue-100 to-blue-200 text-blue-900 border-l-blue-500 dark:from-blue-900/30 dark:to-blue-800/30 dark:text-blue-100';
    case 'SICK':
      return 'bg-gradient-to-r from-red-100 to-red-200 text-red-900 border-l-red-500 dark:from-red-900/30 dark:to-red-800/30 dark:text-red-100';
    case 'COMP_OFF':
      return 'bg-gradient-to-r from-green-100 to-green-200 text-green-900 border-l-green-500 dark:from-green-900/30 dark:to-green-800/30 dark:text-green-100';
    default:
      return 'bg-gradient-to-r from-gray-100 to-gray-200 text-gray-900 border-l-gray-500 dark:from-gray-900/30 dark:to-gray-800/30 dark:text-gray-100';
  }
};

const getLeaveTypeIcon = (leaveType: LeaveType) => {
  switch (leaveType) {
    case 'PAID':
      return '🏖️';
    case 'SICK':
      return '🤒';
    case 'COMP_OFF':
      return '⚖️';
    default:
      return '📅';
  }
};

const formatDisplayName = (firstName: string, lastName: string) => {
  return `${firstName} ${lastName}`;
};

const getInitials = (firstName: string, lastName: string) => {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
};

const getDateRange = () => {
  const today = new Date();
  const startOfWeek = new Date(today);
  
  // Calculate Monday as start of week (1 = Monday, 0 = Sunday)
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday (0), go back 6 days to Monday
  startOfWeek.setDate(today.getDate() - daysFromMonday);
  
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
};

export default function EmployeesOnLeave({ teamMembers, isLoading = false, className = '' }: EmployeesOnLeaveProps) {
  const [weeklyLeaveData, setWeeklyLeaveData] = useState<WeeklyLeaveData>({});
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  useEffect(() => {
    const fetchWeeklyLeaveData = async () => {
      if (!teamMembers || teamMembers.length === 0) return;
      
      setLoadingLeaves(true);
      try {
        const dates = getDateRange();
        const startDate = dates[0];
        const endDate = dates[dates.length - 1];
        
        // Get all approved leaves for this week
        const leaves = await leaveService.getApprovedLeavesByDateRange(startDate, endDate);
        
        // Build weekly leave data structure
        const weeklyData: WeeklyLeaveData = {};
        
        // Initialize all dates
        dates.forEach(date => {
          weeklyData[date] = [];
        });
        
        // Process each leave request
        leaves.forEach(leave => {
          const user = teamMembers.find(tm => tm.$id === leave.userId);
          if (!user) return;
          
          // Check each date in the leave range
          const leaveStart = new Date(leave.startDate);
          const leaveEnd = new Date(leave.endDate);
          
          dates.forEach(date => {
            const currentDate = new Date(date);
            if (currentDate >= leaveStart && currentDate <= leaveEnd) {
              weeklyData[date].push({
                $id: `${leave.$id}-${date}`,
                userId: user.$id,
                userName: formatDisplayName(user.firstName, user.lastName),
                date,
                leaveType: leave.type,
                leaveId: leave.$id,
                startDate: leave.startDate,
                endDate: leave.endDate
              });
            }
          });
        });
        
        setWeeklyLeaveData(weeklyData);
      } catch (error) {
        console.error('Error fetching weekly leave data:', error);
      } finally {
        setLoadingLeaves(false);
      }
    };

    fetchWeeklyLeaveData();
  }, [teamMembers]);

  // Calculate total employees on leave this week
  const totalEmployeesOnLeave = Object.values(weeklyLeaveData)
    .flat()
    .reduce((acc, curr) => {
      if (!acc.includes(curr.userId)) {
        acc.push(curr.userId);
      }
      return acc;
    }, [] as string[]).length;

  const isCurrentlyLoading = isLoading || loadingLeaves;

  return (
    <Card className={`border-0 shadow-lg overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 ${className}`}>
      <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarX className="h-5 w-5 text-emerald-600" />
          Employees on Leave This Week
        </CardTitle>
        <CardDescription>
          {isCurrentlyLoading 
            ? 'Loading leave data...' 
            : `${totalEmployeesOnLeave} employee${totalEmployeesOnLeave !== 1 ? 's' : ''} on leave this week`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isCurrentlyLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="flex-1 space-y-1">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : totalEmployeesOnLeave > 0 ? (
          <div className="space-y-4">
            {getDateRange().map(date => {
              const employeesOnLeave = weeklyLeaveData[date] || [];
              if (employeesOnLeave.length === 0) return null;
              
              return (
                <div key={date} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                    <Clock className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">
                      {formatDate(date)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {employeesOnLeave.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-2">
                    {employeesOnLeave.map((employee) => {
                      const user = teamMembers.find(tm => tm.$id === employee.userId);
                      if (!user) return null;
                      
                      return (
                        <div 
                          key={employee.$id}
                          className={`flex items-center space-x-3 p-4 rounded-lg border-l-4 transition-all duration-200 hover:shadow-md ${getLeaveTypeColor(employee.leaveType)}`}
                        >
                          <div className="relative">
                            <Avatar className="h-12 w-12 ring-2 ring-white shadow-md">
                              <AvatarFallback className="bg-white/80 text-gray-800 font-bold text-sm">
                                {getInitials(user.firstName, user.lastName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -top-1 -right-1 text-lg">
                              {getLeaveTypeIcon(employee.leaveType)}
                            </div>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">
                              {employee.userName}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge 
                                variant="secondary" 
                                className={`text-xs font-medium border ${
                                  employee.leaveType === 'PAID' 
                                    ? 'bg-blue-200 text-blue-900 border-blue-300 dark:bg-blue-800/50 dark:text-blue-100 dark:border-blue-600'
                                    : employee.leaveType === 'SICK' 
                                    ? 'bg-red-200 text-red-900 border-red-300 dark:bg-red-800/50 dark:text-red-100 dark:border-red-600'
                                    : 'bg-green-200 text-green-900 border-green-300 dark:bg-green-800/50 dark:text-green-100 dark:border-green-600'
                                }`}
                              >
                                {employee.leaveType.replace('_', ' ')}
                              </Badge>
                              {employee.startDate !== employee.endDate && (
                                <span className="text-xs font-medium opacity-75">
                                  Multi-day
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium">No employees on leave this week</p>
            <p className="text-xs text-gray-400 mt-1">All team members are available</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
