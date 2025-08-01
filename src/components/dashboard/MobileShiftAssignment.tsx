'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types';
import { Plus, Calendar, Users } from 'lucide-react';

interface MobileShiftAssignmentProps {
  date: string;
  dayName: string;
  dayNumber: number;
  primaryUser?: User;
  backupUser?: User;
  teamMembers: User[];
  onAssignUser: (userId: string, role: 'primary' | 'backup') => Promise<void>;
  onRemoveUser?: (role: 'primary' | 'backup') => Promise<void>;
  isCreating?: boolean;
}

export default function MobileShiftAssignment({
  date,
  dayName,
  dayNumber,
  primaryUser,
  backupUser,
  teamMembers,
  onAssignUser,
  onRemoveUser,
  isCreating = false
}: MobileShiftAssignmentProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'primary' | 'backup'>('primary');

  const getUserColor = (userId: string) => {
    const colors = [
      { bg: 'bg-blue-600', text: 'text-white' },
      { bg: 'bg-emerald-600', text: 'text-white' },
      { bg: 'bg-purple-600', text: 'text-white' },
      { bg: 'bg-orange-600', text: 'text-white' },
      { bg: 'bg-rose-600', text: 'text-white' },
      { bg: 'bg-indigo-600', text: 'text-white' },
      { bg: 'bg-teal-600', text: 'text-white' },
      { bg: 'bg-violet-600', text: 'text-white' },
    ];
    
    const colorIndex = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex];
  };

  const handleAssignUser = async (userId: string) => {
    try {
      await onAssignUser(userId, selectedRole);
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error assigning user:', error);
    }
  };

  const openAssignmentDialog = (role: 'primary' | 'backup') => {
    setSelectedRole(role);
    setIsDialogOpen(true);
  };

  const isWeekend = new Date(date).getDay() === 0 || new Date(date).getDay() === 6;
  const isToday = new Date(date).toDateString() === new Date().toDateString();

  return (
    <div className={`border rounded-lg p-3 ${
      isToday 
        ? 'bg-gradient-to-b from-blue-100 to-blue-50 border-2 border-blue-400 shadow-lg' 
        : isWeekend 
          ? 'bg-gradient-to-b from-orange-50 to-amber-25 border-orange-200' 
          : 'bg-card'
    }`}>
      {/* Day Header */}
      <div className="text-center mb-3 pb-2 border-b">
        <div className={`text-xs font-medium mb-1 ${
          isToday ? 'text-blue-700 font-semibold' :
          isWeekend ? 'text-orange-600' : 'text-muted-foreground'
        }`}>
          {isToday ? 'TODAY' : dayName}
        </div>
        <div className={`text-sm font-semibold ${
          isToday ? 'text-blue-700 bg-blue-200 rounded-full w-6 h-6 flex items-center justify-center mx-auto' : 
          isWeekend ? 'text-orange-600' : 
          'text-foreground'
        }`}>
          {dayNumber}
        </div>
      </div>

      {/* Primary Assignment */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between">
          <Badge variant="default" className="text-xs px-2 py-0.5 h-5 bg-blue-600">
            Primary
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => openAssignmentDialog('primary')}
            disabled={isCreating}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="min-h-[40px] rounded border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-2">
          {primaryUser ? (
            <Badge 
              className={`${getUserColor(primaryUser.$id).bg} ${getUserColor(primaryUser.$id).text} px-2 py-1 text-xs`}
              onClick={() => openAssignmentDialog('primary')}
            >
              {primaryUser.firstName[0]}{primaryUser.lastName[0]}
            </Badge>
          ) : isCreating ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
              Creating...
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>
      </div>

      {/* Backup Assignment */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="text-xs px-2 py-0.5 h-5 border-green-400 text-green-700 bg-green-50">
            Backup
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => openAssignmentDialog('backup')}
            disabled={isCreating}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="min-h-[40px] rounded border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center p-2">
          {backupUser ? (
            <Badge 
              className={`${getUserColor(backupUser.$id).bg} ${getUserColor(backupUser.$id).text} px-2 py-1 text-xs`}
              onClick={() => openAssignmentDialog('backup')}
            >
              {backupUser.firstName[0]}{backupUser.lastName[0]}
            </Badge>
          ) : isCreating ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
              Creating...
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Unassigned</span>
          )}
        </div>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Assign {selectedRole} for {dayName} {dayNumber}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              Select a team member:
            </div>
            
            <div className="grid gap-2 max-h-60 overflow-y-auto">
              {/* Remove option - only show if someone is currently assigned */}
              {((selectedRole === 'primary' && primaryUser) || (selectedRole === 'backup' && backupUser)) && onRemoveUser && (
                <Button
                  variant="destructive"
                  className="justify-start h-auto p-3 mb-2"
                  onClick={async () => {
                    await onRemoveUser(selectedRole);
                    setIsDialogOpen(false);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Badge className="bg-red-600 text-white px-2 py-1 text-xs">
                      ❌
                    </Badge>
                    <div className="text-left">
                      <div className="font-medium">
                        Remove {selectedRole} assignment
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Clear this slot
                      </div>
                    </div>
                  </div>
                </Button>
              )}
              
              {teamMembers
                .filter((member) => {
                  // Prevent assigning same person to both roles on the same day
                  if (selectedRole === 'primary' && backupUser && backupUser.$id === member.$id) {
                    return false; // User is already backup, can't be primary
                  }
                  if (selectedRole === 'backup' && primaryUser && primaryUser.$id === member.$id) {
                    return false; // User is already primary, can't be backup
                  }
                  return true;
                })
                .map((member) => {
                const colors = getUserColor(member.$id);
                const isCurrentlyAssigned = 
                  (selectedRole === 'primary' && primaryUser?.$id === member.$id) ||
                  (selectedRole === 'backup' && backupUser?.$id === member.$id);
                
                return (
                  <Button
                    key={member.$id}
                    variant={isCurrentlyAssigned ? "default" : "outline"}
                    className="justify-start h-auto p-3"
                    onClick={() => handleAssignUser(member.$id)}
                  >
                    <div className="flex items-center gap-3">
                      <Badge className={`${colors.bg} ${colors.text} px-2 py-1 text-xs`}>
                        {member.firstName[0]}{member.lastName[0]}
                      </Badge>
                      <div className="text-left">
                        <div className="font-medium">
                          {member.firstName} {member.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.role}
                        </div>
                      </div>
                    </div>
                    {isCurrentlyAssigned && (
                      <Badge variant="secondary" className="ml-auto">
                        Current
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
