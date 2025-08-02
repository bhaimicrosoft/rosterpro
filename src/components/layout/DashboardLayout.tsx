'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetHeader,
} from '@/components/ui/sheet';
import {
  Calendar,
  Users,
  FileText,
  RotateCcw,
  Bell,
  Menu,
  LogOut,
  User,
  Shield,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  CheckCheck,
  AlertCircle,
  BarChart3,
} from 'lucide-react';
import { notificationService } from '@/lib/appwrite/database';
import { Notification } from '@/types';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  
  // Notification state
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [hasNewNotifications, setHasNewNotifications] = useState(false);
  
  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (user?.$id) {
        try {
          const userNotifications = await notificationService.getNotificationsByUser(user.$id);
          setNotifications(userNotifications);
        } catch {
          // Failed to fetch notifications
        }
      }
    };
    
    fetchNotifications();
  }, [user?.$id]);

  // Real-time notification updates
  useEffect(() => {
    if (!user?.$id) return;

    const unsubscribe = client.subscribe(
      [
        `databases.${DATABASE_ID}.collections.${COLLECTIONS.NOTIFICATIONS}.documents`,
      ],
      (response) => {
        const eventType = response.events[0];
        const payload = response.payload as Notification;

        // Only process notifications for current user
        if (payload.userId !== user.$id) return;

        if (eventType.includes('create')) {
          setNotifications(prev => [payload, ...prev]);
          setHasNewNotifications(true);
          
          // Auto-hide animation after 3 seconds
          setTimeout(() => setHasNewNotifications(false), 3000);
        } else if (eventType.includes('update')) {
          setNotifications(prev => 
            prev.map(n => n.$id === payload.$id ? payload : n)
          );
        } else if (eventType.includes('delete')) {
          setNotifications(prev => 
            prev.filter(n => n.$id !== payload.$id)
          );
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.$id]);

  // Get unread notification count
  const unreadCount = notifications.filter(n => !n.read).length;

  // Navigate to notification target
  const navigateToNotification = (notification: Notification) => {
    // Mark as read first
    markAsRead(notification.$id);
    setNotificationOpen(false);

    // Navigate based on notification type and related ID
    switch (notification.type) {
      case 'LEAVE_REQUEST':
        router.push('/home'); // Manager dashboard with leave requests
        break;
      case 'LEAVE_APPROVED':
      case 'LEAVE_REJECTED':
        router.push('/leaves'); // Employee leave page
        break;
      case 'SHIFT_SWAPPED':
        router.push('/swaps'); // Swap requests page
        break;
      case 'SHIFT_ASSIGNED':
        router.push('/schedule'); // Schedule page
        break;
      default:
        // For general notifications, stay on current page or go to dashboard
        router.push('/home');
    }
  };

    // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.$id === notificationId ? { ...n, read: true } : n)
      );
    } catch {
      // Failed to mark notification as read
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    if (user?.$id) {
      try {
        await notificationService.markAllAsRead(user.$id);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      } catch {
        // Failed to mark all notifications as read
      }
    }
  };

  // Format notification time
  const formatNotificationTime = (createdAt: string) => {
    const date = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'LEAVE_REQUEST':
        return <FileText className="h-3 w-3 text-blue-500" />;
      case 'LEAVE_APPROVED':
        return <CheckCheck className="h-3 w-3 text-green-500" />;
      case 'LEAVE_REJECTED':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'SHIFT_ASSIGNED':
        return <Calendar className="h-3 w-3 text-indigo-500" />;
      case 'SHIFT_SWAPPED':
        return <RotateCcw className="h-3 w-3 text-orange-500" />;
      default:
        return <Bell className="h-3 w-3 text-gray-500" />;
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const menuItems = [
    {
      title: 'Dashboard',
      icon: Shield,
      href: '/home',
      roles: ['admin', 'manager', 'employee', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
    },
    {
      title: 'Schedule',
      icon: Calendar,
      href: '/schedule',
      roles: ['admin', 'manager', 'employee', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
    },
    {
      title: 'Leave Requests',
      icon: FileText,
      href: '/leaves',
      roles: ['admin', 'manager', 'employee', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
    },
    {
      title: 'Swap Requests',
      icon: RotateCcw,
      href: '/swaps',
      roles: ['admin', 'manager', 'employee', 'ADMIN', 'MANAGER', 'EMPLOYEE'],
    },
    {
      title: 'Analytics',
      icon: BarChart3,
      href: '/analytics',
      roles: ['admin', 'manager', 'ADMIN', 'MANAGER'],
    },
    {
      title: 'Team Management',
      icon: Users,
      href: '/team',
      roles: ['admin', 'manager', 'ADMIN', 'MANAGER'],
    },
  ];

  const NavigationMenu = ({ collapsed = false }: { collapsed?: boolean }) => (
    <nav className="space-y-2">
      {/* Always show menu items, but handle access control at page level */}
      {menuItems.map((item) => {
        // Hide team management and analytics for non-managers  
        if ((item.title === 'Team Management' || item.title === 'Analytics') && user?.role !== 'MANAGER' && user?.role !== 'ADMIN') {
          return null;
        }

        // Special styling for Analytics button
        const isAnalytics = item.title === 'Analytics';
        
        if (collapsed) {
          return (
            <TooltipProvider key={item.href}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`w-full h-11 transition-all duration-300 ${
                      isAnalytics
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-purple-400 before:to-pink-400 before:opacity-0 hover:before:opacity-20 before:transition-opacity'
                        : 'hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 dark:hover:text-blue-300'
                    }`}
                    onClick={() => router.push(item.href)}
                  >
                    <item.icon className={`h-4 w-4 ${isAnalytics ? 'relative z-10' : ''}`} />
                    {isAnalytics && (
                      <Badge className="absolute -top-1 -right-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-1 py-0.5 animate-pulse shadow-lg z-10">
                        NEW
                      </Badge>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className={isAnalytics ? 'font-semibold text-purple-600' : ''}>{item.title}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        
        return (
          <Button
            key={item.href}
            variant="ghost"
            className={`w-full justify-start gap-3 h-11 transition-all duration-300 ${
              isAnalytics
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105 relative overflow-hidden before:absolute before:inset-0 before:bg-gradient-to-r before:from-purple-400 before:to-pink-400 before:opacity-0 hover:before:opacity-20 before:transition-opacity'
                : 'hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 dark:hover:text-blue-300'
            }`}
            onClick={() => router.push(item.href)}
          >
            <item.icon className={`h-4 w-4 ${isAnalytics ? 'relative z-10' : ''}`} />
            <span className={`${isAnalytics ? 'relative z-10 font-semibold' : ''}`}>
              {item.title}
            </span>
            {isAnalytics && (
              <Badge className="ml-auto bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-2 py-1 animate-pulse shadow-lg">
                NEW
              </Badge>
            )}
          </Button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md dark:bg-slate-800/80 border-b border-slate-200/60 dark:border-slate-700/60 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center justify-between px-3 sm:px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation Menu</SheetTitle>
                </SheetHeader>
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-6">
                    <Shield className="h-6 w-6 text-primary" />
                    <span className="font-bold text-lg">RosterPro</span>
                  </div>
                  <NavigationMenu />
                </div>
              </SheetContent>
            </Sheet>

            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hidden sm:block">RosterPro</span>
            </div>

            {/* Desktop sidebar toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="hidden md:flex hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  >
                    {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            {/* Refresh button - hidden on smaller screens */}
            <Button variant="ghost" size="icon" className="hidden sm:flex hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Notifications */}
            <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
              <PopoverTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={`relative hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 transition-all duration-200 ${
                    hasNewNotifications ? 'animate-bell-shake' : ''
                  } ${unreadCount > 0 ? 'animate-pulse-glow' : ''}`}
                >
                  <Bell className={`h-4 w-4 transition-all duration-300 ${
                    unreadCount > 0 ? 'text-blue-600 scale-110' : ''
                  }`} />
                  {unreadCount > 0 && (
                    <Badge className={`absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 notification-badge-pulse transition-all duration-300`}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-600" />
                    Notifications
                  </h3>
                  {notifications.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={markAllAsRead}
                      className="h-6 px-2 text-xs hover:bg-blue-100 dark:hover:bg-blue-800/30 transition-colors"
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="relative">
                        <Bell className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
                        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 h-16 w-16 border-2 border-dashed border-muted-foreground/20 rounded-full animate-pulse"></div>
                      </div>
                      <p className="text-sm text-muted-foreground">No notifications yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">You&apos;ll see updates here when they arrive</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                      {notifications.map((notification, index) => (
                        <div
                          key={notification.$id}
                          className={`notification-item p-4 cursor-pointer transition-all duration-200 hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 dark:hover:from-blue-900/10 dark:hover:to-indigo-900/10 ${
                            !notification.read 
                              ? 'bg-blue-50/30 dark:bg-blue-900/10 border-l-3 border-l-blue-500 relative before:absolute before:top-0 before:left-0 before:w-full before:h-full before:bg-gradient-to-r before:from-blue-500/5 before:to-transparent before:pointer-events-none' 
                              : ''
                          } ${index === 0 && hasNewNotifications ? 'animate-notification-slide' : ''}`}
                          onClick={() => navigateToNotification(notification)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className={`font-medium text-sm leading-tight ${
                                  !notification.read ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'
                                }`}>
                                  {notification.title}
                                </p>
                                {getNotificationIcon(notification.type)}
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                                {notification.message}
                              </p>
                              <div className="flex items-center justify-between mt-2">
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                  {formatNotificationTime(notification.$createdAt)}
                                </p>
                                {!notification.read && (
                                  <Badge variant="secondary" className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                    New
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {!notification.read && (
                              <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-2 animate-pulse" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {notifications.length > 0 && (
                  <div className="p-3 border-t bg-gray-50 dark:bg-gray-800/30">
                    <p className="text-xs text-center text-muted-foreground">
                      Click on notifications to view details
                    </p>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 h-9 px-2 sm:px-4">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback 
                      className="text-xs font-medium bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                    >
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-left hidden md:block">
                    <p className="text-sm font-medium">{user?.firstName} {user?.lastName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                  <ChevronDown className="h-3 w-3 hidden sm:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white/60 backdrop-blur-md dark:bg-slate-800/60 border-r border-slate-200/60 dark:border-slate-700/60 h-[calc(100vh-65px)] sticky top-[65px] transition-all duration-300 ease-in-out`}>
          <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} w-full transition-all duration-300 overflow-y-auto`}>
            <NavigationMenu collapsed={sidebarCollapsed} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 min-w-0 overflow-hidden">
          <div className="max-w-full">
            {children}
          </div>
        </main>
      </div>
      <Toaster />
    </div>
  );
};

export default DashboardLayout;
