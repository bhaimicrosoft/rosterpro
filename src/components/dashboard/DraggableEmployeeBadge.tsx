'use client';

import { User } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Draggable } from '@hello-pangea/dnd';

interface DraggableEmployeeBadgeProps {
  user: User;
  index: number;
  isDragDisabled?: boolean;
  className?: string;
  draggableId?: string; // Optional custom draggableId for assigned users
}

export default function DraggableEmployeeBadge({ 
  user, 
  index, 
  isDragDisabled = false,
  className = "",
  draggableId
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

  return (
    <Draggable 
      draggableId={draggableId || user.$id} 
      index={index}
      isDragDisabled={isDragDisabled}
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
                  ${userColors.bg} text-white border-0 
                  px-3 py-1 text-sm font-medium
                  cursor-grab active:cursor-grabbing
                  transition-all duration-200
                  ${snapshot.isDragging ? 'shadow-lg scale-105 rotate-2' : 'hover:shadow-md'}
                  ${isDragDisabled ? 'cursor-default' : ''}
                `}
                style={{
                  transform: snapshot.isDragging ? 'rotate(2deg)' : undefined,
                }}
              >
                {initials}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={5}>
            <p className="font-medium">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-muted-foreground">{user.role}</p>
          </TooltipContent>
        </Tooltip>
      )}
    </Draggable>
  );
  }
