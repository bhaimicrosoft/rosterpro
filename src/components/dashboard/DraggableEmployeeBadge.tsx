'use client';

import { User, LeaveType } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Draggable } from '@hello-pangea/dnd';
import { CalendarX } from 'lucide-react';

interface DraggableEmployeeBadgeProps {
  user: User;
  index: number;
  isDragDisabled?: boolean;
  className?: string;
  draggableId?: string; // Optional custom draggableId for assigned users
  isOnLeave?: boolean;
  leaveType?: LeaveType;
  leaveDate?: string;
}

export default function DraggableEmployeeBadge({ 
  user, 
  index, 
  isDragDisabled = false,
  className = "",
  draggableId,
  isOnLeave = false,
  leaveType,
  leaveDate
}: DraggableEmployeeBadgeProps) {
  const getUserColor = (userId: string) => {
    const colors = [
      { bg: 'bg-blue-600', border: 'border-blue-200', light: 'bg-blue-50', text: 'text-blue-800' },
      { bg: 'bg-emerald-600', border: 'border-emerald-200', light: 'bg-emerald-50', text: 'text-emerald-800' },
      { bg: 'bg-purple-600', border: 'border-purple-200', light: 'bg-purple-50', text: 'text-purple-800' },
      { bg: 'bg-orange-600', border: 'border-orange-200', light: 'bg-orange-50', text: 'text-orange-800' },
      { bg: 'bg-rose-600', border: 'border-rose-200', light: 'bg-rose-50', text: 'text-rose-800' },
      { bg: 'bg-indigo-600', border: 'border-indigo-200', light: 'bg-indigo-50', text: 'text-indigo-800' },
      { bg: 'bg-teal-600', border: 'border-teal-200', light: 'bg-teal-50', text: 'text-teal-800' },
      { bg: 'bg-violet-600', border: 'border-violet-200', light: 'bg-violet-50', text: 'text-violet-800' },
    ];
    
    const colorIndex = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[colorIndex];
  };

  const userColors = getUserColor(user.$id);
  const initials = `${user.firstName[0]}${user.lastName[0]}`;
  
  // Override colors and make non-draggable if on leave
  const isEffectivelyDisabled = isDragDisabled || isOnLeave;
  const badgeColors = isOnLeave 
    ? { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' }
    : { bg: userColors.bg, text: 'text-white', border: 'border-0' };

  return (
    <Draggable 
      draggableId={draggableId || user.$id} 
      index={index}
      isDragDisabled={isEffectivelyDisabled}
    >
      {(provided, snapshot) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              className={`inline-block ${className}`}
            >
              <Badge
                className={`
                  ${badgeColors.bg} ${badgeColors.text} ${badgeColors.border}
                  px-3 py-1 text-sm font-medium
                  ${isOnLeave ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}
                  transition-all duration-200
                  ${snapshot.isDragging ? 'shadow-lg scale-105 rotate-2' : 'hover:shadow-md'}
                  ${isOnLeave ? 'ring-2 ring-orange-200' : ''}
                  ${isEffectivelyDisabled ? 'cursor-default' : ''}
                `}
                style={{
                  transform: snapshot.isDragging ? 'rotate(2deg)' : undefined,
                }}
              >
                {isOnLeave && <CalendarX className="h-3 w-3 mr-1" />}
                {initials}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={5}>
            <p className="font-medium">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
            {isOnLeave && (
              <p className="text-xs text-orange-600 font-medium mt-1">
                🚫 On {leaveType?.replace('_', ' ')} leave
                {leaveDate && ` (${leaveDate})`}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </Draggable>
  );
  }
