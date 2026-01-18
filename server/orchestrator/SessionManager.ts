import { supabase } from "../supabase";
import { eventBus } from "./EventBus";
import { OrchestratorConfig, DEFAULT_CONFIG } from "./types";
import type { Worker, Proxy, Session } from "../../shared/schema";

interface ActiveSession {
  id: string;
  workerId: string;
  proxyId: string;
  status: string;
  currentPhase: string;
  failureCount: number;
  retryCount: number;
  startTime: number;
}

export class SessionManager {
  private config: OrchestratorConfig;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private pendingRequests: Map<string, { workerId: string; missionId: string; retryCount: number }> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.subscribe("worker:request_session", async (payload) => {
      console.log(`[SessionManager] Received request for worker ${payload.workerId}, mission ${payload.missionId}`);
      await this.createSessionForWorker(payload.workerId, payload.missionId);
    });

    eventBus.subscribe("session:end_requested", async (payload) => {
      console.log(`[SessionManager] Received session:end_requested for ${payload.sessionId}`);
      await this.endSession(payload.sessionId);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[SessionManager] Starting...");
    
    await this.cleanupOrphanedSessions();
    this.startLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log("[SessionManager] Stopped");
  }

  private startLoop(): void {
    this.loopInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.monitorActiveSessions();
    }, this.config.sessionPollingIntervalMs);
  }

  private async cleanupOrphanedSessions(): Promise<void> {
    console.log("[SessionManager] Cleaning up orphaned sessions...");
    
    const { data: orphanedSessions } = await supabase
      .from("sessions")
      .select("id, proxy_id")
      .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);

    if (orphanedSessions && orphanedSessions.length > 0) {
      for (const session of orphanedSessions) {
        await supabase
          .from("sessions")
          .update({ status: "ERROR", error_message: "Orphaned on restart" })
          .eq("id", session.id);

        if (session.proxy_id) {
          await supabase
            .from("proxies")
            .update({ in_use_by_session_id: null })
            .eq("id", session.proxy_id);
        }
      }
      console.log(`[SessionManager] Cleaned up ${orphanedSessions.length} orphaned sessions`);
    }

    await supabase
      .from("proxies")
      .update({ in_use_by_session_id: null })
      .not("in_use_by_session_id", "is", null);
  }

  private async allocateProxy(sessionId: string): Promise<Proxy | null> {
    const { data, error } = await supabase.rpc("allocate_proxy_for_session", {
      p_session_id: sessionId
    });

    if (error || !data) {
      console.error("[SessionManager] Failed to allocate proxy:", error);
      return null;
    }

    return data as Proxy;
  }

  private async releaseProxy(proxyId: string, incrementFailCount = false): Promise<void> {
    if (incrementFailCount) {
      await supabase.rpc("increment_proxy_fail_count", { p_proxy_id: proxyId });
    }
    
    await supabase
      .from("proxies")
      .update({ in_use_by_session_id: null })
      .eq("id", proxyId);
    
    console.log(`[SessionManager] Released proxy ${proxyId} (fail_count incremented: ${incrementFailCount})`);
  }

  async createSessionForWorker(workerId: string, missionId: string, retryCount = 0): Promise<void> {
    console.log(`[SessionManager] Creating session for worker ${workerId} (retry: ${retryCount})`);

    const { data: worker } = await supabase
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .single();

    if (!worker) {
      console.error(`[SessionManager] Worker ${workerId} not found`);
      await eventBus.emit("session:error", {
        sessionId: "",
        workerId,
        proxyId: "",
        error: "Worker not found",
        errorCode: "ERROR101"
      });
      return;
    }

    const sessionId = `SE${Date.now()}`;
    
    const { error: createError } = await supabase
      .from("sessions")
      .insert({
        id: sessionId,
        worker_id: workerId,
        status: "CREATING",
        current_phase: "creating",
        failure_count: 0,
        retry_count: retryCount,
      });

    if (createError) {
      console.error("[SessionManager] Failed to create session record:", createError);
      await eventBus.emit("session:error", {
        sessionId: "",
        workerId,
        proxyId: "",
        error: "Failed to create session record",
        errorCode: "ERROR101"
      });
      return;
    }

    const proxy = await this.allocateProxy(sessionId);
    if (!proxy) {
      console.error("[SessionManager] No proxy available");
      await supabase
        .from("sessions")
        .update({ status: "ERROR", error_message: "No proxy available", current_phase: "create_failed" })
        .eq("id", sessionId);
      
      await eventBus.emit("session:error", {
        sessionId,
        workerId,
        proxyId: "",
        error: "No proxy available",
        errorCode: "ERROR401"
      });
      return;
    }

    await supabase
      .from("sessions")
      .update({ proxy_id: proxy.id })
      .eq("id", sessionId);

    const proxyServer = `${proxy.host}:${proxy.port}`;
    const sessionPayload = {
      force_refresh: true,
      proxy: {
        server: proxyServer,
        username: proxy.username || undefined,
        password: proxy.password || undefined,
      }
    };

    try {
      const response = await fetch(`${worker.url}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": worker.api_key,
        },
        body: JSON.stringify(sessionPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      await supabase
        .from("sessions")
        .update({ status: "INITIALIZING", current_phase: "initializing" })
        .eq("id", sessionId);

      this.activeSessions.set(sessionId, {
        id: sessionId,
        workerId,
        proxyId: proxy.id,
        status: "INITIALIZING",
        currentPhase: "initializing",
        failureCount: 0,
        retryCount,
        startTime: Date.now(),
      });

      this.pendingRequests.set(sessionId, { workerId, missionId, retryCount });

      console.log(`[SessionManager] Session ${sessionId} created, waiting for ready...`);

      await this.logMissionEvent(missionId, "SESSION_STARTED", `Session ${sessionId} created with proxy ${proxy.id}`, 0);

    } catch (error) {
      console.error(`[SessionManager] Failed to create session:`, error);
      
      await this.releaseProxy(proxy.id, true);
      
      await supabase
        .from("sessions")
        .update({ 
          status: "ERROR", 
          error_message: String(error),
          current_phase: "create_failed"
        })
        .eq("id", sessionId);

      if (retryCount < this.config.maxSessionRetries) {
        console.log(`[SessionManager] Retrying session creation (attempt ${retryCount + 1})`);
        await this.createSessionForWorker(workerId, missionId, retryCount + 1);
      } else {
        await eventBus.emit("session:error", {
          sessionId,
          workerId,
          proxyId: proxy.id,
          error: String(error),
          errorCode: "ERROR102"
        });
      }
    }
  }

  private async monitorActiveSessions(): Promise<void> {
    const { data: sessions } = await supabase
      .from("sessions")
      .select("*")
      .in("status", ["INITIALIZING", "READY", "ACTIVE"]);

    if (!sessions || sessions.length === 0) return;

    for (const session of sessions) {
      if (!this.isRunning) break;

      const { data: worker } = await supabase
        .from("workers")
        .select("*")
        .eq("id", session.worker_id)
        .single();

      if (!worker) continue;

      await this.checkSessionStatus(session, worker as Worker);
    }
  }

  private async checkSessionStatus(session: Session, worker: Worker): Promise<void> {
    const startTime = this.activeSessions.get(session.id)?.startTime || Date.now();
    const elapsed = Date.now() - startTime;

    if (elapsed > this.config.sessionTimeoutMs) {
      console.log(`[SessionManager] Session ${session.id} timed out`);
      await this.handleSessionError(session, "Session timeout", "ERROR101");
      return;
    }

    try {
      const response = await fetch(`${worker.url}/session/status`, {
        method: "GET",
        headers: { "x-api-key": worker.api_key },
      });

      if (!response.ok) {
        await this.handleHttpError(session);
        return;
      }

      const data = await response.json();
      const rawPhase = data.phase || data.progress?.phase;
      const rawStatus = data.status;

      const statusToPhaseMap: Record<string, string> = {
        "ready": "ready", "active": "active", "idle": "idle", "scraping": "scraping",
        "failed": "failed", "error": "error", "stuck": "stuck", "disconnected": "disconnected",
        "terminated": "terminated", "initializing": "initializing", "connecting": "connecting",
        "authenticating": "authenticating", "warming_up": "warming_up",
      };

      const phase = rawPhase || statusToPhaseMap[rawStatus] || rawStatus || "unknown";

      await supabase
        .from("sessions")
        .update({ current_phase: phase, failure_count: 0 })
        .eq("id", session.id);

      const errorPhases = ["stuck", "disconnected", "terminated", "failed", "error"];
      if (errorPhases.includes(phase)) {
        await this.handleSessionError(session, `Session phase: ${phase}`, "ERROR103");
        return;
      }

      const readyPhases = ["ready", "active", "idle"];
      if (readyPhases.includes(phase) && session.status === "INITIALIZING") {
        console.log(`[SessionManager] Session ${session.id} is ready`);
        
        await supabase
          .from("sessions")
          .update({ status: "READY" })
          .eq("id", session.id);

        const pending = this.pendingRequests.get(session.id);
        if (pending) {
          await this.logMissionEvent(pending.missionId, "SESSION_READY", `Session ready after ${elapsed}ms`, elapsed);
          this.pendingRequests.delete(session.id);
        }

        await eventBus.emit("session:ready", {
          sessionId: session.id,
          workerId: session.worker_id!,
        });
      }

    } catch (error) {
      console.error(`[SessionManager] Error checking session ${session.id}:`, error);
      await this.handleHttpError(session);
    }
  }

  private async handleHttpError(session: Session): Promise<void> {
    const cached = this.activeSessions.get(session.id);
    const failureCount = (cached?.failureCount || session.failure_count || 0) + 1;

    await supabase
      .from("sessions")
      .update({ failure_count: failureCount })
      .eq("id", session.id);

    if (cached) {
      cached.failureCount = failureCount;
    }

    if (failureCount >= this.config.maxConsecutiveFailures) {
      await this.handleSessionError(session, "Too many consecutive HTTP failures", "ERROR102");
    }
  }

  private async handleSessionError(session: Session, error: string, errorCode: string): Promise<void> {
    console.log(`[SessionManager] Session ${session.id} error: ${error}`);

    await supabase
      .from("sessions")
      .update({ status: "ERROR", error_message: error })
      .eq("id", session.id);

    if (session.proxy_id) {
      await this.releaseProxy(session.proxy_id, true);
    }

    this.activeSessions.delete(session.id);
    this.pendingRequests.delete(session.id);

    await eventBus.emit("session:error", {
      sessionId: session.id,
      workerId: session.worker_id!,
      proxyId: session.proxy_id || "",
      error,
      errorCode,
    });
  }

  async endSession(sessionId: string): Promise<void> {
    console.log(`[SessionManager] Ending session ${sessionId}`);

    const { data: session } = await supabase
      .from("sessions")
      .select("*, workers(*)")
      .eq("id", sessionId)
      .single();

    if (!session) return;

    const { data: worker } = await supabase
      .from("workers")
      .select("*")
      .eq("id", session.worker_id)
      .single();

    if (worker) {
      try {
        await fetch(`${worker.url}/session`, {
          method: "DELETE",
          headers: { "x-api-key": worker.api_key },
        });
      } catch (error) {
        console.error(`[SessionManager] Error ending session on worker:`, error);
      }
    }

    await supabase
      .from("sessions")
      .update({ status: "ENDED", ended_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (session.proxy_id) {
      await this.releaseProxy(session.proxy_id, false);
    }

    this.activeSessions.delete(sessionId);
    this.pendingRequests.delete(sessionId);

    console.log(`[SessionManager] Session ${sessionId} ended and proxy released`);

    await eventBus.emit("session:terminated", {
      sessionId,
      proxyId: session.proxy_id || "",
    });
  }

  private async logMissionEvent(missionId: string, event: string, details: string, durationMs: number): Promise<void> {
    await supabase.from("mission_logs").insert({
      mission_id: missionId,
      event,
      details,
      duration_ms: durationMs,
    });
  }

  getStatus(): { isRunning: boolean; activeSessions: number; pendingRequests: number } {
    return {
      isRunning: this.isRunning,
      activeSessions: this.activeSessions.size,
      pendingRequests: this.pendingRequests.size,
    };
  }
}
