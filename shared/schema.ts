import { z } from "zod";

export const MissionStatus = {
  PENDING: "PENDING",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  DONE: "DONE",
  FAILED: "FAILED",
} as const;

export type MissionStatusType = (typeof MissionStatus)[keyof typeof MissionStatus];

export const Checkpoint = {
  ATRIBUIDO: "ATRIBUIDO",
  EXTRAINDO: "EXTRAINDO",
  ARMAZENANDO: "ARMAZENANDO",
  FINALIZADO: "FINALIZADO",
} as const;

export type CheckpointType = (typeof Checkpoint)[keyof typeof Checkpoint];

export const WorkerStatus = {
  IDLE: "idle",
  INITIALIZING: "initializing",
  READY: "ready",
  SCRAPING: "scraping",
  ERROR: "error",
} as const;

export type WorkerStatusType = (typeof WorkerStatus)[keyof typeof WorkerStatus];

export const SessionStatus = {
  CREATING: "CREATING",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  ACTIVE: "ACTIVE",
  ENDING: "ENDING",
  ENDED: "ENDED",
  ERROR: "ERROR",
  TIMEOUT: "TIMEOUT",
} as const;

export type SessionStatusType = (typeof SessionStatus)[keyof typeof SessionStatus];

export const MediaType = {
  ALL: "all",
  VIDEO: "video",
  IMAGE: "image",
} as const;

export type MediaTypeValue = (typeof MediaType)[keyof typeof MediaType];

export interface Mission {
  id: string;
  date_start: string;
  date_end: string;
  media_type: MediaTypeValue;
  languages: string[];
  status: MissionStatusType;
  checkpoint: CheckpointType | null;
  ads_count: number | null;
  error_code: string | null;
  error_message: string | null;
  worker_id: string | null;
  session_id: string | null;
  worker_job_id: string | null;
  writer_job_id: string | null;
  worker_data_url: string | null;
  proxy_used: string | null;
  retry_count: number;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface MissionLog {
  id: string;
  mission_id: string;
  timestamp: string;
  event: string;
  details: Record<string, unknown> | null;
}

export interface Worker {
  id: string;
  name: string;
  url: string;
  api_key: string;
  storage_domain: string | null;
  status: WorkerStatusType;
  session_count: number;
  active: boolean;
  current_mission_id: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Writer {
  id: string;
  name: string;
  url: string;
  api_key: string;
  active: boolean;
  current_mission_id: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Uploader {
  id: string;
  name: string;
  url: string;
  api_key: string;
  active: boolean;
  current_mission_id: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface Proxy {
  id: string;
  name: string | null;
  host: string;
  port: number | null;
  username: string | null;
  password: string | null;
  active: boolean;
  in_use_by_session_id: string | null;
  in_use_by_worker_id: string | null;
  fail_count: number;
  last_used_at: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  created_at: string;
}

export interface Session {
  id: string;
  worker_id: string;
  proxy_id: string | null;
  external_session_id: string | null;
  status: SessionStatusType;
  current_phase: string | null;
  execution_count: number;
  execution_limit: number;
  failure_count: number;
  last_error_code: string | null;
  last_error_message: string | null;
  current_mission_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  ended_at: string | null;
}

export interface Config {
  key: string;
  value: Record<string, unknown>;
  updated_at: string;
}

export interface StorageDbConfig {
  connection_string: string;
}

export interface StorageS3Config {
  bucket: string;
  region: string;
  access_key: string;
  secret_key: string;
}

export interface ExecutionConfig {
  refresh_interval: number;
  auto_retry: boolean;
  max_retries: number;
  timeout_session: number;
  timeout_job: number;
}

export const insertMissionSchema = z.object({
  date_start: z.string(),
  date_end: z.string(),
  media_type: z.enum(["all", "video", "image"]),
  languages: z.array(z.string()).min(1),
});

export type InsertMission = z.infer<typeof insertMissionSchema>;

export const bulkMissionSchema = z.object({
  date_start: z.string(),
  date_end: z.string(),
  media_type: z.enum(["all", "video", "image"]),
  languages: z.array(z.string()).min(1),
});

export type BulkMissionInput = z.infer<typeof bulkMissionSchema>;

export const importMissionItemSchema = z.object({
  start_date: z.string().optional(),
  date_start: z.string().optional(),
  end_date: z.string().optional(),
  date_end: z.string().optional(),
  media: z.string().optional(),
  media_type: z.string().optional(),
  lang: z.string().optional(),
  languages: z.union([z.string(), z.array(z.string())]).optional(),
}).refine(data => data.start_date || data.date_start, {
  message: "start_date or date_start is required"
});

export const importMissionsSchema = z.object({
  missions: z.array(importMissionItemSchema).min(1),
});

export type ImportMissionsInput = z.infer<typeof importMissionsSchema>;

export const insertWorkerSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  api_key: z.string().min(1),
});

export type InsertWorker = z.infer<typeof insertWorkerSchema>;

export const insertWriterSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  api_key: z.string().min(1),
});

export type InsertWriter = z.infer<typeof insertWriterSchema>;

export const insertUploaderSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  api_key: z.string().min(1),
});

export type InsertUploader = z.infer<typeof insertUploaderSchema>;

export const insertProxySchema = z.object({
  name: z.string().optional(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type InsertProxy = z.infer<typeof insertProxySchema>;

export const queueMissionsSchema = z.object({
  mission_ids: z.array(z.string()).optional(),
  filters: z.object({
    date_start: z.string().optional(),
    date_end: z.string().optional(),
    media_type: z.enum(["all", "video", "image"]).optional(),
    status: z.array(z.enum(["PENDING", "QUEUED", "RUNNING", "DONE", "FAILED"])).optional(),
    languages: z.array(z.string()).optional(),
    limit: z.number().optional(),
  }).optional(),
  worker_ids: z.array(z.string()).optional(),
});

export type QueueMissionsInput = z.infer<typeof queueMissionsSchema>;

export interface MissionSummary {
  total: number;
  pending: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
}

export interface ExecutionStatus {
  is_running: boolean;
  workers: {
    id: string;
    name: string;
    status: "idle" | "running";
    current_mission: Mission | null;
    session: {
      id: string;
      status: SessionStatusType;
      execution_count: number;
      execution_limit: number;
      proxy_id: string | null;
      proxy_name: string | null;
      created_at: string;
      ready_at: string | null;
    } | null;
    jobs_in_session?: number;
    session_limit?: number;
    jobs_today?: number;
    ads_today?: number;
    failures_today?: number;
  }[];
  queue: {
    total: number;
    missions: Mission[];
  };
  stats: {
    running: number;
    queued: number;
    completed_today: number;
    failed_today: number;
    missions_today: number;
  };
}

export interface MissionWithLogs extends Mission {
  logs: MissionLog[];
  checkpoint_progress: {
    atribuido: "pending" | "running" | "done" | "failed";
    extraindo: "pending" | "running" | "done" | "failed";
    armazenando: "pending" | "running" | "done" | "failed";
  };
}

export type ViewId = "dashboard" | "missions" | "control" | "settings";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { id: "missions", label: "Banco de Missões", icon: "Database" },
  { id: "control", label: "Mission Control", icon: "Rocket" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

export type User = {
  id: string;
  username: string;
  password: string;
};

export type InsertUser = Omit<User, "id">;
