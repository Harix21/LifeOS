import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!accessToken || !url || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Authenticated account deletion is not configured." }), { status: accessToken ? 503 : 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !data.user) return new Response(JSON.stringify({ error: "Invalid or expired session." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return new Response(JSON.stringify({ error: "Account could not be deleted." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({ deleted: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
