export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { cardsSummary, userIntent } = await req.json() as {
    cardsSummary: string;
    userIntent?: string;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_SUPERVISOR_MODEL ?? process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    return Response.json({ error: "Missing env vars" }, { status: 500 });
  }

  const systemPrompt = `You are a report outline planner for SpendMap, a UK postcode district spending analytics platform.

Given available spending and demographic data, produce a concise JSON outline for a professional analytics report.

Return ONLY a JSON object:
{
  "title": "5-10 word report title including district/region and period if available",
  "sections": [
    {
      "heading": "3-6 word section heading",
      "intent": "1-2 sentences: exactly what to cover, mentioning specific districts/metrics (TAM, TOM, spend index, GDHI, population)"
    }
  ]
}

Rules:
- 3-6 sections total
- First section must be "Executive Summary"
- Last section must be "Key Takeaways"
- Each section covers distinct, non-overlapping content
- Output ONLY valid JSON, no other text`;

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
        { role: "user",   content: `Available data:\n${cardsSummary}\n\nReport intent: ${userIntent ?? "Comprehensive spending analytics report"}` },
      ],
      temperature: 0,
      max_tokens:  600,
    }),
  });

  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: 500 });
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  const content = data.choices[0]?.message?.content ?? "{}";

  try {
    const match  = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as {
      title?: string;
      sections?: { heading: string; intent: string }[];
    };
    return Response.json({
      title:    parsed.title    ?? "SpendMap Report",
      sections: (parsed.sections ?? []).map(s => ({ heading: s.heading, intent: s.intent })),
    });
  } catch {
    return Response.json({ error: "Failed to parse outline", raw: content }, { status: 500 });
  }
}
