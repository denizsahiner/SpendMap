import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { createAgentGraph, toolThinkingLabel } from "@/lib/agent/graph";
import type { AgentRequest, CardPlan, CardSpec } from "@/lib/agent/types";

export const runtime = "nodejs";


export async function POST(request: Request) {
  const body = (await request.json()) as AgentRequest;
  const { message, token, sessionId, mapContext, history } = body;

  if (!message || !token) {
    return new Response(JSON.stringify({ error: "message and token are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[agent] token length:", token.length, "| starts with:", token.substring(0, 20));
  console.log("[agent] OPENROUTER_API_KEY set:", !!process.env.OPENROUTER_API_KEY, "| OPENROUTER_MODEL:", process.env.OPENROUTER_MODEL);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* controller already closed */ }
      };

      try {
        const messages = [
          ...(history ?? []).map((m) => {
            if (m.role === "user") return new HumanMessage(m.content);
            if (m.role === "tool") return new ToolMessage({ content: m.content, tool_call_id: m.toolCallId ?? "" });
            if (m.toolCalls?.length) return new AIMessage({ content: m.content, tool_calls: m.toolCalls });
            return new AIMessage(m.content);
          }),
          new HumanMessage(
            mapContext
              ? `${message}\n\n[Context: viewing district ${mapContext.currentDistrict ?? "none"}, period ${mapContext.currentPeriod ?? "2023#Q1"}, mode ${mapContext.currentMode ?? "origin"}]`
              : message
          ),
        ];

        const graph = createAgentGraph(token, mapContext);

        const graphStream = await graph.stream(
          { messages },
          { streamMode: ["updates", "messages"] }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let lastFinalMsg: any = null;
        let cardPlans: CardPlan[] = [];
        const toolsUsedSet = new Set<string>();

        for await (const chunk of graphStream) {
          const [mode, payload] = chunk as [string, unknown];

          if (mode === "messages") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const [msgChunk, metadata] = payload as [{ content?: unknown }, { langgraph_node?: string }];
            if (metadata?.langgraph_node === "final") {
              const delta = typeof msgChunk.content === "string" ? msgChunk.content : "";
              if (delta) send("delta", { text: delta });
            }

          } else if (mode === "updates") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updates = payload as Record<string, any>;

            // Supervisor routing
            if (updates.supervisor) {
              // Route update
            }

            // Tool results — spatialTools or dataTools
            const toolUpdate = updates.spatialTools ?? updates.dataTools;
            if (toolUpdate?.messages) {
              for (const msg of toolUpdate.messages as Array<{ name?: string; tool_call_id?: string; content?: unknown }>) {
                if (msg.name) {
                  send("thinking", { text: toolThinkingLabel(msg.name) });
                  toolsUsedSet.add(msg.name);
                }
                let toolContent = "";
                try {
                  toolContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content) ?? "";
                } catch { /* non-serializable — skip */ }
                
                send("tool_result", {
                  toolCallId: msg.tool_call_id ?? "",
                  toolName:   msg.name ?? "",
                  content:    toolContent,
                });
              }
            }

            // Agent tool_calls — spatialAgent or dataAgent
            const agentUpdate = updates.spatialAgent ?? updates.dataAgent;
            if (agentUpdate?.messages?.length) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const agentMsg: any = agentUpdate.messages.at(-1);
              if (agentMsg?.tool_calls?.length) {
                send("tool_calls", {
                  content:   typeof agentMsg.content === "string" ? agentMsg.content : "",
                  toolCalls: agentMsg.tool_calls.map((tc: { id: string; name: string; args: unknown }) => ({
                    id: tc.id, name: tc.name, args: tc.args,
                  })),
                });
              }
            }

            // Analysis node: capture deterministic card plans
            if (updates.analysis?.cardPlans) {
              cardPlans = updates.analysis.cardPlans as CardPlan[];
            }

            // Final node: capture complete message text
            if (updates.final?.messages?.length) {
              lastFinalMsg = (updates.final.messages as unknown[]).at(-1);
            }
          }
        }

        const finalMessage = lastFinalMsg?.content ? String(lastFinalMsg.content) : "";

        const cards: CardSpec[] = cardPlans.map((p, i) => ({
          id:       `agent-${sessionId}-${Date.now()}-${i}`,
          type:     p.type,
          title:    p.titleHint,
          district: p.district,
          data:     p.data,
          config:   p.config,
        }));

        send("cards", { cards, message: finalMessage, toolsUsed: Array.from(toolsUsedSet) });
        send("done", {});
      } catch (err) {
        console.error("[agent/route] error:", err);
        const errMsg = err instanceof Error ? err.message : String(err);
        send("error", { message: errMsg });
        send("done", {});
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
