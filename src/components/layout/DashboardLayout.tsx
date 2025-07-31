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
  Settings,
  User,
  Shield,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  CheckCheck,
} from 'lucide-react';
import { notificationService } from '@/lib/appwrite/notification-service';
import client, { DATABASE_ID, COLLECTIONS } from '@/lib/appwrite/config';
import { Notification } from '@/types';

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

  // Real-time subscription for notifications
  useEffect(() => {
    if (!user?.$id) return;

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.NOTIFICATIONS}.documents`,
      (response) => {
        const events = response.events || [];
        const payload = response.payload as { userId?: string; $id?: string } & Notification;
        
        // Check if this notification is for the current user
        if (payload?.userId === user.$id) {
          const hasCreateEvent = events.some((event: string) => 
            event.includes('.create') || event.includes('documents.create')
          );
          const hasUpdateEvent = events.some((event: string) => 
            event.includes('.update') || event.includes('documents.update')
          );
          const hasDeleteEvent = events.some((event: string) => 
            event.includes('.delete') || event.includes('documents.delete')
          );

          if (hasCreateEvent) {
            // Add new notification
            setNotifications(prev => [payload as Notification, ...prev]);
          } else if (hasUpdateEvent) {
            // Update existing notification
            setNotifications(prev => 
              prev.map(n => n.$id === payload.$id ? payload as Notification : n)
            );
          } else if (hasDeleteEvent) {
            // Remove deleted notification
            setNotifications(prev => prev.filter(n => n.$id !== payload.$id));
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.$id]);

  // Get unread notification count
  const unreadCount = notifications.filter(n => !n.read).length;

    // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await notificationService.markNotificationAsRead(notificationId);
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
        await notificationService.markAllNotificationsAsRead(user.$id);
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

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const menuItems = [
    {
      title: 'Dashboard',
      icon: Shield,
      href: '/dashboard',
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
        // Hide team management for non-managers  
        if (item.title === 'Team Management' && user?.role !== 'MANAGER' && user?.role !== 'ADMIN') {
          return null;
        }
        
        if (collapsed) {
          return (
            <TooltipProvider key={item.href}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-11 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 dark:hover:text-blue-300 transition-all duration-200"
                    onClick={() => router.push(item.href)}
                  >
                    <item.icon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.title}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        }
        
        return (
          <Button
            key={item.href}
            variant="ghost"
            className="w-full justify-start gap-3 h-11 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-700 dark:hover:from-blue-900/20 dark:hover:to-indigo-900/20 dark:hover:text-blue-300 transition-all duration-200"
            onClick={() => router.push(item.href)}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
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
                <Button variant="ghost" size="icon" className="relative hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600">
                      {unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h3 className="font-semibold text-sm">Notifications</h3>
                  {notifications.length > 0 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={markAllAsRead}
                      className="h-6 px-2 text-xs"
                    >
                      <CheckCheck className="h-3 w-3 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <div
                        key={notification.$id}
                        className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                          !notification.read ? 'bg-blue-50/50' : ''
                        }`}
                        onClick={() => markAsRead(notification.$id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm leading-tight">
                              {notification.title}
                            </p>
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-gray-400 mt-2">
                              {formatNotificationTime(notification.$createdAt)}
                            </p>
                          </div>
                          {!notification.read && (
                            <div className="h-2 w-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
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
                <DropdownMenuItem onClick={() => router.push('/dashboard/profile')}>
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
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
        <aside className={`hidden md:flex ${sidebarCollapsed ? 'w-16' : 'w-64'} bg-white/60 backdrop-blur-md dark:bg-slate-800/60 border-r border-slate-200/60 dark:border-slate-700/60 min-h-[calc(100vh-65px)] transition-all duration-300 ease-in-out`}>
          <div className={`${sidebarCollapsed ? 'p-2' : 'p-4'} w-full transition-all duration-300`}>
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
