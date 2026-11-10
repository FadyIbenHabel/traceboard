import type { AnalysisResult, SourceFile } from "./types.ts";

function inline(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/([\\`*_[\]<>])/g, "\\$1");
}

export function exportMarkdown(result: AnalysisResult, sources: SourceFile[]): string {
  const lines = [
    `# ${inline(result.title)}`,
    "",
    `**Severity:** ${result.severity} · **Mode:** ${result.meta.provider === "demo" ? "Curated demo (not live inference)" : `Groq / ${inline(result.meta.model)}`}`,
    "",
    result.summary,
    "",
    "## Hypotheses",
    "",
  ];
  for (const hypothesis of result.hypotheses) {
    lines.push(
      `### ${inline(hypothesis.title)}`,
      "",
      `Confidence: ${hypothesis.confidence}`,
      "",
      hypothesis.explanation,
      "",
    );
    for (const citation of hypothesis.citations) {
      const name =
        sources.find((source) => source.id === citation.sourceId)?.name ??
        citation.sourceId;
      lines.push(
        `Evidence: **${inline(name)}:${citation.startLine}–${citation.endLine}**`,
        "",
        ...citation.quote.split("\n").map((line) => `> ${line}`),
        "",
      );
    }
    lines.push(
      "Verification:",
      "",
      ...hypothesis.checks.map((check) => `- [ ] ${check}`),
      "",
    );
  }
  lines.push(
    "## Next steps",
    "",
    ...result.nextSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
  );
  if (result.missingContext.length)
    lines.push(
      "## Missing context",
      "",
      ...result.missingContext.map((item) => `- ${item}`),
      "",
    );
  lines.push(
    "---",
    "Generated with Traceboard. Hypotheses require verification; citation checks establish source correspondence, not causal correctness.",
    "",
  );
  return lines.join("\n");
}
