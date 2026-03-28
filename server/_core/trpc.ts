import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Throttle lastActiveAt updates to once per minute per user to avoid DB spam
const lastActiveCache = new Map<number, number>();
const ACTIVITY_THROTTLE_MS = 60_000;

async function updateLastActive(userId: number) {
  const now = Date.now();
  const lastUpdate = lastActiveCache.get(userId) || 0;
  if (now - lastUpdate < ACTIVITY_THROTTLE_MS) return;
  lastActiveCache.set(userId, now);
  try {
    const { users } = await import("../../drizzle/schema");
    const { getDb } = await import("../db");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
  } catch {
    // Non-critical — don't block the request
  }
}

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Fire-and-forget lastActiveAt update (throttled)
  updateLastActive(ctx.user.id);

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
