'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats, DashboardApprovalRequest, DashboardShift, Shift, User, LeaveRequest, SwapRequest } from '@/types';
import { shiftService } from '@/lib/appwrite/shift-service';
import { userService } from '@/lib/appwrite/user-service';
import { leaveService } from '@/lib/appwrite/leave-service';
import { swapService } from '@/lib/appwrite/swap-service';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { useToast } from '@/hooks/use-toast';

// Components
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Users,
  Calendar,
  Clock,
  FileText,
  RotateCcw,
  RefreshCw,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  CalendarDays,
  UserCheck,
} from 'lucide-react';
import WeeklySchedule from '@/components/dashboard/WeeklySchedule';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [hasCollectionError, setHasCollectionError] = useState(false);
  
  // Dashboard data state
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    todayShifts: 0,
    pendingLeaveRequests: 0,
    pendingSwapRequests: 0,
    upcomingShifts: 0,
  });
  const [pendingApprovals, setPendingApprovals] = useState<DashboardApprovalRequest[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<DashboardShift[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  const userId = user?.$id;
  const userRole = user?.role;
  
  const fetchDashboardData = useCallback(async () => {
    if (!userId || !userRole) {
      console.log('Dashboard: Missing userId or userRole, skipping fetch');
      return;
    }
    
    setIsLoading(true);
    try {
      console.log('Dashboard: Starting fetch for user:', userRole, userId);
      
      // Parallel data fetching for better performance
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Handle UPPERCASE roles from Appwrite
      const normalizedUserRole = userRole?.toUpperCase();
      const isManagerOrAdmin = normalizedUserRole === 'MANAGER' || normalizedUserRole === 'ADMIN';

      console.log('Dashboard: User role normalized:', normalizedUserRole, 'isManagerOrAdmin:', isManagerOrAdmin);

      const [
        allUsers,
        allManagersList,
        todayShifts,
        upcomingShifts,
        allLeaveRequests,
        allSwapRequests,
      ] = await Promise.all([
        isManagerOrAdmin ? userService.getAllUsers() : [],
        userService.getManagers(), // Always fetch managers for the dropdown
        shiftService.getShiftsByDateRange(today, today),
        shiftService.getShiftsByDateRange(today, nextWeek),
        isManagerOrAdmin ? leaveService.getAllLeaveRequests() : leaveService.getLeaveRequestsByUser(userId),
        isManagerOrAdmin ? swapService.getAllSwapRequests() : swapService.getSwapRequestsByUser(userId),
      ]);

      console.log('Dashboard: Fetched data counts:', {
        allUsers: allUsers.length,
        allManagersList: allManagersList.length,
        todayShifts: todayShifts.length,
        upcomingShifts: upcomingShifts.length,
        allLeaveRequests: allLeaveRequests.length,
        allSwapRequests: allSwapRequests.length,
      });

      // Filter data based on user role
      const filteredUsers = allUsers.filter((u: User) => u.role !== 'ADMIN');
      const filteredLeaveRequests = isManagerOrAdmin 
        ? allLeaveRequests 
        : allLeaveRequests.filter((lr: LeaveRequest) => lr.userId === userId);
      const filteredSwapRequests = isManagerOrAdmin 
        ? allSwapRequests 
        : allSwapRequests.filter((sr: SwapRequest) => sr.requesterUserId === userId);

      console.log('Dashboard: Filtered data counts:', {
        filteredUsers: filteredUsers.length,
        filteredLeaveRequests: filteredLeaveRequests.length,
        filteredSwapRequests: filteredSwapRequests.length,
      });

      // Build team members list with user names
      const userMap = new Map(allUsers.map((u: User) => [u.$id, u]));
      
      // Calculate dashboard stats
      const dashboardStats: DashboardStats = {
        totalEmployees: filteredUsers.length,
        todayShifts: todayShifts.length,
        pendingLeaveRequests: filteredLeaveRequests.filter((lr: LeaveRequest) => lr.status === 'PENDING').length,
        pendingSwapRequests: filteredSwapRequests.filter((sr: SwapRequest) => sr.status === 'PENDING').length,
        upcomingShifts: upcomingShifts.length,
      };

      console.log('Dashboard: Calculated stats:', dashboardStats);

      // Build pending approvals (only for managers/admins)
      const pendingApprovalsList: DashboardApprovalRequest[] = [];
      
      if (isManagerOrAdmin) {
        // Add pending leave requests
        filteredLeaveRequests
          .filter((lr: LeaveRequest) => lr.status === 'PENDING')
          .forEach((lr: LeaveRequest) => {
            const employee = userMap.get(lr.userId) as User;
            if (employee) {
              pendingApprovalsList.push({
                ...lr,
                _type: 'leave',
                _employeeName: `${employee.firstName} ${employee.lastName}`,
              });
            }
          });

        // Add pending swap requests
        filteredSwapRequests
          .filter((sr: SwapRequest) => sr.status === 'PENDING')
          .forEach((sr: SwapRequest) => {
            const requester = userMap.get(sr.requesterUserId) as User;
            if (requester) {
              pendingApprovalsList.push({
                ...sr,
                _type: 'swap',
                _employeeName: `${requester.firstName} ${requester.lastName}`,
              });
            }
          });
      } else {
        // For employees, add their own pending requests
        filteredLeaveRequests
          .filter((lr: LeaveRequest) => lr.status === 'PENDING')
          .forEach((lr: LeaveRequest) => {
            pendingApprovalsList.push({
              ...lr,
              _type: 'leave',
              _employeeName: `${user.firstName} ${user.lastName}`,
            });
          });

        filteredSwapRequests
          .filter((sr: SwapRequest) => sr.status === 'PENDING')
          .forEach((sr: SwapRequest) => {
            pendingApprovalsList.push({
              ...sr,
              _type: 'swap',
              _employeeName: `${user.firstName} ${user.lastName}`,
            });
          });
      }

      console.log('Dashboard: Pending approvals:', pendingApprovalsList.length);

      // Build today's schedule with employee names
      const todayScheduleWithNames: DashboardShift[] = todayShifts.map((shift: Shift) => {
        const employee = userMap.get(shift.userId) as User;
        return {
          ...shift,
          _employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee',
        };
      });

      console.log('Dashboard: Today schedule with names:', todayScheduleWithNames.length);

      // Set all the state
      setStats(dashboardStats);
      setPendingApprovals(pendingApprovalsList);
      setTodaySchedule(todayScheduleWithNames);
      setTeamMembers(filteredUsers);

      console.log('Dashboard: All data set successfully');
    } catch (error) {
      console.error('Dashboard: Error fetching dashboard data:', error);
      
      // Check if it's a collection not found error
      if (error && typeof error === 'object' && 'message' in error && 
          typeof error.message === 'string' && 
          (error.message.includes('Collection with the requested ID could not be found') ||
           error.message.includes('Database not found'))) {
        console.error('Database collections not found. Please set up the database first.');
        setHasCollectionError(true);
      }
      
      // Set default empty state on error
      setStats({
        totalEmployees: 0,
        todayShifts: 0,
        pendingLeaveRequests: 0,
        pendingSwapRequests: 0,
        upcomingShifts: 0,
      });
      setPendingApprovals([]);
      setTodaySchedule([]);
      setTeamMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userRole, user]);
  
  // Initial data fetch
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Real-time subscriptions for dashboard updates
  useEffect(() => {
    if (!user) return;

    console.log('Dashboard: Setting up real-time subscriptions...');
    console.log('Dashboard: DATABASE_ID:', DATABASE_ID);
    console.log('Dashboard: COLLECTIONS:', COLLECTIONS);
    
    const subscriptions = [
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.LEAVES}.documents`,
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`,
    ];
    
    console.log('Dashboard: Subscribing to:', subscriptions);
    
    const unsubscribe = client.subscribe(
      subscriptions,
      (response: { events: string[] }) => {
        console.log('Dashboard: Real-time update received:', response.events);
        console.log('Dashboard: Response:', response);
        
        // Re-fetch dashboard data when any relevant collection changes
        fetchDashboardData().catch(error => {
          console.error('Dashboard: Error re-fetching data after real-time update:', error);
        });
        
        // Show toast notification
        toast({
          title: "Dashboard Updated",
          description: "New data received",
          duration: 2000,
        });
      }
    );

    return () => {
      console.log('Dashboard: Cleaning up real-time subscriptions');
      unsubscribe();
    };
  }, [user, fetchDashboardData, toast]);

  // Refresh function for manual refresh
  const refreshDashboard = useCallback(async () => {
    try {
      console.log('Dashboard: Manual refresh triggered');
      setIsLoading(true);
      await fetchDashboardData();
      toast({
        title: "Dashboard Refreshed",
        description: "All data has been updated",
        duration: 2000,
      });
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh dashboard data. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchDashboardData, toast]);

  if (!user) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading user information...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const normalizedUserRole = userRole?.toUpperCase();
  const isManagerOrAdmin = normalizedUserRole === 'MANAGER' || normalizedUserRole === 'ADMIN';

  if (hasCollectionError) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Database Setup Required</h2>
          <p className="text-red-600">
            The database collections are not set up yet. Please contact your administrator to initialize the database.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back, {user.firstName} {user.lastName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={refreshDashboard}
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            
            {/* Quick Actions for Managers/Admins */}
            {isManagerOrAdmin && (
              <>
                <Button
                  onClick={() => window.location.href = '/dashboard/schedule/new'}
                  size="sm"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule Shift
                </Button>
                <Button
                  onClick={() => window.location.href = '/dashboard/team-management'}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Users className="h-4 w-4" />
                  Manage Team
                </Button>
              </>
            )}
            
            {/* Quick Actions for Employees */}
            {!isManagerOrAdmin && (
              <>
                <Button
                  onClick={() => window.location.href = '/dashboard/leave-requests/new'}
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <FileText className="h-4 w-4" />
                  Request Leave
                </Button>
                <Button
                  onClick={() => window.location.href = '/dashboard/swap-requests'}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Swap Shift
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {isManagerOrAdmin ? 'Total Employees' : 'My Shifts'}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalEmployees}</div>
              <p className="text-xs text-muted-foreground">
                {isManagerOrAdmin ? 'Active team members' : 'This week'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today&apos;s Shifts</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.todayShifts}</div>
              <p className="text-xs text-muted-foreground">Active today</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingLeaveRequests}</div>
              <p className="text-xs text-muted-foreground">
                {isManagerOrAdmin ? 'Awaiting approval' : 'Your pending requests'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Swaps</CardTitle>
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingSwapRequests}</div>
              <p className="text-xs text-muted-foreground">
                {isManagerOrAdmin ? 'Awaiting approval' : 'Your pending requests'}
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming Shifts</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.upcomingShifts}</div>
              <p className="text-xs text-muted-foreground">Next 7 days</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Access Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {isManagerOrAdmin ? (
            <>
              {/* Manager Quick Access */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Create Schedule</CardTitle>
                      <CardDescription className="text-xs">Assign shifts to team</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/schedule/new'}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    Schedule Shift
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Users className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Team Management</CardTitle>
                      <CardDescription className="text-xs">Manage team members</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/team-management'}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    Manage Team
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Approvals</CardTitle>
                      <CardDescription className="text-xs">Review requests</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/leave-requests'}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    size="sm"
                  >
                    View Requests
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <TrendingUp className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Analytics</CardTitle>
                      <CardDescription className="text-xs">View insights</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/schedule'}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                    size="sm"
                  >
                    View Reports
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              {/* Employee Quick Access */}
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-green-200 bg-green-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <FileText className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Request Leave</CardTitle>
                      <CardDescription className="text-xs">Apply for time off</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/leave-requests/new'}
                    className="w-full bg-green-600 hover:bg-green-700"
                    size="sm"
                  >
                    Request Leave
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <RotateCcw className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Swap Shifts</CardTitle>
                      <CardDescription className="text-xs">Exchange with teammate</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/swap-requests'}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    Request Swap
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-purple-200 bg-purple-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">My Schedule</CardTitle>
                      <CardDescription className="text-xs">View your shifts</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/schedule'}
                    className="w-full bg-purple-600 hover:bg-purple-700"
                    size="sm"
                  >
                    View Schedule
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-orange-200 bg-orange-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <Clock className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">My Requests</CardTitle>
                      <CardDescription className="text-xs">Track status</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => window.location.href = '/dashboard/leave-requests'}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                    size="sm"
                  >
                    View Status
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Weekly Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Weekly Schedule
            </CardTitle>
            <CardDescription>
              Current week&apos;s schedule overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklySchedule 
              user={user} 
              key={`weekly-schedule-${stats.todayShifts}-${stats.upcomingShifts}`}
            />
          </CardContent>
        </Card>

        {/* Two Column Layout for Additional Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Schedule */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Today&apos;s Schedule
              </CardTitle>
              <CardDescription>
                {todaySchedule.length} shift{todaySchedule.length !== 1 ? 's' : ''} scheduled for today
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : todaySchedule.length > 0 ? (
                <div className="space-y-4">
                  {todaySchedule.map((shift) => (
                    <div key={shift.$id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <Avatar>
                        <AvatarFallback>
                          {shift._employeeName?.split(' ').map((n: string) => n[0]).join('') || 'UN'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{shift._employeeName || 'Unknown Employee'}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : shift.onCallRole}
                        </div>
                      </div>
                      <Badge variant={shift.type === 'ON_CALL' ? 'destructive' : 'secondary'}>
                        {shift.type ? shift.type.replace('_', ' ') : shift.onCallRole}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No shifts scheduled for today</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                {isManagerOrAdmin ? 'Pending Approvals' : 'My Pending Requests'}
              </CardTitle>
              <CardDescription>
                {pendingApprovals.length} item{pendingApprovals.length !== 1 ? 's' : ''} requiring attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="space-y-1">
                          <div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse w-16"></div>
                        </div>
                      </div>
                      <div className="h-6 bg-gray-200 rounded animate-pulse w-16"></div>
                    </div>
                  ))}
                </div>
              ) : pendingApprovals.length > 0 ? (
                <div className="space-y-3">
                  {pendingApprovals.slice(0, 5).map((approval) => (
                    <div key={approval.$id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {approval._type === 'leave' ? (
                            <FileText className="h-4 w-4 text-blue-500" />
                          ) : (
                            <RotateCcw className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{approval._employeeName}</p>
                          <p className="text-xs text-muted-foreground">
                            {approval._type === 'leave' ? 'Leave Request' : 'Shift Swap'}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline">Pending</Badge>
                    </div>
                  ))}
                  {pendingApprovals.length > 5 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      +{pendingApprovals.length - 5} more pending items
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    {isManagerOrAdmin ? 'No pending approvals' : 'No pending requests'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Team Members (Manager/Admin only) */}
        {isManagerOrAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Team Members
              </CardTitle>
              <CardDescription>
                {teamMembers.length} active team member{teamMembers.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
                      <div className="flex-1 space-y-1">
                        <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : teamMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {teamMembers.slice(0, 6).map((member) => (
                    <div key={member.$id} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <Avatar>
                        <AvatarFallback>
                          {member.firstName[0]}{member.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{member.firstName} {member.lastName}</p>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant={member.role === 'MANAGER' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {member.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No team members found</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
