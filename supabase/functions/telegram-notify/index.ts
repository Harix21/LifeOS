import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response(405, { error: "Method not allowed." });

  const authorization = request.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return response(401, { error: "Authentication is required." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !botToken) {
    return response(503, { error: "Telegram delivery is not configured on this Supabase project." });
  }

  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !userData.user) return response(401, { error: "Invalid or expired session." });

  let notificationId: string;
  try {
    const body = await request.json();
    if (typeof body.notification_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.notification_id)) {
      return response(400, { error: "A valid notification_id is required." });
    }
    notificationId = body.notification_id;
  } catch {
    return response(400, { error: "Invalid JSON request body." });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const userId = userData.user.id;
  const [{ data: connection, error: connectionError }, { data: notification, error: notificationError }] = await Promise.all([
    admin.from("telegram_connections").select("chat_id,is_enabled").eq("user_id", userId).maybeSingle(),
    admin.from("notifications").select("id,title,body").eq("user_id", userId).eq("id", notificationId).maybeSingle(),
  ]);
  if (connectionError || notificationError) return response(500, { error: "Could not verify notification ownership or Telegram settings." });
  if (!connection?.is_enabled || !connection.chat_id) return response(409, { error: "Telegram is not enabled for this account." });
  if (!notification) return response(404, { error: "Notification not found for this account." });

  const { data: allowed, error: rateError } = await admin.rpc("claim_telegram_rate_limit", { p_user_id: userId });
  if (rateError) return response(500, { error: "Could not verify Telegram rate limit." });
  if (!allowed) return response(429, { error: "Telegram rate limit reached. Try again in one minute." });

  const message = [String(notification.title).slice(0, 256), notification.body ? String(notification.body).slice(0, 3000) : ""]
    .filter(Boolean).join("\n");
  let status: "sent" | "failed" = "failed";
  let failureMessage: string | null = null;
  try {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: connection.chat_id, text: message }),
    });
    const result = await telegramResponse.json();
    if (!telegramResponse.ok || result.ok !== true) {
      failureMessage = typeof result.description === "string" ? result.description.slice(0, 500) : `Telegram returned HTTP ${telegramResponse.status}.`;
    } else status = "sent";
  } catch (error) {
    failureMessage = error instanceof Error ? error.message.slice(0, 500) : "Telegram request failed.";
  }

  const { error: logError } = await admin.from("telegram_delivery_log").insert({
    user_id: userId,
    notification_id: notification.id,
    status,
    error_message: failureMessage,
  });
  if (logError) return response(500, { error: "Notification delivery completed but its delivery log could not be saved." });
  if (status === "failed") return response(502, { error: failureMessage ?? "Telegram could not deliver this notification." });
  return response(200, { delivered: true });
});
