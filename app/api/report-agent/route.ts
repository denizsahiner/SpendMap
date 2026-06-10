export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const { systemPrompt, history, message } = await req.json() as {
    systemPrompt: string;
    history: { role: "user" | "assistant"; content: string }[];
    message: string;
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    return Response.json({ error: "OPENROUTER_API_KEY or OPENROUTER_MODEL env var is not set" }, { status: 500 });
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: message },
  ];

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${apiKey}`,
      "HTTP-Referer":  "https://spendmap.app",
      "X-Title":       "SpendMap AI",
    },
    body: JSON.stringify({ model, messages, temperature: 0 }),
  });

  if (!res.ok) {
    const text = await res.text();
    return Response.json({ error: text }, { status: 500 });
  }

  const data = await res.json() as { choices: { message: { content: string } }[] };
  return Response.json({ content: data.choices[0]?.message?.content ?? "" });
}
