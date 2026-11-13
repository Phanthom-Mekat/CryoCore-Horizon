"use client";

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUp, Check, ClipboardCheck, Download, Droplets, FileText, Loader2, MapPin, MessageSquarePlus, PanelRightClose, ShieldCheck, Sparkles, Sprout, X,
  type LucideIcon,
} from "lucide-react";
import { CASE_ID } from "@/lib/chattogram/case-api";
import { sendToMap, useMapContext } from "@/lib/chattogram/map-bus";
import { fmtNum } from "@/lib/i18n/format";
import { useLang, useT } from "@/lib/i18n/useT";
import { useCase } from "./CaseProvider";

type Step = { tool: string; ok: boolean };
type Message = { role: "user" | "model"; text: string; steps?: Step[]; error?: boolean; model?: string };
type Action =
  | { type: "map"; lon: number; lat: number; zoom: number; finding?: string; point?: boolean }
  | { type: "layer"; layer: "plain" | "change_db" | "before_db" | "after_db" | "quicklook" }
  | { type: "page"; page: string }
  | { type: "download"; format: "json" | "csv" | "geojson" };
type Event =
  | { type: "step"; tool: string; ok: boolean }
  | { type: "action"; action: Action }
  | { type: "reply"; text: string; model: string }
  | { type: "error"; detail: string };

const EXPLORE = "/chattogram/explore";
const PAGE: Record<string, string> = {
  overview: "/chattogram", tour: "/chattogram/tour", explore: EXPLORE, compare: "/chattogram/compare", processed: "/chattogram/processed",
  evidence: "/chattogram/evidence", catalogue: "/chattogram/catalogue", about: "/chattogram/about",
};
/** One icon per suggested question, in the order of messages.assistant.suggestions. */
const SUGGESTION_ICONS: LucideIcon[] = [MapPin, ClipboardCheck, Droplets, Sprout, ShieldCheck, Download];

// Open or closed is remembered per browser (and stays put while moving between case pages: the panel lives in the layout).
const OPEN_KEY = "cryo-ask-open";
const openListeners = new Set<() => void>();
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) === "1";
  } catch {
    return false;
  }
};
function setOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode: open for this page view only */
  }
  openListeners.forEach((fn) => fn());
}
const subscribeOpen = (fn: () => void) => {
  openListeners.add(fn);
  return () => openListeners.delete(fn);
};
// the shell's top bar has a slot for page tools; the toggle renders there
const noop = () => () => {};
const topSlot = () => document.querySelector(".d-top-slot");

/** Events from the backend's stream, one JSON object per line. */
async function* events(response: Response): AsyncGenerator<Event> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) yield JSON.parse(line) as Event;
    }
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as Event;
}

/** The reply's light markdown (paragraphs, "- " lists, **bold**) as React text: nothing is parsed as HTML. */
function Reply({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (item) list.push(item[1]);
    else {
      flush();
      if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
}

/**
 * "Ask the map": a panel docked beside the page (the page narrows to make room; nothing is covered) that answers from
 * the case data and carries out what it is asked to do in the app. Its toggle sits in the top bar.
 */
export function Assistant() {
  const t = useT();
  const a = t.assistant;
  const lang = useLang();
  const path = usePathname();
  const router = useRouter();
  const { set, caseHref, href, finding, source, frozenCurated } = useCase();
  const map = useMapContext();
  const open = useSyncExternalStore(subscribeOpen, readOpen, () => false);
  const slot = useSyncExternalStore(noop, topSlot, () => null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // braces: newer browsers return a Promise here, not a clean-up
  }, [messages, busy]);
  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);
  useEffect(() => () => abort.current?.abort(), []);
  // the textarea grows with what is typed, up to about five lines
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    // empty: one line (measuring while the panel is still laying out gives a height that is too big)
    if (input) el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input, open]);

  const pageKey = Object.keys(PAGE).find((k) => PAGE[k] === path) ?? null;
  const onExplore = path === EXPLORE;
  const point = onExplore ? map.point : null;

  // The assistant's tasks, done in the app as soon as each arrives.
  function act(action: Action) {
    if (action.type === "map") {
      if (action.point) sendToMap({ point: [action.lon, action.lat] });
      const view = { lon: action.lon, lat: action.lat, zoom: action.zoom };
      if (onExplore) set({ view, f: action.finding ?? null });
      else {
        const next = new URL(caseHref(EXPLORE) ?? href(EXPLORE), window.location.origin);
        next.searchParams.set("v", `${view.lon.toFixed(4)},${view.lat.toFixed(4)},${view.zoom.toFixed(2)}`);
        if (action.finding) next.searchParams.set("f", action.finding);
        else next.searchParams.delete("f");
        router.push(`${next.pathname}${next.search}`);
      }
    } else if (action.type === "layer") {
      sendToMap({ layer: action.layer });
      if (!onExplore) router.push(caseHref(EXPLORE) ?? href(EXPLORE));
    } else if (action.type === "page" && PAGE[action.page]) {
      router.push(href(PAGE[action.page]));
    } else if (action.type === "download") {
      const link = document.createElement("a");
      link.href = source.mode === "frozen" && frozenCurated ? frozenCurated.exports[action.format] : `/api/earth/curated-cases/${CASE_ID}/export?format=${action.format}`;
      link.download = "";
      link.click();
    }
  }

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    // a question whose answer failed goes too, so the model never sees two questions in a row
    const answered = messages.filter((m, i) => !m.error && !messages[i + 1]?.error);
    const history: Message[] = [...answered, { role: "user", text: question }];
    setMessages([...history, { role: "model", text: "", steps: [] }]);
    setInput("");
    setBusy(true);
    const update = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    abort.current = new AbortController();
    try {
      const response = await fetch("/api/earth/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.current.signal,
        body: JSON.stringify({
          messages: history.slice(-20).map(({ role, text }) => ({ role, text })),
          context: { lang, page: pageKey, finding, point, layer: onExplore ? map.layer : null },
        }),
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().then((j: { detail?: unknown }) => (typeof j.detail === "string" ? j.detail : null), () => null);
        update((m) => ({ ...m, text: detail ?? (response.status === 503 ? a.offline : a.failed), error: true }));
        return;
      }
      for await (const e of events(response)) {
        if (e.type === "step") update((m) => ({ ...m, steps: [...(m.steps ?? []), { tool: e.tool, ok: e.ok }] }));
        else if (e.type === "action") act(e.action);
        else if (e.type === "reply") update((m) => ({ ...m, text: e.text, model: e.model }));
        else if (e.type === "error") update((m) => ({ ...m, text: e.detail, error: true }));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update((m) => ({ ...m, text: a.failed, error: true }));
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    abort.current?.abort();
    setMessages([]);
    setBusy(false);
    field.current?.focus();
  };
  const lastModel = [...messages].reverse().find((m) => m.model)?.model;
  const context = [
    pageKey && t.nav[pageKey as keyof typeof t.nav],
    point && `${a.tappedSpot} (${fmtNum(point[1], 3)}, ${fmtNum(point[0], 3)})`,
    finding && a.selectedArea,
  ].filter(Boolean) as string[];

  const toggle = (
    <button type="button" className={`d-ask-toggle${open ? " is-on" : ""}`} onClick={() => setOpen(!open)} aria-pressed={open} aria-controls="ask-panel">
      <Sparkles size={16} aria-hidden="true" />
      <span>{a.open}</span>
    </button>
  );

  return (
    <>
      {slot && createPortal(toggle, slot)}
      {open && (
        <aside id="ask-panel" className="c-ask c-noprint" aria-label={a.title}>
          <header className="c-ask-head">
            <span className="c-ask-badge" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <div>
              <h2>{a.title}</h2>
              <p>{a.subtitle}</p>
            </div>
            <button type="button" className="c-ask-icon" onClick={reset} aria-label={a.reset} title={a.reset} disabled={!messages.length}>
              <MessageSquarePlus size={18} aria-hidden="true" />
            </button>
            <button type="button" className="c-ask-icon" onClick={() => setOpen(false)} aria-label={a.close} title={a.close}>
              <PanelRightClose size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="c-ask-log" aria-live="polite">
            {!messages.length && (
              <div className="c-ask-welcome">
                <p className="c-ask-greeting">{a.greeting}</p>
                <p className="c-ask-intro">{a.intro}</p>
                <p className="c-ask-label">{a.tryAsking}</p>
                <div className="c-ask-suggest">
                  {a.suggestions.map((s, i) => {
                    const Icon = SUGGESTION_ICONS[i] ?? FileText;
                    return (
                      <button key={s} type="button" onClick={() => ask(s)}>
                        <Icon size={16} aria-hidden="true" />
                        <span>{s}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="c-ask-row is-user">
                  <p className="c-ask-user">
                    <span className="c-visually-hidden">{a.you}: </span>
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={i} className="c-ask-row">
                  <span className="c-ask-avatar" aria-hidden="true">
                    <Sparkles size={14} />
                  </span>
                  <div className={`c-ask-model${m.error ? " is-error" : ""}`}>
                    {!!m.steps?.length && (
                      <ol className="c-ask-steps">
                        {m.steps.map((s, j) => (
                          <li key={j} className={s.ok ? undefined : "is-bad"}>
                            {s.ok ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
                            {a.tools[s.tool] ?? s.tool}
                            {!s.ok && ` · ${a.stepFailed}`}
                          </li>
                        ))}
                      </ol>
                    )}
                    {m.text ? (
                      <div className="c-ask-text">
                        <Reply text={m.text} />
                      </div>
                    ) : (
                      busy &&
                      i === messages.length - 1 && (
                        <p className="c-ask-working" role="status">
                          <Loader2 size={15} aria-hidden="true" className="c-spin" />
                          {a.thinking}
                        </p>
                      )
                    )}
                  </div>
                </div>
              ),
            )}
            <div ref={end} />
          </div>

          <form
            className="c-ask-compose"
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
          >
            {context.length > 0 && (
              <p className="c-ask-context">
                <span>{a.lookingAt}</span>
                {context.map((c) => (
                  <span key={c} className="c-ask-chip">
                    {c}
                  </span>
                ))}
              </p>
            )}
            <div className="c-ask-box">
              <textarea
                ref={field}
                value={input}
                rows={1}
                maxLength={2000}
                placeholder={a.placeholder}
                aria-label={a.placeholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
              />
              <button type="submit" className="c-ask-send" disabled={busy || !input.trim()} aria-label={a.send} title={a.send}>
                <ArrowUp size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="c-ask-hint">{lastModel ? a.footer(lastModel) : a.hint}</p>
          </form>
        </aside>
      )}
    </>
  );
}
