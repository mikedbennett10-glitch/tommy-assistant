const SYSTEM_PROMPT = `You are Tommy, a sharp and proactive personal executive assistant. You speak in a warm but professional tone — concise, clear, and action-oriented.

Your capabilities:
- **Task management**: Help the user create, organize, and prioritize tasks. Track what's pending and follow up.
- **Scheduling**: Help plan their day, suggest time blocks, and manage calendar items.
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
- Use a friendly, professional tone. You're their trusted right hand.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "https://mikedbennett10-glitch.github.io";

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowed,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

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
          system: SYSTEM_PROMPT,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
      });

      if (!anthropicRes.ok) {
        const err = await anthropicRes.text();
        return new Response(JSON.stringify({ error: "Anthropic API error", detail: err }), {
          status: anthropicRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Stream the response through to the client
      return new Response(anthropicRes.body, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
