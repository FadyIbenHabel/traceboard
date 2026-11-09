import type { AnalysisInput, EvidenceChunk } from "./types.ts";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "then",
  "have",
  "has",
  "was",
  "are",
  "our",
  "but",
  "can",
  "will",
  "not",
  "into",
  "after",
  "before",
]);

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Bounded, dependency-free BM25 retrieval. Line numbers refer to original files. */
export function retrieveEvidence(
  input: AnalysisInput,
  limit = 8,
): EvidenceChunk[] {
  const chunks: EvidenceChunk[] = [];
  for (const source of input.sources) {
    const lines = source.content.replace(/\r\n/g, "\n").split("\n");
    for (let start = 0; start < lines.length; start += 18) {
      const end = Math.min(start + 24, lines.length);
      const content = lines.slice(start, end).join("\n");
      if (content.trim())
        chunks.push({
          id: `${source.id}:${start + 1}-${end}`,
          sourceId: source.id,
          sourceName: source.name,
          startLine: start + 1,
          endLine: end,
          content,
          score: 0,
        });
      if (end === lines.length) break;
    }
  }
  if (!chunks.length) return [];
  const documents = chunks.map((chunk) =>
    tokenize(`${chunk.sourceName} ${chunk.content}`),
  );
  const averageLength =
    documents.reduce((sum, tokens) => sum + tokens.length, 0) /
      documents.length || 1;
  const terms = [...new Set(tokenize(`${input.title} ${input.description}`))];
  for (const term of terms) {
    const frequency = documents.filter((tokens) =>
      tokens.includes(term),
    ).length;
    const idf = Math.log(
      1 + (documents.length - frequency + 0.5) / (frequency + 0.5),
    );
    documents.forEach((tokens, index) => {
      const tf = tokens.filter((token) => token === term).length;
      const denominator =
        tf + 1.2 * (1 - 0.75 + (0.75 * tokens.length) / averageLength);
      if (tf) chunks[index].score += (idf * tf * 2.2) / denominator;
    });
  }
  // Stable ordering makes evaluation deterministic; unscored chunks still provide
  // context when vocabulary differs between a report and a stack trace.
  return chunks
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, Math.min(limit, 12)));
}
