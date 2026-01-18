import { Menu, Home, ChevronRight, Sun, Moon, ChevronDown } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@shared/schema";

const viewLabels: Record<ViewId, string> = {
  dashboard: "Dashboard",
  missions: "Banco de Missões",
  control: "Mission Control",
  settings: "Settings",
};

interface TopbarProps {
  currentView: ViewId;
  onMobileMenuToggle: () => void;
}

export function Topbar({ currentView, onMobileMenuToggle }: TopbarProps) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 lg:h-20 px-4 lg:px-8 flex items-center justify-between backdrop-blur-md transition-colors duration-300 border-b",
        isDark 
          ? "bg-dark-800/50 border-dark-700" 
          : "bg-white/80 border-gray-200 shadow-sm"
      )}
      data-testid="topbar"
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className={cn(
            "lg:hidden p-2 rounded-lg transition-colors",
            isDark 
              ? "text-muted-foreground hover:text-white hover:bg-dark-700" 
              : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          )}
          data-testid="button-mobile-menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <nav className="flex items-center gap-2">
          <Home 
            className={cn(
              "w-4 h-4 hidden sm:block",
              isDark ? "text-muted-foreground" : "text-gray-400"
            )} 
          />
          <ChevronRight 
            className={cn(
              "w-4 h-4 hidden sm:block",
              isDark ? "text-dark-600" : "text-gray-300"
            )} 
          />
          <span 
            className={cn(
              "text-sm font-medium",
              isDark ? "text-primary" : "text-amber-600"
            )}
            data-testid="breadcrumb-current"
          >
            {viewLabels[currentView]}
          </span>
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button
          onClick={toggleTheme}
          className={cn(
            "relative p-2 sm:p-2.5 rounded-lg transition-all",
            isDark 
              ? "bg-dark-700/50 text-muted-foreground hover:text-white hover:bg-dark-700" 
              : "bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200"
          )}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>

        <div
          className={cn(
            "flex items-center gap-2 sm:gap-3 pl-1 sm:pl-1.5 pr-2 sm:pr-4 py-1 sm:py-1.5 rounded-full border transition-all cursor-pointer group",
            isDark 
              ? "bg-dark-700/50 border-dark-600/50 hover:bg-dark-700" 
              : "bg-gray-100 border-gray-200 hover:bg-gray-200"
          )}
          data-testid="user-menu"
        >
          <img
            src="https://api.dicebear.com/7.x/avataaars/svg?seed=MissionCtrl"
            alt="Profile"
            className={cn(
              "w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2",
              isDark ? "border-dark-600" : "border-gray-300"
            )}
          />
          <span 
            className={cn(
              "text-sm font-medium tracking-tight hidden lg:block",
              isDark ? "text-white" : "text-gray-900"
            )}
          >
            Admin
          </span>
          <ChevronDown 
            className={cn(
              "w-4 h-4 hidden sm:block transition-colors",
              isDark 
                ? "text-muted-foreground group-hover:text-gray-300" 
                : "text-gray-400 group-hover:text-gray-600"
            )} 
          />
        </div>
      </div>
    </header>
  );
}
