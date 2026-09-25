import Elysia from "elysia";
import { prisma } from "./database";

export class EventService {
  static async list() {
    return prisma.event.findMany({ where: { deleted: false } });
  }
}

export class CalendarService {
  static async listVisibleEvents() {
    return prisma.event.findMany({
      where: { deleted: false },
    });
  }
}

export function createApi() {
  return new Elysia().get("/events", async () => {
    const events = await EventService.list();
    const calendarEvents = await CalendarService.listVisibleEvents();
    const total = await prisma.event.count({ where: { deleted: false } });
    return { events, calendarEvents, total };
  });
}
