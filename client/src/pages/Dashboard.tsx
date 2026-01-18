import { useQuery } from "@tanstack/react-query";
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Zap,
  Database,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import type { MissionSummary, ExecutionStatus, Worker } from "@shared/schema";

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: typeof Activity;
  variant?: "default" | "success" | "warning" | "error" | "info";
  isLoading?: boolean;
}

function MetricCard({ title, value, change, icon: Icon, variant = "default", isLoading }: MetricCardProps) {
  const { isDark } = useTheme();
  
  const variantStyles = {
    default: isDark ? "text-white" : "text-gray-900",
    success: "text-green-400",
    warning: "text-orange-400",
    error: "text-red-400",
    info: "text-blue-400",
  };

  const iconBgStyles = {
    default: isDark ? "bg-dark-700" : "bg-gray-100",
    success: "bg-green-500/10",
    warning: "bg-orange-500/10",
    error: "bg-red-500/10",
    info: "bg-blue-500/10",
  };

  return (
    <Card className={cn(
      "border transition-all duration-200 backdrop-blur-md",
      isDark 
        ? "bg-dark-800/50 border-dark-700 hover:border-dark-600" 
        : "bg-white/80 border-gray-200 hover:border-gray-300 shadow-sm"
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className={cn(
              "text-xs font-medium uppercase tracking-wider mb-2",
              isDark ? "text-muted-foreground" : "text-gray-500"
            )}>
              {title}
            </p>
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <p className={cn(
                  "text-2xl font-bold tracking-tight font-mono",
                  variantStyles[variant]
                )}>
                  {typeof value === "number" ? value.toLocaleString() : value}
                </p>
                {change !== undefined && (
                  <div className="flex items-center gap-1 mt-2">
                    {change >= 0 ? (
                      <TrendingUp className="w-3 h-3 text-green-400" />
                    ) : (
                      <TrendingDown className="w-3 h-3 text-red-400" />
                    )}
                    <span className={cn(
                      "text-xs font-medium",
                      change >= 0 ? "text-green-400" : "text-red-400"
                    )}>
                      {change >= 0 ? "+" : ""}{change}%
                    </span>
                    <span className="text-xs text-muted-foreground">vs last week</span>
                  </div>
                )}
              </>
            )}
          </div>
          <div className={cn(
            "p-3 rounded-xl",
            iconBgStyles[variant]
          )}>
            <Icon className={cn("w-5 h-5", variantStyles[variant])} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface WorkerStatusProps {
  worker: {
    id: string;
    name: string;
    status: "idle" | "running";
    current_mission: unknown | null;
  };
}

function WorkerStatus({ worker }: WorkerStatusProps) {
  const { isDark } = useTheme();

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border",
        isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
      )}
    >
      <div className={cn(
        "w-3 h-3 rounded-full",
        worker.status === "running" 
          ? "bg-green-400 animate-pulse-glow" 
          : "bg-gray-400"
      )} />
      <div className="flex-1">
        <p className={cn(
          "text-sm font-medium",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {worker.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {worker.current_mission ? "Executando missão" : "Aguardando missão"}
        </p>
      </div>
      <span className={cn(
        "text-[9px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-md border",
        worker.status === "running"
          ? "bg-green-500/10 border-green-500/40 text-green-400"
          : isDark 
            ? "bg-dark-700 border-dark-600 text-muted-foreground"
            : "bg-gray-100 border-gray-200 text-gray-500"
      )}>
        {worker.status}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const { isDark } = useTheme();
  
  const { data: missionsData, isLoading: missionsLoading } = useQuery<{
    data: unknown[];
    summary: MissionSummary;
  }>({
    queryKey: ["/api/missions"],
    refetchInterval: 10000,
  });

  const { data: executionData, isLoading: executionLoading } = useQuery<ExecutionStatus>({
    queryKey: ["/api/execution/status"],
    refetchInterval: 5000,
  });

  const summary = missionsData?.summary || {
    total: 0,
    pending: 0,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
  };

  const workers = executionData?.workers || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn(
          "text-xl font-bold tracking-tight",
          isDark ? "text-white" : "text-gray-900"
        )}>
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visão geral do sistema de orquestração
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6">
        <MetricCard 
          title="Total de Missões" 
          value={summary.total} 
          icon={Database}
          isLoading={missionsLoading}
        />
        <MetricCard 
          title="Pendentes" 
          value={summary.pending} 
          icon={Clock}
          variant="warning"
          isLoading={missionsLoading}
        />
        <MetricCard 
          title="Na Fila" 
          value={summary.queued} 
          icon={Zap}
          variant="info"
          isLoading={missionsLoading}
        />
        <MetricCard 
          title="Concluídas" 
          value={summary.done} 
          icon={CheckCircle2}
          variant="success"
          isLoading={missionsLoading}
        />
        <MetricCard 
          title="Falhas" 
          value={summary.failed} 
          icon={XCircle}
          variant="error"
          isLoading={missionsLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={cn(
          "border backdrop-blur-md",
          isDark 
            ? "bg-dark-800/50 border-dark-700" 
            : "bg-white/80 border-gray-200 shadow-sm"
        )}>
          <CardHeader className="px-6 py-4 border-b border-border">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Workers
              {executionLoading && <Loader2 className="w-4 h-4 animate-spin ml-auto" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {workers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum worker configurado
              </p>
            ) : (
              <div className="space-y-4">
                {workers.map((worker) => (
                  <WorkerStatus key={worker.id} worker={worker} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn(
          "border backdrop-blur-md",
          isDark 
            ? "bg-dark-800/50 border-dark-700" 
            : "bg-white/80 border-gray-200 shadow-sm"
        )}>
          <CardHeader className="px-6 py-4 border-b border-border">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Status da Execução
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-4">
              <div className={cn(
                "p-4 rounded-xl border text-center",
                isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
              )}>
                <p className="text-2xl font-bold font-mono text-purple-400">
                  {executionData?.stats.running || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Executando</p>
              </div>
              <div className={cn(
                "p-4 rounded-xl border text-center",
                isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
              )}>
                <p className="text-2xl font-bold font-mono text-blue-400">
                  {executionData?.stats.queued || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Na Fila</p>
              </div>
              <div className={cn(
                "p-4 rounded-xl border text-center",
                isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
              )}>
                <p className="text-2xl font-bold font-mono text-green-400">
                  {executionData?.stats.completed_today || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Hoje</p>
              </div>
              <div className={cn(
                "p-4 rounded-xl border text-center",
                isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
              )}>
                <p className="text-2xl font-bold font-mono text-red-400">
                  {executionData?.stats.failed_today || 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Falhas Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
