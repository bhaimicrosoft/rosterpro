'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { User as UserIcon, Key, Save, Loader2 } from 'lucide-react';
import { userService } from '@/lib/appwrite/database';
import { account } from '@/lib/appwrite/config';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Profile form state
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'MANAGER' | 'ADMIN',
    manager: 'none',
  });
  
  // Password form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  
  // Loading states
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Available managers (for employees)
  const [managers, setManagers] = useState<Array<{$id: string, firstName: string, lastName: string}>>([]);
  
  // Real-time user data (for live updates of leave balances)
  const [realTimeUserData, setRealTimeUserData] = useState<{
    paidLeaves?: number;
    sickLeaves?: number;
    compOffs?: number;
    firstName?: string;
    lastName?: string;
    role?: string;
    manager?: string;
  } | null>(null);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      if (!user) return;
      
      try {
        setInitialLoading(true);
        
        // Load user profile data
        setProfileData({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          role: user.role || 'EMPLOYEE',
          manager: user.manager || 'none',
        });
        
        // Load managers if user is not an admin
        if (user.role !== 'ADMIN') {
          const allUsers = await userService.getAllUsers();
          const managersList = allUsers.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN');
          setManagers(managersList);
        }
        
      } catch (error) {
        console.error('Error loading profile data:', error);
        toast({
          title: "Error",
          description: "Failed to load profile data.",
          variant: "destructive",
        });
      } finally {
        setInitialLoading(false);
      }
    };
    
    loadInitialData();
  }, [user, toast]);

  // Real-time subscription for user data updates
  useEffect(() => {
    if (!user?.$id) return;
    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents.${user.$id}`,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {
        const events = response.events || [];
        const payload = response.payload;
        
        // Check for update event
        const hasUpdateEvent = events.some((event: string) => 
          event.includes('.update') || event.includes('documents.update')
        );
        
        if (hasUpdateEvent && payload) {
          // Update real-time user data
          setRealTimeUserData({
            paidLeaves: payload.paidLeaves,
            sickLeaves: payload.sickLeaves,
            compOffs: payload.compOffs,
            firstName: payload.firstName,
            lastName: payload.lastName,
            role: payload.role,
            manager: payload.manager,
          });
          
          // Also update the form data if it changed
          setProfileData(prev => ({
            ...prev,
            firstName: payload.firstName || prev.firstName,
            lastName: payload.lastName || prev.lastName,
            role: payload.role || prev.role,
            manager: payload.manager || 'none',
          }));
          
          // Show toast notification for leave balance updates
          if (payload.paidLeaves !== undefined || payload.sickLeaves !== undefined || payload.compOffs !== undefined) {
            toast({
              title: "Leave Balances Updated",
              description: "Your leave balances have been updated in real-time.",
              className: "border-green-500 bg-green-50 text-green-900"
            });
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.$id, toast]);

  // Handle profile update
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    try {
      setProfileLoading(true);
      
      // Update user profile in database
      await userService.updateUser(user.$id, {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        role: profileData.role,
        manager: profileData.manager === 'none' ? undefined : profileData.manager || undefined,
      });
      
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      
      // Refresh the page to update the auth context
      window.location.reload();
      
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle password update
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password inputs
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "All password fields are required.",
        variant: "destructive",
      });
      return;
    }
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Validation Error",
        description: "New passwords don't match.",
        variant: "destructive",
      });
      return;
    }
    
    if (passwordData.newPassword.length < 8) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setPasswordLoading(true);
      
      // Update password using Appwrite Account API
      await account.updatePassword(passwordData.newPassword, passwordData.currentPassword);
      
      toast({
        title: "Password Updated",
        description: "Your password has been updated successfully.",
      });
      
      // Clear password form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      
    } catch (error: unknown) {
      console.error('Error updating password:', error);
      
      // Handle specific Appwrite errors
      let errorMessage = "Failed to update password. Please try again.";
      if (error && typeof error === 'object' && 'code' in error && error.code === 401) {
        errorMessage = "Current password is incorrect.";
      } else if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        errorMessage = error.message;
      }
      
      toast({
        title: "Password Update Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!user) {
    return (
      <DashboardLayout>
        <div className="container mx-auto py-6">
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-muted-foreground">Please log in to view your profile.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-2">
          <UserIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Profile Settings</h1>
        </div>
        
        {/* Profile Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your personal information. Email and username cannot be changed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email (readonly) */}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                
                {/* Username (readonly) */}
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    value={user.username}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Username cannot be changed</p>
                </div>
                
                {/* First Name */}
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={profileData.firstName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                    required
                  />
                </div>
                
                {/* Last Name */}
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={profileData.lastName}
                    onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                    required
                  />
                </div>
                
                {/* Role (readonly for non-admins) */}
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  {user.role === 'ADMIN' ? (
                    <Select
                      value={profileData.role}
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, role: value as 'EMPLOYEE' | 'MANAGER' | 'ADMIN' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EMPLOYEE">Employee</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input
                        id="role"
                        value={user.role}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Role can only be changed by administrators</p>
                    </>
                  )}
                </div>
                
                {/* Manager (for employees) */}
                {user.role === 'EMPLOYEE' && (
                  <div className="space-y-2">
                    <Label htmlFor="manager">Manager</Label>
                    <Select
                      value={profileData.manager}
                      onValueChange={(value) => setProfileData(prev => ({ ...prev, manager: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a manager" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {managers.map((manager) => (
                          <SelectItem key={manager.$id} value={manager.$id}>
                            {manager.firstName} {manager.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              <Button type="submit" disabled={profileLoading} className="w-full md:w-auto">
                {profileLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Update Profile
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Password Change Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your password for enhanced security.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    required
                  />
                </div>
                
                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
                </div>
                
                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    required
                    minLength={8}
                  />
                </div>
              </div>
              
              <Button type="submit" disabled={passwordLoading} className="w-full md:w-auto">
                {passwordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Update Password
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Your account details and leave balances.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {realTimeUserData?.paidLeaves ?? user.paidLeaves ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">Paid Leaves</div>
              </div>
              
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {realTimeUserData?.sickLeaves ?? user.sickLeaves ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">Sick Leaves</div>
              </div>
              
              <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {realTimeUserData?.compOffs ?? user.compOffs ?? 0}
                </div>
                <div className="text-sm text-muted-foreground">Comp-off Leaves</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
