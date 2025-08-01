# Notification System Testing Guide

## Quick Testing Scenarios

### 1. Leave Request Notification Test
**Steps:**
1. Login as an employee who has a manager assigned
2. Go to Leave Requests page (`/leaves`)
3. Submit a new leave request
4. **Expected Result**: Manager should receive a notification instantly with bell animation

### 2. Shift Assignment Notification Test
**Steps:**
1. Login as a manager
2. Go to Schedule page (`/schedule`) or Weekly Schedule
3. Assign a shift to an employee (drag & drop or click assignment)
4. **Expected Result**: Assigned employee should receive notification with shift details

### 3. Real-time Notification Test
**Steps:**
1. Open two browser windows/tabs
2. Login as different users (manager & employee)
3. Perform actions that create notifications
4. **Expected Result**: Notifications appear instantly without page refresh

### 4. Navigation Test
**Steps:**
1. Click on different types of notifications
2. **Expected Results**:
   - Leave request → `/home` (manager dashboard)
   - Leave approved/rejected → `/leaves` (employee page)
   - Shift assignment → `/schedule`
   - Swap request → `/swaps`

### 5. Animation Test
**Steps:**
1. Watch bell icon when notifications arrive
2. **Expected Results**:
   - Bell shakes when new notification comes
   - Bell glows when unread notifications exist
   - Badge pulses with notification count
   - Smooth slide-in animation for new notifications

### 6. Mark All Read Test
**Steps:**
1. Have multiple unread notifications
2. Click "Mark all read" button
3. **Expected Result**: All notifications marked as read, animations stop

## Notification Types to Test

- ✅ `LEAVE_REQUEST` - Employee submits leave → Manager notified
- ✅ `LEAVE_APPROVED` - Manager approves → Employee notified
- ✅ `LEAVE_REJECTED` - Manager rejects → Employee notified
- ✅ `SHIFT_ASSIGNED` - Manager assigns shift → Employee notified
- ✅ `SHIFT_SWAPPED` - Swap request created/responded → Users notified

## Visual Elements to Verify

- 🔔 Bell icon animations (shake, glow, pulse)
- 🎨 Gradient backgrounds and modern styling
- 📱 Responsive design on mobile
- ✨ Smooth transitions and hover effects
- 🎯 Type-specific icons for different notification types
- 💫 Real-time updates without page reload
