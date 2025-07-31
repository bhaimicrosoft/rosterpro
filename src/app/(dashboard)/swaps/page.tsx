'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, CheckCircle, XCircle, Calendar, Clock, ArrowLeftRight, User, Filter, Download } from 'lucide-react';
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
  const [filteredIncomingRequests, setFilteredIncomingRequests] = useState<SwapRequest[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [targetPersonShifts, setTargetPersonShifts] = useState<Shift[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResponseDialogOpen, setIsResponseDialogOpen] = useState(false);
  const [selectedSwapRequest, setSelectedSwapRequest] = useState<(SwapRequest & { _responseAction?: 'accept' | 'decline' }) | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [newSwapRequest, setNewSwapRequest] = useState({
    myShiftId: '',
    targetUserId: '',
    targetShiftId: '',
    reason: '',
  });

  const fetchSwapData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      let requests: SwapRequest[] = [];
      let incomingRequests: SwapRequest[] = [];
      let shifts: Shift[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await swapService.getSwapRequestsByUser(user.$id);
        // Filter out only requests made BY this user (where they are the requester)
        requests = requests.filter(req => req.requesterUserId === user.$id);
        
        // Get swap requests directed at this employee (where they are the target)
        const allRequests = await swapService.getAllSwapRequests();
        incomingRequests = allRequests.filter(req => 
          req.targetUserId === user.$id && req.requesterUserId !== user.$id
        );
        shifts = await shiftService.getShiftsByUser(user.$id);
        
        // Filter to only include current and future shifts
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        shifts = shifts.filter(shift => shift.date >= todayString);
        // Employees also need access to team members for swap target selection
        users = await userService.getAllUsers();
        // Exclude self, managers, and system administrators from target list
        setTeamMembers(users.filter(u => 
          u.$id !== user.$id && 
          u.role !== 'MANAGER' && 
          u.role !== 'ADMIN'
        ));
      } else {
        requests = await swapService.getAllSwapRequests();
        users = await userService.getAllUsers();
        setTeamMembers(users);
      }
      
      setSwapRequests(requests);
      setIncomingSwapRequests(incomingRequests);
      setFilteredRequests(requests);
      setFilteredIncomingRequests(incomingRequests);
      setMyShifts(shifts);
    } catch {
      
      setSwapRequests([]);
      setIncomingSwapRequests([]);
      setFilteredRequests([]);
      setFilteredIncomingRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Silent refresh without loading spinner (for real-time fallback)
  const silentRefreshSwapData = useCallback(async () => {
    if (!user) return;

    try {
      
      
      let requests: SwapRequest[] = [];
      let incomingRequests: SwapRequest[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await swapService.getSwapRequestsByUser(user.$id);
        // Filter out only requests made BY this user (where they are the requester)
        requests = requests.filter(req => req.requesterUserId === user.$id);
        
        // Get swap requests directed at this employee (where they are the target)
        const allRequests = await swapService.getAllSwapRequests();
        incomingRequests = allRequests.filter(req => 
          req.targetUserId === user.$id && req.requesterUserId !== user.$id
        );
        users = await userService.getAllUsers();
        setTeamMembers(users.filter(u => u.$id !== user.$id)); // Exclude self from target list
      } else {
        requests = await swapService.getAllSwapRequests();
        users = await userService.getAllUsers();
        setTeamMembers(users);
      }

      setSwapRequests(requests);
      setIncomingSwapRequests(incomingRequests);
      
    } catch {
      
    }
  }, [user]);

  useEffect(() => {
    fetchSwapData();
  }, [fetchSwapData]);

  useEffect(() => {
    let filtered = swapRequests;
    let filteredIncoming = incomingSwapRequests;
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(req => req.status === filterStatus);
      filteredIncoming = filteredIncoming.filter(req => req.status === filterStatus);
    }
    
    setFilteredRequests(filtered);
    setFilteredIncomingRequests(filteredIncoming);
  }, [swapRequests, incomingSwapRequests, filterStatus]);

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
            // Handle swap request updates
            if (events.some((e: string) => e.includes('swap'))) {
              if (hasCreateEvent || hasUpdateEvent) {
                // For CREATE/UPDATE: Update swap requests directly
                setSwapRequests(prevRequests => {
                  const filteredRequests = prevRequests.filter(sr => sr.$id !== payload.$id);
                  // Only add if this is the user's outgoing request (they are the requester)
                  if ((eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) &&
                      payload.requesterUserId === user.$id) {
                    const newRequest: SwapRequest = {
                      $id: payload.$id,
                      requesterUserId: payload.requesterUserId,
                      targetUserId: payload.targetUserId || '',
                      requesterShiftId: payload.requesterShiftId || payload.myShiftId,
                      targetShiftId: payload.targetShiftId || payload.theirShiftId || '',
                      reason: payload.reason,
                      status: payload.status || 'PENDING',
                      responseNotes: payload.responseNotes || '',
                      managerComment: payload.managerComment || '',
                      requestedAt: payload.requestedAt || new Date().toISOString(),
                      respondedAt: payload.respondedAt,
                      $createdAt: payload.$createdAt || new Date().toISOString(),
                      $updatedAt: payload.$updatedAt || new Date().toISOString()
                    };
                    
                    return [...filteredRequests, newRequest];
                  }
                  return filteredRequests;
                });

                // Also update incoming requests for employees
                if (user?.role === 'EMPLOYEE') {
                  setIncomingSwapRequests(prevRequests => {
                    const filteredRequests = prevRequests.filter(sr => sr.$id !== payload.$id);
                    // Only add if this is PENDING and directed at this user
                    if ((eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status === 'PENDING')) &&
                        payload.targetUserId === user.$id && payload.requesterUserId !== user.$id) {
                      const newRequest: SwapRequest = {
                        $id: payload.$id,
                        requesterUserId: payload.requesterUserId,
                        targetUserId: payload.targetUserId || '',
                        requesterShiftId: payload.requesterShiftId || payload.myShiftId,
                        targetShiftId: payload.targetShiftId || payload.theirShiftId || '',
                        reason: payload.reason,
                        status: payload.status || 'PENDING',
                        responseNotes: payload.responseNotes || '',
                        managerComment: payload.managerComment || '',
                        requestedAt: payload.requestedAt || new Date().toISOString(),
                        respondedAt: payload.respondedAt,
                        $createdAt: payload.$createdAt || new Date().toISOString(),
                        $updatedAt: payload.$updatedAt || new Date().toISOString()
                      };
                      
                      return [newRequest, ...filteredRequests];
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

                // Also remove from incoming requests
                if (user?.role === 'EMPLOYEE') {
                  setIncomingSwapRequests(prevRequests => {
                    const filtered = prevRequests.filter(sr => sr.$id !== payload.$id);
                    
                    return filtered;
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
  }, [user, toast, silentRefreshSwapData]);

  // Fetch target person's available shifts when they're selected
  const fetchTargetPersonShifts = useCallback(async (targetUserId: string) => {
    if (!targetUserId) {
      setTargetPersonShifts([]);
      return;
    }

    try {
      // Get all shifts for the target person
      const allShifts = await shiftService.getShiftsByUser(targetUserId);
      
      // Filter to only include current and future shifts
      const today = new Date();
      const todayString = today.toISOString().split('T')[0];
      const availableShifts = allShifts.filter(shift => shift.date >= todayString);
      
      setTargetPersonShifts(availableShifts);
    } catch (error) {
      console.error('Failed to fetch target person shifts:', error);
      setTargetPersonShifts([]);
    }
  }, []);

  // Handle target person selection
  const handleTargetPersonChange = useCallback((value: string) => {
    setNewSwapRequest(prev => ({ 
      ...prev, 
      targetUserId: value,
      targetShiftId: '' // Reset target shift when person changes
    }));
    fetchTargetPersonShifts(value);
  }, [fetchTargetPersonShifts]);

  const handleSubmitSwapRequest = async () => {
    // Validate required fields: myShiftId, targetShiftId, and reason
    if (!user || !newSwapRequest.myShiftId || !newSwapRequest.targetShiftId || !newSwapRequest.reason) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields: My Shift, Target Shift, and Reason.",
        variant: "destructive",
      });
      return;
    }

    try {
      const swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'> = {
        requesterShiftId: newSwapRequest.myShiftId,
        requesterUserId: user.$id,
        targetShiftId: newSwapRequest.targetShiftId, // Now required
        reason: newSwapRequest.reason,
        status: 'PENDING',
        requestedAt: new Date().toISOString(),
        respondedAt: '', // Required field in schema, empty for new requests
      };

      // targetUserId is optional (for open swaps)
      if (newSwapRequest.targetUserId) {
        swapData.targetUserId = newSwapRequest.targetUserId;
      }

      const request = await swapService.createSwapRequest(swapData);

      // Send notification to target user if specified
      if (newSwapRequest.targetUserId) {
        try {
          // Get shift details for better notification message
          const shift = myShifts.find(s => s.$id === newSwapRequest.myShiftId);
          const shiftDate = shift ? new Date(shift.date).toLocaleDateString() : 'Unknown date';
          
          await notificationService.createNotification({
            userId: newSwapRequest.targetUserId,
            type: 'SHIFT_SWAPPED',
            title: 'New Shift Swap Request',
            message: `${user.firstName} ${user.lastName} wants to swap shifts with you for ${shiftDate}`,
            read: false
          });
        } catch (error) {
          console.error('Failed to send swap request notification:', error);
        }
      }

      setSwapRequests(prev => [request, ...prev]);
      setNewSwapRequest({
        myShiftId: '',
        targetUserId: '',
        targetShiftId: '',
        reason: '',
      });
      setIsDialogOpen(false);
      
      toast({
        title: "Swap Request Submitted",
        description: "Your shift swap request has been submitted successfully.",
        variant: "success",
      });
    } catch (error) {
      console.error('Error submitting swap request:', error);
      toast({
        title: "Submission Failed",
        description: "Failed to submit swap request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleApproveSwap = useCallback(async (swapId: string) => {
    if (user?.role === 'EMPLOYEE' || !user) return;

    try {
      // Find the swap request to get requester info
      const swapRequest = swapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      await swapService.updateSwapRequest(swapId, { status: 'APPROVED' });
      setSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'APPROVED' } : swap
      ));

      // Send notification to requester
      try {
        await notificationService.createNotification({
          userId: swapRequest.requesterUserId,
          type: 'SHIFT_SWAPPED',
          title: 'Swap Request Approved',
          message: `${user.firstName} ${user.lastName} has approved your shift swap request`,
          read: false
        });
      } catch (error) {
        console.error('Failed to send approval notification:', error);
      }

      toast({
        title: "Swap Request Approved",
        description: "The shift swap request has been approved.",
        variant: "default",
      });
    } catch (error) {
      console.error('Error approving swap request:', error);
      toast({
        title: "Approval Failed",
        description: "Failed to approve swap request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, swapRequests, toast]);

  const handleRejectSwap = useCallback(async (swapId: string) => {
    if (user?.role === 'EMPLOYEE' || !user) return;

    try {
      // Find the swap request to get requester info
      const swapRequest = swapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      await swapService.updateSwapRequest(swapId, { status: 'REJECTED' });
      setSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'REJECTED' } : swap
      ));

      // Send notification to requester
      try {
        await notificationService.createNotification({
          userId: swapRequest.requesterUserId,
          type: 'SHIFT_SWAPPED',
          title: 'Swap Request Rejected',
          message: `${user.firstName} ${user.lastName} has rejected your shift swap request`,
          read: false
        });
      } catch (error) {
        console.error('Failed to send rejection notification:', error);
      }

      toast({
        title: "Swap Request Rejected",
        description: "The shift swap request has been rejected.",
        variant: "default",
      });
    } catch (error) {
      console.error('Error rejecting swap request:', error);
      toast({
        title: "Rejection Failed",
        description: "Failed to reject swap request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, swapRequests, toast]);

  // Employee response handlers
  const handleEmployeeAcceptSwap = useCallback(async (swapId: string, notes: string = '') => {
    if (!user || user.role !== 'EMPLOYEE') return;

    try {
      const swapRequest = incomingSwapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      // Use the new approve and execute method that actually swaps the shifts
      await swapService.approveAndExecuteSwap(swapId, notes);
      
      // Update local state
      setIncomingSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'APPROVED', responseNotes: notes } : swap
      ));

      // Send notification to requester
      try {
        await notificationService.createNotification({
          userId: swapRequest.requesterUserId,
          type: 'SHIFT_SWAPPED',
          title: 'Swap Request Accepted',
          message: `${user.firstName} ${user.lastName} has accepted your shift swap request${notes ? `: ${notes}` : ''}`,
          read: false
        });
      } catch (error) {
        console.error('Failed to send acceptance notification:', error);
      }

      setIsResponseDialogOpen(false);
      setSelectedSwapRequest(null);
      setResponseNotes('');

      // Refresh user's shifts to reflect the swap
      try {
        const updatedShifts = await shiftService.getShiftsByUser(user.$id);
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        const currentFutureShifts = updatedShifts.filter(shift => shift.date >= todayString);
        setMyShifts(currentFutureShifts);
      } catch (error) {
        console.error('Failed to refresh shifts after swap:', error);
      }

      toast({
        title: "Swap Request Accepted",
        description: "You have successfully accepted the shift swap request and the shifts have been exchanged.",
        variant: "success",
      });
    } catch (error) {
      console.error('Error accepting swap request:', error);
      toast({
        title: "Acceptance Failed",
        description: "Failed to accept swap request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, incomingSwapRequests, toast]);

  const handleEmployeeRejectSwap = useCallback(async (swapId: string, notes: string = '') => {
    if (!user || user.role !== 'EMPLOYEE') return;

    try {
      const swapRequest = incomingSwapRequests.find(req => req.$id === swapId);
      if (!swapRequest) return;

      await swapService.updateSwapRequest(swapId, { 
        status: 'REJECTED',
        responseNotes: notes,
        respondedAt: new Date().toISOString()
      });
      
      // Update local state
      setIncomingSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'REJECTED', responseNotes: notes } : swap
      ));

      // Send notification to requester
      try {
        await notificationService.createNotification({
          userId: swapRequest.requesterUserId,
          type: 'SHIFT_SWAPPED',
          title: 'Swap Request Declined',
          message: `${user.firstName} ${user.lastName} has declined your shift swap request${notes ? `: ${notes}` : ''}`,
          read: false
        });
      } catch (error) {
        console.error('Failed to send rejection notification:', error);
      }

      setIsResponseDialogOpen(false);
      setSelectedSwapRequest(null);
      setResponseNotes('');

      toast({
        title: "Swap Request Declined",
        description: "You have declined the shift swap request.",
        variant: "default",
      });
    } catch (error) {
      console.error('Error rejecting swap request:', error);
      toast({
        title: "Rejection Failed",
        description: "Failed to reject swap request. Please try again.",
        variant: "destructive",
      });
    }
  }, [user, incomingSwapRequests, toast]);

  const openResponseDialog = useCallback((swapRequest: SwapRequest, action: 'accept' | 'decline') => {
    setSelectedSwapRequest({ ...swapRequest, _responseAction: action });
    setResponseNotes('');
    setIsResponseDialogOpen(true);
  }, []);

  const getUserName = (userId: string) => {
    const foundUser = teamMembers.find(member => member.$id === userId);
    return foundUser ? `${foundUser.firstName} ${foundUser.lastName}` : 'Unknown User';
  };

  const [shiftDisplayCache, setShiftDisplayCache] = useState<Record<string, string>>({});

  // Load shift display data for better UX
  const loadShiftDisplays = useCallback(async () => {
    const allShiftIds = [
      ...filteredRequests.map(req => [req.requesterShiftId, req.targetShiftId]).flat(),
      ...filteredIncomingRequests.map(req => [req.requesterShiftId, req.targetShiftId]).flat()
    ].filter(Boolean);

    const uniqueShiftIds = Array.from(new Set(allShiftIds));
    const cache: Record<string, string> = {};

    await Promise.all(
      uniqueShiftIds.map(async (shiftId) => {
        try {
          const shift = await shiftService.getShiftDetails(shiftId);
          // Format date as short format (e.g., "Aug 1" instead of "2025-08-01T07:30:00.000+00:00")
          const date = new Date(shift.date);
          const shortDate = date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });
          cache[shiftId] = `${shortDate} (${shift.onCallRole})`;
        } catch {
          cache[shiftId] = shiftId; // Fallback
        }
      })
    );

    setShiftDisplayCache(cache);
  }, [filteredRequests, filteredIncomingRequests]);

  useEffect(() => {
    if (filteredRequests.length > 0 || filteredIncomingRequests.length > 0) {
      loadShiftDisplays();
    }
  }, [filteredRequests.length, filteredIncomingRequests.length, loadShiftDisplays]);

  const getShiftDisplayText = (shiftId: string) => {
    return shiftDisplayCache[shiftId] || shiftId;
  };

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
        `"${user?.role === 'EMPLOYEE' ? 'Me' : getUserName(req.requesterUserId)}","${req.$createdAt}","${req.targetUserId ? getUserName(req.targetUserId) : 'Open'}","${req.reason}","${req.status}","${req.requesterShiftId}","${req.targetShiftId || 'N/A'}"`
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
        <div className="flex items-center justify-between">
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
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">My Pending</CardTitle>
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {swapRequests.filter(req => req.status === 'PENDING').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">my requests</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-orange-500 to-red-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">For Me</CardTitle>
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/20">
                  <User className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {incomingSwapRequests.filter(req => req.status === 'PENDING').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">need response</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden bg-white dark:bg-slate-800">
              <div className="h-1 bg-gradient-to-r from-green-500 to-emerald-600" />
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">Successful</CardTitle>
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/20">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {swapRequests.filter(req => req.status === 'APPROVED').length + incomingSwapRequests.filter(req => req.status === 'APPROVED').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">completed swaps</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex gap-4 items-center">
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
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-sm text-muted-foreground">
                Showing {filteredRequests.length}{user.role === 'EMPLOYEE' ? ` + ${filteredIncomingRequests.length} incoming` : ''} of {swapRequests.length}{user.role === 'EMPLOYEE' ? ` + ${incomingSwapRequests.length} incoming` : ''} requests
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Swap Requests */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              {user.role === 'EMPLOYEE' ? 'My Swap Requests' : 'Team Swap Requests'}
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
                <p className="text-sm text-muted-foreground">
                  {user.role === 'EMPLOYEE' ? 'Create your first swap request to get started' : 'No team members have requested swaps yet'}
                </p>
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
                      {user.role !== 'EMPLOYEE' && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          Requested by: {getUserName(request.requesterUserId)}
                        </div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Original Shift:</span> {getShiftDisplayText(request.requesterShiftId)}
                        {request.targetShiftId && (
                          <>
                            <span className="mx-2">→</span>
                            <span className="font-medium">Target Shift:</span> {getShiftDisplayText(request.targetShiftId)}
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        {request.reason}
                      </p>
                      {request.managerComment && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manager Comment:</p>
                          <p className="text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                            {request.managerComment}
                          </p>
                        </div>
                      )}
                      {request.responseNotes && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Response Notes:</p>
                          <p className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                            {request.responseNotes}
                          </p>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {user.role !== 'EMPLOYEE' && request.status === 'PENDING' && (
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveSwap(request.$id)}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectSwap(request.$id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incoming Swap Requests (Employee only) */}
        {user.role === 'EMPLOYEE' && (
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Swap Requests for Me
                {filteredIncomingRequests.filter(req => req.status === 'PENDING').length > 0 && (
                  <Badge className="bg-orange-500 text-white ml-2">
                    {filteredIncomingRequests.filter(req => req.status === 'PENDING').length} pending
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredIncomingRequests.length === 0 ? (
                <div className="text-center py-12">
                  <User className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium text-muted-foreground">No swap requests directed at you</p>
                  <p className="text-sm text-muted-foreground">
                    When colleagues request to swap shifts with you, they&apos;ll appear here
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredIncomingRequests.map((request) => (
                    <div key={`incoming-${request.$id}`} className="flex items-center justify-between p-6 border rounded-xl hover:shadow-md transition-shadow bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/20 dark:to-yellow-900/20">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center space-x-3">
                          <User className="h-5 w-5 text-orange-600" />
                          <span className="font-semibold text-lg">
                            Swap Request from {getUserName(request.requesterUserId)}
                          </span>
                          <Badge className={`${getStatusColor(request.status)} text-white border-0 px-3 py-1`}>
                            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Their Shift:</span> {getShiftDisplayText(request.requesterShiftId)}
                          {request.targetShiftId && (
                            <>
                              <span className="mx-2">→</span>
                              <span className="font-medium">Your Shift:</span> {getShiftDisplayText(request.targetShiftId)}
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground bg-orange-100 dark:bg-orange-800/50 p-2 rounded">
                          {request.reason}
                        </p>
                        {request.responseNotes && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Your Response:</p>
                            <p className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                              {request.responseNotes}
                            </p>
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                          {request.respondedAt && (
                            <span className="ml-4">
                              Responded on: {new Date(request.respondedAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {request.status === 'PENDING' && (
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              onClick={() => openResponseDialog(request, 'accept')}
                              className="bg-green-600 hover:bg-green-700 text-white"
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openResponseDialog(request, 'decline')}
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
            </CardContent>
          </Card>
        )}

        {/* Create Swap Request Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                    {myShifts.map((shift) => (
                      <SelectItem key={shift.$id} value={shift.$id}>
                        {shift.date} - {shift.onCallRole}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="targetUser" className="text-sm font-medium">Target Person (Optional)</Label>
                <Select value={newSwapRequest.targetUserId} onValueChange={handleTargetPersonChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Anyone can accept (leave empty)" />
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
              
              {newSwapRequest.targetUserId && (
                <div>
                  <Label htmlFor="targetShift" className="text-sm font-medium">Target Person&apos;s Shift *</Label>
                  <Select value={newSwapRequest.targetShiftId} onValueChange={(value) => setNewSwapRequest(prev => ({ ...prev, targetShiftId: value }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select target person's shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetPersonShifts.map((shift) => (
                        <SelectItem key={shift.$id} value={shift.$id}>
                          {shift.date} - {shift.onCallRole}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {targetPersonShifts.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">No available shifts found for this person.</p>
                  )}
                </div>
              )}
              
              {!newSwapRequest.targetUserId && (
                <div>
                  <Label htmlFor="openShift" className="text-sm font-medium">Target Shift (for open swap) *</Label>
                  <Select value={newSwapRequest.targetShiftId} onValueChange={(value) => setNewSwapRequest(prev => ({ ...prev, targetShiftId: value }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select any available shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {myShifts.map((shift) => (
                        <SelectItem key={shift.$id} value={shift.$id}>
                          {shift.date} - {shift.onCallRole}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">For open swaps, select any shift as the target.</p>
                </div>
              )}
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
                  disabled={!newSwapRequest.myShiftId || !newSwapRequest.targetShiftId || !newSwapRequest.reason}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                >
                  Submit Request
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Employee Response Dialog */}
        <Dialog open={isResponseDialogOpen} onOpenChange={setIsResponseDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                {selectedSwapRequest?._responseAction === 'accept' ? 'Accept' : 'Decline'} Swap Request
              </DialogTitle>
            </DialogHeader>
            {selectedSwapRequest && (
              <div className="space-y-4 pt-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Request Details:</h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium">From:</span> {getUserName(selectedSwapRequest.requesterUserId)}
                  </p>
                  <p className="text-sm text-muted-foreground mb-2">
                    <span className="font-medium">Their Shift:</span> {getShiftDisplayText(selectedSwapRequest.requesterShiftId)}
                  </p>
                  {selectedSwapRequest.targetShiftId && (
                    <p className="text-sm text-muted-foreground mb-2">
                      <span className="font-medium">Your Shift:</span> {getShiftDisplayText(selectedSwapRequest.targetShiftId)}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">Reason:</span> {selectedSwapRequest.reason}
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="responseNotes" className="text-sm font-medium">
                    Response Notes (Optional)
                  </Label>
                  <Textarea
                    id="responseNotes"
                    value={responseNotes}
                    onChange={(e) => setResponseNotes(e.target.value)}
                    placeholder={`Add any notes about your ${selectedSwapRequest?._responseAction === 'accept' ? 'acceptance' : 'rejection'}...`}
                    className="mt-1 min-h-[100px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    These notes will be shared with the requester
                  </p>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4">
                  <Button variant="outline" onClick={() => setIsResponseDialogOpen(false)}>
                    Cancel
                  </Button>
                  {selectedSwapRequest?._responseAction === 'decline' ? (
                    <Button 
                      variant="destructive"
                      onClick={() => handleEmployeeRejectSwap(selectedSwapRequest.$id, responseNotes)}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Decline Request
                    </Button>
                  ) : (
                    <Button 
                      onClick={() => handleEmployeeAcceptSwap(selectedSwapRequest.$id, responseNotes)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Accept Request
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
