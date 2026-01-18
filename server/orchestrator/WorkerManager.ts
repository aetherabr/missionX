import { supabase } from "../supabase";
import { eventBus } from "./EventBus";
import { OrchestratorConfig, DEFAULT_CONFIG } from "./types";
import type { Worker, Mission } from "../../shared/schema";

interface ActiveScrape {
  missionId: string;
  workerId: string;
  sessionId: string;
  jobId: string;
  startTime: number;
}

export class WorkerManager {
  private config: OrchestratorConfig;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private activeScrapes: Map<string, ActiveScrape> = new Map();
  private waitingWorkers: Map<string, { missionId: string }> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.subscribe("session:ready", async (payload) => {
      console.log(`[WorkerManager] Session ${payload.sessionId} ready for worker ${payload.workerId}`);
      await this.handleSessionReady(payload.sessionId, payload.workerId);
    });

    eventBus.subscribe("session:error", async (payload) => {
      console.log(`[WorkerManager] Session error for worker ${payload.workerId}: ${payload.error}`);
      await this.handleSessionError(payload.workerId, payload.error);
    });

    eventBus.subscribe("mission:assigned", async (payload) => {
      console.log(`[WorkerManager] Mission ${payload.missionId} assigned to worker ${payload.workerId}`);
      await this.requestSessionForMission(payload.workerId, payload.missionId);
    });

    eventBus.subscribe("session:terminated", async (payload) => {
      console.log(`[WorkerManager] Session ${payload.sessionId} terminated, releasing worker resources`);
      await this.handleSessionTerminated(payload.sessionId);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[WorkerManager] Starting...");

    await this.resetWorkerStatuses();
    this.startLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log("[WorkerManager] Stopped");
  }

  private startLoop(): void {
    this.loopInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.monitorActiveScrapes();
    }, this.config.workerPollingIntervalMs);
  }

  private async resetWorkerStatuses(): Promise<void> {
    await supabase
      .from("workers")
      .update({ status: "idle" })
      .in("status", ["initializing", "ready", "scraping"]);
    
    console.log("[WorkerManager] Reset all worker statuses to idle");
  }

  private async requestSessionForMission(workerId: string, missionId: string): Promise<void> {
    await supabase
      .from("workers")
      .update({ status: "waiting_session" })
      .eq("id", workerId);

    this.waitingWorkers.set(workerId, { missionId });

    await eventBus.emit("worker:request_session", { workerId, missionId });
  }

  private async handleSessionReady(sessionId: string, workerId: string): Promise<void> {
    const waiting = this.waitingWorkers.get(workerId);
    if (!waiting) {
      console.log(`[WorkerManager] No waiting mission for worker ${workerId}`);
      return;
    }

    const missionId = waiting.missionId;
    this.waitingWorkers.delete(workerId);

    await supabase
      .from("workers")
      .update({ status: "ready" })
      .eq("id", workerId);

    await supabase
      .from("sessions")
      .update({ status: "ACTIVE" })
      .eq("id", sessionId);

    await this.startScrape(workerId, missionId, sessionId);
  }

  private async handleSessionError(workerId: string, error: string): Promise<void> {
    const waiting = this.waitingWorkers.get(workerId);
    this.waitingWorkers.delete(workerId);

    await supabase
      .from("workers")
      .update({ status: "idle" })
      .eq("id", workerId);

    if (waiting) {
      await eventBus.emit("worker:session_failed", {
        workerId,
        missionId: waiting.missionId,
        error,
      });
    }
  }

  private async handleSessionTerminated(sessionId: string): Promise<void> {
    const { data: session } = await supabase
      .from("sessions")
      .select("worker_id")
      .eq("id", sessionId)
      .single();

    if (!session?.worker_id) return;

    const workerId = session.worker_id;

    this.waitingWorkers.delete(workerId);

    for (const [key, scrape] of this.activeScrapes.entries()) {
      if (scrape.sessionId === sessionId) {
        this.activeScrapes.delete(key);
        break;
      }
    }

    await supabase
      .from("workers")
      .update({ status: "idle" })
      .eq("id", workerId);

    console.log(`[WorkerManager] Worker ${workerId} reset to idle after session terminated`);
  }

  private async startScrape(workerId: string, missionId: string, sessionId: string): Promise<void> {
    console.log(`[WorkerManager] Starting scrape for mission ${missionId}`);

    const { data: worker } = await supabase
      .from("workers")
      .select("*")
      .eq("id", workerId)
      .single();

    const { data: mission } = await supabase
      .from("missions")
      .select("*")
      .eq("id", missionId)
      .single();

    if (!worker || !mission) {
      console.error(`[WorkerManager] Worker or mission not found`);
      await eventBus.emit("scrape:failed", {
        missionId,
        workerId,
        sessionId,
        error: "Worker or mission not found",
        errorCode: "ERROR201",
      });
      return;
    }

    const { data: config } = await supabase
      .from("config")
      .select("*");

    const configMap: Record<string, any> = {};
    if (config) {
      config.forEach((c: any) => { configMap[c.key] = c.value; });
    }

    const scrapePayload = {
      date_range: {
        start: mission.date_start,
        end: mission.date_end,
      },
      format: mission.media_type === "all" ? undefined : mission.media_type,
      languages: mission.languages,
      sort_by: "qtd_ads",
      options: {
        max_ads: configMap.max_ads_per_mission || 1000,
        batch_size: configMap.batch_size || 100,
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
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const jobId = data.job_id;

      if (!jobId) {
        throw new Error("No job_id returned");
      }

      await supabase
        .from("workers")
        .update({ status: "scraping" })
        .eq("id", workerId);

      await supabase
        .from("missions")
        .update({
          status: "RUNNING",
          checkpoint: "EXTRAINDO",
          worker_job_id: jobId,
          worker_id: workerId,
          session_id: sessionId,
          started_at: new Date().toISOString(),
        })
        .eq("id", missionId);

      this.activeScrapes.set(missionId, {
        missionId,
        workerId,
        sessionId,
        jobId,
        startTime: Date.now(),
      });

      await this.logMissionEvent(missionId, "SCRAPE_STARTED", `Job ${jobId} started`, 0);

      await eventBus.emit("scrape:started", { missionId, workerId, jobId });

      console.log(`[WorkerManager] Scrape started for mission ${missionId}, job: ${jobId}`);

    } catch (error) {
      console.error(`[WorkerManager] Failed to start scrape:`, error);

      await supabase
        .from("workers")
        .update({ status: "idle" })
        .eq("id", workerId);

      await eventBus.emit("scrape:failed", {
        missionId,
        workerId,
        sessionId,
        error: String(error),
        errorCode: "ERROR201",
      });
    }
  }

  private async monitorActiveScrapes(): Promise<void> {
    const { data: runningMissions } = await supabase
      .from("missions")
      .select("*")
      .eq("status", "RUNNING")
      .eq("checkpoint", "EXTRAINDO");

    if (!runningMissions || runningMissions.length === 0) return;

    for (const mission of runningMissions) {
      if (!this.isRunning) break;
      await this.checkScrapeStatus(mission as Mission);
    }
  }

  private async checkScrapeStatus(mission: Mission): Promise<void> {
    if (!mission.worker_id || !mission.worker_job_id) return;

    const cached = this.activeScrapes.get(mission.id);
    const startTime = cached?.startTime || Date.now();
    const elapsed = Date.now() - startTime;

    if (elapsed > this.config.scrapeTimeoutMs) {
      console.log(`[WorkerManager] Scrape for mission ${mission.id} timed out`);
      await this.handleScrapeComplete(mission, "timeout", "ERROR201");
      return;
    }

    const { data: worker } = await supabase
      .from("workers")
      .select("*")
      .eq("id", mission.worker_id)
      .single();

    if (!worker) return;

    try {
      const storageUrl = worker.storage_domain || "https://deeptube.jobstorage.space";
      const response = await fetch(`${worker.url}/scrape/status?job_id=${mission.worker_job_id}`, {
        method: "GET",
        headers: { "x-api-key": worker.api_key },
      });

      if (!response.ok) {
        console.log(`[WorkerManager] Scrape status check failed: HTTP ${response.status}`);
        return;
      }

      const data = await response.json();
      const status = data.status;
      const adsScraped = data.ads_scraped || data.progress?.ads_scraped || 0;

      console.log(`[WorkerManager] Scrape status for ${mission.id}: ${status}, ads: ${adsScraped}`);

      if (status === "completed" || status === "done") {
        const dataUrl = `${storageUrl}/data/${mission.worker_job_id}.json`;

        await supabase
          .from("missions")
          .update({ 
            ads_count: adsScraped,
            worker_data_url: dataUrl,
          })
          .eq("id", mission.id);

        await this.handleScrapeComplete(mission, "success", null, adsScraped, dataUrl);
      } else if (status === "failed" || status === "error") {
        await this.handleScrapeComplete(mission, "failed", "ERROR202");
      }

    } catch (error) {
      console.error(`[WorkerManager] Error checking scrape status:`, error);
    }
  }

  private async handleScrapeComplete(
    mission: Mission, 
    result: "success" | "failed" | "timeout", 
    errorCode: string | null,
    adsCount = 0,
    dataUrl = ""
  ): Promise<void> {
    const cached = this.activeScrapes.get(mission.id);
    const sessionId = cached?.sessionId || mission.session_id || "";
    this.activeScrapes.delete(mission.id);

    await supabase
      .from("workers")
      .update({ status: "idle" })
      .eq("id", mission.worker_id);

    if (result === "success") {
      await this.logMissionEvent(mission.id, "SCRAPE_COMPLETE", `Scraped ${adsCount} ads`, Date.now() - (cached?.startTime || 0));

      await eventBus.emit("scrape:complete", {
        missionId: mission.id,
        workerId: mission.worker_id!,
        sessionId,
        dataUrl,
        adsCount,
      });
    } else {
      const errorMessage = result === "timeout" ? "Scrape timeout" : "Scrape failed";
      
      await supabase
        .from("missions")
        .update({
          status: "FAILED",
          error_code: errorCode,
          error_message: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq("id", mission.id);

      await this.logMissionEvent(mission.id, "SCRAPE_FAILED", errorMessage, Date.now() - (cached?.startTime || 0));

      await eventBus.emit("scrape:failed", {
        missionId: mission.id,
        workerId: mission.worker_id!,
        sessionId,
        error: errorMessage,
        errorCode: errorCode || "ERROR202",
      });
    }

    if (sessionId) {
      const { SessionManager } = await import("./SessionManager");
    }
  }

  private async logMissionEvent(missionId: string, event: string, details: string, durationMs: number): Promise<void> {
    await supabase.from("mission_logs").insert({
      mission_id: missionId,
      event,
      details,
      duration_ms: durationMs,
    });
  }

  getStatus(): { isRunning: boolean; activeScrapes: number; waitingWorkers: number } {
    return {
      isRunning: this.isRunning,
      activeScrapes: this.activeScrapes.size,
      waitingWorkers: this.waitingWorkers.size,
    };
  }
}
