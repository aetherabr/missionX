# Mission Control - Scrape Orchestration Dashboard

## Overview
Mission Control is a premium Enterprise/SaaS dashboard system designed for orchestrating scrape missions. It provides a comprehensive interface for managing scraping operations, offering real-time monitoring, worker management, and execution control. The project aims to streamline and automate complex data extraction processes for businesses, improving efficiency and data reliability.

## User Preferences
- Portuguese (Brazil) language for UI labels
- Premium SaaS aesthetic (Stripe/Vercel-inspired)
- Dark mode as default theme

## System Architecture
The system is built on a modern web stack with a clear separation of concerns between frontend, backend, and the core orchestration engine.

**UI/UX Decisions:**
- **Design:** Translucent cards with `backdrop-blur-md`, subtle borders, aiming for a premium SaaS aesthetic.
- **Color Scheme:** Primary color is Yellow (`#facc15` / `hsl(48 96% 53%)`).
- **Typography:** Uses Plus Jakarta Sans for general text and JetBrains Mono for monospaced elements.
- **Theming:** Dark mode is the default, with a toggle for light mode.
- **Layout:** Responsive layout with a collapsible sidebar (295px expanded, 80px collapsed, mobile slide-in).

**Technical Implementations & Feature Specifications:**
- **Core Orchestrator:** An event-driven architecture composed of three independent managers:
    - **SessionManager:** Manages proxy lifecycle, session creation, monitoring, and retries.
    - **WorkerManager:** Handles worker capacity, initiates scrapes, and monitors job status.
    - **MissionManager:** Manages mission queues, assignment, and integration with writers.
- **EventBus:** An in-memory pub/sub system facilitates decoupled communication between managers.
- **Polling Loops:** Each manager runs independent polling loops (e.g., sessions 5s, workers/missions 10s) for continuous state management.
- **Mission Flow:** Missions progress through states: `QUEUED` → `ATRIBUIDO` → `EXTRAINDO` → `ARMAZENANDO` → `FINALIZADO`.
- **Worker/Writer Integration:** Uses REST API calls for communication with external scraping workers and data persistence writers.
- **Session Monitoring:** Continuous polling of worker API for active session statuses, with automatic error detection (stuck, disconnected, failed phases) and robust error handling including proxy rotation and retry mechanisms.
- **Checkpoint Model:** Missions track progress using `atribuído`, `extraindo`, and `armazenando` checkpoints.
- **Atomic Allocation:** Utilizes PostgreSQL `FOR UPDATE SKIP LOCKED` for atomic allocation of proxies and missions to workers.
- **Configuration:** Centralized configuration management via a key-value store in the database.
- **Error Handling:** Implements a retry policy (max 2 retries) for recoverable errors and provides specific error codes for session, scrape, writer, and allocation failures.
- **API Endpoints:** Comprehensive RESTful API for managing missions, workers, writers, uploaders, proxies, and system configuration, including bulk operations and connection testing.
- **Admin Features:** CRUD operations for workers, writers, uploaders, and proxies, each with their own database tables and dedicated UI tabs.

**System Design Choices:**
- **Scalability:** The event-driven, decoupled manager architecture allows for easier scaling of individual components.
- **Data Integrity:** Atomic database operations ensure consistent resource allocation.
- **Observability:** Detailed logging and status endpoints (`/api/execution/orchestrator-status`) provide insights into the orchestrator's state.

## External Dependencies
- **Frontend Framework:** React + TypeScript + Vite
- **Styling Framework:** Tailwind CSS
- **State Management:** TanStack Query v5
- **Backend Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **UI Components:** shadcn/ui
- **Worker API:** Custom external API for scraping workers
- **Writer API:** Custom external API for data persistence
- **Uploader API:** Custom external API for file upload services (currently temporarily disabled)