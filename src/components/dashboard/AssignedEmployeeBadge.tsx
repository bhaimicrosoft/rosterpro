'use client';

import { User } from '@/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface AssignedEmployeeBadgeProps {
  user: User;
  className?: string;
}

// Helper function to get consistent user colors
const getUserColor = (userId: string) => {
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

export default function AssignedEmployeeBadge({ user, className = "" }: AssignedEmployeeBadgeProps) {
  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  const colorClass = getUserColor(user.$id);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`
            inline-flex items-center justify-center w-8 h-8 rounded-full 
            text-white text-xs font-bold cursor-default
            ring-2 ring-white shadow-sm
            ${colorClass}
            ${className}
          `}
        >
          {initials}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p>{user.firstName} {user.lastName}</p>
        <p className="text-xs text-muted-foreground">Assigned</p>
      </TooltipContent>
    </Tooltip>
  );
}
