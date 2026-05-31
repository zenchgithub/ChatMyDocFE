import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  MessageSquare, Plus, Pencil, Trash2, ChevronDown,
  Send, Paperclip, X, LogOut, Settings, Menu,
  Mail, Lock, Eye, EyeOff, ArrowRight, Loader,
  FileText, Database, Server, Globe, AlertCircle, Check, LockKeyhole,
  Copy, CheckCheck, ShieldCheck, UserPlus, RefreshCw, Trash,
  ExternalLink, Search, Share2, Volume2, BookOpen, Archive,
} from "lucide-react";
import { supabase } from "../utils/supabase";
import { getApiBase, streamQuery } from "../utils/streamQuery";
import type { ApiSource } from "../utils/streamQuery";
import { appConfig, envStatus } from "../config/env";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Citation {
  id: number;
  docName: string;
  sourceUrl?: string;
  originalSource?: string;
  page: number;
  snippet: string;
}

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  citations?: Citation[];
  streaming?: boolean;
  timestamp: Date;
}

interface Conversation {
  id: string;
  backendId: string | null; // server-assigned conversation_id from meta event
  title: string;
  timestamp: Date;
  messages: Message[];
}

interface IndexedDocument {
  id: string;
  name: string;
  collection: string;
  pages: number;
  chunks: number;
  size: string;
  source: string;
  original_source: string;
  last_indexed: number | null;
  isPublic?: boolean;
  isLegacy?: boolean;
  indexed_by_email?: string | null;
}

type AuthMode = "signin" | "signup" | "reset";
type AppView = "chat" | "settings" | "guide";
interface CurrentUserAccess {
  role: string;
  is_admin: boolean;
}

interface ConversationSummaryResponse {
  id: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

interface ConversationMessageResponse {
  role: "user" | "assistant" | "ai";
  content: string;
  created_at: string | null;
}

interface AppNotice {
  id: number;
  type: "success" | "error";
  title: string;
  message: string;
}

const INITIAL_CONVERSATION_ID = "conv-initial";

function makeMessageId(prefix = "m"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyConversation(): Conversation {
  return {
    id: INITIAL_CONVERSATION_ID,
    backendId: null,
    title: "New conversation",
    timestamp: new Date(),
    messages: [],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseMessage(text: string, onCitation?: (id: number) => void): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const n = +m[1];
      return (
        <button
          key={i}
          onClick={() => onCitation?.(n)}
          className="inline-flex items-center justify-center w-[17px] h-[17px] rounded text-[10px] font-bold bg-accent text-accent-foreground hover:opacity-75 transition-opacity mx-0.5 align-middle leading-none flex-shrink-0"
          aria-label={`Source ${n}`}
        >
          {n}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function DocumentSearchLoader() {
  const steps = ["Reading documents", "Finding matches", "Preparing answer"];

  return (
    <div className="w-[min(290px,calc(100vw-96px))] space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative h-11 w-11 rounded-xl border border-primary/20 bg-primary/10 flex items-center justify-center overflow-hidden">
          <FileText size={22} className="text-primary/80" />
          <Search size={15} className="absolute right-1.5 bottom-1.5 text-accent animate-pulse" />
          <span className="absolute inset-x-1 top-1/2 h-px bg-accent/70 animate-ping" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Searching your documents</p>
          <p className="text-xs text-muted-foreground mt-0.5">Checking indexed pages for relevant context</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {steps.map((step, index) => (
          <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"
              style={{ animationDelay: `${index * 180}ms` }}
            />
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function cleanResponseText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[(\d+)\]/g, "source $1")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (m: AuthMode) => { setMode(m); setError(null); setNotice(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setNotice(null); setLoading(true);
    try {
      if (mode === "reset") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (err) throw err;
        setNotice("Password reset link sent — check your inbox.");
      } else if (mode === "signup") {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        setNotice("Check your email to confirm, then sign in.");
        switchMode("signin");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-card border border-border rounded-2xl p-8 shadow-sm">
        {/* Brand */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center shadow-md shadow-primary/25">
            <MessageSquare size={22} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">
              ChatMyDocs<span className="text-accent">.ai</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "reset" ? "Reset your password" : "Chat with your documents"}
            </p>
          </div>
        </div>

        {/* Mode tabs */}
        {mode !== "reset" && (
          <div className="flex bg-muted rounded-xl p-1 mb-6 gap-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                disabled={m === "signup"}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === m
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-input-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition"
              />
            </div>
          </div>

          {mode !== "reset" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
                  Password
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("reset")}
                    className="text-xs text-accent hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  placeholder={mode === "signup" ? "Min. 6 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-border bg-input-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <Check size={14} className="mt-0.5 flex-shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm shadow-primary/25 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2"
          >
            {loading ? (
              <Loader size={15} className="animate-spin" />
            ) : (
              <>
                <span>
                  {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                </span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </form>

        {mode === "reset" && (
          <button
            onClick={() => switchMode("signin")}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to sign in
          </button>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Authentication secured by{" "}
          <span className="font-semibold text-foreground">Supabase</span>
        </p>
      </div>
    </div>
  );
}

// ─── Top Nav ──────────────────────────────────────────────────────────────────

interface TopNavProps {
  user: User;
  onSignOut: () => void;
  onSettings: () => void;
  onMenuToggle: () => void;
  apiStatus: "connected" | "unknown";
}

function TopNav({ user, onSignOut, onSettings, onMenuToggle, apiStatus }: TopNavProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <header
      className="h-14 flex items-center justify-between px-4 border-b border-border flex-shrink-0 z-20"
      style={{ background: "var(--header-bg)", backdropFilter: "blur(12px)" }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm shadow-primary/30">
            <MessageSquare size={13} className="text-white" />
          </div>
          <span className="font-bold text-[0.9375rem] tracking-tight">
            ChatMyDocs<span className="text-accent">.ai</span>
          </span>
        </div>
      </div>

      {/* Center — status */}
      {apiStatus === "connected" && (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background/60 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-400 animate-pulse" />
          <span className="font-medium">Connected</span>
        </div>
      )}
      {apiStatus === "unknown" && (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background/60 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
          <span className="font-medium">Ready</span>
        </div>
      )}

      {/* Right — user menu */}
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-black/5 transition-colors"
          aria-expanded={open}
          aria-label="User menu"
        >
          <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
            {initials}
          </div>
          <span className="hidden sm:block text-sm text-foreground max-w-[140px] truncate">
            {user.email}
          </span>
          <ChevronDown
            size={12}
            className={`text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] w-56 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
            <div className="px-3 py-2.5 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Account</p>
              <p className="text-sm text-foreground mt-0.5 truncate">{user.email}</p>
            </div>
            <div className="p-1">
              <button
                onClick={() => { setOpen(false); onSettings(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-foreground hover:bg-black/5 transition-colors"
              >
                <Settings size={14} className="text-muted-foreground flex-shrink-0" />
                Settings
              </button>
              <button
                onClick={() => { setOpen(false); onSignOut(); }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} className="flex-shrink-0" />
                Log out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ─── Sidebar Inner ────────────────────────────────────────────────────────────

interface SidebarInnerProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onGuide: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  currentView: AppView;
  showClose?: boolean;
  onClose?: () => void;
}

function SidebarInner({
  conversations, activeId, onSelect, onNewChat, onGuide, onDelete, onRename, currentView, showClose, onClose,
}: SidebarInnerProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenaming(conv.id);
    setRenameVal(conv.title);
    setTimeout(() => inputRef.current?.select(), 10);
  };

  const commitRename = () => {
    if (renaming && renameVal.trim()) onRename(renaming, renameVal.trim());
    setRenaming(null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Conversations
        </span>
        {showClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* New chat */}
      <div className="px-3 pb-2 flex-shrink-0">
        <button
          onClick={() => { onNewChat(); onClose?.(); }}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all"
        >
          <Plus size={14} />
          New chat
        </button>
        <button
          onClick={() => { onGuide(); onClose?.(); }}
          className={`mt-2 flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
            currentView === "guide"
              ? "bg-primary/10 border-primary/15 text-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-black/5"
          }`}
        >
          <BookOpen size={14} />
          User guide
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-px">
        {conversations.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-10 px-4 leading-relaxed">
            No conversations yet.
            <br />Click &quot;New chat&quot; to start.
          </p>
        )}
        {conversations.map((conv) => {
          const isActive = conv.id === activeId;
          const isRenaming = renaming === conv.id;
          return (
            <div
              key={conv.id}
              onMouseEnter={() => setHovered(conv.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => !isRenaming && onSelect(conv.id)}
              className={`group relative flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all select-none ${
                isActive
                  ? "bg-primary/10 border border-primary/15"
                  : "hover:bg-black/5"
              }`}
            >
              <MessageSquare
                size={13}
                className={`mt-0.5 flex-shrink-0 transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              />
              <div className="flex-1 min-w-0 pr-10">
                {isRenaming ? (
                  <input
                    ref={inputRef}
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-sm bg-transparent border-b border-primary outline-none text-foreground pb-0.5"
                    autoFocus
                  />
                ) : (
                  <p
                    className={`text-sm leading-snug truncate ${
                      isActive ? "font-medium text-primary" : "text-foreground"
                    }`}
                  >
                    {conv.title}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {formatTime(conv.timestamp)}
                </p>
              </div>

              {/* Hover actions */}
              {(hovered === conv.id || isActive) && !isRenaming && (
                <div
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => startRename(conv, e)}
                    title="Rename"
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    title="Delete"
                    className="p-1 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

interface SidebarProps extends SidebarInnerProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function Sidebar({ mobileOpen, onMobileClose, ...inner }: SidebarProps) {
  return (
    <>
      {/* Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border flex-shrink-0 overflow-hidden bg-sidebar">
        <SidebarInner {...inner} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside className="relative w-72 bg-sidebar flex flex-col shadow-2xl z-50">
            <SidebarInner {...inner} showClose onClose={onMobileClose} />
          </aside>
        </div>
      )}
    </>
  );
}

// ─── Chat Area ────────────────────────────────────────────────────────────────

interface ChatAreaProps {
  conv: Conversation | undefined;
  onCitationClick: (c: Citation) => void;
}

function ChatArea({ conv, onCitationClick }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conv?.messages.length, conv?.messages[conv.messages.length - 1]?.content]);

  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  const markCopied = (messageId: string) => {
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((current) => current === messageId ? null : current);
    }, 1800);
  };

  const copyResponse = async (message: Message) => {
    const text = cleanResponseText(message.content);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      markCopied(message.id);
    } catch { /* ignore */ }
  };

  const shareResponse = async (message: Message) => {
    const text = cleanResponseText(message.content);
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: "ChatMyDocs.ai response", text });
      } else {
        await navigator.clipboard.writeText(text);
        markCopied(message.id);
      }
    } catch { /* user cancelled or share unavailable */ }
  };

  const speakResponse = (message: Message) => {
    const text = cleanResponseText(message.content);
    if (!text || !("speechSynthesis" in window)) return;

    if (speakingMessageId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onend = () => setSpeakingMessageId((current) => current === message.id ? null : current);
    utterance.onerror = () => setSpeakingMessageId((current) => current === message.id ? null : current);
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  if (!conv || conv.messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center overflow-y-auto">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
          <MessageSquare size={26} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Start a conversation</h2>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
            Ask anything about your documents — immigration forms, tax returns, lease agreements, and more.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {conv.messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className={`flex flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
              <span className="text-[11px] font-semibold text-muted-foreground px-1">
                {isUser ? "You" : "ChatMyDocs.ai"}
              </span>

              <div className={`flex items-start gap-2 max-w-[85%] sm:max-w-[72%] ${isUser ? "flex-row-reverse" : ""}`}>
                <div
                  className={`px-4 py-3 rounded-2xl min-w-0 ${
                    isUser
                      ? "bg-primary text-primary-foreground rounded-br-md shadow-sm shadow-primary/20"
                      : "bg-card border border-border text-foreground rounded-bl-md shadow-sm"
                  }`}
                >
                  <div
                    className="text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ fontFamily: "'Inter', sans-serif" }}
                  >
                    {!isUser && msg.streaming && !msg.content ? (
                      <DocumentSearchLoader />
                    ) : (
                      <>
                        {isUser
                          ? msg.content
                          : parseMessage(msg.content, (citId) => {
                              const cit = msg.citations?.find((c) => c.id === citId);
                              if (cit) onCitationClick(cit);
                            })}
                        {!isUser && msg.streaming && (
                          <span className="inline-block w-1.5 h-[1.1em] bg-current opacity-60 ml-0.5 animate-pulse rounded-sm align-middle" />
                        )}
                      </>
                    )}
                  </div>
                </div>

                {!isUser && !msg.streaming && msg.content.trim() && (
                  <div className="flex flex-col gap-1 pt-1 flex-shrink-0">
                    <button
                      onClick={() => copyResponse(msg)}
                      title="Copy response"
                      aria-label="Copy response"
                      className="w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                    >
                      {copiedMessageId === msg.id ? <CheckCheck size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    <button
                      onClick={() => shareResponse(msg)}
                      title="Share response"
                      aria-label="Share response"
                      className="w-8 h-8 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center"
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      onClick={() => speakResponse(msg)}
                      title={speakingMessageId === msg.id ? "Stop reading" : "Read response aloud"}
                      aria-label={speakingMessageId === msg.id ? "Stop reading" : "Read response aloud"}
                      className={`w-8 h-8 rounded-lg border border-border bg-card hover:bg-muted transition-colors flex items-center justify-center ${
                        speakingMessageId === msg.id ? "text-accent border-accent/40" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Volume2 size={14} className={speakingMessageId === msg.id ? "animate-pulse" : ""} />
                    </button>
                  </div>
                )}
              </div>

              {/* Source chips */}
              {!isUser && !msg.streaming && msg.citations && msg.citations.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-1 max-w-[85%] sm:max-w-[72%]">
                  <span className="text-[11px] text-muted-foreground self-center mr-0.5">Sources:</span>
                  {msg.citations.map((cit) => (
                    <button
                      key={cit.id}
                      onClick={() => onCitationClick(cit)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-border bg-card text-[11px] text-muted-foreground hover:text-accent hover:border-accent/30 hover:bg-accent/5 transition-all"
                    >
                      <FileText size={9} />
                      {cit.docName} p.{cit.page}
                    </button>
                  ))}
                </div>
              )}

              <span className="text-[10px] text-muted-foreground/60 px-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Chat Input ───────────────────────────────────────────────────────────────

interface ChatInputProps {
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  isStreaming: boolean;
  isUploading: boolean;
  onClear: () => void;
  defaultValue?: string;
  onDefaultValueConsumed?: () => void;
}

function ChatInput({ onSend, onUpload, isStreaming, isUploading, onClear, defaultValue, onDefaultValueConsumed }: ChatInputProps) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (defaultValue) {
      setText(defaultValue);
      onDefaultValueConsumed?.();
      setTimeout(() => ref.current?.focus(), 0);
    }
  }, [defaultValue]);

  const send = () => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim());
    setText("");
    if (ref.current) ref.current.style.height = "auto";
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const autoResize = () => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 160)}px`; }
  };

  return (
    <div className="flex-shrink-0 border-t border-border px-4 py-3 bg-card/50 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-2 bg-input-background border border-border rounded-2xl px-3 py-2 focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/10 transition-all">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKey}
            onInput={autoResize}
            placeholder="Ask anything about your documents…"
            rows={1}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none leading-relaxed py-1.5 min-h-[36px]"
            style={{ fontFamily: "'Inter', sans-serif" }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || isStreaming}
            className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all flex-shrink-0 mb-0.5 shadow-sm shadow-primary/30"
            aria-label="Send"
          >
            {isStreaming ? <Loader size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>

        <div className="flex items-center gap-1 mt-1.5">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.currentTarget.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {isUploading ? "Uploading..." : "Upload documents"}
          </button>
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={12} />
            Clear history
          </button>
          <span className="ml-auto text-[10px] text-muted-foreground/50 hidden sm:block">
            Enter ↵ to send · Shift+Enter for new line
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Source Panel ─────────────────────────────────────────────────────────────

async function openAuthenticatedDocument(url: string) {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Sign in again to open this document.");
  }

  const toDocumentProxyUrl = (rawUrl: string) => {
    if (rawUrl.startsWith("/")) return `${getApiBase()}${rawUrl}`;

    try {
      const parsed = new URL(rawUrl);
      if (parsed.pathname === "/documents") return rawUrl;
      if (parsed.hostname === "files.bezench.com") {
        const filename = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
        if (filename) {
          return `${getApiBase()}/documents?source=${encodeURIComponent(filename)}`;
        }
      }
    } catch {
      return `${getApiBase()}/documents?source=${encodeURIComponent(rawUrl)}`;
    }

    return rawUrl;
  };

  const resolvedUrl = toDocumentProxyUrl(url);
  const viewer = window.open("about:blank", "_blank");
  if (viewer) {
    viewer.opener = null;
    viewer.document.write("<p style=\"font-family: system-ui; padding: 24px;\">Opening document...</p>");
  }

  const response = await fetch(resolvedUrl, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    viewer?.close();
    throw new Error(`Unable to open document ${response.status}: ${body}`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  if (viewer) {
    viewer.location.href = objectUrl;
  } else {
    window.open(objectUrl, "_blank", "noopener,noreferrer");
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function SourcePanel({ citation, onClose }: { citation: Citation; onClose: () => void }) {
  const [openError, setOpenError] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm h-full bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-sm text-foreground">Source</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted border border-border">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText size={18} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{citation.docName}</p>
              <p className="text-xs text-muted-foreground">Page {citation.page}</p>
            </div>
          </div>

          {citation.sourceUrl && (
            <button
              onClick={() => {
                setOpenError(null);
                openAuthenticatedDocument(citation.sourceUrl!).catch((err) => {
                  setOpenError(err instanceof Error ? err.message : "Unable to open document");
                });
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <ExternalLink size={14} />
              Open document
            </button>
          )}
          {openError && (
            <p className="text-xs text-red-500 leading-relaxed">{openError}</p>
          )}

          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2.5">
              Relevant text from document
            </p>
            <blockquote
              className="text-sm text-foreground leading-relaxed border-l-2 border-accent pl-4 italic"
              style={{ fontFamily: "'Inter', sans-serif" }}
            >
              &ldquo;{citation.snippet}&rdquo;
            </blockquote>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Secret Field ─────────────────────────────────────────────────────────────

function SecretField({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <code
        className="flex-1 text-xs truncate text-muted-foreground"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {visible ? value : "•".repeat(Math.min(value.length, 38))}
      </code>
      <button
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Hide" : "Reveal"}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors flex-shrink-0"
      >
        {visible ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button
        onClick={copy}
        title="Copy"
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors flex-shrink-0"
      >
        {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
      </button>
    </div>
  );
}

// Editable secret — user pastes their own value, stored in localStorage
function EditableSecretField({ storageKey, hint }: { storageKey: string; hint: string }) {
  const lsKey = `cmdocs_${storageKey}`;
  const [saved, setSaved] = useState(() => localStorage.getItem(lsKey) ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setDraft(saved);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const commit = () => {
    const val = draft.trim();
    setSaved(val);
    if (val) localStorage.setItem(lsKey, val);
    else localStorage.removeItem(lsKey);
    setEditing(false);
    setVisible(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSaved("");
    localStorage.removeItem(lsKey);
    setVisible(false);
  };

  const copy = async () => {
    if (!saved) return;
    try {
      await navigator.clipboard.writeText(saved);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder={`Paste ${storageKey}…`}
          className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground/50 min-w-0"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        />
        <button
          onClick={commit}
          className="px-2 py-0.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold flex-shrink-0 hover:opacity-90"
        >
          Save
        </button>
        <button
          onClick={() => setEditing(false)}
          className="p-1 rounded-md text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  if (!saved) {
    return (
      <button
        onClick={startEdit}
        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-primary transition-colors italic"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <Plus size={11} />
        {hint}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1">
      <code
        className="flex-1 text-xs truncate text-muted-foreground"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {visible ? saved : "•".repeat(Math.min(saved.length, 38))}
      </code>
      <button
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Hide" : "Reveal"}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors flex-shrink-0"
      >
        {visible ? <EyeOff size={12} /> : <Eye size={12} />}
      </button>
      <button onClick={copy} title="Copy" className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors flex-shrink-0">
        {copied ? <CheckCheck size={12} className="text-emerald-500" /> : <Copy size={12} />}
      </button>
      <button onClick={startEdit} title="Edit" className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-black/5 transition-colors flex-shrink-0">
        <Pencil size={11} />
      </button>
      <button onClick={clear} title="Clear" className="p-1 rounded-md text-muted-foreground/60 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0">
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Settings View ────────────────────────────────────────────────────────────

// ─── Admin Panel ──────────────────────────────────────────────────────────────

function AdminPanel({ userEmail }: { userEmail: string }) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<{ email: string; invitedAt: string; invitedBy: string }[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const fetchInvites = async () => {
    setLoadingInvites(true);
    try {
      const token = await getToken();
      const data = await callEdgeFn("/admin/invites", "GET", token);
      setInvites(data.invites ?? []);
    } catch {
      // silent
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => { fetchInvites(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const token = await getToken();
      const data = await callEdgeFn("/admin/invite", "POST", token, {
        email: inviteEmail.trim(),
        redirectTo: `${window.location.origin}/?invite=1`,
      });
      if (data.error) throw new Error(data.error);
      setNotice(`Invite sent to ${inviteEmail.trim()}`);
      setInviteEmail("");
      fetchInvites();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send invite.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (email: string) => {
    const token = await getToken();
    await callEdgeFn(`/admin/invites/${encodeURIComponent(email)}`, "DELETE", token);
    setInvites((prev) => prev.filter((i) => i.email !== email));
  };

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={15} className="text-accent" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Admin — Invite Users</h2>
          <p className="text-xs text-muted-foreground">Account creation is by invitation only</p>
        </div>
      </div>

      {/* Invite form */}
      <div className="px-5 py-4 border-b border-border">
        <form onSubmit={handleInvite} className="flex gap-2">
          <div className="relative flex-1">
            <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="email"
              required
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed transition-all flex-shrink-0"
          >
            {loading ? <Loader size={13} className="animate-spin" /> : <><UserPlus size={13} /><span>Send invite</span></>}
          </button>
        </form>
        {notice && (
          <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1.5">
            <Check size={12} />{notice}
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-500 flex items-center gap-1.5">
            <AlertCircle size={12} />{error}
          </p>
        )}
      </div>

      {/* Invite list */}
      <div className="divide-y divide-border">
        {loadingInvites ? (
          <div className="px-5 py-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader size={13} className="animate-spin" /> Loading invites…
          </div>
        ) : invites.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">No invites sent yet.</div>
        ) : (
          invites.map((inv) => (
            <div key={inv.email} className="px-5 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{inv.email}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {new Date(inv.invitedAt).toLocaleDateString()} · invited by {inv.invitedBy}
                </p>
              </div>
              <button
                onClick={() => handleRevoke(inv.email)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                aria-label="Remove invite record"
              >
                <Trash size={13} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="px-5 py-2.5 bg-muted/60 text-xs text-muted-foreground border-t border-border">
        Supabase sends an invite link. The invited user sets a password before entering the app.
      </div>
    </section>
  );
}

// ─── Admin Access Banner (shown to non-admin users) ───────────────────────────

function AdminAccessBanner() {
  return (
    <section className="bg-card border border-amber-500/30 rounded-2xl overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <ShieldCheck size={15} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Admin access required</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Invitations can only be sent by users with the admin role in the Supabase role table.
          </p>
          <p className="mt-2 text-xs text-amber-600">
            Add this user as admin in Supabase, then sign out and sign back in.
          </p>
        </div>
      </div>
    </section>
  );
}

function formatIndexedDate(value: number | null): string {
  if (!value) return "Unknown";
  return new Date(value * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function IndexedDocumentsSection({
  title,
  description,
  docs,
  docsLoading,
  onRefreshDocs,
  onUpload,
  uploadLabel,
  isUploading,
  showIndexedBy = false,
  variant = "private",
}: {
  title: string;
  description: string;
  docs: IndexedDocument[];
  docsLoading: boolean;
  onRefreshDocs: () => void;
  onUpload?: (file: File) => void;
  uploadLabel?: string;
  isUploading?: boolean;
  showIndexedBy?: boolean;
  variant?: "private" | "public" | "old";
}) {
  const SectionIcon = variant === "public" ? Globe : variant === "old" ? Archive : LockKeyhole;
  const iconClass = variant === "public" ? "text-emerald-600" : variant === "old" ? "text-amber-600" : "text-primary";
  const iconBg = variant === "public" ? "bg-emerald-500/10" : variant === "old" ? "bg-amber-500/10" : "bg-primary/10";

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <SectionIcon size={15} className={iconClass} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">
              {description} · {docs.length} document{docs.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onUpload && (
            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors ${isUploading ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}>
              {isUploading ? <Loader size={12} className="animate-spin" /> : <Paperclip size={12} />}
              {isUploading ? "Uploading..." : uploadLabel}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) onUpload(file);
                }}
              />
            </label>
          )}
          <button
            onClick={onRefreshDocs}
            disabled={docsLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={docsLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {docsLoading && docs.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">Loading indexed documents...</div>
        ) : docs.length === 0 ? (
          <div className="px-5 py-4 text-sm text-muted-foreground">No indexed documents found.</div>
        ) : (
          docs.map((doc) => (
            <div key={doc.id} className="px-5 py-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <FileText size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {doc.collection} · {doc.pages} page{doc.pages === 1 ? "" : "s"} · {doc.chunks} chunk{doc.chunks === 1 ? "" : "s"} · {doc.size} · indexed {formatIndexedDate(doc.last_indexed)}
                  {showIndexedBy && doc.indexed_by_email ? ` · indexed by ${doc.indexed_by_email}` : ""}
                </p>
              </div>
              <button
                onClick={() => openAuthenticatedDocument(doc.source).catch((err) => {
                  console.error(err);
                })}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
                title="Open document"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type QdrantCollectionStatus = {
  status: string;
  collection: string;
  points_count?: number | null;
  indexed_vectors_count?: number | null;
  segments_count?: number | null;
  optimizer_status?: string | null;
};

type ModelConfig = {
  planner_model: string;
  rerank_model: string;
  answer_model: string;
  embedding_model: string;
  embedding_dimensions: number;
};

type ModelConfigResponse = {
  config: ModelConfig;
  defaults: ModelConfig;
  steps: Record<string, { label: string; description: string }>;
  options: {
    chat: string[];
    embedding: string[];
  };
  storage_path?: string;
};

function AdminQdrantPanel({ onRefreshDocs }: { onRefreshDocs: () => void }) {
  const [collection, setCollection] = useState("nas_docs");
  const [source, setSource] = useState("");
  const [sourceConfirm, setSourceConfirm] = useState("");
  const [collectionConfirm, setCollectionConfirm] = useState("");
  const [collectionStatus, setCollectionStatus] = useState<QdrantCollectionStatus | null>(null);
  const [busy, setBusy] = useState<"status" | "reindex" | "source" | "collection" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const cleanCollection = collection.trim() || "nas_docs";

  const runAdminAction = async <T,>(action: () => Promise<T>): Promise<T | null> => {
    setNotice(null);
    setError(null);
    try {
      return await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Admin request failed.");
      return null;
    }
  };

  const refreshStatus = async () => {
    setBusy("status");
    const data = await runAdminAction(async () => {
      const token = await getToken();
      return callEdgeFn(`/admin/qdrant/collections/${encodeURIComponent(cleanCollection)}`, "GET", token);
    });
    if (data) {
      setCollectionStatus(data as QdrantCollectionStatus);
      setNotice(`Loaded ${cleanCollection} status.`);
    }
    setBusy(null);
  };

  const reindexCollection = async () => {
    setBusy("reindex");
    const data = await runAdminAction(async () => {
      const token = await getToken();
      return callEdgeFn("/admin/qdrant/reindex", "POST", token, { collection: cleanCollection });
    });
    if (data) {
      setNotice(`Reindex finished for ${cleanCollection}.`);
      onRefreshDocs();
      refreshStatus();
    } else {
      setBusy(null);
    }
  };

  const deleteSource = async () => {
    const cleanSource = source.trim();
    if (!cleanSource) {
      setError("Enter the exact Qdrant source value to delete.");
      return;
    }
    setBusy("source");
    const data = await runAdminAction(async () => {
      const token = await getToken();
      return callEdgeFn("/admin/qdrant/delete-source", "POST", token, {
        collection: cleanCollection,
        source: cleanSource,
        confirm: sourceConfirm,
      });
    });
    if (data) {
      setNotice(`Deleted points with source ${cleanSource}.`);
      setSource("");
      setSourceConfirm("");
      onRefreshDocs();
      refreshStatus();
    } else {
      setBusy(null);
    }
  };

  const deleteCollection = async () => {
    setBusy("collection");
    const data = await runAdminAction(async () => {
      const token = await getToken();
      return callEdgeFn("/admin/qdrant/delete-collection", "POST", token, {
        collection: cleanCollection,
        confirm: collectionConfirm,
      });
    });
    if (data) {
      setNotice(`Deleted Qdrant collection ${cleanCollection}. Reindex to recreate it.`);
      setCollectionStatus(null);
      setCollectionConfirm("");
      onRefreshDocs();
    }
    setBusy(null);
  };

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
          <Database size={15} className="text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Admin — Qdrant Maintenance</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clean or reindex vector data through the backend. Qdrant keys stay server-side.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 space-y-4">
        {(notice || error) && (
          <div className={`rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${error ? "border-red-500/30 bg-red-50 text-red-700" : "border-emerald-500/30 bg-emerald-50 text-emerald-700"}`}>
            {error ? <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> : <Check size={13} className="mt-0.5 flex-shrink-0" />}
            <span>{error ?? notice}</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              Collection
            </label>
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
          </div>
          <button
            type="button"
            onClick={refreshStatus}
            disabled={busy !== null}
            className="self-end flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={busy === "status" ? "animate-spin" : ""} />
            Status
          </button>
          <button
            type="button"
            onClick={reindexCollection}
            disabled={busy !== null}
            className="self-end flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {busy === "reindex" ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Reindex NAS PDFs
          </button>
        </div>

        {collectionStatus && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Points", collectionStatus.points_count ?? 0],
              ["Indexed vectors", collectionStatus.indexed_vectors_count ?? 0],
              ["Segments", collectionStatus.segments_count ?? 0],
              ["Optimizer", collectionStatus.optimizer_status || "Unknown"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-muted/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
                <p className="mt-1 text-sm font-semibold text-foreground truncate">{String(value)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border p-3 space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-foreground">Delete one document source</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Removes only points whose payload source exactly matches this value.
            </p>
          </div>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="I-485.pdf"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
          />
          <input
            value={sourceConfirm}
            onChange={(e) => setSourceConfirm(e.target.value)}
            placeholder={source.trim() ? `Type DELETE SOURCE ${source.trim()}` : "Type DELETE SOURCE <source>"}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
          <button
            type="button"
            onClick={deleteSource}
            disabled={busy !== null || !source.trim()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/30 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {busy === "source" ? <Loader size={12} className="animate-spin" /> : <Trash size={12} />}
            Delete source points
          </button>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-50/40 p-3 space-y-3">
          <div>
            <h3 className="text-xs font-semibold text-red-700">Delete entire collection</h3>
            <p className="text-[11px] text-red-600/80 mt-0.5">
              This removes all vectors in the collection. Use Reindex NAS PDFs afterward to recreate searchable data.
            </p>
          </div>
          <input
            value={collectionConfirm}
            onChange={(e) => setCollectionConfirm(e.target.value)}
            placeholder={`Type DELETE ${cleanCollection}`}
            className="w-full px-3 py-2 text-sm bg-background border border-red-500/30 rounded-lg text-foreground placeholder:text-red-400/70 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
          <button
            type="button"
            onClick={deleteCollection}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {busy === "collection" ? <Loader size={12} className="animate-spin" /> : <Trash size={12} />}
            Delete collection
          </button>
        </div>
      </div>
    </section>
  );
}

function AdminModelConfigPanel() {
  const [data, setData] = useState<ModelConfigResponse | null>(null);
  const [config, setConfig] = useState<ModelConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  };

  const loadConfig = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const token = await getToken();
      const response = await callEdgeFn("/admin/model-config", "GET", token) as ModelConfigResponse;
      setData(response);
      setConfig(response.config);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load model settings.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { loadConfig(); }, []);

  const updateField = (key: keyof ModelConfig, value: string | number) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const saveConfig = async () => {
    if (!config) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const token = await getToken();
      const response = await callEdgeFn("/admin/model-config", "PUT", token, config) as ModelConfigResponse;
      setData(response);
      setConfig(response.config);
      setNotice("Model settings saved. New requests will use these models.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save model settings.");
    } finally {
      setBusy(false);
    }
  };

  const resetDefaults = () => {
    if (data?.defaults) {
      setConfig(data.defaults);
      setNotice("Defaults loaded. Click Save model settings to apply them.");
      setError(null);
    }
  };

  const renderChatSelect = (key: "planner_model" | "rerank_model" | "answer_model") => {
    if (!config || !data) return null;
    const step = data.steps[key];
    return (
      <div className="rounded-xl border border-border p-3 space-y-2">
        <div>
          <label className="text-xs font-semibold text-foreground">{step?.label ?? key}</label>
          <p className="text-[11px] text-muted-foreground mt-0.5">{step?.description}</p>
        </div>
        <select
          value={config[key]}
          onChange={(e) => updateField(key, e.target.value)}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        >
          {data.options.chat.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <section className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Server size={15} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Admin — AI Model Pipeline</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose models for each RAG step. Defaults use the stronger production setup.
          </p>
        </div>
        <button
          type="button"
          onClick={loadConfig}
          disabled={busy}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 disabled:opacity-50 transition-colors"
          title="Reload model settings"
        >
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {(notice || error) && (
          <div className={`rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${error ? "border-red-500/30 bg-red-50 text-red-700" : "border-emerald-500/30 bg-emerald-50 text-emerald-700"}`}>
            {error ? <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> : <Check size={13} className="mt-0.5 flex-shrink-0" />}
            <span>{error ?? notice}</span>
          </div>
        )}

        {!config || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader size={14} className="animate-spin" /> Loading model settings...
          </div>
        ) : (
          <>
            <div className="grid gap-3">
              {renderChatSelect("planner_model")}
              {renderChatSelect("rerank_model")}
              {renderChatSelect("answer_model")}

              <div className="rounded-xl border border-border p-3 space-y-2">
                <div>
                  <label className="text-xs font-semibold text-foreground">{data.steps.embedding_model?.label ?? "Embeddings"}</label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{data.steps.embedding_model?.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
                  <select
                    value={config.embedding_model}
                    onChange={(e) => updateField("embedding_model", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  >
                    {data.options.embedding.map((model) => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={config.embedding_dimensions}
                    readOnly
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg text-muted-foreground focus:outline-none transition-all"
                    title="Embedding vector dimensions"
                  />
                </div>
                <p className="text-[11px] text-amber-600">
                  Keep dimensions at 1536 unless you recreate the Qdrant collection with a different vector size.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={saveConfig}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader size={12} className="animate-spin" /> : <Check size={12} />}
                Save model settings
              </button>
              <button
                type="button"
                onClick={resetDefaults}
                disabled={busy}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-black/5 disabled:opacity-50 transition-colors"
              >
                Use production defaults
              </button>
            </div>

            {data.storage_path && (
              <p className="text-[11px] text-muted-foreground">
                Stored on backend at <code className="font-mono">{data.storage_path}</code>.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function SettingsView({
  onBack,
  userEmail,
  isAdmin,
  indexedDocs,
  publicIndexedDocs,
  oldIndexedDocs,
  docsLoading,
  onRefreshDocs,
  onPublicUpload,
  isPublicUploading,
}: {
  onBack: () => void;
  userEmail: string;
  isAdmin: boolean;
  indexedDocs: IndexedDocument[];
  publicIndexedDocs: IndexedDocument[];
  oldIndexedDocs: IndexedDocument[];
  docsLoading: boolean;
  onRefreshDocs: () => void;
  onPublicUpload: (file: File) => void;
  isPublicUploading: boolean;
}) {
  const frontendEnvLocation = "Set this in .env.local locally, and in Vercel Project Settings -> Environment Variables for production";
  const feVars: { key: string; value: string; note: string; configured: boolean; location: string }[] = [
    {
      key: "VITE_SUPABASE_URL",
      value: appConfig.supabaseUrl,
      note: "Supabase project URL",
      configured: envStatus.supabaseUrl,
      location: frontendEnvLocation,
    },
    {
      key: "VITE_SUPABASE_ANON_KEY",
      value: appConfig.supabaseAnonKey,
      note: "Public anon key for browser Supabase client",
      configured: envStatus.supabaseAnonKey,
      location: frontendEnvLocation,
    },
    {
      key: "VITE_CHATMYDOCS_API_URL",
      value: appConfig.apiBaseUrl,
      note: "FastAPI backend base URL",
      configured: envStatus.apiBaseUrl,
      location: frontendEnvLocation,
    },
  ];

  const beVars = [
    { key: "SUPABASE_DB_URL", note: "Supabase -> Settings -> Database -> Connection string" },
    { key: "SUPABASE_JWT_SECRET", note: "Supabase -> Settings -> API -> JWT Secret" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", note: "Supabase -> Settings -> API -> service_role key" },
    { key: "OPENAI_API_KEY", note: "platform.openai.com -> API keys" },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-7">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
          >
            <X size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Settings</h1>
            <p className="text-sm text-muted-foreground">{userEmail}</p>
          </div>
        </div>

        <IndexedDocumentsSection
          title="Private indexed documents"
          description="Private documents indexed by your account"
          docs={indexedDocs}
          docsLoading={docsLoading}
          onRefreshDocs={onRefreshDocs}
          variant="private"
        />

        <IndexedDocumentsSection
          title="Public indexed documents"
          description="Documents available to all signed-in users"
          docs={publicIndexedDocs}
          docsLoading={docsLoading}
          onRefreshDocs={onRefreshDocs}
          onUpload={onPublicUpload}
          uploadLabel="Upload public PDF"
          isUploading={isPublicUploading}
          showIndexedBy
          variant="public"
        />

        <IndexedDocumentsSection
          title="Old indexed documents"
          description="Legacy documents without user ownership, treated as public"
          docs={oldIndexedDocs}
          docsLoading={docsLoading}
          onRefreshDocs={onRefreshDocs}
          showIndexedBy
          variant="old"
        />

        {isAdmin && <AdminModelConfigPanel />}

        {isAdmin && <AdminQdrantPanel onRefreshDocs={onRefreshDocs} />}

        {/* Supabase Project */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <Database size={15} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Supabase Project</h2>
              <p className="text-xs text-muted-foreground">
                Frontend environment variables — <code className="font-mono">.env.local</code>
              </p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {feVars.map((v) => (
              <div key={v.key} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <code
                    className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {v.key}
                  </code>
                  <span className="text-[11px] text-muted-foreground/70 truncate">{v.note}</span>
                </div>
                <div className="flex items-center bg-muted/60 rounded-lg px-2.5 py-1.5 gap-1 min-h-[30px]">
                  {isAdmin && v.configured ? <SecretField value={v.value} /> : v.configured ? (
                    <span className="text-xs text-muted-foreground">
                      {v.location}
                    </span>
                  ) : (
                    <span className="text-xs text-red-500">Missing from .env.local</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-2.5 bg-muted/60 text-xs text-muted-foreground border-t border-border">
            These are public-safe browser vars. Never hard-code secret keys in frontend code.
          </div>
        </section>

        {/* Backend Config */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Server size={15} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Backend Config (FastAPI)</h2>
              <p className="text-xs text-muted-foreground">Server-only secrets — never expose to the browser</p>
            </div>
          </div>
          <div className="divide-y divide-border">
            {beVars.map((v) => (
              <div key={v.key} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <code
                    className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {v.key}
                  </code>
                  <span className="text-[11px] text-muted-foreground/70 truncate">{v.note}</span>
                </div>
                <div className="flex items-center bg-muted/60 rounded-lg px-2.5 py-1.5 gap-1 min-h-[30px]">
                  <span className="text-xs text-muted-foreground">
                    Set this in <code className="font-mono">/Users/zelalemsirag/kb-agent/.env</code>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-2.5 bg-muted/60 text-xs text-muted-foreground border-t border-border">
            Store in your deployment platform (Railway, Render, Fly.io) or a secrets manager — never commit to git.
          </div>
        </section>

        {/* API Integration Notes */}
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
              <Globe size={15} className="text-accent" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">API Integration Notes</h2>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
              The Supabase access token is stored in browser memory and sent as{" "}
              <code
                className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                Authorization: Bearer &lt;token&gt;
              </code>{" "}
              to all backend requests.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
              Backend endpoint{" "}
              <code
                className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                /query
              </code>{" "}
              accept a{" "}
              <code
                className="text-xs bg-muted px-1.5 py-0.5 rounded text-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                conversation_id
              </code>{" "}
              — pass <code className="text-xs bg-muted px-1.5 py-0.5 rounded" style={{ fontFamily: "'JetBrains Mono', monospace" }}>null</code> for new conversations.
            </li>
          </ul>
        </section>

        {/* Admin panel — invite users */}
        {isAdmin ? (
          <AdminPanel userEmail={userEmail} />
        ) : (
          <AdminAccessBanner />
        )}
      </div>
    </div>
  );
}

// ─── User Guide View ──────────────────────────────────────────────────────────

function GuidePreview({ type }: { type: "signin" | "chat" | "source" | "upload" | "settings" | "invite" }) {
  if (type === "signin") {
    return (
      <div className="rounded-xl border border-border bg-background p-5 flex items-center justify-center pointer-events-none select-none">
        <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare size={18} className="text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">ChatMyDocs.ai</p>
              <p className="text-xs text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Email</label>
          <input disabled value="you@example.com" className="w-full h-9 rounded-lg bg-input-background border border-border px-3 text-xs text-muted-foreground mb-3" />
          <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1">Password</label>
          <input disabled value="Your password" className="w-full h-9 rounded-lg bg-input-background border border-border px-3 text-xs text-muted-foreground mb-4" />
          <button disabled className="w-full h-9 rounded-lg bg-primary text-white text-xs font-semibold">Sign in</button>
        </div>
      </div>
    );
  }

  if (type === "chat") {
    return (
      <div className="rounded-xl border border-border bg-background p-4 flex flex-col gap-4 pointer-events-none select-none">
        <div className="ml-auto max-w-[75%] rounded-2xl rounded-br-md bg-primary text-white px-4 py-3 text-xs">
          Who is the attorney for Zelalem?
        </div>
        <div className="max-w-[82%] rounded-2xl rounded-bl-md border border-border bg-card p-3 text-xs text-foreground">
          <p>The document lists the attorney connected to Zelalem and cites the source page.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="px-2 py-1 rounded-lg border border-accent/30 bg-accent/5 text-accent">I-485.pdf p.1</span>
          </div>
        </div>
        <div className="h-12 rounded-2xl border border-border bg-input-background px-4 flex items-center justify-between text-xs text-muted-foreground">
          Ask anything about your documents...
          <Send size={14} className="text-primary" />
        </div>
      </div>
    );
  }

  if (type === "source") {
    return (
      <div className="rounded-xl border border-border bg-background p-4 flex justify-end pointer-events-none select-none">
        <div className="w-full max-w-xs rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText size={15} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">Pontiac.pdf</p>
              <p className="text-[11px] text-muted-foreground">Page 1</p>
            </div>
          </div>
          <button disabled className="w-full h-9 rounded-lg bg-primary text-white text-xs font-semibold mb-4">Open document</button>
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Relevant text from document</p>
          <blockquote className="text-xs text-foreground border-l-2 border-accent pl-3 leading-relaxed">
            Attorney of record listed for Zelalem...
          </blockquote>
        </div>
      </div>
    );
  }

  if (type === "upload") {
    return (
      <div className="rounded-xl border border-border bg-background p-4 flex flex-col justify-end pointer-events-none select-none">
        <div className="h-12 rounded-2xl border border-border bg-input-background mb-2 px-4 flex items-center text-xs text-muted-foreground">
          Ask anything about your documents...
        </div>
        <div className="flex items-center gap-2">
          <button disabled className="h-8 px-3 rounded-lg bg-muted border border-border text-xs text-muted-foreground flex items-center gap-1.5">
            <Paperclip size={12} />
            Upload documents
          </button>
          <span className="text-xs text-muted-foreground">PDF files only</span>
        </div>
      </div>
    );
  }

  if (type === "settings") {
    return (
      <div className="rounded-xl border border-border bg-background p-4 space-y-3 pointer-events-none select-none">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Indexed documents</p>
            <button disabled className="px-2 py-1 rounded-lg border border-border text-[11px] text-muted-foreground">Refresh</button>
          </div>
          {["I-485.pdf", "Pontiac.pdf", "Lease15505.pdf"].map((name) => (
            <div key={name} className="h-10 rounded-lg bg-muted/70 px-3 flex items-center justify-between">
              <span className="text-xs text-foreground">{name}</span>
              <ExternalLink size={12} className="text-muted-foreground" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-background p-4 space-y-3 pointer-events-none select-none">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-2">Admin - Invite Users</p>
        <div className="h-9 rounded-lg bg-muted mb-3 px-3 flex items-center text-xs text-muted-foreground">user@example.com</div>
        <button disabled className="h-9 px-3 rounded-lg bg-primary text-white text-xs font-semibold ml-auto block">Send invite</button>
      </div>
      <div className="h-8 rounded-lg bg-muted px-3 flex items-center text-xs text-muted-foreground">pending@example.com</div>
    </div>
  );
}

function ArchitectureDiagram() {
  const nodes = [
    { icon: Globe, title: "Vercel", detail: "React frontend" },
    { icon: ShieldCheck, title: "Supabase", detail: "Auth and admin role" },
    { icon: Server, title: "Render API", detail: "FastAPI backend" },
    { icon: Database, title: "Qdrant", detail: "Vector search on NAS" },
    { icon: FileText, title: "NAS files", detail: "PDF storage" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-5">
        {nodes.map((node, index) => {
          const Icon = node.icon;
          return (
            <div key={node.title} className="relative rounded-xl border border-border bg-card p-3 min-h-[106px]">
              {index > 0 && (
                <div className="hidden md:block absolute top-1/2 -left-3 w-3 border-t border-dashed border-primary/50" />
              )}
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Icon size={16} className="text-primary" />
              </div>
              <p className="text-xs font-semibold text-foreground">{node.title}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{node.detail}</p>
            </div>
          );
        })}
      </div>
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
        <p className="rounded-lg bg-muted/60 p-2">Frontend sends Supabase JWTs to the backend.</p>
        <p className="rounded-lg bg-muted/60 p-2">Backend queries Qdrant and signs document access through `/documents`.</p>
        <p className="rounded-lg bg-muted/60 p-2">NAS credentials stay server-side and are never exposed to users.</p>
      </div>
    </div>
  );
}

function AdminDocumentation() {
  const componentDocs = [
    ["App", "Owns auth state, current view, conversations, uploads, indexed documents, and API status."],
    ["AuthScreen", "Handles sign in, invite acceptance, password reset, and Supabase auth errors."],
    ["SetPasswordView", "Lets invited users create a password after opening a valid invitation link."],
    ["TopNav", "Shows app identity, API status, settings access, mobile menu, and sign-out controls."],
    ["Sidebar", "Lists conversations and exposes New chat plus User guide navigation."],
    ["ChatArea", "Renders the active conversation and passes citation clicks into the source panel."],
    ["MessageBubble", "Displays user/AI messages, citations, copy, share, and text-to-speech actions."],
    ["ChatInput", "Sends questions, uploads PDFs, clears the active chat, and blocks duplicate streaming sends."],
    ["SourcePanel", "Shows source document name, page, supporting text, and authenticated document open action."],
    ["SettingsView", "Shows environment configuration, indexed documents, API notes, and admin-only invite tools."],
    ["AdminPanel", "Allows admins to send and revoke invites through backend-protected endpoints."],
    ["UserGuideView", "Provides user-facing guidance and this admin-only technical documentation section."],
  ];

  const backendDocs = [
    ["/me", "Returns the current user role and `is_admin` flag from Supabase-backed backend authorization."],
    ["/query", "Runs retrieval against Qdrant and returns a JSON answer with source metadata."],
    ["/query-stream", "Streams answer tokens and sends source metadata for live chat responses."],
    ["/upload-document", "Accepts PDFs, stores them for the knowledge base, chunks text, embeds, and indexes in Qdrant."],
    ["/indexed-documents", "Lists indexed files, page counts, chunks, and authenticated document links."],
    ["/documents", "Proxies NAS PDF access through backend auth so app users do not need NAS credentials."],
    ["/admin/invite", "Admin-only invite endpoint using Supabase service role on the backend."],
    ["/admin/invites", "Admin-only list of pending/recent invitations."],
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Admin End-to-End Documentation</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            This section is visible only to admins. It documents the app architecture, frontend components, backend services,
            security boundaries, and deployment configuration.
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Architecture Design</h3>
        <ArchitectureDiagram />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Frontend Components</h3>
          <div className="space-y-2">
            {componentDocs.map(([name, detail]) => (
              <div key={name} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-semibold text-foreground">{name}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Backend Responsibilities</h3>
          <div className="space-y-2">
            {backendDocs.map(([name, detail]) => (
              <div key={name} className="rounded-xl border border-border bg-background p-3">
                <code className="text-xs font-semibold text-foreground" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {name}
                </code>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">Auth Model</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Supabase handles sign-in and JWTs. The backend validates JWTs, checks admin membership, and protects all document,
            query, upload, and invite operations.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">Data Flow</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            PDF text is uploaded, chunked, embedded, stored in Qdrant, and cited back to users with document names, page numbers,
            excerpts, and authenticated document URLs.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <h3 className="text-sm font-semibold text-foreground">Deployment</h3>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Frontend variables belong in `.env.local` locally and Vercel Environment Variables in production. Backend secrets
            belong only in Render environment variables.
          </p>
        </div>
      </div>
    </section>
  );
}

function UserGuideView({ onBack, isAdmin }: { onBack: () => void; isAdmin: boolean }) {
  const steps = [
    {
      title: "1. Sign in",
      body: "Use your email and password. If you received an invitation, open the invite email first and create your password.",
      image: "signin" as const,
    },
    {
      title: "2. Ask a question",
      body: "Ask about a specific document, person, date, amount, address, or topic. Specific questions return better answers.",
      image: "chat" as const,
    },
    {
      title: "3. Check the source",
      body: "Click a source chip to view the document name, page number, and the exact text used for the answer.",
      image: "source" as const,
    },
    {
      title: "4. Open the document",
      body: "Use Open document to view the PDF through your ChatMyDocs.ai account. You should not need a NAS login.",
      image: "source" as const,
    },
    {
      title: "5. Upload a PDF",
      body: "Click Upload documents, select a PDF, and wait for upload and indexing to finish. The document then becomes searchable.",
      image: "upload" as const,
    },
    {
      title: "6. View indexed documents",
      body: "Open Settings and refresh Indexed documents to see searchable files, pages, chunks, and document links.",
      image: "settings" as const,
    },
    {
      title: "7. Invite users",
      body: "Admins can invite users from Settings. The invited user receives an email link and creates a password.",
      image: "invite" as const,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-7">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-colors"
          >
            <X size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">ChatMyDocs.ai User Guide</h1>
            <p className="text-sm text-muted-foreground">
              Step-by-step guide for asking questions, checking sources, uploading PDFs, and inviting users.
            </p>
          </div>
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Before you start</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                ChatMyDocs.ai answers from indexed PDF documents. If an answer has sources, open the source panel to inspect
                the supporting text before using the answer.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-5">
          {steps.map((step) => (
            <section key={step.title} className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="grid md:grid-cols-[1fr_1.25fr] gap-0">
                <div className="p-5 flex flex-col justify-center">
                  <h2 className="text-base font-semibold text-foreground">{step.title}</h2>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{step.body}</p>
                </div>
                <div className="p-4 bg-muted/40 border-t md:border-t-0 md:border-l border-border">
                  <GuidePreview type={step.image} />
                  <p className="text-[11px] text-muted-foreground mt-2">Disabled interface preview for this step</p>
                </div>
              </div>
            </section>
          ))}
        </div>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground">Troubleshooting</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm text-muted-foreground">
            <p className="rounded-xl bg-muted/60 p-3">If a document is missing, refresh Indexed documents in Settings.</p>
            <p className="rounded-xl bg-muted/60 p-3">If a source will not open, sign out and sign back in.</p>
            <p className="rounded-xl bg-muted/60 p-3">If upload fails, confirm the file is a PDF and try again.</p>
            <p className="rounded-xl bg-muted/60 p-3">If an invite expires, ask an admin to send a new invitation.</p>
          </div>
        </section>

        {isAdmin && <AdminDocumentation />}
      </div>
    </div>
  );
}

// ─── Backend admin helper ─────────────────────────────────────────────────────

async function callEdgeFn(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  token: string,
  body?: unknown,
) {
  const res = await fetch(`${getApiBase()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail ?? data.error ?? `Request failed with ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data;
}

// ─── Set Password View (invite completion) ────────────────────────────────────

function SetPasswordView({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); setLoading(false); return; }
    onComplete();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] bg-card border border-border rounded-2xl p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-md shadow-accent/25">
            <ShieldCheck size={22} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Welcome aboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {"You've been invited — set a password to finish signing up."}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              New password
            </label>
            <div className="relative flex items-center">
              <Lock size={14} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                required
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 text-sm bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPw ? "Hide" : "Show"}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">
              Confirm password
            </label>
            <div className="relative flex items-center">
              <Lock size={14} className="absolute left-3 text-muted-foreground pointer-events-none" />
              <input
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                required
                placeholder="Same password again"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? <Loader size={15} className="animate-spin" /> : <><span>Set password & continue</span><ArrowRight size={15} /></>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [access, setAccess] = useState<CurrentUserAccess | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);

  const [view, setView] = useState<AppView>("chat");
  const [conversations, setConversations] = useState<Conversation[]>([emptyConversation()]);
  const [activeId, setActiveId] = useState<string>(INITIAL_CONVERSATION_ID);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sourcePanel, setSourcePanel] = useState<Citation | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublicUploading, setIsPublicUploading] = useState(false);
  const [indexedDocs, setIndexedDocs] = useState<IndexedDocument[]>([]);
  const [publicIndexedDocs, setPublicIndexedDocs] = useState<IndexedDocument[]>([]);
  const [oldIndexedDocs, setOldIndexedDocs] = useState<IndexedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<"connected" | "unknown">("unknown");
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const cancelStreamRef = useRef<(() => void) | undefined>();
  const historyLoadedForUserRef = useRef<string | null>(null);

  const showNotice = (type: AppNotice["type"], title: string, message: string) => {
    const id = Date.now();
    setNotice({ id, type, title, message });
    window.setTimeout(() => {
      setNotice((current) => (current?.id === id ? null : current));
    }, 6000);
  };

  const loadConversationHistory = async (accessToken: string) => {
    const apiBase = getApiBase();
    const res = await fetch(`${apiBase}/conversations`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`Failed to load conversations ${res.status}: ${body}`);
    }

    const data = await res.json() as { conversations?: ConversationSummaryResponse[] };
    const summaries = data.conversations ?? [];
    if (summaries.length === 0) {
      setConversations([emptyConversation()]);
      setActiveId(INITIAL_CONVERSATION_ID);
      return;
    }

    const loaded = await Promise.all(
      summaries.map(async (summary) => {
        const messagesRes = await fetch(`${apiBase}/conversations/${summary.id}/messages`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            accept: "application/json",
          },
        });
        if (!messagesRes.ok) {
          throw new Error(`Failed to load conversation ${summary.id}: ${messagesRes.status}`);
        }
        const messagesData = await messagesRes.json() as { messages?: ConversationMessageResponse[] };
        const messages = (messagesData.messages ?? []).map((message, index): Message => ({
          id: `${summary.id}-${index}`,
          role: message.role === "assistant" ? "ai" : message.role,
          content: message.content,
          timestamp: message.created_at ? new Date(message.created_at) : new Date(summary.updated_at ?? Date.now()),
        }));

        return {
          id: summary.id,
          backendId: summary.id,
          title: summary.title || "New conversation",
          timestamp: new Date(summary.updated_at ?? summary.created_at ?? Date.now()),
          messages,
        };
      }),
    );

    setConversations(loaded);
    setActiveId(loaded[0].id);
  };

  const refreshCurrentUserAccess = async (token?: string) => {
    const accessToken = token ?? (await supabase.auth.getSession()).data.session?.access_token;
    if (!accessToken) {
      setAccess(null);
      return;
    }

    try {
      const res = await fetch(`${getApiBase()}/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`Failed to load user access: ${res.status}`);
      const data = await res.json() as CurrentUserAccess;
      setAccess(data);
    } catch (err) {
      console.error(err);
      setAccess({ role: "user", is_admin: false });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Detect invite-link sign-in — hash contains type=invite before Supabase clears it
      const isInviteCallback =
        window.location.hash.includes("type=invite") ||
        new URLSearchParams(window.location.search).get("invite") === "1";

      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && isInviteCallback) {
        setNeedsPasswordSetup(true);
        window.history.replaceState(null, "", window.location.pathname);
      }

      const u = session?.user ?? null;
      setUser(u);
      if (session?.access_token) {
        setAuthLoading(false);
        void refreshCurrentUserAccess(session.access_token);
        if (u?.id && historyLoadedForUserRef.current !== u.id) {
          void loadConversationHistory(session.access_token).then(() => {
            historyLoadedForUserRef.current = u.id;
          }).catch((err) => {
            console.error(err);
            setConversations([emptyConversation()]);
            setActiveId(INITIAL_CONVERSATION_ID);
          });
        }
      } else {
        setAccess(null);
        historyLoadedForUserRef.current = null;
        setConversations([emptyConversation()]);
        setActiveId(INITIAL_CONVERSATION_ID);
        setIndexedDocs([]);
        setPublicIndexedDocs([]);
        setOldIndexedDocs([]);
        setAuthLoading(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshIndexedDocs = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    setDocsLoading(true);
    try {
      const apiBase = getApiBase();
      const headers = {
        "Authorization": `Bearer ${session.access_token}`,
        "accept": "application/json",
      };
      const [privateRes, publicRes, oldRes] = await Promise.all([
        fetch(`${apiBase}/indexed-documents?collection=nas_docs&visibility=private`, { headers }),
        fetch(`${apiBase}/indexed-documents?collection=nas_docs&visibility=public`, { headers }),
        fetch(`${apiBase}/indexed-documents?collection=nas_docs&visibility=old`, { headers }),
      ]);
      if (!privateRes.ok) {
        const body = await privateRes.text().catch(() => privateRes.statusText);
        throw new Error(`Failed to load indexed documents ${privateRes.status}: ${body}`);
      }
      if (!publicRes.ok) {
        const body = await publicRes.text().catch(() => publicRes.statusText);
        throw new Error(`Failed to load public indexed documents ${publicRes.status}: ${body}`);
      }
      if (!oldRes.ok) {
        const body = await oldRes.text().catch(() => oldRes.statusText);
        throw new Error(`Failed to load old indexed documents ${oldRes.status}: ${body}`);
      }
      const privateData = await privateRes.json() as { documents?: IndexedDocument[] };
      const publicData = await publicRes.json() as { documents?: IndexedDocument[] };
      const oldData = await oldRes.json() as { documents?: IndexedDocument[] };
      const normalizeDoc = (doc: IndexedDocument): IndexedDocument => ({
        ...doc,
        source: doc.source.startsWith("/") ? `${apiBase}${doc.source}` : doc.source,
      });
      setIndexedDocs((privateData.documents ?? []).map(normalizeDoc));
      setPublicIndexedDocs((publicData.documents ?? []).map(normalizeDoc));
      setOldIndexedDocs((oldData.documents ?? []).map(normalizeDoc));
    } catch (err) {
      console.error(err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (user) void refreshIndexedDocs();
  }, [user]);

  const isAdmin = access?.is_admin === true;

  const activeConv = conversations.find((c) => c.id === activeId);

  const handleNewChat = () => {
    const id = `conv-${Date.now()}`;
    setConversations((prev) => [
      { id, title: "New conversation", timestamp: new Date(), messages: [] },
      ...prev,
    ]);
    setActiveId(id);
    setView("chat");
    setMobileSidebarOpen(false);
  };

  const handleDelete = async (id: string) => {
    const target = conversations.find((c) => c.id === id);
    const backendId = target?.backendId;

    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== id);
      const next = rest.length > 0 ? rest : [emptyConversation()];
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });

    if (!backendId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Missing Supabase session");

      const res = await fetch(`${getApiBase()}/conversations/${backendId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          accept: "application/json",
        },
      });
      if (!res.ok && res.status !== 404) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Failed to delete conversation ${res.status}: ${body}`);
      }
    } catch (err) {
      console.error(err);
      if (sessionStorage.getItem("chatmydocs-delete-reload") !== backendId) {
        sessionStorage.setItem("chatmydocs-delete-reload", backendId);
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) void loadConversationHistory(session.access_token);
      }
    }
  };

  const handleRename = (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Grab the live JWT — required by every request
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const convId = activeId;
    const backendConvId = activeConv?.backendId ?? null;
    const isFirst = !activeConv?.messages.length || activeConv.title === "New conversation";
    const userMessageId = makeMessageId("user");
    const aiId = makeMessageId("ai");

    // Immediately render user message + empty AI placeholder
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              title: isFirst ? text.slice(0, 60) : c.title,
              timestamp: new Date(),
              messages: [
                ...c.messages,
                { id: userMessageId, role: "user" as const, content: text, timestamp: new Date() },
                { id: aiId, role: "ai" as const, content: "", streaming: true, timestamp: new Date() },
              ],
            }
          : c
      )
    );
    setIsStreaming(true);

    cancelStreamRef.current = streamQuery(text, backendConvId, session.access_token, {
      onMeta: (conversationId: string, sources: ApiSource[]) => {
        const citations: Citation[] = sources.map((s, i) => ({
          id: i + 1,
          docName: s.document_name ?? s.source,
          sourceUrl: s.source,
          originalSource: s.original_source,
          page: s.page,
          snippet: s.matched_text ?? s.excerpt ?? "",
        }));
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  backendId: conversationId,
                  messages: c.messages.map((m) =>
                    m.id === aiId ? { ...m, citations } : m
                  ),
                }
              : c
          )
        );
      },

      onToken: (token: string) => {
        setApiStatus("connected");
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiId ? { ...m, content: m.content + token } : m
                  ),
                }
              : c
          )
        );
      },

      onDone: () => {
        setApiStatus("connected");
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiId ? { ...m, streaming: false } : m
                  ),
                }
              : c
          )
        );
        setIsStreaming(false);
      },

      onError: (err: Error) => {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiId
                      ? { ...m, content: `⚠ ${err.message}`, streaming: false }
                      : m
                  ),
                }
              : c
          )
        );
        setIsStreaming(false);
      },
    });
  };

  const handleClear = () => {
    setConversations((prev) =>
      prev.map((c) => (c.id === activeId ? { ...c, messages: [] } : c))
    );
  };

  const handleUpload = async (file: File, isPublic = false) => {
    if (isPublic ? isPublicUploading : isUploading) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showNotice("error", "Upload failed", "Please choose a PDF document.");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      showNotice("error", "Session expired", "Please sign in again before uploading.");
      return;
    }

    if (isPublic) setIsPublicUploading(true);
    else setIsUploading(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/upload-document`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
          "Content-Type": "application/pdf",
          "X-Filename": file.name,
          "X-Collection": "nas_docs",
          "X-Is-Public": isPublic ? "true" : "false",
        },
        body: file,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(`Upload failed ${res.status}: ${body}`);
      }

      const result = await res.json() as { document_name?: string; collection?: string; chunks_indexed?: number };
      await refreshIndexedDocs();
      const documentName = result.document_name ?? file.name;
      const chunkText = result.chunks_indexed
        ? ` ${result.chunks_indexed} searchable chunk${result.chunks_indexed === 1 ? "" : "s"} were added to Qdrant.`
        : "";
      showNotice(
        "success",
        "Document indexed",
        isPublic
          ? `${documentName} finished uploading and is now indexed as a public document.${chunkText}`
          : `${documentName} finished uploading and is now indexed for your account.${chunkText}`
      );
    } catch (err) {
      showNotice("error", "Upload failed", err instanceof Error ? err.message : String(err));
    } finally {
      if (isPublic) setIsPublicUploading(false);
      else setIsUploading(false);
    }
  };

  const handleSignOut = () => supabase.auth.signOut();

  if (authLoading) {
    return (
      <div className="h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader size={16} className="animate-spin text-primary" />
          Loading ChatMyDocs.ai...
        </div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  if (needsPasswordSetup) return <SetPasswordView onComplete={() => setNeedsPasswordSetup(false)} />;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopNav
        user={user}
        onSignOut={handleSignOut}
        onSettings={() => setView("settings")}
        onMenuToggle={() => setMobileSidebarOpen((o) => !o)}
        apiStatus={apiStatus}
      />

      {notice && (
        <div className="fixed top-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))]">
          <div className={`rounded-2xl border shadow-xl px-4 py-3 flex items-start gap-3 ${
            notice.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-950"
              : "bg-red-50 border-red-200 text-red-950"
          }`}>
            <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              notice.type === "success" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {notice.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{notice.title}</p>
              <p className="text-sm opacity-80 mt-0.5 break-words">{notice.message}</p>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="p-1 rounded-lg opacity-70 hover:opacity-100 hover:bg-black/5 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setView("chat"); }}
          onNewChat={handleNewChat}
          onGuide={() => setView("guide")}
          onDelete={handleDelete}
          onRename={handleRename}
          currentView={view}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col overflow-hidden">
          {view === "settings" ? (
            <SettingsView
              onBack={() => setView("chat")}
              userEmail={user.email ?? ""}
              isAdmin={isAdmin}
              indexedDocs={indexedDocs}
              publicIndexedDocs={publicIndexedDocs}
              oldIndexedDocs={oldIndexedDocs}
              docsLoading={docsLoading}
              onRefreshDocs={refreshIndexedDocs}
              onPublicUpload={(file) => void handleUpload(file, true)}
              isPublicUploading={isPublicUploading}
            />
          ) : view === "guide" ? (
            <UserGuideView onBack={() => setView("chat")} isAdmin={isAdmin} />
          ) : (
            <>
              <ChatArea
                conv={activeConv}
                onCitationClick={setSourcePanel}
              />
              <ChatInput
                onSend={handleSend}
                onUpload={(file) => void handleUpload(file, false)}
                isStreaming={isStreaming}
                isUploading={isUploading}
                onClear={handleClear}
              />
            </>
          )}
        </main>
      </div>

      {sourcePanel && (
        <SourcePanel citation={sourcePanel} onClose={() => setSourcePanel(null)} />
      )}
    </div>
  );
}
