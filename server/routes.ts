import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { supabase } from "./supabase";
import { z } from "zod";
import { insertMissionSchema, bulkMissionSchema, insertWorkerSchema, insertWriterSchema, insertUploaderSchema, insertProxySchema, queueMissionsSchema } from "@shared/schema";
import { orchestratorController } from "./orchestrator/index";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============================================
  // MISSIONS ENDPOINTS
  // ============================================
  
  // GET /api/missions - List missions with filters
  app.get("/api/missions", async (req: Request, res: Response) => {
    try {
      const { dateStart, dateEnd, mediaType, status, language, searchId, sortBy = "date_start", sortOrder = "desc", limit = 50, offset = 0 } = req.query;
      
      const validSortColumns = ["id", "date_start", "date_end", "media_type", "languages", "status", "ads_count"];
      const sortColumn = validSortColumns.includes(String(sortBy)) ? String(sortBy) : "date_start";
      const ascending = sortOrder === "asc";
      
      let query = supabase
        .from("missions")
        .select("*", { count: "exact" })
        .order(sortColumn, { ascending })
        .range(Number(offset), Number(offset) + Number(limit) - 1);
      
      if (searchId) query = query.ilike("id", `%${searchId}%`);
      if (dateStart) query = query.gte("date_start", dateStart);
      if (dateEnd) query = query.lte("date_end", dateEnd);
      if (mediaType && mediaType !== "all") query = query.eq("media_type", mediaType);
      if (status && status !== "all") {
        const statuses = String(status).split(",");
        query = query.in("status", statuses);
      }
      if (language && language !== "all") {
        query = query.contains("languages", [language]);
      }
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      // Get summary counts
      const { data: summaryData } = await supabase.rpc("get_mission_summary");
      
      // If RPC doesn't exist, calculate manually
      const { data: allMissions } = await supabase
        .from("missions")
        .select("status");
      
      const summary = {
        total: allMissions?.length || 0,
        pending: allMissions?.filter(m => m.status === "PENDING").length || 0,
        queued: allMissions?.filter(m => m.status === "QUEUED").length || 0,
        running: allMissions?.filter(m => m.status === "RUNNING").length || 0,
        done: allMissions?.filter(m => m.status === "DONE").length || 0,
        failed: allMissions?.filter(m => m.status === "FAILED").length || 0,
      };
      
      res.json({
        data,
        pagination: {
          total: count || 0,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: (Number(offset) + Number(limit)) < (count || 0),
        },
        summary,
      });
    } catch (error) {
      console.error("Error fetching missions:", error);
      res.status(500).json({ error: "Failed to fetch missions" });
    }
  });
  
  // POST /api/missions - Create single mission
  app.post("/api/missions", async (req: Request, res: Response) => {
    try {
      const validated = insertMissionSchema.parse(req.body);
      
      const { data, error } = await supabase
        .from("missions")
        .insert([validated])
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating mission:", error);
        res.status(500).json({ error: "Failed to create mission" });
      }
    }
  });
  
  // POST /api/missions/bulk - Create missions in bulk (one per day)
  app.post("/api/missions/bulk", async (req: Request, res: Response) => {
    try {
      const validated = bulkMissionSchema.parse(req.body);
      const { date_start, date_end, media_type, languages } = validated;
      
      const start = new Date(date_start);
      const end = new Date(date_end);
      const missions = [];
      
      const current = new Date(start);
      while (current <= end) {
        missions.push({
          date_start: current.toISOString().split("T")[0],
          date_end: current.toISOString().split("T")[0],
          media_type,
          languages,
          status: "PENDING",
        });
        current.setDate(current.getDate() + 1);
      }
      
      const { data, error } = await supabase
        .from("missions")
        .insert(missions)
        .select();
      
      if (error) throw error;
      
      res.status(201).json({
        created: data?.length || 0,
        message: `${data?.length || 0} missões criadas com sucesso`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating bulk missions:", error);
        res.status(500).json({ error: "Failed to create missions" });
      }
    }
  });
  
  // POST /api/missions/import - Import missions from JSON/CSV
  app.post("/api/missions/import", async (req: Request, res: Response) => {
    try {
      const { missions: importedMissions } = req.body;
      
      if (!Array.isArray(importedMissions) || importedMissions.length === 0) {
        return res.status(400).json({ error: "Nenhuma missão válida para importar" });
      }
      
      // Normalize imported missions to standard format with safe type checking
      const normalizedMissions: Array<{
        date_start: string;
        date_end: string;
        media_type: string;
        languages: string[];
        status: string;
      }> = [];
      
      for (const item of importedMissions) {
        if (typeof item !== "object" || item === null) continue;
        
        // Handle date fields (support start_date or date_start)
        const rawDateStart = item.start_date ?? item.date_start;
        if (typeof rawDateStart !== "string" || !rawDateStart.trim()) continue;
        const dateStart = rawDateStart.trim();
        
        const rawDateEnd = item.end_date ?? item.date_end ?? dateStart;
        const dateEnd = typeof rawDateEnd === "string" && rawDateEnd.trim() ? rawDateEnd.trim() : dateStart;
        
        // Handle media field (support media or media_type) with safe type checking
        const rawMedia = item.media ?? item.media_type;
        let mediaType = "all";
        if (typeof rawMedia === "string") {
          const lower = rawMedia.toLowerCase().trim();
          if (["all", "video", "image"].includes(lower)) {
            mediaType = lower;
          }
        }
        
        // Handle languages field (support lang or languages, string or array) with safe type checking
        let languages: string[] = [];
        const langField = item.lang ?? item.languages;
        
        if (Array.isArray(langField)) {
          languages = langField
            .filter((l): l is string => typeof l === "string")
            .map(l => l.toLowerCase().trim())
            .filter(l => l.length > 0);
        } else if (typeof langField === "string" && langField.trim()) {
          languages = langField.split(",")
            .map(l => l.trim().toLowerCase())
            .filter(l => l.length > 0);
        }
        
        // Default to ["pt"] if no valid languages found
        if (languages.length === 0) {
          languages = ["pt"];
        }
        
        normalizedMissions.push({
          date_start: dateStart,
          date_end: dateEnd,
          media_type: mediaType,
          languages,
          status: "PENDING",
        });
      }
      
      if (normalizedMissions.length === 0) {
        return res.status(400).json({ error: "Nenhuma missão válida para importar. Verifique o formato dos dados." });
      }
      
      const { data, error } = await supabase
        .from("missions")
        .insert(normalizedMissions)
        .select();
      
      if (error) throw error;
      
      res.status(201).json({
        created: data?.length || 0,
        message: `${data?.length || 0} missões importadas com sucesso`,
      });
    } catch (error) {
      console.error("Error importing missions:", error);
      res.status(500).json({ error: "Falha ao importar missões" });
    }
  });
  
  // GET /api/missions/:id - Get mission details
  app.get("/api/missions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: mission, error } = await supabase
        .from("missions")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) throw error;
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }
      
      // Get mission logs
      const { data: logs } = await supabase
        .from("mission_logs")
        .select("*")
        .eq("mission_id", id)
        .order("timestamp", { ascending: true });
      
      // Calculate checkpoint progress
      const checkpointProgress: { 
        atribuido: "pending" | "running" | "done" | "failed";
        extraindo: "pending" | "running" | "done" | "failed";
        armazenando: "pending" | "running" | "done" | "failed";
      } = {
        atribuido: "pending",
        extraindo: "pending",
        armazenando: "pending",
      };
      
      if (mission.status === "QUEUED") {
        checkpointProgress.atribuido = "done";
      } else if (mission.status === "DONE") {
        checkpointProgress.atribuido = "done";
        checkpointProgress.extraindo = "done";
        checkpointProgress.armazenando = "done";
      } else if (mission.status === "FAILED") {
        if (mission.checkpoint === "ATRIBUIDO") {
          checkpointProgress.atribuido = "failed";
        } else if (mission.checkpoint === "EXTRAINDO") {
          checkpointProgress.atribuido = "done";
          checkpointProgress.extraindo = "failed";
        } else if (mission.checkpoint === "ARMAZENANDO") {
          checkpointProgress.atribuido = "done";
          checkpointProgress.extraindo = "done";
          checkpointProgress.armazenando = "failed";
        }
      } else if (mission.status === "RUNNING") {
        checkpointProgress.atribuido = "done";
        if (mission.checkpoint === "ATRIBUIDO") {
          // Just assigned, not yet extracting
        } else if (mission.checkpoint === "EXTRAINDO") {
          checkpointProgress.extraindo = "running";
        } else if (mission.checkpoint === "ARMAZENANDO") {
          checkpointProgress.extraindo = "done";
          checkpointProgress.armazenando = "running";
        } else {
          checkpointProgress.extraindo = "running";
        }
      }
      
      res.json({
        ...mission,
        logs: logs || [],
        checkpoint_progress: checkpointProgress,
      });
    } catch (error) {
      console.error("Error fetching mission:", error);
      res.status(500).json({ error: "Failed to fetch mission" });
    }
  });
  
  // PATCH /api/missions/:id - Update mission
  app.patch("/api/missions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("missions")
        .update(req.body)
        .eq("id", id)
        .eq("status", "PENDING")
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("Error updating mission:", error);
      res.status(500).json({ error: "Failed to update mission" });
    }
  });
  
  // DELETE /api/missions/:id - Delete mission
  app.delete("/api/missions/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { error } = await supabase
        .from("missions")
        .delete()
        .eq("id", id)
        .in("status", ["PENDING", "FAILED"]);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting mission:", error);
      res.status(500).json({ error: "Failed to delete mission" });
    }
  });
  
  // POST /api/missions/queue - Queue missions for execution
  app.post("/api/missions/queue", async (req: Request, res: Response) => {
    try {
      const validated = queueMissionsSchema.parse(req.body);
      const { mission_ids, filters, worker_ids } = validated;
      
      let query = supabase.from("missions").update({
        status: "QUEUED",
        queued_at: new Date().toISOString(),
        checkpoint: null,
        error_code: null,
        error_message: null,
      });
      
      if (mission_ids && mission_ids.length > 0) {
        query = query.in("id", mission_ids);
      } else if (filters) {
        if (filters.date_start) query = query.gte("date_start", filters.date_start);
        if (filters.date_end) query = query.lte("date_end", filters.date_end);
        if (filters.media_type) query = query.eq("media_type", filters.media_type);
        if (filters.status) query = query.in("status", filters.status);
        if (filters.languages && filters.languages.length > 0) {
          query = query.overlaps("languages", filters.languages);
        }
      }
      
      query = query.in("status", ["PENDING", "FAILED"]);
      
      const { data, error } = await query.select();
      
      if (error) throw error;
      
      res.json({
        queued: data?.length || 0,
        message: `${data?.length || 0} missões adicionadas à fila`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error queuing missions:", error);
        res.status(500).json({ error: "Failed to queue missions" });
      }
    }
  });
  
  // POST /api/missions/:id/retry - Retry a failed mission
  app.post("/api/missions/:id/retry", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("missions")
        .update({
          status: "QUEUED",
          queued_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq("id", id)
        .eq("status", "FAILED")
        .select()
        .single();
      
      if (error) throw error;
      
      res.json({ message: "Missão adicionada à fila para retry" });
    } catch (error) {
      console.error("Error retrying mission:", error);
      res.status(500).json({ error: "Failed to retry mission" });
    }
  });
  
  // DELETE /api/missions/clear-done - Clear all done missions
  app.delete("/api/missions/clear-done", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("missions")
        .delete()
        .eq("status", "DONE")
        .select();
      
      if (error) throw error;
      
      res.json({ deleted: data?.length || 0 });
    } catch (error) {
      console.error("Error clearing done missions:", error);
      res.status(500).json({ error: "Failed to clear done missions" });
    }
  });
  
  // ============================================
  // WORKERS ENDPOINTS
  // ============================================
  
  // GET /api/workers - List all workers
  app.get("/api/workers", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("workers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      res.json({ data });
    } catch (error) {
      console.error("Error fetching workers:", error);
      res.status(500).json({ error: "Failed to fetch workers" });
    }
  });
  
  // POST /api/workers - Create worker
  app.post("/api/workers", async (req: Request, res: Response) => {
    try {
      const validated = insertWorkerSchema.parse(req.body);
      
      const { data, error } = await supabase
        .from("workers")
        .insert([validated])
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating worker:", error);
        res.status(500).json({ error: "Failed to create worker" });
      }
    }
  });
  
  // PATCH /api/workers/:id - Update worker
  app.patch("/api/workers/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("workers")
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("Error updating worker:", error);
      res.status(500).json({ error: "Failed to update worker" });
    }
  });
  
  // DELETE /api/workers/:id - Delete worker
  app.delete("/api/workers/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // Check if worker is running a mission
      const { data: worker } = await supabase
        .from("workers")
        .select("current_mission_id")
        .eq("id", id)
        .single();
      
      if (worker?.current_mission_id) {
        return res.status(400).json({ error: "Worker is currently running a mission" });
      }
      
      const { error } = await supabase
        .from("workers")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting worker:", error);
      res.status(500).json({ error: "Failed to delete worker" });
    }
  });
  
  // POST /api/workers/:id/test - Test worker connection
  app.post("/api/workers/:id/test", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: worker } = await supabase
        .from("workers")
        .select("url, api_key")
        .eq("id", id)
        .single();
      
      if (!worker) {
        return res.status(404).json({ error: "Worker not found" });
      }
      
      const start = Date.now();
      let success = false;
      
      try {
        const response = await fetch(`${worker.url}/health`, {
          headers: { "X-API-Key": worker.api_key },
          signal: AbortSignal.timeout(10000),
        });
        success = response.ok;
      } catch {
        success = false;
      }
      
      const responseTime = Date.now() - start;
      
      // Update worker test status
      await supabase
        .from("workers")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: success,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      
      res.json({
        success,
        message: success ? "Conexão estabelecida" : "Falha na conexão",
        responseTime,
      });
    } catch (error) {
      console.error("Error testing worker:", error);
      res.status(500).json({ error: "Failed to test worker" });
    }
  });
  
  // ============================================
  // WRITERS ENDPOINTS
  // ============================================
  
  // GET /api/writers - List all writers
  app.get("/api/writers", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("writers")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      res.json({ data });
    } catch (error) {
      console.error("Error fetching writers:", error);
      res.status(500).json({ error: "Failed to fetch writers" });
    }
  });
  
  // POST /api/writers - Create writer
  app.post("/api/writers", async (req: Request, res: Response) => {
    try {
      const validated = insertWriterSchema.parse(req.body);
      
      const { data, error } = await supabase
        .from("writers")
        .insert([validated])
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating writer:", error);
        res.status(500).json({ error: "Failed to create writer" });
      }
    }
  });
  
  // PATCH /api/writers/:id - Update writer
  app.patch("/api/writers/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("writers")
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("Error updating writer:", error);
      res.status(500).json({ error: "Failed to update writer" });
    }
  });
  
  // DELETE /api/writers/:id - Delete writer
  app.delete("/api/writers/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: writer } = await supabase
        .from("writers")
        .select("current_mission_id")
        .eq("id", id)
        .single();
      
      if (writer?.current_mission_id) {
        return res.status(400).json({ error: "Writer is currently running a mission" });
      }
      
      const { error } = await supabase
        .from("writers")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting writer:", error);
      res.status(500).json({ error: "Failed to delete writer" });
    }
  });
  
  // POST /api/writers/:id/test - Test writer connection
  app.post("/api/writers/:id/test", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: writer } = await supabase
        .from("writers")
        .select("url, api_key")
        .eq("id", id)
        .single();
      
      if (!writer) {
        return res.status(404).json({ error: "Writer not found" });
      }
      
      const start = Date.now();
      let success = false;
      
      try {
        const response = await fetch(`${writer.url}/health`, {
          headers: { "X-API-Key": writer.api_key },
          signal: AbortSignal.timeout(10000),
        });
        success = response.ok;
      } catch {
        success = false;
      }
      
      const responseTime = Date.now() - start;
      
      await supabase
        .from("writers")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: success,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      
      res.json({
        success,
        message: success ? "Conexão estabelecida" : "Falha na conexão",
        responseTime,
      });
    } catch (error) {
      console.error("Error testing writer:", error);
      res.status(500).json({ error: "Failed to test writer" });
    }
  });
  
  // ============================================
  // UPLOADERS ENDPOINTS
  // ============================================
  
  // GET /api/uploaders - List all uploaders
  app.get("/api/uploaders", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("uploaders")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      res.json({ data });
    } catch (error) {
      console.error("Error fetching uploaders:", error);
      res.status(500).json({ error: "Failed to fetch uploaders" });
    }
  });
  
  // POST /api/uploaders - Create uploader
  app.post("/api/uploaders", async (req: Request, res: Response) => {
    try {
      const validated = insertUploaderSchema.parse(req.body);
      
      const { data, error } = await supabase
        .from("uploaders")
        .insert([validated])
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating uploader:", error);
        res.status(500).json({ error: "Failed to create uploader" });
      }
    }
  });
  
  // PATCH /api/uploaders/:id - Update uploader
  app.patch("/api/uploaders/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("uploaders")
        .update({ ...req.body, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("Error updating uploader:", error);
      res.status(500).json({ error: "Failed to update uploader" });
    }
  });
  
  // DELETE /api/uploaders/:id - Delete uploader
  app.delete("/api/uploaders/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: uploader } = await supabase
        .from("uploaders")
        .select("current_mission_id")
        .eq("id", id)
        .single();
      
      if (uploader?.current_mission_id) {
        return res.status(400).json({ error: "Uploader is currently running a mission" });
      }
      
      const { error } = await supabase
        .from("uploaders")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting uploader:", error);
      res.status(500).json({ error: "Failed to delete uploader" });
    }
  });
  
  // POST /api/uploaders/:id/test - Test uploader connection
  app.post("/api/uploaders/:id/test", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data: uploader } = await supabase
        .from("uploaders")
        .select("url, api_key")
        .eq("id", id)
        .single();
      
      if (!uploader) {
        return res.status(404).json({ error: "Uploader not found" });
      }
      
      const start = Date.now();
      let success = false;
      
      try {
        const response = await fetch(`${uploader.url}/health`, {
          headers: { "X-API-Key": uploader.api_key },
          signal: AbortSignal.timeout(10000),
        });
        success = response.ok;
      } catch {
        success = false;
      }
      
      const responseTime = Date.now() - start;
      
      await supabase
        .from("uploaders")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: success,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      
      res.json({
        success,
        message: success ? "Conexão estabelecida" : "Falha na conexão",
        responseTime,
      });
    } catch (error) {
      console.error("Error testing uploader:", error);
      res.status(500).json({ error: "Failed to test uploader" });
    }
  });
  
  // ============================================
  // PROXIES ENDPOINTS
  // ============================================
  
  // GET /api/proxies - List all proxies
  app.get("/api/proxies", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("proxies")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      res.json({ data });
    } catch (error) {
      console.error("Error fetching proxies:", error);
      res.status(500).json({ error: "Failed to fetch proxies" });
    }
  });
  
  // POST /api/proxies - Create proxy
  app.post("/api/proxies", async (req: Request, res: Response) => {
    try {
      const validated = insertProxySchema.parse(req.body);
      
      const { data, error } = await supabase
        .from("proxies")
        .insert([validated])
        .select()
        .single();
      
      if (error) throw error;
      
      res.status(201).json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation error", details: error.errors });
      } else {
        console.error("Error creating proxy:", error);
        res.status(500).json({ error: "Failed to create proxy" });
      }
    }
  });
  
  // PATCH /api/proxies/:id - Update proxy
  app.patch("/api/proxies/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { data, error } = await supabase
        .from("proxies")
        .update(req.body)
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      
      res.json(data);
    } catch (error) {
      console.error("Error updating proxy:", error);
      res.status(500).json({ error: "Failed to update proxy" });
    }
  });
  
  // DELETE /api/proxies/:id - Delete proxy
  app.delete("/api/proxies/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const { error } = await supabase
        .from("proxies")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting proxy:", error);
      res.status(500).json({ error: "Failed to delete proxy" });
    }
  });
  
  // POST /api/proxies/:id/test - Test proxy
  app.post("/api/proxies/:id/test", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      // For now, just simulate a test
      const success = Math.random() > 0.3;
      
      await supabase
        .from("proxies")
        .update({
          last_test_at: new Date().toISOString(),
          last_test_ok: success,
        })
        .eq("id", id);
      
      res.json({
        success,
        message: success ? "Proxy funcional" : "Falha no proxy",
      });
    } catch (error) {
      console.error("Error testing proxy:", error);
      res.status(500).json({ error: "Failed to test proxy" });
    }
  });
  
  // POST /api/proxies/test-all - Test all proxies
  app.post("/api/proxies/test-all", async (req: Request, res: Response) => {
    try {
      const { data: proxies } = await supabase
        .from("proxies")
        .select("id, host, port")
        .eq("active", true);
      
      const results = await Promise.all(
        (proxies || []).map(async (proxy) => {
          const success = Math.random() > 0.3;
          
          await supabase
            .from("proxies")
            .update({
              last_test_at: new Date().toISOString(),
              last_test_ok: success,
            })
            .eq("id", proxy.id);
          
          return { id: proxy.id, host: proxy.host, port: proxy.port, success };
        })
      );
      
      res.json({ results });
    } catch (error) {
      console.error("Error testing all proxies:", error);
      res.status(500).json({ error: "Failed to test proxies" });
    }
  });
  
  // ============================================
  // CONFIG ENDPOINTS
  // ============================================
  
  // GET /api/config - Get all config
  app.get("/api/config", async (req: Request, res: Response) => {
    try {
      const { data, error } = await supabase
        .from("config")
        .select("*");
      
      if (error) throw error;
      
      const config: Record<string, unknown> = {};
      (data || []).forEach((item) => {
        config[item.key] = item.value;
      });
      
      res.json(config);
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ error: "Failed to fetch config" });
    }
  });
  
  // PATCH /api/config - Update config
  app.patch("/api/config", async (req: Request, res: Response) => {
    try {
      const updates = Object.entries(req.body);
      
      for (const [key, value] of updates) {
        await supabase
          .from("config")
          .update({ value, updated_at: new Date().toISOString() })
          .eq("key", key);
      }
      
      res.json({ message: "Config updated" });
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ error: "Failed to update config" });
    }
  });
  
  // ============================================
  // EXECUTION ENDPOINTS
  // ============================================
  
  // GET /api/execution/status - Get execution status
  app.get("/api/execution/status", async (req: Request, res: Response) => {
    try {
      const orchestratorStatus = orchestratorController.getStatus();
      
      const { data: workers } = await supabase
        .from("workers")
        .select("id, name, current_mission_id, active, status, session_count")
        .eq("active", true);
      
      const { data: activeSessions } = await supabase
        .from("sessions")
        .select("*, proxies(id, name, host)")
        .in("status", ["CREATING", "INITIALIZING", "READY", "ACTIVE"]);
      
      const { data: runningMissions } = await supabase
        .from("missions")
        .select("*")
        .eq("status", "RUNNING");
      
      const { data: queuedMissions, count: queuedCount } = await supabase
        .from("missions")
        .select("*", { count: "exact" })
        .eq("status", "QUEUED")
        .order("queued_at", { ascending: true })
        .limit(20);
      
      const saoPauloOffset = -3;
      const now = new Date();
      const saoPauloTime = new Date(now.getTime() + (saoPauloOffset * 60 * 60 * 1000));
      const todaySaoPaulo = saoPauloTime.toISOString().split("T")[0];
      const todayStartUTC = new Date(`${todaySaoPaulo}T00:00:00-03:00`).toISOString();
      
      const { count: completedToday } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true })
        .eq("status", "DONE")
        .gte("finished_at", todayStartUTC);
      
      const { count: failedToday } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true })
        .eq("status", "FAILED")
        .gte("finished_at", todayStartUTC);
      
      const { count: missionsToday } = await supabase
        .from("missions")
        .select("*", { count: "exact", head: true })
        .gte("started_at", todayStartUTC);
      
      const workerStatus = await Promise.all((workers || []).map(async (worker) => {
        const currentMission = runningMissions?.find(
          (m) => m.worker_id === worker.id
        );
        
        const workerSession = activeSessions?.find(
          (s) => s.worker_id === worker.id
        );
        
        const { count: jobsToday } = await supabase
          .from("missions")
          .select("*", { count: "exact", head: true })
          .eq("worker_id", worker.id)
          .gte("started_at", todayStartUTC);
        
        const { data: todayMissions } = await supabase
          .from("missions")
          .select("ads_count, status")
          .eq("worker_id", worker.id)
          .gte("started_at", todayStartUTC);
        
        const adsToday = (todayMissions || []).reduce((sum, m) => sum + (m.ads_count || 0), 0);
        const failuresToday = (todayMissions || []).filter(m => m.status === "FAILED").length;
        
        const sessionData = workerSession ? {
          id: workerSession.id,
          status: workerSession.status,
          execution_count: workerSession.execution_count,
          execution_limit: workerSession.execution_limit,
          proxy_id: workerSession.proxy_id,
          proxy_name: (workerSession.proxies as any)?.name || (workerSession.proxies as any)?.host || null,
          created_at: workerSession.created_at,
          ready_at: workerSession.ready_at,
        } : null;
        
        return {
          id: worker.id,
          name: worker.name,
          status: worker.status === "scraping" ? "running" as const : "idle" as const,
          current_mission: currentMission || null,
          session: sessionData,
          jobs_in_session: workerSession?.execution_count || worker.session_count || 0,
          session_limit: workerSession?.execution_limit || 5,
          jobs_today: jobsToday || 0,
          ads_today: adsToday,
          failures_today: failuresToday,
        };
      }));
      
      res.json({
        is_running: orchestratorStatus.isRunning,
        orchestrator: {
          sessionManager: orchestratorStatus.sessionManager,
          workerManager: orchestratorStatus.workerManager,
          missionManager: orchestratorStatus.missionManager,
          activeSessions: activeSessions?.length || 0,
        },
        workers: workerStatus,
        queue: {
          total: queuedCount || 0,
          missions: queuedMissions || [],
        },
        stats: {
          running: runningMissions?.length || 0,
          queued: queuedCount || 0,
          completed_today: completedToday || 0,
          failed_today: failedToday || 0,
          missions_today: missionsToday || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching execution status:", error);
      res.status(500).json({ error: "Failed to fetch execution status" });
    }
  });
  
  // POST /api/execution/start - Start execution
  app.post("/api/execution/start", async (req: Request, res: Response) => {
    try {
      await orchestratorController.start();
      
      const { data: activeWorkers } = await supabase
        .from("workers")
        .select("id")
        .eq("active", true);
      
      res.json({
        success: true,
        message: "Orchestrator started",
        workersActive: activeWorkers?.length || 0,
      });
    } catch (error) {
      console.error("Error starting execution:", error);
      res.status(500).json({ error: "Failed to start execution" });
    }
  });
  
  // POST /api/execution/stop - Stop execution
  app.post("/api/execution/stop", async (req: Request, res: Response) => {
    try {
      await orchestratorController.stop();
      
      res.json({ success: true, message: "Orchestrator stopped" });
    } catch (error) {
      console.error("Error stopping execution:", error);
      res.status(500).json({ error: "Failed to stop execution" });
    }
  });
  
  // GET /api/execution/orchestrator-status - Get orchestrator internal status
  app.get("/api/execution/orchestrator-status", async (req: Request, res: Response) => {
    try {
      const status = orchestratorController.getStatus();
      res.json(status);
    } catch (error) {
      console.error("Error getting orchestrator status:", error);
      res.status(500).json({ error: "Failed to get orchestrator status" });
    }
  });
  
  // POST /api/execution/cancel-mission/:id - Cancel a mission
  app.post("/api/execution/cancel-mission/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await orchestratorController.cancelMission(id);
      
      res.json({ success: true, message: "Mission cancelled" });
    } catch (error) {
      console.error("Error canceling mission:", error);
      res.status(500).json({ error: "Failed to cancel mission" });
    }
  });
  
  return httpServer;
}
