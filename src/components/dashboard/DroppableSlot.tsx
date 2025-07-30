'use client';

import { Droppable } from '@hello-pangea/dnd';
import { User } from '@/types';
import DraggableEmployeeBadge from './DraggableEmployeeBadge';

interface DroppableSlotProps {
  droppableId: string;
  assignedUser?: User;
  slotType: 'primary' | 'backup';
  children?: React.ReactNode;
  className?: string;
  isCreating?: boolean; // New prop for loading state
}

export default function DroppableSlot({ 
  droppableId, 
  assignedUser, 
  children,
  className = "",
  isCreating = false
}: DroppableSlotProps) {
  return (
    <Droppable droppableId={droppableId}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`
            relative min-h-[40px] rounded-lg border-2 border-dashed
            transition-all duration-200 flex items-center justify-center
            ${snapshot.isDraggingOver 
              ? 'border-blue-400 bg-blue-50' 
              : assignedUser 
                ? 'border-gray-200 bg-gray-50' 
                : 'border-gray-300 bg-gray-100'
            }
            ${className}
          `}
        >
          {assignedUser ? (
            <DraggableEmployeeBadge 
              user={assignedUser}
              index={0} // Single user per slot, so index is always 0
              draggableId={`${assignedUser.$id}-assigned-${droppableId}`} // Unique ID with source info
              className="m-1"
            />
          ) : isCreating ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              Creating shift...
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {snapshot.isDraggingOver ? 'Drop here' : 'Unassigned'}
            </span>
          )}
          {children}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}
