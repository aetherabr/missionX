# Documentação do Sistema Orquestrador de Scraping

> **Versão:** 1.0  
> **Última atualização:** Janeiro/2025  
> **Escopo:** Orquestração de extração de anúncios com múltiplos workers

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Modelo de Dados](#3-modelo-de-dados)
4. [Máquinas de Estado](#4-máquinas-de-estado)
5. [Fluxos de Execução](#5-fluxos-de-execução)
6. [Queries Críticas](#6-queries-críticas)
7. [Tratamento de Erros](#7-tratamento-de-erros)
8. [Configurações](#8-configurações)
9. [Referência de APIs](#9-referência-de-apis)
10. [Logs e Auditoria](#10-logs-e-auditoria)

---

## 1. Visão Geral

### 1.1 Objetivo

Sistema orquestrador para extração automatizada de anúncios (ads) utilizando múltiplos workers em paralelo, com persistência de dados via serviço writer.

### 1.2 Componentes Principais

| Componente | Tipo | Função |
|------------|------|--------|
| **Orquestrador** | Edge Function (Supabase) | Coordena todo o fluxo de execução |
| **Workers** | Serviços externos (N instâncias) | Executam scraping de anúncios |
| **Writer** | Serviço externo (1 instância, concorrente) | Persiste dados no PostgreSQL |
| **Proxies** | Pool gerenciado | Rotação para evitar bloqueios |

### 1.3 Fluxo Macro (3 Fases)

| Fase | Responsável | Descrição |
|------|-------------|-----------|
| **Fase 1** | Usuário | Seleciona missões e adiciona à fila de execução |
| **Fase 2** | Orquestrador + Worker | Gerencia sessão, executa scrape, gera JSON |
| **Fase 3** | Orquestrador + Writer | Processa JSON, persiste ads no banco |

---

## 2. Arquitetura

### 2.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   SUPABASE                                       │
│                                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  missions   │  │   workers   │  │   proxies   │  │mission_logs │             │
│  │  (tabela)   │  │  (tabela)   │  │  (tabela)   │  │  (tabela)   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                │                     │
│         └────────────────┴────────────────┴────────────────┘                     │
│                                    │                                             │
│                          ┌─────────▼─────────┐                                   │
│                          │    Orquestrador   │                                   │
│                          │  (Edge Function)  │                                   │
│                          └─────────┬─────────┘                                   │
│                                    │                                             │
└────────────────────────────────────┼─────────────────────────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            │                        │                        │
            ▼                        ▼                        ▼
┌───────────────────┐    ┌───────────────────┐    ┌───────────────────┐
│     Worker 1      │    │     Worker 2      │    │      Writer       │
│  ┌─────────────┐  │    │  ┌─────────────┐  │    │                   │
│  │   Session   │  │    │  │   Session   │  │    │  Processa JSON    │
│  │   + Proxy   │  │    │  │   + Proxy   │  │    │  Persiste no DB   │
│  └─────────────┘  │    │  └─────────────┘  │    │                   │
│         │         │    │         │         │    │                   │
│         ▼         │    │         ▼         │    │                   │
│  ┌─────────────┐  │    │  ┌─────────────┐  │    │                   │
│  │   Storage   │  │    │  │   Storage   │  │    │                   │
│  │   (JSON)    │  │    │  │   (JSON)    │  │    │                   │
│  └─────────────┘  │    └─────────────────┘  │    └───────────────────┘
└───────────────────┘    └───────────────────┘
```

### 2.2 Fluxo de Dados

```
┌────────┐     ┌─────────┐     ┌────────┐     ┌─────────┐     ┌────────────┐
│ Missão │────▶│ Worker  │────▶│  JSON  │────▶│ Writer  │────▶│ PostgreSQL │
│ (config)│     │ (scrape)│     │(storage)│     │(process)│     │   (ads)    │
└────────┘     └─────────┘     └────────┘     └─────────┘     └────────────┘
```

### 2.3 Ciclo de Vida do Orquestrador

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOOP DO ORQUESTRADOR                         │
│                                                                 │
│   Trigger: Usuário clica "Iniciar"                              │
│   Condição de saída: Nenhuma missão com status 'queued'         │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  ENQUANTO existir missão 'queued' OU missão 'running':  │   │
│   │                                                         │   │
│   │    1. Para cada Worker ativo:                           │   │
│   │       - Verificar/gerenciar estado                      │   │
│   │       - Alocar missão se disponível                     │   │
│   │       - Monitorar job em execução                       │   │
│   │                                                         │   │
│   │    2. Para cada Missão em 'armazenamento':              │   │
│   │       - Monitorar job do Writer                         │   │
│   │       - Finalizar quando completo                       │   │
│   │                                                         │   │
│   │    3. Aguardar intervalo de polling (5s)                │   │
│   │                                                         │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│   Ao sair do loop:                                              │
│   - Encerrar todas as sessões dos Workers                       │
│   - Liberar todos os proxies                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Modelo de Dados

### 3.1 Diagrama de Relacionamentos

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     proxies     │       │     workers     │       │     writers     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │       │ id (PK)         │
│ name            │◄──────│ current_proxy_id│       │ name            │
│ host            │  usa  │ name            │       │ url             │
│ port            │       │ url             │       │ api_key         │
│ username        │       │ api_key         │       │ active          │
│ password        │       │ storage_domain  │       └─────────────────┘
│ active          │       │ status          │
│ in_use_by_worker│───────│ session_count   │
│ fail_count      │       │ current_mission │───┐
│ last_used_at    │       │ active          │   │
└─────────────────┘       └─────────────────┘   │
                                                │
                          ┌─────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                          missions                                │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ date_start, date_end, media_type, languages  ← Configuração     │
│ status, checkpoint                            ← Estado          │
│ worker_id (FK), worker_job_id, worker_data_url, proxy_used      │
│ writer_job_id                                 ← Execução        │
│ ads_count                                     ← Resultado       │
│ error_code, error_message, retry_count        ← Erro            │
│ created_at, queued_at, started_at, finished_at                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ 1:N
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       mission_logs                               │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                         │
│ mission_id (FK)                                                 │
│ event                                                           │
│ details (JSONB)                                                 │
│ timestamp                                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Tabela `missions`

```sql
-- Tipos ENUM
CREATE TYPE mission_status AS ENUM (
  'queued',     -- Na fila aguardando
  'running',    -- Em execução
  'completed',  -- Finalizado com sucesso
  'failed',     -- Falhou
  'canceled'    -- Cancelado pelo usuário
);

CREATE TYPE checkpoint_type AS ENUM (
  'atribuido',      -- Missão foi adicionada à fila
  'extracao',       -- Worker está executando scrape
  'armazenamento',  -- Writer está processando
  'finalizado'      -- Processo completo
);

-- Tabela
CREATE TABLE public.missions (
  -- Identificação
  id TEXT PRIMARY KEY DEFAULT generate_mission_id(),

  -- Configuração da missão
  date_start DATE NOT NULL,
  date_end DATE NOT NULL,
  media_type VARCHAR(10) NOT NULL 
    CHECK (media_type IN ('all', 'video', 'image')),
  languages TEXT[] NOT NULL,

  -- Estado atual
  status mission_status NOT NULL DEFAULT 'queued',
  checkpoint checkpoint_type NULL,

  -- Execução Worker
  worker_id TEXT REFERENCES workers(id),
  worker_job_id VARCHAR(100) NULL,
  worker_data_url TEXT NULL,
  proxy_used VARCHAR(200) NULL,  -- name do proxy utilizado

  -- Execução Writer
  writer_job_id VARCHAR(100) NULL,

  -- Resultado
  ads_count INTEGER NULL,

  -- Tratamento de erros
  error_code VARCHAR(20) NULL,
  error_message TEXT NULL,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  queued_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL
);

-- Índices
CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_checkpoint ON missions(checkpoint) WHERE checkpoint IS NOT NULL;
CREATE INDEX idx_missions_dates ON missions(date_start, date_end);
CREATE INDEX idx_missions_worker ON missions(worker_id) WHERE status = 'running';
CREATE INDEX idx_missions_queued ON missions(queued_at) WHERE status = 'queued';
```

### 3.3 Tabela `workers`

```sql
-- Tipo ENUM
CREATE TYPE worker_status AS ENUM (
  'idle',          -- Sem sessão ativa
  'initializing',  -- Criando sessão
  'ready',         -- Sessão pronta, aguardando missão
  'scraping',      -- Executando extração
  'error'          -- Falha na sessão
);

-- Tabela
CREATE TABLE public.workers (
  -- Identificação
  id TEXT PRIMARY KEY DEFAULT generate_worker_id(),
  name VARCHAR(100) NOT NULL,

  -- Conexão com API
  url VARCHAR(500) NOT NULL,
  api_key VARCHAR(200) NOT NULL,
  storage_domain VARCHAR(255) NULL,

  -- Estado atual
  status worker_status NOT NULL DEFAULT 'idle',
  session_count INTEGER NOT NULL DEFAULT 0,
  current_mission_id TEXT REFERENCES missions(id),

  -- Configuração
  active BOOLEAN DEFAULT true,

  -- Health check
  last_test_at TIMESTAMPTZ NULL,
  last_test_ok BOOLEAN NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_workers_active ON workers(active) WHERE active = true;
CREATE INDEX idx_workers_status ON workers(status);
```

### 3.4 Tabela `proxies`

```sql
CREATE TABLE public.proxies (
  -- Identificação
  id TEXT PRIMARY KEY DEFAULT generate_proxy_id(),
  name TEXT NULL,

  -- Conexão
  host VARCHAR(200) NOT NULL,
  port INTEGER NULL,
  username VARCHAR(100) NULL,
  password VARCHAR(100) NULL,

  -- Estado
  active BOOLEAN DEFAULT true,
  in_use_by_worker_id TEXT REFERENCES workers(id),

  -- Métricas
  fail_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ NULL,

  -- Health check
  last_test_at TIMESTAMPTZ NULL,
  last_test_ok BOOLEAN NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_proxies_available ON proxies(active, in_use_by_worker_id) 
  WHERE active = true AND in_use_by_worker_id IS NULL;
CREATE INDEX idx_proxies_in_use ON proxies(in_use_by_worker_id) 
  WHERE in_use_by_worker_id IS NOT NULL;
```

### 3.5 Tabela `writers`

```sql
CREATE TABLE public.writers (
  -- Identificação
  id TEXT PRIMARY KEY DEFAULT generate_writer_id(),
  name VARCHAR(100) NOT NULL,

  -- Conexão com API
  url VARCHAR(500) NOT NULL,
  api_key VARCHAR(200) NOT NULL,

  -- Configuração
  active BOOLEAN DEFAULT true,

  -- Health check
  last_test_at TIMESTAMPTZ NULL,
  last_test_ok BOOLEAN NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 Tabela `mission_logs`

```sql
-- Tipo ENUM para eventos
CREATE TYPE mission_event AS ENUM (
  -- Eventos de fila
  'mission_queued',
  'mission_assigned',
  'mission_canceled',

  -- Eventos de sessão
  'session_started',
  'session_ready',
  'session_failed',
  'session_terminated',

  -- Eventos de scrape
  'scrape_started',
  'scrape_progress',
  'scrape_completed',
  'scrape_failed',
  'scrape_empty',

  -- Eventos de writer
  'writer_started',
  'writer_progress',
  'writer_completed',
  'writer_failed',

  -- Eventos de finalização
  'mission_completed',
  'mission_failed',

  -- Eventos de retry
  'retry_triggered',
  'proxy_rotated'
);

-- Tabela
CREATE TABLE public.mission_logs (
  -- Identificação
  id TEXT PRIMARY KEY DEFAULT generate_mission_log_id(),
  mission_id TEXT REFERENCES missions(id) ON DELETE CASCADE,

  -- Evento
  event mission_event NOT NULL,

  -- Detalhes estruturados
  details JSONB NULL,

  -- Timestamp
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_mission_logs_mission ON mission_logs(mission_id);
CREATE INDEX idx_mission_logs_event ON mission_logs(event);
CREATE INDEX idx_mission_logs_timestamp ON mission_logs(timestamp DESC);
```

### 3.7 DDL de Migração (Alterações Necessárias)

```sql
-- =====================================================
-- MIGRAÇÃO: Adicionar campos e tipos faltantes
-- =====================================================

-- 1. Criar tipos ENUM (se não existirem)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'worker_status') THEN
    CREATE TYPE worker_status AS ENUM ('idle', 'initializing', 'ready', 'scraping', 'error');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mission_event') THEN
    CREATE TYPE mission_event AS ENUM (
      'mission_queued', 'mission_assigned', 'mission_canceled',
      'session_started', 'session_ready', 'session_failed', 'session_terminated',
      'scrape_started', 'scrape_progress', 'scrape_completed', 'scrape_failed', 'scrape_empty',
      'writer_started', 'writer_progress', 'writer_completed', 'writer_failed',
      'mission_completed', 'mission_failed', 'retry_triggered', 'proxy_rotated'
    );
  END IF;
END $$;

-- 2. Adicionar 'finalizado' ao checkpoint_type
ALTER TYPE checkpoint_type ADD VALUE IF NOT EXISTS 'finalizado';

-- 3. Workers: adicionar campos
ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS status worker_status NOT NULL DEFAULT 'idle';

ALTER TABLE public.workers 
ADD COLUMN IF NOT EXISTS session_count INTEGER NOT NULL DEFAULT 0;

-- 4. Missions: renomear e adicionar campos
ALTER TABLE public.missions 
RENAME COLUMN job_id TO worker_job_id;

ALTER TABLE public.missions 
ADD COLUMN IF NOT EXISTS writer_job_id VARCHAR(100) NULL;

ALTER TABLE public.missions 
ADD COLUMN IF NOT EXISTS worker_data_url TEXT NULL;

-- 5. Proxies: adicionar controle de uso
ALTER TABLE public.proxies 
ADD COLUMN IF NOT EXISTS in_use_by_worker_id TEXT REFERENCES workers(id);

-- 6. Criar tabela writers (se não existir)
CREATE TABLE IF NOT EXISTS public.writers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(100) NOT NULL,
  url VARCHAR(500) NOT NULL,
  api_key VARCHAR(200) NOT NULL,
  active BOOLEAN DEFAULT true,
  last_test_at TIMESTAMPTZ NULL,
  last_test_ok BOOLEAN NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Criar índices faltantes
CREATE INDEX IF NOT EXISTS idx_missions_checkpoint ON missions(checkpoint) 
  WHERE checkpoint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_missions_queued ON missions(queued_at) 
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_mission_logs_mission ON mission_logs(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_logs_event ON mission_logs(event);
```

---

## 4. Máquinas de Estado

### 4.1 Estado da Missão

```
                         ┌──────────────────────────────────────────────┐
                         │                                              │
                         ▼                                              │
┌────────┐       ┌─────────────┐       ┌───────────┐       ┌───────────┐
│ (novo) │──────▶│   queued    │──────▶│  running  │──────▶│ completed │
└────────┘       └─────────────┘       └───────────┘       └───────────┘
                       │                     │
                       │                     │ (erro com retry esgotado)
                       ▼                     ▼
                ┌────────────┐         ┌──────────┐
                │  canceled  │         │  failed  │────────────────────┐
                └────────────┘         └──────────┘                    │
                                             │                         │
                                             │ (retry disponível)      │
                                             └─────────────────────────┘
```

#### Transições de Estado

| De | Para | Trigger | Ações |
|----|------|---------|-------|
| `(novo)` | `queued` | Usuário adiciona à fila | `queued_at = now()`, `checkpoint = 'atribuido'` |
| `queued` | `running` | Worker disponível aloca | `started_at = now()`, `worker_id = X`, `checkpoint = 'extracao'` |
| `running` | `running` | Worker completa, Writer inicia | `checkpoint = 'armazenamento'`, `worker_data_url = URL` |
| `running` | `completed` | Writer completa | `finished_at = now()`, `checkpoint = 'finalizado'` |
| `running` | `failed` | Erro + retry esgotado | `error_code`, `error_message`, `finished_at = now()` |
| `running` | `running` | Retry acionado | `retry_count++`, reinicia fase atual |
| `queued` | `canceled` | Usuário cancela | `finished_at = now()` |
| `running` | `canceled` | Usuário cancela | `finished_at = now()`, encerra job |

### 4.2 Estado do Worker

```
                ┌───────────────────────────────────────────┐
                │                                           │
                ▼                                           │
┌────────┐      ┌──────────────┐      ┌─────────┐      ┌──────────┐
│  idle  │─────▶│ initializing │─────▶│  ready  │─────▶│ scraping │
└────────┘      └──────────────┘      └─────────┘      └──────────┘
    ▲                  │                   │                │
    │                  │                   │                │
    │                  ▼                   │                │
    │           ┌──────────┐               │                │
    └───────────│  error   │◀──────────────┴────────────────┘
                └──────────┘
```

#### Transições de Estado

| De | Para | Trigger | Ações |
|----|------|---------|-------|
| `idle` | `initializing` | Orquestrador solicita sessão | Sortear proxy, chamar `POST /session` |
| `initializing` | `ready` | Sessão status = 'ready' | Disponível para alocar missão |
| `initializing` | `error` | Timeout ou falha na sessão | Liberar proxy, incrementar `fail_count` |
| `ready` | `scraping` | Missão alocada | `current_mission_id = X`, chamar `POST /scrape` |
| `scraping` | `ready` | Job completo | `session_count++`, `current_mission_id = NULL` |
| `scraping` | `error` | Job falhou | Avaliar retry ou marcar missão failed |
| `ready` | `idle` | `session_count >= session_limit` | Encerrar sessão, liberar proxy |
| `error` | `idle` | Reset | Liberar recursos, preparar para nova tentativa |
| `*` | `idle` | Orquestrador finaliza | Encerrar sessão, liberar proxy |

### 4.3 Estado do Proxy

```
┌─────────────────┐      Worker solicita      ┌─────────────┐
│   disponível    │─────────────────────────▶│   em uso    │
│(in_use_by=NULL) │                           │(in_use_by=  │
└─────────────────┘◀─────────────────────────│  worker_id) │
                       Worker libera          └─────────────┘
                                                    │
                                                    │ falha repetida
                                                    ▼
                                             ┌─────────────┐
                                             │  inativo    │
                                             │(active=false)│
                                             └─────────────┘
```

#### Regras de Proxy

| Regra | Condição | Ação |
|-------|----------|------|
| Desativação automática | `fail_count >= 3` | `active = false` |
| Reativação manual | Admin intervém | `active = true`, `fail_count = 0` |
| Rotação obrigatória | Nova sessão | Selecionar proxy diferente do anterior |

---

## 5. Fluxos de Execução

### 5.1 Fase 1: Fila de Execução (Usuário)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FASE 1: FILA DE EXECUÇÃO                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Trigger: Usuário seleciona missões na interface                │
│                                                                 │
│  Opções de seleção:                                             │
│    • Botão "Selecionar Missões" na página Mission Control       │
│    • Selecionar itens na tabela "Banco de Missões" +            │
│      clicar "Adicionar à fila"                                  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Para cada missão selecionada:                             │  │
│  │                                                           │  │
│  │   UPDATE missions                                         │  │
│  │   SET status = 'queued',                                  │  │
│  │       checkpoint = 'atribuido',                           │  │
│  │       queued_at = now()                                   │  │
│  │   WHERE id = :mission_id;                                 │  │
│  │                                                           │  │
│  │   INSERT INTO mission_logs (mission_id, event, details)   │  │
│  │   VALUES (:mission_id, 'mission_queued',                  │  │
│  │           '{"queued_by": "user"}');                       │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Fase 2: Orquestração + Worker

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FASE 2: WORKER (DETALHADO)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.1 VERIFICAR NECESSIDADE DE NOVA SESSÃO                                  │  │
│  │                                                                           │  │
│  │   ┌─────────────────────────┐                                             │  │
│  │   │ worker.status == 'idle' │                                             │  │
│  │   │        OU               │──── SIM ────▶ Ir para 2.2 (Nova Sessão)     │  │
│  │   │ session_count >=        │                                             │  │
│  │   │ session_limit           │                                             │  │
│  │   └───────────┬─────────────┘                                             │  │
│  │               │ NÃO                                                       │  │
│  │               ▼                                                           │  │
│  │   ┌─────────────────────────┐                                             │  │
│  │   │ worker.status == 'ready'│──── SIM ────▶ Ir para 2.3 (Alocar Missão)   │  │
│  │   └───────────┬─────────────┘                                             │  │
│  │               │ NÃO                                                       │  │
│  │               ▼                                                           │  │
│  │   ┌─────────────────────────┐                                             │  │
│  │   │worker.status =='scraping│──── SIM ────▶ Ir para 2.4.4 (Monitorar)     │  │
│  │   └─────────────────────────┘                                             │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.2 INICIAR NOVA SESSÃO                                                   │  │
│  │                                                                           │  │
│  │   2.2.1 Se session_count >= session_limit:                                │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ DELETE {worker.url}/session                                 │   │  │
│  │         │ Headers: { "x-api-key": worker.api_key }                    │   │  │
│  │         │                                                             │   │  │
│  │         │ UPDATE workers SET session_count = 0 WHERE id = :worker_id  │   │  │
│  │         │                                                             │   │  │
│  │         │ UPDATE proxies SET in_use_by_worker_id = NULL               │   │  │
│  │         │ WHERE in_use_by_worker_id = :worker_id                      │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'session_terminated'           │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.2.2 Sortear e reservar proxy disponível:                              │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ WITH selected AS (                                          │   │  │
│  │         │   SELECT * FROM proxies                                     │   │  │
│  │         │   WHERE active = true AND in_use_by_worker_id IS NULL       │   │  │
│  │         │   ORDER BY RANDOM() LIMIT 1                                 │   │  │
│  │         │   FOR UPDATE SKIP LOCKED                                    │   │  │
│  │         │ )                                                           │   │  │
│  │         │ UPDATE proxies p                                            │   │  │
│  │         │ SET in_use_by_worker_id = :worker_id, last_used_at = now()  │   │  │
│  │         │ FROM selected s WHERE p.id = s.id                           │   │  │
│  │         │ RETURNING p.*                                               │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │         Se nenhum proxy disponível:                                       │  │
│  │         → Aguardar (outro worker pode liberar)                            │  │
│  │         → Logar evento e continuar polling                                │  │
│  │                                                                           │  │
│  │   2.2.3 Atualizar estado do worker:                                       │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE workers                                              │   │  │
│  │         │ SET status = 'initializing', updated_at = now()             │   │  │
│  │         │ WHERE id = :worker_id                                       │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.2.4 Chamar API do worker:                                             │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ POST {worker.url}/session                                   │   │  │
│  │         │ Headers: { "x-api-key": worker.api_key }                    │   │  │
│  │         │ Body: {                                                     │   │  │
│  │         │   "force_refresh": true,                                    │   │  │
│  │         │   "proxy": {                                                │   │  │
│  │         │     "server": "{proxy.host}:{proxy.port}",                  │   │  │
│  │         │     "username": "{proxy.username}",                         │   │  │
│  │         │     "password": "{proxy.password}"                          │   │  │
│  │         │   }                                                         │   │  │
│  │         │ }                                                           │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'session_started'              │   │  │
│  │         │ details: { worker_id, proxy_name, proxy_id }                │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.2.5 Polling até sessão ready:                                         │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ Intervalo: 10 segundos                                      │   │  │
│  │         │ Timeout: 180 segundos                                       │   │  │
│  │         │                                                             │   │  │
│  │         │ GET {worker.url}/session/status                             │   │  │
│  │         │                                                             │   │  │
│  │         │ Tratamento por status:                                      │   │  │
│  │         │ ┌────────────────┬──────────────────────────────────────┐   │   │  │
│  │         │ │ initializing   │ Aguardar próximo polling             │   │   │  │
│  │         │ │ connecting     │ Aguardar próximo polling             │   │   │  │
│  │         │ │ authenticating │ Aguardar próximo polling             │   │   │  │
│  │         │ │ warming_up     │ Aguardar próximo polling             │   │   │  │
│  │         │ │ ready          │ ✓ Sucesso → worker.status = 'ready'  │   │   │  │
│  │         │ │ stuck          │ ✗ Erro → Liberar proxy, retry        │   │   │  │
│  │         │ │ disconnected   │ ✗ Erro → Liberar proxy, retry        │   │   │  │
│  │         │ │ terminated     │ ✗ Erro → Reiniciar processo          │   │   │  │
│  │         │ └────────────────┴──────────────────────────────────────┘   │   │  │
│  │         │                                                             │   │  │
│  │         │ Se timeout (180s): ERROR101, incrementar proxy.fail_count   │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.2.6 Sessão pronta:                                                    │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE workers                                              │   │  │
│  │         │ SET status = 'ready', updated_at = now()                    │   │  │
│  │         │ WHERE id = :worker_id                                       │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'session_ready'                │   │  │
│  │         │ details: { worker_id, duration_ms }                         │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.3 ALOCAR MISSÃO                                                         │  │
│  │                                                                           │  │
│  │   2.3.1 Verificar se há missão na fila:                                   │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ SELECT COUNT(*) FROM missions WHERE status = 'queued'       │   │  │
│  │         │                                                             │   │  │
│  │         │ Se count = 0: Worker permanece 'ready', aguarda próximo poll│   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.3.2 Selecionar próxima missão (atômico, evita race condition):        │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ WITH next_mission AS (                                      │   │  │
│  │         │   SELECT id FROM missions                                   │   │  │
│  │         │   WHERE status = 'queued'                                   │   │  │
│  │         │   ORDER BY queued_at ASC                                    │   │  │
│  │         │   LIMIT 1                                                   │   │  │
│  │         │   FOR UPDATE SKIP LOCKED                                    │   │  │
│  │         │ )                                                           │   │  │
│  │         │ UPDATE missions m                                           │   │  │
│  │         │ SET status = 'running',                                     │   │  │
│  │         │     checkpoint = 'extracao',                                │   │  │
│  │         │     worker_id = :worker_id,                                 │   │  │
│  │         │     proxy_used = :proxy_name,                               │   │  │
│  │         │     started_at = now()                                      │   │  │
│  │         │ FROM next_mission nm                                        │   │  │
│  │         │ WHERE m.id = nm.id                                          │   │  │
│  │         │ RETURNING m.*                                               │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.3.3 Atualizar worker:                                                 │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE workers                                              │   │  │
│  │         │ SET status = 'scraping',                                    │   │  │
│  │         │     current_mission_id = :mission_id,                       │   │  │
│  │         │     updated_at = now()                                      │   │  │
│  │         │ WHERE id = :worker_id                                       │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'mission_assigned'             │   │  │
│  │         │ details: { worker_id, proxy_name, mission_id }              │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.4 EXECUTAR SCRAPE                                                       │  │
│  │                                                                           │  │
│  │   2.4.1 Formatar payload com dados da missão:                             │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ {                                                           │   │  │
│  │         │   "filters": {                                              │   │  │
│  │         │     "date_range": {                                         │   │  │
│  │         │       "start": mission.date_start,  // formato: YYYY-MM-DD  │   │  │
│  │         │       "end": mission.date_end       // formato: YYYY-MM-DD  │   │  │
│  │         │     },                                                      │   │  │
│  │         │     "format": mission.media_type,   // 'all'|'video'|'image'│   │  │
│  │         │     "sort_by": "qtd_ads",           // fixo                 │   │  │
│  │         │     "languages": mission.languages  // array: ["pt", "en"]  │   │  │
│  │         │   },                                                        │   │  │
│  │         │   "options": {                                              │   │  │
│  │         │     "max_ads": "all",               // fixo                 │   │  │
│  │         │     "batch_size": 150               // fixo                 │   │  │
│  │         │   }                                                         │   │  │
│  │         │ }                                                           │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.4.2 Iniciar scrape:                                                   │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ POST {worker.url}/scrape                                    │   │  │
│  │         │ Headers: { "x-api-key": worker.api_key }                    │   │  │
│  │         │ Body: <payload formatado acima>                             │   │  │
│  │         │                                                             │   │  │
│  │         │ Response: { "job_id": "scrape_3c434995" }                   │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.4.3 Salvar job_id na missão:                                          │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE missions                                             │   │  │
│  │         │ SET worker_job_id = :job_id                                 │   │  │
│  │         │ WHERE id = :mission_id                                      │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'scrape_started'               │   │  │
│  │         │ details: { worker_job_id, mission_id }                      │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.4.4 Polling até conclusão do job:                                     │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ Intervalo: 30 segundos                                      │   │  │
│  │         │ Timeout: 100 minutos                                        │   │  │
│  │         │                                                             │   │  │
│  │         │ GET {worker.url}/scrape/{job_id}                            │   │  │
│  │         │                                                             │   │  │
│  │         │ Tratamento por status:                                      │   │  │
│  │         │ ┌────────────┬────────────────────────────────────────────┐ │   │  │
│  │         │ │ pending    │ Aguardar próximo polling                   │ │   │  │
│  │         │ │ queued     │ Aguardar próximo polling                   │ │   │  │
│  │         │ │ running    │ Aguardar próximo polling                   │ │   │  │
│  │         │ │ completed  │ ✓ Sucesso → Ir para 2.5                    │ │   │  │
│  │         │ │ empty      │ ✓ Sucesso (0 ads) → ads_count=0, ir p/ 2.6 │ │   │  │
│  │         │ │ failed     │ ✗ ERROR200 → Avaliar retry                 │ │   │  │
│  │         │ │ cancelled  │ ✗ ERROR201 → Avaliar retry                 │ │   │  │
│  │         │ │ paused     │ ✗ Tratar como failed                       │ │   │  │
│  │         │ └────────────┴────────────────────────────────────────────┘ │   │  │
│  │         │                                                             │   │  │
│  │         │ Se timeout (100min): ERROR202, avaliar retry                │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.5 CONSTRUIR URL E LIBERAR PARA WRITER                                   │  │
│  │                                                                           │  │
│  │   2.5.1 Montar worker_data_url:                                           │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ Fórmula:                                                    │   │  │
│  │         │ https://{worker.storage_domain}/{job_id}/{job_id}_results.json │  │
│  │         │                                                             │   │  │
│  │         │ Exemplo:                                                    │   │  │
│  │         │ https://storage.meusite.com/scrape_3c434995/                │   │  │
│  │         │         scrape_3c434995_results.json                        │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   2.5.2 Atualizar missão:                                                 │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE missions                                             │   │  │
│  │         │ SET checkpoint = 'armazenamento',                           │   │  │
│  │         │     worker_data_url = :url,                                 │   │  │
│  │         │     ads_count = :ads_count_from_response                    │   │  │
│  │         │ WHERE id = :mission_id                                      │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'scrape_completed'             │   │  │
│  │         │ details: { worker_job_id, ads_count, duration_ms }          │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2.6 LIBERAR WORKER                                                        │  │
│  │                                                                           │  │
│  │   2.6.1 Incrementar contador e atualizar estado:                          │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE workers                                              │   │  │
│  │         │ SET status = 'ready',                                       │   │  │
│  │         │     session_count = session_count + 1,                      │   │  │
│  │         │     current_mission_id = NULL,                              │   │  │
│  │         │     updated_at = now()                                      │   │  │
│  │         │ WHERE id = :worker_id                                       │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   → Worker disponível para próxima missão (volta para 2.1)                │  │
│  │                                                                           │  │
│  │   NOTA: A missão agora está com checkpoint = 'armazenamento'              │  │
│  │         e será processada pela Fase 3 (Writer) em paralelo                │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Fase 3: Writer

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FASE 3: WRITER (DETALHADO)                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Trigger: Missão com checkpoint = 'armazenamento' e writer_job_id IS NULL       │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 3.1 INICIAR PROCESSAMENTO                                                 │  │
│  │                                                                           │  │
│  │   3.1.1 Selecionar writer ativo:                                          │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ SELECT * FROM writers WHERE active = true LIMIT 1           │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   3.1.2 Chamar API do writer:                                             │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ POST {writer.url}/process                                   │   │  │
│  │         │ Headers: { "x-api-key": writer.api_key }                    │   │  │
│  │         │ Body: {                                                     │   │  │
│  │         │   "config": {                                               │   │  │
│  │         │     "table": "ads",                                         │   │  │
│  │         │     "schema": "public",                                     │   │  │
│  │         │     "operation": "upsert",                                  │   │  │
│  │         │     "conflict_key": "id"                                    │   │  │
│  │         │   },                                                        │   │  │
│  │         │   "source": {                                               │   │  │
│  │         │     "type": "url",                                          │   │  │
│  │         │     "url": mission.worker_data_url,                         │   │  │
│  │         │     "json_path": "ads"                                      │   │  │
│  │         │   }                                                         │   │  │
│  │         │ }                                                           │   │  │
│  │         │                                                             │   │  │
│  │         │ Response: { "job_id": "550e8400-e29b-41d4-..." }            │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │   3.1.3 Salvar writer_job_id:                                             │  │
│  │         ┌─────────────────────────────────────────────────────────────┐   │  │
│  │         │ UPDATE missions                                             │   │  │
│  │         │ SET writer_job_id = :job_id                                 │   │  │
│  │         │ WHERE id = :mission_id                                      │   │  │
│  │         │                                                             │   │  │
│  │         │ INSERT INTO mission_logs ... 'writer_started'               │   │  │
│  │         │ details: { writer_job_id, data_url }                        │   │  │
│  │         └─────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 3.2 MONITORAR PROCESSAMENTO                                               │  │
│  │                                                                           │  │
│  │   Polling até conclusão:                                                  │  │
│  │   ┌───────────────────────────────────────────────────────────────────┐   │  │
│  │   │ Intervalo: 30 segundos                                            │   │  │
│  │   │                                                                   │   │  │
│  │   │ GET {writer.url}/status/{writer_job_id}                           │   │  │
│  │   │                                                                   │   │  │
│  │   │ Response exemplo:                                                 │   │  │
│  │   │ {                                                                 │   │  │
│  │   │   "job_id": "550e8400...",                                        │   │  │
│  │   │   "status": "completed",                                          │   │  │
│  │   │   "progress": {                                                   │   │  │
│  │   │     "total": 1500,                                                │   │  │
│  │   │     "processed": 1500,                                            │   │  │
│  │   │     "success_count": 1487,                                        │   │  │
│  │   │     "failed_count": 13                                            │   │  │
│  │   │   },                                                              │   │  │
│  │   │   "failed_items": [...]                                           │   │  │
│  │   │ }                                                                 │   │  │
│  │   │                                                                   │   │  │
│  │   │ Tratamento por status:                                            │   │  │
│  │   │ ┌─────────────┬─────────────────────────────────────────────────┐ │   │  │
│  │   │ │ processing  │ Aguardar próximo polling                        │ │   │  │
│  │   │ │ completed   │ ✓ Sucesso → Ir para 3.3                         │ │   │  │
│  │   │ │ partial     │ ⚠ Parcial → Logar failed_items, ir para 3.3     │ │   │  │
│  │   │ │ failed      │ ✗ Falhou → Avaliar retry (max 1)                │ │   │  │
│  │   │ └─────────────┴─────────────────────────────────────────────────┘ │   │  │
│  │   └───────────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 3.3 FINALIZAR MISSÃO                                                      │  │
│  │                                                                           │  │
│  │   Atualizar missão como concluída:                                        │  │
│  │   ┌───────────────────────────────────────────────────────────────────┐   │  │
│  │   │ UPDATE missions                                                   │   │  │
│  │   │ SET status = 'completed',                                         │   │  │
│  │   │     checkpoint = 'finalizado',                                    │   │  │
│  │   │     finished_at = now()                                           │   │  │
│  │   │ WHERE id = :mission_id                                            │   │  │
│  │   │                                                                   │   │  │
│  │   │ INSERT INTO mission_logs ... 'mission_completed'                  │   │  │
│  │   │ details: {                                                        │   │  │
│  │   │   total_duration_ms,                                              │   │  │
│  │   │   ads_count,                                                      │   │  │
│  │   │   success_count,                                                  │   │  │
│  │   │   failed_count                                                    │   │  │
│  │   │ }                                                                 │   │  │
│  │   └───────────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.4 Fluxo de Cancelamento

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CANCELAMENTO DE MISSÃO                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Trigger: Usuário clica "Cancelar" na interface                                 │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Verificar estado atual da missão:                                         │  │
│  │                                                                           │  │
│  │ ┌─────────────────┬───────────────────────────────────────────────────┐   │  │
│  │ │ status='queued' │ Cancelamento simples                              │   │  │
│  │ │                 │ → UPDATE status='canceled', finished_at=now()     │   │  │
│  │ ├─────────────────┼───────────────────────────────────────────────────┤   │  │
│  │ │ checkpoint=     │ Cancelar job no worker                            │   │  │
│  │ │ 'extracao'      │ → POST {worker.url}/scrape/{job_id}/cancel        │   │  │
│  │ │                 │ → UPDATE status='canceled', finished_at=now()     │   │  │
│  │ │                 │ → Liberar worker (status='ready')                 │   │  │
│  │ ├─────────────────┼───────────────────────────────────────────────────┤   │  │
│  │ │ checkpoint=     │ Writer não tem endpoint de cancelamento           │   │  │
│  │ │ 'armazenamento' │ → Aguardar conclusão ou marcar como canceled      │   │  │
│  │ │                 │ → UPDATE status='canceled', finished_at=now()     │   │  │
│  │ └─────────────────┴───────────────────────────────────────────────────┘   │  │
│  │                                                                           │  │
│  │ Logar evento:                                                             │  │
│  │ INSERT INTO mission_logs ... 'mission_canceled'                           │  │
│  │ details: { canceled_by: 'user', previous_checkpoint }                     │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.5 Fluxo de Encerramento

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    ENCERRAMENTO DO ORQUESTRADOR                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Trigger: Não há mais missões 'queued' E todas 'running' foram finalizadas      │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ Para cada worker ativo:                                                   │  │
│  │                                                                           │  │
│  │   1. Encerrar sessão:                                                     │  │
│  │      DELETE {worker.url}/session                                          │  │
│  │                                                                           │  │
│  │   2. Liberar proxy:                                                       │  │
│  │      UPDATE proxies SET in_use_by_worker_id = NULL                        │  │
│  │      WHERE in_use_by_worker_id = :worker_id                               │  │
│  │                                                                           │  │
│  │   3. Resetar worker:                                                      │  │
│  │      UPDATE workers                                                       │  │
│  │      SET status = 'idle',                                                 │  │
│  │          session_count = 0,                                               │  │
│  │          current_mission_id = NULL                                        │  │
│  │      WHERE id = :worker_id                                                │  │
│  │                                                                           │  │
│  │   4. Logar:                                                               │  │
│  │      INSERT INTO mission_logs ... 'session_terminated'                    │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  NOTA: Writer não necessita de encerramento                                     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.6 Fluxo de Recuperação (Resiliência)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│               RECUPERAÇÃO APÓS FALHA DO ORQUESTRADOR                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  Cenário: Orquestrador caiu durante execução (Edge Function timeout, erro, etc) │
│                                                                                 │
│  Ao reiniciar, o orquestrador deve:                                             │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. VERIFICAR MISSÕES ÓRFÃS                                                │  │
│  │                                                                           │  │
│  │    Missões com status='running' que podem estar inconsistentes:           │  │
│  │                                                                           │  │
│  │    SELECT m.*, w.status as worker_status                                  │  │
│  │    FROM missions m                                                        │  │
│  │    LEFT JOIN workers w ON m.worker_id = w.id                              │  │
│  │    WHERE m.status = 'running'                                             │  │
│  │                                                                           │  │
│  │    Para cada missão:                                                      │  │
│  │    ┌────────────────────┬─────────────────────────────────────────────┐   │  │
│  │    │ checkpoint =       │ Verificar status do job no worker           │   │  │
│  │    │ 'extracao'         │ GET {worker.url}/scrape/{worker_job_id}     │   │  │
│  │    │                    │ → Se completed: avançar para 'armazenamento'│   │  │
│  │    │                    │ → Se running: continuar monitorando         │   │  │
│  │    │                    │ → Se failed: aplicar retry ou falhar        │   │  │
│  │    │                    │ → Se não existe: resetar para 'queued'      │   │  │
│  │    ├────────────────────┼─────────────────────────────────────────────┤   │  │
│  │    │ checkpoint =       │ Verificar status do job no writer           │   │  │
│  │    │ 'armazenamento'    │ GET {writer.url}/status/{writer_job_id}     │   │  │
│  │    │                    │ → Se completed: finalizar missão            │   │  │
│  │    │                    │ → Se processing: continuar monitorando      │   │  │
│  │    │                    │ → Se failed: aplicar retry ou falhar        │   │  │
│  │    │                    │ → Se não existe: reenviar para writer       │   │  │
│  │    └────────────────────┴─────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. SINCRONIZAR ESTADO DOS WORKERS                                         │  │
│  │                                                                           │  │
│  │    Para cada worker ativo:                                                │  │
│  │    GET {worker.url}/session/status                                        │  │
│  │                                                                           │  │
│  │    Atualizar workers.status conforme resposta                             │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. LIBERAR PROXIES ÓRFÃOS                                                 │  │
│  │                                                                           │  │
│  │    UPDATE proxies                                                         │  │
│  │    SET in_use_by_worker_id = NULL                                         │  │
│  │    WHERE in_use_by_worker_id IN (                                         │  │
│  │      SELECT id FROM workers WHERE status = 'idle'                         │  │
│  │    )                                                                      │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Queries Críticas

### 6.1 Sortear e Reservar Proxy (Atômico)

```sql
-- Seleciona um proxy aleatório disponível e reserva para o worker
-- FOR UPDATE SKIP LOCKED evita deadlocks com outros workers
WITH selected_proxy AS (
  SELECT id, name, host, port, username, password
  FROM proxies
  WHERE active = true 
    AND in_use_by_worker_id IS NULL
  ORDER BY RANDOM()
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE proxies p
SET in_use_by_worker_id = :worker_id,
    last_used_at = now()
FROM selected_proxy sp
WHERE p.id = sp.id
RETURNING p.*;
```

### 6.2 Liberar Proxy

```sql
-- Libera o proxy usado pelo worker
UPDATE proxies
SET in_use_by_worker_id = NULL
WHERE in_use_by_worker_id = :worker_id;
```

### 6.3 Incrementar Falhas do Proxy

```sql
-- Incrementa contador de falhas e desativa se >= 3
UPDATE proxies
SET fail_count = fail_count + 1,
    active = CASE WHEN fail_count + 1 >= 3 THEN false ELSE active END
WHERE id = :proxy_id
RETURNING *;
```

### 6.4 Alocar Missão para Worker (Atômico)

```sql
-- Seleciona a próxima missão da fila e aloca para o worker
-- FOR UPDATE SKIP LOCKED evita que dois workers peguem a mesma missão
WITH next_mission AS (
  SELECT id
  FROM missions
  WHERE status = 'queued'
  ORDER BY queued_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE missions m
SET status = 'running',
    checkpoint = 'extracao',
    worker_id = :worker_id,
    proxy_used = :proxy_name,
    started_at = now()
FROM next_mission nm
WHERE m.id = nm.id
RETURNING m.*;
```

### 6.5 Listar Workers Disponíveis

```sql
-- Workers que podem receber novas missões
SELECT 
  w.*,
  p.name as current_proxy_name
FROM workers w
LEFT JOIN proxies p ON p.in_use_by_worker_id = w.id
WHERE w.active = true
  AND w.status IN ('idle', 'ready')
  AND w.current_mission_id IS NULL;
```

### 6.6 Listar Missões Pendentes no Writer

```sql
-- Missões aguardando ou em processamento no writer
SELECT *
FROM missions
WHERE status = 'running'
  AND checkpoint = 'armazenamento';
```

### 6.7 Verificar Se Deve Encerrar

```sql
-- Verifica se ainda há trabalho pendente
SELECT 
  COUNT(*) FILTER (WHERE status = 'queued') as queued_count,
  COUNT(*) FILTER (WHERE status = 'running') as running_count
FROM missions;
-- Se ambos = 0, pode encerrar
```

### 6.8 Buscar Missão com Detalhes para Log

```sql
-- Busca missão com informações de worker e proxy para auditoria
SELECT 
  m.*,
  w.name as worker_name,
  w.url as worker_url,
  m.proxy_used as proxy_name
FROM missions m
LEFT JOIN workers w ON m.worker_id = w.id
WHERE m.id = :mission_id;
```

---

## 7. Tratamento de Erros

### 7.1 Códigos de Erro

#### Erros de Sessão (ERROR1xx)

| Código | Descrição | Fase | Ação |
|--------|-----------|------|------|
| ERROR100 | Erro genérico de sessão | Sessão | Retry com novo proxy |
| ERROR101 | Timeout de sessão (180s) | Sessão | Retry com novo proxy |
| ERROR102 | Sessão stuck | Sessão | Retry com novo proxy |
| ERROR103 | Sessão desconectada | Sessão | Retry com novo proxy |
| ERROR104 | Retry de sessão esgotado | Sessão | Falha definitiva |

#### Erros de Scrape (ERROR2xx)

| Código | Descrição | Fase | Ação |
|--------|-----------|------|------|
| ERROR200 | Job de scrape falhou | Scrape | Retry |
| ERROR201 | Job cancelado | Scrape | Retry |
| ERROR202 | Timeout de job (100min) | Scrape | Retry |
| ERROR203 | Retry de scrape esgotado | Scrape | Falha definitiva |

#### Erros de Writer (ERROR3xx)

| Código | Descrição | Fase | Ação |
|--------|-----------|------|------|
| ERROR300 | Erro genérico de writer | Writer | Retry |
| ERROR301 | Conexão recusada | Writer | Verificar config |
| ERROR302 | Timeout de conexão | Writer | Retry |
| ERROR303 | Erro de schema | Writer | Verificar estrutura |
| ERROR304 | Retry de writer esgotado | Writer | Falha definitiva |

#### Erros de Infraestrutura (ERROR4xx, ERROR5xx)

| Código | Descrição | Fase | Ação |
|--------|-----------|------|------|
| ERROR400 | Erro de S3/Storage | Storage | Retry manual |
| ERROR401 | Credenciais S3 inválidas | Storage | Verificar config |
| ERROR500 | Erro interno | Sistema | Verificar logs |
| ERROR501 | Nenhum proxy disponível | Sistema | Aguardar liberação |
| ERROR502 | Worker indisponível | Sistema | Verificar worker |

### 7.2 Política de Retry

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE RETRY                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐                                               │
│  │  Erro ocorre │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────┐                       │
│  │ É erro que permite retry?            │                       │
│  │ (ERROR1xx exceto 104, ERROR2xx       │                       │
│  │  exceto 203, ERROR300-303)           │                       │
│  └──────────────┬───────────────────────┘                       │
│         │                   │                                   │
│        SIM                 NÃO                                  │
│         │                   │                                   │
│         ▼                   ▼                                   │
│  ┌────────────────┐  ┌─────────────────┐                        │
│  │ retry_count <  │  │ Falha definitiva│                        │
│  │ max_retries?   │  │ status='failed' │                        │
│  │ (default: 2)   │  │ error_code=X    │                        │
│  └───────┬────────┘  └─────────────────┘                        │
│      │       │                                                  │
│     SIM     NÃO                                                 │
│      │       │                                                  │
│      ▼       ▼                                                  │
│  ┌────────┐ ┌─────────────────┐                                 │
│  │Executa │ │ Falha definitiva│                                 │
│  │ retry  │ │ status='failed' │                                 │
│  └───┬────┘ │ error_code=X03  │                                 │
│      │      └─────────────────┘                                 │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────┐                        │
│  │ UPDATE missions                     │                        │
│  │ SET retry_count = retry_count + 1   │                        │
│  │                                     │                        │
│  │ INSERT INTO mission_logs            │                        │
│  │ event: 'retry_triggered'            │                        │
│  │ details: { attempt, error_code }    │                        │
│  │                                     │                        │
│  │ Se erro de sessão (ERROR1xx):       │                        │
│  │   → Rotacionar proxy                │                        │
│  │   → Reiniciar sessão                │                        │
│  │                                     │                        │
│  │ Se erro de scrape (ERROR2xx):       │                        │
│  │   → Reenviar job de scrape          │                        │
│  │                                     │                        │
│  │ Se erro de writer (ERROR3xx):       │                        │
│  │   → Reenviar para writer            │                        │
│  └─────────────────────────────────────┘                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.3 Rotação de Proxy após Falha

```sql
-- 1. Incrementar fail_count do proxy atual
UPDATE proxies
SET fail_count = fail_count + 1,
    active = CASE WHEN fail_count + 1 >= 3 THEN false ELSE active END
WHERE in_use_by_worker_id = :worker_id;

-- 2. Liberar proxy atual
UPDATE proxies
SET in_use_by_worker_id = NULL
WHERE in_use_by_worker_id = :worker_id;

-- 3. Logar rotação
INSERT INTO mission_logs (mission_id, event, details)
VALUES (:mission_id, 'proxy_rotated', 
        '{"old_proxy": "...", "reason": "ERROR101"}');

-- 4. Selecionar novo proxy (query 6.1)
```

---

## 8. Configurações

### 8.1 Parâmetros Ajustáveis pelo Usuário

| Parâmetro | Default | Descrição | Onde configurar |
|-----------|---------|-----------|-----------------|
| `session_limit` | 5 | Missões por sessão antes de trocar proxy | Interface |
| `max_retries` | 2 | Tentativas antes de falha definitiva | Interface |

### 8.2 Parâmetros Fixos do Sistema

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| `timeout_session` | 180s | Timeout para sessão ficar ready |
| `timeout_job` | 100min | Timeout para job de scrape |
| `polling_session` | 10s | Intervalo de polling para sessão |
| `polling_job` | 30s | Intervalo de polling para job |
| `polling_ui` | 5s | Intervalo de atualização da interface |
| `max_proxy_failures` | 3 | Falhas antes de desativar proxy |

### 8.3 Parâmetros Fixos do Scrape

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| `sort_by` | "qtd_ads" | Ordenação dos resultados |
| `max_ads` | "all" | Extrair todos os anúncios |
| `batch_size` | 150 | Tamanho do lote de processamento |
| `force_refresh` | true | Sempre forçar nova sessão |

### 8.4 Parâmetros do Writer

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| `table` | "ads" | Tabela destino |
| `schema` | "public" | Schema do banco |
| `operation` | "upsert" | Tipo de operação |
| `conflict_key` | "id" | Coluna para resolução de conflito |
| `json_path` | "ads" | Campo do JSON com array de dados |

---

## 9. Referência de APIs

### 9.1 Worker API

#### Criar Sessão
```
POST {worker.url}/session
Headers: { "x-api-key": "{api_key}" }

Request:
{
  "force_refresh": true,
  "proxy": {
    "server": "proxy.example.com:8080",
    "username": "user",
    "password": "pass"
  }
}

Response: 200 OK
```

#### Status da Sessão
```
GET {worker.url}/session/status
Headers: { "x-api-key": "{api_key}" }

Response:
{
  "status": "ready" | "initializing" | "connecting" | "authenticating" | 
            "warming_up" | "scraping" | "stuck" | "disconnected" | "terminated"
}
```

#### Encerrar Sessão
```
DELETE {worker.url}/session
Headers: { "x-api-key": "{api_key}" }

Response: 200 OK
```

#### Iniciar Scrape
```
POST {worker.url}/scrape
Headers: { "x-api-key": "{api_key}" }

Request:
{
  "filters": {
    "date_range": { "start": "2025-01-15", "end": "2025-01-15" },
    "format": "video",
    "sort_by": "qtd_ads",
    "languages": ["pt"]
  },
  "options": {
    "max_ads": "all",
    "batch_size": 150
  }
}

Response:
{
  "job_id": "scrape_3c434995"
}
```

#### Status do Job
```
GET {worker.url}/scrape/{job_id}
Headers: { "x-api-key": "{api_key}" }

Response:
{
  "status": "pending" | "queued" | "running" | "completed" | 
            "empty" | "failed" | "cancelled" | "paused",
  "ads_count": 1234,
  "data": [...]
}
```

#### Cancelar Job
```
POST {worker.url}/scrape/{job_id}/cancel
Headers: { "x-api-key": "{api_key}" }

Response: 200 OK
```

### 9.2 Writer API

#### Iniciar Processamento
```
POST {writer.url}/process
Headers: { "x-api-key": "{api_key}" }

Request:
{
  "job_id": "uuid-opcional",
  "config": {
    "table": "ads",
    "schema": "public",
    "operation": "upsert",
    "conflict_key": "id"
  },
  "source": {
    "type": "url",
    "url": "https://storage.example.com/data.json",
    "headers": { "Authorization": "Bearer token" },
    "json_path": "ads"
  }
}

Response:
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing",
  "created_at": "2025-01-15T10:30:00Z"
}
```

#### Status do Job
```
GET {writer.url}/status/{job_id}
Headers: { "x-api-key": "{api_key}" }

Response:
{
  "job_id": "550e8400...",
  "status": "processing" | "completed" | "failed" | "partial",
  "progress": {
    "total": 1500,
    "processed": 1500,
    "success_count": 1487,
    "failed_count": 13
  },
  "failed_items": [
    {
      "index": 42,
      "data": { "id": "ad42", ... },
      "error": "duplicate key violates unique constraint"
    }
  ],
  "started_at": "2025-01-15T10:30:01Z",
  "completed_at": "2025-01-15T10:30:45Z"
}
```

#### Health Check
```
GET {writer.url}/health

Response:
{
  "status": "healthy"
}
```

### 9.3 Códigos HTTP Comuns

| Código | Descrição | Causa comum |
|--------|-----------|-------------|
| 200 | OK | Sucesso |
| 400 | Bad Request | Payload inválido |
| 401 | Unauthorized | API key inválida |
| 404 | Not Found | Job não encontrado |
| 413 | Payload Too Large | Dados excedem limite |
| 422 | Validation Error | Campos obrigatórios ausentes |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Internal Error | Erro no servidor |

---

## 10. Logs e Auditoria

### 10.1 Eventos Padrão

| Evento | Descrição | Campos em `details` |
|--------|-----------|---------------------|
| `mission_queued` | Missão adicionada à fila | `{ queued_by }` |
| `mission_assigned` | Missão atribuída a worker | `{ worker_id, worker_name, proxy_name }` |
| `mission_canceled` | Missão cancelada | `{ canceled_by, previous_checkpoint }` |
| `session_started` | Sessão sendo iniciada | `{ worker_id, proxy_id, proxy_name }` |
| `session_ready` | Sessão pronta | `{ worker_id, duration_ms }` |
| `session_failed` | Sessão falhou | `{ worker_id, error_code, proxy_name }` |
| `session_terminated` | Sessão encerrada | `{ worker_id, reason }` |
| `scrape_started` | Scrape iniciado | `{ worker_job_id, mission_config }` |
| `scrape_progress` | Progresso do scrape | `{ worker_job_id, ads_count, progress_pct }` |
| `scrape_completed` | Scrape concluído | `{ worker_job_id, ads_count, duration_ms }` |
| `scrape_failed` | Scrape falhou | `{ worker_job_id, error_code, error_message }` |
| `scrape_empty` | Scrape sem resultados | `{ worker_job_id }` |
| `writer_started` | Writer iniciou | `{ writer_job_id, data_url }` |
| `writer_progress` | Progresso do writer | `{ writer_job_id, processed, total }` |
| `writer_completed` | Writer concluiu | `{ writer_job_id, success_count, failed_count, duration_ms }` |
| `writer_failed` | Writer falhou | `{ writer_job_id, error }` |
| `mission_completed` | Missão finalizada | `{ total_duration_ms, ads_count, success_count }` |
| `mission_failed` | Missão falhou | `{ error_code, error_message, retry_count }` |
| `retry_triggered` | Retry iniciado | `{ attempt, error_code, phase }` |
| `proxy_rotated` | Proxy trocado | `{ old_proxy, new_proxy, reason }` |

### 10.2 Exemplo de Sequência de Logs

```
Timestamp           | Event              | Details
--------------------+--------------------+----------------------------------------
2025-01-15 10:00:01 | mission_queued     | { queued_by: "user" }
2025-01-15 10:00:05 | session_started    | { worker_id: "W1", proxy_name: "proxy-br-1" }
2025-01-15 10:00:45 | session_ready      | { worker_id: "W1", duration_ms: 40000 }
2025-01-15 10:00:46 | mission_assigned   | { worker_id: "W1", proxy_name: "proxy-br-1" }
2025-01-15 10:00:47 | scrape_started     | { worker_job_id: "scrape_abc123" }
2025-01-15 10:15:30 | scrape_completed   | { worker_job_id: "scrape_abc123", ads_count: 1500 }
2025-01-15 10:15:31 | writer_started     | { writer_job_id: "550e8400..." }
2025-01-15 10:16:15 | writer_completed   | { success_count: 1487, failed_count: 13 }
2025-01-15 10:16:16 | mission_completed  | { total_duration_ms: 975000, ads_count: 1500 }
```

### 10.3 Queries de Auditoria

#### Timeline de uma Missão
```sql
SELECT 
  ml.timestamp,
  ml.event,
  ml.details
FROM mission_logs ml
WHERE ml.mission_id = :mission_id
ORDER BY ml.timestamp ASC;
```

#### Missões com Falhas nas Últimas 24h
```sql
SELECT 
  m.id,
  m.status,
  m.error_code,
  m.error_message,
  m.retry_count,
  ml.timestamp as failed_at,
  ml.details
FROM missions m
JOIN mission_logs ml ON ml.mission_id = m.id
WHERE ml.event = 'mission_failed'
  AND ml.timestamp > now() - interval '24 hours'
ORDER BY ml.timestamp DESC;
```

#### Performance por Worker
```sql
SELECT 
  w.name as worker_name,
  COUNT(*) FILTER (WHERE ml.event = 'scrape_completed') as completed_count,
  COUNT(*) FILTER (WHERE ml.event = 'scrape_failed') as failed_count,
  AVG((ml.details->>'duration_ms')::int) 
    FILTER (WHERE ml.event = 'scrape_completed') as avg_duration_ms
FROM workers w
JOIN missions m ON m.worker_id = w.id
JOIN mission_logs ml ON ml.mission_id = m.id
WHERE ml.event IN ('scrape_completed', 'scrape_failed')
  AND ml.timestamp > now() - interval '7 days'
GROUP BY w.id, w.name;
```

#### Proxies Problemáticos
```sql
SELECT 
  p.name,
  p.host,
  p.fail_count,
  p.active,
  COUNT(*) FILTER (WHERE ml.event = 'session_failed') as session_failures,
  COUNT(*) FILTER (WHERE ml.event = 'proxy_rotated') as rotations
FROM proxies p
LEFT JOIN mission_logs ml ON ml.details->>'proxy_name' = p.name
  AND ml.event IN ('session_failed', 'proxy_rotated')
  AND ml.timestamp > now() - interval '7 days'
GROUP BY p.id, p.name, p.host, p.fail_count, p.active
ORDER BY p.fail_count DESC;
```

---

## Apêndice A: Checklist de Implementação

### Banco de Dados
- [ ] Criar tipo ENUM `worker_status`
- [ ] Criar tipo ENUM `mission_event`
- [ ] Adicionar valor 'finalizado' ao `checkpoint_type`
- [ ] Adicionar campo `status` em `workers`
- [ ] Adicionar campo `session_count` em `workers`
- [ ] Renomear `job_id` para `worker_job_id` em `missions`
- [ ] Adicionar campo `writer_job_id` em `missions`
- [ ] Adicionar campo `worker_data_url` em `missions`
- [ ] Adicionar campo `in_use_by_worker_id` em `proxies`
- [ ] Criar tabela `writers`
- [ ] Criar índices necessários

### Orquestrador
- [ ] Implementar loop principal
- [ ] Implementar gerenciamento de sessão
- [ ] Implementar alocação de missões (atômica)
- [ ] Implementar rotação de proxy
- [ ] Implementar monitoramento de jobs (worker)
- [ ] Implementar monitoramento de jobs (writer)
- [ ] Implementar tratamento de erros e retry
- [ ] Implementar recuperação após falha
- [ ] Implementar cancelamento de missões
- [ ] Implementar encerramento gracioso
- [ ] Implementar logging de eventos

### Interface
- [ ] Exibir status em tempo real
- [ ] Permitir cancelamento de missões
- [ ] Configurar session_limit
- [ ] Configurar max_retries
- [ ] Visualizar logs de auditoria
