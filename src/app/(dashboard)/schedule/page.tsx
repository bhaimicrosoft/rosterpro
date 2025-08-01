'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Grid3X3, CalendarDays, RefreshCw, Loader2, Download, Upload, Repeat, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { shiftService, userService, leaveService } from '@/lib/appwrite/database';
import { Shift, User, EmployeeOnLeave, WeeklyLeaveData, LeaveType } from '@/types';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import WeeklySchedule from '@/components/dashboard/WeeklySchedule';
import * as XLSX from 'xlsx';

interface CalendarDay {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  shifts: { primary?: User; backup?: User };
  shiftStatus?: { primary: 'SCHEDULED' | 'COMPLETED' | 'SWAPPED'; backup: 'SCHEDULED' | 'COMPLETED' | 'SWAPPED' };
  employeesOnLeave?: EmployeeOnLeave[];
}

export default function SchedulePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [weeklyLeaveData, setWeeklyLeaveData] = useState<WeeklyLeaveData>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  
  // Export dialog state
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  
  // Import dialog state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  // Import summary state
  const [showImportSummary, setShowImportSummary] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    totalRows: number;
    successfulShifts: number;
    errors: string[];
    warnings: string[];
  } | null>(null);

  // Repeat shifts state
  const [showRepeatShiftsDialog, setShowRepeatShiftsDialog] = useState(false);
  const [repeatShiftsData, setRepeatShiftsData] = useState({
    sourceStartDate: '',
    sourceEndDate: '',
    targetStartDate: '',
    targetEndDate: '',
    useEndDate: true, // Toggle between end date or duration
    repeatDuration: '1',
    repeatUnit: 'weeks' // days, weeks, months
  });
  const [isRepeatingShifts, setIsRepeatingShifts] = useState(false);

  // Today highlight animation state
  const [todayHighlight, setTodayHighlight] = useState(false);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = useMemo(() => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], []);

  // Utility functions for leave display
  const getLeaveTypeColor = (leaveType: LeaveType) => {
    switch (leaveType) {
      case 'PAID':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SICK':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'COMP_OFF':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getLeaveTypeIcon = (leaveType: LeaveType) => {
    switch (leaveType) {
      case 'PAID':
        return '🏖️';
      case 'SICK':
        return '🤒';
      case 'COMP_OFF':
        return '⚖️';
      default:
        return '📅';
    }
  };

  const formatDisplayName = (firstName: string, lastName: string) => {
    return `${firstName} ${lastName}`;
  };

  // Export functionality
  const handleExportSchedule = async () => {
    if (!exportStartDate || !exportEndDate) {
      toast({
        title: "Validation Error",
        description: "Please select both start and end dates",
        variant: "destructive",
      });
      return;
    }

    if (new Date(exportStartDate) > new Date(exportEndDate)) {
      toast({
        title: "Validation Error",
        description: "Start date must be before end date",
        variant: "destructive",
      });
      return;
    }

    setIsExporting(true);
    try {
      // Fetch shifts for the date range
      const startDate = `${exportStartDate}T00:00:00.000Z`;
      const endDate = `${exportEndDate}T23:59:59.999Z`;
      
      const shiftsInRange = await shiftService.getShiftsByDateRange(startDate, endDate);
      const users = await userService.getAllUsers();
      
      // Create user map for quick lookup
      const userMap = new Map(users.map(user => [user.$id, user]));
      
      // Group shifts by date
      const shiftsByDate = new Map<string, { primary?: User; backup?: User }>();
      
      shiftsInRange.forEach(shift => {
        const dateKey = shift.date.split('T')[0];
        const user = userMap.get(shift.userId);
        
        if (!shiftsByDate.has(dateKey)) {
          shiftsByDate.set(dateKey, {});
        }
        
        const dayShifts = shiftsByDate.get(dateKey)!;
        if (shift.onCallRole === 'PRIMARY') {
          dayShifts.primary = user;
        } else if (shift.onCallRole === 'BACKUP') {
          dayShifts.backup = user;
        }
      });
      
      // Generate export data
      const exportData = [];
      const currentDate = new Date(exportStartDate);
      const endDateObj = new Date(exportEndDate);
      
      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayShifts = shiftsByDate.get(dateStr) || {};
        const dayOfWeek = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
        
        exportData.push({
          Primary: dayShifts.primary?.username || '',
          Backup: dayShifts.backup?.username || '',
          Date: dateStr,
          Day: dayOfWeek
        });
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      
      // Add the worksheet to the workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
      
      // Generate unique filename with date range and timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19); // Format: YYYY-MM-DDTHH-MM-SS
      const dateRangeFormatted = `${exportStartDate}_to_${exportEndDate}`;
      const filename = `RosterPro_Schedule_${dateRangeFormatted}_exported_${timestamp}.xlsx`;
      
      // Save the file
      XLSX.writeFile(workbook, filename);
      
      toast({
        title: "Export Successful",
        description: `Schedule exported as ${filename}`,
      });
      
      setIsExportDialogOpen(false);
      setExportStartDate('');
      setExportEndDate('');
      
    } catch {

      toast({
        title: "Export Failed",
        description: "Failed to export schedule. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Import functionality with real-time streaming
  const handleImportSchedule = async () => {
    if (!importFile) {
      toast({
        title: "Validation Error",
        description: "Please select a file to import",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    
    try {
      // Read the Excel file
      const arrayBuffer = await importFile.arrayBuffer();
      setImportProgress(5);
      
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      setImportProgress(10);
      
      // Convert to JSON with proper options for date handling
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        raw: false, // This prevents Excel dates from being converted to numbers
        dateNF: 'yyyy-mm-dd' // Format dates as YYYY-MM-DD
      }) as Array<{
        Primary?: string;
        Backup?: string;
        Date?: string | number;
        Day?: string;
      }>;
      setImportProgress(15);

      if (jsonData.length === 0) {
        toast({
          title: "Import Error",
          description: "The file appears to be empty or invalid",
          variant: "destructive",
        });
        return;
      }

      // Validate required columns
      const requiredColumns = ['Primary', 'Backup', 'Date', 'Day'];
      const firstRow = jsonData[0];
      const missingColumns = requiredColumns.filter(col => !(col in firstRow));
      
      if (missingColumns.length > 0) {
        toast({
          title: "Import Error",
          description: `Missing required columns: ${missingColumns.join(', ')}`,
          variant: "destructive",
        });
        return;
      }
      setImportProgress(20);

      // Fetch existing shifts for intelligent duplicate detection
      toast({
        title: "Fetching existing shifts...",
        description: "Analyzing current schedule for duplicate detection",
      });

      const existingShifts = await shiftService.getAllShifts();
      setImportProgress(25);

      const allErrors: string[] = [];
      const allSkipped: string[] = [];
      let totalCreated = 0;
      let totalUpdated = 0;

      // Process shifts in real-time (streaming)
      const totalRows = jsonData.length;
      const processPromises = jsonData.map(async (shift, index) => {
        try {
          const response = await fetch('/api/schedule/import-stream', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              shift, 
              existingShifts: existingShifts.map((s: Shift) => ({
                $id: s.$id,
                date: s.date.split('T')[0], // Normalize date format
                onCallRole: s.onCallRole,
                userId: s.userId
              }))
            }),
          });

          const result = await response.json();

          // Update progress in real-time
          const progressPercent = 25 + ((index + 1) / totalRows) * 70;
          setImportProgress(progressPercent);

          if (!response.ok) {
            allErrors.push(`Row ${index + 1}: ${result.error || 'Import failed'}`);
            return { success: false, errors: [result.error] };
          }

          // Track results
          if (result.createdShifts) {
            interface CreatedShift {
              action: string;
              username: string;
              role: string;
            }
            const created = result.createdShifts.filter((s: CreatedShift) => s.action === 'created').length;
            const updated = result.createdShifts.filter((s: CreatedShift) => s.action === 'updated').length;
            totalCreated += created;
            totalUpdated += updated;
          }
          
          if (result.errors && result.errors.length > 0) {
            allErrors.push(...result.errors.map((e: string) => `Row ${index + 1}: ${e}`));
          }

          if (result.skipped && result.skipped.length > 0) {
            allSkipped.push(...result.skipped.map((s: string) => `Row ${index + 1}: ${s}`));
          }

          return result;

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          allErrors.push(`Row ${index + 1}: ${errorMsg}`);
          return { success: false, errors: [errorMsg] };
        }
      });

      // Wait for all promises to complete (parallel processing)
      toast({
        title: "Processing shifts in parallel...",
        description: "Creating shifts simultaneously for optimal performance",
      });

      await Promise.all(processPromises);
      setImportProgress(100);

      // Categorize errors and warnings
      const userNotFoundErrors = allErrors.filter(error => error.includes('User not found'));
      const dateErrors = allErrors.filter(error => error.includes('Invalid date'));

      // Set summary data
      setImportSummary({
        totalRows: jsonData.length,
        successfulShifts: totalCreated + totalUpdated,
        errors: allErrors,
        warnings: [
          ...allSkipped,
          ...userNotFoundErrors.map(err => `Missing user: ${err.split(': ')[1] || err}`),
          ...dateErrors.map(err => `Date format issue: ${err}`),
        ]
      });

      // Show appropriate toast
      if (allErrors.length === 0) {
        toast({
          title: "Import Successful",
          description: `Successfully processed ${totalCreated + totalUpdated} shifts (${totalCreated} created, ${totalUpdated} updated) from ${jsonData.length} rows`,
          className: "border-green-500 bg-green-50 text-green-900"
        });
      } else if (totalCreated + totalUpdated > 0) {
        toast({
          title: "Import Partially Successful",
          description: `Processed ${totalCreated + totalUpdated} shifts (${totalCreated} created, ${totalUpdated} updated), but ${allErrors.length} errors occurred`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Import Failed",
          description: `No shifts were processed. ${allErrors.length} errors occurred.`,
          variant: "destructive",
        });
      }

      // Refresh the schedule data to show real-time updates
      await fetchScheduleData();
      
      // Show summary dialog
      setShowImportSummary(true);
      setIsImportDialogOpen(false);
      setImportFile(null);
      
    } catch (error) {

      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Failed to import schedule. Please try again.",
        variant: "destructive",
      });
      
      setImportSummary({
        totalRows: 0,
        successfulShifts: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        warnings: []
      });
      setShowImportSummary(true);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  // Repeat shifts handler
  const handleRepeatShifts = async () => {
    if (!repeatShiftsData.sourceStartDate || !repeatShiftsData.sourceEndDate || !repeatShiftsData.targetStartDate) {
      alert('Please select source start date, source end date, and target start date');
      return;
    }

    const sourceStart = new Date(repeatShiftsData.sourceStartDate);
    const sourceEnd = new Date(repeatShiftsData.sourceEndDate);
    const targetStart = new Date(repeatShiftsData.targetStartDate);
    
    if (sourceStart >= sourceEnd) {
      alert('Source start date must be before source end date');
      return;
    }

    // Validate target fields based on selection
    if (repeatShiftsData.useEndDate) {
      if (!repeatShiftsData.targetEndDate) {
        alert('Please select target end date');
        return;
      }
      const targetEnd = new Date(repeatShiftsData.targetEndDate);
      if (targetStart >= targetEnd) {
        alert('Target start date must be before target end date');
        return;
      }
    } else {
      if (!repeatShiftsData.repeatDuration) {
        alert('Please specify repeat duration');
        return;
      }
      const duration = parseInt(repeatShiftsData.repeatDuration);
      if (isNaN(duration) || duration <= 0) {
        alert('Repeat duration must be a positive number');
        return;
      }
    }

    setIsRepeatingShifts(true);
    
    try {
      const requestBody: {
        sourceStartDate: string;
        sourceEndDate: string;
        targetStartDate: string;
        targetEndDate?: string;
        repeatDuration?: string;
        repeatUnit?: string;
      } = {
        sourceStartDate: repeatShiftsData.sourceStartDate,
        sourceEndDate: repeatShiftsData.sourceEndDate,
        targetStartDate: repeatShiftsData.targetStartDate,
      };

      if (repeatShiftsData.useEndDate) {
        requestBody.targetEndDate = repeatShiftsData.targetEndDate;
      } else {
        requestBody.repeatDuration = repeatShiftsData.repeatDuration;
        requestBody.repeatUnit = repeatShiftsData.repeatUnit;
      }

      const response = await fetch('/api/schedule/repeat-shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to repeat shifts');
      }

      const message = `Successfully created ${result.createdShifts} shifts!${
        result.skippedDuplicates > 0 ? ` (Skipped ${result.skippedDuplicates} duplicates)` : ''
      }`;
      
      alert(message);
      setShowRepeatShiftsDialog(false);
      
      // Reset form
      setRepeatShiftsData({
        sourceStartDate: '',
        sourceEndDate: '',
        targetStartDate: '',
        targetEndDate: '',
        useEndDate: true,
        repeatDuration: '1',
        repeatUnit: 'weeks'
      });
      
      // Refresh the schedule
      await fetchScheduleData();
      
    } catch (error) {
      alert(`Error repeating shifts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRepeatingShifts(false);
    }
  };

  const generateCalendar = useCallback(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Get first day of month and days in month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    // Get previous month's last days
    const prevMonth = new Date(year, month, 0);
    const daysInPrevMonth = prevMonth.getDate();
    
    const calendarDays: CalendarDay[] = [];
    
    // Add previous month's days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: false,
        shifts: {}
      });
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: true,
        shifts: {}
      });
    }
    
    // Add next month's days to complete the grid
    const remainingDays = 42 - calendarDays.length; // 6 rows * 7 days
    for (let day = 1; day <= remainingDays; day++) {
      const dateStr = `${year}-${String(month + 2).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      calendarDays.push({
        date: dateStr,
        day,
        isCurrentMonth: false,
        shifts: {}
      });
    }

    return calendarDays;
  }, [currentDate]);

  const generateWeekCalendar = useCallback(() => {
    const date = new Date(currentDate);
    // Get the Monday of current week (start of week)
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    
    const weekDays: CalendarDay[] = [];
    
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      
      weekDays.push({
        date: dayDate.toISOString().split('T')[0],
        day: dayDate.getDate(),
        isCurrentMonth: true, // For week view, treat all days as current
        shifts: {}
      });
    }
    
    return weekDays;
  }, [currentDate]);

  // Get the start of the current week for display
  const getWeekStartDate = useCallback(() => {
    const date = new Date(currentDate);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    date.setDate(diff);
    return date;
  }, [currentDate]);

  const mapShiftsToCalendar = useCallback((calendarDays: CalendarDay[], shiftsData: Shift[]) => {
    const userMap = new Map(allUsers.map(u => [u.$id, u]));
    
    const result = calendarDays.map(day => {
      // Normalize shift dates to YYYY-MM-DD format for comparison
      const dayShifts = shiftsData.filter(shift => {
        const shiftDateOnly = shift.date.split('T')[0]; // Extract date part from datetime string
        return shiftDateOnly === day.date;
      });
      
      const primaryShift = dayShifts.find(s => s.onCallRole === 'PRIMARY');
      const backupShift = dayShifts.find(s => s.onCallRole === 'BACKUP');
      
      const shiftAssignments = {
        primary: primaryShift ? userMap.get(primaryShift.userId) : undefined,
        backup: backupShift ? userMap.get(backupShift.userId) : undefined,
      };

      return {
        ...day,
        shifts: shiftAssignments,
        ...(primaryShift || backupShift ? {
          shiftStatus: {
            primary: primaryShift?.status || 'SCHEDULED',
            backup: backupShift?.status || 'SCHEDULED',
          }
        } : {}),
        employeesOnLeave: weeklyLeaveData[day.date] || []
      };
    });

    return result;
  }, [allUsers, weeklyLeaveData]);

  const fetchScheduleData = useCallback(async () => {
    if (!user) return;
    
    try {
      let startDateStr: string;
      let endDateStr: string;

      if (viewMode === 'week') {
        // For week view, get current week range (Monday to Sunday)
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        startOfWeek.setDate(diff);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        startDateStr = startOfWeek.toISOString().split('T')[0];
        endDateStr = endOfWeek.toISOString().split('T')[0];
        

      } else {
        // For month view, get extended date range to support imports across years
        // This covers 1 year before and 1 year after current month for performance
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const startDate = new Date(year - 1, month, 1);  // 1 year before current month
        const endDate = new Date(year + 1, month + 1, 0); // 1 year after current month
        
        startDateStr = startDate.toISOString().split('T')[0];
        endDateStr = endDate.toISOString().split('T')[0];
        

      }

      // Fetch data
      const [shiftsData, usersData, leavesData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDateStr, endDateStr),
        userService.getAllUsers(), // Always fetch all users so employees can see full team schedule
        leaveService.getApprovedLeavesByDateRange(startDateStr, endDateStr)
      ]);




      setShifts(shiftsData);
      setAllUsers(usersData as User[]);

      // Build weekly leave data structure
      const leaveDataMap: WeeklyLeaveData = {};
      
      // Process each leave request
      leavesData.forEach(leave => {
        const user = usersData.find(u => u.$id === leave.userId);
        if (!user) return;
        
        // Check each date in the leave range
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const currentDateLoop = new Date(leaveStart);
        
        while (currentDateLoop <= leaveEnd) {
          const dateStr = currentDateLoop.toISOString().split('T')[0];
          
          if (!leaveDataMap[dateStr]) {
            leaveDataMap[dateStr] = [];
          }
          
          leaveDataMap[dateStr].push({
            $id: `${leave.$id}-${dateStr}`,
            userId: user.$id,
            userName: formatDisplayName(user.firstName, user.lastName),
            date: dateStr,
            leaveType: leave.type,
            leaveId: leave.$id,
            startDate: leave.startDate,
            endDate: leave.endDate
          });
          
          currentDateLoop.setDate(currentDateLoop.getDate() + 1);
        }
      });
      
      setWeeklyLeaveData(leaveDataMap);

    } catch {

    }
  }, [user, currentDate, viewMode]);

  // Silent refetch without loading spinner (for real-time fallback)
  const silentRefetchScheduleData = useCallback(async () => {
    if (!user) return;
    
    try {

      let startDateStr: string;
      let endDateStr: string;

      if (viewMode === 'week') {
        // For week view, get current week range (Monday to Sunday)
        const startOfWeek = new Date(currentDate);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        startOfWeek.setDate(diff);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        startDateStr = startOfWeek.toISOString().split('T')[0];
        endDateStr = endOfWeek.toISOString().split('T')[0];
        

      } else {
        // For month view, get extended date range to support imports across years
        // This covers 1 year before and 1 year after current month for performance
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        
        const startDate = new Date(year - 1, month, 1);  // 1 year before current month
        const endDate = new Date(year + 1, month + 1, 0); // 1 year after current month
        
        startDateStr = startDate.toISOString().split('T')[0];
        endDateStr = endDate.toISOString().split('T')[0];
        

      }

      // Fetch data
      const [shiftsData, usersData, leavesData] = await Promise.all([
        shiftService.getShiftsByDateRange(startDateStr, endDateStr),
        userService.getAllUsers(),
        leaveService.getApprovedLeavesByDateRange(startDateStr, endDateStr)
      ]);

      setShifts(shiftsData);
      setAllUsers(usersData as User[]);

      // Build weekly leave data structure
      const leaveDataMap: WeeklyLeaveData = {};
      
      // Process each leave request
      leavesData.forEach(leave => {
        const user = usersData.find(u => u.$id === leave.userId);
        if (!user) return;
        
        // Check each date in the leave range
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const currentDateLoop = new Date(leaveStart);
        
        while (currentDateLoop <= leaveEnd) {
          const dateStr = currentDateLoop.toISOString().split('T')[0];
          
          if (!leaveDataMap[dateStr]) {
            leaveDataMap[dateStr] = [];
          }
          
          leaveDataMap[dateStr].push({
            $id: `${leave.$id}-${dateStr}`,
            userId: user.$id,
            userName: formatDisplayName(user.firstName, user.lastName),
            date: dateStr,
            leaveType: leave.type,
            leaveId: leave.$id,
            startDate: leave.startDate,
            endDate: leave.endDate
          });
          
          currentDateLoop.setDate(currentDateLoop.getDate() + 1);
        }
      });
      
      setWeeklyLeaveData(leaveDataMap);
      
    } catch {

    }
  }, [user, currentDate, viewMode]);

  // Filter users for assignment (exclude managers and admins)
  const assignableUsers = useMemo(() => {
    return allUsers.filter(u => u.role === 'EMPLOYEE');
  }, [allUsers]);

  // Get assignable users for a specific date (filtering out employees on leave and existing role assignments)
  const getAssignableUsersForDate = useCallback((date: string) => {
    const employeesOnLeaveForDate = weeklyLeaveData[date] || [];
    const employeeIdsOnLeave = employeesOnLeaveForDate.map(emp => emp.userId);
    
    // Find the shift for this date to check existing assignments
    const dayShift = calendar.find(day => day.date === date);
    
    // Get both current role and opposite role user IDs to exclude both
    const primaryUserId = dayShift?.shifts.primary?.$id;
    const backupUserId = dayShift?.shifts.backup?.$id;
    
    // Create array of user IDs to exclude (current assignment + opposite role assignment)
    const excludedUserIds: string[] = [];
    if (primaryUserId) excludedUserIds.push(primaryUserId);
    if (backupUserId) excludedUserIds.push(backupUserId);
    
    return assignableUsers.filter(user => 
      !employeeIdsOnLeave.includes(user.$id) && 
      !excludedUserIds.includes(user.$id)
    );
  }, [assignableUsers, weeklyLeaveData, calendar]);

  // Separate useEffect for calendar regeneration when currentDate or viewMode changes
  useEffect(() => {
    if (viewMode === 'month') {
      const calendarDays = generateCalendar();
      const calendarWithShifts = mapShiftsToCalendar(calendarDays, shifts);
      setCalendar(calendarWithShifts);
    } else if (viewMode === 'week') {
      // Generate week calendar for week view
      const weekDays = generateWeekCalendar();
      const calendarWithShifts = mapShiftsToCalendar(weekDays, shifts);
      setCalendar(calendarWithShifts);
    }
  }, [currentDate, viewMode, generateCalendar, generateWeekCalendar, mapShiftsToCalendar, shifts, allUsers]);

  useEffect(() => {
    fetchScheduleData();
  }, [fetchScheduleData]);

  // Real-time subscription for shifts with instant updates (only for month view)
  useEffect(() => {
    if (!user || viewMode !== 'month') return;

    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`,
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.LEAVES}.documents`,
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents`,
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (response: any) => {
        const events = response.events || [];
        const payload = response.payload;

        // Check for specific event types with more robust pattern matching
        const hasCreateEvent = events.some((event: string) => 
          event.includes('.create') || 
          event.includes('documents.create') ||
          event.includes('.documents.*.create')
        );
        const hasUpdateEvent = events.some((event: string) => 
          event.includes('.update') || 
          event.includes('documents.update') ||
          event.includes('.documents.*.update')
        );
        const hasDeleteEvent = events.some((event: string) => 
          event.includes('.delete') || 
          event.includes('documents.delete') ||
          event.includes('.documents.*.delete')
        );
        
        // Check if this is a leave event
        const isLeaveEvent = events.some((event: string) => 
          event.includes(COLLECTIONS.LEAVES)
        );
        
        // Check if this is a user event
        const isUserEvent = events.some((event: string) => 
          event.includes(COLLECTIONS.USERS)
        );
        
        if (hasCreateEvent || hasUpdateEvent || hasDeleteEvent) {
          const eventType = hasCreateEvent ? 'CREATE' : hasUpdateEvent ? 'UPDATE' : 'DELETE';
          
          try {
            if (isUserEvent) {
              // Handle user updates (name changes, etc.)
              if (hasCreateEvent || hasUpdateEvent) {
                setAllUsers(prevUsers => {
                  const filteredUsers = prevUsers.filter(u => u.$id !== payload.$id);
                  if (payload && payload.$id) {
                    const updatedUser: User = {
                      $id: payload.$id,
                      firstName: payload.firstName,
                      lastName: payload.lastName,
                      username: payload.username,
                      email: payload.email,
                      role: payload.role,
                      manager: payload.manager,
                      paidLeaves: payload.paidLeaves || 0,
                      sickLeaves: payload.sickLeaves || 0,
                      compOffs: payload.compOffs || 0,
                      $createdAt: payload.$createdAt || new Date().toISOString(),
                      $updatedAt: payload.$updatedAt || new Date().toISOString()
                    };
                    return [...filteredUsers, updatedUser];
                  }
                  return filteredUsers;
                });
                
                toast({
                  title: "Team Updated",
                  description: "Team member information updated",
                  duration: 2000,
                  className: "border-blue-500 bg-blue-50 text-blue-900"
                });
              } else if (hasDeleteEvent) {
                setAllUsers(prevUsers => prevUsers.filter(u => u.$id !== payload.$id));
                toast({
                  title: "Team Updated", 
                  description: "Team member removed",
                  duration: 2000,
                  variant: "destructive"
                });
              }
            } else if (isLeaveEvent) {
              // For leave events, refetch schedule data to update employee filtering and display
              setTimeout(() => {
                silentRefetchScheduleData();
              }, 100);
              
              // Show toast notification for leave changes
              const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'cancelled';
              toast({
                title: "Leave Status Updated",
                description: `Leave request ${eventTypeText} - schedule updated`,
                duration: 2000,
                variant: hasDeleteEvent ? "destructive" : "default",
                className: hasDeleteEvent ? "" : "border-green-500 bg-green-50 text-green-900"
              });
            } else {
              // Handle shift events
              if (hasCreateEvent || hasUpdateEvent) {
                // For CREATE/UPDATE: Update shifts directly

                setShifts(prevShifts => {
                  const filteredShifts = prevShifts.filter(s => s.$id !== payload.$id);
                  if (eventType === 'CREATE' || (eventType === 'UPDATE' && payload.status !== 'CANCELLED')) {
                    const newShift: Shift = {
                      $id: payload.$id,
                      userId: payload.userId,
                      date: payload.date,
                      startTime: payload.startTime,
                      endTime: payload.endTime,
                      type: payload.type,
                      onCallRole: payload.onCallRole,
                      status: payload.status || 'SCHEDULED',
                      createdAt: payload.createdAt || new Date().toISOString(),
                      updatedAt: payload.updatedAt || new Date().toISOString(),
                      $createdAt: payload.$createdAt || new Date().toISOString(),
                      $updatedAt: payload.$updatedAt || new Date().toISOString()
                    };
                    
                    return [...filteredShifts, newShift];
                  }
                  return filteredShifts;
                });
              } else if (hasDeleteEvent) {
                // For DELETE: Remove shift directly
                setShifts(prevShifts => {
                  const filtered = prevShifts.filter(s => s.$id !== payload.$id);
                  
                  return filtered;
                });
              }
              
              // Show toast notification for shift events
              const eventTypeText = hasCreateEvent ? 'created' : hasUpdateEvent ? 'updated' : 'deleted';
              toast({
                title: "Schedule Updated",
                description: `Assignment ${eventTypeText} instantly`,
                duration: 2000,
                variant: hasDeleteEvent ? "destructive" : "default",
                className: hasDeleteEvent ? "" : "border-green-500 bg-green-50 text-green-900"
              });
            }
            
          } catch {

            // Fallback to silent refetch only if instant update fails
            setTimeout(() => {
              silentRefetchScheduleData();
            }, 100);
          }
        }
      }
    );

    return () => {
      
      unsubscribe();
    };
  }, [user, viewMode, toast, silentRefetchScheduleData]);

  // Auto-completion of past shifts (daily check)
  useEffect(() => {
    if (!user || (user.role !== 'MANAGER' && user.role !== 'ADMIN')) return;

    const checkAndAutoComplete = async () => {
      try {
        const response = await fetch('/api/schedule/auto-complete', {
          method: 'POST',
        });
        
        if (response.ok) {
          const result = await response.json();
          if (result.updatedShifts > 0) {
            toast({
              title: "Shifts Auto-Completed",
              description: `${result.updatedShifts} past shifts marked as completed`,
              duration: 3000,
              className: "border-green-500 bg-green-50 text-green-900"
            });
            
            // Refresh schedule data to show updates
            await silentRefetchScheduleData();
          }
        }
      } catch {

      }
    };

    // Run immediately on component mount
    checkAndAutoComplete();

    // Set up daily check at midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 12:01 AM

    const timeUntilMidnight = tomorrow.getTime() - now.getTime();

    // Set timeout for first midnight check
    const firstTimeout = setTimeout(() => {
      checkAndAutoComplete();
      
      // Then set up daily interval
      const dailyInterval = setInterval(checkAndAutoComplete, 24 * 60 * 60 * 1000);
      
      return () => clearInterval(dailyInterval);
    }, timeUntilMidnight);

    return () => clearTimeout(firstTimeout);
  }, [user, toast, silentRefetchScheduleData]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setDate(prev.getDate() - 7);
      } else {
        newDate.setDate(prev.getDate() + 7);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    // Trigger highlight animation
    setTodayHighlight(true);
    // Remove highlight after animation completes
    setTimeout(() => setTodayHighlight(false), 2000);
  };

  const assignEmployee = async (date: string, role: 'primary' | 'backup', userId: string) => {
    const loadingKey = `${date}-${role}`;
    
    try {
      // Set loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      // Check if user is already assigned to the opposite role on the same date
      const oppositeRole = role === 'primary' ? 'BACKUP' : 'PRIMARY';
      const oppositeRoleShift = shifts.find(s => {
        const shiftDate = s.date.split('T')[0];
        return shiftDate === date && s.onCallRole === oppositeRole && s.userId === userId;
      });
      
      if (oppositeRoleShift) {
        toast({
          variant: "destructive",
          title: "Assignment Failed",
          description: `This employee is already assigned as ${oppositeRole.toLowerCase()} on this date.`,
        });
        return;
      }
      
      // Convert to uppercase for database
      const dbRole = role.toUpperCase() as 'PRIMARY' | 'BACKUP';
      
      // Check if shift already exists for this date and role (normalize date comparison)
      const existingShift = shifts.find(s => {
        const shiftDate = s.date.split('T')[0]; // Extract date part
        return shiftDate === date && s.onCallRole === dbRole;
      });
      
      if (existingShift) {
        // Update existing shift with new user
        await shiftService.updateShift(existingShift.$id, { userId }, `${user?.firstName} ${user?.lastName}`);
        toast({
          title: "Assignment Updated",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment updated successfully.`,
          className: "border-green-500 bg-green-50 text-green-900"
        });
      } else {
        // Create new shift
        await shiftService.createShift({
          userId,
          date,
          onCallRole: dbRole,
          status: 'SCHEDULED'
        }, `${user?.firstName} ${user?.lastName}`); // Pass assigned by info
        toast({
          title: "Assignment Created",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment created successfully.`,
          className: "border-green-500 bg-green-50 text-green-900"
        });
      }

      // Refresh data
      await fetchScheduleData();
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error instanceof Error ? error.message : "Failed to assign employee. Please try again.",
      });
    } finally {
      // Clear loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const removeAssignment = async (date: string, role: 'primary' | 'backup') => {
    const loadingKey = `${date}-${role}-remove`;
    
    try {
      // Set loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: true }));
      
      // Convert to uppercase for database lookup
      const dbRole = role.toUpperCase() as 'PRIMARY' | 'BACKUP';
      
      // Find shift to remove (normalize date comparison)
      const shiftToRemove = shifts.find(s => {
        const shiftDate = s.date.split('T')[0]; // Extract date part
        return shiftDate === date && s.onCallRole === dbRole;
      });
      
      if (shiftToRemove) {
        await shiftService.deleteShift(shiftToRemove.$id);
        toast({
          title: "Assignment Removed",
          description: `${role.charAt(0).toUpperCase() + role.slice(1)} assignment removed successfully.`,
          className: "border-green-500 bg-green-50 text-green-900"
        });
        await fetchScheduleData();
      } else {
        toast({
          variant: "destructive",
          title: "No Assignment Found",
          description: `No ${role} assignment found for this date.`,
        });
      }
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Removal Failed",
        description: error instanceof Error ? error.message : "Failed to remove assignment. Please try again.",
      });
    } finally {
      // Clear loading state
      setLoadingStates(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await fetchScheduleData();
      toast({
        title: "Data Refreshed",
        description: "Schedule data has been updated successfully.",
        className: "border-green-500 bg-green-50 text-green-900"
      });
    } catch {

      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Failed to refresh data. Please try again.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!user) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <CalendarIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Please log in to view the schedule.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="grid grid-cols-1 gap-8 lg:flex lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400">
              Schedule Management
            </h1>
            <p className="text-muted-foreground mt-1">
              {user.role === 'EMPLOYEE' ? 'View your scheduled shifts' : 'Manage team schedule and assignments'}
            </p>
          </div>
          
          <div className="flex items-center flex-wrap gap-4">
            {/* Import/Export Buttons - Only for Managers */}
            {(user.role === 'MANAGER' || user.role === 'ADMIN') && (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsImportDialogOpen(true)}
                  className="h-8 px-3 text-xs bg-green-200"
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Import
                </Button>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsExportDialogOpen(true)}
                  className="h-8 px-3 text-xs bg-blue-200"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowRepeatShiftsDialog(true)}
                  className="h-8 px-3 text-xs bg-purple-200 border-purple-300 hover:bg-purple-300"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  <Repeat className="h-3 w-3 mr-1" />
                  Repeat Shifts
                </Button>
              </>
            )}
            
            {/* Refresh Button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshData}
              disabled={isRefreshing}
              className="h-8 px-3 text-xs bg-zinc-500 text-white"
            >
              {isRefreshing ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3 mr-1" />
              )}
              Refresh
            </Button>
          
          </div>
        </div>

        {/* Schedule Header with View Toggle */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  <span className="hidden sm:inline">{viewMode === 'week' ? 'Weekly Schedule' : 'Monthly Schedule'}</span>
                  <span className="sm:hidden">{viewMode === 'week' ? 'Week' : 'Month'}</span>
                </CardTitle>
                
                {/* View Mode Toggle - Mobile positioned */}
                <div className="flex md:hidden">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                    className="rounded-l-none"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* Month/Year Display and Navigation */}
              <div className="flex items-center justify-between md:justify-center">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => viewMode === 'month' ? navigateMonth('prev') : navigateWeek('prev')} 
                  className="p-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <h2 className="text-lg md:text-xl font-semibold px-4 text-center min-w-[140px] md:min-w-[180px]">
                  {viewMode === 'month' ? (
                    <>
                      <span className="hidden sm:inline">{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</span>
                      <span className="sm:hidden">{monthNames[currentDate.getMonth()].slice(0, 3)} {currentDate.getFullYear()}</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Week of {getWeekStartDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      <span className="sm:hidden">Week {getWeekStartDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </>
                  )}
                </h2>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => viewMode === 'month' ? navigateMonth('next') : navigateWeek('next')} 
                  className="p-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              
              {/* View Mode Toggle and Actions - Desktop */}
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  className="mr-2"
                >
                  Today
                </Button>
                <div className="flex">
                  <Button
                    variant={viewMode === 'month' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('month')}
                    className="rounded-r-none"
                  >
                    <Grid3X3 className="h-4 w-4 mr-2" />
                    Month
                  </Button>
                  <Button
                    variant={viewMode === 'week' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('week')}
                    className="rounded-l-none"
                  >
                    <CalendarDays className="h-4 w-4 mr-2" />
                    Week
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Calendar Card */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0 overflow-hidden">
            {viewMode === 'month' ? (
              <>
                {/* Monthly Calendar Grid */}
                <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
                  {dayNames.map((day) => (
                    <div key={day} className="p-2 md:p-3 text-center font-medium text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 last:border-r-0">
                      <span className="hidden sm:inline">{day}</span>
                      <span className="sm:hidden">{day.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>
                
                {/* Calendar Days */}
                <div className="grid grid-cols-7">
                  {calendar.map((day, index) => {
                    const isToday = day.date === new Date().toISOString().split('T')[0];
                    const isWeekend = index % 7 === 0 || index % 7 === 6; // Sunday (0) or Saturday (6)
                    
                    // Background classes based on day type
                    let backgroundClass = !day.isCurrentMonth ? 'bg-slate-50 dark:bg-slate-800/50' : 'bg-white dark:bg-slate-900';
                    if (isToday && day.isCurrentMonth) {
                      backgroundClass = `bg-gradient-to-b from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/20 border-2 border-blue-300 dark:border-blue-600 ${
                        todayHighlight ? 'animate-pulse ring-4 ring-blue-400 ring-opacity-75 shadow-lg shadow-blue-200 dark:shadow-blue-900 transition-all duration-500' : ''
                      }`;
                    } else if (isWeekend && day.isCurrentMonth) {
                      backgroundClass = 'bg-gradient-to-b from-orange-50 to-amber-25 dark:from-orange-900/20 dark:to-amber-900/10';
                    }
                    
                    return (
                      <div
                        key={`${day.date}-${index}`}
                        className={`min-h-[80px] md:min-h-[120px] border-r border-b border-slate-200 dark:border-slate-700 last:border-r-0 p-1 md:p-2 ${backgroundClass}`}
                      >
                        {/* Day Number */}
                        <div className={`text-xs md:text-sm font-medium mb-1 md:mb-2 ${
                          !day.isCurrentMonth ? 'text-slate-400' : 
                          isToday ? `text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800 rounded-full w-5 h-5 md:w-6 md:h-6 flex items-center justify-center text-xs font-bold ${
                            todayHighlight ? 'animate-bounce bg-blue-300 dark:bg-blue-700 scale-110 transition-all duration-300' : ''
                          }` :
                          isWeekend ? 'text-orange-600 dark:text-orange-400 font-semibold' :
                          'text-slate-900 dark:text-slate-100'
                        }`}>
                          {day.day}
                        </div>
                      
                      {/* Assignments */}
                      <div className="space-y-0.5 md:space-y-1">
                        {/* Primary Assignment */}
                        {day.shifts.primary ? (
                          <div className={`text-xs px-1 md:px-2 py-0.5 md:py-1 rounded flex items-center justify-between ${
                            day.shiftStatus?.primary === 'COMPLETED' 
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              : 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200'
                          }`}>
                            <span className="truncate">
                              <span className="hidden sm:inline">
                                P: {day.shifts.primary.firstName?.toUpperCase()}
                                {day.shiftStatus?.primary === 'COMPLETED' && ' ✓'}
                              </span>
                              <span className="sm:hidden">
                                P{day.shiftStatus?.primary === 'COMPLETED' && ' ✓'}
                              </span>
                            </span>
                            {(user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`h-4 w-4 p-0 ${
                                      day.shiftStatus?.primary === 'COMPLETED'
                                        ? 'hover:bg-gray-200 dark:hover:bg-gray-700'
                                        : 'hover:bg-pink-200 dark:hover:bg-pink-800'
                                    }`}
                                    disabled={loadingStates[`${day.date}-primary`] || loadingStates[`${day.date}-primary-remove`]}
                                  >
                                    {loadingStates[`${day.date}-primary`] || loadingStates[`${day.date}-primary-remove`] ? (
                                      <Loader2 className="h-2 w-2 animate-spin" />
                                    ) : (
                                      <Plus className="h-2 w-2" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel>Change Primary</DropdownMenuLabel>
                                  {getAssignableUsersForDate(day.date).map((employee) => (
                                    <DropdownMenuItem
                                      key={`primary-${employee.$id}`}
                                      onClick={() => assignEmployee(day.date, 'primary', employee.$id)}
                                      className="text-sm"
                                      disabled={loadingStates[`${day.date}-primary`]}
                                    >
                                      {employee.firstName} {employee.lastName}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => removeAssignment(day.date, 'primary')}
                                    className="text-sm text-red-600"
                                    disabled={loadingStates[`${day.date}-primary-remove`]}
                                  >
                                    {loadingStates[`${day.date}-primary-remove`] ? (
                                      <>
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        Removing...
                                      </>
                                    ) : (
                                      'Remove Primary'
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        ) : (
                          (user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  className="w-full h-6 md:h-7 text-xs border-2 border-dashed border-pink-300 dark:border-pink-700 text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950"
                                  disabled={loadingStates[`${day.date}-primary`]}
                                >
                                  {loadingStates[`${day.date}-primary`] ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3 mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {loadingStates[`${day.date}-primary`] ? 'Assigning...' : 'Primary'}
                                  </span>
                                  <span className="sm:hidden">P</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>Assign Primary</DropdownMenuLabel>
                                {getAssignableUsersForDate(day.date).map((employee) => (
                                  <DropdownMenuItem
                                    key={`primary-${employee.$id}`}
                                    onClick={() => assignEmployee(day.date, 'primary', employee.$id)}
                                    className="text-sm"
                                    disabled={loadingStates[`${day.date}-primary`]}
                                  >
                                    {employee.firstName} {employee.lastName}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1 md:px-2 py-0.5 md:py-1 rounded border-2 border-dashed">
                              <span className="hidden sm:inline">No Primary</span>
                              <span className="sm:hidden">-</span>
                            </div>
                          )
                        )}
                        
                        {/* Backup Assignment */}
                        {day.shifts.backup ? (
                          <div className={`text-xs px-1 md:px-2 py-0.5 md:py-1 rounded flex items-center justify-between ${
                            day.shiftStatus?.backup === 'COMPLETED' 
                              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                              : 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200'
                          }`}>
                            <span className="truncate">
                              <span className="hidden sm:inline">
                                B: {day.shifts.backup.firstName?.toUpperCase()}
                                {day.shiftStatus?.backup === 'COMPLETED' && ' ✓'}
                              </span>
                              <span className="sm:hidden">
                                B{day.shiftStatus?.backup === 'COMPLETED' && ' ✓'}
                              </span>
                            </span>
                            {(user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={`h-4 w-4 p-0 ${
                                      day.shiftStatus?.backup === 'COMPLETED'
                                        ? 'hover:bg-gray-200 dark:hover:bg-gray-700'
                                        : 'hover:bg-purple-200 dark:hover:bg-purple-800'
                                    }`}
                                    disabled={loadingStates[`${day.date}-backup`] || loadingStates[`${day.date}-backup-remove`]}
                                  >
                                    {loadingStates[`${day.date}-backup`] || loadingStates[`${day.date}-backup-remove`] ? (
                                      <Loader2 className="h-2 w-2 animate-spin" />
                                    ) : (
                                      <Plus className="h-2 w-2" />
                                    )}
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-48">
                                  <DropdownMenuLabel>Change Backup</DropdownMenuLabel>
                                  {getAssignableUsersForDate(day.date).map((employee) => (
                                    <DropdownMenuItem
                                      key={`backup-${employee.$id}`}
                                      onClick={() => assignEmployee(day.date, 'backup', employee.$id)}
                                      className="text-sm"
                                      disabled={loadingStates[`${day.date}-backup`]}
                                    >
                                      {employee.firstName} {employee.lastName}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => removeAssignment(day.date, 'backup')}
                                    className="text-sm text-red-600"
                                    disabled={loadingStates[`${day.date}-backup-remove`]}
                                  >
                                    {loadingStates[`${day.date}-backup-remove`] ? (
                                      <>
                                        <Loader2 className="h-3 w-3 mr-2 animate-spin" />
                                        Removing...
                                      </>
                                    ) : (
                                      'Remove Backup'
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        ) : (
                          (user.role === 'MANAGER' || user.role === 'ADMIN') && day.isCurrentMonth ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  className="w-full h-6 md:h-7 text-xs border-2 border-dashed border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950"
                                  disabled={loadingStates[`${day.date}-backup`]}
                                >
                                  {loadingStates[`${day.date}-backup`] ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3 mr-1" />
                                  )}
                                  <span className="hidden sm:inline">
                                    {loadingStates[`${day.date}-backup`] ? 'Assigning...' : 'Backup'}
                                  </span>
                                  <span className="sm:hidden">B</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                <DropdownMenuLabel>Assign Backup</DropdownMenuLabel>
                                {getAssignableUsersForDate(day.date).map((employee) => (
                                  <DropdownMenuItem
                                    key={`backup-${employee.$id}`}
                                    onClick={() => assignEmployee(day.date, 'backup', employee.$id)}
                                    className="text-sm"
                                    disabled={loadingStates[`${day.date}-backup`]}
                                  >
                                    {employee.firstName} {employee.lastName}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <div className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1 md:px-2 py-0.5 md:py-1 rounded border-2 border-dashed">
                              <span className="hidden sm:inline">No Backup</span>
                              <span className="sm:hidden">-</span>
                            </div>
                          )
                        )}
                        
                        {/* Employees on Leave */}
                        {day.employeesOnLeave && day.employeesOnLeave.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {day.employeesOnLeave.map((employeeOnLeave, index) => (
                              <div key={index} className="text-xs flex items-center gap-1">
                                <div 
                                  className={`w-2 h-2 rounded-full ${getLeaveTypeColor(employeeOnLeave.leaveType)}`}
                                  title={employeeOnLeave.leaveType}
                                />
                                <span className="text-gray-600 dark:text-gray-400 truncate">
                                  {employeeOnLeave.userName}
                                </span>
                                <span className="text-gray-500 dark:text-gray-500 text-xs">
                                  {getLeaveTypeIcon(employeeOnLeave.leaveType)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </>
            ) : (
              /* Weekly View */
              <WeeklySchedule 
                user={user} 
                teamMembers={allUsers}
                isScheduleManagement={true}
                externalWeekStartDate={getWeekStartDate()}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Export Schedule</DialogTitle>
            <DialogDescription>
              Select the date range to export schedule data as Excel file.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDate" className="text-right">
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                value={exportStartDate}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDate" className="text-right">
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                value={exportEndDate}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExportDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleExportSchedule}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Excel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog 
        open={isImportDialogOpen} 
        onOpenChange={(open) => {
          // Only allow closing if not importing
          if (!isImporting) {
            setIsImportDialogOpen(open);
            if (!open) {
              setImportFile(null);
              setImportProgress(0);
            }
          }
        }}
      >
        <DialogContent 
          className="sm:max-w-[425px]"
          onEscapeKeyDown={(e) => {
            // Prevent closing with Escape key during import
            if (isImporting) {
              e.preventDefault();
            }
          }}
          onPointerDownOutside={(e) => {
            // Prevent closing by clicking outside during import
            if (isImporting) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Import Schedule</DialogTitle>
            <DialogDescription>
              Upload an Excel file with schedule data. The file should have columns: Primary, Backup, Date, Day.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="importFile" className="text-right">
                Excel File
              </Label>
              <Input
                id="importFile"
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                className="col-span-3"
                disabled={isImporting}
              />
            </div>
            
            {/* Progress Bar */}
            {isImporting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Import Progress</span>
                  <span>{Math.round(importProgress)}%</span>
                </div>
                <Progress value={importProgress} className="w-full" />
                <p className="text-xs text-muted-foreground text-center">
                  {importProgress < 30 ? 'Reading file...' :
                   importProgress < 40 ? 'Validating data...' :
                   importProgress < 90 ? 'Creating shifts...' :
                   'Finalizing import...'}
                </p>
              </div>
            )}
            
            <div className="text-sm text-muted-foreground">
              <p><strong>File Format:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Primary: Username of primary on-call employee</li>
                <li>Backup: Username of backup on-call employee</li>
                <li>Date: Date in YYYY-MM-DD format (Excel dates will be auto-converted)</li>
                <li>Day: Day of the week</li>
              </ul>
              <p className="mt-2 text-xs text-amber-600">
                <strong>Note:</strong> Users not found in the system will be skipped. Date format issues will be automatically handled.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                setImportFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImportSchedule}
              disabled={isImporting || !importFile}
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Excel
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Summary Dialog */}
      <Dialog open={showImportSummary} onOpenChange={setShowImportSummary}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Import Summary</DialogTitle>
            <DialogDescription>
              Here&apos;s a detailed summary of your schedule import operation.
            </DialogDescription>
          </DialogHeader>
          
          {importSummary && (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{importSummary.totalRows}</div>
                  <div className="text-sm text-muted-foreground">Total Rows</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{importSummary.successfulShifts}</div>
                  <div className="text-sm text-muted-foreground">Shifts Created</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{importSummary.errors.length}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>

              {/* Success Rate */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Success Rate</span>
                  <span>{Math.round((importSummary.successfulShifts / (importSummary.totalRows * 2)) * 100)}%</span>
                </div>
                <Progress 
                  value={(importSummary.successfulShifts / (importSummary.totalRows * 2)) * 100} 
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Based on potential shifts (each row can create up to 2 shifts: Primary + Backup)
                </p>
              </div>

              {/* Warnings */}
              {importSummary.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-amber-600">⚠️ Warnings ({importSummary.warnings.length})</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importSummary.warnings.slice(0, 10).map((warning, index) => (
                      <div key={index} className="text-sm text-amber-700 bg-amber-50 p-2 rounded">
                        {warning}
                      </div>
                    ))}
                    {importSummary.warnings.length > 10 && (
                      <div className="text-xs text-muted-foreground text-center">
                        ... and {importSummary.warnings.length - 10} more warnings
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Errors */}
              {importSummary.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-600">❌ Errors ({importSummary.errors.length})</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importSummary.errors.slice(0, 10).map((error, index) => (
                      <div key={index} className="text-sm text-red-700 bg-red-50 p-2 rounded">
                        {error}
                      </div>
                    ))}
                    {importSummary.errors.length > 10 && (
                      <div className="text-xs text-muted-foreground text-center">
                        ... and {importSummary.errors.length - 10} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                <h4 className="font-medium text-blue-600 mb-2">💡 Recommendations</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  {importSummary.warnings.some(w => w.includes('Missing user')) && (
                    <li>• Ensure all usernames in your Excel file exist in the system</li>
                  )}
                  {importSummary.errors.some(e => e.includes('date')) && (
                    <li>• Check date formats in your Excel file (use YYYY-MM-DD or Excel date format)</li>
                  )}
                  {importSummary.successfulShifts > 0 && (
                    <li>• Successfully imported shifts are now visible in the schedule</li>
                  )}
                  <li>• Past shifts are automatically marked as completed with comp-offs for weekends</li>
                </ul>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowImportSummary(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Repeat Shifts Dialog */}
      <Dialog open={showRepeatShiftsDialog} onOpenChange={setShowRepeatShiftsDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              Repeat Shifts
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
                Special Feature
              </span>
            </DialogTitle>
            <DialogDescription>
              Copy shifts from a source date range and repeat them to a target date range with flexible scheduling.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            {/* Source Date Range */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <Label className="text-sm font-semibold text-blue-700">Source Pattern (Copy From)</Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sourceStartDate" className="text-xs">Start Date</Label>
                  <Input
                    id="sourceStartDate"
                    type="date"
                    value={repeatShiftsData.sourceStartDate}
                    onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, sourceStartDate: e.target.value }))}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="sourceEndDate" className="text-xs">End Date</Label>
                  <Input
                    id="sourceEndDate"
                    type="date"
                    value={repeatShiftsData.sourceEndDate}
                    onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, sourceEndDate: e.target.value }))}
                    className="h-9"
                  />
                </div>
              </div>
            </div>

            {/* Target Date Range */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <Label className="text-sm font-semibold text-green-700">Target Range (Apply To)</Label>
              </div>
              
              <div>
                <Label htmlFor="targetStartDate" className="text-xs">Target Start Date</Label>
                <Input
                  id="targetStartDate"
                  type="date"
                  value={repeatShiftsData.targetStartDate}
                  onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, targetStartDate: e.target.value }))}
                  className="h-9"
                />
              </div>

              {/* Toggle between end date and duration */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="useEndDate"
                    checked={repeatShiftsData.useEndDate}
                    onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, useEndDate: e.target.checked }))}
                    className="h-4 w-4 text-purple-600 rounded border-gray-300"
                  />
                  <Label htmlFor="useEndDate" className="text-xs">Specify target end date</Label>
                </div>

                {repeatShiftsData.useEndDate ? (
                  <div>
                    <Label htmlFor="targetEndDate" className="text-xs">Target End Date</Label>
                    <Input
                      id="targetEndDate"
                      type="date"
                      value={repeatShiftsData.targetEndDate}
                      onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, targetEndDate: e.target.value }))}
                      className="h-9"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="repeatDuration" className="text-xs">Duration</Label>
                      <Input
                        id="repeatDuration"
                        type="number"
                        min="1"
                        value={repeatShiftsData.repeatDuration}
                        onChange={(e) => setRepeatShiftsData(prev => ({ ...prev, repeatDuration: e.target.value }))}
                        className="h-9"
                      />
                    </div>
                    <div>
                      <Label htmlFor="repeatUnit" className="text-xs">Unit</Label>
                      <Select
                        value={repeatShiftsData.repeatUnit}
                        onValueChange={(value) => setRepeatShiftsData(prev => ({ ...prev, repeatUnit: value }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="weeks">Weeks</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Repeat className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">How it works</span>
              </div>
              <ul className="text-xs text-purple-700 space-y-1">
                <li>• Copy shifts from source date range (any period)</li>
                <li>• Apply pattern to target dates starting from target start date</li>
                <li>• Source day pattern maps to target days cyclically</li>
                <li>• Same PRIMARY/BACKUP users maintained</li>
                <li>• Duplicate shifts are automatically skipped</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowRepeatShiftsDialog(false)}
              disabled={isRepeatingShifts}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleRepeatShifts}
              disabled={
                isRepeatingShifts || 
                !repeatShiftsData.sourceStartDate || 
                !repeatShiftsData.sourceEndDate || 
                !repeatShiftsData.targetStartDate ||
                (repeatShiftsData.useEndDate && !repeatShiftsData.targetEndDate) ||
                (!repeatShiftsData.useEndDate && (!repeatShiftsData.repeatDuration || parseInt(repeatShiftsData.repeatDuration) <= 0))
              }
              className="bg-purple-600 hover:bg-purple-700"
            >
              {isRepeatingShifts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Shifts...
                </>
              ) : (
                <>
                  <Repeat className="mr-2 h-4 w-4" />
                  Repeat Shifts
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
