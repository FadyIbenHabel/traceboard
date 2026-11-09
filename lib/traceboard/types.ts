export type SourceFile = { id: string; name: string; content: string };

export type AnalysisInput = {
  title: string;
  description: string;
  sources: SourceFile[];
  mode: "demo" | "groq";
  model?: string;
};

export type Citation = {
  sourceId: string;
  startLine: number;
  endLine: number;
  quote: string;
};

export type Hypothesis = {
  id: string;
  title: string;
  explanation: string;
  confidence: "high" | "medium" | "low";
  citations: Citation[];
  checks: string[];
};

export type AnalysisResult = {
  id: string;
  title: string;
  summary: string;
  severity: "critical" | "high" | "medium" | "low";
  hypotheses: Hypothesis[];
  nextSteps: string[];
  missingContext: string[];
  meta: {
    provider: "demo" | "groq";
    model: string;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    retrievedChunks: number;
  };
  createdAt: string;
};

export type EvidenceChunk = {
  id: string;
  sourceId: string;
  sourceName: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
};

export type SampleCase = {
  id: string;
  title: string;
  category: string;
  description: string;
  sources: SourceFile[];
};

export class AnalysisValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisValidationError";
  }
}

export class DemoInputError extends Error {
  constructor() {
    super(
      "Demo mode supports the three unchanged sample cases. Load a sample, or connect Groq to analyze your own report.",
    );
    this.name = "DemoInputError";
  }
}
