# MISSION CONTROL - Especificação Técnica Completa
## Sistema de Orquestração de Scrape e Persistência

**Versão:** 1.0  
**Data:** Janeiro 2025  
**Status:** Pronto para Implementação

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura do Sistema](#2-arquitetura-do-sistema)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Modelo de Dados](#4-modelo-de-dados)
5. [API REST - Endpoints](#5-api-rest---endpoints)
6. [Lógica de Negócio](#6-lógica-de-negócio)
7. [Interface do Usuário](#7-interface-do-usuário)
8. [Fluxos de Execução](#8-fluxos-de-execução)
9. [Integração com Worker Externo](#9-integração-com-worker-externo)
10. [Códigos de Erro](#10-códigos-de-erro)
11. [Configurações Padrão](#11-configurações-padrão)
12. [Checklist de Implementação](#12-checklist-de-implementação)

---

## 1. Visão Geral

### 1.1 O que é o Mission Control

Sistema de orquestração que gerencia processos de scrape de dados e sua persistência em banco de dados e storage S3. O sistema coordena workers externos, gerencia proxies, monitora execuções e garante a completude do pipeline de dados.

### 1.2 Conceito Central

Cada unidade de trabalho é uma **Missão**. Uma missão representa a extração de dados de um período específico com parâmetros definidos (tipo de mídia, idiomas). Cada missão passa por 3 checkpoints sequenciais:

```
MISSÃO
   │
   ▼
┌──────────┐      ┌──────────┐      ┌──────────┐
│  SCRAPE  │─────►│    DB    │─────►│    S3    │
│          │      │          │      │  (JSON)  │
└──────────┘      └──────────┘      └──────────┘
     │                 │                 │
     ▼                 ▼                 ▼
 Extrai dados    Persiste no       Salva JSON
 via worker      banco de dados    para auditoria
```

**Regra crítica:** Se um checkpoint falha, os subsequentes não são executados.

### 1.3 Estrutura de Navegação

O sistema possui 3 telas principais:

| Tela                 | Rota        | Função                                          |
| -------------------- | ----------- | ----------------------------------------------- |
| **Banco de Missões** | `/missions` | Criar, importar e gerenciar pool de missões     |
| **Mission Control**  | `/control`  | Selecionar, executar e monitorar missões        |
| **Settings**         | `/settings` | Configurar workers, proxies, storage e execução |

---

## 2. Arquitetura do Sistema

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React/Next.js)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ Banco de Missões│  │ Mission Control │  │    Settings     │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ REST API
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND (Node.js/NestJS)                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Mission Service│  │ Execution Engine│  │  Config Service │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│  ┌─────────────────────────────┼─────────────────────────────────────────┐  │
│  │                    EXECUTION ENGINE                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │  │
│  │  │Queue Manager │  │Session Manager│  │Storage Manager│                │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└───────────┬─────────────────────┬─────────────────────┬─────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
     ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
     │  PostgreSQL │       │   Workers   │       │     S3      │
     │  (Supabase) │       │  (Externos) │       │   Storage   │
     └─────────────┘       └─────────────┘       └─────────────┘
```

### 2.2 Fluxo de Dados

```
1. CRIAÇÃO
   Usuário cria missões ──► Salva no PostgreSQL (status: pending)

2. SELEÇÃO
   Usuário seleciona missões ──► Atualiza status para queued

3. EXECUÇÃO
   Worker disponível ──► Pega próxima missão queued ──► status: running

4. PIPELINE
   SCRAPE: Worker executa ──► Retorna dados JSON
   DB: Processa e persiste ──► Salva registros
   S3: Upload JSON ──► Salva para auditoria

5. CONCLUSÃO
   Sucesso ──► status: done
   Falha ──► status: failed (com checkpoint e erro)
```

---

## 3. Stack Tecnológico

### 3.1 Stack Recomendado

| Camada             | Tecnologia                                    | Justificativa                                 |
| ------------------ | --------------------------------------------- | --------------------------------------------- |
| **Frontend**       | Next.js 14+ (App Router)                      | SSR, API routes integradas, TypeScript nativo |
| **UI Components**  | shadcn/ui + Tailwind CSS                      | Componentes acessíveis, customizáveis         |
| **Backend**        | Next.js API Routes ou NestJS                  | Simplicidade ou escalabilidade                |
| **Banco de Dados** | PostgreSQL (Supabase)                         | Confiável, já disponível no contexto          |
| **ORM**            | Prisma ou Drizzle                             | Type-safe, migrações automáticas              |
| **Storage**        | Cloudflare R2 (storage s3) / Supabase Storage | Escalável, baixo custo                        |
| **Queue**          | Bull (Redis) ou DB-based                      | Gerenciamento de fila de execução             |
| **Estado**         | Zustand ou React Query                        | Gerenciamento de estado cliente               |

### 3.2 Estrutura de Pastas (Next.js)

```
mission-control/
├── app/
│   ├── layout.tsx                 # Layout principal com navegação
│   ├── page.tsx                   # Redirect para /missions
│   ├── missions/
│   │   └── page.tsx               # Tela: Banco de Missões
│   ├── control/
│   │   └── page.tsx               # Tela: Mission Control
│   ├── settings/
│   │   └── page.tsx               # Tela: Settings
│   └── api/
│       ├── missions/
│       │   ├── route.ts           # GET (list), POST (create)
│       │   ├── [id]/
│       │   │   └── route.ts       # GET, PATCH, DELETE
│       │   ├── bulk/
│       │   │   └── route.ts       # POST (bulk create)
│       │   ├── import/
│       │   │   └── route.ts       # POST (CSV import)
│       │   └── queue/
│       │       └── route.ts       # POST (add to queue)
│       ├── workers/
│       │   ├── route.ts           # CRUD workers
│       │   └── [id]/
│       │       ├── route.ts
│       │       └── test/
│       │           └── route.ts   # POST (test connection)
│       ├── proxies/
│       │   ├── route.ts           # CRUD proxies
│       │   └── test/
│       │       └── route.ts       # POST (test all)
│       ├── config/
│       │   └── route.ts           # GET, PATCH config
│       ├── execution/
│       │   ├── start/
│       │   │   └── route.ts       # POST (start execution)
│       │   ├── stop/
│       │   │   └── route.ts       # POST (stop execution)
│       │   └── status/
│       │       └── route.ts       # GET (current status)
│       └── storage/
│           └── test/
│               └── route.ts       # POST (test connections)
├── components/
│   ├── ui/                        # shadcn components
│   ├── missions/
│   │   ├── MissionTable.tsx
│   │   ├── CreateMissionsModal.tsx
│   │   ├── ImportCSVModal.tsx
│   │   └── MissionFilters.tsx
│   ├── control/
│   │   ├── ExecutionQueue.tsx
│   │   ├── SelectMissionsModal.tsx
│   │   ├── MissionDetails.tsx
│   │   ├── WorkerStatus.tsx
│   │   └── ProgressIndicator.tsx
│   └── settings/
│       ├── WorkersSection.tsx
│       ├── ProxiesSection.tsx
│       ├── StorageSection.tsx
│       └── ExecutionSection.tsx
├── lib/
│   ├── db.ts                      # Prisma client
│   ├── s3.ts                      # S3 client
│   ├── worker-client.ts           # Worker API client
│   ├── execution-engine.ts        # Core execution logic
│   ├── queue-manager.ts           # Queue management
│   └── utils.ts                   # Helpers
├── types/
│   └── index.ts                   # TypeScript types
├── prisma/
│   └── schema.prisma              # Database schema
└── package.json
```

---

## 4. Modelo de Dados

### 4.1 Schema Prisma

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================
// MISSÕES
// ============================================

model Mission {
  id              String    @id @default(uuid())
  
  // Parâmetros da missão
  dateStart       DateTime  @map("date_start") @db.Date
  dateEnd         DateTime  @map("date_end") @db.Date
  mediaType       String    @map("media_type") // all, video, image
  languages       String[]  // ["pt", "eng", "spa"]
  
  // Status e checkpoint
  status          MissionStatus @default(PENDING)
  checkpoint      Checkpoint?
  
  // Resultados
  adsCount        Int?      @map("ads_count")
  errorCode       String?   @map("error_code")
  errorMessage    String?   @map("error_message")
  
  // Execução
  workerId        String?   @map("worker_id")
  worker          Worker?   @relation(fields: [workerId], references: [id])
  jobId           String?   @map("job_id")
  proxyUsed       String?   @map("proxy_used")
  retryCount      Int       @default(0) @map("retry_count")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  queuedAt        DateTime? @map("queued_at")
  startedAt       DateTime? @map("started_at")
  finishedAt      DateTime? @map("finished_at")
  
  // Logs
  logs            MissionLog[]
  
  @@map("missions")
  @@index([status])
  @@index([dateStart, dateEnd])
}

enum MissionStatus {
  PENDING   // Criada, disponível para seleção
  QUEUED    // Na fila de execução
  RUNNING   // Executando
  DONE      // Concluída com sucesso
  FAILED    // Falhou
}

enum Checkpoint {
  SCRAPE    // Executando/falhou no scrape
  DB        // Executando/falhou no DB
  S3        // Executando/falhou no S3
}

model MissionLog {
  id          String   @id @default(uuid())
  missionId   String   @map("mission_id")
  mission     Mission  @relation(fields: [missionId], references: [id], onDelete: Cascade)
  timestamp   DateTime @default(now())
  event       String   // Tipo do evento
  details     Json?    // Detalhes adicionais
  
  @@map("mission_logs")
  @@index([missionId])
}

// ============================================
// WORKERS
// ============================================

model Worker {
  id              String    @id @default(uuid())
  name            String
  url             String
  apiKey          String    @map("api_key")
  active          Boolean   @default(true)
  
  // Status atual
  currentMissionId String?  @unique @map("current_mission_id")
  
  // Testes
  lastTestAt      DateTime? @map("last_test_at")
  lastTestOk      Boolean?  @map("last_test_ok")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  
  // Relações
  missions        Mission[]
  
  @@map("workers")
}

// ============================================
// PROXIES
// ============================================

model Proxy {
  id              String    @id @default(uuid())
  server          String    // host:port
  username        String?
  password        String?
  active          Boolean   @default(true)
  
  // Métricas
  failCount       Int       @default(0) @map("fail_count")
  lastUsedAt      DateTime? @map("last_used_at")
  
  // Testes
  lastTestAt      DateTime? @map("last_test_at")
  lastTestOk      Boolean?  @map("last_test_ok")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  
  @@map("proxies")
}

// ============================================
// CONFIGURAÇÕES
// ============================================

model Config {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt @map("updated_at")
  
  @@map("config")
}
```

### 4.2 SQL de Migração (Alternativa)

```sql
-- Criar enums
CREATE TYPE mission_status AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE checkpoint AS ENUM ('SCRAPE', 'DB', 'S3');

-- Tabela: missions
CREATE TABLE missions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parâmetros
    date_start      DATE NOT NULL,
    date_end        DATE NOT NULL,
    media_type      VARCHAR(10) NOT NULL CHECK (media_type IN ('all', 'video', 'image')),
    languages       TEXT[] NOT NULL,
    
    -- Status
    status          mission_status NOT NULL DEFAULT 'PENDING',
    checkpoint      checkpoint,
    
    -- Resultados
    ads_count       INTEGER,
    error_code      VARCHAR(20),
    error_message   TEXT,
    
    -- Execução
    worker_id       UUID REFERENCES workers(id),
    job_id          VARCHAR(100),
    proxy_used      VARCHAR(200),
    retry_count     INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    queued_at       TIMESTAMP WITH TIME ZONE,
    started_at      TIMESTAMP WITH TIME ZONE,
    finished_at     TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_dates ON missions(date_start, date_end);

-- Tabela: mission_logs
CREATE TABLE mission_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id  UUID NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    timestamp   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event       VARCHAR(50) NOT NULL,
    details     JSONB
);

CREATE INDEX idx_mission_logs_mission ON mission_logs(mission_id);

-- Tabela: workers
CREATE TABLE workers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(100) NOT NULL,
    url                 VARCHAR(500) NOT NULL,
    api_key             VARCHAR(200) NOT NULL,
    active              BOOLEAN DEFAULT true,
    current_mission_id  UUID UNIQUE,
    last_test_at        TIMESTAMP WITH TIME ZONE,
    last_test_ok        BOOLEAN,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: proxies
CREATE TABLE proxies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server          VARCHAR(200) NOT NULL,
    username        VARCHAR(100),
    password        VARCHAR(100),
    active          BOOLEAN DEFAULT true,
    fail_count      INTEGER DEFAULT 0,
    last_used_at    TIMESTAMP WITH TIME ZONE,
    last_test_at    TIMESTAMP WITH TIME ZONE,
    last_test_ok    BOOLEAN,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela: config
CREATE TABLE config (
    key         VARCHAR(50) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Configurações iniciais
INSERT INTO config (key, value) VALUES 
    ('storage_db', '{"connection_string": ""}'),
    ('storage_s3', '{"bucket": "", "region": "", "access_key": "", "secret_key": ""}'),
    ('execution', '{"refresh_interval": 5, "auto_retry": true, "max_retries": 2, "timeout_session": 180, "timeout_job": 100}');
```

### 4.3 TypeScript Types

```typescript
// types/index.ts

// ============================================
// ENUMS
// ============================================

export enum MissionStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  FAILED = 'FAILED'
}

export enum Checkpoint {
  SCRAPE = 'SCRAPE',
  DB = 'DB',
  S3 = 'S3'
}

// ============================================
// ENTITIES
// ============================================

export interface Mission {
  id: string;
  dateStart: Date;
  dateEnd: Date;
  mediaType: 'all' | 'video' | 'image';
  languages: string[];
  status: MissionStatus;
  checkpoint: Checkpoint | null;
  adsCount: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  workerId: string | null;
  jobId: string | null;
  proxyUsed: string | null;
  retryCount: number;
  createdAt: Date;
  queuedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface MissionLog {
  id: string;
  missionId: string;
  timestamp: Date;
  event: string;
  details: Record<string, any> | null;
}

export interface Worker {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  active: boolean;
  currentMissionId: string | null;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Proxy {
  id: string;
  server: string;
  username: string | null;
  password: string | null;
  active: boolean;
  failCount: number;
  lastUsedAt: Date | null;
  lastTestAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
}

export interface Config {
  storage_db: {
    connection_string: string;
  };
  storage_s3: {
    bucket: string;
    region: string;
    access_key: string;
    secret_key: string;
  };
  execution: {
    refresh_interval: number;
    auto_retry: boolean;
    max_retries: number;
    timeout_session: number;
    timeout_job: number;
  };
}

// ============================================
// DTOs - CREATE
// ============================================

export interface CreateMissionDTO {
  dateStart: string; // YYYY-MM-DD
  dateEnd: string;
  mediaType: 'all' | 'video' | 'image';
  languages: string[];
}

export interface CreateMissionsBulkDTO {
  dateStart: string;
  dateEnd: string;
  mediaType: 'all' | 'video' | 'image';
  languages: string[];
  // Sistema gera uma missão por dia no intervalo
}

export interface CreateWorkerDTO {
  name: string;
  url: string;
  apiKey: string;
}

export interface CreateProxyDTO {
  server: string;
  username?: string;
  password?: string;
}

// ============================================
// DTOs - FILTER/QUERY
// ============================================

export interface MissionFilters {
  dateStart?: string;
  dateEnd?: string;
  mediaType?: 'all' | 'video' | 'image';
  languages?: string[];
  status?: MissionStatus | MissionStatus[];
  limit?: number;
  offset?: number;
}

export interface SelectMissionsDTO {
  filters: MissionFilters;
  workerIds: string[];
}

// ============================================
// DTOs - RESPONSE
// ============================================

export interface MissionWithProgress extends Mission {
  checkpointProgress: {
    scrape: 'pending' | 'running' | 'done' | 'failed';
    db: 'pending' | 'running' | 'done' | 'failed';
    s3: 'pending' | 'running' | 'done' | 'failed';
  };
}

export interface ExecutionStatus {
  isRunning: boolean;
  workers: {
    id: string;
    name: string;
    status: 'idle' | 'running';
    currentMission: Mission | null;
  }[];
  queue: {
    total: number;
    missions: Mission[];
  };
  stats: {
    running: number;
    queued: number;
    completedToday: number;
    failedToday: number;
  };
}

export interface MissionSummary {
  total: number;
  pending: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
}
```

---

## 5. API REST - Endpoints

### 5.1 Missões

#### GET /api/missions
Lista missões com filtros e paginação.

**Query Parameters:**
| Param     | Tipo   | Descrição                                                                |
| --------- | ------ | ------------------------------------------------------------------------ |
| dateStart | string | Filtrar por data início >=                                               |
| dateEnd   | string | Filtrar por data fim <=                                                  |
| mediaType | string | all, video, image                                                        |
| languages | string | Separado por vírgula: pt,eng                                             |
| status    | string | PENDING, QUEUED, RUNNING, DONE, FAILED (múltiplos separados por vírgula) |
| limit     | number | Padrão: 50                                                               |
| offset    | number | Padrão: 0                                                                |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "dateStart": "2025-01-01",
      "dateEnd": "2025-01-01",
      "mediaType": "video",
      "languages": ["pt"],
      "status": "PENDING",
      "checkpoint": null,
      "adsCount": null,
      "errorCode": null,
      "errorMessage": null,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 365,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  },
  "summary": {
    "total": 365,
    "pending": 280,
    "queued": 0,
    "running": 0,
    "done": 80,
    "failed": 5
  }
}
```

#### POST /api/missions
Cria uma única missão.

**Body:**
```json
{
  "dateStart": "2025-01-01",
  "dateEnd": "2025-01-01",
  "mediaType": "video",
  "languages": ["pt"]
}
```

**Response:** 201 Created
```json
{
  "id": "uuid",
  "dateStart": "2025-01-01",
  "dateEnd": "2025-01-01",
  "mediaType": "video",
  "languages": ["pt"],
  "status": "PENDING",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

#### POST /api/missions/bulk
Cria missões em lote (uma por dia no intervalo).

**Body:**
```json
{
  "dateStart": "2025-01-01",
  "dateEnd": "2025-12-31",
  "mediaType": "video",
  "languages": ["pt"]
}
```

**Response:** 201 Created
```json
{
  "created": 365,
  "message": "365 missões criadas com sucesso"
}
```

#### POST /api/missions/import
Importa missões de arquivo CSV.

**Body:** multipart/form-data
- file: arquivo CSV

**Formato CSV:**
```csv
date_start,date_end,media_type,languages
2025-01-01,2025-01-01,video,pt
2025-01-02,2025-01-02,video,"pt,eng"
```

**Response:** 201 Created
```json
{
  "imported": 100,
  "errors": [
    { "line": 5, "error": "Invalid date format" }
  ]
}
```

#### POST /api/missions/queue
Adiciona missões selecionadas à fila de execução.

**Body:**
```json
{
  "filters": {
    "dateStart": "2025-01-01",
    "dateEnd": "2025-01-31",
    "status": ["PENDING", "FAILED"],
    "mediaType": "video",
    "limit": 50
  },
  "missionIds": ["uuid1", "uuid2"],  // Opcional: IDs específicos
  "workerIds": ["worker-uuid-1", "worker-uuid-2"]
}
```

**Lógica:**
1. Se `missionIds` fornecido, usa apenas esses IDs
2. Se não, aplica `filters` para selecionar missões
3. Atualiza status para QUEUED
4. Registra workerIds permitidos

**Response:** 200 OK
```json
{
  "queued": 31,
  "message": "31 missões adicionadas à fila"
}
```

#### GET /api/missions/[id]
Retorna detalhes de uma missão específica.

**Response:**
```json
{
  "id": "uuid",
  "dateStart": "2025-01-15",
  "dateEnd": "2025-01-15",
  "mediaType": "video",
  "languages": ["pt"],
  "status": "FAILED",
  "checkpoint": "DB",
  "adsCount": 1234,
  "errorCode": "ERROR302",
  "errorMessage": "Connection timeout",
  "workerId": "worker-uuid",
  "jobId": "job-abc123",
  "proxyUsed": "proxy1.example.com:8080",
  "retryCount": 2,
  "createdAt": "2025-01-01T00:00:00Z",
  "queuedAt": "2025-01-15T10:00:00Z",
  "startedAt": "2025-01-15T10:30:00Z",
  "finishedAt": "2025-01-15T10:33:18Z",
  "logs": [
    { "timestamp": "2025-01-15T10:30:00Z", "event": "STARTED", "details": null },
    { "timestamp": "2025-01-15T10:30:02Z", "event": "SESSION_CREATED", "details": { "proxy": "proxy1" } },
    { "timestamp": "2025-01-15T10:32:15Z", "event": "SCRAPE_COMPLETED", "details": { "adsCount": 1234 } },
    { "timestamp": "2025-01-15T10:32:46Z", "event": "DB_ERROR", "details": { "error": "Connection timeout" } },
    { "timestamp": "2025-01-15T10:33:18Z", "event": "FAILED", "details": { "checkpoint": "DB" } }
  ],
  "checkpointProgress": {
    "scrape": "done",
    "db": "failed",
    "s3": "pending"
  }
}
```

#### PATCH /api/missions/[id]
Atualiza uma missão (apenas PENDING pode ser editada).

**Body:**
```json
{
  "dateStart": "2025-01-02",
  "mediaType": "image"
}
```

#### DELETE /api/missions/[id]
Remove uma missão (apenas PENDING e FAILED podem ser removidas).

#### POST /api/missions/[id]/retry
Recoloca uma missão FAILED na fila.

**Response:**
```json
{
  "message": "Missão adicionada à fila para retry"
}
```

#### DELETE /api/missions/clear-done
Remove todas as missões com status DONE.

**Response:**
```json
{
  "deleted": 80
}
```

### 5.2 Workers

#### GET /api/workers
Lista todos os workers.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Worker Principal",
      "url": "https://worker1.example.com",
      "active": true,
      "currentMissionId": null,
      "lastTestAt": "2025-01-15T10:00:00Z",
      "lastTestOk": true
    }
  ]
}
```

#### POST /api/workers
Cria um novo worker.

**Body:**
```json
{
  "name": "Worker Principal",
  "url": "https://worker1.example.com",
  "apiKey": "secret-key-123"
}
```

#### PATCH /api/workers/[id]
Atualiza um worker.

#### DELETE /api/workers/[id]
Remove um worker (não pode estar executando missão).

#### POST /api/workers/[id]/test
Testa conexão com o worker.

**Response:**
```json
{
  "success": true,
  "message": "Conexão estabelecida",
  "responseTime": 145
}
```

### 5.3 Proxies

#### GET /api/proxies
Lista todos os proxies.

#### POST /api/proxies
Cria um novo proxy.

**Body:**
```json
{
  "server": "proxy1.example.com:8080",
  "username": "user1",
  "password": "pass123"
}
```

#### PATCH /api/proxies/[id]
Atualiza um proxy.

#### DELETE /api/proxies/[id]
Remove um proxy.

#### POST /api/proxies/[id]/test
Testa um proxy específico.

#### POST /api/proxies/test-all
Testa todos os proxies ativos.

**Response:**
```json
{
  "results": [
    { "id": "uuid1", "server": "proxy1.example.com:8080", "success": true },
    { "id": "uuid2", "server": "proxy2.example.com:8080", "success": false, "error": "Timeout" }
  ]
}
```

### 5.4 Config

#### GET /api/config
Retorna todas as configurações.

**Response:**
```json
{
  "storage_db": {
    "connection_string": "postgres://..."
  },
  "storage_s3": {
    "bucket": "my-bucket",
    "region": "us-east-1",
    "access_key": "AKIA...",
    "secret_key": "***"
  },
  "execution": {
    "refresh_interval": 5,
    "auto_retry": true,
    "max_retries": 2,
    "timeout_session": 180,
    "timeout_job": 100
  }
}
```

#### PATCH /api/config
Atualiza configurações.

**Body:**
```json
{
  "execution": {
    "refresh_interval": 10
  }
}
```

#### POST /api/config/test-db
Testa conexão com banco de dados de destino.

#### POST /api/config/test-s3
Testa conexão com S3.

### 5.5 Execution

#### GET /api/execution/status
Retorna status atual da execução.

**Response:**
```json
{
  "isRunning": true,
  "workers": [
    {
      "id": "uuid1",
      "name": "Worker 1",
      "status": "running",
      "currentMission": {
        "id": "mission-uuid",
        "dateStart": "2025-01-15",
        "checkpoint": "DB",
        "adsCount": 1234
      }
    },
    {
      "id": "uuid2",
      "name": "Worker 2",
      "status": "idle",
      "currentMission": null
    }
  ],
  "queue": {
    "total": 28,
    "missions": [
      { "id": "uuid", "dateStart": "2025-01-16", "status": "QUEUED" }
    ]
  },
  "stats": {
    "running": 1,
    "queued": 28,
    "completedToday": 12,
    "failedToday": 1
  }
}
```

#### POST /api/execution/start
Inicia a execução da fila.

**Response:**
```json
{
  "message": "Execução iniciada",
  "workersActive": 2
}
```

#### POST /api/execution/stop
Para a execução (não cancela missões em andamento).

**Response:**
```json
{
  "message": "Execução parada. Missões em andamento serão finalizadas."
}
```

#### POST /api/execution/cancel-mission/[id]
Cancela uma missão específica (remove da fila ou cancela execução).

---

## 6. Lógica de Negócio

### 6.1 Criação de Missões em Lote

```typescript
// lib/mission-service.ts

export async function createMissionsBulk(data: CreateMissionsBulkDTO): Promise<number> {
  const { dateStart, dateEnd, mediaType, languages } = data;
  
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const missions: Prisma.MissionCreateManyInput[] = [];
  
  // Gera uma missão para cada dia no intervalo
  const current = new Date(start);
  while (current <= end) {
    missions.push({
      dateStart: new Date(current),
      dateEnd: new Date(current),
      mediaType,
      languages,
      status: 'PENDING'
    });
    current.setDate(current.getDate() + 1);
  }
  
  // Insere em batch
  const result = await prisma.mission.createMany({
    data: missions,
    skipDuplicates: true // Evita duplicatas se já existir
  });
  
  return result.count;
}
```

### 6.2 Seleção e Enfileiramento de Missões

```typescript
// lib/queue-manager.ts

export async function queueMissions(dto: SelectMissionsDTO): Promise<number> {
  const { filters, workerIds } = dto;
  
  // Busca missões que atendem aos filtros
  const where: Prisma.MissionWhereInput = {
    status: { in: ['PENDING', 'FAILED'] }
  };
  
  if (filters.dateStart) {
    where.dateStart = { gte: new Date(filters.dateStart) };
  }
  if (filters.dateEnd) {
    where.dateEnd = { lte: new Date(filters.dateEnd) };
  }
  if (filters.mediaType) {
    where.mediaType = filters.mediaType;
  }
  if (filters.status) {
    where.status = { in: Array.isArray(filters.status) ? filters.status : [filters.status] };
  }
  
  // Atualiza status para QUEUED
  const result = await prisma.mission.updateMany({
    where,
    data: {
      status: 'QUEUED',
      queuedAt: new Date(),
      // Reset campos de execução anterior
      checkpoint: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0
    },
    take: filters.limit || 50
  });
  
  return result.count;
}
```

### 6.3 Motor de Execução

```typescript
// lib/execution-engine.ts

interface ExecutionEngineConfig {
  refreshInterval: number;  // Trocar sessão a cada N missões
  autoRetry: boolean;
  maxRetries: number;
  timeoutSession: number;   // segundos
  timeoutJob: number;       // minutos
}

class ExecutionEngine {
  private isRunning = false;
  private config: ExecutionEngineConfig;
  private missionCountPerSession: Map<string, number> = new Map();
  
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // Carrega configurações
    this.config = await this.loadConfig();
    
    // Inicia loop de processamento para cada worker ativo
    const workers = await prisma.worker.findMany({ where: { active: true } });
    
    for (const worker of workers) {
      this.processWorkerQueue(worker);
    }
  }
  
  async stop(): Promise<void> {
    this.isRunning = false;
  }
  
  private async processWorkerQueue(worker: Worker): Promise<void> {
    while (this.isRunning) {
      // Verifica se worker está disponível
      if (worker.currentMissionId) {
        await this.sleep(5000);
        continue;
      }
      
      // Pega próxima missão da fila
      const mission = await this.getNextQueuedMission();
      if (!mission) {
        await this.sleep(5000);
        continue;
      }
      
      // Executa missão
      await this.executeMission(worker, mission);
    }
  }
  
  private async executeMission(worker: Worker, mission: Mission): Promise<void> {
    try {
      // Marca missão como RUNNING
      await this.updateMissionStatus(mission.id, 'RUNNING', 'SCRAPE');
      await this.assignMissionToWorker(worker.id, mission.id);
      await this.logMissionEvent(mission.id, 'STARTED');
      
      // Seleciona proxy
      const proxy = await this.selectProxy();
      await this.updateMissionProxy(mission.id, proxy.server);
      
      // Verifica se precisa nova sessão
      const needsNewSession = await this.checkNeedsNewSession(worker.id);
      
      // CHECKPOINT 1: SCRAPE
      const scrapeResult = await this.executeScrape(worker, mission, proxy, needsNewSession);
      
      if (!scrapeResult.success) {
        await this.handleScrapeFailure(mission, scrapeResult.error);
        return;
      }
      
      await this.logMissionEvent(mission.id, 'SCRAPE_COMPLETED', { adsCount: scrapeResult.adsCount });
      await this.updateMissionAdsCount(mission.id, scrapeResult.adsCount);
      
      // CHECKPOINT 2: DATABASE
      await this.updateMissionCheckpoint(mission.id, 'DB');
      const dbResult = await this.persistToDatabase(scrapeResult.data);
      
      if (!dbResult.success) {
        await this.handleDbFailure(mission, dbResult.error);
        return;
      }
      
      await this.logMissionEvent(mission.id, 'DB_COMPLETED');
      
      // CHECKPOINT 3: S3
      await this.updateMissionCheckpoint(mission.id, 'S3');
      const s3Result = await this.uploadToS3(mission, scrapeResult.data);
      
      if (!s3Result.success) {
        await this.handleS3Failure(mission, s3Result.error);
        return;
      }
      
      await this.logMissionEvent(mission.id, 'S3_COMPLETED');
      
      // SUCESSO
      await this.completeMission(mission.id);
      
    } catch (error) {
      await this.handleUnexpectedError(mission, error);
    } finally {
      await this.releaseMissionFromWorker(worker.id);
      this.incrementSessionMissionCount(worker.id);
    }
  }
  
  private async executeScrape(
    worker: Worker, 
    mission: Mission, 
    proxy: Proxy,
    createNewSession: boolean
  ): Promise<ScrapeResult> {
    const client = new WorkerClient(worker.url, worker.apiKey);
    
    try {
      // Criar sessão se necessário
      if (createNewSession) {
        await this.logMissionEvent(mission.id, 'SESSION_CREATING', { proxy: proxy.server });
        
        const sessionResult = await client.createSession({
          forceRefresh: true,
          proxy: {
            server: proxy.server,
            username: proxy.username,
            password: proxy.password
          }
        });
        
        // Polling até sessão estar ready
        const sessionReady = await this.waitForSessionReady(
          client, 
          this.config.timeoutSession
        );
        
        if (!sessionReady) {
          // Tenta com outro proxy
          if (mission.retryCount < this.config.maxRetries) {
            await this.incrementProxyFailCount(proxy.id);
            const newProxy = await this.selectProxy();
            return this.executeScrape(worker, mission, newProxy, true);
          }
          throw new Error('Session timeout after retries');
        }
        
        await this.logMissionEvent(mission.id, 'SESSION_READY');
        this.resetSessionMissionCount(worker.id);
      }
      
      // Solicitar scrape
      await this.logMissionEvent(mission.id, 'SCRAPE_STARTING');
      
      const scrapeResponse = await client.startScrape({
        filters: {
          date_range: {
            start: mission.dateStart.toISOString().split('T')[0],
            end: mission.dateEnd.toISOString().split('T')[0]
          },
          format: mission.mediaType,
          sort_by: 'qtd_ads',
          languages: mission.languages
        },
        options: {
          max_ads: 'all',
          batch_size: 150
        }
      });
      
      await this.updateMissionJobId(mission.id, scrapeResponse.job_id);
      
      // Polling até job completar
      const jobResult = await this.waitForJobComplete(
        client,
        scrapeResponse.job_id,
        this.config.timeoutJob
      );
      
      if (jobResult.status === 'completed') {
        return {
          success: true,
          adsCount: jobResult.ads_count,
          data: jobResult.data
        };
      } else if (jobResult.status === 'empty') {
        return {
          success: true,
          adsCount: 0,
          data: []
        };
      } else {
        throw new Error(`Job failed with status: ${jobResult.status}`);
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  private async waitForSessionReady(client: WorkerClient, timeoutSeconds: number): Promise<boolean> {
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;
    
    // Espera inicial de 60 segundos
    await this.sleep(60000);
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await client.getSessionStatus();
      
      switch (status.status) {
        case 'ready':
          return true;
        case 'initializing':
        case 'connecting':
        case 'authenticating':
        case 'warming_up':
          await this.sleep(10000); // Poll a cada 10s
          break;
        case 'stuck':
        case 'disconnected':
        case 'terminated':
        case 'scraping': // scraping durante init = erro
          return false;
        default:
          await this.sleep(10000);
      }
    }
    
    return false;
  }
  
  private async waitForJobComplete(
    client: WorkerClient, 
    jobId: string, 
    timeoutMinutes: number
  ): Promise<JobResult> {
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;
    
    while (Date.now() - startTime < timeoutMs) {
      const status = await client.getJobStatus(jobId);
      
      switch (status.status) {
        case 'completed':
        case 'empty':
        case 'failed':
        case 'cancelled':
          return status;
        case 'pending':
        case 'queued':
        case 'running':
          await this.sleep(30000); // Poll a cada 30s
          break;
        case 'paused':
          // Trata paused como failed
          return { ...status, status: 'failed' };
        default:
          await this.sleep(30000);
      }
    }
    
    // Timeout - cancela job
    await client.cancelJob(jobId);
    return { status: 'failed', error: 'Timeout' };
  }
  
  private async persistToDatabase(data: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getStorageDbConfig();
      // Implementar lógica de persistência no banco de destino
      // Usar connection_string configurada
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  private async uploadToS3(mission: Mission, data: any[]): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getStorageS3Config();
      const s3Client = new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.access_key,
          secretAccessKey: config.secret_key
        }
      });
      
      const key = `scrapes/${mission.dateStart.toISOString().split('T')[0]}/${mission.id}.json`;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json'
      }));
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  private async selectProxy(): Promise<Proxy> {
    // Seleciona proxy ativo aleatoriamente
    const proxies = await prisma.proxy.findMany({
      where: { active: true },
      orderBy: { lastUsedAt: 'asc' } // Prioriza menos usado
    });
    
    if (proxies.length === 0) {
      throw new Error('No active proxies available');
    }
    
    // Seleção aleatória
    const randomIndex = Math.floor(Math.random() * proxies.length);
    const proxy = proxies[randomIndex];
    
    // Atualiza último uso
    await prisma.proxy.update({
      where: { id: proxy.id },
      data: { lastUsedAt: new Date() }
    });
    
    return proxy;
  }
  
  private async checkNeedsNewSession(workerId: string): Promise<boolean> {
    const count = this.missionCountPerSession.get(workerId) || 0;
    return count >= this.config.refreshInterval || count === 0;
  }
  
  private resetSessionMissionCount(workerId: string): void {
    this.missionCountPerSession.set(workerId, 0);
  }
  
  private incrementSessionMissionCount(workerId: string): void {
    const count = this.missionCountPerSession.get(workerId) || 0;
    this.missionCountPerSession.set(workerId, count + 1);
  }
  
  private async handleScrapeFailure(mission: Mission, error: string): Promise<void> {
    if (mission.retryCount < this.config.maxRetries && this.config.autoRetry) {
      await prisma.mission.update({
        where: { id: mission.id },
        data: { 
          retryCount: { increment: 1 },
          status: 'QUEUED',
          checkpoint: null
        }
      });
      await this.logMissionEvent(mission.id, 'RETRY_QUEUED', { attempt: mission.retryCount + 1 });
    } else {
      await this.failMission(mission.id, 'SCRAPE', 'ERROR200', error);
    }
  }
  
  private async handleDbFailure(mission: Mission, error: string): Promise<void> {
    if (mission.retryCount < this.config.maxRetries && this.config.autoRetry) {
      await prisma.mission.update({
        where: { id: mission.id },
        data: { 
          retryCount: { increment: 1 },
          status: 'QUEUED'
          // Mantém checkpoint em DB para retry parcial
        }
      });
      await this.logMissionEvent(mission.id, 'RETRY_QUEUED', { attempt: mission.retryCount + 1 });
    } else {
      await this.failMission(mission.id, 'DB', 'ERROR300', error);
    }
  }
  
  private async handleS3Failure(mission: Mission, error: string): Promise<void> {
    // S3 é o último checkpoint - falha marca missão como failed
    // Mas os dados já estão no DB, então pode ser recuperado
    await this.failMission(mission.id, 'S3', 'ERROR400', error);
  }
  
  private async completeMission(missionId: string): Promise<void> {
    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'DONE',
        checkpoint: null,
        finishedAt: new Date()
      }
    });
    await this.logMissionEvent(missionId, 'COMPLETED');
  }
  
  private async failMission(
    missionId: string, 
    checkpoint: Checkpoint, 
    errorCode: string, 
    errorMessage: string
  ): Promise<void> {
    await prisma.mission.update({
      where: { id: missionId },
      data: {
        status: 'FAILED',
        checkpoint,
        errorCode,
        errorMessage,
        finishedAt: new Date()
      }
    });
    await this.logMissionEvent(missionId, 'FAILED', { checkpoint, errorCode, errorMessage });
  }
  
  private async logMissionEvent(missionId: string, event: string, details?: any): Promise<void> {
    await prisma.missionLog.create({
      data: {
        missionId,
        event,
        details: details || null
      }
    });
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const executionEngine = new ExecutionEngine();
```

### 6.4 Cliente do Worker

```typescript
// lib/worker-client.ts

interface SessionConfig {
  forceRefresh: boolean;
  proxy: {
    server: string;
    username?: string;
    password?: string;
  };
}

interface ScrapeConfig {
  filters: {
    date_range: { start: string; end: string };
    format: string;
    sort_by: string;
    languages: string[];
  };
  options: {
    max_ads: string;
    batch_size: number;
  };
}

export class WorkerClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}
  
  private async request<T>(
    method: string, 
    endpoint: string, 
    body?: any
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`Worker API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }
  
  // Session endpoints
  async createSession(config: SessionConfig): Promise<{ session_id: string }> {
    return this.request('POST', '/session', config);
  }
  
  async getSessionStatus(): Promise<{ status: string }> {
    return this.request('GET', '/session/status');
  }
  
  async deleteSession(): Promise<void> {
    await this.request('DELETE', '/session');
  }
  
  // Scrape endpoints
  async startScrape(config: ScrapeConfig): Promise<{ job_id: string }> {
    return this.request('POST', '/scrape', config);
  }
  
  async getJobStatus(jobId: string): Promise<{
    status: string;
    ads_count?: number;
    data?: any[];
    error?: string;
  }> {
    return this.request('GET', `/scrape/${jobId}`);
  }
  
  async cancelJob(jobId: string): Promise<void> {
    await this.request('POST', `/scrape/${jobId}/cancel`);
  }
  
  // Health check
  async healthCheck(): Promise<{ ok: boolean; responseTime: number }> {
    const start = Date.now();
    try {
      await this.request('GET', '/health');
      return { ok: true, responseTime: Date.now() - start };
    } catch {
      return { ok: false, responseTime: Date.now() - start };
    }
  }
}
```

---

## 7. Interface do Usuário

### 7.1 Layout Principal

```tsx
// app/layout.tsx

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="border-b">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Mission Control</h1>
                <nav>
                  <Tabs defaultValue="missions">
                    <TabsList>
                      <TabsTrigger value="missions" asChild>
                        <Link href="/missions">📦 Banco de Missões</Link>
                      </TabsTrigger>
                      <TabsTrigger value="control" asChild>
                        <Link href="/control">🚀 Mission Control</Link>
                      </TabsTrigger>
                      <TabsTrigger value="settings" asChild>
                        <Link href="/settings">⚙️ Settings</Link>
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </nav>
              </div>
            </div>
          </header>
          
          {/* Main Content */}
          <main className="container mx-auto px-4 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

### 7.2 Tela: Banco de Missões

```tsx
// app/missions/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, 
  TableHeader, TableRow 
} from '@/components/ui/table';
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CreateMissionsModal } from '@/components/missions/CreateMissionsModal';
import { ImportCSVModal } from '@/components/missions/ImportCSVModal';

export default function MissionsPage() {
  const [missions, setMissions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({
    year: new Date().getFullYear(),
    month: null,
    mediaType: null,
    status: null
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  useEffect(() => {
    fetchMissions();
  }, [filters]);
  
  const fetchMissions = async () => {
    const params = new URLSearchParams();
    if (filters.year) params.set('year', filters.year);
    if (filters.month) params.set('month', filters.month);
    if (filters.mediaType) params.set('mediaType', filters.mediaType);
    if (filters.status) params.set('status', filters.status);
    
    const response = await fetch(`/api/missions?${params}`);
    const data = await response.json();
    setMissions(data.data);
    setSummary(data.summary);
  };
  
  const getStatusBadge = (status: string) => {
    const variants = {
      PENDING: { label: '○ Pendente', variant: 'outline' },
      QUEUED: { label: '⏳ Na fila', variant: 'secondary' },
      RUNNING: { label: '🔵 Executando', variant: 'default' },
      DONE: { label: '✅ Concluída', variant: 'success' },
      FAILED: { label: '❌ Falhou', variant: 'destructive' }
    };
    const config = variants[status] || variants.PENDING;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };
  
  const handleClearDone = async () => {
    if (confirm('Remover todas as missões concluídas?')) {
      await fetch('/api/missions/clear-done', { method: 'DELETE' });
      fetchMissions();
    }
  };
  
  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button onClick={() => setShowCreateModal(true)}>
          + Criar Missões
        </Button>
        <Button variant="outline" onClick={() => setShowImportModal(true)}>
          📁 Importar CSV
        </Button>
        <Button variant="ghost" onClick={handleClearDone}>
          🗑️ Limpar Concluídas
        </Button>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
        <Select 
          value={filters.year?.toString()} 
          onValueChange={(v) => setFilters(f => ({ ...f, year: parseInt(v) }))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2024">2024</SelectItem>
            <SelectItem value="2025">2025</SelectItem>
          </SelectContent>
        </Select>
        
        <Select 
          value={filters.month || 'all'} 
          onValueChange={(v) => setFilters(f => ({ ...f, month: v === 'all' ? null : v }))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={(i + 1).toString()}>
                {new Date(2000, i).toLocaleString('pt-BR', { month: 'long' })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select 
          value={filters.mediaType || 'all'} 
          onValueChange={(v) => setFilters(f => ({ ...f, mediaType: v === 'all' ? null : v }))}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="image">Image</SelectItem>
          </SelectContent>
        </Select>
        
        <Select 
          value={filters.status || 'all'} 
          onValueChange={(v) => setFilters(f => ({ ...f, status: v === 'all' ? null : v }))}
        >
          <SelectTrigger className="w-32">
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
      </div>
      
      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data Início</TableHead>
              <TableHead>Data Fim</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Idioma</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ads</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missions.map((mission) => (
              <TableRow key={mission.id}>
                <TableCell>{mission.dateStart}</TableCell>
                <TableCell>{mission.dateEnd}</TableCell>
                <TableCell>{mission.mediaType}</TableCell>
                <TableCell>{mission.languages.join(', ')}</TableCell>
                <TableCell>{getStatusBadge(mission.status)}</TableCell>
                <TableCell>{mission.adsCount ?? '-'}</TableCell>
                <TableCell>
                  {mission.status === 'PENDING' && (
                    <Button variant="ghost" size="sm">🗑️</Button>
                  )}
                  {mission.status === 'FAILED' && (
                    <Button variant="ghost" size="sm">🔄</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Summary */}
      {summary && (
        <div className="flex items-center gap-4 p-4 bg-muted rounded-lg text-sm">
          <span><strong>{summary.total}</strong> total</span>
          <span className="text-muted-foreground">│</span>
          <span><strong>{summary.pending}</strong> pendentes</span>
          <span className="text-muted-foreground">│</span>
          <span className="text-green-600"><strong>{summary.done}</strong> concluídas</span>
          <span className="text-muted-foreground">│</span>
          <span className="text-red-600"><strong>{summary.failed}</strong> falhas</span>
        </div>
      )}
      
      {/* Modals */}
      <CreateMissionsModal 
        open={showCreateModal} 
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchMissions}
      />
      <ImportCSVModal 
        open={showImportModal} 
        onClose={() => setShowImportModal(false)}
        onSuccess={fetchMissions}
      />
    </div>
  );
}
```

### 7.3 Tela: Mission Control

```tsx
// app/control/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { SelectMissionsModal } from '@/components/control/SelectMissionsModal';
import { MissionDetailsModal } from '@/components/control/MissionDetailsModal';

export default function ControlPage() {
  const [status, setStatus] = useState(null);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [selectedMission, setSelectedMission] = useState(null);
  
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll a cada 5s
    return () => clearInterval(interval);
  }, []);
  
  const fetchStatus = async () => {
    const response = await fetch('/api/execution/status');
    const data = await response.json();
    setStatus(data);
  };
  
  const handleStart = async () => {
    await fetch('/api/execution/start', { method: 'POST' });
    fetchStatus();
  };
  
  const handleStop = async () => {
    await fetch('/api/execution/stop', { method: 'POST' });
    fetchStatus();
  };
  
  const handleRetryFailed = async () => {
    await fetch('/api/missions/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { status: 'FAILED' } })
    });
    fetchStatus();
  };
  
  const getCheckpointIcon = (checkpoint: string, missionCheckpoint: string, missionStatus: string) => {
    const checkpoints = ['SCRAPE', 'DB', 'S3'];
    const currentIndex = checkpoints.indexOf(missionCheckpoint);
    const thisIndex = checkpoints.indexOf(checkpoint);
    
    if (missionStatus === 'DONE') return '✓';
    if (missionStatus === 'FAILED' && checkpoint === missionCheckpoint) return '✗';
    if (thisIndex < currentIndex) return '✓';
    if (thisIndex === currentIndex) return '◷';
    return ' ';
  };
  
  if (!status) return <div>Carregando...</div>;
  
  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center gap-4">
        <Button onClick={() => setShowSelectModal(true)}>
          📋 Selecionar Missões
        </Button>
        <Button 
          onClick={handleStart} 
          disabled={status.isRunning || status.queue.total === 0}
        >
          ▶️ Iniciar
        </Button>
        <Button 
          variant="outline" 
          onClick={handleStop}
          disabled={!status.isRunning}
        >
          ⏹️ Parar
        </Button>
        <Button variant="ghost" onClick={handleRetryFailed}>
          🔄 Retry Falhas
        </Button>
      </div>
      
      {/* Workers Status */}
      <Card>
        <CardHeader>
          <CardTitle>Workers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {status.workers.map((worker) => (
              <div 
                key={worker.id} 
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <p className="font-medium">{worker.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {worker.status === 'running' 
                      ? `Executando missão ${worker.currentMission?.dateStart}`
                      : 'Disponível'
                    }
                  </p>
                </div>
                <div className={`w-3 h-3 rounded-full ${
                  worker.status === 'running' ? 'bg-green-500' : 'bg-gray-300'
                }`} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Execution Queue */}
      <Card>
        <CardHeader>
          <CardTitle>Fila de Execução</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {status.queue.missions.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma missão na fila. Clique em "Selecionar Missões" para adicionar.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-2">#</th>
                    <th className="pb-2">Missão</th>
                    <th className="pb-2">Progresso</th>
                    <th className="pb-2">Ads</th>
                    <th className="pb-2">Tempo</th>
                    <th className="pb-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {status.queue.missions.map((mission, index) => (
                    <tr key={mission.id} className="border-t">
                      <td className="py-2">{index + 1}</td>
                      <td className="py-2">
                        {mission.dateStart} {mission.mediaType} {mission.languages.join(',')}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1 font-mono text-sm">
                          [{getCheckpointIcon('SCRAPE', mission.checkpoint, mission.status)}]
                          [{getCheckpointIcon('DB', mission.checkpoint, mission.status)}]
                          [{getCheckpointIcon('S3', mission.checkpoint, mission.status)}]
                        </div>
                      </td>
                      <td className="py-2">{mission.adsCount ?? '--'}</td>
                      <td className="py-2">
                        {mission.status === 'RUNNING' ? '⏳' : 
                         mission.status === 'QUEUED' ? '⏳' : '-'}
                      </td>
                      <td className="py-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedMission(mission)}
                        >
                          👁️
                        </Button>
                        {mission.status === 'QUEUED' && (
                          <Button variant="ghost" size="sm">✕</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Stats */}
      <div className="flex items-center gap-6 p-4 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-blue-500">🔵</span>
          <span>Executando: <strong>{status.stats.running}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span>⏳</span>
          <span>Na fila: <strong>{status.stats.queued}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">✅</span>
          <span>Concluídas hoje: <strong>{status.stats.completedToday}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-500">❌</span>
          <span>Falhas hoje: <strong>{status.stats.failedToday}</strong></span>
        </div>
      </div>
      
      {/* Modals */}
      <SelectMissionsModal
        open={showSelectModal}
        onClose={() => setShowSelectModal(false)}
        onSuccess={fetchStatus}
        workers={status.workers}
      />
      {selectedMission && (
        <MissionDetailsModal
          mission={selectedMission}
          onClose={() => setSelectedMission(null)}
        />
      )}
    </div>
  );
}
```

### 7.4 Tela: Settings

```tsx
// app/settings/page.tsx

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';

export default function SettingsPage() {
  const [workers, setWorkers] = useState([]);
  const [proxies, setProxies] = useState([]);
  const [config, setConfig] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  useEffect(() => {
    fetchAll();
  }, []);
  
  const fetchAll = async () => {
    const [workersRes, proxiesRes, configRes] = await Promise.all([
      fetch('/api/workers'),
      fetch('/api/proxies'),
      fetch('/api/config')
    ]);
    setWorkers((await workersRes.json()).data);
    setProxies((await proxiesRes.json()).data);
    setConfig(await configRes.json());
  };
  
  const testWorker = async (workerId: string) => {
    const response = await fetch(`/api/workers/${workerId}/test`, { method: 'POST' });
    const result = await response.json();
    toast({
      title: result.success ? 'Conexão OK' : 'Falha na conexão',
      description: result.message,
      variant: result.success ? 'default' : 'destructive'
    });
    fetchAll();
  };
  
  const testProxy = async (proxyId: string) => {
    const response = await fetch(`/api/proxies/${proxyId}/test`, { method: 'POST' });
    const result = await response.json();
    toast({
      title: result.success ? 'Proxy OK' : 'Proxy falhou',
      variant: result.success ? 'default' : 'destructive'
    });
    fetchAll();
  };
  
  const testAllProxies = async () => {
    const response = await fetch('/api/proxies/test-all', { method: 'POST' });
    const result = await response.json();
    const successCount = result.results.filter(r => r.success).length;
    toast({
      title: 'Teste concluído',
      description: `${successCount}/${result.results.length} proxies funcionando`
    });
    fetchAll();
  };
  
  const saveConfig = async () => {
    setIsSaving(true);
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    toast({ title: 'Configurações salvas' });
    setIsSaving(false);
  };
  
  const addWorker = async () => {
    const name = prompt('Nome do worker:');
    const url = prompt('URL do worker:');
    const apiKey = prompt('API Key:');
    if (name && url && apiKey) {
      await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, apiKey })
      });
      fetchAll();
    }
  };
  
  const addProxy = async () => {
    const server = prompt('Servidor (host:port):');
    const username = prompt('Usuário (opcional):');
    const password = prompt('Senha (opcional):');
    if (server) {
      await fetch('/api/proxies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server, username, password })
      });
      fetchAll();
    }
  };
  
  if (!config) return <div>Carregando...</div>;
  
  return (
    <div className="space-y-6">
      {/* Workers */}
      <Card>
        <CardHeader>
          <CardTitle>🖥️ Workers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {workers.map((worker) => (
            <div key={worker.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{worker.name}</p>
                  <p className="text-sm text-muted-foreground">{worker.url}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    worker.lastTestOk ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  <Button variant="outline" size="sm" onClick={() => testWorker(worker.id)}>
                    Testar
                  </Button>
                  <Button variant="ghost" size="sm">🗑️</Button>
                </div>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={addWorker}>+ Adicionar Worker</Button>
        </CardContent>
      </Card>
      
      {/* Proxies */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>🔌 Proxies</CardTitle>
          <Button variant="outline" size="sm" onClick={testAllProxies}>
            Testar Todos
          </Button>
        </CardHeader>
        <CardContent>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground">
                <th className="pb-2">Ativo</th>
                <th className="pb-2">Servidor</th>
                <th className="pb-2">Usuário</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {proxies.map((proxy) => (
                <tr key={proxy.id} className="border-t">
                  <td className="py-2">
                    <Checkbox checked={proxy.active} />
                  </td>
                  <td className="py-2">{proxy.server}</td>
                  <td className="py-2">{proxy.username || '-'}</td>
                  <td className="py-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${
                      proxy.lastTestOk === true ? 'bg-green-500' :
                      proxy.lastTestOk === false ? 'bg-red-500' : 'bg-gray-300'
                    }`} />
                  </td>
                  <td className="py-2">
                    <Button variant="ghost" size="sm" onClick={() => testProxy(proxy.id)}>
                      Testar
                    </Button>
                    <Button variant="ghost" size="sm">🗑️</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" className="mt-4" onClick={addProxy}>
            + Adicionar Proxy
          </Button>
        </CardContent>
      </Card>
      
      {/* Storage */}
      <Card>
        <CardHeader>
          <CardTitle>💾 Storage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>Database (PostgreSQL)</Label>
            <div className="flex gap-2">
              <Input 
                type="password"
                value={config.storage_db.connection_string}
                onChange={(e) => setConfig(c => ({
                  ...c,
                  storage_db: { connection_string: e.target.value }
                }))}
                placeholder="postgres://user:pass@host:5432/db"
                className="flex-1"
              />
              <Button variant="outline">Testar</Button>
            </div>
          </div>
          
          <div className="space-y-3">
            <Label>S3 Storage</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Bucket</Label>
                <Input 
                  value={config.storage_s3.bucket}
                  onChange={(e) => setConfig(c => ({
                    ...c,
                    storage_s3: { ...c.storage_s3, bucket: e.target.value }
                  }))}
                />
              </div>
              <div>
                <Label className="text-xs">Region</Label>
                <Input 
                  value={config.storage_s3.region}
                  onChange={(e) => setConfig(c => ({
                    ...c,
                    storage_s3: { ...c.storage_s3, region: e.target.value }
                  }))}
                />
              </div>
              <div>
                <Label className="text-xs">Access Key</Label>
                <Input 
                  value={config.storage_s3.access_key}
                  onChange={(e) => setConfig(c => ({
                    ...c,
                    storage_s3: { ...c.storage_s3, access_key: e.target.value }
                  }))}
                />
              </div>
              <div>
                <Label className="text-xs">Secret Key</Label>
                <Input 
                  type="password"
                  value={config.storage_s3.secret_key}
                  onChange={(e) => setConfig(c => ({
                    ...c,
                    storage_s3: { ...c.storage_s3, secret_key: e.target.value }
                  }))}
                />
              </div>
            </div>
            <Button variant="outline">Testar S3</Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Execution */}
      <Card>
        <CardHeader>
          <CardTitle>⚡ Execução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Trocar sessão/proxy a cada (missões)</Label>
            <Input 
              type="number"
              value={config.execution.refresh_interval}
              onChange={(e) => setConfig(c => ({
                ...c,
                execution: { ...c.execution, refresh_interval: parseInt(e.target.value) }
              }))}
              className="w-24"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Retry automático</Label>
            <Switch 
              checked={config.execution.auto_retry}
              onCheckedChange={(checked) => setConfig(c => ({
                ...c,
                execution: { ...c.execution, auto_retry: checked }
              }))}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Máximo de retries</Label>
            <Input 
              type="number"
              value={config.execution.max_retries}
              onChange={(e) => setConfig(c => ({
                ...c,
                execution: { ...c.execution, max_retries: parseInt(e.target.value) }
              }))}
              className="w-24"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Timeout de sessão (segundos)</Label>
            <Input 
              type="number"
              value={config.execution.timeout_session}
              onChange={(e) => setConfig(c => ({
                ...c,
                execution: { ...c.execution, timeout_session: parseInt(e.target.value) }
              }))}
              className="w-24"
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label>Timeout de job (minutos)</Label>
            <Input 
              type="number"
              value={config.execution.timeout_job}
              onChange={(e) => setConfig(c => ({
                ...c,
                execution: { ...c.execution, timeout_job: parseInt(e.target.value) }
              }))}
              className="w-24"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={isSaving}>
          {isSaving ? 'Salvando...' : '💾 Salvar'}
        </Button>
      </div>
    </div>
  );
}
```

---

## 8. Fluxos de Execução

### 8.1 Fluxo: Criar Missões em Lote

```
1. Usuário acessa "Banco de Missões"
2. Clica em "+ Criar Missões"
3. Preenche:
   - Data início: 2025-01-01
   - Data fim: 2025-12-31
   - Tipo: video
   - Idiomas: [pt]
4. Sistema mostra prévia: "365 missões serão criadas"
5. Usuário confirma
6. Sistema:
   - Gera 365 registros (1 por dia)
   - Insere no banco com status PENDING
   - Retorna contagem de sucesso
```

### 8.2 Fluxo: Selecionar e Executar Missões

```
1. Usuário acessa "Mission Control"
2. Clica em "📋 Selecionar Missões"
3. Define filtros:
   - Período: 2025-01-01 a 2025-01-31
   - Status: Pendentes
   - Quantidade: 50
4. Sistema mostra prévia das missões
5. Usuário seleciona workers a usar
6. Confirma seleção
7. Sistema:
   - Atualiza status para QUEUED
   - Registra queuedAt
8. Usuário clica "▶️ Iniciar"
9. Sistema inicia processamento:
   - Para cada worker disponível, pega próxima missão QUEUED
   - Executa pipeline: SCRAPE → DB → S3
   - Atualiza status e checkpoints em tempo real
```

### 8.3 Fluxo: Pipeline de uma Missão

```
INÍCIO
   │
   ├── 1. Atualiza status → RUNNING
   ├── 2. Atualiza checkpoint → SCRAPE
   ├── 3. Seleciona proxy (aleatório)
   ├── 4. Verifica se precisa nova sessão
   │      └── Se sim: cria sessão, aguarda ready
   │
   ├── 5. SCRAPE
   │      ├── Solicita scrape ao worker
   │      ├── Aguarda conclusão (polling 30s)
   │      └── Resultado:
   │           ├── Sucesso → continua
   │           ├── Vazio → continua (adsCount = 0)
   │           └── Falha → retry ou marca failed
   │
   ├── 6. Atualiza checkpoint → DB
   ├── 7. DATABASE
   │      ├── Processa dados
   │      ├── Insere no banco de destino
   │      └── Resultado:
   │           ├── Sucesso → continua
   │           └── Falha → retry ou marca failed (PARA AQUI)
   │
   ├── 8. Atualiza checkpoint → S3
   ├── 9. S3
   │      ├── Serializa JSON
   │      ├── Upload para S3
   │      └── Resultado:
   │           ├── Sucesso → continua
   │           └── Falha → marca failed (dados já estão no DB)
   │
   └── 10. CONCLUSÃO
          ├── Status → DONE
          ├── Limpa checkpoint
          └── Registra finishedAt
```

### 8.4 Fluxo: Tratamento de Falhas

```
FALHA NO SCRAPE
   │
   ├── retryCount < maxRetries?
   │      ├── SIM:
   │      │    ├── Incrementa retryCount
   │      │    ├── Incrementa failCount do proxy
   │      │    ├── Seleciona novo proxy
   │      │    ├── Cria nova sessão
   │      │    └── Tenta novamente
   │      │
   │      └── NÃO:
   │           ├── Status → FAILED
   │           ├── Checkpoint → SCRAPE
   │           ├── Registra errorCode e errorMessage
   │           └── Passa para próxima missão

FALHA NO DB
   │
   ├── retryCount < maxRetries?
   │      ├── SIM:
   │      │    ├── Incrementa retryCount
   │      │    └── Status → QUEUED (volta para fila)
   │      │
   │      └── NÃO:
   │           ├── Status → FAILED
   │           ├── Checkpoint → DB
   │           └── Registra erro
   │           (S3 NÃO É EXECUTADO)

FALHA NO S3
   │
   └── Status → FAILED
       ├── Checkpoint → S3
       └── Registra erro
       (Dados já estão no DB, pode ser recuperado)
```

---

## 9. Integração com Worker Externo

### 9.1 Endpoints do Worker

| Endpoint                       | Método           | Função                  |
| ------------------------------ | ---------------- | ----------------------- |
| `POST /session`                | Criar sessão     | Inicia sessão com proxy |
| `GET /session/status`          | Status da sessão | Retorna status atual    |
| `DELETE /session`              | Encerrar sessão  | Finaliza sessão ativa   |
| `POST /scrape`                 | Iniciar scrape   | Solicita extração       |
| `GET /scrape/{job_id}`         | Status do job    | Retorna progresso       |
| `POST /scrape/{job_id}/cancel` | Cancelar job     | Cancela execução        |

### 9.2 Status de Sessão

| Status           | Descrição    | Ação                     |
| ---------------- | ------------ | ------------------------ |
| `initializing`   | Iniciando    | Aguardar                 |
| `connecting`     | Conectando   | Aguardar                 |
| `authenticating` | Autenticando | Aguardar                 |
| `warming_up`     | Aquecendo    | Aguardar                 |
| `ready`          | Pronta       | Prosseguir com scrape    |
| `scraping`       | Executando   | Monitorar job            |
| `stuck`          | Travada      | Encerrar e retry         |
| `disconnected`   | Desconectada | Encerrar e retry         |
| `terminated`     | Finalizada   | Criar nova se necessário |

### 9.3 Status de Job

| Status      | Descrição      | Ação                |
| ----------- | -------------- | ------------------- |
| `pending`   | Aguardando     | Aguardar (polling)  |
| `queued`    | Na fila        | Aguardar (polling)  |
| `running`   | Executando     | Aguardar (polling)  |
| `completed` | Concluído      | Processar dados     |
| `empty`     | Sem resultados | Marcar adsCount = 0 |
| `failed`    | Falhou         | Avaliar retry       |
| `cancelled` | Cancelado      | Avaliar retry       |
| `paused`    | Pausado        | Tratar como failed  |

### 9.4 Payload: Criar Sessão

```json
POST /session
{
  "force_refresh": true,
  "proxy": {
    "server": "proxy.example.com:8080",
    "username": "user",
    "password": "pass"
  }
}
```

### 9.5 Payload: Solicitar Scrape

```json
POST /scrape
{
  "filters": {
    "date_range": {
      "start": "2025-01-15",
      "end": "2025-01-15"
    },
    "format": "video",
    "sort_by": "qtd_ads",
    "languages": ["pt"]
  },
  "options": {
    "max_ads": "all",
    "batch_size": 150
  }
}
```

### 9.6 Response: Status do Job

```json
GET /scrape/{job_id}
{
  "status": "completed",
  "ads_count": 1234,
  "data": [
    { "id": "ad1", "title": "...", ... },
    { "id": "ad2", "title": "...", ... }
  ]
}
```

---

## 10. Códigos de Erro

### 10.1 Erros de Scrape (ERROR1xx, ERROR2xx)

| Código   | Descrição                | Checkpoint | Ação                 |
| -------- | ------------------------ | ---------- | -------------------- |
| ERROR100 | Erro genérico de scrape  | SCRAPE     | Retry                |
| ERROR101 | Timeout de sessão (180s) | SCRAPE     | Retry com novo proxy |
| ERROR102 | Sessão stuck             | SCRAPE     | Retry com novo proxy |
| ERROR103 | Sessão desconectada      | SCRAPE     | Retry com novo proxy |
| ERROR104 | Retry de sessão falhou   | SCRAPE     | Falha definitiva     |
| ERROR200 | Job falhou               | SCRAPE     | Retry                |
| ERROR201 | Job cancelado            | SCRAPE     | Retry                |
| ERROR202 | Timeout de job (100min)  | SCRAPE     | Retry                |
| ERROR203 | Retry de job falhou      | SCRAPE     | Falha definitiva     |

### 10.2 Erros de Database (ERROR3xx)

| Código   | Descrição           | Checkpoint | Ação                |
| -------- | ------------------- | ---------- | ------------------- |
| ERROR300 | Erro genérico de DB | DB         | Retry               |
| ERROR301 | Conexão recusada    | DB         | Verificar config    |
| ERROR302 | Timeout de conexão  | DB         | Retry               |
| ERROR303 | Erro de schema      | DB         | Verificar estrutura |
| ERROR304 | Retry de DB falhou  | DB         | Falha definitiva    |

### 10.3 Erros de S3 (ERROR4xx)

| Código   | Descrição             | Checkpoint | Ação                 |
| -------- | --------------------- | ---------- | -------------------- |
| ERROR400 | Erro genérico de S3   | S3         | Retry manual         |
| ERROR401 | Credenciais inválidas | S3         | Verificar config     |
| ERROR402 | Bucket não encontrado | S3         | Verificar config     |
| ERROR403 | Permissão negada      | S3         | Verificar permissões |
| ERROR404 | Timeout de upload     | S3         | Retry manual         |

### 10.4 Erros de Sistema (ERROR5xx)

| Código   | Descrição               | Ação              |
| -------- | ----------------------- | ----------------- |
| ERROR500 | Erro interno            | Verificar logs    |
| ERROR501 | Nenhum proxy disponível | Adicionar proxies |
| ERROR502 | Worker indisponível     | Verificar worker  |

---

## 11. Configurações Padrão

### 11.1 Valores Padrão

| Configuração       | Valor Padrão | Descrição                      |
| ------------------ | ------------ | ------------------------------ |
| `refresh_interval` | 5            | Trocar sessão a cada N missões |
| `auto_retry`       | true         | Retry automático habilitado    |
| `max_retries`      | 2            | Máximo de tentativas           |
| `timeout_session`  | 180          | Timeout sessão (segundos)      |
| `timeout_job`      | 100          | Timeout job (minutos)          |

### 11.2 Parâmetros Fixos do Scrape

| Parâmetro       | Valor     | Descrição          |
| --------------- | --------- | ------------------ |
| `sort_by`       | "qtd_ads" | Ordenação          |
| `max_ads`       | "all"     | Extrair todos      |
| `batch_size`    | 150       | Tamanho do lote    |
| `force_refresh` | true      | Forçar nova sessão |

### 11.3 Intervalos de Polling

| Operação       | Intervalo | Descrição                  |
| -------------- | --------- | -------------------------- |
| Session status | 10s       | Durante criação de sessão  |
| Job status     | 30s       | Durante execução do scrape |
| UI refresh     | 5s        | Atualização da interface   |

---

## 12. Checklist de Implementação

### 12.1 Setup Inicial

- [ ] Criar projeto Next.js com TypeScript
- [ ] Configurar Tailwind CSS
- [ ] Instalar shadcn/ui components
- [ ] Configurar Prisma com PostgreSQL
- [ ] Criar schema do banco de dados
- [ ] Executar migração inicial
- [ ] Configurar variáveis de ambiente

### 12.2 Backend - API Routes

- [ ] `GET /api/missions` - Listar missões
- [ ] `POST /api/missions` - Criar missão
- [ ] `POST /api/missions/bulk` - Criar em lote
- [ ] `POST /api/missions/import` - Importar CSV
- [ ] `POST /api/missions/queue` - Enfileirar
- [ ] `GET /api/missions/[id]` - Detalhes
- [ ] `PATCH /api/missions/[id]` - Atualizar
- [ ] `DELETE /api/missions/[id]` - Remover
- [ ] `DELETE /api/missions/clear-done` - Limpar concluídas
- [ ] `GET /api/workers` - Listar workers
- [ ] `POST /api/workers` - Criar worker
- [ ] `POST /api/workers/[id]/test` - Testar worker
- [ ] `GET /api/proxies` - Listar proxies
- [ ] `POST /api/proxies` - Criar proxy
- [ ] `POST /api/proxies/test-all` - Testar todos
- [ ] `GET /api/config` - Obter config
- [ ] `PATCH /api/config` - Atualizar config
- [ ] `GET /api/execution/status` - Status execução
- [ ] `POST /api/execution/start` - Iniciar
- [ ] `POST /api/execution/stop` - Parar

### 12.3 Backend - Core

- [ ] WorkerClient - Cliente HTTP para worker
- [ ] ExecutionEngine - Motor de execução
- [ ] QueueManager - Gerenciamento de fila
- [ ] SessionManager - Gerenciamento de sessões
- [ ] StorageManager - Persistência DB + S3

### 12.4 Frontend - Páginas

- [ ] Layout principal com navegação
- [ ] Página: Banco de Missões
- [ ] Página: Mission Control
- [ ] Página: Settings

### 12.5 Frontend - Componentes

- [ ] MissionTable
- [ ] CreateMissionsModal
- [ ] ImportCSVModal
- [ ] SelectMissionsModal
- [ ] MissionDetailsModal
- [ ] WorkerStatus
- [ ] ProgressIndicator
- [ ] ExecutionQueue

### 12.6 Testes

- [ ] Testes unitários - Lógica de negócio
- [ ] Testes de integração - API
- [ ] Teste E2E - Fluxo completo

### 12.7 Deploy

- [ ] Build de produção
- [ ] Configurar variáveis de ambiente
- [ ] Deploy (Vercel/Railway/etc)
- [ ] Monitoramento de logs

---

## Anexo: Variáveis de Ambiente

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/mission_control"

# S3 (opcional, pode ser configurado via UI)
S3_BUCKET="my-bucket"
S3_REGION="us-east-1"
S3_ACCESS_KEY="AKIA..."
S3_SECRET_KEY="..."

# App
NEXTAUTH_SECRET="random-secret-key"
NEXTAUTH_URL="http://localhost:3000"
```

---

**FIM DO DOCUMENTO**

Este documento contém todas as especificações necessárias para implementação completa do sistema Mission Control. O agente de codificação deve seguir as seções em ordem, começando pelo setup inicial e modelo de dados.
