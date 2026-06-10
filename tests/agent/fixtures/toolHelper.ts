import { createTools } from "@/lib/agent/tools";

type AnyTool = { name: string; invoke: (args: unknown) => Promise<unknown> };

export function getToolByName(name: string): AnyTool {
  const tools = createTools("test-token") as AnyTool[];
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool;
}
