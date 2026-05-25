import { appConfig } from "../config/env";

export function getApiBase(): string {
  return appConfig.apiBaseUrl;
}

export interface ApiSource {
  id: string;
  document_name?: string;
  source: string;
  original_source?: string;
  page: number;
  matched_text?: string;
  excerpt?: string;
}

interface Callbacks {
  onMeta: (conversationId: string, sources: ApiSource[]) => void;
  onToken: (token: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/**
 * Opens a POST /query request and dispatches the JSON response through the
 * same callbacks the chat UI used for streaming.
 */
export function streamQuery(
  question: string,
  conversationId: string | null,
  accessToken: string,
  callbacks: Callbacks,
): () => void {
  const { onMeta, onToken, onDone, onError } = callbacks;
  const controller = new AbortController();

  (async () => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "accept": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ question, conversation_id: conversationId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Server error ${res.status}: ${body}`);
      }

      const parsed = await res.json() as {
        conversation_id: string;
        answer: string;
        sources: ApiSource[];
      };

      const sources = (parsed.sources ?? []).map((source) => ({
        ...source,
        source: source.source?.startsWith("/")
          ? `${apiBase}${source.source}`
          : source.source,
      }));

      onMeta(parsed.conversation_id, sources);
      onToken(parsed.answer ?? "");
      onDone();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => controller.abort();
}
