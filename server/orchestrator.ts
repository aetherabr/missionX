import { supabase } from "./supabase";
import type { Mission, Worker, Proxy, Writer, WorkerStatusType, Session, SessionStatusType } from "@shared/schema";
import { SessionStatus } from "@shared/schema";

interface OrchestratorConfig {
  refreshInterval: number;
  maxRetries: number;
  timeoutSession: number;
  timeoutJob: number;
  sessionLimit: number;
  rpcTimeout: number;
  maxBackoffInterval: number;
  sessionReadyTimeout: number;
  sessionPollingInterval: number;
}

interface OrchestratorState {
  isRunning: boolean;
  shuttingDown: boolean;
  interval: NodeJS.Timeout | null;
  cycleInProgress: boolean;
  consecutiveFailures: number;
  currentInterval: number;
}

const state: OrchestratorState = {
  isRunning: false,
  shuttingDown: false,
  interval: null,
  cycleInProgress: false,
  consecutiveFailures: 0,
  currentInterval: 5000,
};

const defaultConfig: OrchestratorConfig = {
  refreshInterval: 5000,
  maxRetries: 2,
  timeoutSession: 180000,
  timeoutJob: 180000,
  sessionLimit: 5,
  rpcTimeout: 5000,
  maxBackoffInterval: 60000,
  sessionReadyTimeout: 180000,
  sessionPollingInterval: 10000,
};

let config = { ...defaultConfig };

const ERROR_CODES = {
  SESSION_TIMEOUT: "ERROR101",
  SESSION_CREATE_FAILED: "ERROR102",
  SESSION_INIT_FAILED: "ERROR103",
  SCRAPE_TIMEOUT: "ERROR201",
  SCRAPE_FAILED: "ERROR202",
  SCRAPE_EMPTY_RESULT: "ERROR203",
  WRITER_TIMEOUT: "ERROR301",
  WRITER_FAILED: "ERROR302",
  WRITER_VALIDATION_ERROR: "ERROR303",
  PROXY_ALLOCATION_FAILED: "ERROR401",
  MISSION_ALLOCATION_FAILED: "ERROR402",
  CANCELLED: "CANCELLED",
} as const;

const RETRYABLE_ERRORS: string[] = [
  ERROR_CODES.SESSION_TIMEOUT,
  ERROR_CODES.SESSION_CREATE_FAILED,
  ERROR_CODES.SESSION_INIT_FAILED,
  ERROR_CODES.SCRAPE_TIMEOUT,
  ERROR_CODES.SCRAPE_FAILED,
  ERROR_CODES.WRITER_TIMEOUT,
  ERROR_CODES.WRITER_FAILED,
];

async function log(missionId: string | null, event: string, details?: Record<string, unknown>): Promise<void> {
  console.log(`[Orchestrator] ${event}`, details || "");
  
  if (missionId) {
    try {
      await supabase.from("mission_logs").insert({
        mission_id: missionId,
        event,
        details: details || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to log mission event:", error);
    }
  }
}

async function loadConfig(): Promise<void> {
  try {
    const { data } = await supabase.from("config").select("*");
    
    if (data) {
      const configMap = new Map(data.map(item => [item.key, item.value]));
      
      const execution = configMap.get("execution") as Record<string, unknown> | undefined;
      if (execution) {
        const refreshIntervalSec = (execution.refresh_interval as number) || 5;
        const timeoutSessionSec = (execution.timeout_session as number) || 180;
        const timeoutJobSec = (execution.timeout_job as number) || 100;
        const sessionReadyTimeoutSec = (execution.session_ready_timeout as number) || 120;
        const sessionPollingIntervalSec = (execution.session_polling_interval as number) || 15;
        
        config = {
          refreshInterval: refreshIntervalSec * 1000,
          maxRetries: (execution.max_retries as number) || defaultConfig.maxRetries,
          timeoutSession: timeoutSessionSec * 1000,
          timeoutJob: timeoutJobSec * 1000,
          sessionLimit: (execution.session_limit as number) || defaultConfig.sessionLimit,
          rpcTimeout: (execution.rpc_timeout as number) || defaultConfig.rpcTimeout,
          maxBackoffInterval: (execution.max_backoff_interval as number) || defaultConfig.maxBackoffInterval,
          sessionReadyTimeout: sessionReadyTimeoutSec * 1000,
          sessionPollingInterval: sessionPollingIntervalSec * 1000,
        };
      }
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
}

export async function cleanupOrphanedStates(): Promise<void> {
  console.log("[Orchestrator] Cleaning up orphaned states from previous session...");
  
  try {
    const { error: sessionError } = await supabase
      .from("sessions")
      .update({ 
        status: "ENDED" as SessionStatusType, 
        ended_at: new Date().toISOString(),
        last_error_code: "CLEANUP",
        last_error_message: "Session ended by orchestrator cleanup"
      })
      .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);
    
    if (sessionError) {
      console.error("[Orchestrator] Failed to cleanup sessions:", sessionError);
    } else {
      console.log("[Orchestrator] Ended all active sessions");
    }
    
    const { error: proxyError } = await supabase
      .from("proxies")
      .update({ in_use_by_worker_id: null })
      .not("in_use_by_worker_id", "is", null);
    
    if (proxyError) {
      console.error("[Orchestrator] Failed to cleanup proxies:", proxyError);
    } else {
      console.log("[Orchestrator] Released all locked proxies");
    }
    
    const { error: workerError } = await supabase
      .from("workers")
      .update({ status: "idle", current_mission_id: null, session_count: 0 })
      .eq("active", true);
    
    if (workerError) {
      console.error("[Orchestrator] Failed to cleanup workers:", workerError);
    } else {
      console.log("[Orchestrator] Reset all worker statuses to idle");
    }
    
    const { error: writerError } = await supabase
      .from("writers")
      .update({ current_mission_id: null })
      .not("current_mission_id", "is", null);
    
    if (writerError) {
      console.error("[Orchestrator] Failed to cleanup writers:", writerError);
    } else {
      console.log("[Orchestrator] Released all writer locks");
    }
    
    state.cycleInProgress = false;
    state.consecutiveFailures = 0;
    state.currentInterval = config.refreshInterval;
    
    console.log("[Orchestrator] Cleanup complete");
  } catch (error) {
    console.error("[Orchestrator] Cleanup failed:", error);
  }
}

function calculateBackoff(): number {
  if (state.consecutiveFailures === 0) {
    return config.refreshInterval;
  }
  const backoff = Math.min(
    config.refreshInterval * Math.pow(2, state.consecutiveFailures),
    config.maxBackoffInterval
  );
  return backoff;
}

function resetBackoff(): void {
  if (state.consecutiveFailures > 0) {
    console.log(`[Orchestrator] Backoff reset (was at ${state.currentInterval}ms)`);
    state.consecutiveFailures = 0;
    state.currentInterval = config.refreshInterval;
  }
}

function increaseBackoff(): void {
  state.consecutiveFailures++;
  state.currentInterval = calculateBackoff();
  console.log(`[Orchestrator] Backoff increased: ${state.currentInterval}ms (failures: ${state.consecutiveFailures})`);
}

async function allocateProxyWithTimeout(workerId: string): Promise<Proxy | null> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.rpcTimeout);
    
    const rpcPromise = supabase.rpc("allocate_proxy_to_worker", {
      p_worker_id: workerId,
    });
    
    const { data, error } = await Promise.race([
      rpcPromise,
      new Promise<{ data: null; error: Error }>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject({ data: null, error: new Error('RPC timeout') });
        });
      })
    ]);
    
    clearTimeout(timeoutId);
    
    const elapsed = Date.now() - startTime;
    console.log(`[Orchestrator] allocate_proxy_to_worker took ${elapsed}ms`);
    
    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data[0] as Proxy;
    }
    
    if (error) {
      console.warn(`[Orchestrator] RPC allocate_proxy_to_worker failed (${elapsed}ms):`, error.message);
    }
    
    return null;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Orchestrator] Proxy allocation error after ${elapsed}ms:`, error);
    return null;
  }
}

async function allocateMissionWithTimeout(workerId: string): Promise<Mission | null> {
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.rpcTimeout);
    
    const rpcPromise = supabase.rpc("allocate_mission_to_worker", {
      p_worker_id: workerId,
    });
    
    const { data, error } = await Promise.race([
      rpcPromise,
      new Promise<{ data: null; error: Error }>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject({ data: null, error: new Error('RPC timeout') });
        });
      })
    ]);
    
    clearTimeout(timeoutId);
    
    const elapsed = Date.now() - startTime;
    console.log(`[Orchestrator] allocate_mission_to_worker took ${elapsed}ms`);
    
    if (!error && data && Array.isArray(data) && data.length > 0) {
      return data[0] as Mission;
    }
    
    if (error) {
      console.warn(`[Orchestrator] RPC allocate_mission_to_worker failed (${elapsed}ms):`, error.message);
    }
    
    return null;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[Orchestrator] Mission allocation error after ${elapsed}ms:`, error);
    return null;
  }
}

async function releaseProxy(proxyId: string): Promise<void> {
  await supabase
    .from("proxies")
    .update({ in_use_by_worker_id: null })
    .eq("id", proxyId);
}

async function releaseWorkerProxies(workerId: string): Promise<void> {
  await supabase
    .from("proxies")
    .update({ in_use_by_worker_id: null })
    .eq("in_use_by_worker_id", workerId);
}

async function updateWorkerStatus(workerId: string, status: WorkerStatusType): Promise<void> {
  await supabase
    .from("workers")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);
}

async function updateMissionCheckpoint(
  missionId: string, 
  checkpoint: string, 
  additionalFields?: Record<string, unknown>
): Promise<void> {
  await supabase
    .from("missions")
    .update({
      checkpoint,
      ...additionalFields,
    })
    .eq("id", missionId);
}

async function failMission(
  missionId: string,
  errorCode: string,
  errorMessage: string,
  workerId?: string
): Promise<void> {
  if (!missionId) return;
  
  const { data: mission } = await supabase
    .from("missions")
    .select("retry_count")
    .eq("id", missionId)
    .single();
  
  const retryCount = (mission?.retry_count || 0) + 1;
  const shouldRetry = RETRYABLE_ERRORS.includes(errorCode as typeof ERROR_CODES[keyof typeof ERROR_CODES]) 
    && retryCount <= config.maxRetries;
  
  if (shouldRetry) {
    await supabase
      .from("missions")
      .update({
        status: "QUEUED",
        worker_id: null,
        worker_job_id: null,
        writer_job_id: null,
        worker_data_url: null,
        checkpoint: null,
        error_code: errorCode,
        error_message: `Retry ${retryCount}/${config.maxRetries}: ${errorMessage}`,
        retry_count: retryCount,
        started_at: null,
      })
      .eq("id", missionId);
    
    await log(missionId, "MISSION_RETRY", { errorCode, retryCount, maxRetries: config.maxRetries });
  } else {
    await supabase
      .from("missions")
      .update({
        status: "FAILED",
        error_code: errorCode,
        error_message: errorMessage,
        retry_count: retryCount,
        finished_at: new Date().toISOString(),
      })
      .eq("id", missionId);
    
    await log(missionId, "MISSION_FAILED", { errorCode, errorMessage });
  }
  
  if (workerId) {
    await supabase
      .from("workers")
      .update({
        current_mission_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", workerId);
  }
}

async function completeMission(missionId: string, adsCount: number, workerId: string): Promise<void> {
  await supabase
    .from("missions")
    .update({
      status: "DONE",
      checkpoint: "FINALIZADO",
      ads_count: adsCount,
      finished_at: new Date().toISOString(),
    })
    .eq("id", missionId);
  
  await supabase
    .from("workers")
    .update({
      current_mission_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);
  
  await log(missionId, "MISSION_COMPLETED", { adsCount });
}

async function getActiveSession(workerId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("worker_id", workerId)
    .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (error || !data) {
    return null;
  }
  
  return data as Session;
}

async function createSessionInDb(workerId: string, proxyId: string, executionLimit: number): Promise<Session | null> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      worker_id: workerId,
      proxy_id: proxyId,
      status: "CREATING" as SessionStatusType,
      current_phase: "creating",
      execution_limit: executionLimit,
      metadata: { created_by: "orchestrator" },
    })
    .select()
    .single();
  
  if (error || !data) {
    console.error(`[Orchestrator] Failed to create session in DB for worker ${workerId}:`, error);
    return null;
  }
  
  console.log(`[Orchestrator] Created session ${data.id} in DB for worker ${workerId}, status: CREATING, phase: creating`);
  return data as Session;
}

async function updateSessionStatus(
  sessionId: string, 
  status: SessionStatusType, 
  additionalFields?: Record<string, unknown>
): Promise<void> {
  const updateData: Record<string, unknown> = { status };
  
  if (status === "READY") {
    updateData.ready_at = new Date().toISOString();
  } else if (status === "ENDED" || status === "ERROR" || status === "TIMEOUT") {
    updateData.ended_at = new Date().toISOString();
  }
  
  if (additionalFields) {
    Object.assign(updateData, additionalFields);
  }
  
  await supabase
    .from("sessions")
    .update(updateData)
    .eq("id", sessionId);
  
  console.log(`[Orchestrator] Updated session ${sessionId} status to ${status}`);
}

async function incrementSessionExecutionCount(sessionId: string): Promise<number> {
  const { data } = await supabase
    .from("sessions")
    .select("execution_count")
    .eq("id", sessionId)
    .single();
  
  const newCount = (data?.execution_count || 0) + 1;
  
  await supabase
    .from("sessions")
    .update({ execution_count: newCount, status: "ACTIVE" as SessionStatusType })
    .eq("id", sessionId);
  
  return newCount;
}

async function checkExternalSessionStatus(
  worker: Worker, 
  sessionId?: string
): Promise<{ 
  external_status: string;
  worker_phase: string;
  session_id?: string;
  error?: string;
  ads_scraped?: number;
} | null> {
  try {
    const response = await fetch(`${worker.url}/session/status`, {
      method: "GET",
      headers: {
        "x-api-key": worker.api_key,
      },
    });
    
    if (!response.ok) {
      console.log(`[Orchestrator] Session status check failed for worker ${worker.id}: HTTP ${response.status}`);
      return { 
        external_status: "http_error", 
        worker_phase: "unknown",
        error: `HTTP ${response.status}` 
      };
    }
    
    const data = await response.json();
    
    const rawPhase = data.phase || data.progress?.phase;
    const rawStatus = data.status;
    
    const statusToPhaseMap: Record<string, string> = {
      "ready": "ready",
      "active": "active", 
      "idle": "idle",
      "scraping": "scraping",
      "failed": "failed",
      "error": "error",
      "stuck": "stuck",
      "disconnected": "disconnected",
      "terminated": "terminated",
      "initializing": "initializing",
      "connecting": "connecting",
      "authenticating": "authenticating",
      "warming_up": "warming_up",
    };
    
    const worker_phase = rawPhase || statusToPhaseMap[rawStatus] || rawStatus || "unknown";
    const external_status = rawStatus || "unknown";
    const ads_scraped = data.ads_scraped || data.progress?.ads_scraped || 0;
    
    console.log(`[Orchestrator] Worker ${worker.id} session status:`, { 
      external_status,
      worker_phase,
      ads_scraped,
      raw_data: JSON.stringify(data).substring(0, 200)
    });
    
    if (sessionId) {
      const { error } = await supabase
        .from("sessions")
        .update({ 
          current_phase: worker_phase,
          updated_at: new Date().toISOString()
        })
        .eq("id", sessionId);
      
      if (error) {
        console.error(`[Orchestrator] Failed to update session ${sessionId} phase:`, error);
      }
    }
    
    return { 
      ...data, 
      external_status, 
      worker_phase,
      ads_scraped,
      session_id: data.session_id 
    };
  } catch (error) {
    console.error(`[Orchestrator] Failed to check session status for worker ${worker.id}:`, error);
    return { 
      external_status: "network_error", 
      worker_phase: "unknown",
      error: String(error) 
    };
  }
}

async function createWorkerSessionWithRetry(worker: Worker, initialProxy: Proxy): Promise<Session | null> {
  let currentProxy = initialProxy;
  let previousProxyId: string | null = null;
  let retryCount = 0;
  const maxRetries = config.maxRetries;
  
  while (retryCount <= maxRetries) {
    const session = await createWorkerSession(worker, currentProxy);
    
    if (session) {
      return session;
    }
    
    retryCount++;
    previousProxyId = currentProxy.id;
    
    if (retryCount <= maxRetries) {
      console.log(`[Orchestrator] Session creation failed for worker ${worker.id}, retry ${retryCount}/${maxRetries} with new proxy...`);
      
      await releaseProxy(currentProxy.id);
      
      const newProxy = await allocateProxyWithTimeout(worker.id);
      
      if (!newProxy) {
        console.log(`[Orchestrator] No proxy available for retry, giving up`);
        await log(null, "SESSION_RETRY_NO_PROXY", { 
          worker_id: worker.id, 
          retry_count: retryCount,
          previous_proxy_id: previousProxyId
        });
        return null;
      }
      
      currentProxy = newProxy;
      
      await log(null, "SESSION_RETRY", { 
        worker_id: worker.id, 
        retry_count: retryCount,
        previous_proxy_id: previousProxyId,
        new_proxy_id: newProxy.id 
      });
    }
  }
  
  console.log(`[Orchestrator] Session creation failed after ${maxRetries} retries`);
  return null;
}

async function createWorkerSession(worker: Worker, proxy: Proxy): Promise<Session | null> {
  const existingSession = await getActiveSession(worker.id);
  if (existingSession) {
    console.log(`[Orchestrator] Worker ${worker.id} already has active session ${existingSession.id}`);
    return existingSession;
  }
  
  const session = await createSessionInDb(worker.id, proxy.id, config.sessionLimit);
  if (!session) {
    return null;
  }
  
  const sessionStartTime = Date.now();
  
  try {
    await updateWorkerStatus(worker.id, "initializing");
    
    const proxyServer = proxy.port ? `${proxy.host}:${proxy.port}` : proxy.host;
    const proxyConfig = {
      server: proxyServer,
      username: proxy.username,
      password: proxy.password,
    };
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutSession);
    
    try {
      console.log(`[Orchestrator] Creating external session for worker ${worker.id}...`);
      
      await log(null, "SESSION_STARTED", { 
        worker_id: worker.id, 
        proxy_id: proxy.id,
        proxy_name: proxy.name || proxyServer,
        duration_ms: 0
      });
      
      const response = await fetch(`${worker.url}/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": worker.api_key,
        },
        body: JSON.stringify({ 
          force_refresh: true,
          proxy: proxyConfig 
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = "Could not read error body";
        }
        console.error(`[Orchestrator] Session creation failed for ${worker.id}:`, {
          status: response.status,
          statusText: response.statusText,
          errorBody,
          requestUrl: `${worker.url}/session`,
          proxyConfig: { server: proxyServer, username: proxy.username ? "***" : null },
        });
        throw new Error(`Session creation failed: ${response.status} - ${errorBody}`);
      }
      
      const data = await response.json();
      const externalSessionId = data.session_id || data.job_id || data.data?.job_id;
      
      await updateSessionStatus(session.id, "INITIALIZING", { 
        external_session_id: externalSessionId,
        current_phase: "initializing"
      });
      
      console.log(`[Orchestrator] External session created (${externalSessionId}), status: INITIALIZING, phase: initializing`);
      
      const readySession = await waitForSessionReady(worker, session);
      
      if (!readySession) {
        throw new Error("Session failed to reach READY state");
      }
      
      await log(null, "SESSION_CREATED", { 
        sessionId: session.id, 
        workerId: worker.id, 
        proxyId: proxy.id,
        externalSessionId 
      });
      
      return readySession;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  } catch (error) {
    const durationMs = Date.now() - sessionStartTime;
    console.error(`[Orchestrator] Failed to create session for worker ${worker.id}:`, error);
    
    await supabase.rpc("increment_proxy_fail_count", { proxy_id: proxy.id });
    console.log(`[Orchestrator] Incremented fail_count for proxy ${proxy.id} due to session creation failure`);
    
    await updateSessionStatus(session.id, "ERROR", {
      current_phase: "create_failed",
      last_error_code: ERROR_CODES.SESSION_CREATE_FAILED,
      last_error_message: String(error),
    });
    
    console.log(`[Orchestrator] Session ${session.id} failed: status=ERROR, phase=create_failed`);
    
    await log(null, "SESSION_FAILED", { 
      worker_id: worker.id, 
      session_id: session.id,
      proxy_id: proxy.id,
      error_code: ERROR_CODES.SESSION_CREATE_FAILED,
      phase: "create_failed",
      duration_ms: durationMs
    });
    
    await updateWorkerStatus(worker.id, "error");
    await releaseProxy(proxy.id);
    
    return null;
  }
}

async function waitForSessionReady(worker: Worker, session: Session): Promise<Session | null> {
  const startTime = Date.now();
  const maxWaitTime = config.sessionReadyTimeout;
  const pollInterval = config.sessionPollingInterval;
  
  console.log(`[Orchestrator] Waiting for session ${session.id} to become READY (timeout: ${maxWaitTime}ms, polling every ${pollInterval}ms)...`);
  
  while (Date.now() - startTime < maxWaitTime) {
    if (state.shuttingDown) {
      console.log(`[Orchestrator] Aborting session wait - shutting down`);
      return null;
    }
    
    // Pass sessionId to save current_phase to database
    const externalStatus = await checkExternalSessionStatus(worker, session.id);
    
    console.log(`[Orchestrator] Session ${session.id} external status:`, externalStatus);
    
    if (externalStatus) {
      // worker_phase is the actual phase from Worker API (not status)
      const phase = externalStatus.worker_phase;
      
      // Check for HTTP/network errors first
      if (externalStatus.external_status === "http_error" || externalStatus.external_status === "network_error") {
        console.log(`[Orchestrator] Session ${session.id} check failed: ${externalStatus.error}`);
        // Continue polling, might be temporary
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }
      
      // SUCCESS STATES: Session is ready for work
      if (phase === "ready" || phase === "active" || phase === "idle") {
        const durationMs = Date.now() - startTime;
        await updateSessionStatus(session.id, "READY", { current_phase: phase });
        await updateWorkerStatus(worker.id, "ready");
        await supabase
          .from("workers")
          .update({ session_count: 0 })
          .eq("id", worker.id);
        
        console.log(`[Orchestrator] Session ${session.id} is now READY (phase: ${phase}, duration: ${durationMs}ms)`);
        
        await log(null, "SESSION_READY", { 
          worker_id: worker.id, 
          session_id: session.id,
          duration_ms: durationMs 
        });
        
        const { data: updatedSession } = await supabase
          .from("sessions")
          .select("*")
          .eq("id", session.id)
          .single();
        
        return updatedSession as Session;
      }
      
      // ERROR STATES: Session failed and needs retry
      if (phase === "failed" || phase === "error" || phase === "stuck" || phase === "disconnected" || phase === "terminated") {
        const durationMs = Date.now() - startTime;
        console.error(`[Orchestrator] Session ${session.id} failed with phase: ${phase}`);
        
        if (session.proxy_id) {
          await supabase.rpc("increment_proxy_fail_count", { proxy_id: session.proxy_id });
          console.log(`[Orchestrator] Incremented fail_count for proxy ${session.proxy_id}`);
        }
        
        await updateSessionStatus(session.id, "ERROR", {
          current_phase: phase,
          last_error_code: ERROR_CODES.SESSION_INIT_FAILED,
          last_error_message: `External session phase: ${phase}`,
        });
        
        await log(null, "SESSION_FAILED", { 
          worker_id: worker.id, 
          session_id: session.id,
          error_code: ERROR_CODES.SESSION_INIT_FAILED,
          phase,
          duration_ms: durationMs
        });
        
        await updateWorkerStatus(worker.id, "error");
        return null;
      }
      
      // PROGRESS STATES: Still initializing, continue polling
      if (phase === "initializing" || phase === "creating" || phase === "connecting" || phase === "authenticating" || phase === "warming_up" || phase === "scraping") {
        console.log(`[Orchestrator] Session ${session.id} in progress (phase: ${phase})...`);
        // Phase already saved by checkExternalSessionStatus
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  const durationMs = Date.now() - startTime;
  console.error(`[Orchestrator] Session ${session.id} timed out waiting for READY state after ${durationMs}ms`);
  
  if (session.proxy_id) {
    await supabase.rpc("increment_proxy_fail_count", { proxy_id: session.proxy_id });
    console.log(`[Orchestrator] Incremented fail_count for proxy ${session.proxy_id} due to timeout`);
  }
  
  await updateSessionStatus(session.id, "TIMEOUT", {
    current_phase: "timeout",
    last_error_code: ERROR_CODES.SESSION_TIMEOUT,
    last_error_message: `Session did not become ready within ${maxWaitTime}ms`,
  });
  
  await log(null, "SESSION_FAILED", { 
    worker_id: worker.id, 
    session_id: session.id,
    error_code: ERROR_CODES.SESSION_TIMEOUT,
    phase: "timeout",
    duration_ms: durationMs
  });
  
  await updateWorkerStatus(worker.id, "error");
  
  return null;
}

async function endWorkerSession(worker: Worker): Promise<void> {
  const session = await getActiveSession(worker.id);
  
  try {
    await fetch(`${worker.url}/session`, {
      method: "DELETE",
      headers: {
        "x-api-key": worker.api_key,
      },
    });
  } catch (error) {
    console.error(`[Orchestrator] Failed to end external session for worker ${worker.id}:`, error);
  }
  
  if (session) {
    await updateSessionStatus(session.id, "ENDED");
    
    if (session.proxy_id) {
      await releaseProxy(session.proxy_id);
    }
    
    await log(null, "SESSION_ENDED", { 
      sessionId: session.id, 
      workerId: worker.id,
      executionCount: session.execution_count 
    });
  }
  
  await releaseWorkerProxies(worker.id);
  await updateWorkerStatus(worker.id, "idle");
}

async function startScrapeJob(worker: Worker, mission: Mission): Promise<{ jobId: string; dataUrl: string } | null> {
  try {
    await updateWorkerStatus(worker.id, "scraping");
    await updateMissionCheckpoint(mission.id, "EXTRAINDO");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutJob);
    
    const formatMap: Record<string, string> = {
      "all": "all",
      "video": "video",
      "image": "image",
    };
    const format = formatMap[mission.media_type] || "all";
    
    const scrapePayload = {
      filters: {
        date_range: { 
          start: mission.date_start, 
          end: mission.date_end 
        },
        format: format,
        sort_by: "qtd_ads",
        languages: mission.languages,
      },
      options: {
        max_ads: "all",
        batch_size: 150,
      },
    };
    
    try {
      const response = await fetch(`${worker.url}/scrape`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": worker.api_key,
        },
        body: JSON.stringify(scrapePayload),
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch (e) {
          errorBody = "Could not read error body";
        }
        console.error(`[Orchestrator] Scrape request failed for mission ${mission.id}:`, {
          status: response.status,
          statusText: response.statusText,
          errorBody,
          requestUrl: `${worker.url}/scrape`,
          payload: scrapePayload,
        });
        throw new Error(`Scrape request failed: ${response.status} - ${errorBody}`);
      }
      
      const responseData = await response.json();
      console.log(`[Orchestrator] Scrape response for mission ${mission.id}:`, JSON.stringify(responseData));
      
      const jobId = responseData.job_id || responseData.jobId || responseData.id;
      
      if (!jobId || typeof jobId !== "string") {
        console.error(`[Orchestrator] Missing or invalid job_id in scrape response for mission ${mission.id}:`, responseData);
        throw new Error(`Scrape response missing job_id: ${JSON.stringify(responseData)}`);
      }
      
      const storageDomain = worker.storage_domain || new URL(worker.url).origin;
      const dataUrl = responseData.data?.data_url || responseData.data_url || `${storageDomain}/data/${jobId}.json`;
      
      await supabase
        .from("missions")
        .update({
          worker_job_id: jobId,
          worker_data_url: dataUrl,
        })
        .eq("id", mission.id);
      
      await log(mission.id, "SCRAPE_STARTED", { jobId, dataUrl });
      
      return { jobId, dataUrl };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  } catch (error) {
    console.error(`Failed to start scrape for mission ${mission.id}:`, error);
    return null;
  }
}

async function checkScrapeStatus(worker: Worker, jobId: string): Promise<{ status: string; adsCount?: number } | null> {
  try {
    const response = await fetch(`${worker.url}/scrape/${jobId}`, {
      headers: {
        "x-api-key": worker.api_key,
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to check scrape status for job ${jobId}:`, error);
    return null;
  }
}

async function getActiveWriter(): Promise<Writer | null> {
  const { data, error } = await supabase
    .from("writers")
    .select("*")
    .eq("active", true)
    .is("current_mission_id", null)
    .limit(1)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  return data as Writer;
}

async function startWriterJob(
  writer: Writer, 
  mission: Mission, 
  dataUrl: string, 
  adsCount: number
): Promise<string | null> {
  try {
    await updateMissionCheckpoint(mission.id, "ARMAZENANDO");
    
    await supabase
      .from("writers")
      .update({ current_mission_id: mission.id })
      .eq("id", writer.id);
    
    const response = await fetch(`${writer.url}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": writer.api_key,
      },
      body: JSON.stringify({
        mission_id: mission.id,
        data_url: dataUrl,
        ads_count: adsCount,
        date_start: mission.date_start,
        date_end: mission.date_end,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Writer request failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    await supabase
      .from("missions")
      .update({ writer_job_id: data.job_id })
      .eq("id", mission.id);
    
    await log(mission.id, "WRITER_STARTED", { writerId: writer.id, jobId: data.job_id });
    
    return data.job_id;
  } catch (error) {
    console.error(`Failed to start writer for mission ${mission.id}:`, error);
    
    await supabase
      .from("writers")
      .update({ current_mission_id: null })
      .eq("id", writer.id);
    
    return null;
  }
}

async function checkWriterStatus(writer: Writer, jobId: string): Promise<{ status: string; error?: string } | null> {
  try {
    const response = await fetch(`${writer.url}/status/${jobId}`, {
      headers: {
        "x-api-key": writer.api_key,
      },
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Failed to check writer status for job ${jobId}:`, error);
    return null;
  }
}

async function processIdleWorkers(): Promise<boolean> {
  console.log("[Orchestrator] processIdleWorkers starting...");
  let hadSuccess = false;
  
  const { data: workers, error: workersError } = await supabase
    .from("workers")
    .select("*")
    .eq("active", true)
    .in("status", ["idle", "ready"]);
  
  console.log("[Orchestrator] Found workers:", { 
    count: workers?.length || 0, 
    error: workersError?.message,
    workers: workers?.map(w => ({ id: w.id, name: w.name, status: w.status }))
  });
  
  if (!workers || workers.length === 0) {
    console.log("[Orchestrator] No idle/ready workers found, returning");
    return hadSuccess;
  }
  
  for (const worker of workers) {
    console.log(`[Orchestrator] Processing worker ${worker.id} (${worker.name}), status: ${worker.status}`);
    
    if (state.shuttingDown) {
      console.log("[Orchestrator] Shutting down, breaking loop");
      break;
    }
    
    const session = await getActiveSession(worker.id);
    console.log(`[Orchestrator] Worker ${worker.id} session:`, session ? `${session.id} (${session.status})` : "none");
    
    if (!session || worker.status === "idle") {
      console.log(`[Orchestrator] Worker ${worker.id} needs session, allocating proxy...`);
      const proxy = await allocateProxyWithTimeout(worker.id);
      
      if (!proxy) {
        console.log(`[Orchestrator] No proxy available for worker ${worker.id}`);
        await log(null, "NO_PROXY_AVAILABLE", { workerId: worker.id });
        continue;
      }
      
      console.log(`[Orchestrator] Proxy ${proxy.id} allocated to worker ${worker.id}, creating session with retry...`);
      hadSuccess = true;
      
      const newSession = await createWorkerSessionWithRetry(worker as Worker, proxy);
      
      if (!newSession) {
        console.log(`[Orchestrator] Failed to create session for worker ${worker.id}`);
        continue;
      }
      
      console.log(`[Orchestrator] Session ${newSession.id} created for worker ${worker.id}, status: ${newSession.status}`);
      continue;
    }
    
    if (session.status !== "READY" && session.status !== "ACTIVE") {
      console.log(`[Orchestrator] Worker ${worker.id} session ${session.id} not ready yet (${session.status}), skipping`);
      continue;
    }
    
    if (session.execution_count >= session.execution_limit) {
      console.log(`[Orchestrator] Session ${session.id} reached execution limit (${session.execution_count}/${session.execution_limit}), ending...`);
      await endWorkerSession(worker as Worker);
      continue;
    }
    
    const mission = await allocateMissionWithTimeout(worker.id);
    
    if (!mission) {
      continue;
    }
    
    hadSuccess = true;
    
    const newExecutionCount = await incrementSessionExecutionCount(session.id);
    console.log(`[Orchestrator] Session ${session.id} execution count: ${newExecutionCount}/${session.execution_limit}`);
    
    await supabase
      .from("sessions")
      .update({ current_mission_id: mission.id })
      .eq("id", session.id);
    
    await supabase
      .from("missions")
      .update({ session_id: session.id })
      .eq("id", mission.id);
    
    await log(mission.id, "MISSION_ASSIGNED", { workerId: worker.id, sessionId: session.id });
    
    await supabase
      .from("workers")
      .update({ current_mission_id: mission.id, session_count: newExecutionCount })
      .eq("id", worker.id);
    
    const scrapeResult = await startScrapeJob(worker as Worker, mission);
    
    if (!scrapeResult) {
      await failMission(mission.id, ERROR_CODES.SCRAPE_FAILED, "Failed to start scrape job", worker.id);
      
      await supabase
        .from("sessions")
        .update({ 
          current_mission_id: null,
          failure_count: (session.failure_count || 0) + 1,
          last_error_code: ERROR_CODES.SCRAPE_FAILED,
          last_error_message: "Failed to start scrape job"
        })
        .eq("id", session.id);
      
      continue;
    }
  }
  
  return hadSuccess;
}

async function processRunningMissions(): Promise<boolean> {
  let hadSuccess = false;
  
  const { data: missions } = await supabase
    .from("missions")
    .select("*, workers!inner(*)")
    .eq("status", "RUNNING")
    .eq("checkpoint", "EXTRAINDO")
    .not("worker_job_id", "is", null);
  
  if (!missions) return hadSuccess;
  
  for (const mission of missions) {
    if (state.shuttingDown) break;
    
    const worker = (mission as any).workers as Worker;
    
    const status = await checkScrapeStatus(worker, mission.worker_job_id!);
    
    if (!status) {
      continue;
    }
    
    if (status.status === "completed") {
      hadSuccess = true;
      const adsCount = status.adsCount || 0;
      
      await supabase
        .from("missions")
        .update({ ads_count: adsCount })
        .eq("id", mission.id);
      
      await log(mission.id, "SCRAPE_COMPLETED", { adsCount });
      
      await supabase
        .from("workers")
        .update({ current_mission_id: null })
        .eq("id", worker.id);
      await updateWorkerStatus(worker.id, "ready");
      
      const updatedMission = { ...mission, ads_count: adsCount } as Mission;
      const writerResult = await processWriterQueue(updatedMission, adsCount);
      
      if (!writerResult) {
        await failMission(
          mission.id, 
          ERROR_CODES.WRITER_FAILED, 
          "No available writer or writer failed",
          worker.id
        );
      }
    } else if (status.status === "failed") {
      await failMission(mission.id, ERROR_CODES.SCRAPE_FAILED, "Scrape job failed", worker.id);
      await updateWorkerStatus(worker.id, "ready");
    }
  }
  
  return hadSuccess;
}

async function processWriterQueue(mission: Mission, adsCount: number): Promise<boolean> {
  const writer = await getActiveWriter();
  
  if (!writer) {
    await log(mission.id, "NO_WRITER_AVAILABLE", {});
    return false;
  }
  
  const jobId = await startWriterJob(writer, mission, mission.worker_data_url!, adsCount);
  
  return jobId !== null;
}

async function processWritingMissions(): Promise<boolean> {
  let hadSuccess = false;
  
  const { data: missions } = await supabase
    .from("missions")
    .select("*")
    .eq("status", "RUNNING")
    .eq("checkpoint", "ARMAZENANDO")
    .not("writer_job_id", "is", null);
  
  if (!missions) return hadSuccess;
  
  for (const mission of missions) {
    if (state.shuttingDown) break;
    
    const { data: writer } = await supabase
      .from("writers")
      .select("*")
      .eq("current_mission_id", mission.id)
      .single();
    
    if (!writer) continue;
    
    const status = await checkWriterStatus(writer as Writer, mission.writer_job_id!);
    
    if (!status) continue;
    
    if (status.status === "completed") {
      hadSuccess = true;
      
      await supabase
        .from("writers")
        .update({ current_mission_id: null })
        .eq("id", writer.id);
      
      await completeMission(mission.id, mission.ads_count || 0, mission.worker_id || "");
    } else if (status.status === "failed") {
      await supabase
        .from("writers")
        .update({ current_mission_id: null })
        .eq("id", writer.id);
      
      await failMission(
        mission.id, 
        ERROR_CODES.WRITER_FAILED, 
        status.error || "Writer job failed",
        mission.worker_id || undefined
      );
    }
  }
  
  return hadSuccess;
}

async function monitorActiveSessions(): Promise<boolean> {
  let hadAction = false;
  
  const { data: activeSessions } = await supabase
    .from("sessions")
    .select("*")
    .in("status", ["READY", "ACTIVE"]);
  
  if (!activeSessions || activeSessions.length === 0) {
    return hadAction;
  }
  
  console.log(`[Orchestrator] Monitoring ${activeSessions.length} active session(s)...`);
  
  for (const session of activeSessions) {
    if (state.shuttingDown) break;
    
    const { data: workerData } = await supabase
      .from("workers")
      .select("*")
      .eq("id", session.worker_id)
      .single();
    
    const worker = workerData as Worker;
    if (!worker) {
      console.log(`[Orchestrator] Session ${session.id} has no worker (worker_id: ${session.worker_id}), skipping`);
      continue;
    }
    
    const externalStatus = await checkExternalSessionStatus(worker, session.id);
    
    if (!externalStatus) {
      console.log(`[Orchestrator] No status received for session ${session.id}`);
      continue;
    }
    
    const phase = externalStatus.worker_phase;
    const status = externalStatus.external_status;
    
    if (status === "http_error" || status === "network_error") {
      const failureCount = (session.failure_count || 0) + 1;
      await supabase
        .from("sessions")
        .update({ 
          failure_count: failureCount,
          last_error_message: externalStatus.error 
        })
        .eq("id", session.id);
      
      if (failureCount >= 3) {
        console.log(`[Orchestrator] Session ${session.id} has ${failureCount} consecutive errors, marking as ERROR`);
        
        await updateSessionStatus(session.id, "ERROR", {
          current_phase: "monitoring_failed",
          last_error_code: ERROR_CODES.SESSION_INIT_FAILED,
          last_error_message: `Session monitoring failed after ${failureCount} attempts: ${externalStatus.error}`,
        });
        
        if (session.proxy_id) {
          await supabase.rpc("increment_proxy_fail_count", { proxy_id: session.proxy_id });
          await releaseProxy(session.proxy_id);
        }
        
        await updateWorkerStatus(worker.id, "error");
        
        const { data: runningMission } = await supabase
          .from("missions")
          .select("id")
          .eq("worker_id", worker.id)
          .eq("status", "RUNNING")
          .single();
        
        if (runningMission) {
          await failMission(
            runningMission.id,
            ERROR_CODES.SESSION_INIT_FAILED,
            `Session monitoring failed: ${externalStatus.error}`,
            worker.id
          );
        }
        
        hadAction = true;
      }
      continue;
    }
    
    await supabase
      .from("sessions")
      .update({ failure_count: 0 })
      .eq("id", session.id);
    
    if (phase === "failed" || phase === "error" || phase === "stuck" || phase === "disconnected" || phase === "terminated") {
      console.log(`[Orchestrator] Session ${session.id} detected in error state: ${phase}`);
      
      await updateSessionStatus(session.id, "ERROR", {
        current_phase: phase,
        last_error_code: ERROR_CODES.SESSION_INIT_FAILED,
        last_error_message: `Worker reported session phase: ${phase}`,
      });
      
      if (session.proxy_id) {
        await supabase.rpc("increment_proxy_fail_count", { proxy_id: session.proxy_id });
        await releaseProxy(session.proxy_id);
      }
      
      await updateWorkerStatus(worker.id, "error");
      
      const { data: runningMission } = await supabase
        .from("missions")
        .select("id")
        .eq("worker_id", worker.id)
        .eq("status", "RUNNING")
        .single();
      
      if (runningMission) {
        await failMission(
          runningMission.id,
          ERROR_CODES.SESSION_INIT_FAILED,
          `Session entered error state: ${phase}`,
          worker.id
        );
      }
      
      await log(null, "SESSION_MONITORING_ERROR", {
        session_id: session.id,
        worker_id: worker.id,
        phase,
        external_status: status
      });
      
      hadAction = true;
    } else if (phase === "ready" || phase === "active" || phase === "idle" || phase === "scraping") {
      if (session.status === "READY" && phase === "scraping") {
        await updateSessionStatus(session.id, "ACTIVE", { current_phase: phase });
      }
    }
  }
  
  return hadAction;
}

async function orchestratorLoop(): Promise<void> {
  console.log("[Orchestrator] orchestratorLoop starting, state:", { 
    isRunning: state.isRunning, 
    shuttingDown: state.shuttingDown,
    cycleInProgress: state.cycleInProgress 
  });
  
  if (!state.isRunning || state.shuttingDown) {
    console.log("[Orchestrator] Not running or shutting down, exiting loop");
    return;
  }
  
  if (state.cycleInProgress) {
    console.log("[Orchestrator] Skipping cycle - previous cycle still in progress");
    return;
  }
  
  state.cycleInProgress = true;
  const cycleStart = Date.now();
  
  try {
    console.log("[Orchestrator] Starting parallel processing...");
    const results = await Promise.all([
      processIdleWorkers(),
      processRunningMissions(),
      processWritingMissions(),
      monitorActiveSessions(),
    ]);
    
    console.log("[Orchestrator] Processing results:", results);
    const hadAnySuccess = results.some(r => r);
    
    if (hadAnySuccess) {
      resetBackoff();
    }
    
    const cycleTime = Date.now() - cycleStart;
    console.log(`[Orchestrator] Cycle completed in ${cycleTime}ms`);
    
  } catch (error) {
    console.error("[Orchestrator] Loop error:", error);
    increaseBackoff();
  } finally {
    state.cycleInProgress = false;
  }
}

function scheduleNextCycle(): void {
  if (!state.isRunning || state.shuttingDown) return;
  
  state.interval = setTimeout(() => {
    orchestratorLoop().finally(() => {
      scheduleNextCycle();
    });
  }, state.currentInterval);
}

export async function startOrchestrator(): Promise<{ success: boolean; message: string }> {
  console.log("[Orchestrator] startOrchestrator called, current state:", { isRunning: state.isRunning });
  
  if (state.isRunning) {
    console.log("[Orchestrator] Already running, returning");
    return { success: false, message: "Orquestrador já está em execução" };
  }
  
  await loadConfig();
  console.log("[Orchestrator] Config loaded:", config);
  
  state.isRunning = true;
  state.shuttingDown = false;
  state.cycleInProgress = false;
  state.consecutiveFailures = 0;
  state.currentInterval = config.refreshInterval;
  
  console.log("[Orchestrator] State updated, starting loop...");
  await log(null, "ORCHESTRATOR_STARTED", { config });
  
  orchestratorLoop().finally(() => {
    console.log("[Orchestrator] First cycle completed, scheduling next cycle");
    scheduleNextCycle();
  });
  
  console.log("[Orchestrator] startOrchestrator returning success");
  return { success: true, message: "Orquestrador iniciado" };
}

export async function stopOrchestrator(graceful: boolean = true): Promise<{ success: boolean; message: string }> {
  if (!state.isRunning) {
    return { success: false, message: "Orquestrador não está em execução" };
  }
  
  state.shuttingDown = true;
  
  if (state.interval) {
    clearTimeout(state.interval);
    state.interval = null;
  }
  
  while (state.cycleInProgress) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (graceful) {
    const { data: runningMissions } = await supabase
      .from("missions")
      .select("id")
      .eq("status", "RUNNING");
    
    if (runningMissions && runningMissions.length > 0) {
      await log(null, "ORCHESTRATOR_GRACEFUL_SHUTDOWN", { 
        pendingMissions: runningMissions.length 
      });
    }
  }
  
  const { data: activeSessions } = await supabase
    .from("sessions")
    .select("worker_id")
    .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);
  
  if (activeSessions) {
    for (const session of activeSessions) {
      const { data: worker } = await supabase
        .from("workers")
        .select("*")
        .eq("id", session.worker_id)
        .single();
      
      if (worker) {
        await endWorkerSession(worker as Worker);
      }
    }
  }
  
  await supabase
    .from("sessions")
    .update({ 
      status: "ENDED" as SessionStatusType, 
      ended_at: new Date().toISOString() 
    })
    .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);
  
  await supabase
    .from("proxies")
    .update({ in_use_by_worker_id: null })
    .not("in_use_by_worker_id", "is", null);
  
  await supabase
    .from("workers")
    .update({ status: "idle", current_mission_id: null, session_count: 0 })
    .eq("active", true);
  
  state.isRunning = false;
  state.shuttingDown = false;
  state.cycleInProgress = false;
  
  await log(null, "ORCHESTRATOR_STOPPED", {});
  
  return { success: true, message: "Orquestrador parado" };
}

export async function cancelMission(missionId: string): Promise<{ success: boolean; message: string }> {
  const { data: mission } = await supabase
    .from("missions")
    .select("*, workers(*)")
    .eq("id", missionId)
    .single();
  
  if (!mission) {
    return { success: false, message: "Missão não encontrada" };
  }
  
  if (!["QUEUED", "RUNNING"].includes(mission.status)) {
    return { success: false, message: "Missão não pode ser cancelada neste estado" };
  }
  
  if (mission.status === "RUNNING" && mission.worker_id) {
    const worker = (mission as any).workers as Worker;
    
    if (worker && mission.worker_job_id) {
      try {
        await fetch(`${worker.url}/scrape/${mission.worker_job_id}`, {
          method: "DELETE",
          headers: { "x-api-key": worker.api_key },
        });
      } catch (error) {
        console.error("Failed to cancel scrape job:", error);
      }
    }
    
    await supabase
      .from("workers")
      .update({ current_mission_id: null })
      .eq("id", mission.worker_id);
  }
  
  await supabase
    .from("missions")
    .update({
      status: "FAILED",
      error_code: ERROR_CODES.CANCELLED,
      error_message: "Cancelado pelo usuário",
      finished_at: new Date().toISOString(),
    })
    .eq("id", missionId);
  
  await log(missionId, "MISSION_CANCELLED", {});
  
  return { success: true, message: "Missão cancelada" };
}

export async function getActiveSessionsCount(): Promise<number> {
  const { count } = await supabase
    .from("sessions")
    .select("*", { count: "exact", head: true })
    .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);
  
  return count || 0;
}

export function getOrchestratorStatus(): {
  isRunning: boolean;
  shuttingDown: boolean;
  cycleInProgress: boolean;
  consecutiveFailures: number;
  currentInterval: number;
} {
  return {
    isRunning: state.isRunning,
    shuttingDown: state.shuttingDown,
    cycleInProgress: state.cycleInProgress,
    consecutiveFailures: state.consecutiveFailures,
    currentInterval: state.currentInterval,
  };
}
