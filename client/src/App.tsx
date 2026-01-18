import { useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";
import type { ViewId } from "@shared/schema";

import Dashboard from "@/pages/Dashboard";
import Missions from "@/pages/Missions";
import Control from "@/pages/Control";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

const routeToView: Record<string, ViewId> = {
  "/": "dashboard",
  "/dashboard": "dashboard",
  "/missions": "missions",
  "/control": "control",
  "/settings": "settings",
};

const viewToRoute: Record<ViewId, string> = {
  dashboard: "/",
  missions: "/missions",
  control: "/control",
  settings: "/settings",
};

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { isDark } = useTheme();

  const currentView: ViewId = routeToView[location] || "dashboard";

  const handleViewChange = (view: ViewId) => {
    setLocation(viewToRoute[view]);
    setMobileMenuOpen(false);
  };

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      isDark ? "bg-dark-900 text-white" : "bg-gray-50 text-gray-900"
    )}>
      <Sidebar
        currentView={currentView}
        onChangeView={handleViewChange}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />
      
      <main className={cn(
        "flex-1 transition-all duration-300",
        sidebarCollapsed ? "lg:ml-20" : "lg:ml-[295px]"
      )}>
        <Topbar
          currentView={currentView}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <div className="p-4 sm:p-6 lg:p-8">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/missions" component={Missions} />
            <Route path="/control" component={Control} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AppContent />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
