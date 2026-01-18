import { supabase } from "../supabase";
import { eventBus } from "./EventBus";
import { SessionManager } from "./SessionManager";
import { WorkerManager } from "./WorkerManager";
import { MissionManager } from "./MissionManager";
import { OrchestratorConfig, DEFAULT_CONFIG } from "./types";

export class OrchestratorController {
  private sessionManager: SessionManager;
  private workerManager: WorkerManager;
  private missionManager: MissionManager;
  private isRunning = false;
  private config: OrchestratorConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.sessionManager = new SessionManager(this.config);
    this.workerManager = new WorkerManager(this.config);
    this.missionManager = new MissionManager(this.config);
  }

  async loadConfigFromDatabase(): Promise<void> {
    const { data: configRows } = await supabase
      .from("config")
      .select("*");

    if (configRows) {
      const configMap: Record<string, any> = {};
      configRows.forEach((c: any) => { configMap[c.key] = c.value; });

      if (configMap.polling_interval_seconds) {
        this.config.workerPollingIntervalMs = configMap.polling_interval_seconds * 1000;
        this.config.missionPollingIntervalMs = configMap.polling_interval_seconds * 1000;
        this.config.sessionPollingIntervalMs = Math.min(5000, configMap.polling_interval_seconds * 1000);
      }
      if (configMap.session_timeout_seconds) {
        this.config.sessionTimeoutMs = configMap.session_timeout_seconds * 1000;
      }
      if (configMap.scrape_timeout_seconds) {
        this.config.scrapeTimeoutMs = configMap.scrape_timeout_seconds * 1000;
      }
    }

    console.log("[OrchestratorController] Config loaded:", this.config);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[OrchestratorController] Already running");
      return;
    }

    console.log("[OrchestratorController] Starting orchestrator...");
    
    await this.loadConfigFromDatabase();

    this.sessionManager = new SessionManager(this.config);
    this.workerManager = new WorkerManager(this.config);
    this.missionManager = new MissionManager(this.config);

    await this.sessionManager.start();
    await this.workerManager.start();
    await this.missionManager.start();

    this.isRunning = true;

    await eventBus.emit("orchestrator:started", {});

    console.log("[OrchestratorController] Orchestrator started successfully");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log("[OrchestratorController] Not running");
      return;
    }

    console.log("[OrchestratorController] Stopping orchestrator...");

    this.missionManager.stop();
    this.workerManager.stop();
    this.sessionManager.stop();

    this.isRunning = false;

    await eventBus.emit("orchestrator:stopped", {});

    console.log("[OrchestratorController] Orchestrator stopped");
  }

  async cancelMission(missionId: string): Promise<void> {
    console.log(`[OrchestratorController] Cancelling mission ${missionId}`);

    const { data: mission } = await supabase
      .from("missions")
      .select("*")
      .eq("id", missionId)
      .single();

    if (!mission) {
      throw new Error("Mission not found");
    }

    if (mission.session_id) {
      await this.sessionManager.endSession(mission.session_id);
    }

    await supabase
      .from("missions")
      .update({
        status: "FAILED",
        error_code: "CANCELLED",
        error_message: "Cancelado pelo usuário",
        finished_at: new Date().toISOString(),
      })
      .eq("id", missionId);

    if (mission.worker_id) {
      await supabase
        .from("workers")
        .update({ status: "idle" })
        .eq("id", mission.worker_id);
    }

    await supabase.from("mission_logs").insert({
      mission_id: missionId,
      event: "CANCELLED",
      details: "Cancelado pelo usuário",
    });
  }

  getStatus(): {
    isRunning: boolean;
    sessionManager: ReturnType<SessionManager["getStatus"]>;
    workerManager: ReturnType<WorkerManager["getStatus"]>;
    missionManager: ReturnType<MissionManager["getStatus"]>;
    eventHistory: ReturnType<typeof eventBus.getHistory>;
  } {
    return {
      isRunning: this.isRunning,
      sessionManager: this.sessionManager.getStatus(),
      workerManager: this.workerManager.getStatus(),
      missionManager: this.missionManager.getStatus(),
      eventHistory: eventBus.getHistory(50),
    };
  }
}

export const orchestratorController = new OrchestratorController();

export { eventBus } from "./EventBus";
export { SessionManager } from "./SessionManager";
export { WorkerManager } from "./WorkerManager";
export { MissionManager } from "./MissionManager";
export * from "./types";
