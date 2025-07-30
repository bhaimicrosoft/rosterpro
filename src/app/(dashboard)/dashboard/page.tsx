'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats, DashboardApprovalRequest, DashboardShift, Shift, User, LeaveRequest, SwapRequest, LeaveType, LeaveStatus, SwapStatus } from '@/types';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  Plus,
} from 'lucide-react';
import WeeklySchedule from '@/components/dashboard/WeeklySchedule';

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [hasCollectionError, setHasCollectionError] = useState(false);
  
  // Dialog states
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isSchedulingShift, setIsSchedulingShift] = useState(false);
  
  // Form state for schedule dialog
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    startTime: '07:30', // Fixed start time: 7:30 AM IST
    endTime: '15:30',   // Fixed end time: 3:30 PM IST
    employeeId: '',
    onCallRole: 'PRIMARY' as 'PRIMARY' | 'BACKUP',
    notes: '',
  });
  
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

  // Optimized handlers for different types of updates
  const handleShiftUpdate = useCallback(async (payload: Record<string, unknown>, eventType: string) => {
    const today = new Date().toISOString().split('T')[0];
    const shiftDate = typeof payload?.date === 'string' ? payload.date.split('T')[0] : '';
    
    try {
      if (eventType === 'CREATE' || eventType === 'UPDATE') {
        // Get user info for the shift
        const shiftUser = await userService.getUserById(payload.userId as string);
        
        // Update today's schedule if it's for today
        if (shiftDate === today) {
          setTodaySchedule(prev => {
            const filtered = prev.filter(s => s.$id !== payload.$id);
            if (eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) {
              const newShift: DashboardShift = {
                $id: payload.$id as string,
                userId: payload.userId as string,
                date: payload.date as string,
                onCallRole: payload.onCallRole as 'PRIMARY' | 'BACKUP',
                status: (payload.status as 'SCHEDULED' | 'COMPLETED' | 'SWAPPED') || 'SCHEDULED',
                _employeeName: `${shiftUser.firstName} ${shiftUser.lastName}`,
                startTime: '07:30',
                endTime: '15:30',
                type: payload.type as string,
                createdAt: payload.createdAt as string || new Date().toISOString(),
                updatedAt: payload.updatedAt as string || new Date().toISOString(),
                $createdAt: payload.$createdAt as string || new Date().toISOString(),
                $updatedAt: payload.$updatedAt as string || new Date().toISOString()
              };
              return [...filtered, newShift];
            }
            return filtered;
          });
        }
        
        // Update stats
        setStats(prev => ({
          ...prev,
          todayShifts: shiftDate === today ? prev.todayShifts + (eventType === 'CREATE' ? 1 : 0) : prev.todayShifts,
          upcomingShifts: prev.upcomingShifts + (eventType === 'CREATE' ? 1 : 0)
        }));
        
      } else if (eventType === 'DELETE') {
        // Remove from today's schedule
        if (shiftDate === today) {
          setTodaySchedule(prev => prev.filter(s => s.$id !== payload.$id));
        }
        
        // Update stats
        setStats(prev => ({
          ...prev,
          todayShifts: shiftDate === today ? Math.max(0, prev.todayShifts - 1) : prev.todayShifts,
          upcomingShifts: Math.max(0, prev.upcomingShifts - 1)
        }));
      }
    } catch (error) {
      console.error('Error in handleShiftUpdate, falling back to full refresh:', error);
      // Fallback to full refresh if individual update fails
      await fetchDashboardData();
    }
  }, [fetchDashboardData]);

  const handleLeaveUpdate = useCallback(async (payload: Record<string, unknown>, eventType: string) => {
    try {
      if (eventType === 'CREATE') {
        setStats(prev => ({
          ...prev,
          pendingLeaveRequests: prev.pendingLeaveRequests + 1
        }));
        
        // Add to pending approvals if user can approve
        if ((userRole === 'MANAGER' || userRole === 'ADMIN') && payload.status === 'PENDING') {
          const requestUser = await userService.getUserById(payload.userId as string);
          const newApproval: DashboardApprovalRequest = {
            $id: payload.$id as string,
            userId: payload.userId as string,
            startDate: payload.startDate as string,
            endDate: payload.endDate as string,
            type: payload.type as LeaveType,
            status: payload.status as LeaveStatus,
            reason: payload.reason as string,
            $createdAt: (payload.createdAt || payload.$createdAt) as string,
            $updatedAt: (payload.updatedAt || payload.$updatedAt) as string,
            _type: 'leave' as const,
            _employeeName: `${requestUser.firstName} ${requestUser.lastName}`
          };
          setPendingApprovals(prev => [...prev, newApproval]);
        }
      } else if (eventType === 'UPDATE') {
        // Update approval status
        if (payload.status !== 'PENDING') {
          setPendingApprovals(prev => prev.filter(a => a.$id !== payload.$id));
          setStats(prev => ({
            ...prev,
            pendingLeaveRequests: Math.max(0, prev.pendingLeaveRequests - 1)
          }));
        }
      } else if (eventType === 'DELETE') {
        setPendingApprovals(prev => prev.filter(a => a.$id !== payload.$id));
        setStats(prev => ({
          ...prev,
          pendingLeaveRequests: Math.max(0, prev.pendingLeaveRequests - 1)
        }));
      }
    } catch (error) {
      console.error('Error in handleLeaveUpdate, falling back to full refresh:', error);
      await fetchDashboardData();
    }
  }, [userRole, fetchDashboardData]);

  const handleSwapUpdate = useCallback(async (payload: Record<string, unknown>, eventType: string) => {
    try {
      if (eventType === 'CREATE') {
        setStats(prev => ({
          ...prev,
          pendingSwapRequests: prev.pendingSwapRequests + 1
        }));
        
        // Add to pending approvals if user can approve
        if ((userRole === 'MANAGER' || userRole === 'ADMIN') && payload.status === 'PENDING') {
          const requestUser = await userService.getUserById(payload.requesterUserId as string);
          const newApproval: DashboardApprovalRequest = {
            $id: payload.$id as string,
            requesterShiftId: payload.requesterShiftId as string,
            requesterUserId: payload.requesterUserId as string,
            targetShiftId: payload.targetShiftId as string,
            targetUserId: payload.targetUserId as string,
            reason: payload.reason as string,
            status: payload.status as SwapStatus,
            responseNotes: payload.responseNotes as string,
            requestedAt: payload.requestedAt as string,
            respondedAt: payload.respondedAt as string,
            $createdAt: (payload.createdAt || payload.$createdAt) as string,
            $updatedAt: (payload.updatedAt || payload.$updatedAt) as string,
            _type: 'swap' as const,
            _employeeName: `${requestUser.firstName} ${requestUser.lastName}`
          };
          setPendingApprovals(prev => [...prev, newApproval]);
        }
      } else if (eventType === 'UPDATE') {
        if (payload.status !== 'PENDING') {
          setPendingApprovals(prev => prev.filter(a => a.$id !== payload.$id));
          setStats(prev => ({
            ...prev,
            pendingSwapRequests: Math.max(0, prev.pendingSwapRequests - 1)
          }));
        }
      } else if (eventType === 'DELETE') {
        setPendingApprovals(prev => prev.filter(a => a.$id !== payload.$id));
        setStats(prev => ({
          ...prev,
          pendingSwapRequests: Math.max(0, prev.pendingSwapRequests - 1)
        }));
      }
    } catch (error) {
      console.error('Error in handleSwapUpdate, falling back to full refresh:', error);
      await fetchDashboardData();
    }
  }, [userRole, fetchDashboardData]);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: Record<string, any>) => {
        console.log('Dashboard: Real-time update received:', response);
        
        const events = response.events || [];
        const payload = response.payload;
        
        // Check for specific event types
        const hasCreateEvent = events.some((event: string) => event.includes('.create'));
        const hasUpdateEvent = events.some((event: string) => event.includes('.update'));
        const hasDeleteEvent = events.some((event: string) => event.includes('.delete'));
        
        console.log('Dashboard event types detected:', { hasCreateEvent, hasUpdateEvent, hasDeleteEvent });
        
        if (hasCreateEvent || hasUpdateEvent || hasDeleteEvent) {
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : 'DELETE';
          console.log('Dashboard: Processing real-time event', {
            eventType,
            payload: payload,
            events: events
          });
          
          // Handle different collection updates with targeted state updates
          if (events.some((e: string) => e.includes('shifts'))) {
            await handleShiftUpdate(payload, eventType);
          } else if (events.some((e: string) => e.includes('leaves'))) {
            await handleLeaveUpdate(payload, eventType);
          } else if (events.some((e: string) => e.includes('swap'))) {
            await handleSwapUpdate(payload, eventType);
          }
          
          // Show toast notification with more specific message
          const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
          const collection = events[0]?.includes('shifts') ? 'Shift' : 
                           events[0]?.includes('leaves') ? 'Leave request' : 
                           events[0]?.includes('swap') ? 'Swap request' : 'Data';
          
          toast({
            title: "Dashboard Updated",
            description: `${collection} ${eventTypeText}`,
            duration: 2000,
          });
        }
      }
    );

    return () => {
      console.log('Dashboard: Cleaning up real-time subscriptions');
      unsubscribe();
    };
  }, [user, toast, handleShiftUpdate, handleLeaveUpdate, handleSwapUpdate]);

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

  // Handle schedule shift form submission
  const handleScheduleShift = useCallback(async () => {
    if (!scheduleForm.date || !scheduleForm.employeeId) {
      toast({
        title: "Validation Error",
        description: "Date and employee selection are required",
        variant: "destructive",
      });
      return;
    }

    setIsSchedulingShift(true);
    try {
      await shiftService.createShift({
        userId: scheduleForm.employeeId,
        date: scheduleForm.date,
        onCallRole: scheduleForm.onCallRole,
        status: 'SCHEDULED',
        $createdAt: new Date().toISOString(),
        $updatedAt: new Date().toISOString(),
      });

      toast({
        title: "Shift Scheduled",
        description: "The shift has been successfully created",
      });

      // Reset form and close dialog
      setScheduleForm({
        date: '',
        startTime: '07:30', // Fixed start time: 7:30 AM IST
        endTime: '15:30',   // Fixed end time: 3:30 PM IST
        employeeId: '',
        onCallRole: 'PRIMARY',
        notes: '',
      });
      setIsScheduleDialogOpen(false);

      // Refresh data
      await fetchDashboardData();
    } catch (error) {
      console.error('Error creating shift:', error);
      toast({
        title: "Error",
        description: "Failed to create shift. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSchedulingShift(false);
    }
  }, [scheduleForm, toast, fetchDashboardData]);

  // Helper function to convert Tailwind bg classes to hex colors
  const getHexColor = useCallback((bgClass: string): string => {
    const colorMap: Record<string, string> = {
      'bg-blue-600': '#2563eb',
      'bg-emerald-600': '#059669', 
      'bg-purple-600': '#9333ea',
      'bg-orange-600': '#ea580c',
      'bg-rose-600': '#e11d48',
      'bg-indigo-600': '#4f46e5',
      'bg-teal-600': '#0d9488',
      'bg-violet-600': '#7c3aed',
      'bg-blue-500': '#3b82f6',
      'bg-emerald-500': '#10b981',
      'bg-purple-500': '#a855f7',
      'bg-orange-500': '#f97316',
      'bg-rose-500': '#f43f5e',
      'bg-indigo-500': '#6366f1',
      'bg-teal-500': '#14b8a6',
      'bg-violet-500': '#8b5cf6',
    };
    return colorMap[bgClass] || '#3b82f6'; // Default to blue
  }, []);

  // Helper function to get consistent user colors
  const getUserColor = useCallback((userId: string, role?: 'PRIMARY' | 'BACKUP' | 'MANAGER' | 'EMPLOYEE') => {
    // Professional color palettes
    const primaryColors = [
      { bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-200', light: 'bg-blue-50' },
      { bg: 'bg-emerald-600', text: 'text-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50' },
      { bg: 'bg-purple-600', text: 'text-purple-600', border: 'border-purple-200', light: 'bg-purple-50' },
      { bg: 'bg-orange-600', text: 'text-orange-600', border: 'border-orange-200', light: 'bg-orange-50' },
      { bg: 'bg-rose-600', text: 'text-rose-600', border: 'border-rose-200', light: 'bg-rose-50' },
      { bg: 'bg-indigo-600', text: 'text-indigo-600', border: 'border-indigo-200', light: 'bg-indigo-50' },
      { bg: 'bg-teal-600', text: 'text-teal-600', border: 'border-teal-200', light: 'bg-teal-50' },
      { bg: 'bg-violet-600', text: 'text-violet-600', border: 'border-violet-200', light: 'bg-violet-50' },
    ];

    const backupColors = [
      { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-300', light: 'bg-blue-100' },
      { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-300', light: 'bg-emerald-100' },
      { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-300', light: 'bg-purple-100' },
      { bg: 'bg-orange-500', text: 'text-orange-500', border: 'border-orange-300', light: 'bg-orange-100' },
      { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-300', light: 'bg-rose-100' },
      { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-300', light: 'bg-indigo-100' },
      { bg: 'bg-teal-500', text: 'text-teal-500', border: 'border-teal-300', light: 'bg-teal-100' },
      { bg: 'bg-violet-500', text: 'text-violet-500', border: 'border-violet-300', light: 'bg-violet-100' },
    ];

    // Use different palettes based on role
    let colors = primaryColors;
    if (role === 'BACKUP') colors = backupColors;
    if (role === 'EMPLOYEE') colors = backupColors;

    // Generate consistent hash
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    return colors[Math.abs(hash) % colors.length];
  }, []);

  // Get role badge colors
  const getRoleBadgeColor = useCallback((role: 'PRIMARY' | 'BACKUP') => {
    return role === 'PRIMARY' 
      ? { variant: 'default' as const, className: 'bg-blue-600 hover:bg-blue-700 text-white' }
      : { variant: 'secondary' as const, className: 'bg-green-100 text-green-800 border-green-300' };
  }, []);

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
                  onClick={() => setIsScheduleDialogOpen(true)}
                  size="sm"
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Calendar className="h-4 w-4" />
                  Schedule Shift
                </Button>
                <Button
                  onClick={() => window.location.href = '/team'}
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
                  onClick={() => window.location.href = '/leaves'}
                  size="sm"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <FileText className="h-4 w-4" />
                  Request Leave
                </Button>
                <Button
                  onClick={() => window.location.href = '/swaps'}
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
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">
                {isManagerOrAdmin ? 'Total Employees' : 'My Shifts'}
              </CardTitle>
              <div className="p-2 bg-blue-200 rounded-lg">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{stats.totalEmployees}</div>
              <p className="text-xs text-blue-600">
                {isManagerOrAdmin ? 'Active team members' : 'This week'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Today&apos;s Shifts</CardTitle>
              <div className="p-2 bg-green-200 rounded-lg">
                <Calendar className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">{stats.todayShifts}</div>
              <p className="text-xs text-green-600">Active today</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">Pending Leaves</CardTitle>
              <div className="p-2 bg-orange-200 rounded-lg">
                <FileText className="h-4 w-4 text-orange-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900">{stats.pendingLeaveRequests}</div>
              <p className="text-xs text-orange-600">
                {isManagerOrAdmin ? 'Awaiting approval' : 'Your pending requests'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Pending Swaps</CardTitle>
              <div className="p-2 bg-purple-200 rounded-lg">
                <RotateCcw className="h-4 w-4 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">{stats.pendingSwapRequests}</div>
              <p className="text-xs text-purple-600">
                {isManagerOrAdmin ? 'Awaiting approval' : 'Your pending requests'}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 border-indigo-200 hover:shadow-md transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-indigo-800">Upcoming Shifts</CardTitle>
              <div className="p-2 bg-indigo-200 rounded-lg">
                <TrendingUp className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-900">{stats.upcomingShifts}</div>
              <p className="text-xs text-indigo-600">Next 7 days</p>
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
                    onClick={() => setIsScheduleDialogOpen(true)}
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
                    onClick={() => window.location.href = '/team'}
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
                    onClick={() => window.location.href = '/leaves'}
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
                    onClick={() => window.location.href = '/schedule'}
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
                    onClick={() => window.location.href = '/leaves'}
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
                    onClick={() => window.location.href = '/swaps'}
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
                    onClick={() => window.location.href = '/schedule'}
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
                    onClick={() => window.location.href = '/leaves'}
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
                  {todaySchedule.map((shift) => {
                    const userColors = getUserColor(shift.userId, shift.onCallRole);
                    const roleColors = getRoleBadgeColor(shift.onCallRole);
                    
                    return (
                      <div 
                        key={shift.$id} 
                        className={`flex items-center space-x-4 p-4 rounded-lg border ${userColors.border} ${userColors.light} hover:shadow-md transition-all duration-200`}
                      >
                        <Avatar className="h-12 w-12 ring-2 ring-white shadow-md" style={{ backgroundColor: getHexColor(userColors.bg) }}>
                          <AvatarFallback className="text-white font-semibold bg-transparent">
                            {shift._employeeName?.split(' ').map((n: string) => n[0]).join('') || 'UN'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className={`font-semibold text-lg ${userColors.text}`}>
                            {shift._employeeName || 'Unknown Employee'}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {shift.startTime && shift.endTime ? `${shift.startTime} - ${shift.endTime}` : 'All Day'}
                              </span>
                            </div>
                            {shift.type && (
                              <div className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                <span>{shift.type.replace('_', ' ')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge 
                            variant={roleColors.variant}
                            className={`${roleColors.className} font-medium px-3 py-1`}
                          >
                            {shift.onCallRole}
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${userColors.text} ${userColors.border}`}
                          >
                            {shift.status.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
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
                  {teamMembers.slice(0, 6).map((member) => {
                    const userColors = getUserColor(member.$id, member.role as 'MANAGER' | 'EMPLOYEE');
                    
                    return (
                      <div 
                        key={member.$id} 
                        className={`flex items-center space-x-4 p-4 rounded-lg border ${userColors.border} ${userColors.light} hover:shadow-md transition-all duration-200 cursor-pointer`}
                      >
                        <Avatar className="h-12 w-12 ring-2 ring-white shadow-md" style={{ backgroundColor: getHexColor(userColors.bg) }}>
                          <AvatarFallback className="text-white font-semibold text-sm bg-transparent">
                            {member.firstName[0]}{member.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${userColors.text} truncate`}>
                            {member.firstName} {member.lastName}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge 
                              variant={member.role === 'MANAGER' ? 'default' : 'secondary'}
                              className={`text-xs ${
                                member.role === 'MANAGER' 
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' 
                                  : `${userColors.text} ${userColors.border} bg-white`
                              }`}
                            >
                              {member.role}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <div className={`w-2 h-2 rounded-full ${userColors.bg}`}></div>
                              <span className="truncate">
                                {member.email ? member.email.split('@')[0] : member.username}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {teamMembers.length > 6 && (
                    <div 
                      className="flex items-center justify-center p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => window.location.href = '/team'}
                    >
                      <div className="text-center">
                        <Users className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-sm font-medium text-gray-600">
                          +{teamMembers.length - 6} more members
                        </p>
                        <p className="text-xs text-gray-500">Click to view all</p>
                      </div>
                    </div>
                  )}
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

      {/* Schedule Shift Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Schedule New Shift</DialogTitle>
            <DialogDescription>
              Create a new shift assignment for a team member. Shifts are scheduled from 7:30 AM to 3:30 PM IST.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="date" className="text-right">
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                className="col-span-3"
                value={scheduleForm.date}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employee" className="text-right">
                Employee *
              </Label>
              <Select
                value={scheduleForm.employeeId}
                onValueChange={(value) => setScheduleForm(prev => ({ ...prev, employeeId: value }))}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.$id} value={member.$id}>
                      {member.firstName} {member.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">
                Role
              </Label>
              <Select
                value={scheduleForm.onCallRole}
                onValueChange={(value: 'PRIMARY' | 'BACKUP') => 
                  setScheduleForm(prev => ({ ...prev, onCallRole: value }))
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRIMARY">Primary</SelectItem>
                  <SelectItem value="BACKUP">Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Textarea
                id="notes"
                className="col-span-3"
                placeholder="Additional notes (optional)"
                value={scheduleForm.notes}
                onChange={(e) => setScheduleForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsScheduleDialogOpen(false)}
              disabled={isSchedulingShift}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleScheduleShift}
              disabled={isSchedulingShift || !scheduleForm.date || !scheduleForm.employeeId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSchedulingShift ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Shift
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
