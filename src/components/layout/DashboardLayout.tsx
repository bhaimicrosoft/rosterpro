'use client';

import { useState } from 'react';
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
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [notifications] = useState(3); // TODO: Replace with real notification count
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
            <Button variant="ghost" size="icon" className="relative hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20">
              <Bell className="h-4 w-4" />
              {notifications > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 text-xs bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600">
                  {notifications}
                </Badge>
              )}
            </Button>

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
