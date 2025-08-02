'use client';

import { User } from '@/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle } from 'lucide-react';

interface AssignedEmployeeBadgeProps {
  user: User;
  className?: string;
  isCompleted?: boolean;
}

// Helper function to get consistent user colors
const getUserColor = (userId: string, isCompleted = false) => {
  if (isCompleted) {
    // Muted/grayed out colors for completed shifts
    return 'bg-gray-500';
  }
  
  const colors = [
    'bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-orange-600',
    'bg-rose-600', 'bg-indigo-600', 'bg-teal-600', 'bg-violet-600'
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function AssignedEmployeeBadge({ user, className = "", isCompleted = false }: AssignedEmployeeBadgeProps) {
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const colorClass = getUserColor(user.$id, isCompleted);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative">
          <div
            className={`
              inline-flex items-center justify-center w-8 h-8 rounded-full 
              text-white text-xs font-bold cursor-default
              ring-2 ring-white shadow-sm
              ${colorClass}
              ${isCompleted ? 'opacity-70' : ''}
              ${className}
            `}
          >
            {initials}
          </div>
          {isCompleted && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{user.firstName} {user.lastName}</p>
      </TooltipContent>
    </Tooltip>
  );
}
