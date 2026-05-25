export type View = "chat" | "history" | "documents" | "settings";
export type SettingsTab = "models" | "pipeline" | "safety";
export type AnswerStyle = "concise" | "detailed" | "bullet";

export interface Citation {
  id: number;
  docName: string;
  sourceUrl?: string;
  originalSource?: string;
  page: number;
  snippet: string;
  collection: string;
}

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  timestamp: Date;
}

export interface HistoryItem {
  id: string;
  question: string;
  timestamp: Date;
  sourceCount: number;
}

export interface DocFile {
  id: string;
  name: string;
  collection: string;
  pages: number;
  lastIndexed: string;
  size: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  topK?: number;
  topN?: number;
}
