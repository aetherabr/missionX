import { 
  Hexagon, 
  LayoutDashboard, 
  Database, 
  Rocket, 
  Settings, 
  LogOut,
  PanelLeftClose,
  PanelLeft,
  type LucideIcon
} from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import type { ViewId } from "@shared/schema";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "missions", label: "Banco de Missões", icon: Database },
  { id: "control", label: "Mission Control", icon: Rocket },
  { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  currentView: ViewId;
  onChangeView: (view: ViewId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileMenuOpen: boolean;
  onMobileMenuToggle: () => void;
}

export function Sidebar({
  currentView,
  onChangeView,
  collapsed,
  onToggleCollapse,
  mobileMenuOpen,
}: SidebarProps) {
  const { isDark } = useTheme();

  return (
    <>
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={onToggleCollapse}
          data-testid="sidebar-overlay"
        />
      )}
      
      <aside
        className={cn(
          "fixed left-0 top-0 h-screen z-50 flex flex-col border-r backdrop-blur-md transition-all duration-300",
          "w-[280px] lg:w-[295px]",
          collapsed && "lg:w-20",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isDark 
            ? "bg-dark-800/95 lg:bg-dark-800/50 border-dark-700" 
            : "bg-white/95 lg:bg-white/80 border-gray-200 shadow-sm"
        )}
        data-testid="sidebar"
      >
        <div className={cn(
          "h-20 flex items-center px-6 relative border-b",
          isDark ? "border-dark-700" : "border-gray-200"
        )}>
          <div className="flex items-center">
            <Hexagon 
              className="text-primary w-8 h-8 fill-primary/20 flex-shrink-0" 
              strokeWidth={1.5}
            />
            <span className={cn(
              "ml-3 font-bold text-xl tracking-tight",
              collapsed && "lg:hidden"
            )}>
              Mission<span className="text-primary">Ctrl</span>
            </span>
          </div>

          <button
            onClick={onToggleCollapse}
            className={cn(
              "absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-md shadow-lg hidden lg:flex items-center justify-center transition-colors border",
              isDark 
                ? "bg-dark-700 border-dark-600 text-muted-foreground hover:bg-dark-600 hover:text-white" 
                : "bg-white border-gray-300 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            )}
            data-testid="button-collapse-toggle"
          >
            {collapsed ? (
              <PanelLeft className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 py-8 px-3 flex flex-col gap-2">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onChangeView(item.id)}
                className={cn(
                  "flex items-center p-3 rounded-xl transition-all duration-200 group",
                  collapsed && "lg:justify-center",
                  isActive
                    ? isDark
                      ? "bg-dark-700 text-primary"
                      : "bg-amber-50 text-amber-600"
                    : isDark
                      ? "text-muted-foreground hover:bg-dark-700 hover:text-white"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                )}
                data-testid={`nav-${item.id}`}
              >
                <Icon 
                  className={cn(
                    "w-6 h-6 flex-shrink-0",
                    isActive
                      ? isDark ? "text-primary" : "text-amber-600"
                      : isDark 
                        ? "text-muted-foreground group-hover:text-white" 
                        : "text-gray-400 group-hover:text-gray-900"
                  )} 
                />
                <span className={cn(
                  "ml-4 font-medium tracking-tight",
                  collapsed && "lg:hidden"
                )}>
                  {item.label}
                </span>
                {isActive && (
                  <div className={cn(
                    "ml-auto w-1.5 h-1.5 rounded-full",
                    collapsed && "lg:hidden",
                    isDark ? "bg-primary glow-yellow" : "bg-amber-500"
                  )} />
                )}
              </button>
            );
          })}
        </nav>

        <div className={cn(
          "p-4 border-t",
          isDark ? "border-dark-700" : "border-gray-200"
        )}>
          <button
            className={cn(
              "flex items-center w-full p-3 rounded-xl transition-colors",
              collapsed && "lg:justify-center",
              isDark 
                ? "text-muted-foreground hover:bg-red-500/10 hover:text-red-500" 
                : "text-gray-500 hover:bg-red-50 hover:text-red-600"
            )}
            data-testid="button-logout"
          >
            <LogOut className="w-6 h-6 flex-shrink-0" />
            <span className={cn(
              "ml-4 font-medium tracking-tight",
              collapsed && "lg:hidden"
            )}>
              Logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
