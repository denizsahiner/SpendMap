export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(req: Request) {
  const { heading, intent, dataText, allHeadings, isLast } = await req.json() as {
    heading:     string;
    intent:      string;
    dataText:    string;
    allHeadings: string[];
    isLast:      boolean;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_RESPOND_MODEL ?? process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    return Response.json({ error: "Missing env vars" }, { status: 500 });
  }

  const otherSections = allHeadings.filter(h => h !== heading).join(", ");

  const systemPrompt = `You are a professional analytics writer for SpendMap, a UK spending analytics platform.

Write a single report section in markdown. Professional tone, data-first, no emoji.

STRICT RULES — NEVER VIOLATE:
- NEVER mention APIs, databases, GraphQL, queries, or any technical implementation detail
- NEVER invent or estimate numbers — only use figures explicitly present in the data
- £ abbreviations: ≥£1B → £1.2B | ≥£1M → £390M | ≥£1K → £4.7K. Integers ≥1000 → 17K, 42.3K
- Spend Index is a % (not £). TAM/TOM/GDHI are £ values.
- No filler: "it is worth noting", "importantly", "clearly", "it is clear that"
- Lead every sentence with the finding, not the method
- Do NOT repeat content already covered by other sections: ${otherSections}

TABLE RULES — apply strictly:
- ANY comparison of 3+ districts → MUST use a markdown table (| District | Population | TAM | GDHI | ... |)
- ANY ranked list of flows/spend values with 4+ rows → MUST use a table (| District | Spend Index | ... |)
- ANY age breakdown with multiple cohorts → MUST use a table (| Age Group | Count | % of Total |)
- Tables go BEFORE the narrative interpretation, not after
- Every numeric column must have a header; use £/% units in the header row
- Do NOT omit table rows for missing values — use "—" for missing cells
${isLast ? "\nThis is the Key Takeaways section — write 3–5 concise data-backed bullet points." : ""}

Start your output with: ## ${heading}
Output ONLY the markdown for this section. Nothing else.`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:  `Bearer ${apiKey}`,
      "HTTP-Referer": "https://spendmap.app",
      "X-Title":      "SpendMap AI",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Section: ## ${heading}\nIntent: ${intent}\n\nAvailable data:\n${dataText}` },
      ],
      temperature: 0,
      max_tokens:  900,
      stream:      true,
    }),
  });

  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") { controller.close(); return; }
            try {
              const delta = (JSON.parse(raw) as { choices?: { delta?: { content?: string } }[] })
                .choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch { /* skip malformed SSE */ }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
