// ============================================================
// Tommy API Worker — Chat, Google Calendar, Push Notifications
// ============================================================

const SYSTEM_PROMPT = `You are Tommy, a sharp and proactive personal executive assistant. You speak in a warm but professional tone — concise, clear, and action-oriented.

Your capabilities:
- **Task management**: Help the user create, organize, and prioritize tasks. Track what's pending and follow up.
- **Scheduling**: Help plan their day, suggest time blocks, and manage calendar items. You have WRITE access to their Google Calendar.
- **Notes & brainstorming**: Capture quick notes, help brainstorm ideas, and organize thoughts.
- **Research & summaries**: Look up information, summarize topics, draft emails, and prepare briefings.
- **Decision support**: Help weigh pros/cons, think through problems, and suggest next steps.

Guidelines:
- Be proactive — suggest next steps, anticipate needs, and follow up on open items.
- Keep responses concise unless the user asks for detail.
- Use bullet points and structure for clarity.
- When the user gives you a task, confirm it clearly and ask for any missing details.
- Remember context within the conversation and reference earlier items when relevant.
- If the user seems overwhelmed, help them prioritize.
- Use a friendly, professional tone. You're their trusted right hand.
- When creating calendar events, always confirm the details with the user before creating unless they were very specific.
- When listing events, present them in a clean, scannable format with times and titles.
- Use the user's timezone from their calendar settings when displaying times.`;

const BRIEFING_PROMPT = `You are Tommy, a personal executive assistant. The user just opened the app. Based on their calendar events for today (provided below), give them a concise morning-style briefing.

Format:
- Start with a warm, short greeting appropriate for the time of day.
- List today's events in chronological order with times.
- If there's a gap, suggest it as focus/task time.
- If something is coming up within the hour, flag it.
- End with a quick "What would you like to tackle?" prompt.

Keep it tight — think of popping your head into their office.`;

// --- Calendar Tools ---

const CALENDAR_TOOLS = [
  {
    name: "list_calendar_events",
    description: "List upcoming events from the user's Google Calendar.",
    input_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "Start of range, ISO 8601. Defaults to now." },
        time_max: { type: "string", description: "End of range, ISO 8601. Defaults to end of today." },
        max_results: { type: "number", description: "Max events. Defaults to 10." },
      },
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event on the user's Google Calendar.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Title of the event." },
        description: { type: "string", description: "Optional description." },
        start_time: { type: "string", description: "Start time, ISO 8601." },
        end_time: { type: "string", description: "End time, ISO 8601." },
        location: { type: "string", description: "Optional location." },
      },
      required: ["summary", "start_time", "end_time"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete a calendar event by ID.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "Event ID from list_calendar_events." },
      },
      required: ["event_id"],
    },
  },
];

// --- Google OAuth / Calendar helpers ---

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = "https://www.googleapis.com/auth/calendar";
const TOKEN_KEY = "google_tokens";
const PUSH_SUB_KEY = "push_subscription";
const NOTIFIED_KEY_PREFIX = "notified:";

function getRedirectUri() {
  return "https://tommy-api.mikedbennett10.workers.dev/oauth/callback";
}

async function getTokens(env) {
  return await env.TOMMY_KV.get(TOKEN_KEY, "json");
}

async function saveTokens(env, tokens) {
  await env.TOMMY_KV.put(TOKEN_KEY, JSON.stringify(tokens));
}

async function refreshAccessToken(env, tokens) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token refresh: ${data.error_description || data.error}`);
  const updated = { ...tokens, access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  await saveTokens(env, updated);
  return updated;
}

async function getValidAccessToken(env) {
  let tokens = await getTokens(env);
  if (!tokens) return null;
  if (Date.now() > (tokens.expires_at || 0) - 60000) {
    tokens = await refreshAccessToken(env, tokens);
  }
  return tokens.access_token;
}

async function listEvents(accessToken, { time_min, time_max, max_results = 10 }) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: time_min || now.toISOString(),
    timeMax: time_max || endOfDay.toISOString(),
    maxResults: String(max_results),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return (data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "(no title)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location || null,
    description: e.description || null,
  }));
}

async function createEvent(accessToken, { summary, description, start_time, end_time, location }) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary,
      description: description || undefined,
      location: location || undefined,
      start: { dateTime: start_time },
      end: { dateTime: end_time },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { id: data.id, summary: data.summary, start: data.start?.dateTime, end: data.end?.dateTime, link: data.htmlLink };
}

async function deleteEvent(accessToken, eventId) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Delete failed (${res.status})`);
  }
  return { success: true };
}

async function executeToolCall(env, toolName, toolInput) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return { error: "Google Calendar not connected." };
  switch (toolName) {
    case "list_calendar_events": return await listEvents(accessToken, toolInput);
    case "create_calendar_event": return await createEvent(accessToken, toolInput);
    case "delete_calendar_event": return await deleteEvent(accessToken, toolInput.event_id);
    default: return { error: `Unknown tool: ${toolName}` };
  }
}

// --- Web Push helpers ---

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

async function sendPushNotification(env, payload) {
  const subscription = await env.TOMMY_KV.get(PUSH_SUB_KEY, "json");
  if (!subscription) return;

  // Import VAPID keys
  const vapidPrivate = urlBase64ToUint8Array(env.VAPID_PRIVATE_KEY);
  const vapidPublic = urlBase64ToUint8Array(env.VAPID_PUBLIC_KEY);

  // Use the web-push-compatible approach with fetch to the push endpoint
  // For Cloudflare Workers, we use a simplified JWT + encryption approach
  // Instead, we'll use the push subscription endpoint directly with a simpler method

  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "TTL": "86400",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok && response.status === 410) {
      // Subscription expired, clean up
      await env.TOMMY_KV.delete(PUSH_SUB_KEY);
    }
  } catch (err) {
    console.error("Push failed:", err);
  }
}

// --- Briefing generator ---

async function generateBriefing(env) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return null;

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const events = await listEvents(accessToken, {
    time_min: now.toISOString(),
    time_max: endOfDay.toISOString(),
    max_results: 20,
  });

  const eventsText = events.length > 0
    ? events.map((e) => `- ${e.start}: ${e.summary}${e.location ? ` (${e.location})` : ''}`).join('\n')
    : "No events scheduled for the rest of today.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      system: BRIEFING_PROMPT,
      messages: [{
        role: "user",
        content: `Current time: ${now.toISOString()}\n\nToday's remaining events:\n${eventsText}`,
      }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
}

// --- Claude chat with tool loop ---

async function chatWithTools(env, messages, systemPrompt, calendarConnected) {
  let currentMessages = messages.map((m) => ({ role: m.role, content: m.content }));

  for (let i = 0; i < 5; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: currentMessages,
        tools: calendarConnected ? CALENDAR_TOOLS : [],
        stream: false,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    const result = await res.json();

    if (result.stop_reason === "tool_use") {
      const toolBlocks = result.content.filter((b) => b.type === "tool_use");
      const toolResults = [];
      for (const tb of toolBlocks) {
        let tr;
        try { tr = await executeToolCall(env, tb.name, tb.input); }
        catch (err) { tr = { error: err.message }; }
        toolResults.push({ type: "tool_result", tool_use_id: tb.id, content: JSON.stringify(tr) });
      }
      currentMessages.push({ role: "assistant", content: result.content });
      currentMessages.push({ role: "user", content: toolResults });
      continue;
    }

    return (result.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  }

  return "I ran into an issue processing that request. Could you try again?";
}

// --- Cron: check upcoming events & push notifications ---

async function handleScheduled(env) {
  const accessToken = await getValidAccessToken(env);
  if (!accessToken) return;

  const subscription = await env.TOMMY_KV.get(PUSH_SUB_KEY, "json");
  if (!subscription) return;

  const now = new Date();
  const soon = new Date(now.getTime() + 7 * 60 * 1000); // 7 min from now

  const events = await listEvents(accessToken, {
    time_min: now.toISOString(),
    time_max: soon.toISOString(),
    max_results: 5,
  });

  for (const event of events) {
    const eventStart = new Date(event.start);
    const minsAway = Math.round((eventStart - now) / 60000);

    if (minsAway < 0 || minsAway > 7) continue;

    // Check if we already notified for this event
    const notifiedKey = `${NOTIFIED_KEY_PREFIX}${event.id}`;
    const alreadyNotified = await env.TOMMY_KV.get(notifiedKey);
    if (alreadyNotified) continue;

    // Send push notification
    const body = minsAway <= 1
      ? `"${event.summary}" is starting now!`
      : `"${event.summary}" starts in ${minsAway} minutes.`;

    await sendPushNotification(env, {
      title: "Tommy — Heads up!",
      body,
      tag: `event-${event.id}`,
      url: "/tommy-assistant/",
    });

    // Mark as notified (expire after 1 hour)
    await env.TOMMY_KV.put(notifiedKey, "1", { expirationTtl: 3600 });
  }
}

// --- Main request handler ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGIN || "https://mikedbennett10-glitch.github.io";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- OAuth ---

    if (url.pathname === "/oauth/start") {
      const authUrl = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: getRedirectUri(),
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: crypto.randomUUID(),
      })}`;
      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("Missing code", { status: 400 });

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: getRedirectUri(),
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (tokenData.error) return new Response(`OAuth error: ${tokenData.error_description}`, { status: 400 });

      await saveTokens(env, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
      });

      return new Response(
        `<html><body style="background:#0F0F13;color:#E8E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="color:#D4A843">Calendar Connected!</h1>
            <p>You can close this tab and return to Tommy.</p>
            <script>setTimeout(()=>window.close(),2000)</script>
          </div>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (url.pathname === "/oauth/status") {
      const tokens = await getTokens(env);
      return new Response(JSON.stringify({ connected: !!tokens }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Push subscription ---

    if (url.pathname === "/push/subscribe" && request.method === "POST") {
      const sub = await request.json();
      await env.TOMMY_KV.put(PUSH_SUB_KEY, JSON.stringify(sub));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/push/vapid-key" && request.method === "GET") {
      return new Response(JSON.stringify({ key: env.VAPID_PUBLIC_KEY }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Briefing ---

    if (url.pathname === "/briefing" && request.method === "GET") {
      try {
        const text = await generateBriefing(env);
        return new Response(JSON.stringify({ text: text || "Good to see you! Connect your calendar so I can brief you on your day." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ text: "Hey! I had trouble pulling your calendar. Try asking me directly." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- Chat ---

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { messages } = await request.json();
      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: "messages array required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const calendarConnected = !!(await getTokens(env));
      const systemPrompt = calendarConnected
        ? SYSTEM_PROMPT
        : SYSTEM_PROMPT + "\n\nNote: Google Calendar is NOT connected. Tell the user to connect via the calendar icon.";

      const text = await chatWithTools(env, messages, systemPrompt, calendarConnected);
      return new Response(JSON.stringify({ text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },

  // Cron trigger — runs every 5 minutes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};
