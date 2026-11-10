"use client";

import { useEffect, useEffectEvent, useRef, useState, type DragEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Command,
  Copy,
  Download,
  FileCode2,
  FileText,
  FlaskConical,
  FolderOpen,
  KeyRound,
  Layers3,
  Loader2,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import {
  SAMPLE_CASES,
  exportMarkdown,
  type AnalysisInput,
  type AnalysisResult,
  type SourceFile,
} from "@/lib/traceboard/index";
import { parseResult, type SavedBrief } from "@/lib/brief-storage";
import { useBriefHistory, saveBrief, clearBriefs } from "@/lib/history-store";
import Link from "next/link";

type View = "workspace" | "library" | "about";
type Citation = AnalysisResult["hypotheses"][number]["citations"][number];
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const makeInput = (sample = SAMPLE_CASES[0]): AnalysisInput => ({
  title: sample.title,
  description: sample.description,
  sources: sample.sources.map((source) => ({ ...source })),
  mode: "demo",
});

function TraceLogo({ small = false }: { small?: boolean }) {
  return (
    <span className={`trace-logo ${small ? "small" : ""}`} aria-hidden="true">
      <span />
      <ArrowDown size={small ? 19 : 25} strokeWidth={2.5} />
    </span>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("workspace");
  const [input, setInput] = useState<AnalysisInput>(() => makeInput());
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultSources, setResultSources] = useState<SourceFile[]>([]);
  const [sampleId, setSampleId] = useState(SAMPLE_CASES[0].id);
  const history = useBriefHistory();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [configured, setConfigured] = useState(false);
  const [configStatus, setConfigStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [mobileNav, setMobileNav] = useState(false);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const evidenceDialog = useRef<HTMLDialogElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestActive = useRef(false);
  const pendingFiles = useRef(false);
  const inputVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/config", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Configuration unavailable");
        return response.json() as Promise<{
          configured?: unknown;
          defaultModel?: unknown;
        }>;
      })
      .then((data) => {
        setConfigured(Boolean(data.configured));
        if (typeof data.defaultModel === "string") setModel(data.defaultModel);
        setConfigStatus("ready");
      })
      .catch((cause) => {
        if (cause.name !== "AbortError") setConfigStatus("error");
      });
    return () => {
      controller.abort();
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const dialog = settingsDialog.current;
    if (settings && dialog && !dialog.open) dialog.showModal();
    else if (!settings && dialog?.open) dialog.close();
  }, [settings]);
  useEffect(() => {
    const dialog = evidenceDialog.current;
    if (citation && dialog && !dialog.open) dialog.showModal();
    else if (!citation && dialog?.open) dialog.close();
  }, [citation]);

  const updateInput = (update: (previous: AnalysisInput) => AnalysisInput) => {
    inputVersion.current += 1;
    setInput(update);
    setResult(null);
    setError("");
  };
  const navigate = (next: View) => {
    setView(next);
    setMobileNav(false);
  };
  const loadCase = (id: string) => {
    const sample = SAMPLE_CASES.find((item) => item.id === id);
    if (!sample || busy) return;
    inputVersion.current += 1;
    setInput(makeInput(sample));
    setSampleId(id);
    setResult(null);
    setError("");
    setExpandedSource(null);
    navigate("workspace");
  };
  const newBrief = () => {
    if (busy) return;
    inputVersion.current += 1;
    setInput({
      title: "",
      description: "",
      sources: [],
      mode: apiKey || configured ? "groq" : "demo",
    });
    setResult(null);
    setSampleId("");
    setError("");
    setExpandedSource(null);
    navigate("workspace");
  };
  const remember = (record: SavedBrief) => {
    if (!saveBrief(record))
      setToast(
        "Brief ready. Device storage is unavailable, so this brief was not saved.",
      );
  };
  const runAnalysis = async () => {
    if (requestActive.current || view !== "workspace") return;
    if (pendingFiles.current) {
      setError("Wait for your source files to finish loading.");
      return;
    }
    if (input.title.trim().length < 3 || input.description.trim().length < 10) {
      setError(
        "Add a title of at least 3 characters and a description of at least 10 characters.",
      );
      return;
    }
    if (!input.sources.length) {
      setError("Attach at least one log, code, or text file as supporting evidence.");
      return;
    }
    if (input.mode === "groq" && !apiKey && !configured) {
      setSettings(true);
      return;
    }
    requestActive.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const snapshot = {
      ...input,
      model,
      sources: input.sources.map((source) => ({ ...source })),
    };
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...snapshot,
          ...(apiKey && input.mode === "groq" ? { apiKey } : {}),
        }),
        signal: controller.signal,
      });
      const data = (await response.json()) as {
        result?: unknown;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          data.error?.message || "Analysis could not finish. Please try again.",
        );
      const checked = parseResult(data.result, snapshot);
      setResult(checked);
      setResultSources(snapshot.sources);
      remember({ result: checked, input: snapshot });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError")
        setError("Investigation cancelled. Your report is still here.");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Something went wrong. Please try again.",
        );
    } finally {
      setBusy(false);
      requestActive.current = false;
      abortRef.current = null;
    }
  };
  const onShortcut = useEffectEvent(() => {
    void runAnalysis();
  });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        !settingsDialog.current?.open &&
        !evidenceDialog.current?.open
      ) {
        event.preventDefault();
        onShortcut();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);

  const addFiles = async (files: FileList | File[]) => {
    if (busy) return;
    if (pendingFiles.current) {
      setToast("Wait for the current files to finish loading.");
      return;
    }
    const picked = Array.from(files);
    if (!picked.length) return;
    if (input.sources.length + picked.length > 6) {
      setError("Add up to 6 source files per investigation.");
      return;
    }
    pendingFiles.current = true;
    const version = inputVersion.current;
    try {
      const sources = await Promise.all(
        picked.map(async (file) => {
          if (
            !/\.(txt|log|md|json|jsonl|js|jsx|ts|tsx|py|go|rs|java|yml|yaml|toml|sql|css|html|sh|csv)$/i.test(
              file.name,
            )
          )
            throw new Error(`${file.name}: choose a text, log, or code file.`);
          if (file.size > 60_000)
            throw new Error(
              `${file.name}: use a file smaller than 60 KB and 15,000 characters.`,
            );
          const content = await file.text();
          if (content.length > 15_000 || content.includes("\0"))
            throw new Error(
              `${file.name}: use a text file with up to 15,000 characters.`,
            );
          return { id: crypto.randomUUID(), name: file.name, content };
        }),
      );
      if (
        [...input.sources, ...sources].reduce(
          (sum, source) => sum + source.content.length,
          0,
        ) > 60_000
      )
        throw new Error("Keep all source files under 60,000 characters combined.");
      if (version !== inputVersion.current) {
        setToast("Files skipped because the investigation changed.");
        return;
      }
      updateInput((previous) => ({
        ...previous,
        sources: [...previous.sources, ...sources],
      }));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File could not be read.");
    } finally {
      pendingFiles.current = false;
    }
    if (uploadRef.current) uploadRef.current.value = "";
  };
  const dropFiles = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void addFiles(event.dataTransfer.files);
  };
  const copyBrief = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(exportMarkdown(result, resultSources));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setToast("Clipboard unavailable. Use Export to download your brief.");
    }
  };
  const downloadBrief = () => {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([exportMarkdown(result, resultSources)], {
        type: "text/markdown;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${result.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 70)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Debugging brief exported as Markdown.");
  };
  const evidenceSource = citation
    ? resultSources.find((source) => source.id === citation.sourceId)
    : null;
  const totalLines = input.sources.reduce(
    (sum, source) => sum + source.content.split("\n").length,
    0,
  );

  return (
    <div className="app-shell">
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <Link className="brand" href="/" aria-label="Traceboard home">
          <TraceLogo />
          <span>
            traceboard<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-avatar">P</span>
          <div>
            <strong>Personal workspace</strong>
            <span>Your debugging corner</span>
          </div>
          <span className="free-label">FREE</span>
        </div>
        <button className="new-brief" onClick={newBrief} disabled={busy}>
          <Plus size={17} /> New investigation
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={view === "workspace" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("workspace")}
          >
            <Layers3 size={18} /> Investigation <span className="nav-dot" />
          </button>
          <button
            className={view === "library" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("library")}
          >
            <FolderOpen size={18} /> Case library <span className="nav-count">03</span>
          </button>
          <button
            className={view === "about" ? "nav-item active" : "nav-item"}
            onClick={() => navigate("about")}
          >
            <BookOpen size={18} /> How it works{" "}
            <ArrowUpRight className="muted" size={14} />
          </button>
        </nav>
        <div className="recent-heading">
          <span className="nav-label">RECENT BRIEFS</span>
          {history.length > 0 && (
            <button
              className="icon-button"
              title="Clear saved briefs on this device"
              aria-label="Clear saved briefs on this device"
              onClick={() => {
                if (!clearBriefs()) setToast("Device storage is unavailable.");
              }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
        <div className="recent-list">
          {history.length ? (
            history.slice(0, 5).map((record) => (
              <button
                className="recent-item"
                key={record.result.id}
                disabled={busy}
                onClick={() => {
                  inputVersion.current += 1;
                  setInput(record.input);
                  setModel(record.input.model || DEFAULT_MODEL);
                  setResult(record.result);
                  setResultSources(record.input.sources);
                  setError("");
                  setSampleId("");
                  navigate("workspace");
                }}
              >
                <FileText size={15} />
                <span>{record.result.title}</span>
              </button>
            ))
          ) : (
            <div className="no-history">
              <Clock3 size={15} />
              <span>
                Your next breakthrough
                <br />
                starts here.
              </span>
            </div>
          )}
        </div>
        <div className="sidebar-bottom">
          <div className="little-card">
            <span className="little-icon">
              <Sparkles size={18} />
            </span>
            <strong>
              A little context.
              <br />A lot more clarity.
            </strong>
            <p>
              Good debugging starts with
              <br />
              the right evidence.
            </p>
            <button onClick={() => navigate("about")}>
              Meet your new workflow <ArrowUpRight size={13} />
            </button>
            <span className="card-orbit" />
          </div>
          <button className="settings-nav" onClick={() => setSettings(true)}>
            <Settings2 size={17} /> Model settings{" "}
            <span
              className={`connection-dot ${apiKey || configured ? "connected" : ""}`}
            />
          </button>
          <div className="sidebar-footer">
            <span className="user-avatar">Y</span>
            <div>
              <strong>Your workspace</strong>
              <span>Built for curious developers</span>
            </div>
            <CircleHelp size={16} />
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {view === "workspace"
                ? "Investigation"
                : view === "library"
                  ? "Case library"
                  : "How it works"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="version-label">THE DEBUGGING WORKBENCH</span>
            <button className="mode-pill" onClick={() => setSettings(true)}>
              <span className="status-dot" />
              {input.mode === "demo" ? "Demo mode" : "Groq mode"}
              <ChevronRight size={12} />
            </button>
          </div>
        </header>
        <main>
          {view === "workspace" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> LESS GUESSWORK. MORE PROGRESS.
                  </div>
                  <h1>
                    Find the why. <span>Fix it faster.</span>
                  </h1>
                  <p>Turn scattered logs and bug reports into your next clear step.</p>
                </div>
                <div className="heading-note">
                  <span className="note-lines">↳</span>
                  <span>
                    Connect the dots.
                    <br />
                    <strong>Keep the evidence.</strong>
                  </span>
                </div>
              </section>
              <div className="demo-banner">
                <div className="demo-banner-icon">
                  <FlaskConical size={17} />
                </div>
                <p>
                  <strong>
                    {input.mode === "demo"
                      ? "Take it for a test run."
                      : "Your context, a fresh perspective."}
                  </strong>{" "}
                  {input.mode === "demo"
                    ? "Explore a real-world sample. No API key needed."
                    : "Analysis uses Groq. Review your logs before sending."}
                </p>
                <button
                  onClick={() =>
                    input.mode === "demo" ? navigate("library") : setSettings(true)
                  }
                >
                  {input.mode === "demo" ? "Explore sample cases" : "Model settings"}
                  <ArrowRight size={14} />
                </button>
              </div>
              <div className="investigation-grid">
                <section className="report-panel panel">
                  <div className="panel-heading">
                    <div className="panel-heading-left">
                      <span className="step-number">01</span>
                      <h2>The context</h2>
                    </div>
                    <span className="small-muted">Start with what you know</span>
                  </div>
                  <div className="report-body">
                    <div className="field-label-row">
                      <label htmlFor="report-title">What’s going wrong?</label>
                      <span>BUG REPORT</span>
                    </div>
                    <input
                      id="report-title"
                      className="title-input"
                      value={input.title}
                      maxLength={160}
                      disabled={busy}
                      placeholder="e.g. Checkout times out under load"
                      onChange={(event) =>
                        updateInput((previous) => ({
                          ...previous,
                          title: event.target.value,
                        }))
                      }
                    />
                    <label className="description-label" htmlFor="report-description">
                      Describe the issue{" "}
                      <span>Expected behavior, actual behavior, and what changed</span>
                    </label>
                    <textarea
                      id="report-description"
                      className="report-description"
                      value={input.description}
                      maxLength={8000}
                      disabled={busy}
                      placeholder="What happened? When did it start? What have you already tried?"
                      onChange={(event) =>
                        updateInput((previous) => ({
                          ...previous,
                          description: event.target.value,
                        }))
                      }
                    />
                    <div className="editor-footer">
                      <span>
                        <span className="tiny-dot" /> Plain text supported
                      </span>
                      <span>{input.description.length.toLocaleString()} / 8,000</span>
                    </div>
                    <div className="sources-title">
                      <label>
                        Supporting evidence <span>{input.sources.length}</span>
                      </label>
                      <button
                        onClick={() => uploadRef.current?.click()}
                        disabled={busy || input.sources.length >= 6}
                      >
                        <Plus size={14} /> Add files
                      </button>
                    </div>
                    <div
                      className={`source-drop ${dragging ? "dragging" : ""}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                      }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={dropFiles}
                    >
                      {input.sources.length ? (
                        input.sources.map((source) => (
                          <div className="source-entry" key={source.id}>
                            <div className="source-row">
                              <span
                                className={`file-icon ${/\.log$/.test(source.name) ? "log" : ""}`}
                              >
                                {/\.log$/.test(source.name) ? (
                                  <Terminal size={17} />
                                ) : (
                                  <FileCode2 size={17} />
                                )}
                              </span>
                              <button
                                className="source-name"
                                onClick={() =>
                                  setExpandedSource(
                                    expandedSource === source.id ? null : source.id,
                                  )
                                }
                                aria-expanded={expandedSource === source.id}
                              >
                                <strong>{source.name}</strong>
                                <span>
                                  {source.content.split("\n").length} lines ·{" "}
                                  {/\.log$/.test(source.name)
                                    ? "Application logs"
                                    : "Source context"}
                                </span>
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${source.name}`}
                                disabled={busy}
                                onClick={() =>
                                  updateInput((previous) => ({
                                    ...previous,
                                    sources: previous.sources.filter(
                                      (item) => item.id !== source.id,
                                    ),
                                  }))
                                }
                              >
                                <X size={14} />
                              </button>
                              <button
                                className="icon-button source-expand"
                                aria-label={`Preview ${source.name}`}
                                onClick={() =>
                                  setExpandedSource(
                                    expandedSource === source.id ? null : source.id,
                                  )
                                }
                              >
                                <ChevronRight
                                  size={15}
                                  className={expandedSource === source.id ? "rotate" : ""}
                                />
                              </button>
                            </div>
                            {expandedSource === source.id && (
                              <textarea
                                className="source-editor"
                                aria-label={`Edit ${source.name}`}
                                spellCheck={false}
                                value={source.content}
                                maxLength={15000}
                                disabled={busy}
                                onChange={(event) =>
                                  updateInput((previous) => ({
                                    ...previous,
                                    sources: previous.sources.map((item) =>
                                      item.id === source.id
                                        ? {
                                            ...item,
                                            content: event.target.value,
                                          }
                                        : item,
                                    ),
                                  }))
                                }
                              />
                            )}
                          </div>
                        ))
                      ) : (
                        <button
                          className="empty-upload"
                          onClick={() => uploadRef.current?.click()}
                          disabled={busy}
                        >
                          <Upload size={23} />
                          <strong>Drop logs or code here</strong>
                          <span>Text-based files · up to 6 sources</span>
                        </button>
                      )}
                      {input.sources.length > 0 && (
                        <div className="drop-hint">
                          <Upload size={12} /> Drop more logs, code, or notes here
                        </div>
                      )}
                    </div>
                    <input
                      className="visually-hidden"
                      type="file"
                      multiple
                      ref={uploadRef}
                      aria-label="Upload logs, code, or notes"
                      accept=".txt,.log,.md,.json,.jsonl,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.yml,.yaml,.toml,.sql,.css,.html,.sh,.csv"
                      onChange={(event) =>
                        event.target.files && void addFiles(event.target.files)
                      }
                    />
                    <div className="context-meta">
                      <ShieldCheck size={13} />
                      <span>
                        {input.mode === "demo"
                          ? "Sample analysis runs without an AI provider."
                          : "Your context is sent to Groq for this request."}
                      </span>
                    </div>
                    <div className="run-options">
                      <div>
                        <Zap size={14} />
                        <button
                          disabled={busy}
                          onClick={() =>
                            updateInput((previous) => ({
                              ...previous,
                              mode: previous.mode === "demo" ? "groq" : "demo",
                            }))
                          }
                        >
                          {input.mode === "demo"
                            ? "Sample engine"
                            : model.split("/").pop()}
                          <ChevronRight size={12} />
                        </button>
                      </div>
                      <span>{totalLines} lines of context</span>
                    </div>
                    {error && (
                      <div className="error-message" role="alert">
                        <CircleHelp size={17} />
                        <span>{error}</span>
                      </div>
                    )}
                    <button
                      className="analyze-button"
                      onClick={() => void runAnalysis()}
                      disabled={busy}
                    >
                      <span>
                        {busy ? (
                          <Loader2 size={18} className="spin" />
                        ) : (
                          <Sparkles size={18} />
                        )}
                        {busy ? "Connecting the evidence…" : "Investigate issue"}
                      </span>
                      {busy ? (
                        <Activity size={18} />
                      ) : (
                        <span className="keycap">
                          <Command size={11} /> ↵
                        </span>
                      )}
                    </button>
                    {busy ? (
                      <button
                        className="cancel-button"
                        onClick={() => abortRef.current?.abort()}
                      >
                        Cancel investigation
                      </button>
                    ) : (
                      <p className="run-caption">
                        A clear hypothesis. A source to back it up. A way forward.
                      </p>
                    )}
                  </div>
                </section>

                <section
                  className={`result-panel panel ${result ? "has-result" : ""}`}
                  aria-busy={busy}
                >
                  <div className="panel-heading">
                    <div className="panel-heading-left">
                      <span className="step-number">02</span>
                      <h2>The investigation</h2>
                    </div>
                    <div className="result-actions">
                      {result ? (
                        <>
                          <button
                            className="icon-button"
                            title="Copy Markdown"
                            aria-label="Copy brief as Markdown"
                            onClick={() => void copyBrief()}
                          >
                            {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
                          </button>
                          <button className="export-button" onClick={downloadBrief}>
                            <Download size={14} /> Export
                          </button>
                        </>
                      ) : (
                        <span className="small-muted">
                          <span className="tiny-dot" />{" "}
                          {busy ? "Working on it" : "Ready when you are"}
                        </span>
                      )}
                    </div>
                  </div>
                  {result ? (
                    <div className="result-body" aria-live="polite">
                      <div className="result-status">
                        <span>
                          <Check size={12} /> BRIEF READY
                        </span>
                        <span className={`severity ${result.severity}`}>
                          {result.severity} priority
                        </span>
                      </div>
                      <h3 className="result-title">Here’s where to look.</h3>
                      <p className="result-summary">{result.summary}</p>
                      <div className="findings-heading">
                        <span>RANKED HYPOTHESES</span>
                        <span>{result.hypotheses.length} findings</span>
                      </div>
                      <div className="hypotheses">
                        {result.hypotheses.map((hypothesis, index) => (
                          <article
                            className={`hypothesis ${index === 0 ? "primary-hypothesis" : ""}`}
                            key={hypothesis.id}
                          >
                            <div className="hypothesis-top">
                              <span className="hypothesis-number">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span className={`confidence ${hypothesis.confidence}`}>
                                <span />
                                {hypothesis.confidence} confidence
                              </span>
                            </div>
                            <h4>{hypothesis.title}</h4>
                            <p>{hypothesis.explanation}</p>
                            <div className="citations">
                              {hypothesis.citations.map((cite, citationIndex) => (
                                <button
                                  key={`${cite.sourceId}-${citationIndex}`}
                                  onClick={() => setCitation(cite)}
                                  title="Inspect the cited source lines"
                                >
                                  <FileCode2 size={12} />
                                  {resultSources.find(
                                    (source) => source.id === cite.sourceId,
                                  )?.name || cite.sourceId}
                                  <span>
                                    L{cite.startLine}
                                    {cite.endLine !== cite.startLine
                                      ? `–${cite.endLine}`
                                      : ""}
                                  </span>
                                  <ArrowUpRight size={11} />
                                </button>
                              ))}
                            </div>
                            {hypothesis.checks.length > 0 && (
                              <details className="verification">
                                <summary>
                                  How to verify <ChevronRight size={13} />
                                </summary>
                                <ul>
                                  {hypothesis.checks.map((check, checkIndex) => (
                                    <li key={checkIndex}>{check}</li>
                                  ))}
                                </ul>
                              </details>
                            )}
                          </article>
                        ))}
                      </div>
                      <div className="next-steps">
                        <div>
                          <span className="next-icon">
                            <ArrowRight size={15} />
                          </span>
                          <h4>Your next moves</h4>
                        </div>
                        <ol>
                          {result.nextSteps.map((step, index) => (
                            <li key={index}>
                              <span>{index + 1}</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                      {result.missingContext.length > 0 && (
                        <details className="missing-context">
                          <summary>
                            <CircleHelp size={14} />
                            What would strengthen this brief?
                            <ChevronRight size={14} />
                          </summary>
                          <ul>
                            {result.missingContext.map((context, index) => (
                              <li key={index}>{context}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <div className="result-meta">
                        <span>
                          <FlaskConical size={12} />
                          {result.meta.provider === "demo"
                            ? "Deterministic sample · no AI call"
                            : result.meta.model}
                        </span>
                        <span>
                          {result.meta.retrievedChunks} evidence chunks ·{" "}
                          {result.meta.durationMs} ms
                        </span>
                      </div>
                      <p className="result-disclaimer">
                        Hypotheses guide an investigation. Verify them before applying a
                        fix.
                      </p>
                    </div>
                  ) : busy ? (
                    <div className="loading-state" role="status">
                      <div className="loading-orbit">
                        <TraceLogo />
                        <span />
                      </div>
                      <h3>Following the trail.</h3>
                      <p>
                        Reading your context, finding relevant evidence,
                        <br />
                        and building a plan you can verify.
                      </p>
                      <div className="loading-steps">
                        <span>
                          <Check size={14} /> Context collected
                        </span>
                        <span>
                          <Loader2 className="spin" size={14} /> Connecting the evidence
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-result">
                      <div className="evidence-illustration" aria-hidden="true">
                        <div className="illustration-grid" />
                        <div className="floating-tag tag-code">
                          <Code2 size={16} />
                          <span>context.ts</span>
                          <span className="tag-dot" />
                        </div>
                        <div className="floating-tag tag-log">
                          <Terminal size={15} />
                          <span>app.log</span>
                          <span className="tag-dot orange" />
                        </div>
                        <div className="illustration-path path-one" />
                        <div className="illustration-path path-two" />
                        <div className="illustration-center">
                          <TraceLogo />
                        </div>
                        <div className="illustration-result">
                          <span>
                            <Check size={13} />
                          </span>
                          <div />
                          <div />
                        </div>
                        <span className="orbit-dot one" />
                        <span className="orbit-dot two" />
                      </div>
                      <div className="empty-result-copy">
                        <span className="eyebrow">CLARITY IS ONE INVESTIGATION AWAY</span>
                        <h3>
                          A trail of evidence.
                          <br />A clearer way forward.
                        </h3>
                        <p>
                          Add your context and let’s connect the dots.
                          <br />
                          Every finding comes with something to back it up.
                        </p>
                      </div>
                      <div className="output-features">
                        <span>
                          <Layers3 size={15} /> Ranked hypotheses
                        </span>
                        <span>
                          <FileCode2 size={15} /> Source citations
                        </span>
                        <span>
                          <CheckCheck size={15} /> Actionable checks
                        </span>
                      </div>
                      <div className="sample-nudge">
                        <span className="sample-nudge-icon">
                          <Sparkles size={16} />
                        </span>
                        <div>
                          <strong>Your first case is already loaded.</strong>
                          <p>Hit “Investigate issue” to see Traceboard in action.</p>
                        </div>
                        <ArrowUpRight size={17} />
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <div className="under-grid">
                <span>
                  <ShieldCheck size={13} /> Keys stay out of your history. Briefs stay on
                  this device.
                </span>
                <span>
                  Made for the <span className="mono">“but why?”</span> moments.
                </span>
              </div>
              <section className="sample-strip">
                <div className="sample-strip-heading">
                  <div>
                    <FlaskConical size={17} />
                    <h2>A few good mysteries</h2>
                  </div>
                  <span>Try a different starting point</span>
                </div>
                <div className="sample-cards">
                  {SAMPLE_CASES.map((sample, index) => (
                    <button
                      disabled={busy}
                      onClick={() => loadCase(sample.id)}
                      className={`sample-card ${sampleId === sample.id ? "selected" : ""}`}
                      key={sample.id}
                    >
                      <span className={`sample-icon sample-icon-${index}`}>
                        {index === 0 ? (
                          <Activity size={18} />
                        ) : index === 1 ? (
                          <Code2 size={18} />
                        ) : (
                          <Clock3 size={18} />
                        )}
                      </span>
                      <div>
                        <span className="sample-category">{sample.category}</span>
                        <strong>{sample.title}</strong>
                      </div>
                      {sampleId === sample.id ? (
                        <span className="loaded-label">
                          <Check size={11} /> Loaded
                        </span>
                      ) : (
                        <ArrowUpRight size={16} />
                      )}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {view === "library" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> SMALL CASES. USEFUL LESSONS.
                  </div>
                  <h1>
                    A few good <span>mysteries.</span>
                  </h1>
                  <p>Three realistic bugs. All the context. No API key required.</p>
                </div>
                <FlaskConical className="page-heading-icon" size={40} strokeWidth={1.2} />
              </section>
              <div className="library-grid">
                {SAMPLE_CASES.map((sample, index) => (
                  <article className="library-card" key={sample.id}>
                    <div className="library-card-top">
                      <span className={`sample-icon sample-icon-${index}`}>
                        {index === 0 ? (
                          <Activity size={24} />
                        ) : index === 1 ? (
                          <Code2 size={24} />
                        ) : (
                          <Clock3 size={24} />
                        )}
                      </span>
                      <span className="library-number">CASE / 0{index + 1}</span>
                    </div>
                    <div className="eyebrow">{sample.category}</div>
                    <h2>{sample.title}</h2>
                    <p>
                      {sample.description.slice(0, 220)}
                      {sample.description.length > 220 ? "…" : ""}
                    </p>
                    <div className="library-sources">
                      {sample.sources.map((source) => (
                        <span key={source.id}>
                          <FileText size={12} />
                          {source.name}
                        </span>
                      ))}
                    </div>
                    <button onClick={() => loadCase(sample.id)} disabled={busy}>
                      Open investigation <ArrowUpRight size={17} />
                    </button>
                  </article>
                ))}
              </div>
              <div className="library-note">
                <ShieldCheck size={19} />
                <div>
                  <strong>A demo you can trust.</strong>
                  <p>
                    Sample briefs are deterministic fixtures. Live analysis is clearly
                    labeled and requires your Groq key. Changing a sample’s context
                    requires live mode.
                  </p>
                </div>
              </div>
            </>
          )}

          {view === "about" && (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">
                    <span /> FOLLOW THE EVIDENCE
                  </div>
                  <h1>
                    From noise <span>to next steps.</span>
                  </h1>
                  <p>
                    A small, transparent workflow for the bugs that need a second pair of
                    eyes.
                  </p>
                </div>
              </section>
              <div className="workflow">
                <div className="workflow-item">
                  <span>01</span>
                  <div className="workflow-icon">
                    <FileText size={24} />
                  </div>
                  <h2>Bring the context</h2>
                  <p>
                    Describe the unexpected behavior. Add relevant logs, code, or notes.
                    Six focused files are more useful than an entire repository.
                  </p>
                </div>
                <ArrowRight className="workflow-arrow" size={22} />
                <div className="workflow-item">
                  <span>02</span>
                  <div className="workflow-icon">
                    <Layers3 size={24} />
                  </div>
                  <h2>Find the evidence</h2>
                  <p>
                    Source files are split into numbered chunks. Local lexical retrieval
                    ranks relevant passages, keeping provider requests focused.
                  </p>
                </div>
                <ArrowRight className="workflow-arrow" size={22} />
                <div className="workflow-item">
                  <span>03</span>
                  <div className="workflow-icon">
                    <Sparkles size={24} />
                  </div>
                  <h2>Build a hypothesis</h2>
                  <p>
                    Groq produces a structured brief. Citation validation checks source
                    IDs, line ranges, and exact quotes against retrieved evidence.
                  </p>
                </div>
              </div>
              <div className="about-grid">
                <article className="about-card">
                  <ShieldCheck size={24} />
                  <h2>Evidence you can inspect</h2>
                  <p>
                    Click any source chip to inspect the cited lines. Valid citations
                    establish where a finding came from; they don’t prove the hypothesis.
                    Use the verification checks to test it.
                  </p>
                </article>
                <article className="about-card">
                  <KeyRound size={24} />
                  <h2>Your key, your session</h2>
                  <p>
                    Use a Groq key in model settings, or configure GROQ_API_KEY on the
                    server. Browser-entered keys live in memory and are cleared on
                    refresh. Reports are sent to Groq only in live mode.
                  </p>
                  <button className="text-link" onClick={() => setSettings(true)}>
                    Connect Groq <ArrowUpRight size={14} />
                  </button>
                </article>
                <article className="about-card">
                  <Download size={24} />
                  <h2>Take the brief with you</h2>
                  <p>
                    Copy or export a Markdown brief to attach to an issue or share in a
                    pull request. Recent briefs are saved in your browser and can be
                    cleared from the sidebar.
                  </p>
                </article>
                <article className="about-card">
                  <FlaskConical size={24} />
                  <h2>Useful without an API key</h2>
                  <p>
                    Explore three complete, deterministic samples. Custom reports need a
                    model connection. Provider errors stay visible so you always know
                    whether an AI call succeeded.
                  </p>
                  <a
                    className="text-link"
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get a Groq API key <ArrowUpRight size={14} />
                  </a>
                </article>
              </div>
              <div className="stack-line">
                <span>BUILT WITH CURIOSITY &</span>
                <span>React</span>
                <i>·</i>
                <span>TypeScript</span>
                <i>·</i>
                <span>Groq</span>
                <i>·</i>
                <span>Cloudflare Workers</span>
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>
              <TraceLogo small /> traceboard<span className="brand-dot">.</span>
            </span>
            <p>Better questions. Better debugging.</p>
            <button onClick={() => navigate("about")}>
              Built with evidence <ArrowUpRight size={12} />
            </button>
          </footer>
        </main>
      </div>

      <dialog
        ref={settingsDialog}
        className="settings-dialog"
        onClose={() => setSettings(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSettings(false);
        }}
        aria-labelledby="settings-title"
      >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <Settings2 size={21} />
          </span>
          <button
            className="icon-button"
            aria-label="Close model settings"
            onClick={() => setSettings(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="eyebrow">A LITTLE MORE INTELLIGENCE</div>
        <h2 id="settings-title">Connect your model.</h2>
        <p className="dialog-description">
          Bring a Groq key to investigate your own reports. The sample cases are always
          available without one.
        </p>
        <div className={`server-status ${configured ? "ready" : ""}`}>
          <span className="status-dot" />
          {configStatus === "loading"
            ? "Checking server configuration…"
            : configStatus === "error"
              ? "Server configuration unavailable. You can still enter a key."
              : configured
                ? "Server Groq key configured"
                : "No server key configured"}
        </div>
        <label className="settings-label" htmlFor="api-key">
          Groq API key{" "}
          <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
            Get a key <ArrowUpRight size={12} />
          </a>
        </label>
        <div className="key-input-wrap">
          <KeyRound size={16} />
          <input
            autoComplete="off"
            id="api-key"
            type="password"
            placeholder="gsk_…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value.trim())}
            spellCheck={false}
          />
        </div>
        <p className="field-hint">
          Kept in memory for this tab. Never added to saved briefs.
        </p>
        <label className="settings-label" htmlFor="model">
          Model ID
        </label>
        <input
          id="model"
          className="model-input"
          value={model}
          maxLength={100}
          onChange={(event) => setModel(event.target.value)}
          list="groq-models"
          spellCheck={false}
        />
        <datalist id="groq-models">
          <option value="openai/gpt-oss-20b" />
          <option value="openai/gpt-oss-120b" />
          <option value="llama-3.1-8b-instant" />
          <option value="llama-3.3-70b-versatile" />
        </datalist>
        <p className="field-hint">
          Default: GPT-OSS 20B. Availability and free limits depend on your Groq account.{" "}
          <a href="https://console.groq.com/docs/models" target="_blank" rel="noreferrer">
            View models ↗
          </a>
        </p>
        <div className="settings-actions">
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setApiKey("");
              updateInput((previous) => ({ ...previous, mode: "demo" }));
              setSettings(false);
              setToast("Sample mode enabled. Browser key cleared.");
            }}
          >
            Use sample mode
          </button>
          <button
            className="primary-button"
            disabled={(!apiKey && !configured) || !model.trim() || busy}
            onClick={() => {
              updateInput((previous) => ({ ...previous, mode: "groq" }));
              setModel(model.trim());
              setSettings(false);
              setToast("Groq mode enabled. Run an investigation to test the connection.");
            }}
          >
            Use Groq <ArrowRight size={15} />
          </button>
        </div>
      </dialog>
      <dialog
        ref={evidenceDialog}
        className="evidence-dialog"
        onClose={() => setCitation(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCitation(null);
        }}
        aria-labelledby="evidence-title"
      >
        <div className="dialog-heading">
          <div>
            <div className="eyebrow">FOLLOW THE SOURCE</div>
            <h2 id="evidence-title">{evidenceSource?.name || "Source evidence"}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close source evidence"
            onClick={() => setCitation(null)}
          >
            <X size={20} />
          </button>
        </div>
        <p className="evidence-caption">
          Highlighted lines were cited in this brief. Read the surrounding context to
          verify the finding.
        </p>
        <div className="source-viewer">
          {evidenceSource?.content.split("\n").map((line, index) => (
            <div
              key={index}
              className={
                citation &&
                index + 1 >= citation.startLine &&
                index + 1 <= citation.endLine
                  ? "highlighted"
                  : ""
              }
            >
              <span>{index + 1}</span>
              <code>{line || " "}</code>
            </div>
          ))}
        </div>
        <div className="evidence-footer">
          <ShieldCheck size={14} />
          Source and line range checked against retrieved evidence.
        </div>
      </dialog>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
