'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  Users, 
  UserPlus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Key, 
  Mail,
  Calendar,
  Shield
} from 'lucide-react';
import { userService } from '@/lib/appwrite/user-service';
import { account } from '@/lib/appwrite/config';
import { User } from '@/types';

export default function TeamPage() {
  const { user } = useAuth();
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newMemberData, setNewMemberData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    role: 'EMPLOYEE' as 'EMPLOYEE' | 'MANAGER',
    manager: '',
    password: '',
  });

  useEffect(() => {
    const fetchTeamData = async () => {
      if (!user || user.role === 'EMPLOYEE') return;

      setIsLoading(true);
      try {
        const users = await userService.getAllUsers();
        setAllUsers(users);
        
        if (user.role === 'MANAGER') {
          // Filter to show only team members
          const myTeam = users.filter((u: User) => u.manager === user.$id);
          setTeamMembers(myTeam);
        } else {
          // Admin sees all users
          setTeamMembers(users);
        }
      } catch (error) {
        console.error('Error fetching team data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTeamData();
  }, [user]);

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
        role: newMemberData.role,
        manager: newMemberData.manager || user?.$id,
        paidLeaves: 24,
        sickLeaves: 12,
        compOffs: 0,
      });

      // Add to team members list
      setTeamMembers(prev => [...prev, newUser]);
      setAllUsers(prev => [...prev, newUser]);

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
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error adding team member:', error);
    }
  };

  const handleEditUser = async () => {
    if (!selectedUser) return;

    try {
      const updatedUser = await userService.updateUser(selectedUser.$id, {
        firstName: selectedUser.firstName,
        lastName: selectedUser.lastName,
        username: selectedUser.username,
        email: selectedUser.email,
        role: selectedUser.role,
        manager: selectedUser.manager,
        paidLeaves: selectedUser.paidLeaves,
        sickLeaves: selectedUser.sickLeaves,
        compOffs: selectedUser.compOffs,
      });

      // Update in lists
      setTeamMembers(prev => prev.map(tm => tm.$id === updatedUser.$id ? updatedUser : tm));
      setAllUsers(prev => prev.map(u => u.$id === updatedUser.$id ? updatedUser : u));
      
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      await userService.deleteUser(userId);
      setTeamMembers(prev => prev.filter(tm => tm.$id !== userId));
      setAllUsers(prev => prev.filter(u => u.$id !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const handleResetPassword = async (userId: string, email: string) => {
    try {
      // In a real app, you'd generate a secure temporary password
      const tempPassword = `temp${Math.random().toString(36).substring(2, 8)}`;
      
      // This would typically send a password reset email
      // For now, we'll just show the temp password
      alert(`Temporary password for ${email}: ${tempPassword}\nPlease share this securely with the user.`);
    } catch (error) {
      console.error('Error resetting password:', error);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-700 border-red-200';
      case 'manager': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  if (user?.role === 'EMPLOYEE') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto text-slate-400 mb-4" />
            <h2 className="text-xl font-semibold text-slate-600 mb-2">Access Restricted</h2>
            <p className="text-slate-500">You don&apos;t have permission to view team management.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Users className="h-8 w-8 animate-pulse mx-auto mb-2" />
            <p>Loading team data...</p>
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
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent dark:from-slate-100 dark:via-blue-200 dark:to-indigo-200">
              Team Management
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Manage team members, roles, and permissions
            </p>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
                <UserPlus className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
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
                        {allUsers.filter(member => member.role === 'MANAGER' || member.role === 'ADMIN').map((manager) => (
                          <SelectItem key={manager.$id} value={manager.$id}>
                            {manager.firstName} {manager.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddTeamMember} disabled={!newMemberData.firstName || !newMemberData.lastName || !newMemberData.email || !newMemberData.password}>
                    Add Member
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Team Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Total Members</p>
                  <p className="text-2xl font-bold text-blue-600">{teamMembers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Managers</p>
                  <p className="text-2xl font-bold text-green-600">
                    {teamMembers.filter(m => m.role === 'MANAGER').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Employees</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {teamMembers.filter(m => m.role === 'EMPLOYEE').length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <UserPlus className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600">Active Today</p>
                  <p className="text-2xl font-bold text-orange-600">{teamMembers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Members List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Team Members
            </CardTitle>
            <CardDescription>
              Manage your team members and their roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                  <p className="text-slate-500 mb-4">No team members found</p>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add First Team Member
                  </Button>
                </div>
              ) : (
                teamMembers.map((member) => (
                  <div key={member.$id} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
                          {member.firstName[0]}{member.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                            {member.firstName} {member.lastName}
                          </h3>
                          <Badge className={getRoleBadgeColor(member.role)}>
                            {member.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {member.email}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {member.paidLeaves || 0} days left
                          </span>
                        </div>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => {
                            setSelectedUser(member);
                            setIsEditDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResetPassword(member.$id, member.email)}>
                          <Key className="h-4 w-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteUser(member.$id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Edit User Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Team Member</DialogTitle>
              <DialogDescription>
                Update team member details and permissions.
              </DialogDescription>
            </DialogHeader>
            {selectedUser && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="editFirstName">First Name</Label>
                    <Input
                      id="editFirstName"
                      value={selectedUser.firstName}
                      onChange={(e) => setSelectedUser(prev => prev ? { ...prev, firstName: e.target.value } : null)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="editLastName">Last Name</Label>
                    <Input
                      id="editLastName"
                      value={selectedUser.lastName}
                      onChange={(e) => setSelectedUser(prev => prev ? { ...prev, lastName: e.target.value } : null)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input
                    id="editEmail"
                    value={selectedUser.email}
                    onChange={(e) => setSelectedUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="paidLeaves">Paid Leaves</Label>
                    <Input
                      id="paidLeaves"
                      type="number"
                      value={selectedUser.paidLeaves || 0}
                      onChange={(e) => setSelectedUser(prev => prev ? { ...prev, paidLeaves: parseInt(e.target.value) } : null)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sickLeaves">Sick Leaves</Label>
                    <Input
                      id="sickLeaves"
                      type="number"
                      value={selectedUser.sickLeaves || 0}
                      onChange={(e) => setSelectedUser(prev => prev ? { ...prev, sickLeaves: parseInt(e.target.value) } : null)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="compOffs">Comp Offs</Label>
                    <Input
                      id="compOffs"
                      type="number"
                      value={selectedUser.compOffs || 0}
                      onChange={(e) => setSelectedUser(prev => prev ? { ...prev, compOffs: parseInt(e.target.value) } : null)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="editRole">Role</Label>
                  <Select 
                    value={selectedUser.role} 
                    onValueChange={(value: 'EMPLOYEE' | 'MANAGER' | 'ADMIN') => 
                      setSelectedUser(prev => prev ? { ...prev, role: value } : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EMPLOYEE">Employee</SelectItem>
                      <SelectItem value="MANAGER">Manager</SelectItem>
                      {user?.role === 'ADMIN' && <SelectItem value="ADMIN">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditUser}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
