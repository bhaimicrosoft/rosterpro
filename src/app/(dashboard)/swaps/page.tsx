'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Plus, CheckCircle, XCircle, Calendar, Clock, ArrowLeftRight, User, Filter, Download, Bell, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SwapRequest, Shift, User as UserType } from '@/types';
import { swapService, shiftService, userService } from '@/lib/appwrite/database';
import { notificationService } from '@/lib/appwrite/notification-service';
import { useToast } from '@/hooks/use-toast';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

export default function SwapsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [incomingSwapRequests, setIncomingSwapRequests] = useState<SwapRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<SwapRequest[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [targetShifts, setTargetShifts] = useState<Shift[]>([]);
  const [allAvailableShifts, setAllAvailableShifts] = useState<Shift[]>([]); // Store all shifts for filtering
  const [allShiftsCache, setAllShiftsCache] = useState<Shift[]>([]); // Cache all shifts we've ever seen
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [approverComment, setApproverComment] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [newSwapRequest, setNewSwapRequest] = useState({
    myShiftId: '',
    targetUserId: 'none',
    targetShiftId: 'none',
    reason: '',
  });

  const fetchSwapData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      let requests: SwapRequest[] = [];
      let shifts: Shift[] = [];
      let users: UserType[] = [];
      let allShifts: Shift[] = [];

      // Get current date for future shifts filter
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDate = tomorrow.toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1); // Get shifts for next year
      const endDate = futureDate.toISOString().split('T')[0];

      if (user.role === 'EMPLOYEE') {
        requests = await swapService.getSwapRequestsByUser(user.$id);
        // Separate outgoing requests (user is requester) from incoming requests (user is target)
        const outgoingRequests = requests.filter(req => req.requesterUserId === user.$id);
        const incomingRequests = requests.filter(req => req.targetUserId === user.$id && req.requesterUserId !== user.$id);
        
        shifts = await shiftService.getShiftsByUserFromToday(user.$id);
        // Get all team members for target selection (exclude managers and admins)
        users = await userService.getAllUsers();
        // Get all shifts from tomorrow onwards for target selection  
        allShifts = await shiftService.getShiftsByDateRange(tomorrowDate, endDate);

        // Set the separated requests
        setSwapRequests(outgoingRequests);
        setIncomingSwapRequests(incomingRequests);
        setFilteredRequests(outgoingRequests);
      } else {
        requests = await swapService.getAllSwapRequests();
        users = await userService.getAllUsers();
        // Get all shifts from tomorrow onwards for target selection
        allShifts = await shiftService.getShiftsByDateRange(tomorrowDate, endDate);

        // For managers/admins, show all requests in main view
        setSwapRequests(requests);
        setIncomingSwapRequests([]);
        setFilteredRequests(requests);
      }
      
      setMyShifts(shifts);
      setAllAvailableShifts(allShifts.filter(shift => shift.userId !== user.$id)); // Store all available shifts
      setTargetShifts(allShifts.filter(shift => shift.userId !== user.$id)); // Initially show all shifts
      
      // Cache all shifts we've seen for reliable lookup later
      setAllShiftsCache(prevCache => {
        const allShiftsData = [...shifts, ...allShifts];
        const combinedShifts = [...prevCache];
        
        // Add new shifts to cache if not already present
        allShiftsData.forEach(shift => {
          if (!combinedShifts.find(s => s.$id === shift.$id)) {
            combinedShifts.push(shift);
          } else {
            // Update existing shift with latest data
            const index = combinedShifts.findIndex(s => s.$id === shift.$id);
            if (index >= 0) {
              combinedShifts[index] = shift;
            }
          }
        });
        
        return combinedShifts;
      });
      
      // Filter team members to exclude current user, managers, and admins
      const employeeMembers = users.filter(u => 
        u.$id !== user.$id && 
        u.role === 'EMPLOYEE'
      );
      setTeamMembers(employeeMembers);
    } catch {
      
      setSwapRequests([]);
      setIncomingSwapRequests([]);
      setFilteredRequests([]);
      setMyShifts([]);
      setTeamMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Silent refresh without loading spinner (for real-time fallback)
  const silentRefreshSwapData = useCallback(async () => {
    if (!user) return;

    try {
      let requests: SwapRequest[] = [];
      let shifts: Shift[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await swapService.getSwapRequestsByUser(user.$id);
        // Separate outgoing requests (user is requester) from incoming requests (user is target)
        const outgoingRequests = requests.filter(req => req.requesterUserId === user.$id);
        const incomingRequests = requests.filter(req => req.targetUserId === user.$id && req.requesterUserId !== user.$id);
        
        // Get user's shifts from today onwards
        shifts = await shiftService.getShiftsByUserFromToday(user.$id);
        // Get all team members for target selection
        users = await userService.getAllUsers();

        setSwapRequests(outgoingRequests);
        setIncomingSwapRequests(incomingRequests);
      } else {
        requests = await swapService.getAllSwapRequests();
        users = await userService.getAllUsers();
        setSwapRequests(requests);
        setIncomingSwapRequests([]);
      }

      setMyShifts(shifts);
      // Filter team members to exclude current user, managers, and admins
      const employeeMembers = users.filter(u => 
        u.$id !== user.$id && 
        u.role === 'EMPLOYEE'
      );
      setTeamMembers(employeeMembers);
      
    } catch {
      
    }
  }, [user]);

  useEffect(() => {
    fetchSwapData();

    // Set up real-time subscriptions for swap requests, shifts, and users
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`,
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents`,
      ],
      () => {
        // Silent refresh to get updated data
        silentRefreshSwapData();
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [fetchSwapData, silentRefreshSwapData]);

  useEffect(() => {
    let filtered = swapRequests;
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(req => req.status === filterStatus);
    }
    
    setFilteredRequests(filtered);
  }, [swapRequests, filterStatus]);

  // Filter incoming swap requests based on status
  const filteredIncomingRequests = incomingSwapRequests.filter(req => 
    filterStatus === 'all' || req.status === filterStatus
  );

  // Filter target shifts based on selected target user
  const filterTargetShifts = useCallback(async (targetUserId: string) => {
    if (!user) return;
    
    try {
      if (targetUserId === 'none' || !targetUserId) {
        // Show all available shifts when no target user is selected
        setTargetShifts(allAvailableShifts);
      } else {
        // Filter shifts for the selected target user from tomorrow onwards
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowDate = tomorrow.toISOString().split('T')[0];
        
        const userShifts = await shiftService.getShiftsByUserFromToday(targetUserId);
        // Filter to only include shifts from tomorrow onwards
        const futureShifts = userShifts.filter(shift => shift.date >= tomorrowDate);
        setTargetShifts(futureShifts);
      }
    } catch {
      setTargetShifts([]);
    }
  }, [user, allAvailableShifts]);

  // Update target shifts when target user changes
  useEffect(() => {
    filterTargetShifts(newSwapRequest.targetUserId);
  }, [newSwapRequest.targetUserId, filterTargetShifts]);

  // Real-time subscriptions for swap requests with instant updates
  useEffect(() => {
    if (!user) return;

    
    
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`,
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
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : 'DELETE';
          
          
          try {
            // Handle shift updates (when shifts are swapped)
            if (events.some((e: string) => e.includes('shifts'))) {
              if (hasUpdateEvent) {
                // Update the shift in all relevant arrays
                const updatedShift: Shift = {
                  $id: payload.$id,
                  userId: payload.userId,
                  date: payload.date,
                  startTime: payload.startTime,
                  endTime: payload.endTime,
                  type: payload.type,
                  onCallRole: payload.onCallRole,
                  status: payload.status,
                  createdAt: payload.createdAt,
                  updatedAt: payload.updatedAt,
                  $createdAt: payload.$createdAt,
                  $updatedAt: payload.$updatedAt
                };

                // Update myShifts array - update the shift regardless of userId 
                setMyShifts(prevShifts => {
                  const filtered = prevShifts.filter(s => s.$id !== payload.$id);
                  // Check if this shift should be in myShifts based on current or new assignment
                  const originalShift = prevShifts.find(s => s.$id === payload.$id);
                  if (originalShift || payload.userId === user.$id) {
                    return [...filtered, updatedShift];
                  }
                  return filtered;
                });

                // Update targetShifts array - update the shift regardless of userId
                setTargetShifts(prevShifts => {
                  const filtered = prevShifts.filter(s => s.$id !== payload.$id);
                  // Check if this shift should be in targetShifts
                  const originalShift = prevShifts.find(s => s.$id === payload.$id);
                  if (originalShift) {
                    return [...filtered, updatedShift];
                  }
                  return filtered;
                });

                // Update allAvailableShifts array - update the shift regardless of userId
                setAllAvailableShifts(prevShifts => {
                  const filtered = prevShifts.filter(s => s.$id !== payload.$id);
                  // Check if this shift should be in allAvailableShifts
                  const originalShift = prevShifts.find(s => s.$id === payload.$id);
                  if (originalShift) {
                    return [...filtered, updatedShift];
                  }
                  return filtered;
                });

                // Update the all shifts cache - always update regardless of userId
                setAllShiftsCache(prevCache => {
                  const filtered = prevCache.filter(s => s.$id !== payload.$id);
                  return [...filtered, updatedShift];
                });
              }
            }
            
            // Handle swap request updates
            else if (events.some((e: string) => e.includes('swap'))) {
              if (hasCreateEvent || hasUpdateEvent) {
                // For CREATE/UPDATE: Update swap requests directly
                setSwapRequests(prevRequests => {
                  const filteredRequests = prevRequests.filter(sr => sr.$id !== payload.$id);
                  if (eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) {
                    const newRequest: SwapRequest = {
                      $id: payload.$id,
                      requesterUserId: payload.requesterUserId,
                      targetUserId: payload.targetUserId || '',
                      requesterShiftId: payload.requesterShiftId || payload.myShiftId,
                      targetShiftId: payload.targetShiftId || payload.theirShiftId || '',
                      reason: payload.reason,
                      status: payload.status || 'PENDING',
                      managerComment: payload.managerComment || '',
                      requestedAt: payload.requestedAt || new Date().toISOString(),
                      respondedAt: payload.respondedAt,
                      $createdAt: payload.$createdAt || new Date().toISOString(),
                      $updatedAt: payload.$updatedAt || new Date().toISOString()
                    };
                    
                    // Only add to outgoing requests if user is the requester
                    if (newRequest.requesterUserId === user.$id) {
                      return [...filteredRequests, newRequest];
                    }
                  }
                  return filteredRequests;
                });

                // Also update incoming requests for employees
                if (user?.role === 'EMPLOYEE') {
                  setIncomingSwapRequests(prevRequests => {
                    const filteredRequests = prevRequests.filter(sr => sr.$id !== payload.$id);
                    // Add if this request is directed at this user (regardless of status for UPDATE events)
                    if ((eventType === 'CREATE' && payload.status === 'PENDING') || 
                        (eventType === 'UPDATE')) {
                      if (payload.targetUserId === user.$id && payload.requesterUserId !== user.$id) {
                        const newRequest: SwapRequest = {
                          $id: payload.$id,
                          requesterUserId: payload.requesterUserId,
                          targetUserId: payload.targetUserId || '',
                          requesterShiftId: payload.requesterShiftId || payload.myShiftId,
                          targetShiftId: payload.targetShiftId || payload.theirShiftId || '',
                          reason: payload.reason,
                          status: payload.status || 'PENDING',
                          managerComment: payload.managerComment || '',
                          requestedAt: payload.requestedAt || new Date().toISOString(),
                          respondedAt: payload.respondedAt,
                          $createdAt: payload.$createdAt || new Date().toISOString(),
                          $updatedAt: payload.$updatedAt || new Date().toISOString()
                        };
                        
                        return [...filteredRequests, newRequest];
                      }
                    }
                    return filteredRequests;
                  });
                }
              } else if (hasDeleteEvent) {
                // For DELETE: Remove swap request directly
                setSwapRequests(prevRequests => {
                  const filtered = prevRequests.filter(sr => sr.$id !== payload.$id);
                  
                  return filtered;
                });

                // Also remove from incoming requests for employees
                if (user?.role === 'EMPLOYEE') {
                  setIncomingSwapRequests(prevRequests => {
                    return prevRequests.filter(sr => sr.$id !== payload.$id);
                  });
                }
              }
            }
            
            // Show toast notification
            const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
            const collection = events[0]?.includes('swap') ? 'Swap request' : 'Related data';
            toast({
              title: "Swap Requests Updated", 
              description: `${collection} ${eventTypeText} instantly`,
              duration: 2000,
              variant: "info",
            });
            
          } catch {
            
            // Fallback to silent refresh only if instant update fails
            setTimeout(() => {
              silentRefreshSwapData();
            }, 100);
          }
        }
      }
    );

    return () => {
      
      unsubscribe();
    };
  }, [user, toast, silentRefreshSwapData, newSwapRequest.targetUserId]);

  const handleSubmitSwapRequest = async () => {
    if (!user || !newSwapRequest.myShiftId || !newSwapRequest.reason) return;

    // Validate that target shift and user are selected
    if (newSwapRequest.targetShiftId === 'none' || newSwapRequest.targetUserId === 'none') {
      alert('Please select both a target person and a target shift');
      return;
    }

    // Validate that target shifts are available for the selected user
    if (targetShifts.length === 0) {
      alert('No valid shifts available for the selected target person');
      return;
    }

    try {
      const swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt' | 'respondedAt' | 'managerComment'> = {
        requesterShiftId: newSwapRequest.myShiftId,
        requesterUserId: user.$id,
        targetShiftId: newSwapRequest.targetShiftId,
        targetUserId: newSwapRequest.targetUserId,
        reason: newSwapRequest.reason,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
      };

      await swapService.createSwapRequest(swapData);

      // Don't manually update state - let real-time subscription handle it
      setNewSwapRequest({
        myShiftId: '',
        targetUserId: 'none',
        targetShiftId: 'none',
        reason: '',
      });
      setIsDialogOpen(false);
    } catch {
      alert('Failed to create swap request. Please try again.');
    }
  };

  // Helper to get shift date by ID
  const getShiftDateSync = useCallback((shiftId: string) => {
    // Try to find the shift in the cache first (most reliable)
    let shift = allShiftsCache.find(s => s.$id === shiftId);
    
    // If not found in cache, try to find the shift in myShifts
    if (!shift) {
      shift = myShifts.find(s => s.$id === shiftId);
    }
    
    // If not found, try targetShifts
    if (!shift) {
      shift = targetShifts.find(s => s.$id === shiftId);
    }
    
    // If still not found, try allAvailableShifts
    if (!shift) {
      shift = allAvailableShifts.find(s => s.$id === shiftId);
    }
    
    if (shift) {
      return new Date(shift.date).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    }
    
    return shiftId; // Fallback to showing the ID if date can't be found
  }, [allShiftsCache, myShifts, targetShifts, allAvailableShifts]);

  // Helper to get user name by ID
  const getUserName = useCallback((userId: string) => {
    const foundUser = teamMembers.find(member => member.$id === userId);
    return foundUser ? `${foundUser.firstName} ${foundUser.lastName}` : 'Unknown User';
  }, [teamMembers]);

  // Helper to get shift role (PRIMARY/BACKUP) by shift ID
  const getShiftRole = useCallback((shiftId: string) => {
    // Try to find the shift in the cache first (most reliable)
    let shift = allShiftsCache.find(s => s.$id === shiftId);
    
    // If not found in cache, try to find the shift in local arrays
    if (!shift) {
      shift = myShifts.find(s => s.$id === shiftId);
    }
    
    if (!shift) {
      shift = targetShifts.find(s => s.$id === shiftId);
    }
    
    if (!shift) {
      shift = allAvailableShifts.find(s => s.$id === shiftId);
    }
    
    return shift?.onCallRole || '';
  }, [allShiftsCache, myShifts, targetShifts, allAvailableShifts]);

  // Employee response handlers
  const handleEmployeeAcceptSwap = useCallback(async (swapId: string, notes = '') => {
    if (!user || user.role !== 'EMPLOYEE') return;

    try {
      const swapRequest = incomingSwapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      // Use the comment from the approver comment field if selected, otherwise use passed notes
      const comment = selectedRequestId === swapId ? approverComment.trim() : notes;

      await swapService.updateSwapRequest(swapId, { 
        status: 'APPROVED',
        responseNotes: comment,
        respondedAt: new Date().toISOString()
      });

      // Clear the comment field after successful submission
      if (selectedRequestId === swapId) {
        setApproverComment('');
        setSelectedRequestId(null);
      }

      // Don't manually update state - let real-time subscription handle it

      // Send notification to requester
      try {
        await notificationService.createSwapResponseNotification(
          swapRequest.requesterUserId,
          'APPROVED',
          getShiftDateSync(swapRequest.targetShiftId),
          swapId,
          `${user?.firstName || ''} ${user?.lastName || ''}`
        );
        
        toast({
          title: "Swap Request Accepted",
          description: "The requester has been notified of your acceptance.",
          variant: "success",
        });
      } catch {
        // Notification error - continue silently
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to accept swap request. Please try again.",
        variant: "destructive"
      });
    }
  }, [user, incomingSwapRequests, getShiftDateSync, toast, selectedRequestId, approverComment]);

  const handleEmployeeRejectSwap = useCallback(async (swapId: string, notes = '') => {
    if (!user || user.role !== 'EMPLOYEE') return;

    try {
      const swapRequest = incomingSwapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      // Use the comment from the approver comment field if selected, otherwise use passed notes
      const comment = selectedRequestId === swapId ? approverComment.trim() : notes;

      await swapService.updateSwapRequest(swapId, { 
        status: 'REJECTED',
        responseNotes: comment,
        respondedAt: new Date().toISOString()
      });

      // Clear the comment field after successful submission
      if (selectedRequestId === swapId) {
        setApproverComment('');
        setSelectedRequestId(null);
      }

      // Don't manually update state - let real-time subscription handle it

      // Send notification to requester
      try {
        await notificationService.createSwapResponseNotification(
          swapRequest.requesterUserId,
          'REJECTED',
          getShiftDateSync(swapRequest.targetShiftId),
          swapId,
          `${user?.firstName || ''} ${user?.lastName || ''}`
        );
        
        toast({
          title: "Swap Request Rejected",
          description: "The requester has been notified of your decision.",
          variant: "success",
        });
      } catch {
        // Notification error - continue silently
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to reject swap request. Please try again.",
        variant: "destructive"
      });
    }
  }, [user, incomingSwapRequests, getShiftDateSync, toast, selectedRequestId, approverComment]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'bg-green-500';
      case 'REJECTED': return 'bg-red-500';
      case 'PENDING': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const exportSwapData = () => {
    const csvContent = [
      'Requester,Request Date,Target,Reason,Status,My Shift,Target Shift',
      ...filteredRequests.map(req => 
        `"${user?.role === 'EMPLOYEE' ? 'Me' : getUserName(req.requesterUserId)}","${req.$createdAt}","${req.targetUserId ? getUserName(req.targetUserId) : 'Open'}","${req.reason}","${req.status}","${getShiftDateSync(req.requesterShiftId)}","${req.targetShiftId ? getShiftDateSync(req.targetShiftId) : 'N/A'}"`
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swap-requests-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Compute if submit button should be disabled
  const isSubmitDisabled = !newSwapRequest.myShiftId || 
                          !newSwapRequest.reason || 
                          newSwapRequest.targetUserId === 'none' || 
                          newSwapRequest.targetShiftId === 'none' ||
                          (newSwapRequest.targetUserId !== 'none' && targetShifts.length === 0);

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <ArrowLeftRight className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Please log in to view swap requests.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="grid grid-cols-1 gap-8 lg:flex lg:items-center lg:gap-4 lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
              Shift Swaps
            </h1>
            <p className="text-muted-foreground mt-1">
              {user.role === 'EMPLOYEE' ? 'Request and manage your shift swaps' : 'Manage team shift swap requests'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportSwapData}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" onClick={fetchSwapData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            {user.role === 'EMPLOYEE' && (
              <Button onClick={() => setIsDialogOpen(true)} className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700">
                <Plus className="h-4 w-4 mr-2" />
                Request Swap
              </Button>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {user.role === 'EMPLOYEE' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">My Shifts</CardTitle>
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">{myShifts.length}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">upcoming shifts</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-purple-500 to-pink-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Swaps</CardTitle>
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {swapRequests.filter(req => req.status === 'PENDING').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">awaiting response</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-orange-500 to-red-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Pending Approval From Me</CardTitle>
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20">
                  <UserCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {incomingSwapRequests.filter(req => req.status === 'PENDING').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">awaiting my action</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Successful Swaps</CardTitle>
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {swapRequests.filter(req => req.status === 'APPROVED').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">completed swaps</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center flex-wrap justify-between lg:justify-start lg:flex-nowrap">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground">
                {user.role === 'EMPLOYEE' ? (
                  <>Showing {filteredRequests.length + filteredIncomingRequests.length} of {swapRequests.length + incomingSwapRequests.length} requests</>
                ) : (
                  <>Showing {filteredRequests.length} of {swapRequests.length} requests</>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swap Requests */}
        {user.role === 'EMPLOYEE' ? (
          // Tabbed interface for employees
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Shift Swap Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="my-requests" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="my-requests" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    My Swap Requests
                    {filteredRequests.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {filteredRequests.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="awaiting-approval" className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Awaiting My Approval
                    {incomingSwapRequests.filter(req => req.status === 'PENDING').length > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {incomingSwapRequests.filter(req => req.status === 'PENDING').length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                {/* My Swap Requests Tab */}
                <TabsContent value="my-requests" className="space-y-4 mt-6">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-center">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">Loading swap requests...</p>
                      </div>
                    </div>
                  ) : filteredRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">No swap requests found</p>
                      <p className="text-sm text-muted-foreground">Create your first swap request to get started</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredRequests.map((request) => (
                        <div key={request.$id} className="flex items-center justify-between p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-3">
                              <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
                              <span className="font-semibold text-lg">
                                Shift Swap Request
                              </span>
                              <Badge className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1`}>
                                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium text-blue-700 dark:text-blue-300">Your Shift:</span> 
                              <span className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded ml-1">
                                {getShiftDateSync(request.requesterShiftId)} - {getShiftRole(request.requesterShiftId)}
                              </span>
                              {request.targetShiftId && (
                                <>
                                  <span className="mx-2">→</span>
                                  <span className="font-medium text-green-700 dark:text-green-300">Their Shift:</span>
                                  <span className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded ml-1">
                                    {getShiftDateSync(request.targetShiftId)} - {getShiftRole(request.targetShiftId)} 
                                    {request.targetUserId && (
                                      <span className="text-xs"> ({getUserName(request.targetUserId)})</span>
                                    )}
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                              <span className="font-medium">Reason:</span> {request.reason}
                            </p>
                            
                            {/* Show updated shifts after swap for approved requests */}
                            {request.status === 'APPROVED' && request.targetShiftId && (
                              <div className="mt-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center">
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  After Swap - Updated Assignments
                                </h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                  <div>
                                    <span className="font-medium text-blue-700 dark:text-blue-300">Your Updated Shift:</span> 
                                    <span className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded ml-1">
                                      {getShiftDateSync(request.targetShiftId)} - {getShiftRole(request.targetShiftId)} (You)
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-green-700 dark:text-green-300">Their Updated Shift:</span>
                                    <span className="bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded ml-1">
                                      {getShiftDateSync(request.requesterShiftId)} - {getShiftRole(request.requesterShiftId)} ({getUserName(request.targetUserId)})
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Display approver comments from responseNotes */}
                            {request.responseNotes && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Approver Comment:</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                  {request.responseNotes}
                                </p>
                              </div>
                            )}
                            
                            {/* Legacy manager comment display (fallback) */}
                            {request.managerComment && !request.responseNotes && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Approver Comment:</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                  {request.managerComment}
                                </p>
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                {/* Awaiting My Approval Tab */}
                <TabsContent value="awaiting-approval" className="space-y-4 mt-6">
                  {filteredIncomingRequests.length === 0 ? (
                    <div className="text-center py-12">
                      <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-lg font-medium text-muted-foreground">No pending requests</p>
                      <p className="text-sm text-muted-foreground">
                        You&apos;ll see swap requests from teammates here
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredIncomingRequests.map((request) => (
                        <div key={request.$id} className="flex items-center justify-between p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center space-x-3">
                              <ArrowLeftRight className="h-5 w-5 text-blue-600" />
                              <span className="font-semibold text-lg">
                                Swap Request from {getUserName(request.requesterUserId)}
                              </span>
                              <Badge className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1`}>
                                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span className="font-medium text-orange-700 dark:text-orange-300">Their Shift:</span>
                              <span className="bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded ml-1">
                                {getShiftDateSync(request.requesterShiftId)} - {getShiftRole(request.requesterShiftId)} ({getUserName(request.requesterUserId)})
                              </span>
                              <span className="mx-2">→</span>
                              <span className="font-medium text-purple-700 dark:text-purple-300">Your Shift:</span>
                              <span className="bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded ml-1">
                                {getShiftDateSync(request.targetShiftId)} - {getShiftRole(request.targetShiftId)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground bg-white/70 dark:bg-gray-800/70 p-2 rounded">
                              <span className="font-medium">Reason:</span> {request.reason}
                            </p>
                            
                            {/* Show updated shifts after swap for approved requests */}
                            {request.status === 'APPROVED' && (
                              <div className="mt-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center">
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  After Swap - Updated Assignments
                                </h4>
                                <div className="text-sm text-muted-foreground space-y-1">
                                  <div>
                                    <span className="font-medium text-purple-700 dark:text-purple-300">Your Updated Shift:</span> 
                                    <span className="bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded ml-1">
                                      {getShiftDateSync(request.requesterShiftId)} - {getShiftRole(request.requesterShiftId)} (You)
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-orange-700 dark:text-orange-300">Their Updated Shift:</span>
                                    <span className="bg-orange-100 dark:bg-orange-900/30 px-2 py-1 rounded ml-1">
                                      {getShiftDateSync(request.targetShiftId)} - {getShiftRole(request.targetShiftId)} ({getUserName(request.requesterUserId)})
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Display existing approver comments for approved/rejected requests */}
                            {request.responseNotes && request.status !== 'PENDING' && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Approver Comment:</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                                  {request.responseNotes}
                                </p>
                              </div>
                            )}
                            
                            {/* Approver Comment Section for PENDING requests */}
                            {request.status === 'PENDING' && (
                              <div className="mt-3">
                                <Label htmlFor={`approver-comment-${request.$id}`} className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                  Approver Comment (Optional):
                                </Label>
                                <Textarea
                                  id={`approver-comment-${request.$id}`}
                                  placeholder="Add your comments here..."
                                  value={selectedRequestId === request.$id ? approverComment : ''}
                                  onChange={(e) => {
                                    setSelectedRequestId(request.$id);
                                    setApproverComment(e.target.value);
                                  }}
                                  className="min-h-[60px] text-sm"
                                />
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            {request.status === 'PENDING' && (
                              <div className="flex space-x-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleEmployeeAcceptSwap(request.$id)}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleEmployeeRejectSwap(request.$id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          // Original interface for managers/admins
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5" />
                Team Swap Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">Loading swap requests...</p>
                  </div>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12">
                  <ArrowLeftRight className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">No swap requests found</p>
                  <p className="text-sm text-muted-foreground">No team members have requested swaps yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {filteredRequests.map((request) => (
                    <div key={request.$id} className="flex items-center justify-between p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center space-x-3">
                          <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
                          <span className="font-semibold text-lg">
                            Shift Swap Request
                          </span>
                          <Badge className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1`}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-5 w-5 text-slate-600" />
                          <span className='font-semibold text-amber-600'>Requested by:</span> <span className='font-bold text-purple-700'> {getUserName(request.requesterUserId)}</span>
                        </div>
                        {request.status === 'APPROVED' && request.targetUserId && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <span className='font-semibold text-green-600'>Approved by:</span> <span className='font-bold text-teal-700'> {getUserName(request.targetUserId)}</span>
                           </div>
                        )}
                        {request.status === 'REJECTED' && request.targetUserId && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <XCircle className="h-5 w-5 text-red-600" />
                            <span className='font-semibold text-red-600'>Rejected by:</span> <span className='font-bold text-orange-700'> {getUserName(request.targetUserId)}</span>
                           </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Original Shift:</span> {getShiftDateSync(request.requesterShiftId)} 
                          <span className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                            {getShiftRole(request.requesterShiftId)}
                          </span>
                          {request.targetShiftId && (
                            <>
                              <span className="mx-2">→</span>
                              <span className="font-medium">Target Shift:</span> {getShiftDateSync(request.targetShiftId)}
                              <span className="ml-2 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs font-medium">
                                {getShiftRole(request.targetShiftId)}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                          {request.reason}
                        </p>
                        
                        {/* Show updated shifts after swap for approved requests */}
                        {request.status === 'APPROVED' && request.targetShiftId && (
                          <div className="mt-3 p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-800">
                            <h4 className="text-sm font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center">
                              <CheckCircle className="h-4 w-4 mr-2" />
                              After Swap - Final Assignments
                            </h4>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div>
                                <span className="font-medium text-blue-700 dark:text-blue-300">{getUserName(request.requesterUserId)}&apos;s New Shift:</span> 
                                <span className="bg-blue-100 dark:bg-blue-900/30 px-2 py-1 rounded ml-1">
                                  {getShiftDateSync(request.targetShiftId)} - {getShiftRole(request.targetShiftId)}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-purple-700 dark:text-purple-300">{getUserName(request.targetUserId)}&apos;s New Shift:</span>
                                <span className="bg-purple-100 dark:bg-purple-900/30 px-2 py-1 rounded ml-1">
                                  {getShiftDateSync(request.requesterShiftId)} - {getShiftRole(request.requesterShiftId)}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {request.managerComment && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Approver Comment:</p>
                            <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                              {request.managerComment}
                            </p>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      {/* Managers can only view swap requests - no approval/rejection actions */}
                      <div className="flex items-center">
                        <div className="text-sm text-muted-foreground">
                          {request.status === 'PENDING' && (
                            <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                              Awaiting target user response
                            </span>
                          )}
                          {request.status === 'REJECTED' && (
                            <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                              Rejected by target user
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Swap Request Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (open) {
            // Refresh data when dialog opens to ensure latest shifts
            silentRefreshSwapData();
          }
        }}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">Request Shift Swap</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="myShift" className="text-sm font-medium">My Shift to Swap</Label>
                <Select value={newSwapRequest.myShiftId} onValueChange={(value) => setNewSwapRequest(prev => ({ ...prev, myShiftId: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select your shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {myShifts.map((shift) => {
                      const shiftDate = new Date(shift.date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      });
                      return (
                        <SelectItem key={shift.$id} value={shift.$id}>
                          {shiftDate} - {shift.onCallRole}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="targetUser" className="text-sm font-medium">Target Person (Optional)</Label>
                <Select 
                  value={newSwapRequest.targetUserId} 
                  onValueChange={(value) => {
                    setNewSwapRequest(prev => ({ 
                      ...prev, 
                      targetUserId: value,
                      targetShiftId: 'none' // Reset target shift when target user changes
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Anyone can accept (leave empty)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Anyone can accept (leave empty)</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.$id} value={member.$id}>
                        {member.firstName} {member.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="targetShift" className="text-sm font-medium">Target Shift (Optional)</Label>
                <Select value={newSwapRequest.targetShiftId} onValueChange={(value) => setNewSwapRequest(prev => ({ ...prev, targetShiftId: value }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={
                      newSwapRequest.targetUserId === 'none' 
                        ? "Any available shift (leave empty)" 
                        : targetShifts.length === 0 
                          ? "No shifts available for selected person"
                          : "Select a shift from the target person"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {targetShifts.length === 0 && newSwapRequest.targetUserId !== 'none' ? (
                      <SelectItem value="none" disabled>
                        No valid shifts available from tomorrow onwards
                      </SelectItem>
                    ) : (
                      <>
                        <SelectItem value="none">
                          {newSwapRequest.targetUserId === 'none' 
                            ? "Any available shift (leave empty)" 
                            : "Any shift from target person"}
                        </SelectItem>
                        {targetShifts.map((shift) => {
                          const shiftDate = new Date(shift.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          });
                          const assignedUser = teamMembers.find(member => member.$id === shift.userId);
                          return (
                            <SelectItem key={shift.$id} value={shift.$id}>
                              {shiftDate} - {shift.onCallRole} 
                              {newSwapRequest.targetUserId === 'none' && assignedUser && 
                                ` (${assignedUser.firstName} ${assignedUser.lastName})`
                              }
                            </SelectItem>
                          );
                        })}
                      </>
                    )}
                  </SelectContent>
                </Select>
                {newSwapRequest.targetUserId !== 'none' && targetShifts.length === 0 && (
                  <p className="text-sm text-red-600 mt-1">
                    No shifts available for the selected person from tomorrow onwards. Please select a different person.
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="reason" className="text-sm font-medium">Reason for Swap</Label>
                <Textarea
                  id="reason"
                  value={newSwapRequest.reason}
                  onChange={(e) => setNewSwapRequest(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Please provide a reason for the shift swap request"
                  className="mt-1 min-h-[100px]"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitSwapRequest}
                  disabled={isSubmitDisabled}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
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
