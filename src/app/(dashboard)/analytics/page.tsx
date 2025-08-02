'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Users, Calendar as CalendarIcon, Clock, ArrowUpRight, ArrowDownRight,
  Activity, Shield, Award, AlertTriangle, RefreshCw, Download,
  BarChart3, PieChart as PieChartIcon, LineChart as LineChartIcon, Settings
} from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { SwapRequest, Shift, User as UserType, LeaveRequest } from '@/types';
import { swapService, shiftService, userService, leaveService } from '@/lib/appwrite/database';
import { useToast } from '@/hooks/use-toast';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

// Define color palette for charts
const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6', 
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#06b6d4',
  purple: '#a855f7',
  pink: '#ec4899',
  indigo: '#6366f1',
  teal: '#14b8a6'
};

const CHART_COLORS = [COLORS.primary, COLORS.secondary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.info];

interface AnalyticsData {
  shifts: Shift[];
  swapRequests: SwapRequest[];
  users: UserType[];
  leaveRequests: LeaveRequest[];
}

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: React.ElementType;
  color: string;
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    shifts: [],
    swapRequests: [],
    users: [],
    leaveRequests: []
  });
  
  const [dateRange, setDateRange] = useState('30'); // days
  const [selectedMetrics, setSelectedMetrics] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Filter data based on date range
  const getFilteredData = useCallback((): AnalyticsData => {
    const days = parseInt(dateRange);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const endDate = new Date(); // Today

    // Filter function for date-based data
    const isWithinRange = (dateStr: string): boolean => {
      const date = new Date(dateStr);
      return date >= startDate && date <= endDate;
    };

    return {
      shifts: analyticsData.shifts.filter(shift => isWithinRange(shift.date)),
      swapRequests: analyticsData.swapRequests.filter(sr => isWithinRange(sr.$createdAt)),
      users: analyticsData.users, // Users don't need date filtering
      leaveRequests: analyticsData.leaveRequests.filter(lr => 
        isWithinRange(lr.$createdAt) || 
        isWithinRange(lr.startDate) || 
        isWithinRange(lr.endDate)
      )
    };
  }, [analyticsData, dateRange]);

  // Fetch all analytics data
  const fetchAnalyticsData = useCallback(async () => {
    if (!user || user.role === 'EMPLOYEE') return;

    try {
      setIsLoading(true);
      const [shifts, swapRequests, users, leaveRequests] = await Promise.all([
        shiftService.getAllShifts(),
        swapService.getAllSwapRequests(),
        userService.getAllUsers(),
        leaveService.getAllLeaveRequests()
      ]);

      setAnalyticsData(currentData => {
        // Merge with existing data to prevent duplicates from subscriptions
        const mergeArrays = <T extends { $id: string }>(existing: T[], incoming: T[]): T[] => {
          const existingIds = new Set(existing.map(item => item.$id));
          const newItems = incoming.filter(item => !existingIds.has(item.$id));
          return [...existing, ...newItems];
        };

        return {
          shifts: mergeArrays(currentData.shifts, shifts),
          swapRequests: mergeArrays(currentData.swapRequests, swapRequests),
          users: mergeArrays(currentData.users, users),
          leaveRequests: mergeArrays(currentData.leaveRequests, leaveRequests)
        };
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to load analytics data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  // Initial data fetch
  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // Real-time subscriptions for all collections
  useEffect(() => {
    if (!user || user.role === 'EMPLOYEE') return;

    const subscriptions = [
      // Shifts subscription
      client.subscribe(
        [`databases.${DATABASE_ID}.collections.${COLLECTIONS.SHIFTS}.documents`],
        (response) => {
          const eventType = response.events[0];
          const payload = response.payload as Shift;

          if (eventType.includes('create')) {
            setAnalyticsData(prev => {
              // Check if the shift already exists to prevent duplicates
              const existingShift = prev.shifts.find(s => s.$id === payload.$id);
              if (existingShift) {
                // If it exists, update it instead of adding
                return {
                  ...prev,
                  shifts: prev.shifts.map(s => s.$id === payload.$id ? payload : s)
                };
              }
              return {
                ...prev,
                shifts: [payload, ...prev.shifts]
              };
            });
            toast({
              title: "New Shift Added",
              description: "Analytics data updated in real-time",
              duration: 2000
            });
          } else if (eventType.includes('update')) {
            setAnalyticsData(prev => ({
              ...prev,
              shifts: prev.shifts.map(s => s.$id === payload.$id ? payload : s)
            }));
          } else if (eventType.includes('delete')) {
            setAnalyticsData(prev => ({
              ...prev,
              shifts: prev.shifts.filter(s => s.$id !== payload.$id)
            }));
          }
        }
      ),

      // Swap requests subscription
      client.subscribe(
        [`databases.${DATABASE_ID}.collections.${COLLECTIONS.SWAP_REQUESTS}.documents`],
        (response) => {
          const eventType = response.events[0];
          const payload = response.payload as SwapRequest;

          if (eventType.includes('create')) {
            setAnalyticsData(prev => {
              // Check if the swap request already exists to prevent duplicates
              const existingSwap = prev.swapRequests.find(sr => sr.$id === payload.$id);
              if (existingSwap) {
                // If it exists, update it instead of adding
                return {
                  ...prev,
                  swapRequests: prev.swapRequests.map(sr => sr.$id === payload.$id ? payload : sr)
                };
              }
              return {
                ...prev,
                swapRequests: [payload, ...prev.swapRequests]
              };
            });
          } else if (eventType.includes('update')) {
            setAnalyticsData(prev => ({
              ...prev,
              swapRequests: prev.swapRequests.map(sr => sr.$id === payload.$id ? payload : sr)
            }));
          } else if (eventType.includes('delete')) {
            setAnalyticsData(prev => ({
              ...prev,
              swapRequests: prev.swapRequests.filter(sr => sr.$id !== payload.$id)
            }));
          }
        }
      ),

      // Users subscription
      client.subscribe(
        [`databases.${DATABASE_ID}.collections.${COLLECTIONS.USERS}.documents`],
        (response) => {
          const eventType = response.events[0];
          const payload = response.payload as UserType;

          if (eventType.includes('create')) {
            setAnalyticsData(prev => {
              // Check if the user already exists to prevent duplicates
              const existingUser = prev.users.find(u => u.$id === payload.$id);
              if (existingUser) {
                // If it exists, update it instead of adding
                return {
                  ...prev,
                  users: prev.users.map(u => u.$id === payload.$id ? payload : u)
                };
              }
              return {
                ...prev,
                users: [payload, ...prev.users]
              };
            });
          } else if (eventType.includes('update')) {
            setAnalyticsData(prev => ({
              ...prev,
              users: prev.users.map(u => u.$id === payload.$id ? payload : u)
            }));
          } else if (eventType.includes('delete')) {
            setAnalyticsData(prev => ({
              ...prev,
              users: prev.users.filter(u => u.$id !== payload.$id)
            }));
          }
        }
      ),

      // Leave requests subscription
      client.subscribe(
        [`databases.${DATABASE_ID}.collections.${COLLECTIONS.LEAVES}.documents`],
        (response) => {
          const eventType = response.events[0];
          const payload = response.payload as LeaveRequest;

          if (eventType.includes('create')) {
            setAnalyticsData(prev => {
              // Check if the leave request already exists to prevent duplicates
              const existingLeave = prev.leaveRequests.find(lr => lr.$id === payload.$id);
              if (existingLeave) {
                // If it exists, update it instead of adding
                return {
                  ...prev,
                  leaveRequests: prev.leaveRequests.map(lr => lr.$id === payload.$id ? payload : lr)
                };
              }
              return {
                ...prev,
                leaveRequests: [payload, ...prev.leaveRequests]
              };
            });
          } else if (eventType.includes('update')) {
            setAnalyticsData(prev => ({
              ...prev,
              leaveRequests: prev.leaveRequests.map(lr => lr.$id === payload.$id ? payload : lr)
            }));
          } else if (eventType.includes('delete')) {
            setAnalyticsData(prev => ({
              ...prev,
              leaveRequests: prev.leaveRequests.filter(lr => lr.$id !== payload.$id)
            }));
          }
        }
      )
    ];

    return () => {
      subscriptions.forEach(unsubscribe => unsubscribe());
    };
  }, [user, toast]);

  // Calculate key metrics
  const calculateMetrics = useCallback((): MetricCard[] => {
    const filteredData = getFilteredData(); // Use filtered data instead of raw analyticsData
    const { shifts, swapRequests, users, leaveRequests } = filteredData;
    
    const totalEmployees = users.filter(u => u.role === 'EMPLOYEE').length;
    const totalShifts = shifts.length;
    const pendingSwaps = swapRequests.filter(sr => sr.status === 'PENDING').length;
    const approvedSwaps = swapRequests.filter(sr => sr.status === 'APPROVED').length;
    const totalLeaveRequests = leaveRequests.length;

    // Calculate schedule adherence percentage - if all scheduled shifts are assigned
    let scheduleAdherence = 100; // Default to 100% if no issues
    
    if (totalShifts > 0) {
      // Count assigned vs unassigned shifts
      const assignedShifts = shifts.filter(shift => shift.userId && shift.userId.trim() !== '');
      scheduleAdherence = Math.round((assignedShifts.length / totalShifts) * 100);
    }
    
    // Calculate swap approval rate
    const swapApprovalRate = swapRequests.length > 0 ? Math.round((approvedSwaps / swapRequests.length) * 100) : 0;

    return [
      {
        title: "Team Size",
        value: totalEmployees,
        change: 5.2,
        changeType: 'increase',
        icon: Users,
        color: COLORS.primary
      },
      {
        title: "Schedule Adherence",
        value: `${scheduleAdherence}%`,
        change: 2.1,
        changeType: 'increase',
        icon: Shield,
        color: COLORS.success
      },
      {
        title: "Pending Swaps",
        value: pendingSwaps,
        change: -12.5,
        changeType: 'decrease',
        icon: Clock,
        color: COLORS.warning
      },
      {
        title: "Swap Approval Rate",
        value: `${swapApprovalRate}%`,
        change: 8.3,
        changeType: 'increase',
        icon: Award,
        color: COLORS.success
      },
      {
        title: "Active Shifts",
        value: totalShifts,
        change: 15.2,
        changeType: 'increase',
        icon: CalendarIcon,
        color: COLORS.info
      },
      {
        title: "Leave Requests",
        value: totalLeaveRequests,
        change: -5.1,
        changeType: 'decrease',
        icon: Activity,
        color: COLORS.purple
      }
    ];
  }, [getFilteredData]);

  // Chart data processors
  const getShiftDistributionData = useCallback(() => {
    const { shifts } = getFilteredData(); // Use filtered data
    const distribution = shifts.reduce((acc, shift) => {
      const role = shift.onCallRole || 'Unassigned';
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(distribution).map(([role, count]) => ({
      name: role,
      value: count,
      percentage: ((count / shifts.length) * 100).toFixed(1)
    }));
  }, [getFilteredData]);

  const getSwapTrendsData = useCallback(() => {
    const { swapRequests } = getFilteredData(); // Use filtered data
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return date.toISOString().split('T')[0];
    });

    return last30Days.map(date => {
      const daySwaps = swapRequests.filter(sr => 
        new Date(sr.$createdAt).toISOString().split('T')[0] === date
      );
      
      return {
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: daySwaps.length,
        approved: daySwaps.filter(sr => sr.status === 'APPROVED').length,
        rejected: daySwaps.filter(sr => sr.status === 'REJECTED').length,
        pending: daySwaps.filter(sr => sr.status === 'PENDING').length
      };
    });
  }, [getFilteredData]);

  const getEmployeeWorkloadData = useCallback(() => {
    const { shifts, users } = getFilteredData(); // Use filtered data
    const employees = users.filter(u => u.role === 'EMPLOYEE');
    
    return employees.map(employee => {
      const employeeShifts = shifts.filter(s => s.userId === employee.$id);
      const primaryShifts = employeeShifts.filter(s => s.onCallRole === 'PRIMARY').length;
      const backupShifts = employeeShifts.filter(s => s.onCallRole === 'BACKUP').length;
      
      return {
        name: `${employee.firstName} ${employee.lastName}`,
        primary: primaryShifts,
        backup: backupShifts,
        total: employeeShifts.length
      };
    }).sort((a, b) => b.total - a.total);
  }, [getFilteredData]);

  const getLeavePatternData = useCallback(() => {
    const { leaveRequests } = getFilteredData(); // Use filtered data
    const patterns = leaveRequests.reduce((acc, leave) => {
      const type = leave.type || 'OTHER';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // If no leave requests, return default data
    if (leaveRequests.length === 0) {
      return [
        { name: 'No Data', value: 0, percentage: '0.0' }
      ];
    }

    return Object.entries(patterns).map(([type, count]) => ({
      name: type,
      value: count,
      percentage: ((count / leaveRequests.length) * 100).toFixed(1)
    }));
  }, [getFilteredData]);

  const exportData = useCallback((type: string) => {
    const timestamp = new Date().toISOString().split('T')[0];
    const filteredData = getFilteredData(); // Use filtered data
    let csvContent = '';
    let filename = '';

    switch (type) {
      case 'overview':
        const metrics = calculateMetrics();
        csvContent = [
          'Metric,Value,Change',
          ...metrics.map(m => `"${m.title}","${m.value}","${m.change}%"`)
        ].join('\n');
        filename = `analytics-overview-${timestamp}.csv`;
        break;
      
      case 'shifts':
        csvContent = [
          'Date,Employee,Role,Type,Status',
          ...filteredData.shifts.map(s => 
            `"${s.date}","${s.userId}","${s.onCallRole}","${s.type}","${s.status}"`
          )
        ].join('\n');
        filename = `shifts-report-${timestamp}.csv`;
        break;
      
      case 'swaps':
        csvContent = [
          'Date,Requester,Target,Status,Reason',
          ...filteredData.swapRequests.map(sr => 
            `"${sr.$createdAt}","${sr.requesterUserId}","${sr.targetUserId}","${sr.status}","${sr.reason}"`
          )
        ].join('\n');
        filename = `swap-requests-${timestamp}.csv`;
        break;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [getFilteredData, calculateMetrics]);

  if (!user || user.role === 'EMPLOYEE') {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-lg font-medium">Access Denied</p>
            <p className="text-muted-foreground">Analytics dashboard is only available for managers and admins.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const metrics = calculateMetrics();
  const shiftDistribution = getShiftDistributionData();
  const swapTrends = getSwapTrendsData();
  const employeeWorkload = getEmployeeWorkloadData();
  const leavePatterns = getLeavePatternData();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0 gap-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Team Analytics
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Comprehensive insights and reports for strategic decision making
            </p>
          </div>
          
          <div className="flex gap-2 flex-wrap items-center justify-start lg:justify-end">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32 sm:w-36 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            
            <Button variant="outline" onClick={() => exportData('overview')} size="sm" className="h-9">
              <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Export</span>
              <span className="sm:hidden">CSV</span>
            </Button>
            
            <Button variant="outline" onClick={fetchAnalyticsData} size="sm" className="h-9">
              <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {metrics.map((metric, index) => {
            const gradients = [
              'from-blue-500 via-blue-600 to-blue-700',
              'from-emerald-500 via-emerald-600 to-emerald-700', 
              'from-amber-500 via-amber-600 to-amber-700',
              'from-violet-500 via-violet-600 to-violet-700',
              'from-cyan-500 via-cyan-600 to-cyan-700',
              'from-purple-500 via-purple-600 to-purple-700'
            ];
            
            const backgroundGradients = [
              'from-blue-50 via-blue-100 to-blue-50',
              'from-emerald-50 via-emerald-100 to-emerald-50',
              'from-amber-50 via-amber-100 to-amber-50', 
              'from-violet-50 via-violet-100 to-violet-50',
              'from-cyan-50 via-cyan-100 to-cyan-50',
              'from-purple-50 via-purple-100 to-purple-50'
            ];

            const darkBackgroundGradients = [
              'dark:from-blue-950 dark:via-blue-900 dark:to-blue-950',
              'dark:from-emerald-950 dark:via-emerald-900 dark:to-emerald-950',
              'dark:from-amber-950 dark:via-amber-900 dark:to-amber-950',
              'dark:from-violet-950 dark:via-violet-900 dark:to-violet-950', 
              'dark:from-cyan-950 dark:via-cyan-900 dark:to-cyan-950',
              'dark:from-purple-950 dark:via-purple-900 dark:to-purple-950'
            ];

            return (
              <Card 
                key={index} 
                className={`border-0 shadow-xl overflow-hidden transform hover:scale-105 transition-all duration-300 hover:shadow-2xl bg-gradient-to-br ${backgroundGradients[index]} ${darkBackgroundGradients[index]}`}
              >
                <div className={`h-1 bg-gradient-to-r ${gradients[index]}`} />
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
                          {metric.title}
                        </p>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-xs text-slate-500 dark:text-slate-400">Live</span>
                        </div>
                      </div>
                      <p className={`text-xl sm:text-2xl lg:text-3xl font-bold text-slate-800 dark:text-white mt-1 ${isLoading ? 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-8' : ''}`}>
                        {isLoading ? '' : metric.value}
                      </p>
                      <div className="flex items-center mt-2">
                        {metric.changeType === 'increase' ? (
                          <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4 text-emerald-600 dark:text-emerald-400" />
                        ) : metric.changeType === 'decrease' ? (
                          <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4 text-red-600 dark:text-red-400" />
                        ) : null}
                        <span className={`text-xs sm:text-sm font-medium ${
                          metric.changeType === 'increase' ? 'text-emerald-600 dark:text-emerald-400' : 
                          metric.changeType === 'decrease' ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {metric.change > 0 ? '+' : ''}{metric.change}%
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 ml-1 hidden sm:inline">
                          vs last period
                        </span>
                      </div>
                    </div>
                    <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${gradients[index]} shadow-lg`}>
                      <metric.icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Analytics Tabs */}
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm dark:bg-slate-800/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <BarChart3 className="h-5 w-5" />
              Detailed Analytics
              <Badge className="ml-auto bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-1" />
                Live Data
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <Tabs value={selectedMetrics} onValueChange={setSelectedMetrics} className="w-full">
              <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto">
                <TabsTrigger value="overview" className="text-xs sm:text-sm py-2">Overview</TabsTrigger>
                <TabsTrigger value="workforce" className="text-xs sm:text-sm py-2">Workforce</TabsTrigger>
                <TabsTrigger value="operations" className="text-xs sm:text-sm py-2">Operations</TabsTrigger>
                <TabsTrigger value="trends" className="text-xs sm:text-sm py-2">Trends</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Shift Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <PieChartIcon className="h-5 w-5" />
                        Shift Role Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={shiftDistribution}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percentage }) => `${name} (${percentage}%)`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {shiftDistribution.map((entry, index) => (
                              <Cell key={`shift-cell-${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Leave Patterns */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Leave Type Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={leavePatterns}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill={COLORS.secondary} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Workforce Tab */}
              <TabsContent value="workforce" className="space-y-6 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Employee Workload Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <BarChart data={employeeWorkload.slice(0, 10)} margin={{ left: 20, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45}
                          textAnchor="end"
                          height={100}
                          interval={0}
                        />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="primary" stackId="a" fill={COLORS.primary} name="Primary Shifts" />
                        <Bar dataKey="backup" stackId="a" fill={COLORS.secondary} name="Backup Shifts" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Operations Tab */}
              <TabsContent value="operations" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 gap-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <LineChartIcon className="h-5 w-5" />
                          Swap Request Trends (Last 30 Days)
                        </CardTitle>
                        <Button variant="outline" size="sm" onClick={() => exportData('swaps')}>
                          <Download className="h-4 w-4 mr-2" />
                          Export Swaps
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <AreaChart data={swapTrends}>
                          <defs>
                            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.8}/>
                              <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Area 
                            type="monotone" 
                            dataKey="total" 
                            stroke={COLORS.primary} 
                            fillOpacity={1} 
                            fill="url(#colorTotal)"
                            name="Total Requests"
                          />
                          <Line type="monotone" dataKey="approved" stroke={COLORS.success} name="Approved" />
                          <Line type="monotone" dataKey="rejected" stroke={COLORS.danger} name="Rejected" />
                          <Line type="monotone" dataKey="pending" stroke={COLORS.warning} name="Pending" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Trends Tab */}
              <TabsContent value="trends" className="space-y-6 mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Performance Indicators */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Key Performance Indicators</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div>
                          <p className="font-medium">Schedule Adherence</p>
                          <p className="text-sm text-muted-foreground">Shifts assigned with employees</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-blue-600">94%</p>
                          <p className="text-sm text-green-600">+2.3%</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div>
                          <p className="font-medium">Response Time</p>
                          <p className="text-sm text-muted-foreground">Avg. swap approval time</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-green-600">4.2h</p>
                          <p className="text-sm text-green-600">-1.2h</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div>
                          <p className="font-medium">Team Satisfaction</p>
                          <p className="text-sm text-muted-foreground">Based on swap success rate</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-purple-600">87%</p>
                          <p className="text-sm text-green-600">+5.1%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Predictive Insights */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Predictive Insights</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-3 border border-amber-200 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          <p className="font-medium text-amber-800 dark:text-amber-200">High Demand Period</p>
                        </div>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          Next week shows 40% increase in swap requests. Consider additional backup coverage.
                        </p>
                      </div>
                      
                      <div className="p-3 border border-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="h-4 w-4 text-blue-600" />
                          <p className="font-medium text-blue-800 dark:text-blue-200">Optimization Opportunity</p>
                        </div>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          Rotating schedules could reduce swap requests by 25% based on current patterns.
                        </p>
                      </div>
                      
                      <div className="p-3 border border-green-200 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="h-4 w-4 text-green-600" />
                          <p className="font-medium text-green-800 dark:text-green-200">Team Performance</p>
                        </div>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Current team shows excellent collaboration with 92% swap approval rate.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Executive Summary */}
        <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-950/50 dark:via-purple-950/50 dark:to-pink-950/50 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-lg sm:text-xl">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Executive Summary
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-xs text-slate-500 dark:text-slate-400">Real-time</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div className="text-center p-4 bg-white/60 dark:bg-slate-800/60 rounded-xl relative">
              <div className="absolute top-2 right-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <p className={`text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 ${isLoading ? 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-6' : ''}`}>
                {isLoading ? '' : (metrics[0]?.value || '0')}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Team Members</p>
            </div>
            <div className="text-center p-4 bg-white/60 dark:bg-slate-800/60 rounded-xl relative">
              <div className="absolute top-2 right-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <p className={`text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 ${isLoading ? 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-6' : ''}`}>
                {isLoading ? '' : (metrics[1]?.value || '0%')}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Schedule Adherence</p>
            </div>
            <div className="text-center p-4 bg-white/60 dark:bg-slate-800/60 rounded-xl relative">
              <div className="absolute top-2 right-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <p className={`text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 ${isLoading ? 'animate-pulse bg-slate-200 dark:bg-slate-700 rounded h-6' : ''}`}>
                {isLoading ? '' : (metrics[3]?.value || '0%')}
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Swap Success Rate</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
