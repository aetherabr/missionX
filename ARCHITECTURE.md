# Arquitetura do Orchestrator - Mission Control

## Visão Geral

Este documento descreve a arquitetura modular do sistema de orquestração de scraping, separando responsabilidades em três managers independentes que se comunicam via eventos.

---

## Problema da Arquitetura Anterior

### Código Monolítico
```
orchestratorLoop() {
  processIdleWorkers()      // Aloca proxy, cria sessão, espera ready, inicia scrape
  processRunningMissions()  // Verifica status do scrape
  monitorActiveSessions()   // Monitora sessões ativas
  processWritingMissions()  // Verifica status do writer
}
```

### Problemas Identificados

| Problema | Descrição | Impacto |
|----------|-----------|---------|
| **Domínios Misturados** | Sessão, Worker e Missão no mesmo loop | Regras confusas, difícil customizar |
| **Bloqueio Sequencial** | `waitForSessionReady` bloqueia todo o loop | Writers não verificados enquanto espera |
| **Propagação Inconsistente** | Múltiplos handlers tocam mesmas linhas | Race conditions, retries perdidos |
| **Estados Imperativos** | Mutações sem máquinas de estado | Combinações impossíveis (worker idle + sessão ACTIVE) |
| **Proxy no Worker** | Worker alocava proxy, mas sessão que usa | Lifecycle confuso, cleanup difícil |

---

## Nova Arquitetura: Event-Driven Managers

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                     OrchestratorController                       │
│  - Inicializa managers                                           │
│  - Gerencia estado global (running/stopped)                      │
│  - Expõe API endpoints                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          EventBus                                │
│  - Pub/Sub in-memory                                             │
│  - Eventos tipados                                               │
│  - Desacoplamento entre managers                                 │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  SessionManager │  │  WorkerManager  │  │ MissionManager  │
│                 │  │                 │  │                 │
│ - Cria sessões  │  │ - Capacidade    │  │ - Fila QUEUED   │
│ - Aloca proxy   │  │ - Inicia scrape │  │ - Atribuição    │
│ - Monitora      │  │ - Status worker │  │ - Writer        │
│ - Retry/rotate  │  │ - Polling job   │  │ - Retries       │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Supabase                                 │
│  sessions | workers | missions | proxies | mission_logs         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Responsabilidades por Manager

### SessionManager

**Domínio:** Lifecycle completo de sessões de browser

**Propriedade do Proxy:** SIM - Sessão é dona do proxy durante seu uso

**Estados:**
```
CREATING → INITIALIZING → READY → ACTIVE → ENDED
                ↓                    ↓
              ERROR ←────────────────┘
```

**Responsabilidades:**
1. Alocar proxy atomicamente com criação de sessão
2. Chamar Worker API: `POST /session`, `DELETE /session`
3. Polling de status: `GET /session/status`
4. Detectar erros (stuck, disconnected, terminated)
5. Retry com rotação de proxy (max 2 tentativas)
6. Liberar proxy quando sessão termina ou falha
7. Emitir eventos: `session:ready`, `session:error`, `session:ended`

**Cadência:** Loop de 5 segundos (sessões precisam monitoramento rápido)

---

### WorkerManager

**Domínio:** Capacidade e execução de scraping

**Propriedade do Proxy:** NÃO - Delega para SessionManager

**Estados:**
```
IDLE → WAITING_SESSION → READY → SCRAPING → IDLE
              ↓             ↓         ↓
            ERROR ←─────────┴─────────┘
```

**Responsabilidades:**
1. Verificar workers com capacidade disponível (status = idle)
2. Solicitar sessão ao SessionManager (não aloca proxy diretamente)
3. Quando recebe `session:ready`, iniciar scrape via `POST /scrape`
4. Polling de status do job: `GET /scrape/status`
5. Quando scrape completo, emitir `scrape:complete`
6. Atualizar status do worker no banco

**Cadência:** Loop de 10 segundos

---

### MissionManager

**Domínio:** Fila de missões e persistência

**Estados:**
```
PENDING → QUEUED → ATRIBUIDO → EXTRAINDO → ARMAZENANDO → FINALIZADO
                       ↓           ↓            ↓
                     FAILED ←──────┴────────────┘
```

**Responsabilidades:**
1. Buscar missões QUEUED para atribuição
2. Atribuir missão a worker disponível
3. Quando recebe `scrape:complete`, iniciar Writer
4. Polling de status do Writer
5. Quando Writer completo, marcar FINALIZADO
6. Gerenciar retries de missão (max 3)
7. Emitir eventos: `mission:assigned`, `mission:complete`, `mission:failed`

**Cadência:** Loop de 10 segundos

---

## Fluxo de Eventos

### Fluxo Normal (Sucesso)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. MissionManager encontra missão QUEUED                         │
│    → Emite: mission:needs_worker                                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. WorkerManager recebe evento, encontra worker IDLE             │
│    → Atribui missão ao worker                                    │
│    → Solicita sessão ao SessionManager                           │
│    → Emite: worker:requesting_session                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. SessionManager aloca proxy + cria sessão                      │
│    → Polling até ready                                           │
│    → Emite: session:ready { sessionId, workerId }                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. WorkerManager recebe session:ready                            │
│    → Inicia scrape via POST /scrape                              │
│    → Atualiza checkpoint: EXTRAINDO                              │
│    → Polling status do job                                       │
│    → Emite: scrape:complete { missionId, dataUrl }               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. MissionManager recebe scrape:complete                         │
│    → Inicia Writer                                               │
│    → Atualiza checkpoint: ARMAZENANDO                            │
│    → Polling status do Writer                                    │
│    → Marca missão FINALIZADO                                     │
└──────────────────────────────────────────────────────────────────┘
```

### Fluxo de Erro (Sessão Falha)

```
┌──────────────────────────────────────────────────────────────────┐
│ SessionManager detecta erro (stuck/disconnected/timeout)         │
│    → Libera proxy                                                │
│    → Marca sessão ERROR                                          │
│    → Emite: session:error { sessionId, workerId, error }         │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ WorkerManager recebe session:error                               │
│    → Marca worker IDLE (liberado para nova tentativa)            │
│    → Emite: worker:session_failed { workerId, missionId }        │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ MissionManager recebe worker:session_failed                      │
│    → Incrementa retry_count                                      │
│    → Se retry < 3: requeue missão (QUEUED)                       │
│    → Se retry >= 3: marca FAILED                                 │
└──────────────────────────────────────────────────────────────────┘
```

---

## Mudança no Schema: Proxy Ownership

### Antes (Incorreto)
```sql
proxies.in_use_by_worker_id  -- Worker "dono" do proxy
```

**Problema:** Worker não usa proxy diretamente, sessão usa.

### Depois (Correto)
```sql
proxies.in_use_by_session_id  -- Sessão "dona" do proxy
```

**Benefícios:**
1. Lifecycle claro: proxy alocado com sessão, liberado com sessão
2. Cleanup atômico: quando sessão termina, proxy é liberado automaticamente
3. Retry simplificado: SessionManager troca proxy sem mudar estado do worker

---

## Eventos do Sistema

### Eventos Emitidos

| Evento | Emissor | Payload | Consumidor |
|--------|---------|---------|------------|
| `session:ready` | SessionManager | `{ sessionId, workerId }` | WorkerManager |
| `session:error` | SessionManager | `{ sessionId, workerId, error }` | WorkerManager |
| `session:ended` | SessionManager | `{ sessionId }` | - |
| `worker:requesting_session` | WorkerManager | `{ workerId, missionId }` | SessionManager |
| `worker:session_failed` | WorkerManager | `{ workerId, missionId }` | MissionManager |
| `scrape:started` | WorkerManager | `{ missionId, jobId }` | - |
| `scrape:complete` | WorkerManager | `{ missionId, dataUrl }` | MissionManager |
| `scrape:failed` | WorkerManager | `{ missionId, error }` | MissionManager |
| `mission:assigned` | MissionManager | `{ missionId, workerId }` | - |
| `mission:complete` | MissionManager | `{ missionId }` | - |
| `mission:failed` | MissionManager | `{ missionId, error }` | - |

---

## Comparação: Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Estrutura** | Monolítico (1 loop) | Modular (3 managers) |
| **Comunicação** | Chamadas diretas | Eventos desacoplados |
| **Bloqueio** | Sequencial (waitForSessionReady) | Assíncrono (eventos) |
| **Proxy Ownership** | Worker | Sessão |
| **Cadência** | 10s para tudo | 5s sessões, 10s resto |
| **Estados** | Implícitos | Máquinas de estado explícitas |
| **Testabilidade** | Difícil | Managers isolados |
| **Retry** | Complexo, misturado | Claro, por manager |

---

## Arquivos da Implementação

```
server/
├── orchestrator/
│   ├── index.ts              # OrchestratorController
│   ├── EventBus.ts           # Sistema de eventos
│   ├── SessionManager.ts     # Gerenciamento de sessões
│   ├── WorkerManager.ts      # Gerenciamento de workers
│   ├── MissionManager.ts     # Gerenciamento de missões
│   └── types.ts              # Tipos e interfaces
├── orchestrator.ts           # [DEPRECATED] Código antigo
└── routes.ts                 # API endpoints
```

---

## Próximos Passos

1. ✅ Documentar arquitetura (este documento)
2. ⏳ Alterar schema: `in_use_by_session_id`
3. ⏳ Implementar EventBus
4. ⏳ Implementar SessionManager
5. ⏳ Implementar WorkerManager
6. ⏳ Implementar MissionManager
7. ⏳ Criar OrchestratorController
8. ⏳ Migrar rotas da API
9. ⏳ Testar ciclo completo
