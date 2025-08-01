'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardStats, DashboardApprovalRequest, DashboardShift, Shift, User, LeaveRequest, SwapRequest, LeaveType, LeaveStatus, SwapStatus } from '@/types';
import { shiftService, userService, leaveService, swapService } from '@/lib/appwrite/database';
import { notificationService } from '@/lib/appwrite/notification-service';
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
  Edit2,
  Trash2,
  UserPlus,
} from 'lucide-react';
import WeeklySchedule from '@/components/dashboard/WeeklySchedule';
import EmployeesOnLeave from '@/components/dashboard/EmployeesOnLeave';

// Utility function to ensure unique team members and prevent duplicate React keys
const deduplicateTeamMembers = (members: User[]): User[] => {
  const seen = new Set<string>();
  return members.filter(member => {
    // Filter out invalid members
    if (!member || !member.$id || typeof member.$id !== 'string') {
      return false;
    }

    if (seen.has(member.$id)) {
      return false;
    }
    seen.add(member.$id);
    return true;
  });
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [hasCollectionError, setHasCollectionError] = useState(false);

  // Dialog states
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isSchedulingShift, setIsSchedulingShift] = useState(false);
  const [isTeamMemberDialogOpen, setIsTeamMemberDialogOpen] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  // Form state for schedule dialog
  const [scheduleForm, setScheduleForm] = useState({
    date: '',
    startTime: '07:30', // Fixed start time: 7:30 AM IST
    endTime: '15:30',   // Fixed end time: 3:30 PM IST
    employeeId: '',
    onCallRole: 'PRIMARY' as 'PRIMARY' | 'BACKUP',
    notes: '',
  });

  // Form state for team member dialog
  const [memberForm, setMemberForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'MANAGER',
    managerId: '', // Add manager selection
    paidLeaves: 20,
    sickLeaves: 12,
    compOffs: 0,
  });

  // Dashboard data state
  const [stats, setStats] = useState<DashboardStats>({
    totalEmployees: 0,
    pendingLeaveRequests: 0,
    pendingSwapRequests: 0,
    completedShifts: 0,
    upcomingShifts: 0,
  });
  const [pendingApprovals, setPendingApprovals] = useState<DashboardApprovalRequest[]>([]);
  const [todaySchedule, setTodaySchedule] = useState<DashboardShift[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // Add state for all users

  // Approval dialog state
  const [selectedApproval, setSelectedApproval] = useState<DashboardApprovalRequest | null>(null);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [approvalComment, setApprovalComment] = useState('');
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);

  const userId = user?.$id;
  const userRole = user?.role;

  // Calculate manager/admin status early to avoid initialization errors
  const normalizedUserRole = userRole?.toUpperCase();
  const isManagerOrAdmin = normalizedUserRole === 'MANAGER' || normalizedUserRole === 'ADMIN';

  // Helper function to format dates
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Helper function to get current week range (Monday to Sunday)
  const getCurrentWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday=0, so subtract 6; otherwise subtract (dayOfWeek-1)

    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToSubtract);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
      start: monday.toISOString(),
      end: sunday.toISOString(),
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0]
    };
  };

  const fetchDashboardData = useCallback(async () => {
    if (!userId || !userRole) {
      return;
    }

    setIsLoading(true);
    try {

      // Parallel data fetching for better performance
      const today = new Date().toISOString().split('T')[0];
      const currentWeek = getCurrentWeekRange();

      // Create proper date ranges for querying (add time components)
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;

      // For completed shifts, we need to get all shifts from the beginning until today
      const completedShiftsStart = '2020-01-01T00:00:00.000Z'; // Start from a reasonable past date
      const completedShiftsEnd = todayEnd; // Until end of today

      // Handle UPPERCASE roles from Appwrite
      // Use the component-level isManagerOrAdmin variable

      const [
        allUsers,
        todayShifts,
        currentWeekShifts,
        completedShiftsData,
        allLeaveRequests,
        allSwapRequests,
      ] = await Promise.all([
        userService.getAllUsers(), // Always get all users for proper User type
        shiftService.getShiftsByDateRange(todayStart, todayEnd), // Use proper date range for today
        shiftService.getShiftsByDateRange(currentWeek.start, currentWeek.end), // Current week shifts (Monday to Sunday)
        shiftService.getShiftsByDateRange(completedShiftsStart, completedShiftsEnd), // All shifts until today for completed count
        isManagerOrAdmin ? leaveService.getAllLeaveRequests() : leaveService.getLeaveRequestsByUser(userId),
        isManagerOrAdmin ? swapService.getAllSwapRequests() : swapService.getSwapRequestsByUser(userId),
      ]);

      // Filter data based on user role (use allUsers for filtering)
      const displayUsers = allUsers;

      // Filter and process data
      const employeesOnly = displayUsers.filter((u: User) => u.role === 'EMPLOYEE');
      const filteredLeaveRequests = isManagerOrAdmin
        ? allLeaveRequests
        : allLeaveRequests.filter((lr: LeaveRequest) => lr.userId === userId);
      const filteredSwapRequests = isManagerOrAdmin
        ? allSwapRequests
        : allSwapRequests.filter((sr: SwapRequest) => sr.targetUserId === userId && sr.requesterUserId !== userId); // Only incoming requests for employees

      // Build team members list with user names
      const userMap = new Map(displayUsers.map((u: User) => [u.$id, u]));

      // Calculate completed shifts count (only shifts with dates in the past and status COMPLETED)
      const todayDate = new Date().toISOString().split('T')[0];
      const completedShiftsCount = completedShiftsData.filter((shift: Shift) => {
        const shiftDate = shift.date.split('T')[0];
        return shiftDate < todayDate && shift.status === 'COMPLETED';
      }).length;

      // Calculate dashboard stats - fix employee count to only include employees
      const dashboardStats: DashboardStats = {
        totalEmployees: isManagerOrAdmin ? employeesOnly.length : currentWeekShifts.filter((s: Shift) => s.userId === userId).length, // For employees, show their current week shifts count
        pendingLeaveRequests: filteredLeaveRequests.filter((lr: LeaveRequest) => lr.status === 'PENDING').length,
        pendingSwapRequests: isManagerOrAdmin ? 0 : filteredSwapRequests.filter((sr: SwapRequest) => sr.status === 'PENDING').length, // Only show swap requests for employees
        completedShifts: completedShiftsCount, // Total completed shifts until today
        upcomingShifts: isManagerOrAdmin ? currentWeekShifts.length : currentWeekShifts.filter((s: Shift) => s.userId === userId).length, // For employees, show only their current week shifts
      };

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

        // Note: Managers/Admins should NOT see swap requests in pending approvals
        // Swap requests are handled directly between employees, not requiring manager approval
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
            const requester = userMap.get(sr.requesterUserId) as User;
            if (requester) {
              pendingApprovalsList.push({
                ...sr,
                _type: 'swap',
                _employeeName: `${requester.firstName} ${requester.lastName}`,
              });
            }
          });
      }

      // Build today's schedule with employee names

      const todayScheduleWithNames: DashboardShift[] = todayShifts.map((shift: Shift) => {
        const employee = userMap.get(shift.userId) as User;
        return {
          ...shift,
          _employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee',
        };
      });

      // Set all the state
      setStats(dashboardStats);
      setPendingApprovals(pendingApprovalsList);
      setTodaySchedule(todayScheduleWithNames);
      setTeamMembers(deduplicateTeamMembers(employeesOnly)); // Use only employees for drag-and-drop (no managers/admins for on-call)
      setAllUsers(displayUsers); // Store all users for manager dropdown

    } catch (error) {

      // Check if it's a collection not found error
      if (error && typeof error === 'object' && 'message' in error &&
        typeof error.message === 'string' &&
        (error.message.includes('Collection with the requested ID could not be found') ||
          error.message.includes('Database not found'))) {

        setHasCollectionError(true);
      }

      // Set default empty state on error
      setStats({
        totalEmployees: 0,
        pendingLeaveRequests: 0,
        pendingSwapRequests: 0,
        completedShifts: 0,
        upcomingShifts: 0,
      });
      setPendingApprovals([]);
      setTodaySchedule([]);
      setTeamMembers([]);
      setAllUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [userId, userRole, user, isManagerOrAdmin]);

  // Silent refresh without loading spinner (for real-time fallback)
  const silentRefreshDashboard = useCallback(async () => {
    if (!userId || !userRole) return;

    try {

      // Parallel data fetching for better performance
      const today = new Date().toISOString().split('T')[0];
      const currentWeek = getCurrentWeekRange();

      // Create proper date ranges for querying (add time components)
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;

      // For completed shifts, we need to get all shifts from the beginning until today
      const completedShiftsStart = '2020-01-01T00:00:00.000Z'; // Start from a reasonable past date
      const completedShiftsEnd = todayEnd; // Until end of today

      // Handle UPPERCASE roles from Appwrite
      // Use the component-level isManagerOrAdmin variable

      const [
        allUsers,
        todayShifts,
        currentWeekShifts,
        completedShiftsData,
        allLeaveRequests,
        allSwapRequests,
      ] = await Promise.all([
        userService.getAllUsers(), // Always get all users for proper User type
        shiftService.getShiftsByDateRange(todayStart, todayEnd), // Use proper date range for today
        shiftService.getShiftsByDateRange(currentWeek.start, currentWeek.end), // Current week shifts (Monday to Sunday)
        shiftService.getShiftsByDateRange(completedShiftsStart, completedShiftsEnd), // All shifts until today for completed count
        isManagerOrAdmin ? leaveService.getAllLeaveRequests() : leaveService.getLeaveRequestsByUser(userId),
        isManagerOrAdmin ? swapService.getAllSwapRequests() : swapService.getSwapRequestsByUser(userId),
      ]);

      // Filter data based on user role (use allUsers for filtering)
      const displayUsers = allUsers;

      // Filter and process data
      const employeesOnly = displayUsers.filter((u: User) => u.role === 'EMPLOYEE');
      const filteredLeaveRequests = isManagerOrAdmin
        ? allLeaveRequests
        : allLeaveRequests.filter((lr: LeaveRequest) => lr.userId === userId);
      const filteredSwapRequests = isManagerOrAdmin
        ? allSwapRequests
        : allSwapRequests.filter((sr: SwapRequest) => sr.targetUserId === userId && sr.requesterUserId !== userId); // Only incoming requests for employees

      // Build team members list with user names
      const userMap = new Map(displayUsers.map((u: User) => [u.$id, u]));

      // Calculate completed shifts count (only shifts with dates in the past and status COMPLETED)
      const todayDate = new Date().toISOString().split('T')[0];
      const completedShiftsCount = completedShiftsData.filter((shift: Shift) => {
        const shiftDate = shift.date.split('T')[0];
        return shiftDate < todayDate && shift.status === 'COMPLETED';
      }).length;

      // Calculate dashboard stats
      const dashboardStats: DashboardStats = {
        totalEmployees: isManagerOrAdmin ? employeesOnly.length : currentWeekShifts.filter((s: Shift) => s.userId === userId).length, // For employees, show their current week shifts count
        pendingLeaveRequests: filteredLeaveRequests.filter((lr: LeaveRequest) => lr.status === 'PENDING').length,
        pendingSwapRequests: filteredSwapRequests.filter((sr: SwapRequest) => sr.status === 'PENDING').length,
        completedShifts: completedShiftsCount, // Total completed shifts until today
        upcomingShifts: isManagerOrAdmin ? currentWeekShifts.length : currentWeekShifts.filter((s: Shift) => s.userId === userId).length, // For employees, show only their current week shifts
      };

      // Build pending approvals list
      const pendingApprovalsList: DashboardApprovalRequest[] = [];

      if (isManagerOrAdmin) {
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
            const requester = userMap.get(sr.requesterUserId) as User;
            if (requester) {
              pendingApprovalsList.push({
                ...sr,
                _type: 'swap',
                _employeeName: `${requester.firstName} ${requester.lastName}`,
              });
            }
          });
      }

      // Build today's schedule

      const todayScheduleList: DashboardShift[] = todayShifts.map((shift: Shift) => {
        const shiftUser = userMap.get(shift.userId) as User;
        return {
          ...shift, // Include all Shift properties
          _employeeName: shiftUser ? `${shiftUser.firstName} ${shiftUser.lastName}` : 'Unknown',
        };
      });

      // Update all state
      setStats(dashboardStats);
      setPendingApprovals(pendingApprovalsList);
      setTodaySchedule(todayScheduleList);
      setTeamMembers(deduplicateTeamMembers(employeesOnly)); // Use only employees for drag-and-drop (no managers/admins for on-call)
      setAllUsers(displayUsers); // Store all users for manager dropdown

    } catch {

    }
  }, [userId, userRole, user, isManagerOrAdmin]);

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

            // Only filter out the specific shift being updated (by $id)
            const filtered = prev.filter(s => s.$id !== (payload.$id as string));

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

              // Add the new/updated shift and sort by role for consistent display
              const updatedSchedule = [...filtered, newShift];
              const sortedSchedule = updatedSchedule.sort((a, b) => {
                // Sort PRIMARY first, then BACKUP
                if (a.onCallRole === 'PRIMARY' && b.onCallRole === 'BACKUP') return -1;
                if (a.onCallRole === 'BACKUP' && b.onCallRole === 'PRIMARY') return 1;
                return 0;
              });

              return sortedSchedule;
            }

            return filtered;
          });
        }

        // Stats will be updated automatically by the shifts count refresh effect

      } else if (eventType === 'DELETE') {

        // Remove from today's schedule
        if (shiftDate === today) {
          setTodaySchedule(prev => {
            const exists = prev.some(s => s.$id === payload.$id);
            if (!exists) {

              return prev;
            }
            return prev.filter(s => s.$id !== payload.$id);
          });
        }

        // Stats will be updated automatically by the shifts count refresh effect
      }
    } catch {

      // Fallback to silent refresh if individual update fails
      await silentRefreshDashboard();
    }
  }, [silentRefreshDashboard]);

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
    } catch {

      await silentRefreshDashboard();
    }
  }, [userRole, silentRefreshDashboard]);

  const handleSwapUpdate = useCallback(async (payload: Record<string, unknown>, eventType: string) => {
    try {
      if (eventType === 'CREATE') {
        // Add to pending approvals only if user is an employee and this is a request targeting them
        if (userRole === 'EMPLOYEE' && payload.targetUserId === userId && payload.requesterUserId !== userId && payload.status === 'PENDING') {
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

          // Update stats for employees
          setStats(prev => ({
            ...prev,
            pendingSwapRequests: prev.pendingSwapRequests + 1
          }));
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
    } catch {

      await silentRefreshDashboard();
    }
  }, [userRole, userId, silentRefreshDashboard]);

  // Helper function to refresh user count from database
  const refreshUserCount = useCallback(async () => {
    try {
      if (!isManagerOrAdmin) return;

      const users = await userService.getAllUsers();
      const employeeCount = users.filter(user => user.role === 'EMPLOYEE').length;

      setStats(prevStats => {

        return { ...prevStats, totalEmployees: employeeCount };
      });
    } catch {

    }
  }, [isManagerOrAdmin]);

  // Helper function to refresh current week shifts count (for "My Shifts This week" stat)
  const refreshCurrentWeekShiftsCount = useCallback(async () => {
    try {
      const currentWeek = getCurrentWeekRange();

      // Get shifts for current week (Monday to Sunday)
      const currentWeekShifts = await shiftService.getShiftsByDateRange(currentWeek.start, currentWeek.end);

      // For managers/admins, show total employees count; for employees, show their current week shifts count
      const currentWeekCount = isManagerOrAdmin
        ? stats.totalEmployees // Keep existing employee count for managers/admins
        : currentWeekShifts.filter(shift => shift.userId === userId).length;

      setStats(prevStats => {
        return { ...prevStats, totalEmployees: isManagerOrAdmin ? prevStats.totalEmployees : currentWeekCount };
      });
    } catch {

    }
  }, [isManagerOrAdmin, userId, stats.totalEmployees]);

  // Helper function to refresh upcoming shifts count from database
  const refreshUpcomingShiftsCount = useCallback(async () => {
    try {

      // Calculate dates - next 7 days starting from tomorrow
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const sevenDaysFromTomorrow = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 8 days from today = 7 days from tomorrow
      const today = new Date().toISOString().split('T')[0];

      const tomorrowStart = `${tomorrow}T00:00:00.000Z`;
      const sevenDaysEnd = `${sevenDaysFromTomorrow}T23:59:59.999Z`;

      // Get shifts for 7 days from tomorrow
      const allShifts = await shiftService.getShiftsByDateRange(tomorrowStart, sevenDaysEnd);

      // Filter out any shifts that happen to be for today (extra safety)
      const upcomingShifts = allShifts.filter(shift => {
        const shiftDate = shift.date.split('T')[0]; // Extract date part from datetime
        return shiftDate !== today; // Exclude today
      });

      // For employees, only count their own shifts
      const upcomingCount = isManagerOrAdmin ? upcomingShifts.length : upcomingShifts.filter(shift => shift.userId === userId).length;

      setStats(prevStats => {
        return { ...prevStats, upcomingShifts: upcomingCount };
      });
    } catch {

    }
  }, [isManagerOrAdmin, userId]);

  // Effect to refresh user count when user collection changes
  useEffect(() => {
    if (!user) return;

    let refreshTimeout: NodeJS.Timeout;

    const handleUserCollectionChange = () => {
      // Debounce the refresh to avoid multiple calls
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshUserCount();
      }, 500); // 500ms debounce
    };

    const unsubscribe = client.subscribe(
      [`databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents`],
      handleUserCollectionChange
    );

    return () => {
      clearTimeout(refreshTimeout);
      unsubscribe();
    };
  }, [user, refreshUserCount]);

  // Effect to refresh upcoming shifts count when shifts collection changes
  useEffect(() => {
    if (!user) return;

    let refreshTimeout: NodeJS.Timeout;

    const handleShiftsCollectionChange = () => {
      // Debounce the refresh to avoid multiple calls
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshUpcomingShiftsCount();
      }, 500); // 500ms debounce
    };

    const unsubscribe = client.subscribe(
      [`databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`],
      handleShiftsCollectionChange
    );

    return () => {
      clearTimeout(refreshTimeout);
      unsubscribe();
    };
  }, [user, refreshUpcomingShiftsCount]);

  // Effect to refresh current week shifts count for "My Shifts This week" stat
  useEffect(() => {
    if (!user) return;

    let refreshTimeout: NodeJS.Timeout;

    const handleCurrentWeekShiftsChange = () => {
      // Debounce the refresh to avoid multiple calls
      clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        refreshCurrentWeekShiftsCount();
      }, 500); // 500ms debounce
    };

    const unsubscribe = client.subscribe(
      [`databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`],
      handleCurrentWeekShiftsChange
    );

    return () => {
      clearTimeout(refreshTimeout);
      unsubscribe();
    };
  }, [user, refreshCurrentWeekShiftsCount]);

  const handleTeamMemberUpdate = useCallback(async (payload: Record<string, unknown>, eventType: string) => {
    try {// Debug logging

      const memberId = payload.$id as string;

      if (eventType === 'CREATE') {
        // Add new team member - ONLY add employees for drag-and-drop (no managers/admins for on-call)
        const newMember = payload as unknown as User;
        if (newMember.role === 'EMPLOYEE') {
          setTeamMembers(prev => {
            // Check for duplicates more thoroughly
            const exists = prev.some(member => member.$id === newMember.$id);
            if (exists) {

              return prev; // Prevent duplicates
            }

            const newMembers = [...prev, newMember];
            return deduplicateTeamMembers(newMembers); // Ensure no duplicates
          });
        }

        // Stats will be updated automatically by the user count refresh effect
      } else if (eventType === 'UPDATE') {
        // Update existing team member
        const updatedMember = payload as unknown as User;

        // Get the old member data and update atomically
        setTeamMembers(prev => {
          const oldMember = prev.find(member => member.$id === updatedMember.$id);

          // Only handle team members list, stats updated automatically by user count refresh
          if (oldMember && updatedMember.role === 'EMPLOYEE') {
            // Update existing employee
            const updatedMembers = prev.map(member =>
              member.$id === updatedMember.$id ? updatedMember : member
            );
            return deduplicateTeamMembers(updatedMembers);
          } else if (oldMember && updatedMember.role !== 'EMPLOYEE') {
            // Remove from team members if no longer an employee

            return prev.filter(member => member.$id !== updatedMember.$id);
          } else if (!oldMember && updatedMember.role === 'EMPLOYEE') {
            // Add to team members if became an employee

            const newMembers = [...prev, updatedMember];
            return deduplicateTeamMembers(newMembers);
          }

          return prev; // No changes needed
        });
      } else if (eventType === 'DELETE') {
        // Handle deletion with better deduplication and single atomic update
        const memberToDelete = teamMembers.find(member => member.$id === memberId);

        // Only proceed if the member actually exists in our current state
        if (!memberToDelete) {

          return; // Exit early to prevent any state updates
        }

        // Check if this member was already deleted (additional safety check)
        const isAlreadyDeleted = !teamMembers.some(member => member.$id === memberId);
        if (isAlreadyDeleted) {

          return;
        }

        // Only manage team members array - stats handled automatically by user count refresh
        setTeamMembers(prev => {
          // Double-check the member still exists before filtering
          const memberExists = prev.some(member => member.$id === memberId);
          if (!memberExists) {

            return prev; // Return unchanged state
          }

          const filteredMembers = prev.filter(member => member.$id !== memberId);

          return filteredMembers;
        });
      }
    } catch {

      await silentRefreshDashboard();
    }
  }, [silentRefreshDashboard, teamMembers]);

  // Handle approval dialog
  const handleApprovalClick = (approval: DashboardApprovalRequest) => {
    setSelectedApproval(approval);
    setIsApprovalDialogOpen(true);
    setApprovalComment('');
  };

  // Handle approve action
  const handleApprove = async () => {
    if (!selectedApproval) return;

    setIsProcessingApproval(true);
    try {
      if (selectedApproval._type === 'leave') {
        await leaveService.updateLeaveRequest(selectedApproval.$id!, {
          status: 'APPROVED' as LeaveStatus,
          managerComment: approvalComment || ''
        });

        // Create notification for employee
        try {
          await notificationService.createLeaveResponseNotification(
            selectedApproval.userId!,
            'APPROVED',
            selectedApproval.type!,
            selectedApproval.startDate!,
            selectedApproval.endDate!,
            selectedApproval.$id!,
            approvalComment
          );
        } catch {

        }
      } else if (selectedApproval._type === 'swap') {
        await swapService.updateSwapRequest(selectedApproval.$id!, {
          status: 'APPROVED' as SwapStatus
        });

        // Create notification for requester
        try {
          const swapRequest = selectedApproval as SwapRequest;
          await notificationService.createSwapResponseNotification(
            swapRequest.requesterUserId,
            'APPROVED',
            'Your shift',
            selectedApproval.$id!,
            user ? `${user.firstName} ${user.lastName}` : 'Manager'
          );
        } catch {

        }
      }

      toast({
        title: "Approved",
        description: `${selectedApproval._type === 'leave' ? 'Leave request' : 'Swap request'} has been approved`,
        duration: 3000,
      });

      setIsApprovalDialogOpen(false);
      setSelectedApproval(null);
      setApprovalComment('');

      // Refresh dashboard data to show updates
      await silentRefreshDashboard();
    } catch {
      toast({
        title: "Error",
        description: "Failed to approve request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Handle reject action
  const handleReject = async () => {
    if (!selectedApproval) return;

    setIsProcessingApproval(true);
    try {
      if (selectedApproval._type === 'leave') {
        await leaveService.updateLeaveRequest(selectedApproval.$id!, {
          status: 'REJECTED' as LeaveStatus,
          managerComment: approvalComment || ''
        });

        // Create notification for employee
        try {
          await notificationService.createLeaveResponseNotification(
            selectedApproval.userId!,
            'REJECTED',
            selectedApproval.type!,
            selectedApproval.startDate!,
            selectedApproval.endDate!,
            selectedApproval.$id!,
            approvalComment
          );
        } catch {

        }
      } else if (selectedApproval._type === 'swap') {
        await swapService.updateSwapRequest(selectedApproval.$id!, {
          status: 'REJECTED' as SwapStatus
        });

        // Create notification for requester
        try {
          const swapRequest = selectedApproval as SwapRequest;
          await notificationService.createSwapResponseNotification(
            swapRequest.requesterUserId,
            'REJECTED',
            'Your shift',
            selectedApproval.$id!,
            user ? `${user.firstName} ${user.lastName}` : 'Manager'
          );
        } catch {

        }
      }

      toast({
        title: "Rejected",
        description: `${selectedApproval._type === 'leave' ? 'Leave request' : 'Swap request'} has been rejected`,
        duration: 3000,
      });

      setIsApprovalDialogOpen(false);
      setSelectedApproval(null);
      setApprovalComment('');

      // Refresh dashboard data to show updates
      await silentRefreshDashboard();
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingApproval(false);
    }
  };

  // Real-time subscriptions for dashboard updates
  useEffect(() => {
    if (!user) return;

    // Use a Set to track processed events to prevent duplicates
    const processedEvents = new Set<string>();

    const subscriptions = [
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.LEAVES}.documents`,
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`,
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents`,
    ];

    const unsubscribe = client.subscribe(
      subscriptions,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: Record<string, any>) => {// Debug logging

        const events = response.events || [];
        const payload = response.payload;

        // Create a unique identifier for this event - be more specific based on event type
        let eventKey = `${payload?.$id}-${events[0]}-${payload?.$updatedAt}`;

        // Add specific identifiers for different collection types
        if (events.some((e: string) => e.includes('shifts'))) {
          eventKey += `-${payload?.onCallRole || 'unknown'}`;
        } else if (events.some((e: string) => e.includes('users'))) {
          eventKey += `-${payload?.role || 'unknown'}`;
        }

        // Check for exact duplicate events (same ID, event type, and timestamp)
        if (processedEvents.has(eventKey)) {

          return;
        }

        // Add to processed events and cleanup old entries (keep only last 50)
        processedEvents.add(eventKey);
        if (processedEvents.size > 50) {
          const oldEvents = Array.from(processedEvents).slice(0, 25);
          oldEvents.forEach(event => processedEvents.delete(event));
        }

        // Check for specific event types - handle ALL events, not just create/update/delete
        const hasCreateEvent = events.some((event: string) => event.includes('.create'));
        const hasUpdateEvent = events.some((event: string) => event.includes('.update'));
        const hasDeleteEvent = events.some((event: string) => event.includes('.delete'));

        // Process any event that has occurred - this ensures real-time sync for ALL user events
        if (events.length > 0 && payload) {
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : hasDeleteEvent ? 'DELETE' : 'UNKNOWN';

          // Handle different collection updates with targeted state updates
          if (events.some((e: string) => e.includes('shifts'))) {
            await handleShiftUpdate(payload, eventType);
          } else if (events.some((e: string) => e.includes('leaves'))) {
            await handleLeaveUpdate(payload, eventType);
          } else if (events.some((e: string) => e.includes('swap'))) {
            await handleSwapUpdate(payload, eventType);
          } else if (events.some((e: string) => e.includes('users'))) {
            await handleTeamMemberUpdate(payload, eventType);
          }

          // Show toast notification with more specific message
          if (hasCreateEvent || hasUpdateEvent || hasDeleteEvent) {
            const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
            const collection = events[0]?.includes('shifts') ? 'Shift' :
              events[0]?.includes('leaves') ? 'Leave request' :
                events[0]?.includes('swap') ? 'Swap request' :
                  events[0]?.includes('users') ? 'Team member' : 'Data';

            toast({
              title: "Dashboard Updated",
              description: `${collection} ${eventTypeText}`,
              duration: 2000,
            });
          }
        }
      }
    );

    return () => {

      unsubscribe();
    };
  }, [user, toast, handleShiftUpdate, handleLeaveUpdate, handleSwapUpdate, handleTeamMemberUpdate]);

  // Refresh function for manual refresh
  const refreshDashboard = useCallback(async () => {
    try {

      setIsLoading(true);
      await fetchDashboardData();
      toast({
        title: "Dashboard Refreshed",
        description: "All data has been updated",
        duration: 2000,
      });
    } catch {

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

  // Handle data refresh for WeeklySchedule component
  const handleDataRefresh = useCallback(async () => {
    await silentRefreshDashboard();
  }, [silentRefreshDashboard]);

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
      }, `${user?.firstName} ${user?.lastName}`); // Pass assigned by info

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
    } catch {

      toast({
        title: "Error",
        description: "Failed to create shift. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSchedulingShift(false);
    }
  }, [scheduleForm, toast, fetchDashboardData, user?.firstName, user?.lastName]);

  // Team member handlers
  const handleAddMember = useCallback(async () => {
    setIsEditingMember(false);
    setEditingMemberId(null);
    setMemberForm({
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      password: '',
      role: 'EMPLOYEE',
      managerId: '',
      paidLeaves: 20,
      sickLeaves: 12,
      compOffs: 0,
    });

    // Ensure we have all users for the manager dropdown
    try {
      if (allUsers.length === 0) {
        const users = await userService.getAllUsers();
        setAllUsers(users);
      }
    } catch {

    }

    setIsTeamMemberDialogOpen(true);
  }, [allUsers.length]);

  const handleEditMember = useCallback((member: User) => {
    setIsEditingMember(true);
    setEditingMemberId(member.$id);
    setMemberForm({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      username: member.username,
      password: '', // Password field is not needed for editing
      role: member.role as 'EMPLOYEE' | 'MANAGER',
      managerId: ('managerId' in member ? (member as User & { managerId?: string }).managerId : '') || '', // Get manager ID if exists
      paidLeaves: member.paidLeaves || 20,
      sickLeaves: member.sickLeaves || 12,
      compOffs: member.compOffs || 0,
    });
    setIsTeamMemberDialogOpen(true);
  }, []);

  const handleDeleteMember = useCallback((memberId: string) => {
    setMemberToDelete(memberId);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!memberToDelete) return;

    try {
      // Use the same API endpoint as the team page for consistent behavior
      const response = await fetch(`/api/user-management?userId=${memberToDelete}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }

      setTeamMembers(prev => prev.filter(m => m.$id !== memberToDelete));
      toast({
        title: "Success",
        description: "Team member has been completely removed from both authentication and database.",
        className: "border-green-500 bg-green-50 text-green-900"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete team member. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
      setMemberToDelete(null);
    }
  }, [memberToDelete, toast]);

  const handleSaveMember = useCallback(async () => {
    try {
      if (isEditingMember && editingMemberId) {
        // Update existing member
        const updatedUser = await userService.updateUser(editingMemberId, memberForm);
        setTeamMembers(prev => deduplicateTeamMembers(prev.map(m => m.$id === editingMemberId ? updatedUser : m)));
        toast({
          title: "Success",
          description: "Team member updated successfully.",
        });
      } else {
        // Create new member using synchronized API
        const formData = {
          ...memberForm,
          managerId: memberForm.managerId === 'none' ? undefined : memberForm.managerId
        };

        const response = await fetch('/api/user-management', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create user');
        }

        const newUser = await response.json();
        setTeamMembers(prev => deduplicateTeamMembers([...prev, newUser]));
        toast({
          title: "Success",
          description: "Team member added successfully.",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: `Failed to ${isEditingMember ? 'update' : 'add'} team member. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsTeamMemberDialogOpen(false);
    }
  }, [isEditingMember, editingMemberId, memberForm, toast]);

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
    // Safety check for undefined userId
    if (!userId || typeof userId !== 'string') {
      userId = 'default-user-id';
    }

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

          <Card className={`bg-gradient-to-br ${!isManagerOrAdmin ? 'from-purple-50 to-purple-100' : 'from-green-50 to-green-100'} border-purple-200 hover:shadow-md transition-all duration-200`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={`text-sm font-medium ${!isManagerOrAdmin ? 'text-purple-800' : 'text-green-800'} `}>
                {isManagerOrAdmin ? 'Completed Shifts' : 'Pending Swaps'}
              </CardTitle>
              <div
                className={`p-2  rounded-lg ${!isManagerOrAdmin ? 'bg-purple-200' : 'bg-green-200'} `}>
                {isManagerOrAdmin ? (
                  <CheckCircle

                    className={`h-4 w-4 ${!isManagerOrAdmin ? 'text-purple-600' : 'text-green-600'}  `} />
                ) : (
                  <RotateCcw className={`h-4 w-4 ${!isManagerOrAdmin ? 'text-purple-600' : 'text-green-600'}  `} />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${!isManagerOrAdmin ? 'text-purple-900' : 'text-green-900'}  `}>
                {isManagerOrAdmin ? stats.completedShifts : stats.pendingSwapRequests}
              </div>
              <p className={`text-xs ${!isManagerOrAdmin ? 'text-purple-900' : 'text-green-900'}`}>
                {isManagerOrAdmin ? 'Total completed until today' : 'Your pending requests'}
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

              <Card className="hover:shadow-md transition-shadow cursor-pointer border-blue-200 bg-blue-50/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <CardTitle className="text-sm">Schedule</CardTitle>
                      <CardDescription className="text-xs">Manage shifts</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button
                    onClick={() => window.location.href = '/schedule'}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    size="sm"
                  >
                    Open Schedule
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
        <Card className="border-0 shadow-lg overflow-hidden bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
          <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-violet-600" />
              Weekly Schedule
            </CardTitle>
            <CardDescription>
              Current week&apos;s schedule overview
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklySchedule
              user={user}
              teamMembers={teamMembers}
              onScheduleUpdate={handleDataRefresh}
            />
          </CardContent>
        </Card>

        {/* Responsive Layout for Additional Info */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Employees on Leave This Week */}
          <EmployeesOnLeave
            teamMembers={teamMembers}
            isLoading={isLoading}
          />

          {/* Pending Approvals */}
          <Card className={`border-0 shadow-lg overflow-hidden ${!isManagerOrAdmin ? 'bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20' : 'bg-white dark:bg-slate-800'}`}>
            <div className={`h-1 ${!isManagerOrAdmin ? 'bg-gradient-to-r from-orange-500 to-red-600' : 'bg-gradient-to-r from-blue-500 to-indigo-600'}`} />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                {isManagerOrAdmin ? 'Pending Approvals' : 'Incoming Swap Request Approval'}
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
                    <div
                      key={approval.$id}
                      className={`flex items-center justify-between p-4 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md border-l-4 ${approval._type === 'leave'
                          ? 'bg-gradient-to-r from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border-l-blue-500 dark:from-blue-900/20 dark:to-blue-800/20 dark:hover:from-blue-800/30 dark:hover:to-blue-700/30'
                          : 'bg-gradient-to-r from-emerald-50 to-emerald-100/50 hover:from-emerald-100 hover:to-emerald-200/50 border-l-emerald-500 dark:from-emerald-900/20 dark:to-emerald-800/20 dark:hover:from-emerald-800/30 dark:hover:to-emerald-700/30'
                        }`}
                      onClick={() => handleApprovalClick(approval)}
                    >
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {approval._type === 'leave' ? (
                            <div className="p-2 bg-blue-200 rounded-lg">
                              <FileText className="h-4 w-4 text-blue-700" />
                            </div>
                          ) : (
                            <div className="p-2 bg-emerald-200 rounded-lg">
                              <RotateCcw className="h-4 w-4 text-emerald-700" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold text-sm ${approval._type === 'leave' ? 'text-blue-900 dark:text-blue-100' : 'text-emerald-900 dark:text-emerald-100'
                            }`}>
                            {approval._employeeName}
                          </p>
                          <p className={`text-xs truncate ${approval._type === 'leave' ? 'text-blue-700 dark:text-blue-300' : 'text-emerald-700 dark:text-emerald-300'
                            }`}>
                            {approval._type === 'leave' ? (
                              approval.startDate && approval.endDate ?
                                `${formatDate(approval.startDate)} to ${formatDate(approval.endDate)}` :
                                'Leave Request'
                            ) : (
                              'Shift Swap Request'
                            )}
                          </p>
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${approval._type === 'leave'
                            ? 'border-blue-300 text-blue-700 bg-blue-100 dark:border-blue-600 dark:text-blue-300 dark:bg-blue-900/30'
                            : 'border-emerald-300 text-emerald-700 bg-emerald-100 dark:border-emerald-600 dark:text-emerald-300 dark:bg-emerald-900/30'
                          }`}
                      >
                        Pending
                      </Badge>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5" />
                    Team Members
                  </CardTitle>
                  <CardDescription>
                    {teamMembers.length} active team member{teamMembers.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
                <Button
                  onClick={handleAddMember}
                  className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>
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
                  {teamMembers.map((member) => {
                    // Safety check for member data
                    if (!member || !member.$id) {
                      return null;
                    }

                    const userColors = getUserColor(member.$id, member.role as 'MANAGER' | 'EMPLOYEE');

                    return (
                      <div
                        key={member.$id}
                        className={`group relative flex items-center space-x-4 p-4 rounded-lg border ${userColors.border} ${userColors.light} hover:shadow-lg transition-all duration-200 overflow-hidden`}
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
                              className={`text-xs ${member.role === 'MANAGER'
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

                        {/* Hover Actions */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 bg-white/90 hover:bg-blue-50 border-blue-200 hover:border-blue-300"
                            onClick={() => handleEditMember(member)}
                          >
                            <Edit2 className="h-3 w-3 text-blue-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 w-8 p-0 bg-white/90 hover:bg-red-50 border-red-200 hover:border-red-300"
                            onClick={() => handleDeleteMember(member.$id)}
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No team members found</p>
                  <Button
                    onClick={handleAddMember}
                    className="mt-4 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add First Member
                  </Button>
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

      {/* Approval Dialog */}
      <Dialog open={isApprovalDialogOpen} onOpenChange={setIsApprovalDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedApproval?._type === 'leave' ? 'Leave Request' : 'Swap Request'} Details
            </DialogTitle>
            <DialogDescription>
              Review and take action on this {selectedApproval?._type === 'leave' ? 'leave' : 'swap'} request
            </DialogDescription>
          </DialogHeader>

          {selectedApproval && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Employee</Label>
                  <p className="text-sm text-muted-foreground">{selectedApproval._employeeName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Type</Label>
                  <p className="text-sm text-muted-foreground capitalize">
                    {selectedApproval._type === 'leave' ? `${selectedApproval.type} Leave` : 'Shift Swap'}
                  </p>
                </div>
              </div>

              {selectedApproval._type === 'leave' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Start Date</Label>
                    <p className="text-sm text-muted-foreground">{formatDate(selectedApproval.startDate!)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">End Date</Label>
                    <p className="text-sm text-muted-foreground">{formatDate(selectedApproval.endDate!)}</p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium">Reason</Label>
                <p className="text-sm text-muted-foreground p-2 bg-gray-50 rounded border max-w-md">
                  {selectedApproval.reason || 'No reason provided'}
                </p>
              </div>

              <div>
                <Label htmlFor="approvalComment" className="text-sm font-medium">
                  Approver Comment (Optional)
                </Label>
                <Textarea
                  id="approvalComment"
                  placeholder="Add your comments here..."
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsApprovalDialogOpen(false)}
              disabled={isProcessingApproval}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isProcessingApproval}
            >
              {isProcessingApproval ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject'
              )}
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isProcessingApproval}
              className="bg-green-600 hover:bg-green-700"
            >
              {isProcessingApproval ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Member Add/Edit Dialog */}
      <Dialog open={isTeamMemberDialogOpen} onOpenChange={setIsTeamMemberDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {isEditingMember ? 'Edit Team Member' : 'Add New Team Member'}
            </DialogTitle>
            <DialogDescription>
              {isEditingMember ? 'Update team member information' : 'Add a new team member to your organization'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  value={memberForm.firstName}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="John"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  value={memberForm.lastName}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, lastName: e.target.value }))}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={memberForm.email}
                onChange={(e) => setMemberForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="john.doe@company.com"
              />
            </div>

            <div>
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                value={memberForm.username}
                onChange={(e) => setMemberForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="johndoe"
              />
            </div>

            {!isEditingMember && (
              <div>
                <Label htmlFor="password">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={memberForm.password}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter password"
                />
              </div>
            )}

            <div>
              <Label htmlFor="role">Role *</Label>
              <Select
                value={memberForm.role}
                onValueChange={(value: 'EMPLOYEE' | 'MANAGER') => setMemberForm(prev => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Employee</SelectItem>
                  <SelectItem value="MANAGER">Manager</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Manager Selection - only show for employees */}
            {memberForm.role === 'EMPLOYEE' && (
              <div>
                <Label htmlFor="manager">Manager</Label>
                <Select
                  value={memberForm.managerId}
                  onValueChange={(value: string) => setMemberForm(prev => ({ ...prev, managerId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {allUsers
                      .filter(user => user.role === 'MANAGER' || user.role === 'ADMIN')
                      .map(manager => (
                        <SelectItem key={manager.$id} value={manager.$id}>
                          {manager.firstName} {manager.lastName} ({manager.role})
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="paidLeaves">Paid Leaves</Label>
                <Input
                  id="paidLeaves"
                  type="number"
                  value={memberForm.paidLeaves}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, paidLeaves: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="sickLeaves">Sick Leaves</Label>
                <Input
                  id="sickLeaves"
                  type="number"
                  value={memberForm.sickLeaves}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, sickLeaves: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div>
                <Label htmlFor="compOffs">Comp Offs</Label>
                <Input
                  id="compOffs"
                  type="number"
                  value={memberForm.compOffs}
                  onChange={(e) => setMemberForm(prev => ({ ...prev, compOffs: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsTeamMemberDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveMember}
              className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
            >
              {isEditingMember ? 'Update Member' : 'Add Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Team Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this team member? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
