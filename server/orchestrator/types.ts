import type { Mission, Worker, Proxy, Session, Writer } from "../../shared/schema";

export type SessionStatus = "CREATING" | "INITIALIZING" | "READY" | "ACTIVE" | "ERROR" | "ENDED";
export type WorkerStatus = "idle" | "waiting_session" | "ready" | "scraping" | "error";
export type MissionCheckpoint = "ATRIBUIDO" | "EXTRAINDO" | "ARMAZENANDO" | "FINALIZADO";

export interface SessionState {
  id: string;
  workerId: string;
  proxyId: string;
  status: SessionStatus;
  currentPhase: string;
  failureCount: number;
  retryCount: number;
  createdAt: Date;
}

export interface WorkerState {
  id: string;
  status: WorkerStatus;
  currentSessionId: string | null;
  currentMissionId: string | null;
}

export interface MissionState {
  id: string;
  workerId: string | null;
  sessionId: string | null;
  checkpoint: MissionCheckpoint | null;
  retryCount: number;
}

export interface EventPayloads {
  "session:ready": { sessionId: string; workerId: string };
  "session:error": { sessionId: string; workerId: string; proxyId: string; error: string; errorCode: string };
  "session:end_requested": { sessionId: string };
  "session:terminated": { sessionId: string; proxyId: string };
  
  "worker:request_session": { workerId: string; missionId: string; proxyId?: string };
  "worker:session_failed": { workerId: string; missionId: string; error: string };
  "worker:idle": { workerId: string };
  
  "scrape:started": { missionId: string; workerId: string; jobId: string };
  "scrape:progress": { missionId: string; adsScraped: number };
  "scrape:complete": { missionId: string; workerId: string; sessionId: string; dataUrl: string; adsCount: number };
  "scrape:failed": { missionId: string; workerId: string; sessionId: string; error: string; errorCode: string };
  
  "mission:queued": { missionId: string };
  "mission:assigned": { missionId: string; workerId: string };
  "mission:complete": { missionId: string; adsCount: number };
  "mission:failed": { missionId: string; error: string; errorCode: string };
  
  "writer:started": { missionId: string; jobId: string };
  "writer:complete": { missionId: string };
  "writer:failed": { missionId: string; error: string };
  
  "orchestrator:started": {};
  "orchestrator:stopped": {};
}

export type EventName = keyof EventPayloads;

export interface OrchestratorConfig {
  sessionPollingIntervalMs: number;
  workerPollingIntervalMs: number;
  missionPollingIntervalMs: number;
  sessionTimeoutMs: number;
  scrapeTimeoutMs: number;
  writerTimeoutMs: number;
  maxSessionRetries: number;
  maxMissionRetries: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  sessionPollingIntervalMs: 5000,
  workerPollingIntervalMs: 10000,
  missionPollingIntervalMs: 10000,
  sessionTimeoutMs: 180000,
  scrapeTimeoutMs: 600000,
  writerTimeoutMs: 300000,
  maxSessionRetries: 2,
  maxMissionRetries: 3,
  maxConsecutiveFailures: 3,
};
