/**
 * Dev entry point for `npx @langchain/langgraph-cli dev`.
 * Uses DEV_APPSYNC_TOKEN env var instead of runtime Cognito token.
 *
 * To get a token: open the app in browser → DevTools → Network →
 * any AppSync request → copy the Authorization header value.
 * Paste it into .env.local as DEV_APPSYNC_TOKEN=...
 */
import { createAgentGraph } from "./graph";

const token = process.env.DEV_APPSYNC_TOKEN ?? "";

export const agent = createAgentGraph(token);
