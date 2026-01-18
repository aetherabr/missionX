import { supabase } from "../supabase";
import { eventBus } from "./EventBus";
import { OrchestratorConfig, DEFAULT_CONFIG } from "./types";
import type { Mission, Writer } from "../../shared/schema";

interface ActiveWriter {
  missionId: string;
  jobId: string;
  startTime: number;
}

export class MissionManager {
  private config: OrchestratorConfig;
  private isRunning = false;
  private loopInterval: NodeJS.Timeout | null = null;
  private activeWriters: Map<string, ActiveWriter> = new Map();

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    eventBus.subscribe("scrape:complete", async (payload) => {
      console.log(`[MissionManager] Scrape complete for mission ${payload.missionId}`);
      await this.handleScrapeComplete(payload.missionId, payload.dataUrl, payload.adsCount, payload.sessionId);
    });

    eventBus.subscribe("scrape:failed", async (payload) => {
      console.log(`[MissionManager] Scrape failed for mission ${payload.missionId}`);
      await this.handleScrapeFailed(payload.missionId, payload.error, payload.errorCode, payload.sessionId);
    });

    eventBus.subscribe("worker:session_failed", async (payload) => {
      console.log(`[MissionManager] Session failed for mission ${payload.missionId}`);
      await this.handleSessionFailed(payload.missionId);
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("[MissionManager] Starting...");

    this.startLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
    console.log("[MissionManager] Stopped");
  }

  private startLoop(): void {
    this.loopInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.processQueuedMissions();
      await this.monitorWriters();
    }, this.config.missionPollingIntervalMs);
  }

  private async processQueuedMissions(): Promise<void> {
    const { data: idleWorkers } = await supabase
      .from("workers")
      .select("*")
      .eq("status", "idle")
      .eq("active", true);

    if (!idleWorkers || idleWorkers.length === 0) return;

    for (const worker of idleWorkers) {
      if (!this.isRunning) break;

      const { data: mission, error } = await supabase.rpc("allocate_mission_to_worker", {
        p_worker_id: worker.id,
      });

      if (error || !mission) {
        continue;
      }

      console.log(`[MissionManager] Assigned mission ${mission.id} to worker ${worker.id}`);

      await this.logMissionEvent(mission.id, "MISSION_ASSIGNED", `Assigned to worker ${worker.id}`, 0);

      await eventBus.emit("mission:assigned", {
        missionId: mission.id,
        workerId: worker.id,
      });
    }
  }

  private async handleScrapeComplete(missionId: string, dataUrl: string, adsCount: number, sessionId: string): Promise<void> {
    await supabase
      .from("missions")
      .update({
        session_id: null,
        ads_count: adsCount,
        worker_data_url: dataUrl,
      })
      .eq("id", missionId);

    if (sessionId) {
      await eventBus.emit("session:end_requested", { sessionId });
    }

    await this.startWriter(missionId, dataUrl);
  }

  private async handleScrapeFailed(missionId: string, error: string, errorCode: string, sessionId: string): Promise<void> {
    if (sessionId) {
      await eventBus.emit("session:end_requested", { sessionId });
    }

    const { data: mission } = await supabase
      .from("missions")
      .select("retry_count")
      .eq("id", missionId)
      .single();

    const retryCount = (mission?.retry_count || 0) + 1;

    if (retryCount < this.config.maxMissionRetries) {
      console.log(`[MissionManager] Retrying mission ${missionId} (attempt ${retryCount})`);
      
      await supabase
        .from("missions")
        .update({
          status: "QUEUED",
          checkpoint: null,
          retry_count: retryCount,
          worker_id: null,
          session_id: null,
          worker_job_id: null,
          error_code: null,
          error_message: null,
        })
        .eq("id", missionId);

      await this.logMissionEvent(missionId, "MISSION_RETRY", `Retry ${retryCount} after: ${error}`, 0);
    } else {
      await eventBus.emit("mission:failed", {
        missionId,
        error,
        errorCode,
      });
    }
  }

  private async handleSessionFailed(missionId: string): Promise<void> {
    const { data: mission } = await supabase
      .from("missions")
      .select("retry_count")
      .eq("id", missionId)
      .single();

    const retryCount = (mission?.retry_count || 0) + 1;

    if (retryCount < this.config.maxMissionRetries) {
      console.log(`[MissionManager] Retrying mission ${missionId} after session failure (attempt ${retryCount})`);
      
      await supabase
        .from("missions")
        .update({
          status: "QUEUED",
          checkpoint: null,
          retry_count: retryCount,
          worker_id: null,
          session_id: null,
        })
        .eq("id", missionId);

      await this.logMissionEvent(missionId, "MISSION_RETRY", `Retry ${retryCount} after session failure`, 0);
    } else {
      await supabase
        .from("missions")
        .update({
          status: "FAILED",
          error_code: "ERROR103",
          error_message: "Max session retries exceeded",
          finished_at: new Date().toISOString(),
        })
        .eq("id", missionId);

      await eventBus.emit("mission:failed", {
        missionId,
        error: "Max session retries exceeded",
        errorCode: "ERROR103",
      });
    }
  }

  private async startWriter(missionId: string, dataUrl: string): Promise<void> {
    console.log(`[MissionManager] Starting writer for mission ${missionId}`);

    const { data: writers } = await supabase
      .from("writers")
      .select("*")
      .eq("is_active", true)
      .limit(1);

    if (!writers || writers.length === 0) {
      console.log(`[MissionManager] No active writers available, marking mission complete without writer`);
      await this.completeMission(missionId);
      return;
    }

    const writer = writers[0] as Writer;

    const writerPayload = {
      data_url: dataUrl,
      mission_id: missionId,
    };

    try {
      const response = await fetch(`${writer.url}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": writer.api_key,
        },
        body: JSON.stringify(writerPayload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const jobId = data.job_id;

      await supabase
        .from("missions")
        .update({
          checkpoint: "ARMAZENANDO",
          writer_job_id: jobId,
        })
        .eq("id", missionId);

      this.activeWriters.set(missionId, {
        missionId,
        jobId,
        startTime: Date.now(),
      });

      await this.logMissionEvent(missionId, "WRITER_STARTED", `Job ${jobId} started`, 0);

      await eventBus.emit("writer:started", { missionId, jobId });

    } catch (error) {
      console.error(`[MissionManager] Failed to start writer:`, error);
      await this.completeMission(missionId);
    }
  }

  private async monitorWriters(): Promise<void> {
    const { data: writingMissions } = await supabase
      .from("missions")
      .select("*")
      .eq("status", "RUNNING")
      .eq("checkpoint", "ARMAZENANDO");

    if (!writingMissions || writingMissions.length === 0) return;

    for (const mission of writingMissions) {
      if (!this.isRunning) break;
      await this.checkWriterStatus(mission as Mission);
    }
  }

  private async checkWriterStatus(mission: Mission): Promise<void> {
    if (!mission.writer_job_id) {
      await this.completeMission(mission.id);
      return;
    }

    const cached = this.activeWriters.get(mission.id);
    const startTime = cached?.startTime || Date.now();
    const elapsed = Date.now() - startTime;

    if (elapsed > this.config.writerTimeoutMs) {
      console.log(`[MissionManager] Writer for mission ${mission.id} timed out, completing anyway`);
      await this.completeMission(mission.id);
      return;
    }

    const { data: writers } = await supabase
      .from("writers")
      .select("*")
      .eq("is_active", true)
      .limit(1);

    if (!writers || writers.length === 0) {
      await this.completeMission(mission.id);
      return;
    }

    const writer = writers[0] as Writer;

    try {
      const response = await fetch(`${writer.url}/status?job_id=${mission.writer_job_id}`, {
        method: "GET",
        headers: { "x-api-key": writer.api_key },
      });

      if (!response.ok) return;

      const data = await response.json();
      const status = data.status;

      if (status === "completed" || status === "done") {
        await this.completeMission(mission.id);
      } else if (status === "failed" || status === "error") {
        console.log(`[MissionManager] Writer failed for mission ${mission.id}, completing anyway`);
        await this.completeMission(mission.id);
      }

    } catch (error) {
      console.error(`[MissionManager] Error checking writer status:`, error);
    }
  }

  private async completeMission(missionId: string): Promise<void> {
    console.log(`[MissionManager] Completing mission ${missionId}`);

    this.activeWriters.delete(missionId);

    const { data: mission } = await supabase
      .from("missions")
      .select("ads_count")
      .eq("id", missionId)
      .single();

    await supabase
      .from("missions")
      .update({
        status: "DONE",
        checkpoint: "FINALIZADO",
        finished_at: new Date().toISOString(),
      })
      .eq("id", missionId);

    await this.logMissionEvent(missionId, "MISSION_COMPLETE", `Mission completed with ${mission?.ads_count || 0} ads`, 0);

    await eventBus.emit("mission:complete", {
      missionId,
      adsCount: mission?.ads_count || 0,
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

  getStatus(): { isRunning: boolean; activeWriters: number } {
    return {
      isRunning: this.isRunning,
      activeWriters: this.activeWriters.size,
    };
  }
}
