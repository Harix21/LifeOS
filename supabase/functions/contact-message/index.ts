const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const body = await request.json() as { name?: unknown; email?: unknown; message?: unknown; website?: unknown };
    if (body.website) return json({ ok: true });
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200 || !message || message.length > 4000) {
      return json({ error: "Please provide a valid name, email, and message." }, 400);
    }
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const recipient = Deno.env.get("CONTACT_RECIPIENT");
    if (!resendKey || !recipient) return json({ error: "Contact service is not configured." }, 503);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "LifeOS Contact <onboarding@resend.dev>",
        to: [recipient],
        reply_to: email,
        subject: `LifeOS contact message from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
      }),
    });
    if (!response.ok) return json({ error: "The message could not be delivered." }, 502);
    return json({ ok: true });
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
});
