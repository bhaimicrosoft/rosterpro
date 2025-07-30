'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clock, Plus, CheckCircle, XCircle, Filter, Download, CalendarDays, User, AlertCircle, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { LeaveRequest, User as UserType } from '@/types';
import { leaveService, userService } from '@/lib/appwrite/database';
import { notificationService } from '@/lib/appwrite/database';
import { useToast } from '@/hooks/use-toast';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

export default function LeavesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequest[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [newRequest, setNewRequest] = useState({
    startDate: '',
    endDate: '',
    type: 'PAID' as 'PAID' | 'SICK' | 'COMP_OFF',
    reason: '',
  });
  const [dateConflictWarning, setDateConflictWarning] = useState<string>('');

  const fetchLeaveData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      let requests: LeaveRequest[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await leaveService.getLeaveRequestsByUser(user.$id);
      } else {
        requests = await leaveService.getAllLeaveRequests();
        users = await userService.getAllUsers();
        setTeamMembers(users);
      }
      
      setLeaveRequests(requests);
      setFilteredRequests(requests);
    } catch {
      
      setLeaveRequests([]);
      setFilteredRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Silent refresh without loading spinner (for real-time fallback)
  const silentRefreshLeaveData = useCallback(async () => {
    if (!user) return;

    try {
      
      
      let requests: LeaveRequest[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await leaveService.getLeaveRequestsByUser(user.$id);
      } else {
        requests = await leaveService.getAllLeaveRequests();
        users = await userService.getAllUsers();
      }

      setLeaveRequests(requests);
      setTeamMembers(users);
      
    } catch {
      
    }
  }, [user]);

  useEffect(() => {
    fetchLeaveData();
  }, [fetchLeaveData]);

  // Real-time subscriptions for leave requests with instant updates
  useEffect(() => {
    if (!user) return;

    
    
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.LEAVES}.documents`,
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
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : 'DELETE';
          
          // Only process events for requests that should be visible to current user
          const shouldProcessEvent = user.role === 'EMPLOYEE' 
            ? payload.userId === user.$id 
            : true; // Managers see all requests
          
          if (!shouldProcessEvent) {
            return;
          }
          
          try {
            if (hasCreateEvent || hasUpdateEvent) {
              // For CREATE/UPDATE: Update leave requests directly
              setLeaveRequests(prevRequests => {
                // Remove any existing request with the same ID to prevent duplicates
                const filteredRequests = prevRequests.filter(lr => lr.$id !== payload.$id);
                if (eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) {
                  const newRequest: LeaveRequest = {
                    $id: payload.$id,
                    userId: payload.userId,
                    startDate: payload.startDate,
                    endDate: payload.endDate,
                    type: payload.type,
                    reason: payload.reason,
                    status: payload.status || 'PENDING',
                    managerComment: payload.managerComment || '',
                    $createdAt: payload.$createdAt || new Date().toISOString(),
                    $updatedAt: payload.$updatedAt || new Date().toISOString()
                  };
                  
                  // Add to beginning to maintain chronological order (newest first)
                  return [newRequest, ...filteredRequests];
                }
                return filteredRequests;
              });
            } else if (hasDeleteEvent) {
              // For DELETE: Remove leave request directly
              setLeaveRequests(prevRequests => {
                const filtered = prevRequests.filter(lr => lr.$id !== payload.$id);
                return filtered;
              });
            }
            
            // Show toast notification (less frequent to avoid spam)
            if (Math.random() < 0.3) { // Only show 30% of the time to reduce notification spam
              const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
              toast({
                title: "Leave Requests Updated",
                description: `Leave request ${eventTypeText} instantly`,
                duration: 2000,
                variant: "info",
              });
            }
            
          } catch {
            
            // Fallback to silent refresh only if instant update fails
            setTimeout(() => {
              silentRefreshLeaveData();
            }, 100);
          }
        }
      }
    );

    return () => {
      
      unsubscribe();
    };
  }, [user, toast, silentRefreshLeaveData]);

  const refreshLeaveData = async () => {
    setIsRefreshing(true);
    try {
      await fetchLeaveData();
      toast({
        title: "Data Refreshed",
        description: "Leave requests have been updated successfully.",
        duration: 2000,
      });
    } catch {
      
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh leave data. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let filtered = leaveRequests;
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(req => req.status === filterStatus);
    }
    
    if (filterType !== 'all') {
      filtered = filtered.filter(req => req.type === filterType);
    }
    
    setFilteredRequests(filtered);
  }, [leaveRequests, filterStatus, filterType]);

  // Check if a date range conflicts with existing active leaves
  const checkDateConflict = useCallback((startDate: string, endDate: string) => {
    if (!user || !startDate || !endDate) return null;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const conflictingLeave = leaveRequests.find(request => {
      // Only check active requests (not rejected or cancelled)
      if (request.userId !== user.$id || request.status === 'REJECTED' || request.status === 'CANCELLED') {
        return false;
      }
      
      const existingStart = new Date(request.startDate);
      const existingEnd = new Date(request.endDate);
      
      // Check if dates overlap
      return (start <= existingEnd && end >= existingStart);
    });
    
    return conflictingLeave;
  }, [leaveRequests, user]);

  // Handle date changes with conflict checking
  const handleStartDateChange = useCallback((date: string) => {
    setNewRequest(prev => ({ ...prev, startDate: date }));
    
    // Check for conflicts if end date is also set
    if (newRequest.endDate && date) {
      const conflict = checkDateConflict(date, newRequest.endDate);
      if (conflict) {
        setDateConflictWarning(`Conflicts with ${conflict.status.toLowerCase()} ${conflict.type.toLowerCase().replace('_', ' ')} leave from ${conflict.startDate} to ${conflict.endDate}`);
      } else {
        setDateConflictWarning('');
      }
    }
  }, [newRequest.endDate, checkDateConflict]);

  const handleEndDateChange = useCallback((date: string) => {
    setNewRequest(prev => ({ ...prev, endDate: date }));
    
    // Check for conflicts if start date is also set
    if (newRequest.startDate && date) {
      const conflict = checkDateConflict(newRequest.startDate, date);
      if (conflict) {
        setDateConflictWarning(`Conflicts with ${conflict.status.toLowerCase()} ${conflict.type.toLowerCase().replace('_', ' ')} leave from ${conflict.startDate} to ${conflict.endDate}`);
      } else {
        setDateConflictWarning('');
      }
    }
  }, [newRequest.startDate, checkDateConflict]);

  const handleSubmitRequest = async () => {
    if (!user || !newRequest.startDate || !newRequest.endDate || !newRequest.reason) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      // Calculate number of days requested
      const startDate = new Date(newRequest.startDate);
      const endDate = new Date(newRequest.endDate);
      const timeDiff = endDate.getTime() - startDate.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end date

      // Validate date range
      if (startDate > endDate) {
        toast({
          title: "Invalid Date Range",
          description: "End date must be after or equal to start date",
          variant: "destructive",
        });
        return;
      }

      // Validate leave balance
      const availableLeaves = newRequest.type === 'PAID' ? (user.paidLeaves || 0) : 
                             newRequest.type === 'SICK' ? (user.sickLeaves || 0) : 
                             (user.compOffs || 0);

      if (availableLeaves === 0) {
        toast({
          title: "No Leave Days Available",
          description: `You have no ${newRequest.type.toLowerCase().replace('_', ' ')} days remaining`,
          variant: "destructive",
        });
        return;
      }

      if (daysDiff > availableLeaves) {
        toast({
          title: "Insufficient Leave Balance",
          description: `You requested ${daysDiff} days but only have ${availableLeaves} ${newRequest.type.toLowerCase().replace('_', ' ')} days available`,
          variant: "destructive",
        });
        return;
      }

      // Check for overlapping leave requests using the new helper function
      const conflictingLeave = checkDateConflict(newRequest.startDate, newRequest.endDate);
      if (conflictingLeave) {
        const conflictType = conflictingLeave.status === 'PENDING' ? 'pending' : 'approved';
        toast({
          title: "Date Conflict",
          description: `You already have a ${conflictType} ${conflictingLeave.type.toLowerCase().replace('_', ' ')} leave request from ${conflictingLeave.startDate} to ${conflictingLeave.endDate}`,
          variant: "destructive",
        });
        return;
      }

      // All validations passed, create the request
      const request = await leaveService.createLeaveRequest({
        userId: user.$id,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        type: newRequest.type,
        reason: newRequest.reason,
        status: 'PENDING',
      });

      // Send notification to manager if manager ID exists
      if (user.manager) {
        try {
          await notificationService.createNotification({
            userId: user.manager,
            type: 'LEAVE_REQUEST',
            title: 'New Leave Request',
            message: `${user.firstName} ${user.lastName} has requested ${newRequest.type.toLowerCase().replace('_', ' ')} leave from ${newRequest.startDate} to ${newRequest.endDate}`,
            read: false
          });
        } catch (error) {
          console.error('Failed to send notification to manager:', error);
          // Don't block the leave request if notification fails
        }
      }

      setLeaveRequests(prev => [request, ...prev]);
      setNewRequest({
        startDate: '',
        endDate: '',
        type: 'PAID',
        reason: '',
      });
      setDateConflictWarning(''); // Clear any conflict warning
      setIsDialogOpen(false);
      
      toast({
        title: "Leave Request Submitted",
        description: `Your ${newRequest.type.toLowerCase().replace('_', ' ')} request for ${daysDiff} day${daysDiff > 1 ? 's' : ''} has been submitted`,
        variant: "success",
      });
    } catch (error) {
      console.error('Error submitting leave request:', error);
      toast({
        title: "Submission Failed",
        description: "Failed to submit leave request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleApproveRequest = useCallback(async (requestId: string) => {
    console.log('🚀 === handleApproveRequest CALLED with requestId:', requestId);
    console.log('🚀 User role:', user?.role);
    if (user?.role === 'EMPLOYEE') {
      console.log('🚀 User is EMPLOYEE, returning early');
      return;
    }

    try {
      // Find the request to get employee info and details
      const request = leaveRequests.find(req => req.$id === requestId);
      if (!request) {
        console.log('🚀 Request not found in leaveRequests array');
        return;
      }

      console.log('🚀 Found request:', request);
      console.log('🚀 leaveService object:', leaveService);
      console.log('🚀 leaveService.approveLeaveRequest method:', leaveService.approveLeaveRequest);
      console.log('🚀 About to call leaveService.approveLeaveRequest...');

      // Use the updated approval method that deducts leave balance
      await leaveService.approveLeaveRequest(requestId);
      
      console.log('🚀 leaveService.approveLeaveRequest completed successfully');

      setLeaveRequests(prev => prev.map(req => 
        req.$id === requestId ? { ...req, status: 'APPROVED' as const } : req
      ));

      // Send notification to employee
      try {
        const employee = teamMembers.find(member => member.$id === request.userId) || 
                        await userService.getUserById(request.userId);
        
        if (employee) {
          await notificationService.createNotification({
            userId: request.userId,
            type: 'LEAVE_APPROVED',
            title: 'Leave Request Approved',
            message: `Your ${request.type.toLowerCase().replace('_', ' ')} leave request from ${request.startDate} to ${request.endDate} has been approved`,
            read: false
          });
        }
      } catch (error) {
        console.error('Failed to send approval notification:', error);
      }

      // Calculate days for the toast message
      const startDate = new Date(request.startDate);
      const endDate = new Date(request.endDate);
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 3600 * 24)) + 1;

      toast({
        title: "Leave request approved",
        description: `The leave request has been approved and ${daysDiff} day${daysDiff > 1 ? 's' : ''} have been deducted from the employee's ${request.type.toLowerCase().replace('_', ' ')} balance.`,
        variant: "success",
      });
    } catch (error) {
      console.error('🚀 Error approving leave request:', error);
      toast({
        title: "Approval Failed",
        description: "Failed to approve leave request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user?.role, leaveRequests, teamMembers, toast]);

  const handleRejectRequest = useCallback(async (requestId: string) => {
    if (user?.role === 'EMPLOYEE') return;

    try {
      // Find the request to get employee info and details
      const request = leaveRequests.find(req => req.$id === requestId);
      if (!request) return;

      await leaveService.updateLeaveRequest(requestId, { status: 'REJECTED' });
      setLeaveRequests(prev => prev.map(req => 
        req.$id === requestId ? { ...req, status: 'REJECTED' as const } : req
      ));

      // Send notification to employee
      try {
        await notificationService.createNotification({
          userId: request.userId,
          type: 'LEAVE_REJECTED',
          title: 'Leave Request Rejected',
          message: `Your ${request.type.toLowerCase().replace('_', ' ')} leave request from ${request.startDate} to ${request.endDate} has been rejected`,
          read: false
        });
      } catch (error) {
        console.error('Failed to send rejection notification:', error);
      }

      toast({
        title: "Leave request rejected",
        description: "The leave request has been rejected.",
        variant: "info",
      });
    } catch (error) {
      console.error('Error rejecting leave request:', error);
      toast({
        title: "Rejection Failed",
        description: "Failed to reject leave request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user?.role, leaveRequests, toast]);

  const handleCancelRequest = useCallback(async (requestId: string) => {
    try {
      await leaveService.updateLeaveRequest(requestId, { status: 'CANCELLED' });
      setLeaveRequests(prev => prev.map(req => 
        req.$id === requestId ? { ...req, status: 'CANCELLED' as const } : req
      ));
      
      toast({
        title: "Leave request cancelled",
        description: "Your leave request has been cancelled successfully.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to cancel leave request. Please try again.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const getUserName = (userId: string) => {
    const foundUser = teamMembers.find(member => member.$id === userId);
    return foundUser ? `${foundUser.firstName} ${foundUser.lastName}` : 'Unknown User';
  };

  const calculateLeaveDays = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const formatOptions: Intl.DateTimeFormatOptions = { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    };
    
    const formattedStart = start.toLocaleDateString('en-US', formatOptions);
    const formattedEnd = end.toLocaleDateString('en-US', formatOptions);
    
    return `${formattedStart} to ${formattedEnd}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-500';
      case 'REJECTED': return 'bg-red-500';
      case 'PENDING': return 'bg-yellow-500';
      case 'CANCELLED': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'PAID': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SICK': return 'bg-red-100 text-red-800 border-red-200';
      case 'COMP_OFF': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const exportLeaveData = () => {
    const csvContent = [
      'Employee,Start Date,End Date,Type,Status,Days,Reason',
      ...filteredRequests.map(req => 
        `"${user?.role === 'EMPLOYEE' ? 'Me' : getUserName(req.userId)}","${req.startDate}","${req.endDate}","${req.type}","${req.status}","${calculateLeaveDays(req.startDate, req.endDate)}","${req.reason}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leave-requests-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Please log in to view leave requests.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-400 dark:via-green-400 dark:to-teal-400">
              Leave Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              {user.role === 'EMPLOYEE' ? 'Manage your leave requests and view balances' : 'Manage team leave requests and approvals'}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={refreshLeaveData}
              disabled={isRefreshing}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportLeaveData} className="w-full sm:w-auto">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            {user.role === 'EMPLOYEE' && (
              <Button onClick={() => setIsDialogOpen(true)} className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700">
                <Plus className="h-4 w-4 mr-2" />
                Request Leave
              </Button>
            )}
          </div>
        </div>

        {/* Leave Balance Cards (for employees) */}
        {user.role === 'EMPLOYEE' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Paid Leaves</CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{user.paidLeaves || 0}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">days remaining</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-red-500 to-red-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Sick Leaves</CardTitle>
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20">
                  <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{user.sickLeaves || 0}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">days remaining</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800 sm:col-span-2 lg:col-span-1">
              <div className="h-1 bg-gradient-to-r from-purple-500 to-purple-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Comp Offs</CardTitle>
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <CalendarDays className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{user.compOffs || 0}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">days available</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-full sm:w-32">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="PAID">Paid Leave</SelectItem>
                    <SelectItem value="SICK">Sick Leave</SelectItem>
                    <SelectItem value="COMP_OFF">Comp Off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground sm:ml-auto">
                Showing {filteredRequests.length} of {leaveRequests.length} requests
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leave Requests - Tabbed Interface */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {user.role === 'EMPLOYEE' ? 'My Leave Requests' : 'Team Leave Requests'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Clock className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Loading leave requests...</p>
                </div>
              </div>
            ) : (
              <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pending" className="flex items-center gap-2">
                    Pending
                    <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                      {filteredRequests.filter(req => req.status === 'PENDING').length}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="actioned" className="flex items-center gap-2">
                    Actioned
                    <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs font-medium">
                      {filteredRequests.filter(req => req.status === 'APPROVED' || req.status === 'REJECTED' || req.status === 'CANCELLED').length}
                    </span>
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="pending" className="mt-6">
                  {filteredRequests.filter(req => req.status === 'PENDING').length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">No pending leave requests</p>
                      <p className="text-sm text-muted-foreground">
                        {user.role === 'EMPLOYEE' ? 'All your requests have been processed' : 'No pending requests to review'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredRequests.filter(req => req.status === 'PENDING').map((request) => (
                        <div key={request.$id} className="flex flex-col lg:flex-row lg:items-center justify-between p-4 sm:p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 gap-4">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <span className="font-semibold text-base sm:text-lg break-words">
                                {formatDateRange(request.startDate, request.endDate)}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Badge className={`${getTypeColor(request.type)} border`}>
                                  {request.type.charAt(0).toUpperCase() + request.type.slice(1)} Leave
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  ({calculateLeaveDays(request.startDate, request.endDate)} days)
                                </span>
                              </div>
                            </div>
                            {user.role !== 'EMPLOYEE' && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span className="break-words">{getUserName(request.userId)}</span>
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded break-words">
                              {request.reason}
                            </p>
                            {request.managerComment && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manager Comment:</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded break-words">
                                  {request.managerComment}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 lg:ml-4">
                            <Badge 
                              className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1 w-fit`}
                            >
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                            {user.role !== 'EMPLOYEE' ? (
                              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <Button
                                  size="sm"
                                  onClick={() => handleApproveRequest(request.$id)}
                                  className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleRejectRequest(request.$id)}
                                  className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <div className="w-full sm:w-auto">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCancelRequest(request.$id)}
                                  className="border-red-300 text-red-600 hover:bg-red-50 w-full sm:w-auto"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Cancel Request
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="actioned" className="mt-6">
                  {filteredRequests.filter(req => req.status === 'APPROVED' || req.status === 'REJECTED' || req.status === 'CANCELLED').length === 0 ? (
                    <div className="text-center py-12">
                      <CalendarDays className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">No actioned leave requests</p>
                      <p className="text-sm text-muted-foreground">
                        Processed requests will appear here
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredRequests.filter(req => req.status === 'APPROVED' || req.status === 'REJECTED' || req.status === 'CANCELLED').map((request) => (
                        <div key={request.$id} className="flex flex-col lg:flex-row lg:items-center justify-between p-4 sm:p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 gap-4">
                          <div className="space-y-2 flex-1 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                              <span className="font-semibold text-base sm:text-lg break-words">
                                {formatDateRange(request.startDate, request.endDate)}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <Badge className={`${getTypeColor(request.type)} border`}>
                                  {request.type.charAt(0).toUpperCase() + request.type.slice(1)} Leave
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  ({calculateLeaveDays(request.startDate, request.endDate)} days)
                                </span>
                              </div>
                            </div>
                            {user.role !== 'EMPLOYEE' && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span className="break-words">{getUserName(request.userId)}</span>
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded break-words">
                              {request.reason}
                            </p>
                            {request.managerComment && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manager Comment:</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded break-words">
                                  {request.managerComment}
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-3">
                            <Badge 
                              className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1 w-fit`}
                            >
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </Badge>
                            {/* Allow employees to cancel approved leaves if future-dated */}
                            {user.role === 'EMPLOYEE' && request.status === 'APPROVED' && request.userId === user.$id && (
                              (() => {
                                const startDate = new Date(request.startDate);
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                return startDate > today;
                              })() && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCancelRequest(request.$id)}
                                  className="border-red-300 text-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Cancel
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Create Request Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-semibold">Request Leave</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {/* Show existing leave dates warning */}
              {leaveRequests.some(req => req.status !== 'REJECTED') && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm font-medium">Note:</span>
                  </div>
                  <p className="text-sm text-amber-700 mt-1">
                    You cannot request leave for dates that overlap with existing approved or pending requests.
                  </p>
                </div>
              )}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startDate" className="text-sm font-medium">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={newRequest.startDate}
                    min={new Date().toISOString().split('T')[0]} // Prevent past dates
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="endDate" className="text-sm font-medium">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={newRequest.endDate}
                    min={newRequest.startDate || new Date().toISOString().split('T')[0]} // End date must be >= start date
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
              
              {dateConflictWarning && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <div className="flex items-center">
                    <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                    <p className="text-sm text-red-800 font-medium">Date Conflict</p>
                  </div>
                  <p className="text-sm text-red-700 mt-1">{dateConflictWarning}</p>
                </div>
              )}
              
              <div>
                <Label htmlFor="leaveType" className="text-sm font-medium">Leave Type</Label>
                <Select value={newRequest.type} onValueChange={(value: 'PAID' | 'SICK' | 'COMP_OFF') => setNewRequest(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PAID" disabled={user?.paidLeaves === 0}>
                      <div className="flex items-center justify-between w-full">
                        <span>Paid Leave</span>
                        <Badge variant={user?.paidLeaves === 0 ? "destructive" : "secondary"} className="ml-2">
                          {user?.paidLeaves || 0} days left
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="SICK" disabled={user?.sickLeaves === 0}>
                      <div className="flex items-center justify-between w-full">
                        <span>Sick Leave</span>
                        <Badge variant={user?.sickLeaves === 0 ? "destructive" : "secondary"} className="ml-2">
                          {user?.sickLeaves || 0} days left
                        </Badge>
                      </div>
                    </SelectItem>
                    <SelectItem value="COMP_OFF" disabled={user?.compOffs === 0}>
                      <div className="flex items-center justify-between w-full">
                        <span>Comp Off</span>
                        <Badge variant={user?.compOffs === 0 ? "destructive" : "secondary"} className="ml-2">
                          {user?.compOffs || 0} days left
                        </Badge>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* Show warning if selected leave type has no days */}
                {((newRequest.type === 'PAID' && user?.paidLeaves === 0) ||
                  (newRequest.type === 'SICK' && user?.sickLeaves === 0) ||
                  (newRequest.type === 'COMP_OFF' && user?.compOffs === 0)) && (
                  <div className="mt-2 flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="h-4 w-4" />
                    <span>You have no {newRequest.type.toLowerCase().replace('_', ' ')} days remaining</span>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="reason" className="text-sm font-medium">Reason</Label>
                <Textarea
                  id="reason"
                  value={newRequest.reason}
                  onChange={(e) => setNewRequest(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Please provide a reason for your leave request"
                  className="mt-1 min-h-[100px] resize-none"
                />
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => {
                  setIsDialogOpen(false);
                  setDateConflictWarning(''); // Clear warning when closing dialog
                }} className="w-full sm:w-auto">
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitRequest}
                  disabled={!newRequest.startDate || !newRequest.endDate || !newRequest.reason || !!dateConflictWarning}
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                >
                  Submit Request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
