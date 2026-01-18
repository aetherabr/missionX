import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Plus, 
  Upload, 
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Video,
  Image,
  Globe,
  MoreHorizontal,
  Trash2,
  Play,
  RefreshCw,
  Loader2,
  Database,
  ChevronDown,
  Layers,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileJson,
  FileText,
  Info,
  X
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useTheme } from "@/contexts/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Mission, MissionStatusType, MediaTypeValue, MissionSummary } from "@shared/schema";

const statusConfig: Record<MissionStatusType, { label: string; className: string }> = {
  PENDING: { label: "Pendente", className: "bg-gray-500/10 border-gray-500/40 text-gray-400" },
  QUEUED: { label: "Na Fila", className: "bg-blue-500/10 border-blue-500/40 text-blue-400" },
  RUNNING: { label: "Executando", className: "bg-purple-500/10 border-purple-500/40 text-purple-400" },
  DONE: { label: "Concluída", className: "bg-green-500/10 border-green-500/40 text-green-400" },
  FAILED: { label: "Falhou", className: "bg-red-500/10 border-red-500/40 text-red-400" },
};

const mediaTypeIcons: Record<MediaTypeValue, typeof Video> = {
  all: Globe,
  video: Video,
  image: Image,
};

function StatusBadge({ status }: { status: MissionStatusType }) {
  const config = statusConfig[status];
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-light uppercase tracking-wide border",
      config.className
    )}>
      {config.label}
    </span>
  );
}

function LanguageBadges({ languages }: { languages: string[] }) {
  const { isDark } = useTheme();
  return (
    <div className="flex items-center gap-1">
      {languages.map((lang) => (
        <span 
          key={lang}
          className={cn(
            "px-1.5 py-0.5 text-[10px] font-light uppercase rounded",
            isDark ? "bg-dark-700 text-muted-foreground" : "bg-gray-100 text-gray-600"
          )}
        >
          {lang}
        </span>
      ))}
    </div>
  );
}

type SortColumn = "id" | "date_start" | "date_end" | "media_type" | "languages" | "status" | "ads_count" | null;
type SortDirection = "asc" | "desc";

function SortIcon({ column, currentColumn, direction }: { 
  column: SortColumn; 
  currentColumn: SortColumn; 
  direction: SortDirection;
}) {
  const isActive = column === currentColumn;
  
  if (isActive) {
    return direction === "asc" 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-foreground" />
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-foreground" />;
  }
  
  return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50" />;
}

export default function Missions() {
  const { isDark } = useTheme();
  const { toast } = useToast();
  const [selectedMissions, setSelectedMissions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [dateStartFilter, setDateStartFilter] = useState<string>("");
  const [dateEndFilter, setDateEndFilter] = useState<string>("");
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showSingleModal, setShowSingleModal] = useState(false);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [sortColumn, setSortColumn] = useState<SortColumn>("date_start");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  
  // Form state for bulk creation
  const [bulkDateStart, setBulkDateStart] = useState("");
  const [bulkDateEnd, setBulkDateEnd] = useState("");
  const [bulkMediaType, setBulkMediaType] = useState<string>("all");
  const [bulkLanguages, setBulkLanguages] = useState<string[]>(["pt"]);
  
  // Form state for single mission creation
  const [singleDateStart, setSingleDateStart] = useState("");
  const [singleDateEnd, setSingleDateEnd] = useState("");
  const [singleMediaType, setSingleMediaType] = useState<string>("all");
  const [singleLanguages, setSingleLanguages] = useState<string[]>(["pt"]);
  
  // Form state for editing mission
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [editDateStart, setEditDateStart] = useState("");
  const [editDateEnd, setEditDateEnd] = useState("");
  const [editMediaType, setEditMediaType] = useState<string>("all");
  const [editLanguages, setEditLanguages] = useState<string[]>(["pt"]);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    params.set("offset", String(page * limit));
    params.set("limit", String(limit));
    if (searchQuery.trim()) params.set("searchId", searchQuery.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (mediaTypeFilter !== "all") params.set("mediaType", mediaTypeFilter);
    if (languageFilter !== "all") params.set("language", languageFilter);
    if (dateStartFilter) params.set("dateStart", dateStartFilter);
    if (dateEndFilter) params.set("dateEnd", dateEndFilter);
    if (sortColumn) params.set("sortBy", sortColumn);
    params.set("sortOrder", sortDirection);
    return `/api/missions?${params.toString()}`;
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
    setPage(0);
  };

  const { data, isLoading, refetch } = useQuery<{
    data: Mission[];
    pagination: { total: number; limit: number; offset: number; hasMore: boolean };
    summary: MissionSummary;
  }>({
    queryKey: ["/api/missions", page, limit, searchQuery, statusFilter, mediaTypeFilter, languageFilter, dateStartFilter, dateEndFilter, sortColumn, sortDirection],
    queryFn: async () => {
      const res = await fetch(buildQueryUrl(), { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 10000,
  });

  const missions = data?.data || [];
  const summary = data?.summary || {
    total: 0,
    pending: 0,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
  };

  const singleCreateMutation = useMutation({
    mutationFn: async (payload: {
      date_start: string;
      date_end: string;
      media_type: string;
      languages: string[];
    }) => {
      const res = await apiRequest("POST", "/api/missions", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Missão criada",
        description: "Missão criada com sucesso",
      });
      setShowSingleModal(false);
      setSingleDateStart("");
      setSingleDateEnd("");
      setSingleMediaType("all");
      setSingleLanguages(["pt"]);
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao criar missão",
        variant: "destructive",
      });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async (payload: {
      date_start: string;
      date_end: string;
      media_type: string;
      languages: string[];
    }) => {
      const res = await apiRequest("POST", "/api/missions/bulk", payload);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Missões criadas",
        description: data.message,
      });
      setShowBulkModal(false);
      setBulkDateStart("");
      setBulkDateEnd("");
      setBulkMediaType("all");
      setBulkLanguages(["pt"]);
      setPage(0);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao criar missões",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/missions/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Missão excluída" });
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map(id => apiRequest("DELETE", `/api/missions/${id}`))
      );
      const failed = results.filter(r => r.status === "rejected").length;
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      return { failed, succeeded, total: ids.length };
    },
    onSuccess: (result) => {
      if (result.failed === 0) {
        toast({ title: `${result.succeeded} missões excluídas` });
      } else if (result.succeeded > 0) {
        toast({ 
          title: `${result.succeeded} missões excluídas`,
          description: `${result.failed} falharam ao excluir`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Erro",
          description: "Falha ao excluir missões",
          variant: "destructive",
        });
      }
      setSelectedMissions([]);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao excluir missões",
        variant: "destructive",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/missions/${id}/retry`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Missão adicionada à fila" });
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: { date_start: string; date_end: string; media_type: string; languages: string[] } }) => {
      const res = await apiRequest("PATCH", `/api/missions/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Missão atualizada com sucesso" });
      setShowEditModal(false);
      setEditingMission(null);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar missão",
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (missions: Record<string, unknown>[]) => {
      const res = await apiRequest("POST", "/api/missions/import", { missions });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Importação concluída",
        description: data.message || `${data.created} missões importadas`,
      });
      setShowImportModal(false);
      setImportText("");
      setImportFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao importar missões",
        variant: "destructive",
      });
    },
  });

  const parseCSV = (text: string): Record<string, unknown>[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
    const results: Record<string, unknown>[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/['"]/g, ""));
      const obj: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx] || "";
      });
      results.push(obj);
    }
    
    return results;
  };

  const parseJSON = (text: string): Record<string, unknown>[] => {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  };

  const processImport = () => {
    let missions: Record<string, unknown>[] = [];
    
    if (importText.trim()) {
      // Detect format
      const trimmed = importText.trim();
      if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
        missions = parseJSON(trimmed);
      } else {
        missions = parseCSV(trimmed);
      }
    }
    
    if (missions.length === 0) {
      toast({
        title: "Erro",
        description: "Nenhuma missão válida encontrada. Verifique o formato dos dados.",
        variant: "destructive",
      });
      return;
    }
    
    importMutation.mutate(missions);
  };

  const handleFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setImportText(text);
      setImportFile(file);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".json") || file.name.endsWith(".csv"))) {
      handleFileRead(file);
    } else {
      toast({
        title: "Formato inválido",
        description: "Por favor, use arquivos .json ou .csv",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  };

  const openEditModal = (mission: Mission) => {
    setEditingMission(mission);
    setEditDateStart(mission.date_start);
    setEditDateEnd(mission.date_end || mission.date_start);
    setEditMediaType(mission.media_type);
    setEditLanguages(mission.languages);
    setShowEditModal(true);
  };

  const toggleEditLanguage = (lang: string) => {
    setEditLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleUpdateMission = () => {
    if (!editingMission || !editDateStart || !editDateEnd || editLanguages.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate({
      id: editingMission.id,
      payload: {
        date_start: editDateStart,
        date_end: editDateEnd,
        media_type: editMediaType,
        languages: editLanguages,
      },
    });
  };

  const toggleMission = (id: string) => {
    setSelectedMissions((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedMissions.length === missions.length) {
      setSelectedMissions([]);
    } else {
      setSelectedMissions(missions.map((m) => m.id));
    }
  };

  const toggleBulkLanguage = (lang: string) => {
    setBulkLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const toggleSingleLanguage = (lang: string) => {
    setSingleLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleCreateSingle = () => {
    if (!singleDateStart || !singleDateEnd || singleLanguages.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    singleCreateMutation.mutate({
      date_start: singleDateStart,
      date_end: singleDateEnd,
      media_type: singleMediaType,
      languages: singleLanguages,
    });
  };

  const handleCreateBulk = () => {
    if (!bulkDateStart || !bulkDateEnd || bulkLanguages.length === 0) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive",
      });
      return;
    }
    bulkCreateMutation.mutate({
      date_start: bulkDateStart,
      date_end: bulkDateEnd,
      media_type: bulkMediaType,
      languages: bulkLanguages,
    });
  };

  const handleBulkDelete = () => {
    if (selectedMissions.length === 0) return;
    bulkDeleteMutation.mutate(selectedMissions);
  };

  const queueSelectedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/missions/queue", {
        mission_ids: selectedMissions,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Missões adicionadas à fila",
        description: `${data.queued} missões enfileiradas com sucesso`,
      });
      setSelectedMissions([]);
      queryClient.invalidateQueries({ queryKey: ["/api/missions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/execution/status"] });
    },
    onError: (error) => {
      toast({
        title: "Erro ao enfileirar missões",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleQueueSelected = () => {
    if (selectedMissions.length === 0) return;
    queueSelectedMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className={cn(
            "text-xl font-bold tracking-tight",
            isDark ? "text-white" : "text-gray-900"
          )}>
            Banco de Missões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie suas missões de scraping
          </p>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-testid="button-create-mission">
                <Plus className="w-4 h-4 mr-2" />
                Criar Missões
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowSingleModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Missão
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowBulkModal(true)}>
                <Layers className="w-4 h-4 mr-2" />
                Criar Missões em Lote
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" onClick={() => setShowImportModal(true)} data-testid="button-import-batch">
            <Upload className="w-4 h-4 mr-2" />
            Importar Lote
          </Button>
        </div>
      </div>

      {/* Single Mission Modal */}
      <Dialog open={showSingleModal} onOpenChange={setShowSingleModal}>
        <DialogContent className={cn(
          isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
        )}>
          <DialogHeader>
            <DialogTitle>Criar Missão</DialogTitle>
            <DialogDescription>
              Defina os parâmetros para criar uma nova missão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Início</label>
                <Input 
                  type="date" 
                  value={singleDateStart}
                  onChange={(e) => setSingleDateStart(e.target.value)}
                  data-testid="input-single-date-start" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Fim</label>
                <Input 
                  type="date" 
                  value={singleDateEnd}
                  onChange={(e) => setSingleDateEnd(e.target.value)}
                  data-testid="input-single-date-end" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo de Mídia</label>
              <Select value={singleMediaType} onValueChange={setSingleMediaType}>
                <SelectTrigger data-testid="select-single-media-type">
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
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Idiomas</label>
              <div className="flex gap-4">
                {["pt", "eng", "spa"].map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={singleLanguages.includes(lang)}
                      onCheckedChange={() => toggleSingleLanguage(lang)}
                    />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSingleModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateSingle}
              disabled={singleCreateMutation.isPending}
              data-testid="button-confirm-create-single"
            >
              {singleCreateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Criar Missão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Mission Modal */}
      <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
        <DialogContent className={cn(
          isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
        )}>
          <DialogHeader>
            <DialogTitle>Criar Missões em Lote</DialogTitle>
            <DialogDescription>
              Defina o intervalo de datas e parâmetros para criar múltiplas missões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Início</label>
                <Input 
                  type="date" 
                  value={bulkDateStart}
                  onChange={(e) => setBulkDateStart(e.target.value)}
                  data-testid="input-bulk-date-start" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Fim</label>
                <Input 
                  type="date" 
                  value={bulkDateEnd}
                  onChange={(e) => setBulkDateEnd(e.target.value)}
                  data-testid="input-bulk-date-end" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo de Mídia</label>
              <Select value={bulkMediaType} onValueChange={setBulkMediaType}>
                <SelectTrigger data-testid="select-bulk-media-type">
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
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Idiomas</label>
              <div className="flex gap-4">
                {["pt", "eng", "spa"].map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={bulkLanguages.includes(lang)}
                      onCheckedChange={() => toggleBulkLanguage(lang)}
                    />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateBulk}
              disabled={bulkCreateMutation.isPending}
              data-testid="button-confirm-create-bulk"
            >
              {bulkCreateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Criar Missões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Mission Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className={cn(
          isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
        )}>
          <DialogHeader>
            <DialogTitle>Editar Missão</DialogTitle>
            <DialogDescription>
              Atualize os dados da missão selecionada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Início</label>
                <Input 
                  type="date" 
                  value={editDateStart}
                  onChange={(e) => setEditDateStart(e.target.value)}
                  data-testid="input-edit-date-start" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Fim</label>
                <Input 
                  type="date" 
                  value={editDateEnd}
                  onChange={(e) => setEditDateEnd(e.target.value)}
                  data-testid="input-edit-date-end" 
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo de Mídia</label>
              <Select value={editMediaType} onValueChange={setEditMediaType}>
                <SelectTrigger data-testid="select-edit-media-type">
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
              <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Idiomas</label>
              <div className="flex gap-4">
                {["pt", "eng", "spa"].map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={editLanguages.includes(lang)}
                      onCheckedChange={() => toggleEditLanguage(lang)}
                    />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdateMission}
              disabled={updateMutation.isPending}
              data-testid="button-confirm-edit"
            >
              {updateMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Missions Modal - Enterprise/SaaS Design */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) {
          setImportText("");
          setImportFile(null);
        }
      }}>
        <DialogContent className={cn(
          "max-w-3xl p-0 gap-0 overflow-hidden",
          isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
        )}>
          {/* Premium Header */}
          <div className={cn(
            "px-6 py-5 border-b",
            isDark ? "border-dark-700 bg-dark-800/80" : "border-gray-100 bg-gray-50/50"
          )}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl",
                  isDark ? "bg-primary/10" : "bg-primary/5"
                )}>
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Importar Missões</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Importação em lote via arquivo ou texto
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                  JSON
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                  CSV
                </Badge>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className={cn(
            "p-6 space-y-5",
            isDark ? "bg-dark-800" : "bg-white"
          )}>
              {/* Section 1: File Upload */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    isDark ? "bg-dark-700 text-muted-foreground" : "bg-gray-100 text-gray-500"
                  )}>
                    1
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Upload de Arquivo
                  </span>
                </div>
                
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-8 px-6 border-2 border-dashed rounded-xl transition-all cursor-pointer group",
                    isDragging 
                      ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(250,204,21,0.15)]" 
                      : isDark 
                        ? "border-dark-600 hover:border-dark-500 hover:bg-dark-700/30" 
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                  )}
                >
                  <div className={cn(
                    "p-3 rounded-xl mb-3 transition-colors",
                    isDragging 
                      ? "bg-primary/10" 
                      : isDark 
                        ? "bg-dark-700 group-hover:bg-dark-600" 
                        : "bg-gray-100 group-hover:bg-gray-200"
                  )}>
                    <Upload className={cn(
                      "w-6 h-6 transition-colors",
                      isDragging ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <p className={cn(
                    "text-sm font-medium mb-1",
                    isDragging ? "text-primary" : ""
                  )}>
                    {isDragging ? "Solte o arquivo aqui" : "Arraste um arquivo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ou clique para selecionar
                  </p>
                  <input
                    type="file"
                    accept=".json,.csv"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="import-file-input"
                  />
                  
                  {importFile && (
                    <div className={cn(
                      "mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                      isDark ? "bg-dark-700" : "bg-gray-100"
                    )}>
                      {importFile.name.endsWith(".json") ? (
                        <FileJson className="w-4 h-4 text-primary" />
                      ) : (
                        <FileText className="w-4 h-4 text-primary" />
                      )}
                      <span className="font-mono text-xs">{importFile.name}</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setImportFile(null); setImportText(""); }}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex-1 h-px",
                  isDark ? "bg-dark-700" : "bg-gray-200"
                )} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  ou
                </span>
                <div className={cn(
                  "flex-1 h-px",
                  isDark ? "bg-dark-700" : "bg-gray-200"
                )} />
              </div>

              {/* Section 2: Paste Content */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold",
                    isDark ? "bg-dark-700 text-muted-foreground" : "bg-gray-100 text-gray-500"
                  )}>
                    2
                  </div>
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Colar Conteúdo
                  </span>
                </div>
                
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder='[{"start_date": "2025-01-01", "end_date": "2025-01-31", "media": "all", "lang": "pt"}]'
                  className={cn(
                    "min-h-[100px] font-mono text-xs resize-none transition-all",
                    isDark 
                      ? "bg-dark-900 border-dark-600 focus:border-primary/50 focus:ring-primary/20" 
                      : "focus:border-primary/50 focus:ring-primary/20"
                  )}
                  data-testid="textarea-import-content"
                />
                
                {importText.trim() && (
                  <div className="flex items-center gap-2 text-xs">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      importText.trim().startsWith("[") || importText.trim().startsWith("{")
                        ? "bg-green-500"
                        : "bg-blue-500"
                    )} />
                    <span className="text-muted-foreground">
                      {importText.trim().startsWith("[") || importText.trim().startsWith("{")
                        ? "Formato JSON detectado"
                        : "Formato CSV detectado"}
                    </span>
                  </div>
                )}
              </div>
          </div>

          {/* Footer */}
          <div className={cn(
            "px-6 py-4 border-t flex items-center justify-between gap-4",
            isDark ? "border-dark-700 bg-dark-800/50" : "border-gray-100 bg-gray-50/30"
          )}>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Registros inválidos serão ignorados automaticamente
            </p>
            <div className="flex items-center gap-3 ml-auto">
              <Button 
                variant="ghost" 
                onClick={() => setShowImportModal(false)}
                className="text-muted-foreground"
              >
                Cancelar
              </Button>
              <Button 
                onClick={processImport}
                disabled={importMutation.isPending || !importText.trim()}
                data-testid="button-process-import"
                className="min-w-[140px]"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Importar Lote
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(summary).map(([key, value]) => (
          <Card 
            key={key}
            className={cn(
              "border cursor-pointer transition-all",
              isDark 
                ? "bg-dark-800/50 border-dark-700 hover:border-dark-600" 
                : "bg-white/80 border-gray-200 hover:border-gray-300"
            )}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {key === "total" ? "Total" : 
                 key === "pending" ? "Pendentes" :
                 key === "queued" ? "Na Fila" :
                 key === "running" ? "Executando" :
                 key === "done" ? "Concluídas" : "Falhas"}
              </p>
              <p className={cn(
                "text-xl font-bold font-mono mt-1",
                key === "done" ? "text-green-400" :
                key === "failed" ? "text-red-400" :
                key === "running" ? "text-purple-400" :
                key === "queued" ? "text-blue-400" :
                isDark ? "text-white" : "text-gray-900"
              )}>
                {value.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={cn(
        "border",
        isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
      )}>
        <CardHeader className="px-6 py-4 border-b border-border">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por ID..." 
                  className="pl-9 w-48"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-36" data-testid="filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PENDING">Pendente</SelectItem>
                  <SelectItem value="QUEUED">Na Fila</SelectItem>
                  <SelectItem value="RUNNING">Executando</SelectItem>
                  <SelectItem value="DONE">Concluída</SelectItem>
                  <SelectItem value="FAILED">Falhou</SelectItem>
                </SelectContent>
              </Select>
              <Select value={mediaTypeFilter} onValueChange={(v) => { setMediaTypeFilter(v); setPage(0); }}>
                <SelectTrigger className="w-32" data-testid="filter-media-type">
                  <SelectValue placeholder="Mídia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="image">Imagem</SelectItem>
                </SelectContent>
              </Select>
              <Select value={languageFilter} onValueChange={(v) => { setLanguageFilter(v); setPage(0); }}>
                <SelectTrigger className="w-28" data-testid="filter-language">
                  <SelectValue placeholder="Idioma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pt">PT</SelectItem>
                  <SelectItem value="eng">ENG</SelectItem>
                  <SelectItem value="spa">SPA</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input 
                  type="date"
                  value={dateStartFilter}
                  onChange={(e) => { setDateStartFilter(e.target.value); setPage(0); }}
                  className="w-36"
                  data-testid="filter-date-start"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <Input 
                  type="date"
                  value={dateEndFilter}
                  onChange={(e) => { setDateEndFilter(e.target.value); setPage(0); }}
                  className="w-36"
                  data-testid="filter-date-end"
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {selectedMissions.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedMissions.length} selecionadas
                </span>
                <Button 
                  size="sm" 
                  onClick={handleQueueSelected}
                  disabled={queueSelectedMutation.isPending}
                  data-testid="button-queue-selected"
                >
                  {queueSelectedMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 mr-1" />
                  )}
                  Adicionar à Fila
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-delete-selected"
                >
                  {bulkDeleteMutation.isPending ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3 mr-1" />
                  )}
                  Excluir
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : missions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Database className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-sm text-muted-foreground">Nenhuma missão encontrada</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => setShowSingleModal(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Criar primeira missão
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={cn(
                    "border-b",
                    isDark ? "bg-dark-800/50 border-dark-700" : "bg-gray-50 border-gray-200"
                  )}>
                    <th className="px-6 py-3 text-left">
                      <Checkbox 
                        checked={selectedMissions.length === missions.length && missions.length > 0}
                        onCheckedChange={toggleAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("id")}
                      data-testid="sort-id"
                    >
                      <span className="inline-flex items-center">
                        ID
                        <SortIcon column="id" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("date_start")}
                      data-testid="sort-date-start"
                    >
                      <span className="inline-flex items-center">
                        Data Inicial
                        <SortIcon column="date_start" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("date_end")}
                      data-testid="sort-date-end"
                    >
                      <span className="inline-flex items-center">
                        Data Final
                        <SortIcon column="date_end" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("media_type")}
                      data-testid="sort-media-type"
                    >
                      <span className="inline-flex items-center">
                        Mídia
                        <SortIcon column="media_type" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("languages")}
                      data-testid="sort-languages"
                    >
                      <span className="inline-flex items-center">
                        Idiomas
                        <SortIcon column="languages" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("status")}
                      data-testid="sort-status"
                    >
                      <span className="inline-flex items-center">
                        Status
                        <SortIcon column="status" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover-elevate"
                      onClick={() => handleSort("ads_count")}
                      data-testid="sort-ads"
                    >
                      <span className="inline-flex items-center">
                        Ads
                        <SortIcon column="ads_count" currentColumn={sortColumn} direction={sortDirection} />
                      </span>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((mission) => {
                    const MediaIcon = mediaTypeIcons[mission.media_type as MediaTypeValue] || Globe;
                    return (
                      <tr 
                        key={mission.id}
                        className={cn(
                          "border-b transition-colors",
                          isDark 
                            ? "border-dark-700/50 hover:bg-dark-800/30" 
                            : "border-gray-100 hover:bg-gray-50"
                        )}
                        data-testid={`row-mission-${mission.id}`}
                      >
                        <td className="px-6 py-4">
                          <Checkbox 
                            checked={selectedMissions.includes(mission.id)}
                            onCheckedChange={() => toggleMission(mission.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                            {mission.id}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                              {mission.date_start}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                              {mission.date_end || mission.date_start}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <MediaIcon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                              {mission.media_type}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <LanguageBadges languages={mission.languages} />
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={mission.status} />
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-normal uppercase tracking-wider text-muted-foreground">
                            {mission.ads_count?.toLocaleString() || "0"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon"
                                data-testid={`button-actions-${mission.id}`}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditModal(mission)}>
                                <Pencil className="w-4 h-4 mr-2" />
                                Editar Missão
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Play className="w-4 h-4 mr-2" />
                                Adicionar à Fila
                              </DropdownMenuItem>
                              {mission.status === "FAILED" && (
                                <DropdownMenuItem onClick={() => retryMutation.mutate(mission.id)}>
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Retry
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem 
                                className="text-red-500"
                                onClick={() => deleteMutation.mutate(mission.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {missions.length > 0 && (() => {
            const totalPages = Math.ceil((data?.pagination.total || 0) / limit);
            const currentPage = page + 1;
            
            return (
              <div className={cn(
                "flex flex-col items-center gap-4 px-6 py-4 border-t",
                isDark ? "border-dark-700" : "border-gray-200"
              )}>
                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-muted-foreground"
                    disabled={page === 0}
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                  </Button>
                  
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "min-w-[36px]",
                          currentPage === pageNum && "bg-primary text-primary-foreground"
                        )}
                        onClick={() => setPage(pageNum - 1)}
                        data-testid={`button-page-${pageNum}`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-muted-foreground"
                    disabled={!data?.pagination.hasMore}
                    onClick={() => setPage(p => p + 1)}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
                
                <div className="flex items-center justify-between w-full">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {page * limit + 1}-{Math.min((page + 1) * limit, data?.pagination.total || 0)} de {data?.pagination.total?.toLocaleString() || 0} missões
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Itens por página:</span>
                    <Select 
                      value={String(limit)} 
                      onValueChange={(val) => {
                        setLimit(Number(val));
                        setPage(0);
                      }}
                    >
                      <SelectTrigger className="w-[80px]" data-testid="select-page-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
