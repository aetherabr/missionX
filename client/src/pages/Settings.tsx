import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Server, 
  Shield, 
  Database, 
  Cloud, 
  Settings2,
  Plus,
  Trash2,
  Play,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Loader2,
  Activity,
  MoreVertical,
  Pencil
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
import type { Worker, Writer, Uploader, Proxy, ExecutionConfig } from "@shared/schema";

interface ProxyRowProps {
  proxy: Proxy;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  isTesting: boolean;
}

function ProxyRow({ proxy, onTest, onDelete, onToggle, isTesting }: ProxyRowProps) {
  const { isDark } = useTheme();

  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-xl border",
      isDark ? "border-dark-700 bg-dark-700/30" : "border-gray-200 bg-gray-50"
    )}>
      <div className={cn(
        "w-3 h-3 rounded-full flex-shrink-0",
        proxy.active 
          ? proxy.last_test_ok ? "bg-green-400" : "bg-orange-400"
          : isDark ? "bg-dark-600" : "bg-gray-300"
      )} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "font-medium text-sm truncate",
          isDark ? "text-white" : "text-gray-900"
        )}>
          {proxy.name || "Proxy sem nome"}
        </p>
        <p className="text-xs font-mono text-muted-foreground truncate">
          {proxy.host}{proxy.port ? `:${proxy.port}` : ""} • 
          {proxy.username ? `${proxy.username}@...` : "Sem auth"} • 
          Falhas: {proxy.fail_count}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Switch 
          checked={proxy.active} 
          onCheckedChange={(checked) => onToggle(proxy.id, checked)}
        />
        <span className={cn(
          "text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border",
          proxy.last_test_ok
            ? "bg-green-500/10 border-green-500/40 text-green-400"
            : proxy.last_test_ok === false
              ? "bg-red-500/10 border-red-500/40 text-red-400"
              : isDark 
                ? "bg-dark-700 border-dark-600 text-muted-foreground"
                : "bg-gray-100 border-gray-200 text-gray-500"
        )}>
          {proxy.last_test_ok ? "OK" : proxy.last_test_ok === false ? "Falha" : "N/T"}
        </span>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => onTest(proxy.id)}
          disabled={isTesting}
          data-testid={`test-proxy-${proxy.id}`}
        >
          {isTesting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-red-500 hover:text-red-600"
          onClick={() => onDelete(proxy.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export default function Settings() {
  const { isDark } = useTheme();
  const { toast } = useToast();
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [showAddProxyModal, setShowAddProxyModal] = useState(false);
  const [testingWorkerId, setTestingWorkerId] = useState<string | null>(null);
  const [testingProxyId, setTestingProxyId] = useState<string | null>(null);
  
  // Worker form state
  const [workerName, setWorkerName] = useState("");
  const [workerUrl, setWorkerUrl] = useState("");
  const [workerKey, setWorkerKey] = useState("");
  const [workerStorageDomain, setWorkerStorageDomain] = useState("");
  
  // Writer form state
  const [showAddWriterModal, setShowAddWriterModal] = useState(false);
  const [writerName, setWriterName] = useState("");
  const [writerUrl, setWriterUrl] = useState("");
  const [writerKey, setWriterKey] = useState("");
  const [testingWriterId, setTestingWriterId] = useState<string | null>(null);
  
  // Uploader form state
  const [showAddUploaderModal, setShowAddUploaderModal] = useState(false);
  const [uploaderName, setUploaderName] = useState("");
  const [uploaderUrl, setUploaderUrl] = useState("");
  const [uploaderKey, setUploaderKey] = useState("");
  const [testingUploaderId, setTestingUploaderId] = useState<string | null>(null);
  
  // Proxy form state
  const [proxyName, setProxyName] = useState("");
  const [proxyHost, setProxyHost] = useState("");
  const [proxyPort, setProxyPort] = useState("");
  const [proxyUser, setProxyUser] = useState("");
  const [proxyPass, setProxyPass] = useState("");

  // Queries
  const { data: workersData, isLoading: workersLoading } = useQuery<{ data: Worker[] }>({
    queryKey: ["/api/workers"],
  });

  const { data: writersData, isLoading: writersLoading } = useQuery<{ data: Writer[] }>({
    queryKey: ["/api/writers"],
  });

  const { data: uploadersData, isLoading: uploadersLoading } = useQuery<{ data: Uploader[] }>({
    queryKey: ["/api/uploaders"],
  });

  const { data: proxiesData, isLoading: proxiesLoading } = useQuery<{ data: Proxy[] }>({
    queryKey: ["/api/proxies"],
  });

  const { data: configData } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/config"],
  });

  const workers = workersData?.data || [];
  const writers = writersData?.data || [];
  const uploaders = uploadersData?.data || [];
  const proxies = proxiesData?.data || [];
  const executionConfig = (configData?.execution || {
    refresh_interval: 5,
    auto_retry: true,
    max_retries: 2,
    timeout_session: 180,
    timeout_job: 100,
  }) as ExecutionConfig;

  // Worker mutations
  const createWorkerMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; api_key: string; storage_domain: string | null }) => {
      const res = await apiRequest("POST", "/api/workers", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Worker adicionado" });
      setShowAddWorkerModal(false);
      setWorkerName("");
      setWorkerUrl("");
      setWorkerKey("");
      setWorkerStorageDomain("");
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar worker", variant: "destructive" });
    },
  });

  // Writer mutations
  const createWriterMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; api_key: string }) => {
      const res = await apiRequest("POST", "/api/writers", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Writer adicionado" });
      setShowAddWriterModal(false);
      setWriterName("");
      setWriterUrl("");
      setWriterKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/writers"] });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar writer", variant: "destructive" });
    },
  });

  const deleteWriterMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/writers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Writer removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/writers"] });
    },
  });

  const testWriterMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingWriterId(id);
      const res = await apiRequest("POST", `/api/writers/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Conexão OK" : "Falha na conexão",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/writers"] });
    },
    onSettled: () => {
      setTestingWriterId(null);
    },
  });

  const toggleWriterMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/writers/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/writers"] });
    },
  });

  // Uploader mutations
  const createUploaderMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; api_key: string }) => {
      const res = await apiRequest("POST", "/api/uploaders", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Uploader adicionado" });
      setShowAddUploaderModal(false);
      setUploaderName("");
      setUploaderUrl("");
      setUploaderKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/uploaders"] });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar uploader", variant: "destructive" });
    },
  });

  const deleteUploaderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/uploaders/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Uploader removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/uploaders"] });
    },
  });

  const testUploaderMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingUploaderId(id);
      const res = await apiRequest("POST", `/api/uploaders/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Conexão OK" : "Falha na conexão",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/uploaders"] });
    },
    onSettled: () => {
      setTestingUploaderId(null);
    },
  });

  const toggleUploaderMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/uploaders/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/uploaders"] });
    },
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/workers/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Worker removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
  });

  const testWorkerMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingWorkerId(id);
      const res = await apiRequest("POST", `/api/workers/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Conexão OK" : "Falha na conexão",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
    onSettled: () => {
      setTestingWorkerId(null);
    },
  });

  const toggleWorkerMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/workers/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workers"] });
    },
  });

  // Proxy mutations
  const createProxyMutation = useMutation({
    mutationFn: async (data: { name?: string; host: string; port: number; username?: string; password?: string }) => {
      const res = await apiRequest("POST", "/api/proxies", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Proxy adicionado" });
      setShowAddProxyModal(false);
      setProxyName("");
      setProxyHost("");
      setProxyPort("");
      setProxyUser("");
      setProxyPass("");
      queryClient.invalidateQueries({ queryKey: ["/api/proxies"] });
    },
    onError: () => {
      toast({ title: "Erro ao adicionar proxy", variant: "destructive" });
    },
  });

  const deleteProxyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/proxies/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Proxy removido" });
      queryClient.invalidateQueries({ queryKey: ["/api/proxies"] });
    },
  });

  const toggleProxyMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await apiRequest("PATCH", `/api/proxies/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proxies"] });
    },
  });

  const testProxyMutation = useMutation({
    mutationFn: async (id: string) => {
      setTestingProxyId(id);
      const res = await apiRequest("POST", `/api/proxies/${id}/test`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: data.success ? "Proxy OK" : "Falha no proxy",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proxies"] });
    },
    onSettled: () => {
      setTestingProxyId(null);
    },
  });

  const testAllProxiesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/proxies/test-all");
      return res.json();
    },
    onSuccess: (data) => {
      const passed = data.results.filter((r: { success: boolean }) => r.success).length;
      toast({ 
        title: "Teste concluído",
        description: `${passed}/${data.results.length} proxies funcionais`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/proxies"] });
    },
  });

  // Config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (config: Partial<ExecutionConfig>) => {
      const res = await apiRequest("PATCH", "/api/config", { execution: config });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configurações salvas" });
      queryClient.invalidateQueries({ queryKey: ["/api/config"] });
    },
  });

  const handleCreateWorker = () => {
    if (!workerName || !workerUrl || !workerKey) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    createWorkerMutation.mutate({ 
      name: workerName, 
      url: workerUrl, 
      api_key: workerKey,
      storage_domain: workerStorageDomain || null
    });
  };

  const handleCreateWriter = () => {
    if (!writerName || !writerUrl || !writerKey) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    createWriterMutation.mutate({ name: writerName, url: writerUrl, api_key: writerKey });
  };

  const handleCreateUploader = () => {
    if (!uploaderName || !uploaderUrl || !uploaderKey) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    createUploaderMutation.mutate({ name: uploaderName, url: uploaderUrl, api_key: uploaderKey });
  };

  const handleCreateProxy = () => {
    if (!proxyHost || !proxyPort) {
      toast({ title: "Preencha host e porta", variant: "destructive" });
      return;
    }
    const portNumber = parseInt(proxyPort, 10);
    if (isNaN(portNumber) || portNumber < 1 || portNumber > 65535) {
      toast({ title: "Porta inválida (1-65535)", variant: "destructive" });
      return;
    }
    createProxyMutation.mutate({ 
      name: proxyName || undefined,
      host: proxyHost,
      port: portNumber,
      username: proxyUser || undefined, 
      password: proxyPass || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="workers" className="space-y-6">
        <TabsList className={cn(
          "h-auto p-0 bg-transparent border-b rounded-none w-full justify-start gap-0",
          isDark ? "border-dark-700" : "border-gray-200"
        )}>
          <TabsTrigger 
            value="workers" 
            className={cn(
              "gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isDark ? "data-[state=active]:text-white" : "data-[state=active]:text-gray-900"
            )}
            data-testid="tab-workers"
          >
            <Server className="w-4 h-4" />
            Workers
          </TabsTrigger>
          <TabsTrigger 
            value="writers" 
            className={cn(
              "gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isDark ? "data-[state=active]:text-white" : "data-[state=active]:text-gray-900"
            )}
            data-testid="tab-writers"
          >
            <Database className="w-4 h-4" />
            Writers
          </TabsTrigger>
          <TabsTrigger 
            value="uploaders" 
            className={cn(
              "gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isDark ? "data-[state=active]:text-white" : "data-[state=active]:text-gray-900"
            )}
            data-testid="tab-uploaders"
          >
            <Cloud className="w-4 h-4" />
            Uploader
          </TabsTrigger>
          <TabsTrigger 
            value="proxies" 
            className={cn(
              "gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isDark ? "data-[state=active]:text-white" : "data-[state=active]:text-gray-900"
            )}
            data-testid="tab-proxies"
          >
            <Shield className="w-4 h-4" />
            Proxies
          </TabsTrigger>
          <TabsTrigger 
            value="execution" 
            className={cn(
              "gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none",
              isDark ? "data-[state=active]:text-white" : "data-[state=active]:text-gray-900"
            )}
            data-testid="tab-execution"
          >
            <Settings2 className="w-4 h-4" />
            Execuções
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workers" className="space-y-4">
          <div className="max-w-4xl space-y-3">
            <div className={cn(
              "rounded-lg border overflow-hidden",
              isDark ? "border-dark-700" : "border-gray-200"
            )}>
              {/* Header Bar */}
              <div className={cn(
                "px-4 py-[18px] border-b",
                isDark ? "border-dark-700" : "border-gray-200"
              )}>
                <h3 className="text-base font-medium text-foreground">Workers Vault</h3>
              </div>
              
              {workersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : workers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Server className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum worker configurado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn(
                    "w-full border-collapse",
                    "[&_th]:border-r [&_td]:border-r",
                    "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0",
                    isDark 
                      ? "[&_th]:border-dark-700/50 [&_td]:border-dark-700/50" 
                      : "[&_th]:border-gray-200/50 [&_td]:border-gray-200/50"
                  )}>
                    <thead className={cn(
                      isDark ? "bg-dark-800/80" : "bg-gray-50"
                    )}>
                      <tr className={cn(
                        "border-b",
                        isDark ? "border-dark-700" : "border-gray-100"
                      )}>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '40%' }}>
                          Worker
                        </th>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '22%' }}>
                          API Key
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ativo
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '14%' }}>
                          Status
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((worker, index) => (
                        <tr 
                          key={worker.id}
                          className={cn(
                            "transition-colors",
                            isDark ? "hover:bg-dark-700/30" : "hover:bg-gray-50",
                            index !== workers.length - 1 && (isDark ? "border-b border-dark-700" : "border-b border-gray-100")
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className={cn(
                              "font-medium text-sm truncate",
                              isDark ? "text-white" : "text-gray-900"
                            )}>
                              {worker.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {worker.url}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {worker.api_key 
                              ? `${worker.api_key.slice(0, 2)}${"*".repeat(Math.min(worker.api_key.length - 2, 10))}`
                              : "—"
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Switch
                              checked={worker.active}
                              onCheckedChange={(checked) => toggleWorkerMutation.mutate({ id: worker.id, active: checked })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium border",
                              worker.last_test_ok === true
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : worker.last_test_ok === false
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : isDark
                                    ? "bg-dark-700 border-dark-600 text-muted-foreground"
                                    : "bg-gray-100 border-gray-200 text-gray-500"
                            )}>
                              {worker.last_test_ok === true ? "Online" : worker.last_test_ok === false ? "Offline" : "N/T"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className={cn(
                                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                              )}>
                                <DropdownMenuItem 
                                  onClick={() => testWorkerMutation.mutate(worker.id)}
                                  disabled={testingWorkerId === worker.id}
                                  className="gap-2"
                                >
                                  {testingWorkerId === worker.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                  Testar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2">
                                  <Pencil className="w-4 h-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteWorkerMutation.mutate(worker.id)}
                                  className="gap-2 text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Deletar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Dialog open={showAddWorkerModal} onOpenChange={setShowAddWorkerModal}>
              <DialogTrigger asChild>
                <button 
                  className={cn(
                    "w-full py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors rounded-lg border border-dashed",
                    isDark 
                      ? "border-dark-600 text-muted-foreground hover:text-white hover:border-dark-500 hover:bg-dark-800/50" 
                      : "border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                  )}
                  data-testid="button-add-worker"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Worker
                </button>
              </DialogTrigger>
                  <DialogContent className={cn(
                    isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                  )}>
                    <DialogHeader>
                      <DialogTitle>Adicionar Worker</DialogTitle>
                      <DialogDescription>
                        Configure um novo worker para executar tarefas.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Nome</label>
                        <Input 
                          placeholder="Worker Principal" 
                          value={workerName}
                          onChange={(e) => setWorkerName(e.target.value)}
                          data-testid="input-worker-name" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">URL</label>
                        <Input 
                          placeholder="https://worker.example.com" 
                          value={workerUrl}
                          onChange={(e) => setWorkerUrl(e.target.value)}
                          data-testid="input-worker-url" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">API Key</label>
                        <Input 
                          type="password" 
                          placeholder="sk-..." 
                          value={workerKey}
                          onChange={(e) => setWorkerKey(e.target.value)}
                          data-testid="input-worker-key" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Storage Domain <span className="text-muted-foreground font-normal">(opcional)</span></label>
                        <Input 
                          placeholder="https://storage.example.com" 
                          value={workerStorageDomain}
                          onChange={(e) => setWorkerStorageDomain(e.target.value)}
                          data-testid="input-worker-storage-domain" 
                        />
                        <p className="text-xs text-muted-foreground">
                          Domínio personalizado para acesso ao JSON gerado após execuções.
                        </p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAddWorkerModal(false)}>
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleCreateWorker}
                        disabled={createWorkerMutation.isPending}
                        data-testid="button-confirm-add-worker"
                      >
                        {createWorkerMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4 mr-2" />
                        )}
                        Adicionar
                      </Button>
                    </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="writers" className="space-y-4">
          <div className="max-w-4xl space-y-3">
            <div className={cn(
              "rounded-lg border overflow-hidden",
              isDark ? "border-dark-700" : "border-gray-200"
            )}>
              <div className={cn(
                "px-4 py-[18px] border-b",
                isDark ? "border-dark-700" : "border-gray-200"
              )}>
                <h3 className="text-base font-medium text-foreground">Writers Vault</h3>
              </div>
              
              {writersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : writers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Database className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum writer configurado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn(
                    "w-full border-collapse",
                    "[&_th]:border-r [&_td]:border-r",
                    "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0",
                    isDark 
                      ? "[&_th]:border-dark-700/50 [&_td]:border-dark-700/50" 
                      : "[&_th]:border-gray-200/50 [&_td]:border-gray-200/50"
                  )}>
                    <thead className={cn(
                      isDark ? "bg-dark-800/80" : "bg-gray-50"
                    )}>
                      <tr className={cn(
                        "border-b",
                        isDark ? "border-dark-700" : "border-gray-100"
                      )}>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '40%' }}>
                          Writer
                        </th>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '22%' }}>
                          API Key
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ativo
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '14%' }}>
                          Status
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {writers.map((writer, index) => (
                        <tr 
                          key={writer.id}
                          className={cn(
                            "transition-colors",
                            isDark ? "hover:bg-dark-700/30" : "hover:bg-gray-50",
                            index !== writers.length - 1 && (isDark ? "border-b border-dark-700" : "border-b border-gray-100")
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className={cn(
                              "font-medium text-sm truncate",
                              isDark ? "text-white" : "text-gray-900"
                            )}>
                              {writer.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {writer.url}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {writer.api_key 
                              ? `${writer.api_key.slice(0, 2)}${"*".repeat(Math.min(writer.api_key.length - 2, 10))}`
                              : "—"
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Switch
                              checked={writer.active}
                              onCheckedChange={(checked) => toggleWriterMutation.mutate({ id: writer.id, active: checked })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium border",
                              writer.last_test_ok === true
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : writer.last_test_ok === false
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : isDark
                                    ? "bg-dark-700 border-dark-600 text-muted-foreground"
                                    : "bg-gray-100 border-gray-200 text-gray-500"
                            )}>
                              {writer.last_test_ok === true ? "Online" : writer.last_test_ok === false ? "Offline" : "N/T"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className={cn(
                                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                              )}>
                                <DropdownMenuItem 
                                  onClick={() => testWriterMutation.mutate(writer.id)}
                                  disabled={testingWriterId === writer.id}
                                  className="gap-2"
                                >
                                  {testingWriterId === writer.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                  Testar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2">
                                  <Pencil className="w-4 h-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteWriterMutation.mutate(writer.id)}
                                  className="gap-2 text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Deletar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Dialog open={showAddWriterModal} onOpenChange={setShowAddWriterModal}>
              <DialogTrigger asChild>
                <button 
                  className={cn(
                    "w-full py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors rounded-lg border border-dashed",
                    isDark 
                      ? "border-dark-600 text-muted-foreground hover:text-white hover:border-dark-500 hover:bg-dark-800/50" 
                      : "border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                  )}
                  data-testid="button-add-writer"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Writer
                </button>
              </DialogTrigger>
              <DialogContent className={cn(
                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
              )}>
                <DialogHeader>
                  <DialogTitle>Adicionar Writer</DialogTitle>
                  <DialogDescription>
                    Configure um novo writer para persistir dados.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input 
                      placeholder="Writer Principal" 
                      value={writerName}
                      onChange={(e) => setWriterName(e.target.value)}
                      data-testid="input-writer-name" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL</label>
                    <Input 
                      placeholder="https://writer.example.com" 
                      value={writerUrl}
                      onChange={(e) => setWriterUrl(e.target.value)}
                      data-testid="input-writer-url" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <Input 
                      type="password" 
                      placeholder="sk-..." 
                      value={writerKey}
                      onChange={(e) => setWriterKey(e.target.value)}
                      data-testid="input-writer-key" 
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddWriterModal(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreateWriter}
                    disabled={createWriterMutation.isPending}
                    data-testid="button-confirm-add-writer"
                  >
                    {createWriterMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="uploaders" className="space-y-4">
          <div className="max-w-4xl space-y-3">
            <div className={cn(
              "rounded-lg border overflow-hidden",
              isDark ? "border-dark-700" : "border-gray-200"
            )}>
              <div className={cn(
                "px-4 py-[18px] border-b",
                isDark ? "border-dark-700" : "border-gray-200"
              )}>
                <h3 className="text-base font-medium text-foreground">Uploaders Vault</h3>
              </div>
              
              {uploadersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : uploaders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Cloud className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum uploader configurado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn(
                    "w-full border-collapse",
                    "[&_th]:border-r [&_td]:border-r",
                    "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0",
                    isDark 
                      ? "[&_th]:border-dark-700/50 [&_td]:border-dark-700/50" 
                      : "[&_th]:border-gray-200/50 [&_td]:border-gray-200/50"
                  )}>
                    <thead className={cn(
                      isDark ? "bg-dark-800/80" : "bg-gray-50"
                    )}>
                      <tr className={cn(
                        "border-b",
                        isDark ? "border-dark-700" : "border-gray-100"
                      )}>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '40%' }}>
                          Uploader
                        </th>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '22%' }}>
                          API Key
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ativo
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '14%' }}>
                          Status
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '12%' }}>
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {uploaders.map((uploader, index) => (
                        <tr 
                          key={uploader.id}
                          className={cn(
                            "transition-colors",
                            isDark ? "hover:bg-dark-700/30" : "hover:bg-gray-50",
                            index !== uploaders.length - 1 && (isDark ? "border-b border-dark-700" : "border-b border-gray-100")
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className={cn(
                              "font-medium text-sm truncate",
                              isDark ? "text-white" : "text-gray-900"
                            )}>
                              {uploader.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {uploader.url}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {uploader.api_key 
                              ? `${uploader.api_key.slice(0, 2)}${"*".repeat(Math.min(uploader.api_key.length - 2, 10))}`
                              : "—"
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Switch
                              checked={uploader.active}
                              onCheckedChange={(checked) => toggleUploaderMutation.mutate({ id: uploader.id, active: checked })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium border",
                              uploader.last_test_ok === true
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : uploader.last_test_ok === false
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : isDark
                                    ? "bg-dark-700 border-dark-600 text-muted-foreground"
                                    : "bg-gray-100 border-gray-200 text-gray-500"
                            )}>
                              {uploader.last_test_ok === true ? "Online" : uploader.last_test_ok === false ? "Offline" : "N/T"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className={cn(
                                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                              )}>
                                <DropdownMenuItem 
                                  onClick={() => testUploaderMutation.mutate(uploader.id)}
                                  disabled={testingUploaderId === uploader.id}
                                  className="gap-2"
                                >
                                  {testingUploaderId === uploader.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                  Testar
                                </DropdownMenuItem>
                                <DropdownMenuItem className="gap-2">
                                  <Pencil className="w-4 h-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteUploaderMutation.mutate(uploader.id)}
                                  className="gap-2 text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Deletar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Dialog open={showAddUploaderModal} onOpenChange={setShowAddUploaderModal}>
              <DialogTrigger asChild>
                <button 
                  className={cn(
                    "w-full py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors rounded-lg border border-dashed",
                    isDark 
                      ? "border-dark-600 text-muted-foreground hover:text-white hover:border-dark-500 hover:bg-dark-800/50" 
                      : "border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                  )}
                  data-testid="button-add-uploader"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Uploader
                </button>
              </DialogTrigger>
              <DialogContent className={cn(
                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
              )}>
                <DialogHeader>
                  <DialogTitle>Adicionar Uploader</DialogTitle>
                  <DialogDescription>
                    Configure um novo uploader para enviar arquivos.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome</label>
                    <Input 
                      placeholder="Uploader Principal" 
                      value={uploaderName}
                      onChange={(e) => setUploaderName(e.target.value)}
                      data-testid="input-uploader-name" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">URL</label>
                    <Input 
                      placeholder="https://uploader.example.com" 
                      value={uploaderUrl}
                      onChange={(e) => setUploaderUrl(e.target.value)}
                      data-testid="input-uploader-url" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <Input 
                      type="password" 
                      placeholder="sk-..." 
                      value={uploaderKey}
                      onChange={(e) => setUploaderKey(e.target.value)}
                      data-testid="input-uploader-key" 
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddUploaderModal(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreateUploader}
                    disabled={createUploaderMutation.isPending}
                    data-testid="button-confirm-add-uploader"
                  >
                    {createUploaderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>

        <TabsContent value="proxies" className="space-y-4">
          <div className="max-w-4xl space-y-3">
            <div className={cn(
              "rounded-lg border overflow-hidden",
              isDark ? "border-dark-700" : "border-gray-200"
            )}>
              {/* Header Bar */}
              <div className={cn(
                "px-4 py-[18px] border-b",
                isDark ? "border-dark-700" : "border-gray-200"
              )}>
                <h3 className="text-base font-medium text-foreground">Proxies Vault</h3>
              </div>
              
              {proxiesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : proxies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Shield className="w-10 h-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum proxy configurado</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className={cn(
                    "w-full border-collapse",
                    "[&_th]:border-r [&_td]:border-r",
                    "[&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0",
                    isDark 
                      ? "[&_th]:border-dark-700/50 [&_td]:border-dark-700/50" 
                      : "[&_th]:border-gray-200/50 [&_td]:border-gray-200/50"
                  )}>
                    <thead className={cn(
                      isDark ? "bg-dark-800/80" : "bg-gray-50"
                    )}>
                      <tr className={cn(
                        "border-b",
                        isDark ? "border-dark-700" : "border-gray-100"
                      )}>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '30%' }}>
                          Proxy
                        </th>
                        <th className="px-4 py-[14px] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '20%' }}>
                          Credenciais
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '15%' }}>
                          Ativo
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '15%' }}>
                          Status
                        </th>
                        <th className="px-4 py-[14px] text-center text-xs font-medium uppercase tracking-wider text-muted-foreground" style={{ width: '10%' }}>
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {proxies.map((proxy, index) => (
                        <tr 
                          key={proxy.id}
                          className={cn(
                            "transition-colors",
                            isDark ? "hover:bg-dark-700/30" : "hover:bg-gray-50",
                            index !== proxies.length - 1 && (isDark ? "border-b border-dark-700" : "border-b border-gray-100")
                          )}
                        >
                          <td className="px-4 py-3">
                            <p className={cn(
                              "font-medium text-sm truncate",
                              isDark ? "text-white" : "text-gray-900"
                            )}>
                              {proxy.name || `${proxy.host}:${proxy.port}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {proxy.host}:{proxy.port}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            {proxy.username ? `${proxy.username.slice(0, 3)}***` : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Switch
                              checked={proxy.active}
                              onCheckedChange={(checked) => toggleProxyMutation.mutate({ id: proxy.id, active: checked })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn(
                              "inline-flex items-center justify-center px-2.5 py-1 rounded text-xs font-medium border",
                              proxy.last_test_ok === true
                                ? "bg-green-500/10 border-green-500/30 text-green-400"
                                : proxy.last_test_ok === false
                                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                                  : isDark
                                    ? "bg-dark-700 border-dark-600 text-muted-foreground"
                                    : "bg-gray-100 border-gray-200 text-gray-500"
                            )}>
                              {proxy.last_test_ok === true ? "Online" : proxy.last_test_ok === false ? "Offline" : "N/T"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon"
                                  className="h-8 w-8"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className={cn(
                                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
                              )}>
                                <DropdownMenuItem 
                                  onClick={() => testProxyMutation.mutate(proxy.id)}
                                  disabled={testingProxyId === proxy.id}
                                  className="gap-2"
                                >
                                  {testingProxyId === proxy.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Play className="w-4 h-4" />
                                  )}
                                  Testar
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => deleteProxyMutation.mutate(proxy.id)}
                                  className="gap-2 text-red-500 focus:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  Deletar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Dialog open={showAddProxyModal} onOpenChange={setShowAddProxyModal}>
              <DialogTrigger asChild>
                <button 
                  className={cn(
                    "w-full py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors rounded-lg border border-dashed",
                    isDark 
                      ? "border-dark-600 text-muted-foreground hover:text-white hover:border-dark-500 hover:bg-dark-800/50" 
                      : "border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400 hover:bg-gray-50"
                  )}
                  data-testid="button-add-proxy"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Proxy
                </button>
              </DialogTrigger>
              <DialogContent className={cn(
                isDark ? "bg-dark-800 border-dark-700" : "bg-white border-gray-200"
              )}>
                <DialogHeader>
                  <DialogTitle>Adicionar Proxy</DialogTitle>
                  <DialogDescription>
                    Configure um novo proxy para as sessões.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nome Identificador (opcional)</label>
                    <Input 
                      placeholder="Ex: Proxy Residencial US" 
                      value={proxyName}
                      onChange={(e) => setProxyName(e.target.value)}
                      data-testid="input-proxy-name" 
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2 col-span-2">
                      <label className="text-sm font-medium">Host</label>
                      <Input 
                        placeholder="proxy.example.com" 
                        value={proxyHost}
                        onChange={(e) => setProxyHost(e.target.value)}
                        data-testid="input-proxy-host" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Porta</label>
                      <Input 
                        type="number"
                        placeholder="8080" 
                        value={proxyPort}
                        onChange={(e) => setProxyPort(e.target.value)}
                        data-testid="input-proxy-port" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Usuário (opcional)</label>
                      <Input 
                        placeholder="username" 
                        value={proxyUser}
                        onChange={(e) => setProxyUser(e.target.value)}
                        data-testid="input-proxy-user" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Senha (opcional)</label>
                      <Input 
                        type="password" 
                        placeholder="password" 
                        value={proxyPass}
                        onChange={(e) => setProxyPass(e.target.value)}
                        data-testid="input-proxy-pass" 
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAddProxyModal(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleCreateProxy}
                    disabled={createProxyMutation.isPending}
                    data-testid="button-confirm-add-proxy"
                  >
                    {createProxyMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Adicionar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </TabsContent>


        <TabsContent value="execution" className="space-y-4">
          <Card className={cn(
            "border",
            isDark ? "bg-dark-800/50 border-dark-700" : "bg-white border-gray-200"
          )}>
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-lg",
                  isDark ? "bg-primary/20" : "bg-primary/10"
                )}>
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Parâmetros de Execução</CardTitle>
                  <CardDescription>
                    Configure os parâmetros que controlam a execução das missões
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            
            <Separator className={cn(
              isDark ? "bg-dark-700" : "bg-gray-200"
            )} />
            
            <CardContent className="pt-6 pb-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Refresh Interval</label>
                  <p className="text-xs text-muted-foreground">
                    Trocar sessão a cada N missões
                  </p>
                  <Input 
                    type="number" 
                    defaultValue={executionConfig.refresh_interval}
                    className={cn(
                      "mt-2",
                      isDark ? "bg-dark-900 border-dark-600" : "bg-gray-50 border-gray-200"
                    )}
                    data-testid="input-refresh-interval"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Max Retries</label>
                  <p className="text-xs text-muted-foreground">
                    Número máximo de tentativas
                  </p>
                  <Input 
                    type="number" 
                    defaultValue={executionConfig.max_retries}
                    className={cn(
                      "mt-2",
                      isDark ? "bg-dark-900 border-dark-600" : "bg-gray-50 border-gray-200"
                    )}
                    data-testid="input-max-retries"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Timeout Session</label>
                  <p className="text-xs text-muted-foreground">
                    Timeout para criar sessão
                  </p>
                  <Input 
                    type="number" 
                    defaultValue={executionConfig.timeout_session}
                    className={cn(
                      "mt-2",
                      isDark ? "bg-dark-900 border-dark-600" : "bg-gray-50 border-gray-200"
                    )}
                    data-testid="input-timeout-session"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Timeout Job</label>
                  <p className="text-xs text-muted-foreground">
                    Timeout para completar job
                  </p>
                  <Input 
                    type="number" 
                    defaultValue={executionConfig.timeout_job}
                    className={cn(
                      "mt-2",
                      isDark ? "bg-dark-900 border-dark-600" : "bg-gray-50 border-gray-200"
                    )}
                    data-testid="input-timeout-job"
                  />
                </div>
              </div>
              
              <Separator className={cn(
                "mt-8 mb-6",
                isDark ? "bg-dark-700" : "bg-gray-200"
              )} />
              
              <div className="flex items-center justify-between py-1">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Auto Retry</label>
                  <p className="text-xs text-muted-foreground">
                    Retentar automaticamente em falhas críticas do sistema
                  </p>
                </div>
                <Switch 
                  defaultChecked={executionConfig.auto_retry}
                  data-testid="switch-auto-retry"
                />
              </div>
              
              <Separator className={cn(
                "mt-6",
                isDark ? "bg-dark-700" : "bg-gray-200"
              )} />
              
              <div className="flex items-center justify-between gap-4 py-5">
                <span className="text-xs text-muted-foreground">
                  Last updated 2 days ago
                </span>
                <Button 
                  onClick={() => saveConfigMutation.mutate(executionConfig)}
                  disabled={saveConfigMutation.isPending}
                  data-testid="button-save-execution"
                >
                  {saveConfigMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Configurações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
