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
import { useToast } from '@/hooks/use-toast';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

export default function SwapsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<SwapRequest[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [teamMembers, setTeamMembers] = useState<UserType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
      let shifts: Shift[] = [];
      let users: UserType[] = [];

      if (user.role === 'EMPLOYEE') {
        requests = await swapService.getSwapRequestsByUser(user.$id);
        shifts = await shiftService.getShiftsByUser(user.$id);
      } else {
        requests = await swapService.getAllSwapRequests();
        users = await userService.getAllUsers();
        setTeamMembers(users);
      }
      
      setSwapRequests(requests);
      setFilteredRequests(requests);
      setMyShifts(shifts);
    } catch (error) {
      console.error('Error fetching swap data:', error);
      setSwapRequests([]);
      setFilteredRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSwapData();
  }, [fetchSwapData]);

  useEffect(() => {
    let filtered = swapRequests;
    
    if (filterStatus !== 'all') {
      filtered = filtered.filter(req => req.status === filterStatus);
    }
    
    setFilteredRequests(filtered);
  }, [swapRequests, filterStatus]);

  // Real-time subscriptions for swap requests
  useEffect(() => {
    if (!user) return;

    console.log('Setting up real-time subscriptions for swap requests...');
    
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`,
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
      ],
      (response: { events: string[]; payload?: unknown }) => {
        console.log('Swap requests real-time update received:', response);
        
        // Handle different types of events
        const events = response.events || [];
        const shouldRefresh = events.some((event: string) => 
          event.includes('documents.create') ||
          event.includes('documents.update') ||
          event.includes('documents.delete')
        );

        if (shouldRefresh) {
          console.log('Refreshing swap requests data due to real-time update...');
          
          // Show a subtle notification that data is being updated
          toast({
            title: "Swap Requests Updated",
            description: "Swap request data has been updated.",
            duration: 2000,
          });
          
          // Add a small delay to ensure the database has been updated
          setTimeout(() => {
            fetchSwapData();
          }, 300);
        }
      }
    );

    return () => {
      console.log('Cleaning up swap requests real-time subscriptions...');
      unsubscribe();
    };
  }, [user, fetchSwapData, toast]);

  const handleSubmitSwapRequest = async () => {
    if (!user || !newSwapRequest.myShiftId || !newSwapRequest.reason) return;

    try {
      const swapData: Omit<SwapRequest, '$id' | '$createdAt' | '$updatedAt'> = {
        requesterShiftId: newSwapRequest.myShiftId,
        requesterUserId: user.$id,
        reason: newSwapRequest.reason,
        status: 'pending',
        requestedAt: new Date().toISOString(),
      };

      if (newSwapRequest.targetShiftId) {
        swapData.targetShiftId = newSwapRequest.targetShiftId;
      }

      if (newSwapRequest.targetUserId) {
        swapData.targetUserId = newSwapRequest.targetUserId;
      }

      const request = await swapService.createSwapRequest(swapData);

      setSwapRequests(prev => [request, ...prev]);
      setNewSwapRequest({
        myShiftId: '',
        targetUserId: '',
        targetShiftId: '',
        reason: '',
      });
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error creating swap request:', error);
    }
  };

  const handleApproveSwap = useCallback(async (swapId: string) => {
    if (user?.role === 'EMPLOYEE') return;

    try {
      await swapService.updateSwapRequest(swapId, { status: 'approved' });
      setSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'approved' } : swap
      ));
    } catch (error) {
      console.error('Error approving swap:', error);
    }
  }, [user?.role]);

  const handleRejectSwap = useCallback(async (swapId: string) => {
    if (user?.role === 'EMPLOYEE') return;

    try {
      await swapService.updateSwapRequest(swapId, { status: 'rejected' });
      setSwapRequests(prev => prev.map(swap => 
        swap.$id === swapId ? { ...swap, status: 'rejected' } : swap
      ));
    } catch (error) {
      console.error('Error rejecting swap:', error);
    }
  }, [user?.role]);

  const getUserName = (userId: string) => {
    const foundUser = teamMembers.find(member => member.$id === userId);
    return foundUser ? `${foundUser.firstName} ${foundUser.lastName}` : 'Unknown User';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-green-500';
      case 'rejected': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
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
          <div className="grid gap-4 md:grid-cols-3">
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
                  {swapRequests.filter(req => req.status === 'pending').length}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">awaiting response</p>
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
                  {swapRequests.filter(req => req.status === 'approved').length}
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
                Showing {filteredRequests.length} of {swapRequests.length} requests
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
                        <span className="font-medium">Original Shift:</span> {request.requesterShiftId}
                        {request.targetShiftId && (
                          <>
                            <span className="mx-2">→</span>
                            <span className="font-medium">Target Shift:</span> {request.targetShiftId}
                          </>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
                        {request.reason}
                      </p>
                      <div className="text-xs text-muted-foreground">
                        Requested on: {new Date(request.$createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {user.role !== 'EMPLOYEE' && request.status === 'pending' && (
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
                <Select value={newSwapRequest.targetUserId} onValueChange={(value) => setNewSwapRequest(prev => ({ ...prev, targetUserId: value }))}>
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
                  disabled={!newSwapRequest.myShiftId || !newSwapRequest.reason}
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
