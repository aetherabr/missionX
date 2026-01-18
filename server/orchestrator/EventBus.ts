import { EventPayloads, EventName } from "./types";

type EventHandler<T extends EventName> = (payload: EventPayloads[T]) => void | Promise<void>;

interface EventSubscription {
  id: string;
  handler: EventHandler<any>;
}

export class EventBus {
  private subscribers: Map<EventName, EventSubscription[]> = new Map();
  private eventHistory: Array<{ event: EventName; payload: any; timestamp: Date }> = [];
  private maxHistorySize = 1000;

  subscribe<T extends EventName>(event: T, handler: EventHandler<T>): () => void {
    const id = `${event}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const subscription: EventSubscription = { id, handler };

    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, []);
    }
    this.subscribers.get(event)!.push(subscription);

    console.log(`[EventBus] Subscribed to ${event} (id: ${id})`);

    return () => {
      const subs = this.subscribers.get(event);
      if (subs) {
        const index = subs.findIndex(s => s.id === id);
        if (index !== -1) {
          subs.splice(index, 1);
          console.log(`[EventBus] Unsubscribed from ${event} (id: ${id})`);
        }
      }
    };
  }

  async emit<T extends EventName>(event: T, payload: EventPayloads[T]): Promise<void> {
    console.log(`[EventBus] Emitting ${event}:`, JSON.stringify(payload));

    this.eventHistory.push({ event, payload, timestamp: new Date() });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const subs = this.subscribers.get(event);
    if (!subs || subs.length === 0) {
      console.log(`[EventBus] No subscribers for ${event}`);
      return;
    }

    const promises = subs.map(async (sub) => {
      try {
        await sub.handler(payload);
      } catch (error) {
        console.error(`[EventBus] Error in handler for ${event}:`, error);
      }
    });

    await Promise.all(promises);
  }

  getHistory(limit = 100): Array<{ event: EventName; payload: any; timestamp: Date }> {
    return this.eventHistory.slice(-limit);
  }

  getSubscriberCount(event: EventName): number {
    return this.subscribers.get(event)?.length || 0;
  }

  clear(): void {
    this.subscribers.clear();
    this.eventHistory = [];
    console.log("[EventBus] Cleared all subscribers and history");
  }
}

export const eventBus = new EventBus();
