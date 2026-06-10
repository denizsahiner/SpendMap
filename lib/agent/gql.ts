// This was previously pointing to an AWS AppSync endpoint.
// For local development, this should point to your local API or database layer.
const API_URL = process.env.LOCAL_API_URL || "http://localhost:3001/graphql";

// Retries fn up to maxAttempts times with exponential backoff.
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 300,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes("fetch failed") ||
        msg.includes("ECONNRESET") ||
        msg.includes("ETIMEDOUT") ||
        /(5\d\d|429)/.test(msg);
      if (!isRetryable || attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw lastError;
}

export async function gql<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown>,
  _token: string, // Token was previously for Cognito, might still be used for local auth
): Promise<T> {
  return withRetry(async () => {
    // Note: If you're moving away from GraphQL entirely, you'll need to refactor this to a standard REST or DB call.
    if (!process.env.LOCAL_API_URL) {
      console.warn("[gql] LOCAL_API_URL is not set. Using default http://localhost:3001/graphql");
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Authorization: _token, // Uncomment if your local API uses the same auth header
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`API HTTP ${res.status}: ${res.statusText}`);

    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(json.errors[0].message);
    if (!json.data) throw new Error("No data returned from API");

    return json.data;
  });
}

export async function gqlPaginate<TItem>(
  query: string,
  variables: Record<string, unknown>,
  token: string,
  dataKey: string,
  maxPages = 5,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let nextToken: string | null = null;
  let page = 0;

  do {
    type PageShape = Record<string, { items: TItem[]; nextToken: string | null }>;
    const pageData: PageShape = await gql<PageShape>(
      query,
      { ...variables, nextToken },
      token,
    );
    const result = pageData[dataKey];
    items.push(...(result?.items ?? []));
    nextToken = result?.nextToken ?? null;
    page++;
  } while (nextToken && page < maxPages);

  return items;
}
