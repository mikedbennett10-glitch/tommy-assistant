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

const CALENDAR_TOOLS = [
  {
    name: "list_calendar_events",
    description: "List upcoming events from the user's Google Calendar. Use this to check their schedule, find free time, or review what's coming up.",
    input_schema: {
      type: "object",
      properties: {
        time_min: {
          type: "string",
          description: "Start of time range in ISO 8601 format (e.g. 2026-03-17T00:00:00Z). Defaults to now.",
        },
        time_max: {
          type: "string",
          description: "End of time range in ISO 8601 format (e.g. 2026-03-18T00:00:00Z). Defaults to end of today.",
        },
        max_results: {
          type: "number",
          description: "Maximum number of events to return. Defaults to 10.",
        },
      },
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event on the user's Google Calendar. Use this to schedule appointments, block focus time, set reminders, etc.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "Title of the event.",
        },
        description: {
          type: "string",
          description: "Optional description or notes for the event.",
        },
        start_time: {
          type: "string",
          description: "Start time in ISO 8601 format (e.g. 2026-03-17T14:00:00-05:00).",
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format (e.g. 2026-03-17T15:00:00-05:00).",
        },
        location: {
          type: "string",
          description: "Optional location for the event.",
        },
      },
      required: ["summary", "start_time", "end_time"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete an event from the user's Google Calendar by its event ID.",
    input_schema: {
      type: "object",
      properties: {
        event_id: {
          type: "string",
          description: "The ID of the event to delete. Get this from list_calendar_events.",
        },
      },
      required: ["event_id"],
    },
  },
];

// --- Google OAuth helpers ---

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPES = "https://www.googleapis.com/auth/calendar";
const TOKEN_KEY = "google_tokens";

function getRedirectUri(env) {
  return "https://tommy-api.mikedbennett10.workers.dev/oauth/callback";
}

async function getTokens(env) {
  const data = await env.TOMMY_KV.get(TOKEN_KEY, "json");
  return data;
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
  if (data.error) throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
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

// --- Google Calendar API ---

async function listEvents(accessToken, { time_min, time_max, max_results = 10 }) {
  const now = new Date().toISOString();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: time_min || now,
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
  const event = {
    summary,
    description: description || undefined,
    location: location || undefined,
    start: { dateTime: start_time },
    end: { dateTime: end_time },
  };

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return {
    id: data.id,
    summary: data.summary,
    start: data.start?.dateTime || data.start?.date,
    end: data.end?.dateTime || data.end?.date,
    link: data.htmlLink,
  };
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
  if (!accessToken) {
    return { error: "Google Calendar not connected. Ask the user to connect their calendar via the settings." };
  }

  switch (toolName) {
    case "list_calendar_events":
      return await listEvents(accessToken, toolInput);
    case "create_calendar_event":
      return await createEvent(accessToken, toolInput);
    case "delete_calendar_event":
      return await deleteEvent(accessToken, toolInput.event_id);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// --- Main worker ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://mikedbennett10-glitch.github.io";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // --- OAuth routes ---

    // Start OAuth flow
    if (url.pathname === "/oauth/start" && request.method === "GET") {
      const state = crypto.randomUUID();
      const authUrl = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: getRedirectUri(env),
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state,
      })}`;
      return Response.redirect(authUrl, 302);
    }

    // OAuth callback
    if (url.pathname === "/oauth/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) {
        return new Response("Missing code parameter", { status: 400 });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: getRedirectUri(env),
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        return new Response(`OAuth error: ${tokenData.error_description || tokenData.error}`, { status: 400 });
      }

      await saveTokens(env, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + tokenData.expires_in * 1000,
      });

      // Redirect back to the app
      return new Response(
        `<html><body style="background:#0F0F13;color:#E8E8F0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
          <div style="text-align:center">
            <h1 style="color:#D4A843">Calendar Connected!</h1>
            <p>You can close this tab and return to Tommy.</p>
            <script>setTimeout(()=>window.close(),2000)</script>
          </div>
        </body></html>`,
        { status: 200, headers: { "Content-Type": "text/html" } }
      );
    }

    // Check calendar connection status
    if (url.pathname === "/oauth/status" && request.method === "GET") {
      const tokens = await getTokens(env);
      return new Response(JSON.stringify({ connected: !!tokens }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Chat endpoint ---

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    try {
      const { messages } = await request.json();

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: "messages array required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if calendar is connected to inform the system prompt
      const calendarConnected = !!(await getTokens(env));
      const systemPrompt = calendarConnected
        ? SYSTEM_PROMPT
        : SYSTEM_PROMPT + "\n\nNote: Google Calendar is NOT connected yet. If the user asks about calendar features, tell them to connect their calendar using the calendar icon in the app header.";

      // Use non-streaming for tool use loop, then stream final response
      let currentMessages = messages.map((m) => ({ role: m.role, content: m.content }));
      let finalResponse = null;

      // Tool use loop — let Claude call tools, execute them, feed results back
      for (let i = 0; i < 5; i++) {
        const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
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

        if (!anthropicRes.ok) {
          const err = await anthropicRes.text();
          return new Response(JSON.stringify({ error: "Anthropic API error", detail: err }), {
            status: anthropicRes.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const result = await anthropicRes.json();

        // If Claude wants to use a tool
        if (result.stop_reason === "tool_use") {
          const toolBlocks = result.content.filter((b) => b.type === "tool_use");
          const toolResults = [];

          for (const toolBlock of toolBlocks) {
            let toolResult;
            try {
              toolResult = await executeToolCall(env, toolBlock.name, toolBlock.input);
            } catch (err) {
              toolResult = { error: err.message };
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolBlock.id,
              content: JSON.stringify(toolResult),
            });
          }

          // Add assistant message with tool use + tool results
          currentMessages.push({ role: "assistant", content: result.content });
          currentMessages.push({ role: "user", content: toolResults });
          continue;
        }

        // No more tool calls — extract text and return
        finalResponse = result;
        break;
      }

      // Extract text from the final response
      const textContent = (finalResponse?.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      return new Response(JSON.stringify({ text: textContent }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
