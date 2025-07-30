'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  Calendar,
  Clock,
  FileText,
  RotateCcw,
  RefreshCw,
  TrendingUp,
  CheckCircle,
  XCircle,
  Shield,
  UserPlus,
  AlertTriangle,
  CalendarPlus,
  ClipboardList,
  Loader2,
} from 'lucide-react';
import { DashboardStats, LeaveRequest, SwapRequest, Shift, User } from '@/types';

// Import components
import WeeklySchedule from '@/components/dashboard/WeeklySchedule';

// Import Appwrite services
import { userService } from '@/lib/appwrite/user-service';
import { shiftService } from '@/lib/appwrite/shift-service';
import { leaveService } from '@/lib/appwrite/leave-service';
import { swapService } from '@/lib/appwrite/swap-service';
import { account } from '@/lib/appwrite/config';

// Extended types for dashboard with additional display properties
interface DashboardApprovalRequest extends Partial<LeaveRequest & SwapRequest> {
  _type: 'leave' | 'swap';
  _employeeName: string;
}

interface DashboardShift extends Shift {
  _employeeName: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  
  // State for real data from Appwrite
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
  const [allManagers, setAllManagers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCollectionError, setHasCollectionError] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isTeamMemberDialogOpen, setIsTeamMemberDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedRole, setSelectedRole] = useState<'PRIMARY' | 'BACKUP'>('PRIMARY');
  const [newMemberData, setNewMemberData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'MANAGER',
    manager: '',
    password: '',
  });

  // Fetch dashboard data from Appwrite
  const userId = user?.$id;
  const userRole = user?.role;
  
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!userId || !userRole) return;
      
      setIsLoading(true);
      try {
        // Parallel data fetching for better performance
        const today = new Date().toISOString().split('T')[0];
        const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Handle UPPERCASE roles from Appwrite
        const normalizedUserRole = userRole?.toUpperCase();
        const isManagerOrAdmin = normalizedUserRole === 'MANAGER' || normalizedUserRole === 'ADMIN';

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

        // Filter data based on user role
        let filteredUsers = allUsers;
        let filteredLeaveRequests = allLeaveRequests;
        let filteredSwapRequests = allSwapRequests;

        if (normalizedUserRole === 'MANAGER') {
          // Managers see only their team members' data
          const teamMemberIds = allUsers.filter((u: User) => u.manager === userId).map((u: User) => u.$id);
          filteredUsers = allUsers.filter((u: User) => u.manager === userId);
          filteredLeaveRequests = allLeaveRequests.filter((lr: LeaveRequest) => teamMemberIds.includes(lr.userId));
          filteredSwapRequests = allSwapRequests.filter((sr: SwapRequest) => 
            teamMemberIds.includes(sr.requesterUserId) || (sr.targetUserId && teamMemberIds.includes(sr.targetUserId))
          );
        } else if (normalizedUserRole === 'EMPLOYEE') {
          // For employees calling this (shouldn't happen but just in case)
          filteredUsers = [];
          filteredLeaveRequests = allLeaveRequests.filter((lr: LeaveRequest) => lr.userId === userId);
          filteredSwapRequests = allSwapRequests.filter((sr: SwapRequest) => 
            sr.requesterUserId === userId || sr.targetUserId === userId
          );
        }

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
        }

        // Build today's schedule with employee names
        const todayScheduleWithNames: DashboardShift[] = todayShifts.map((shift: Shift) => {
          const employee = userMap.get(shift.userId) as User;
          return {
            ...shift,
            _employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
          };
        });

        // Update state
        setStats(dashboardStats);
        setPendingApprovals(pendingApprovalsList);
        setTodaySchedule(todayScheduleWithNames);
        setTeamMembers(filteredUsers);
        setAllManagers(allManagersList);

      } catch (error: unknown) {
        console.error('Error fetching dashboard data:', error);
        
        // Check if it's a collection not found error
        if (error && typeof error === 'object' && 'message' in error && 
            typeof error.message === 'string' && 
            (error.message.includes('Collection with the requested ID could not be found') ||
             error.message.includes('Database not found'))) {
          console.error('Database collections not found. Please set up the database first.');
          setHasCollectionError(true);
        }
        
        // Use empty data to allow the app to work
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
        setAllManagers([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();
  }, [userId, userRole]); // Only depend on user ID and role

  const StatCard = ({ title, value, description, icon: Icon, color, onClick }: {
    title: string;
    value: number;
    description: string;
    icon: React.ElementType;
    color: string;
    onClick?: () => void;
  }) => (
    <Card 
      className={`relative overflow-hidden border-0 shadow-lg bg-white dark:bg-slate-800 hover:shadow-xl transition-all duration-300 ${onClick ? 'cursor-pointer hover:scale-105' : ''}`}
      onClick={onClick}
    >
      <div 
        className="absolute top-0 left-0 w-1 h-full"
        style={{ backgroundColor: color }}
      />
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2 pl-6">
        <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
          {title}
        </CardTitle>
        <div 
          className="p-2.5 rounded-lg"
          style={{ 
            backgroundColor: `${color}15`,
            border: `1px solid ${color}30`
          }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </CardHeader>
      <CardContent className="relative pl-6">
        <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-1">
          {value}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {description}
        </p>
      </CardContent>
    </Card>
  );

  const handleApproveRequest = async (requestId: string, type: 'leave' | 'swap') => {
    try {
      if (type === 'leave') {
        await leaveService.updateLeaveRequest(requestId, { status: 'APPROVED' });
      } else {
        await swapService.updateSwapRequest(requestId, { status: 'APPROVED' });
      }
      // Remove from pending approvals
      setPendingApprovals(prev => prev.filter(req => req.$id !== requestId));
      // Update stats
      setStats(prev => ({
        ...prev,
        pendingLeaveRequests: type === 'leave' ? prev.pendingLeaveRequests - 1 : prev.pendingLeaveRequests,
        pendingSwapRequests: type === 'swap' ? prev.pendingSwapRequests - 1 : prev.pendingSwapRequests,
      }));
    } catch (error) {
      console.error(`Error approving ${type} request:`, error);
    }
  };

  const handleRejectRequest = async (requestId: string, type: 'leave' | 'swap') => {
    try {
      if (type === 'leave') {
        await leaveService.updateLeaveRequest(requestId, { status: 'REJECTED' });
      } else {
        await swapService.updateSwapRequest(requestId, { status: 'REJECTED' });
      }
      // Remove from pending approvals
      setPendingApprovals(prev => prev.filter(req => req.$id !== requestId));
      // Update stats
      setStats(prev => ({
        ...prev,
        pendingLeaveRequests: type === 'leave' ? prev.pendingLeaveRequests - 1 : prev.pendingLeaveRequests,
        pendingSwapRequests: type === 'swap' ? prev.pendingSwapRequests - 1 : prev.pendingSwapRequests,
      }));
    } catch (error) {
      console.error(`Error rejecting ${type} request:`, error);
    }
  };

  const handleScheduleShift = async () => {
    if (!selectedEmployee || !selectedDate) return;

    try {
      const newShift = await shiftService.createShift({
        userId: selectedEmployee,
        date: selectedDate,
        onCallRole: selectedRole,
        status: 'SCHEDULED',
      });

      // Add to today's schedule if it's today
      if (selectedDate === new Date().toISOString().split('T')[0]) {
        const employee = teamMembers.find(tm => tm.$id === selectedEmployee);
        const newShiftWithName: DashboardShift = {
          ...newShift,
          _employeeName: employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown',
        };
        setTodaySchedule(prev => [...prev, newShiftWithName]);
        setStats(prev => ({ ...prev, todayShifts: prev.todayShifts + 1 }));
      }

      setIsScheduleDialogOpen(false);
      setSelectedEmployee('');
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setSelectedRole('PRIMARY');
    } catch (error) {
      console.error('Error scheduling shift:', error);
    }
  };

  const handleAddTeamMember = async () => {
    if (!newMemberData.firstName || !newMemberData.lastName || !newMemberData.email || !newMemberData.password) return;

    try {
      // Create user account with Appwrite Auth
      await account.create(
        'unique()',
        newMemberData.email,
        newMemberData.password,
        `${newMemberData.firstName} ${newMemberData.lastName}`
      );

      // Create user profile in database
      const newUser = await userService.createUser({
        firstName: newMemberData.firstName,
        lastName: newMemberData.lastName,
        username: newMemberData.username || newMemberData.email.split('@')[0],
        email: newMemberData.email,
        role: newMemberData.role as 'EMPLOYEE' | 'MANAGER',
        manager: newMemberData.manager || user?.$id,
        paidLeaves: 24,
        sickLeaves: 12,
        compOffs: 0,
      });

      // Add to team members list
      setTeamMembers(prev => [...prev, newUser]);
      setStats(prev => ({ ...prev, totalEmployees: prev.totalEmployees + 1 }));

      // Reset form
      setNewMemberData({
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        role: 'EMPLOYEE',
        manager: '',
        password: '',
      });
      setIsTeamMemberDialogOpen(false);
    } catch (error) {
      console.error('Error adding team member:', error);
    }
  };

  const handleExportSchedule = useCallback(async (format: 'excel' | 'csv' | 'json' = 'csv') => {
    try {
      // Mock export functionality
      const scheduleData = {
        shifts: [
          { date: '2024-02-20', employee: 'John Doe', shift: '09:00-17:00', location: 'Office A' },
          { date: '2024-02-21', employee: 'Jane Smith', shift: '09:00-17:00', location: 'Office B' }
        ],
        leaves: [
          { employee: 'Bob Johnson', type: 'Sick Leave', dates: '2024-02-22 - 2024-02-23', status: 'Approved' }
        ]
      };

      if (format === 'json') {
        const dataStr = JSON.stringify(scheduleData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `schedule-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        URL.revokeObjectURL(url);
      } else if (format === 'csv') {
        const csvContent = [
          'Date,Employee,Shift,Location',
          ...scheduleData.shifts.map(s => `${s.date},${s.employee},${s.shift},${s.location}`)
        ].join('\n');
        
        const dataBlob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `schedule-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        // Excel format - would require a library like xlsx in real implementation
        alert('Excel export would require xlsx library integration');
      }

      console.log(`Schedule exported as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error exporting schedule:', error);
      alert('Failed to export schedule');
    }
  }, []);

  const handleImportSchedule = useCallback(() => {
    // Create file input for import
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.csv,.xlsx';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const fileType = file.name.split('.').pop()?.toLowerCase();
        
        if (fileType === 'json') {
          const text = await file.text();
          const data = JSON.parse(text);
          console.log('Imported JSON data:', data);
          alert('Schedule imported successfully from JSON');
        } else if (fileType === 'csv') {
          const text = await file.text();
          const lines = text.split('\n');
          const headers = lines[0].split(',');
          const data = lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj: Record<string, string>, header, index) => {
              obj[header] = values[index];
              return obj;
            }, {});
          });
          console.log('Imported CSV data:', data);
          alert('Schedule imported successfully from CSV');
        } else {
          alert('Unsupported file format. Please use JSON or CSV files.');
        }
      } catch (error) {
        console.error('Error importing schedule:', error);
        alert('Failed to import schedule');
      }
    };
    input.click();
  }, []);

  // Show loading state
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading dashboard...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Render different dashboard based on user role
  if (user?.role?.toUpperCase() === 'EMPLOYEE') {
    // ================== EMPLOYEE DASHBOARD ==================
    return (
      <DashboardLayout>
        <div className="space-y-6">
          {/* Collection Error Alert */}
          {hasCollectionError && (
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="flex items-center justify-between">
                <span className="text-amber-800 dark:text-amber-200">
                  Database collections not found. Please complete the setup process first.
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = '/setup'}
                  className="ml-4 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800/20"
                >
                  Go to Setup
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Employee Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent dark:from-slate-100 dark:via-blue-200 dark:to-indigo-200">
                Welcome back, {user?.firstName}!
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Here&apos;s your schedule and activity overview.
              </p>
            </div>
            <Button variant="outline" size="sm" className="hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 dark:hover:bg-blue-900/20">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Employee Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="My Upcoming Shifts"
              value={stats.upcomingShifts}
              description="Next 7 days"
              icon={Clock}
              color="#3b82f6"
            />
            <StatCard
              title="Paid Leave Balance"
              value={user?.paidLeaves || 0}
              description="Days remaining"
              icon={FileText}
              color="#10b981"
            />
            <StatCard
              title="My Swap Requests"
              value={stats.pendingSwapRequests}
              description="Pending responses"
              icon={RotateCcw}
              color="#8b5cf6"
            />
            <StatCard
              title="Leave Requests"
              value={stats.pendingLeaveRequests}
              description="Awaiting approval"
              icon={AlertTriangle}
              color="#f59e0b"
            />
          </div>

          {/* Employee Quick Actions */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-800 dark:to-blue-900/20">
            <CardHeader>
              <CardTitle className="text-slate-800 dark:text-slate-200">Quick Actions</CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Manage your schedule and requests
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Button 
                onClick={() => router.push('/schedule')}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 h-12"
              >
                <Calendar className="h-4 w-4" />
                View My Schedule
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push('/leaves')}
                className="flex items-center gap-2 hover:bg-green-50 hover:border-green-200 hover:text-green-700 dark:hover:bg-green-900/20 h-12"
              >
                <FileText className="h-4 w-4" />
                Request Leave
              </Button>
              <Button 
                variant="outline" 
                onClick={() => router.push('/swaps')}
                className="flex items-center gap-2 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 dark:hover:bg-purple-900/20 h-12"
              >
                <RotateCcw className="h-4 w-4" />
                Swap Shifts
              </Button>
            </CardContent>
          </Card>

          {/* Weekly Schedule Overview */}
          {user && <WeeklySchedule user={user} className="border-0 shadow-lg" />}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* My Upcoming Shifts */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-green-50/30 dark:from-slate-800 dark:to-green-900/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
                    <Clock className="h-5 w-5 text-white" />
                  </div>
                  My Upcoming Shifts
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Your scheduled on-call assignments
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {todaySchedule.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No upcoming shifts</p>
                ) : (
                  todaySchedule
                    .filter(shift => shift.userId === user?.$id)
                    .map((shift) => (
                      <div key={shift.$id} className="flex items-center justify-between p-4 rounded-xl bg-white/60 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-600/30">
                        <div>
                          <div className="font-medium">{new Date(shift.date).toLocaleDateString()}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                            {shift.onCallRole} On-Call
                          </div>
                        </div>
                        <Badge 
                          className={`${
                            shift.status === 'SCHEDULED' ? 'bg-green-100 text-green-700 border-green-200' :
                            shift.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {shift.status}
                        </Badge>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>

            {/* My Recent Requests */}
            <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-orange-50/30 dark:from-slate-800 dark:to-orange-900/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  <div className="p-2 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg">
                    <ClipboardList className="h-5 w-5 text-white" />
                  </div>
                  My Recent Requests
                </CardTitle>
                <CardDescription className="text-slate-600 dark:text-slate-400">
                  Leave and swap request status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {pendingApprovals.length === 0 ? (
                  <p className="text-center text-slate-500 py-8">No recent requests</p>
                ) : (
                  pendingApprovals.slice(0, 3).map((request) => (
                    <div key={request.$id} className="flex items-center justify-between p-4 rounded-xl bg-white/60 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-600/30">
                      <div>
                        <div className="font-medium capitalize">{request._type} Request</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">
                          {request._type === 'leave' 
                            ? `${(request as LeaveRequest & { _type: 'leave', _employeeName: string }).startDate} to ${(request as LeaveRequest & { _type: 'leave', _employeeName: string }).endDate}`
                            : 'Shift swap request'
                          }
                        </div>
                      </div>
                      <Badge 
                        className={`${
                          (request as LeaveRequest | SwapRequest).status === 'PENDING' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                          (request as LeaveRequest | SwapRequest).status === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-200' :
                          'bg-red-100 text-red-700 border-red-200'
                        }`}
                      >
                        {(request as LeaveRequest | SwapRequest).status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ================== MANAGER/ADMIN DASHBOARD ==================
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Collection Error Alert */}
        {hasCollectionError && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="flex items-center justify-between">
              <span className="text-amber-800 dark:text-amber-200">
                Database collections not found. Please complete the setup process first.
              </span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/setup'}
                className="ml-4 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-800/20"
              >
                Go to Setup
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Manager Header with Power Controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent dark:from-slate-100 dark:via-blue-200 dark:to-indigo-200 flex items-center gap-2">
              <Shield className="h-8 w-8 text-blue-600" />
              Manager Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Complete control over team scheduling and management.
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExportSchedule('csv')}
              className="hover:bg-green-50 hover:border-green-200 hover:text-green-700 dark:hover:bg-green-900/20"
            >
              <FileText className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleImportSchedule}
              className="hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 dark:hover:bg-blue-900/20"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Import Excel
            </Button>
            <Dialog open={isTeamMemberDialogOpen} onOpenChange={setIsTeamMemberDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 shadow-lg">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add Team Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Team Member</DialogTitle>
                  <DialogDescription>
                    Create a new team member account with role and manager assignment.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={newMemberData.firstName}
                        onChange={(e) => setNewMemberData(prev => ({ ...prev, firstName: e.target.value }))}
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={newMemberData.lastName}
                        onChange={(e) => setNewMemberData(prev => ({ ...prev, lastName: e.target.value }))}
                        placeholder="Doe"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newMemberData.email}
                      onChange={(e) => setNewMemberData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john.doe@company.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={newMemberData.username}
                      onChange={(e) => setNewMemberData(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="johndoe"
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Temporary Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={newMemberData.password}
                      onChange={(e) => setNewMemberData(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Temporary password"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select value={newMemberData.role} onValueChange={(value: 'EMPLOYEE' | 'MANAGER') => setNewMemberData(prev => ({ ...prev, role: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EMPLOYEE">Employee</SelectItem>
                          <SelectItem value="MANAGER">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="manager">Manager</Label>
                      <Select value={newMemberData.manager} onValueChange={(value) => setNewMemberData(prev => ({ ...prev, manager: value }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          {allManagers.map((manager) => (
                            <SelectItem key={manager.$id} value={manager.$id}>
                              {manager.firstName} {manager.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsTeamMemberDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddTeamMember} disabled={!newMemberData.firstName || !newMemberData.lastName || !newMemberData.email || !newMemberData.password}>
                      Add Member
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg">
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Schedule Shift
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Schedule New Shift</DialogTitle>
                  <DialogDescription>
                    Assign primary and backup on-call roles for any date.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="shiftDate">Date</Label>
                    <Input
                      id="shiftDate"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="employee">Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
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
                  <div>
                    <Label htmlFor="role">On-Call Role</Label>
                    <Select value={selectedRole} onValueChange={(value: 'PRIMARY' | 'BACKUP') => setSelectedRole(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRIMARY">Primary On-Call</SelectItem>
                        <SelectItem value="BACKUP">Backup On-Call</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleScheduleShift} disabled={!selectedEmployee || !selectedDate}>
                      Schedule Shift
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Enhanced Manager Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Team Members"
            value={stats.totalEmployees}
            description="Active employees"
            icon={Users}
            color="#6366f1"
            onClick={() => router.push('/team')}
          />
          <StatCard
            title="Today's Coverage"
            value={todaySchedule.length}
            description="On-call scheduled"
            icon={Clock}
            color="#059669"
            onClick={() => router.push('/schedule')}
          />
          <StatCard
            title="Pending Approvals"
            value={pendingApprovals.length}
            description="Require your review"
            icon={ClipboardList}
            color="#dc2626"
          />
          <StatCard
            title="Swap Requests"
            value={stats.pendingSwapRequests}
            description="Pending swaps"
            icon={RotateCcw}
            color="#7c3aed"
            onClick={() => router.push('/swaps')}
          />
          <StatCard
            title="Upcoming Shifts"
            value={stats.upcomingShifts}
            description="Next 7 days"
            icon={TrendingUp}
            color="#ea580c"
          />
        </div>

        {/* Weekly Schedule Overview */}
        {user && <WeeklySchedule user={user} className="border-0 shadow-lg" />}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Approvals - Manager Priority */}
          <Card className="lg:col-span-2 border-0 shadow-lg bg-gradient-to-br from-white to-orange-50/30 dark:from-slate-800 dark:to-orange-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <div className="p-2 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg">
                  <ClipboardList className="h-5 w-5 text-white" />
                </div>
                Pending Approvals
                <Badge className="bg-red-100 text-red-700 border-red-200">
                  {pendingApprovals.length}
                </Badge>
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Leave and swap requests requiring your approval
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingApprovals.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No pending approvals</p>
              ) : (
                pendingApprovals.map((request) => (
                  <div key={request.$id} className="flex items-center justify-between p-4 rounded-xl bg-white/60 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-600/30">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-orange-500 text-white text-xs">
                          {request._employeeName?.split(' ').map((n: string) => n[0]).join('') || (request._type === 'leave' ? 'L' : 'S')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {request._type === 'leave' 
                            ? `${request._employeeName}: Leave Request (${request.type})`
                            : `${request._employeeName}: Shift Swap Request`
                          }
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {request._type === 'leave' 
                            ? `${request.startDate} - ${request.endDate}`
                            : request.reason
                          }
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => request.$id && handleApproveRequest(request.$id, request._type)}
                        className="text-green-600 border-green-200 hover:bg-green-50"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => request.$id && handleRejectRequest(request.$id, request._type)}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Today's Schedule */}
          <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-green-50/30 dark:from-slate-800 dark:to-green-900/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                <div className="p-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg">
                  <Clock className="h-5 w-5 text-white" />
                </div>
                Today&apos;s Coverage
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                On-call assignments for today
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {todaySchedule.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No shifts scheduled</p>
              ) : (
                todaySchedule.map((shift) => (
                  <div key={shift.$id} className="flex items-center justify-between p-3 rounded-lg bg-white/60 dark:bg-slate-700/30 border border-slate-200/60 dark:border-slate-600/30">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-green-500 text-white text-xs">
                          {shift._employeeName?.split(' ').map((n: string) => n[0]).join('') || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {shift._employeeName || 'Unknown'}
                        </p>
                        <Badge className={`text-xs ${
                          shift.onCallRole === 'PRIMARY' ? 'bg-green-100 text-green-800' :
                          shift.onCallRole === 'BACKUP' ? 'bg-blue-100 text-blue-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {shift.onCallRole}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Manager Superpowers */}
        <Card className="border-0 shadow-lg bg-gradient-to-br from-white to-purple-50/30 dark:from-slate-800 dark:to-purple-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <Shield className="h-5 w-5 text-purple-600" />
              Manager Controls
            </CardTitle>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Advanced management tools and quick actions
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button 
              onClick={() => router.push('/team')}
              className="flex flex-col items-center gap-2 h-auto py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              <UserPlus className="h-6 w-6" />
              <span className="text-xs">Manage Team</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/schedule')}
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-green-50 hover:border-green-200 hover:text-green-700 dark:hover:bg-green-900/20"
            >
              <CalendarPlus className="h-6 w-6" />
              <span className="text-xs">Schedule Shifts</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/leaves')}
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 dark:hover:bg-orange-900/20"
            >
              <FileText className="h-6 w-6" />
              <span className="text-xs">Manage Leaves</span>
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/swaps')}
              className="flex flex-col items-center gap-2 h-auto py-4 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 dark:hover:bg-purple-900/20"
            >
              <RotateCcw className="h-6 w-6" />
              <span className="text-xs">Manage Swaps</span>
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
