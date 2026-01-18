import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Play, 
  Pause, 
  Rocket,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  AlertCircle,
  Database,
  Cloud,
  RefreshCw,
  Loader2,
  ListFilter,
  X,
  Plus,
  Settings,
  MoreHorizontal,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  Check
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Mission, ExecutionStatus, Worker, Writer } from "@shared/schema";
import { Link } from "wouter";

function getCheckpointText(checkpoint: "ATRIBUIDO" | "EXTRAINDO" | "ARMAZENANDO", missionCheckpoint: string | null, missionStatus: string): string {
  const checkpoints = ["ATRIBUIDO", "EXTRAINDO", "ARMAZENANDO"];
  const currentIndex = missionCheckpoint ? checkpoints.indexOf(missionCheckpoint) : -1;
  const thisIndex = checkpoints.indexOf(checkpoint);
  
  if (missionStatus === "QUEUED") {
    if (checkpoint === "ATRIBUIDO") return "✓";
    return " ";
  }
  if (missionStatus === "DONE") return "✓";
  if (missionStatus === "FAILED" && checkpoint === missionCheckpoint) return "✗";
  if (missionStatus === "FAILED" && thisIndex < currentIndex) return "✓";
  if (missionStatus === "RUNNING" && thisIndex < currentIndex) return "✓";
  if (missionStatus === "RUNNING" && checkpoint === missionCheckpoint) return "◷";
  return " ";
}

function formatDuration(startedAt: string | null): string {
  if (!startedAt) return "--";
  
  const started = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - started.getTime();
  
  if (diffMs < 0) return "--";
  
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "RUNNING":
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/40">Executando</Badge>;
    case "QUEUED":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/40">Na Fila</Badge>;
    case "DONE":
      return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/40">Concluído</Badge>;
    case "FAILED":
      return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40">Falhou</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/40">Pendente</Badge>;
  }
}

type ProcessStatus = "pending" | "running" | "done" | "failed";

interface ActiveMission {
  id: string;
  responsible: string;
  responsibleType: "worker" | "writer";
  processingTime: string;
  processes: [ProcessStatus, ProcessStatus, ProcessStatus];
  dateStart: string;
  dateEnd: string;
  languages: string[];
  mediaType: string;
  jobId: string | null;
  jobStatus: string | null;
  adsCount: number | null;
}

function getProcessesForResponsibleType(type: "worker" | "writer"): [ProcessStatus, ProcessStatus, ProcessStatus] {
  switch (type) {
    case "worker":
      return ["done", "running", "pending"];
    case "writer":
      return ["done", "done", "running"];
    default:
      return ["pending", "pending", "pending"];
  }
}

function getAllocationBadge(type: "worker" | "writer" | "empty" | string) {
  switch (type) {
    case "worker":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/40 text-[10px]">worker</Badge>;
    case "writer":
      return <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/40 text-[10px]">writer</Badge>;
    case "empty":
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/40 text-[10px]">empty</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/40 text-[10px]">empty</Badge>;
  }
}

function getQueueProgress(checkpoint: string | null, status: string): [ProcessStatus, ProcessStatus, ProcessStatus] {
  if (status === "PENDING") {
    return ["pending", "pending", "pending"];
  }
  if (status === "QUEUED") {
    return ["done", "pending", "pending"];
  }
  if (status === "DONE") {
    return ["done", "done", "done"];
  }
  if (status === "FAILED") {
    switch (checkpoint) {
      case "ATRIBUIDO":
        return ["failed", "pending", "pending"];
      case "EXTRAINDO":
        return ["done", "failed", "pending"];
      case "ARMAZENANDO":
        return ["done", "done", "failed"];
      default:
        return ["done", "pending", "pending"];
    }
  }
  if (status === "RUNNING") {
    switch (checkpoint) {
      case "ATRIBUIDO":
        return ["done", "pending", "pending"];
      case "EXTRAINDO":
        return ["done", "running", "pending"];
      case "ARMAZENANDO":
        return ["done", "done", "running"];
      default:
        return ["done", "running", "pending"];
    }
  }
  return ["pending", "pending", "pending"];
}

function getAllocationType(checkpoint: string | null, status: string): "worker" | "writer" | "empty" {
  if (status === "QUEUED" || status === "PENDING" || status === "DONE" || status === "FAILED") {
    return "empty";
  }
  if (status === "RUNNING") {
    switch (checkpoint) {
      case "ATRIBUIDO":
      case "EXTRAINDO":
        return "worker";
      case "ARMAZENANDO":
        return "writer";
      default:
        return "worker";
    }
  }
  return "empty";
}

function getLanguageCode(lang: string): string {
  const langMap: Record<string, string> = {
    "português": "PT",
    "portugues": "PT",
    "portuguese": "PT",
    "pt": "PT",
    "english": "EN",
    "inglês": "EN",
    "ingles": "EN",
    "eng": "EN",
    "en": "EN",
    "espanhol": "ES",
    "spanish": "ES",
    "es": "ES",
    "español": "ES",
    "francês": "FR",
    "frances": "FR",
    "french": "FR",
    "fr": "FR",
    "alemão": "DE",
    "alemao": "DE",
    "german": "DE",
    "de": "DE",
    "italiano": "IT",
    "italian": "IT",
    "it": "IT",
    "japonês": "JA",
    "japones": "JA",
    "japanese": "JA",
    "ja": "JA",
    "chinês": "ZH",
    "chines": "ZH",
    "chinese": "ZH",
    "zh": "ZH",
    "coreano": "KO",
    "korean": "KO",
    "ko": "KO",
    "russo": "RU",
    "russian": "RU",
    "ru": "RU",
    "árabe": "AR",
    "arabe": "AR",
    "arabic": "AR",
    "ar": "AR",
  };
  const normalized = lang.toLowerCase().trim();
  return langMap[normalized] || lang.toUpperCase().slice(0, 2);
}

function getMediaTypeLabel(mediaType: string): string {
  const typeMap: Record<string, string> = {
    "all": "All",
    "video": "Video",
    "image": "Image",
    "text": "Text",
  };
  return typeMap[mediaType.toLowerCase()] || mediaType.charAt(0).toUpperCase() + mediaType.slice(1);
}

interface ActiveMissionCardProps {
  mission: ActiveMission;
  onViewDetails?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
}

function ProgressBar({ status }: { status: ProcessStatus }) {
  const baseClasses = "h-4 flex-1 rounded-[2px]";
  
  if (status === "done") {
    return <div className={cn(baseClasses)} style={{ backgroundColor: "#00FF00" }} />;
  }
  if (status === "failed") {
    return <div className={cn(baseClasses, "bg-red-500")} />;
  }
  if (status === "running") {
    return (
      <div 
        className={cn(baseClasses)}
        style={{
          backgroundColor: "#98FB98",
          animation: "progressPulse 3s ease-in-out infinite",
        }}
      >
        <style>{`
          @keyframes progressPulse {
            0% { opacity: 0.3; }
            50% { opacity: 1; }
            100% { opacity: 0.3; }
          }
        `}</style>
      </div>
    );
  }
  return <div className={cn(baseClasses, "bg-gray-600")} />;
}

function formatPeriodo(dateStart: string, dateEnd: string): string {
  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year.slice(2)}`;
  };
  
  if (dateStart === dateEnd) {
    return formatDate(dateStart);
  }
  return `${formatDate(dateStart)} - ${formatDate(dateEnd)}`;
}

function ActiveMissionCard({ mission, onViewDetails, onEdit, onCancel }: ActiveMissionCardProps) {
  const { isDark } = useTheme();
  
  return (
    <Card className={cn(
      "border transition-all flex flex-col min-w-[280px]",
      isDark 
        ? "bg-dark-800/50 border-dark-700" 
        : "bg-white border-gray-200"
    )}>
      <CardHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between gap-2">
        <span className={cn(
          "font-medium text-sm",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {mission.responsible}
        </span>
        <Badge 
          variant="outline" 
          className="whitespace-nowrap inline-flex items-center rounded-md px-2.5 py-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 hover-elevate border [border-color:var(--badge-outline)] shadow-xs text-sm bg-transparent border-dark-600 text-[#a1a1aa] font-medium"
        >
          {mission.processingTime}
        </Badge>
      </CardHeader>
      <CardContent className="p-4 flex-1">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Missão:</span>
            <span 
              className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5 cursor-pointer hover:border-muted-foreground transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(mission.id);
              }}
            >
              {mission.id}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Job ID:</span>
            <span 
              className={cn(
                "text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5",
                mission.jobId && "cursor-pointer hover:border-muted-foreground transition-colors"
              )}
              onClick={() => {
                if (mission.jobId) {
                  navigator.clipboard.writeText(mission.jobId);
                }
              }}
            >
              {mission.jobId ?? "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Job Status:</span>
            <span className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5">
              {mission.jobStatus ?? "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ads Extraídos:</span>
            <span className="text-xs font-light text-[#a1a1aa]">
              {mission.adsCount ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Progresso:</span>
            <div className="flex items-center gap-1 w-24">
              {mission.processes.map((status, idx) => (
                <ProgressBar key={idx} status={status} />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
      <div className="px-4 pb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full" data-testid={`button-mission-actions-${mission.id}`}>
              Ações
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onViewDetails} data-testid={`menu-view-${mission.id}`}>
              <Eye className="w-4 h-4 mr-2" />
              Ver detalhes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} data-testid={`menu-edit-${mission.id}`}>
              <Pencil className="w-4 h-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={onCancel} 
              className="text-red-500 focus:text-red-500"
              data-testid={`menu-cancel-${mission.id}`}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}


type FinishedStatus = "concluído" | "falhou" | "incompleto";

interface FinishedMission {
  id: string;
  status: FinishedStatus;
  ads: number;
}

function getFinishedStatusBadge(status: FinishedStatus) {
  switch (status) {
    case "concluído":
      return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/40 text-[10px] font-light">concluído</Badge>;
    case "falhou":
      return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40 text-[10px] font-light">falhou</Badge>;
    case "incompleto":
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/40 text-[10px] font-light">incompleto</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/40 text-[10px] font-light">{status}</Badge>;
  }
}

interface StatCardProps {
  value: number;
  label: string;
  icon: React.ReactNode;
}

function StatCard({ value, label, icon }: StatCardProps) {
  const { isDark } = useTheme();
  
  return (
    <Card className={cn(
      "border",
      isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
    )}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold font-mono text-white">
            {value}
          </p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
            {label}
          </p>
        </div>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

interface WorkerCardProps {
  worker: {
    id: string;
    name: string;
    status: "idle" | "running";
    current_mission: Mission | null;
    session: {
      id: string;
      status: string;
      execution_count: number;
      execution_limit: number;
      proxy_id: string | null;
      proxy_name: string | null;
      created_at: string;
      ready_at: string | null;
    } | null;
    missions_until_restart?: number;
    jobs_in_session?: number;
    session_limit?: number;
    jobs_today?: number;
    ads_today?: number;
    failures_today?: number;
  };
  onViewMission?: (mission: Mission) => void;
}

interface ProcessorCardProps {
  processor: {
    id: string;
    name: string;
    type: "writer";
    active: boolean;
    active_missions?: string[];
    ads_processed?: number;
    total_jobs?: number;
    success_rate?: number;
  };
}

function getServerStatusBadge(status: string) {
  switch (status) {
    case "online":
    case "READY":
    case "ACTIVE":
      return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/40 text-[10px] font-light py-[1px]">{status.toLowerCase()}</Badge>;
    case "offline":
    case "ERROR":
    case "TIMEOUT":
      return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40 text-[10px] font-light py-[1px]">{status.toLowerCase()}</Badge>;
    case "idle":
    case "ENDED":
      return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/40 text-[10px] font-light py-[1px]">{status.toLowerCase()}</Badge>;
    case "CREATING":
    case "INITIALIZING":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/40 text-[10px] font-light py-[1px]">{status.toLowerCase()}</Badge>;
    default:
      return <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/40 text-[10px] font-light py-[1px]">{status}</Badge>;
  }
}

function getSuccessRateBadge(rate: number) {
  if (rate >= 90) {
    return <Badge variant="outline" className="bg-green-500/10 text-green-400 border-green-500/40 text-[10px] font-light py-[1px]">Alta</Badge>;
  } else if (rate >= 70) {
    return <Badge variant="outline" className="bg-orange-500/10 text-orange-400 border-orange-500/40 text-[10px] font-light py-[1px]">Média</Badge>;
  } else {
    return <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/40 text-[10px] font-light py-[1px]">Baixa</Badge>;
  }
}

function SessionLimitProgress({ current, max, compact = false }: { current: number; max: number; compact?: boolean }) {
  const blocks = Array.from({ length: max }, (_, i) => i < current ? "completed" : "pending");
  
  return (
    <div className={cn("flex items-center gap-[3px]", compact ? "w-[80px]" : "")}>
      {blocks.map((status, idx) => (
        <div
          key={idx}
          className={cn(
            "flex-1 rounded-[2px]",
            compact ? "h-3 min-w-[6px]" : "h-4 min-w-[16px]",
            status === "completed" ? "bg-[#facc14]" : "bg-muted/30"
          )}
        />
      ))}
    </div>
  );
}

function WorkerCard({ worker, onViewMission }: WorkerCardProps) {
  const { isDark } = useTheme();
  
  const session = worker.session;
  const sessionStatus = session?.status || "idle";
  const jobsInSession = session?.execution_count ?? worker.jobs_in_session ?? 0;
  const sessionLimit = session?.execution_limit ?? worker.session_limit ?? 5;
  const jobsCompleted = Math.min(jobsInSession, sessionLimit);

  return (
    <Card className={cn(
      "border transition-all flex flex-col min-w-[280px]",
      isDark 
        ? "bg-dark-800/50 border-dark-700" 
        : "bg-white border-gray-200"
    )}>
      <CardHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between gap-2">
        <span className={cn(
          "font-medium text-sm",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {worker.name}
        </span>
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] uppercase",
            worker.status === "running"
              ? "bg-green-500/10 border-green-500/40 text-green-400"
              : isDark 
                ? "bg-dark-700 border-dark-600 text-muted-foreground"
                : "bg-gray-100 border-gray-200 text-gray-500"
          )}
        >
          {worker.status === "running" ? "Ativo" : "Ocioso"}
        </Badge>
      </CardHeader>

      <CardContent className="p-4 flex-1">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Missão atual</span>
            <span className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5">
              {worker.current_mission?.id || "--"}
            </span>
          </div>
          
          <div className="pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">SESSION</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Session ID</span>
            <span className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5">
              {session?.id || "--"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            {getServerStatusBadge(sessionStatus)}
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Proxy</span>
            <span className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5 truncate max-w-[120px]">
              {session?.proxy_name || "--"}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Execuções</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-light text-[#a1a1aa]">
                {jobsCompleted}/{sessionLimit}
              </span>
              <SessionLimitProgress current={jobsCompleted} max={sessionLimit} />
            </div>
          </div>
        </div>
      </CardContent>

      <div className="px-4 pb-4">
        <Button 
          variant="outline" 
          size="sm"
          className="w-full"
          data-testid={`button-worker-actions-${worker.id}`}
        >
          Ações
        </Button>
      </div>
    </Card>
  );
}

function ProcessorCard({ processor }: ProcessorCardProps) {
  const { isDark } = useTheme();
  
  const activeMissions = processor.active_missions || [];
  const adsProcessed = processor.ads_processed ?? 0;
  const totalJobs = processor.total_jobs ?? 0;
  const successRate = processor.success_rate ?? 0;

  return (
    <Card className={cn(
      "border transition-all flex flex-col min-w-[280px]",
      isDark 
        ? "bg-dark-800/50 border-dark-700" 
        : "bg-white border-gray-200"
    )}>
      <CardHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between gap-2">
        <span className={cn(
          "font-medium text-sm",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {processor.name}
        </span>
        <Badge 
          variant="outline" 
          className={cn(
            "text-[10px] uppercase",
            processor.active
              ? "bg-green-500/10 border-green-500/40 text-green-400"
              : isDark 
                ? "bg-dark-700 border-dark-600 text-muted-foreground"
                : "bg-gray-100 border-gray-200 text-gray-500"
          )}
        >
          Writer
        </Badge>
      </CardHeader>

      <CardContent className="p-4 flex-1">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Missões ativas</span>
            <div className="flex items-center gap-1 flex-wrap justify-end max-w-[140px]">
              {activeMissions.length === 0 ? (
                <span className="text-xs font-light text-[#a1a1aa]">--</span>
              ) : (
                activeMissions.slice(0, 3).map((missionId) => (
                  <span 
                    key={missionId}
                    className="text-xs font-light text-[#a1a1aa] border border-border rounded px-1.5 py-0.5"
                  >
                    {missionId}
                  </span>
                ))
              )}
              {activeMissions.length > 3 && (
                <span className="text-xs font-light text-muted-foreground">
                  +{activeMissions.length - 3}
                </span>
              )}
            </div>
          </div>
          
          <div className="pt-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">MÉTRICAS</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ads Processados</span>
            <span className="text-xs font-light text-[#a1a1aa]">
              {adsProcessed.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Jobs totais</span>
            <span className="text-xs font-light text-[#a1a1aa]">
              {totalJobs.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Taxa de sucesso</span>
            {getSuccessRateBadge(successRate)}
          </div>
        </div>
      </CardContent>

      <div className="px-4 pb-4">
        <Button 
          variant="outline" 
          size="sm"
          className="w-full"
          data-testid={`button-processor-actions-${processor.id}`}
        >
          Ações
        </Button>
      </div>
    </Card>
  );
}

interface SelectMissionsModalProps {
  open: boolean;
  onClose: () => void;
  workers: { id: string; name: string; status: string }[];
  onSuccess: () => void;
}

function SelectMissionsModal({ open, onClose, workers, onSuccess }: SelectMissionsModalProps) {
  const { isDark } = useTheme();
  const { toast } = useToast();
  
  const [statusFilter, setStatusFilter] = useState<string[]>(["PENDING"]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [mediaType, setMediaType] = useState<string>("all");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("all");
  const [selectedMissionIds, setSelectedMissionIds] = useState<string[]>([]);

  const availableLanguages = [
    { code: "all", label: "Todos" },
    { code: "pt", label: "Português" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
  ];

  // Build query string
  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter.length > 0) params.set("status", statusFilter.join(","));
    if (dateStart) params.set("dateStart", dateStart);
    if (dateEnd) params.set("dateEnd", dateEnd);
    if (mediaType !== "all") params.set("mediaType", mediaType);
    if (selectedLanguage !== "all") params.set("language", selectedLanguage);
    params.set("limit", "100");
    return params.toString();
  };

  const queryString = buildQueryString();

  // Fetch available missions
  const { data: missionsData, isLoading: isLoadingMissions } = useQuery<{ data: Mission[]; pagination: { total: number } }>({
    queryKey: ["/api/missions", queryString],
    queryFn: async () => {
      const res = await fetch(`/api/missions?${queryString}`);
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
    enabled: open && statusFilter.length > 0,
  });

  const availableMissions = missionsData?.data || [];

  const queueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/missions/queue", {
        mission_ids: selectedMissionIds,
        worker_ids: workers.map(w => w.id),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Missões adicionadas à fila",
        description: `${data.queued} missões enfileiradas com sucesso`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      onSuccess();
      onClose();
      setSelectedMissionIds([]);
    },
    onError: (error) => {
      toast({ 
        title: "Erro ao enfileirar missões",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleStatus = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
    setSelectedMissionIds([]);
  };

  const toggleMission = (missionId: string) => {
    setSelectedMissionIds(prev =>
      prev.includes(missionId)
        ? prev.filter(id => id !== missionId)
        : [...prev, missionId]
    );
  };

  const selectAll = () => {
    setSelectedMissionIds(availableMissions.map(m => m.id));
  };

  const deselectAll = () => {
    setSelectedMissionIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(
        "max-w-2xl max-h-[85vh] overflow-hidden flex flex-col",
        isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListFilter className="w-5 h-5 text-primary" />
            Selecionar Missões
          </DialogTitle>
          <DialogDescription>
            Filtre e selecione as missões que deseja adicionar à fila de execução
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Data Início</Label>
              <Input
                type="date"
                value={dateStart}
                onChange={(e) => { setDateStart(e.target.value); setSelectedMissionIds([]); }}
                className="h-9"
                data-testid="input-filter-date-start"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Data Fim</Label>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => { setDateEnd(e.target.value); setSelectedMissionIds([]); }}
                className="h-9"
                data-testid="input-filter-date-end"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs">Tipo de Mídia</Label>
              <Select value={mediaType} onValueChange={(v) => { setMediaType(v); setSelectedMissionIds([]); }}>
                <SelectTrigger className="h-9" data-testid="select-filter-media">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Idioma</Label>
              <Select value={selectedLanguage} onValueChange={(v) => { setSelectedLanguage(v); setSelectedMissionIds([]); }}>
                <SelectTrigger className="h-9" data-testid="select-filter-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLanguages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>{lang.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Status das Missões</Label>
            <div className="flex flex-wrap gap-2">
              {["PENDING", "FAILED"].map((status) => (
                <button
                  key={status}
                  onClick={() => toggleStatus(status)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                    statusFilter.includes(status)
                      ? status === "PENDING"
                        ? "bg-gray-500/10 border-gray-500/40 text-gray-400"
                        : "bg-red-500/10 border-red-500/40 text-red-400"
                      : isDark
                        ? "bg-dark-700 border-dark-600 text-muted-foreground"
                        : "bg-gray-100 border-gray-200 text-gray-500"
                  )}
                  data-testid={`button-filter-status-${status.toLowerCase()}`}
                >
                  {status === "PENDING" ? "Pendentes" : "Falhas"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Missões Disponíveis ({availableMissions.length})</Label>
              <div className="flex gap-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={selectAll}
                  disabled={availableMissions.length === 0}
                  className="text-xs h-7"
                >
                  Selecionar Todas
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={deselectAll}
                  disabled={selectedMissionIds.length === 0}
                  className="text-xs h-7"
                >
                  Limpar
                </Button>
              </div>
            </div>
            <div className={cn(
              "rounded-lg border p-3 flex-1 overflow-y-auto",
              isDark ? "bg-dark-900/50 border-dark-700" : "bg-gray-50 border-gray-200"
            )}>
              {isLoadingMissions ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableMissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma missão encontrada com os filtros selecionados</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {availableMissions.map((mission) => (
                    <label
                      key={mission.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                        isDark ? "hover:bg-dark-700" : "hover:bg-gray-100"
                      )}
                    >
                      <Checkbox
                        checked={selectedMissionIds.includes(mission.id)}
                        onCheckedChange={() => toggleMission(mission.id)}
                        data-testid={`checkbox-mission-${mission.id}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{mission.id}</span>
                          <span className={cn(
                            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                            mission.status === "PENDING"
                              ? "bg-gray-500/10 text-gray-400"
                              : mission.status === "FAILED"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-blue-500/10 text-blue-400"
                          )}>
                            {mission.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {mission.date_start} - {mission.media_type}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {selectedMissionIds.length} missões selecionadas
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => queueMutation.mutate()}
            disabled={queueMutation.isPending || selectedMissionIds.length === 0}
            data-testid="button-queue-missions"
          >
            {queueMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enfileirando...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Adicionar {selectedMissionIds.length} à Fila
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MissionDetailsModalProps {
  mission: Mission | null;
  onClose: () => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  isRetrying: boolean;
  isCancelling: boolean;
}

function MissionDetailsModal({ mission, onClose, onRetry, onCancel, isRetrying, isCancelling }: MissionDetailsModalProps) {
  const { isDark } = useTheme();

  return (
    <Dialog open={!!mission} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={cn(
        "max-w-lg",
        isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-primary" />
            Detalhes da Missão
          </DialogTitle>
        </DialogHeader>

        {mission && (
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">ID</p>
                <p className={cn(
                  "font-mono text-xs mt-1 truncate",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {mission.id}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Data</p>
                <p className={cn(
                  "font-mono text-sm mt-1",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {mission.date_start}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Mídia</p>
                <p className={cn(
                  "text-sm capitalize mt-1",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {mission.media_type}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Retry</p>
                <p className={cn(
                  "font-mono text-sm mt-1",
                  isDark ? "text-white" : "text-gray-900"
                )}>
                  {mission.retry_count}/2
                </p>
              </div>
            </div>

            {mission.ads_count !== null && (
              <div className={cn(
                "p-4 rounded-lg",
                isDark ? "bg-dark-700/50" : "bg-gray-50"
              )}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Ads Coletados
                </p>
                <p className="text-2xl font-bold font-mono text-primary">
                  {mission.ads_count.toLocaleString()}
                </p>
              </div>
            )}

            <div className="space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Progresso
              </p>
              <div className={cn(
                "p-4 rounded-lg font-mono text-lg",
                isDark ? "bg-dark-700/50" : "bg-gray-50"
              )}>
                [{getCheckpointText("ATRIBUIDO", mission.checkpoint, mission.status)}]
                [{getCheckpointText("EXTRAINDO", mission.checkpoint, mission.status)}]
                [{getCheckpointText("ARMAZENANDO", mission.checkpoint, mission.status)}]
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>Atribuído</span>
                  <span>Extraindo</span>
                  <span>Armazenando</span>
                </div>
              </div>
            </div>

            {mission.error_message && (
              <div className={cn(
                "p-4 rounded-lg border",
                "bg-red-500/5 border-red-500/20"
              )}>
                <p className="text-xs text-red-400 uppercase tracking-wider mb-1">
                  Erro
                </p>
                <p className="text-sm text-red-400">
                  {mission.error_message}
                </p>
              </div>
            )}

            <DialogFooter className="gap-2">
              {mission.status === "FAILED" && (
                <Button
                  variant="outline"
                  onClick={() => onRetry(mission.id)}
                  disabled={isRetrying}
                >
                  {isRetrying ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Retry
                </Button>
              )}
              {(mission.status === "QUEUED" || mission.status === "RUNNING") && (
                <Button
                  variant="destructive"
                  onClick={() => onCancel(mission.id)}
                  disabled={isCancelling}
                >
                  {isCancelling ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  Cancelar
                </Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Control() {
  const { isDark } = useTheme();
  const { toast } = useToast();
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [queuePage, setQueuePage] = useState(1);
  const [finishedPage, setFinishedPage] = useState(1);
  const FINISHED_ITEMS_PER_PAGE = 5;
  const ITEMS_PER_PAGE = 10;
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [showStatusFilter, setShowStatusFilter] = useState(false);

  const { data: executionStatus, isLoading } = useQuery<ExecutionStatus>({
    queryKey: ["/api/execution/status"],
    refetchInterval: 5000,
    staleTime: 0,
  });

  const { data: workersResponse } = useQuery<{ data: Worker[] }>({
    queryKey: ["/api/workers"],
    staleTime: 30000,
  });

  const { data: writersResponse } = useQuery<{ data: Writer[] }>({
    queryKey: ["/api/writers"],
    staleTime: 30000,
  });

  const { data: runningMissionsResponse } = useQuery<{ data: Mission[] }>({
    queryKey: ["/api/missions", "status=RUNNING"],
    queryFn: async () => {
      const res = await fetch("/api/missions?status=RUNNING&limit=50");
      if (!res.ok) throw new Error("Failed to fetch running missions");
      return res.json();
    },
    refetchInterval: 5000,
    staleTime: 0,
  });

  const { data: finishedMissionsResponse } = useQuery<{ data: Mission[] }>({
    queryKey: ["/api/missions", "finished"],
    queryFn: async () => {
      const res = await fetch("/api/missions?status=DONE,FAILED&limit=50&orderBy=finished_at&order=desc");
      if (!res.ok) throw new Error("Failed to fetch finished missions");
      return res.json();
    },
    refetchInterval: 10000,
    staleTime: 0,
  });

  const workersArray = workersResponse?.data || [];
  const writersArray = writersResponse?.data || [];
  const runningMissions = runningMissionsResponse?.data || [];
  const finishedMissionsData = finishedMissionsResponse?.data || [];

  const activeWorkers = workersArray.filter(w => w.active);

  const getResponsibleInfo = (mission: Mission): { name: string; type: "worker" | "writer" } => {
    if (mission.checkpoint === "ARMAZENANDO") {
      const writer = writersArray.find(w => w.current_mission_id === mission.id);
      return { name: writer?.name || "Writer", type: "writer" };
    }
    const worker = workersArray.find(w => w.id === mission.worker_id);
    return { name: worker?.name || "Worker", type: "worker" };
  };

  const activeMissions: ActiveMission[] = runningMissions.map(mission => {
    const responsible = getResponsibleInfo(mission);
    const progress = getQueueProgress(mission.checkpoint, mission.status);
    return {
      id: mission.id,
      responsible: responsible.name,
      responsibleType: responsible.type,
      processingTime: formatDuration(mission.started_at),
      processes: progress,
      dateStart: mission.date_start,
      dateEnd: mission.date_end,
      languages: mission.languages,
      mediaType: mission.media_type,
      jobId: responsible.type === "worker" ? mission.worker_job_id : mission.writer_job_id,
      jobStatus: mission.checkpoint || null,
      adsCount: mission.ads_count,
    };
  });

  const finishedMissions: FinishedMission[] = finishedMissionsData.map(mission => ({
    id: mission.id,
    status: mission.status === "DONE" ? "concluído" as FinishedStatus : 
            mission.error_code === "CANCELLED" ? "incompleto" as FinishedStatus : 
            "falhou" as FinishedStatus,
    ads: mission.ads_count || 0,
  }));

  const processors = writersArray.map(w => ({
    id: w.id,
    name: w.name,
    type: "writer" as const,
    active: w.active,
    active_missions: [] as string[],
    ads_processed: 0,
    total_jobs: 0,
    success_rate: 0,
  }));

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/execution/start");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/execution/stop");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      setCancellingId(id);
      const res = await apiRequest("POST", `/api/execution/cancel-mission/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Missão cancelada" });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
      if (selectedMission?.id === cancellingId) {
        setSelectedMission(null);
      }
      setCancellingId(null);
    },
    onError: () => {
      setCancellingId(null);
    },
  });

  const retryMissionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/missions/${id}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Missão adicionada à fila para retry" });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
    },
  });

  const bulkRemoveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const promises = ids.map(id => 
        apiRequest("POST", `/api/execution/cancel-mission/${id}`)
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      toast({ title: `${selectedQueueIds.length} missões removidas da fila` });
      setSelectedQueueIds([]);
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
    },
  });

  const isExecuting = executionStatus?.is_running || false;
  const workers = executionStatus?.workers || [];
  const allQueueMissions = executionStatus?.queue?.missions || [];
  const queue = statusFilter.length > 0 
    ? allQueueMissions.filter(m => statusFilter.includes(m.status))
    : allQueueMissions;
  const queueTotal = executionStatus?.queue?.total || 0;
  const stats = executionStatus?.stats || { running: 0, queued: 0, completed_today: 0, failed_today: 0, missions_today: 0 };

  const toggleQueueSelection = (id: string) => {
    setSelectedQueueIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const currentPageIds = queue
      .slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE)
      .map(m => m.id);
    const allSelected = currentPageIds.every(id => selectedQueueIds.includes(id));
    if (allSelected) {
      setSelectedQueueIds(prev => prev.filter(id => !currentPageIds.includes(id)));
    } else {
      setSelectedQueueIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    }
  };

  const toggleStatusFilter = (status: string) => {
    setStatusFilter(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const availableStatuses = ["QUEUED", "RUNNING", "COMPLETED", "FAILED"];
  
  const totalWorkersRegistered = workersArray.length;
  const runningWorkersCount = workers.filter(w => w.status === "running").length;

  const missionsToday = stats.missions_today || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            "text-xl font-bold tracking-tight",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitore e controle a execução de missões
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setShowSelectModal(true)}
            data-testid="button-select-missions"
          >
            Selecionar Missões
          </Button>

          <Button 
            variant="outline" 
            data-testid="button-interrupt"
            onClick={() => stopMutation.mutate()}
            disabled={!isExecuting || stopMutation.isPending}
          >
            {stopMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Pause className="w-4 h-4 mr-2" />
            )}
            Interromper
          </Button>

          {isExecuting ? (
            <Button 
              variant="destructive" 
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              data-testid="button-stop-execution"
            >
              {stopMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Pause className="w-4 h-4 mr-2" />
              )}
              Parar
            </Button>
          ) : (
            <Button 
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || queueTotal === 0}
              data-testid="button-start-execution"
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Iniciar
            </Button>
          )}
        </div>
      </div>
      <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard value={stats.running} label="TOTAL ADS" icon={<Zap className="w-6 h-6" strokeWidth={1.5} />} />
            <StatCard value={missionsToday} label="Missões Hoje" icon={<Rocket className="w-6 h-6" strokeWidth={1.5} />} />
            <StatCard value={stats.queued} label="Em Fila" icon={<Clock className="w-6 h-6" strokeWidth={1.5} />} />
            <StatCard value={stats.completed_today} label="Concluídos" icon={<CheckCircle2 className="w-6 h-6" strokeWidth={1.5} />} />
            <StatCard value={stats.failed_today} label="Falhas" icon={<XCircle className="w-6 h-6" strokeWidth={1.5} />} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <Card className={cn(
              "border lg:col-span-2",
              isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
            )}>
              <CardHeader className="px-4 py-3 border-b border-border/50 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Workers Ativos</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {workers.length} ativos
                </span>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-muted-foreground/50 mb-2 animate-spin" />
                    <p className="text-sm text-muted-foreground text-center">
                      Carregando...
                    </p>
                  </div>
                ) : workers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <AlertCircle className="w-8 h-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Nenhum worker ativo.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-row gap-3 overflow-x-auto custom-scrollbar-h pb-2">
                    {workers.map((worker) => (
                      <WorkerCard 
                        key={worker.id}
                        worker={{
                          id: worker.id,
                          name: worker.name,
                          status: worker.status,
                          current_mission: worker.current_mission,
                          session: worker.session,
                          jobs_in_session: worker.jobs_in_session,
                          session_limit: worker.session_limit,
                        }}
                        onViewMission={setSelectedMission}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={cn(
              "border lg:col-span-2",
              isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
            )}>
              <CardHeader className="px-4 py-3 border-b border-border/50 flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">Processors Ativos</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {processors.length} configurados
                </span>
              </CardHeader>
              <CardContent className="p-4">
                {processors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Database className="w-8 h-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground text-center">
                      Nenhum processor configurado.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-row gap-3 overflow-x-auto custom-scrollbar-h pb-2">
                    {processors.map((processor) => (
                      <ProcessorCard 
                        key={processor.id}
                        processor={processor}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className={cn(
            "border",
            isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
          )}>
            <CardHeader className="px-4 py-3 border-b border-border flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Missões ativas</CardTitle>
              <span className="text-xs text-muted-foreground">
                {stats.running} em execução
              </span>
            </CardHeader>
            <CardContent className="p-3">
              {activeMissions.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <p className="text-sm">Nenhuma missão ativa no momento</p>
                </div>
              ) : (
                <div className="flex flex-row gap-3 overflow-x-auto custom-scrollbar-h pb-2">
                  {activeMissions.map((mission) => {
                    const fullMission = runningMissions.find(m => m.id === mission.id);
                    return (
                      <ActiveMissionCard
                        key={mission.id}
                        mission={mission}
                        onViewDetails={() => fullMission && setSelectedMission(fullMission)}
                        onEdit={() => fullMission && setSelectedMission(fullMission)}
                        onCancel={() => cancelMutation.mutate(mission.id)}
                      />
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={cn(
            "border",
            isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
          )}>
            <CardHeader className="px-4 py-[18px] border-b border-border/50 flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm font-medium">Fila de Execução</CardTitle>
                <span className="text-xs text-primary font-light border-[0.25px] border-primary rounded px-2 py-0.5">
                  {queueTotal} pendentes
                </span>
              </div>
              <div className="flex items-center gap-3">
                {selectedQueueIds.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {selectedQueueIds.length} selecionados
                    </span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => bulkRemoveMutation.mutate(selectedQueueIds)}
                      disabled={bulkRemoveMutation.isPending}
                      data-testid="button-remove-from-queue"
                    >
                      {bulkRemoveMutation.isPending ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3 mr-1" />
                      )}
                      Remover da fila
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn(
                    "text-center text-xs uppercase tracking-wider",
                    isDark ? "text-muted-foreground" : "text-gray-500"
                  )}>
                    <th className="py-3 font-medium text-center w-10 px-[20px]">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={toggleSelectAll}
                          className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            queue.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE).length > 0 &&
                            queue.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE).every(m => selectedQueueIds.includes(m.id))
                              ? "bg-primary border-primary"
                              : "border-primary"
                          )}
                          data-testid="checkbox-select-all"
                        >
                          {queue.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE).length > 0 &&
                           queue.slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE).every(m => selectedQueueIds.includes(m.id)) && (
                            <Check className="w-3 h-3 text-primary-foreground" />
                          )}
                        </button>
                      </div>
                    </th>
                    <th className="py-3 font-medium text-center">Missão</th>
                    <th className="py-3 font-medium text-center">Progresso</th>
                    <th className="py-3 font-medium text-center px-3">Ads extraídos</th>
                    <th className="py-3 font-medium text-center px-3 relative">
                      <button
                        onClick={() => setShowStatusFilter(!showStatusFilter)}
                        className="inline-flex items-center gap-1 cursor-pointer"
                        data-testid="button-status-filter"
                      >
                        Status
                        {statusFilter.length > 0 && (
                          <span className="text-primary">({statusFilter.length})</span>
                        )}
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      </button>
                      {showStatusFilter && (
                        <div className={cn(
                          "absolute top-full left-1/2 -translate-x-1/2 mt-1 z-50 rounded-md border p-2 min-w-[140px] text-left normal-case",
                          isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                        )}>
                          {availableStatuses.map(status => (
                            <div
                              key={status}
                              className={cn(
                                "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm",
                                "hover-elevate"
                              )}
                              onClick={() => toggleStatusFilter(status)}
                              data-testid={`filter-status-${status.toLowerCase()}`}
                            >
                              <div className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center",
                                statusFilter.includes(status) 
                                  ? "bg-primary border-primary" 
                                  : isDark ? "border-dark-600" : "border-gray-300"
                              )}>
                                {statusFilter.includes(status) && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </div>
                              <span className="text-xs font-normal">{status}</span>
                            </div>
                          ))}
                          {statusFilter.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full mt-1 text-xs"
                              onClick={() => setStatusFilter([])}
                            >
                              Limpar filtros
                            </Button>
                          )}
                        </div>
                      )}
                    </th>
                    <th className="py-3 font-medium text-center px-3">Alocação</th>
                    <th className="py-3 font-medium text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Clock className="w-8 h-8 text-muted-foreground/50 mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Fila vazia. Clique em "Selecionar Missões" para adicionar.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    queue
                      .slice((queuePage - 1) * ITEMS_PER_PAGE, queuePage * ITEMS_PER_PAGE)
                      .map((mission) => {
                      const queueProgress = getQueueProgress(mission.checkpoint, mission.status);
                      const allocation = getAllocationType(mission.checkpoint, mission.status);
                      const isSelected = selectedQueueIds.includes(mission.id);
                      
                      return (
                        <tr 
                          key={mission.id} 
                          className={cn(
                            "border-t transition-colors",
                            isDark ? "border-dark-700/50" : "border-gray-100/70",
                            isSelected
                              ? isDark ? "bg-primary/10" : "bg-amber-50"
                              : ""
                          )}
                          data-testid={`queue-row-${mission.id}`}
                        >
                          <td className="py-1.5 text-center px-[20px]">
                            <button
                              onClick={() => toggleQueueSelection(mission.id)}
                              className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors mx-auto",
                                isSelected
                                  ? "bg-primary border-primary"
                                  : "border-primary"
                              )}
                              data-testid={`checkbox-${mission.id}`}
                            >
                              {isSelected && (
                                <Check className="w-3 h-3 text-primary-foreground" />
                              )}
                            </button>
                          </td>
                          <td className="py-1.5 text-sm text-muted-foreground text-center">
                            {mission.id}
                          </td>
                          <td className="py-1.5">
                            <div className="flex items-center gap-1 w-24 mx-auto">
                              {queueProgress.map((status, idx) => (
                                <ProgressBar key={idx} status={status} />
                              ))}
                            </div>
                          </td>
                          <td className="py-1.5 text-center text-sm text-muted-foreground px-3">
                            {mission.ads_count != null ? String(mission.ads_count).padStart(2, '0') : "00"}
                          </td>
                          <td className="py-1.5 text-center px-3">
                            {getStatusBadge(mission.status)}
                          </td>
                          <td className="py-1.5 text-center px-3">
                            {getAllocationBadge(allocation)}
                          </td>
                          <td className="py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedMission(mission)}
                                data-testid={`button-view-${mission.id}`}
                              >
                                <Eye className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              {mission.status === "QUEUED" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => cancelMutation.mutate(mission.id)}
                                  disabled={cancellingId === mission.id}
                                  data-testid={`button-cancel-${mission.id}`}
                                >
                                  {cancellingId === mission.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <X className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {queue.length > 0 && (
              <div className="px-4 py-3 border-t border-border/50 flex items-center justify-between mt-[0px] mb-[0px] pl-[30px] pr-[30px] pt-[22px] pb-[22px]">
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQueuePage(p => Math.max(1, p - 1))}
                    disabled={queuePage === 1}
                    className="text-muted-foreground"
                    data-testid="button-queue-prev"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  {Array.from({ length: Math.ceil(queue.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={page === queuePage ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setQueuePage(page)}
                      className={cn(
                        "min-w-8",
                        page === queuePage && "bg-primary text-primary-foreground"
                      )}
                      data-testid={`button-queue-page-${page}`}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setQueuePage(p => Math.min(Math.ceil(queue.length / ITEMS_PER_PAGE), p + 1))}
                    disabled={queuePage >= Math.ceil(queue.length / ITEMS_PER_PAGE)}
                    className="text-muted-foreground"
                    data-testid="button-queue-next"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <div className="flex-1 flex justify-end">
                  <span className="text-xs text-muted-foreground">
                    {queue.length} itens totais
                  </span>
                </div>
              </div>
            )}
          </Card>

          <Card className={cn(
            "border",
            isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
          )}>
            <CardHeader className="px-4 py-[18px] border-b border-border/50 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium">Missões Finalizadas</CardTitle>
            </CardHeader>
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className={cn(
                    "text-center text-xs uppercase tracking-wider",
                    isDark ? "text-muted-foreground" : "text-gray-500"
                  )}>
                    <th className="py-3 font-medium text-center">Missão</th>
                    <th className="py-3 font-medium text-center">Status</th>
                    <th className="py-3 font-medium text-center">Ads</th>
                    <th className="py-3 font-medium text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {finishedMissions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-muted-foreground/50 mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Nenhuma missão finalizada ainda
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    finishedMissions
                      .slice((finishedPage - 1) * FINISHED_ITEMS_PER_PAGE, finishedPage * FINISHED_ITEMS_PER_PAGE)
                      .map((mission) => {
                        const fullMission = finishedMissionsData.find(m => m.id === mission.id);
                        return (
                          <tr 
                            key={mission.id} 
                            className={cn(
                              "border-t transition-colors",
                              isDark ? "border-dark-700/50" : "border-gray-100/70"
                            )}
                            data-testid={`finished-row-${mission.id}`}
                          >
                            <td className="py-1.5 text-xs text-muted-foreground text-center">
                              {mission.id}
                            </td>
                            <td className="py-1.5 text-center">
                              {getFinishedStatusBadge(mission.status)}
                            </td>
                            <td className="py-1.5 text-center text-xs text-muted-foreground">
                              {mission.ads.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-1.5 text-center">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-menu-${mission.id}`}
                                  >
                                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => fullMission && setSelectedMission(fullMission)}>
                                    <Eye className="w-4 h-4 mr-2" />
                                    Detalhes
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => fullMission && retryMissionMutation.mutate(fullMission.id)}>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Retry
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
            {finishedMissions.length > FINISHED_ITEMS_PER_PAGE && (
              <div className="px-4 py-3 border-t border-border/50 flex items-center justify-start gap-4 pl-[30px] pr-[30px] pt-[22px] pb-[22px]">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFinishedPage(p => Math.max(1, p - 1))}
                    disabled={finishedPage === 1}
                    className="text-muted-foreground"
                    data-testid="button-finished-prev"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  {Array.from({ length: Math.ceil(finishedMissions.length / FINISHED_ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                    <Button
                      key={page}
                      variant={page === finishedPage ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setFinishedPage(page)}
                      className={cn(
                        "min-w-8",
                        page === finishedPage && "bg-primary text-primary-foreground"
                      )}
                      data-testid={`button-finished-page-${page}`}
                    >
                      {page}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFinishedPage(p => Math.min(Math.ceil(finishedMissions.length / FINISHED_ITEMS_PER_PAGE), p + 1))}
                    disabled={finishedPage >= Math.ceil(finishedMissions.length / FINISHED_ITEMS_PER_PAGE)}
                    className="text-muted-foreground"
                    data-testid="button-finished-next"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {finishedMissions.length} itens totais
                </span>
              </div>
            )}
          </Card>
        </>
      <SelectMissionsModal 
        open={showSelectModal}
        onClose={() => setShowSelectModal(false)}
        workers={workers}
        onSuccess={() => {}}
      />
      <MissionDetailsModal
        mission={selectedMission}
        onClose={() => setSelectedMission(null)}
        onRetry={(id) => retryMissionMutation.mutate(id)}
        onCancel={(id) => cancelMutation.mutate(id)}
        isRetrying={retryMissionMutation.isPending}
        isCancelling={cancelMutation.isPending}
      />
    </div>
  );
}
