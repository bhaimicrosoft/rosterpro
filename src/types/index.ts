// User types
export interface User {
  $id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  manager?: string; // Manager's user ID
  paidLeaves: number;
  sickLeaves: number;
  compOffs: number;
  $createdAt: string;
  $updatedAt: string;
}

// Shift types
export interface Shift {
  $id: string;
  userId: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type?: string;
  onCallRole: 'PRIMARY' | 'BACKUP';
  status: 'SCHEDULED' | 'COMPLETED' | 'SWAPPED';
  createdAt: string;
  updatedAt: string;
  $createdAt: string;
  $updatedAt: string;
}

// Leave request types
export type LeaveType = 'PAID' | 'SICK' | 'COMP_OFF';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveRequest {
  $id: string;
  userId: string;
  startDate: string;
  endDate: string;
  type: LeaveType;
  status: LeaveStatus;
  reason?: string;
  managerComment?: string;
  $createdAt: string;
  $updatedAt: string;
}

// Swap request types (we'll need to create this collection)
export type SwapStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface SwapRequest {
  $id: string;
  requesterShiftId: string;
  requesterUserId: string;
  targetShiftId: string;
  targetUserId: string;
  reason: string;
  status: SwapStatus;
  responseNotes?: string;
  managerComment?: string;
  requestedAt: string;
  respondedAt?: string;
  $createdAt: string;
  $updatedAt: string;
}

// Notification types
export type NotificationType = 'LEAVE_REQUEST' | 'LEAVE_APPROVED' | 'LEAVE_REJECTED' | 'SHIFT_ASSIGNED' | 'SHIFT_SWAPPED' | 'general';

export interface Notification {
  $id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  relatedId?: string; // ID of related leave request, swap request, etc.
  $createdAt: string;
}

// Dashboard stats types
export interface DashboardStats {
  totalEmployees: number;
  pendingLeaveRequests: number;
  pendingSwapRequests: number;
  upcomingShifts: number;
}

// Dashboard helper types
export interface DashboardApprovalRequest extends Partial<LeaveRequest>, Partial<SwapRequest> {
  _type: 'leave' | 'swap';
  _employeeName: string;
}

export interface DashboardShift extends Shift {
  _employeeName: string;
}

// Leave data for dashboard and schedule displays
export interface EmployeeOnLeave {
  $id: string;
  userId: string;
  userName: string;
  date: string;
  leaveType: LeaveType;
  leaveId: string;
  startDate: string;
  endDate: string;
}

export interface WeeklyLeaveData {
  [date: string]: EmployeeOnLeave[];
}

// Form types
export interface LoginForm {
  username: string;
  password: string;
}

export interface CreateUserForm {
  username: string;
  fullName: string;
  email?: string;
  role: 'MANAGER' | 'EMPLOYEE';
  managerId?: string;
  color: string;
}

export interface ScheduleShiftForm {
  date: string;
  startTime: string;
  endTime: string;
  employeeId: string;
  notes?: string;
}

export interface LeaveRequestForm {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  compOffDate?: string;
}

export interface SwapRequestForm {
  targetShiftId: string;
  reason: string;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Auth context types
export interface AuthUser {
  $id: string; // Session ID
  documentId: string; // User document ID in database
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE';
  manager?: string;
  paidLeaves?: number;
  sickLeaves?: number;
  compOffs?: number;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<boolean>;
  refreshUser: () => Promise<void>;
}
