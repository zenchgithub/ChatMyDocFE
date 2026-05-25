import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const app = new Hono();

app.use("*", logger(console.log));
app.use(
  "/*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
  }),
);

app.get("/make-server-5734546e/health", (c) => {
  return c.json({ status: "ok" });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getCaller(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const admin = adminClient();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  return { user, admin };
}

// ─── Admin: invite a user by email ────────────────────────────────────────────
// POST /admin/invite  — admin-only; sends a Supabase invite email.
app.post("/admin/invite", async (c) => {
  const caller = await getCaller(c.req.header("Authorization"));
  if (!caller) return c.json({ error: "Unauthorized" }, 401);

  if (caller.user.user_metadata?.role !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const { email, redirectTo } = body as { email?: string; redirectTo?: string };
  if (!email) return c.json({ error: "email is required" }, 400);

  const { error } = await caller.admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo ?? undefined,
  });
  if (error) return c.json({ error: error.message }, 400);

  // Track sent invites in KV
  const invites: { email: string; invitedAt: string; invitedBy: string }[] =
    (await kv.get("invites")) ?? [];
  invites.push({
    email,
    invitedAt: new Date().toISOString(),
    invitedBy: caller.user.email ?? "unknown",
  });
  await kv.set("invites", invites);

  return c.json({ success: true });
});

// ─── Admin: list sent invites ─────────────────────────────────────────────────
// GET /admin/invites  — admin-only.
app.get("/admin/invites", async (c) => {
  const caller = await getCaller(c.req.header("Authorization"));
  if (!caller) return c.json({ error: "Unauthorized" }, 401);

  if (caller.user.user_metadata?.role !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const invites = (await kv.get("invites")) ?? [];
  return c.json({ invites });
});

// ─── Admin: revoke/remove an invite record ────────────────────────────────────
// DELETE /admin/invites/:email  — admin-only (removes from tracking list only).
app.delete("/admin/invites/:email", async (c) => {
  const caller = await getCaller(c.req.header("Authorization"));
  if (!caller) return c.json({ error: "Unauthorized" }, 401);

  if (caller.user.user_metadata?.role !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const target = decodeURIComponent(c.req.param("email"));
  const invites: { email: string }[] = (await kv.get("invites")) ?? [];
  await kv.set("invites", invites.filter((i) => i.email !== target));

  return c.json({ success: true });
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Max-Age": "600",
};

// Handle preflight at the Deno.serve level — Supabase infrastructure
// intercepts OPTIONS before Hono middleware can respond to it.
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  return app.fetch(req);
});
