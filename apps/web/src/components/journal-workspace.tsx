"use client";
/* eslint-disable @next/next/no-img-element -- journal images are authenticated same-origin assets with imported dimensions */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, FileDown, FileText, MessageCircle, PenLine, Plus, Send, Star, Trash2, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Field, Input, Textarea } from "./ui";

type EntryKind = "JOURNAL" | "REVIEW";
type FilterKind = "ALL" | EntryKind;
type EntryAuthor = { id: string; displayName: string; username: string; avatarPath?: string | null };
type EntryIndex = { id: string; type: EntryKind; title: string; entryDate: string; rating: number | string | null; updatedAt: string; createdBy: EntryAuthor; _count?: { versions: number; comments: number } };
type EntryIndexResponse = { records: EntryIndex[]; total: number; canImport: boolean };
type Entry = EntryIndex & { contentMarkdown: string; category: string | null; tags: string[]; visibility: "PUBLIC" | "PRIVATE"; version: number; importedPath?: string | null };
type EntryComment = { id: string; content: string; anchorBlock: number | null; anchorQuote: string | null; createdAt: string; canDelete: boolean; author: { id: string; displayName: string; username: string; avatarPath?: string | null } };
type CommentAnchor = { block: number; quote: string };
type ImportResult = { imported: number; skipped: number; comments?: number; assets?: number; mode?: "structured" };
type EditorState = { id: string | null; version: number; type: EntryKind; title: string; entryDate: string; rating: string; category: string; tags: string; contentMarkdown: string; visibility: "PUBLIC" | "PRIVATE" };

const emptyEditor = (): EditorState => ({ id: null, version: 1, type: "JOURNAL", title: "", entryDate: toDateInput(new Date()), rating: "", category: "", tags: "", contentMarkdown: "", visibility: "PUBLIC" });
const JOURNAL_TICK_HEIGHT = 24;
const JOURNAL_TICK_WINDOW = 160;

export function JournalWorkspace({ initialEntryId }: { initialEntryId?: string } = {}) {
  const [records, setRecords] = useState<EntryIndex[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [filter, setFilter] = useState<FilterKind>("ALL");
  const [view, setView] = useState<"stream" | "reader">("stream");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [comments, setComments] = useState<EntryComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentAnchor, setCommentAnchor] = useState<CommentAnchor | null>(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entryAbortRef = useRef<AbortController | null>(null);
  const commentsAbortRef = useRef<AbortController | null>(null);
  const entryRequestRef = useRef(0);
  const commentsRequestRef = useRef(0);
  const currentRecordIdRef = useRef<string | undefined>(undefined);
  const userScrolledRef = useRef(false);

  const filteredRecords = useMemo(() => filter === "ALL" ? records : records.filter((record) => record.type === filter), [filter, records]);
  const currentRecord = filteredRecords[activeIndex] ?? filteredRecords[0] ?? null;
  const currentRecordId = currentRecord?.id;
  const currentEntry = selected?.id === currentRecordId ? selected : null;

  useEffect(() => {
    currentRecordIdRef.current = currentRecordId;
  }, [currentRecordId]);

  const loadIndex = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch<EntryIndexResponse>("/entries?view=index&limit=5000");
      setRecords(response.data.records);
      setCanImport(response.data.canImport);
      const nextIndex = preferredId ? Math.max(0, response.data.records.findIndex((record) => record.id === preferredId)) : 0;
      setActiveIndex(nextIndex);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "手帐加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEntry = useCallback(async (id: string) => {
    const requestId = ++entryRequestRef.current;
    entryAbortRef.current?.abort();
    const controller = new AbortController();
    entryAbortRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12_000);
    setError("");
    setDetailLoading(true);
    try {
      const response = await apiFetch<Entry>(`/entries/${id}`, { signal: controller.signal });
      if (requestId === entryRequestRef.current && currentRecordIdRef.current === id) setSelected(response.data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError" && !timedOut) return;
      if (requestId === entryRequestRef.current) setError(err instanceof ApiError ? err.message : "手帐内容加载超时，请重试");
    } finally {
      clearTimeout(timeout);
      if (requestId === entryRequestRef.current) setDetailLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (id: string) => {
    const requestId = ++commentsRequestRef.current;
    commentsAbortRef.current?.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    setCommentsLoading(true);
    try {
      const response = await apiFetch<EntryComment[]>(`/entries/${id}/comments`, { signal: controller.signal });
      if (requestId === commentsRequestRef.current && currentRecordIdRef.current === id) setComments(response.data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (requestId === commentsRequestRef.current) setError(err instanceof ApiError ? err.message : "留言加载失败");
    } finally {
      if (requestId === commentsRequestRef.current) setCommentsLoading(false);
    }
  }, []);

  useEffect(() => { void loadIndex(initialEntryId); }, [initialEntryId, loadIndex]);
  useEffect(() => () => {
    if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
    entryAbortRef.current?.abort();
    commentsAbortRef.current?.abort();
  }, []);
  useEffect(() => {
    if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
    entryRequestRef.current += 1;
    commentsRequestRef.current += 1;
    entryAbortRef.current?.abort();
    commentsAbortRef.current?.abort();
    if (!currentRecordId) {
      setSelected(null);
      setComments([]);
      setCommentAnchor(null);
      setCommentText("");
      setDetailLoading(false);
      setCommentsLoading(false);
      return;
    }
    setCommentAnchor(null);
    setCommentText("");
    setDetailLoading(true);
    setCommentsLoading(true);
    const id = currentRecordId;
    detailTimerRef.current = setTimeout(() => {
      void loadEntry(id);
      void loadComments(id);
    }, 180);
    return () => {
      if (detailTimerRef.current) clearTimeout(detailTimerRef.current);
    };
  }, [currentRecordId, loadComments, loadEntry]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !filteredRecords.length || userScrolledRef.current) return;
    const maxScroll = Math.max(0, rail.scrollHeight - rail.clientHeight);
    const top = filteredRecords.length <= 1 ? 0 : (activeIndex / (filteredRecords.length - 1)) * maxScroll;
    rail.scrollTop = top;
  }, [activeIndex, filteredRecords.length]);

  const selectIndex = (index: number) => {
    if (!filteredRecords.length) return;
    const nextIndex = Math.min(Math.max(index, 0), filteredRecords.length - 1);
    setActiveIndex(nextIndex);
    setDetailLoading(true);
    const rail = railRef.current;
    if (rail) {
      const maxScroll = Math.max(0, rail.scrollHeight - rail.clientHeight);
      const top = filteredRecords.length <= 1 ? 0 : (nextIndex / (filteredRecords.length - 1)) * maxScroll;
      rail.scrollTop = top;
    }
  };

  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || !filteredRecords.length) return;
    userScrolledRef.current = true;
    const maxScroll = Math.max(0, rail.scrollHeight - rail.clientHeight);
    const progress = maxScroll === 0 ? 0 : rail.scrollTop / maxScroll;
    const nextIndex = Math.min(filteredRecords.length - 1, Math.max(0, Math.round(progress * (filteredRecords.length - 1))));
    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
      setDetailLoading(true);
    }
  };

  const onRailPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail) return;
    dragRef.current = { y: event.clientY, scrollTop: rail.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onRailPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    if (!rail || !dragRef.current) return;
    rail.scrollTop = dragRef.current.scrollTop - (event.clientY - dragRef.current.y);
  };
  const onRailPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const openEditor = (entry?: Entry) => {
    setEditor(entry ? {
      id: entry.id,
      version: entry.version,
      type: entry.type,
      title: entry.title,
      entryDate: entry.entryDate.slice(0, 10),
      rating: entry.rating == null ? "" : String(entry.rating),
      category: entry.category ?? "",
      tags: entry.tags.join(", "),
      contentMarkdown: entry.contentMarkdown,
      visibility: entry.visibility,
    } : emptyEditor());
  };

  const saveEntry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor?.title.trim()) { setError("请填写标题"); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        type: editor.type,
        title: editor.title.trim(),
        entryDate: editor.entryDate,
        rating: editor.rating ? Number(editor.rating) : null,
        category: editor.category.trim() || null,
        tags: editor.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        visibility: editor.visibility,
        contentMarkdown: editor.contentMarkdown,
        ...(editor.id ? { version: editor.version } : {}),
      };
      const response = await apiFetch<Entry>(editor.id ? `/entries/${editor.id}` : "/entries", { method: editor.id ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setEditor(null);
      await loadIndex(response.data.id);
      await loadEntry(response.data.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const importEntries = async () => {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch<ImportResult>("/entries/import", { method: "POST" });
      await loadIndex();
      const result = response.data;
      const detail = result.comments == null ? "" : `，${result.comments} 条回应`;
      const mode = result.mode === "structured" ? "结构化迁移" : "Markdown 迁移";
      setNotice(`${mode}完成：新增 ${result.imported} 篇，跳过 ${result.skipped} 篇${detail}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Markdown 导入失败");
    } finally {
      setImporting(false);
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !commentAnchor || !commentText.trim()) return;
    setCommentSaving(true);
    setError("");
    try {
      const response = await apiFetch<EntryComment>(`/entries/${selected.id}/comments`, { method: "POST", body: JSON.stringify({ content: commentText.trim(), anchorBlock: commentAnchor.block, anchorQuote: commentAnchor.quote }) });
      setComments((current) => [...current, response.data]);
      setCommentText("");
      setCommentAnchor(null);
      setRecords((current) => current.map((record) => record.id === selected.id ? { ...record, _count: { versions: record._count?.versions ?? 1, comments: (record._count?.comments ?? 0) + 1 } } : record));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "留言发送失败");
    } finally {
      setCommentSaving(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!selected) return;
    try {
      await apiFetch(`/entries/${selected.id}/comments/${commentId}`, { method: "DELETE" });
      setComments((current) => current.filter((comment) => comment.id !== commentId));
      setRecords((current) => current.map((record) => record.id === selected.id ? { ...record, _count: { versions: record._count?.versions ?? 1, comments: Math.max(0, (record._count?.comments ?? 1) - 1) } } : record));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "留言删除失败");
    }
  };

  const removeEntry = async () => {
    if (!editor?.id || !window.confirm("确定把这篇记录移入归档？之后不会再显示在手帐和日历中。")) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/entries/${editor.id}`, { method: "DELETE" });
      setEditor(null);
      setSelected(null);
      await loadIndex();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  const setFilterAndReset = (next: FilterKind) => {
    userScrolledRef.current = false;
    setFilter(next);
    setActiveIndex(0);
  };

  return <section className="section compact"><div className="container journal-page">
    <header className="journal-header">
      <div><span className="eyebrow">LA VIE · OUR NOTES</span><h1>我们的手帐</h1><p>把普通的日子，慢慢收进来。</p></div>
      <div className="journal-header-actions"><Button className="secondary" onClick={() => openEditor()}><PenLine size={16} />写一篇</Button>{canImport && <Button className="ghost small journal-import-button" disabled={importing} onClick={() => void importEntries()}><FileDown size={14} />{importing ? "导入中…" : "导入旧 Markdown"}</Button>}</div>
    </header>
    <div className="journal-toolbar"><div className="journal-view-tabs" role="tablist" aria-label="手帐视图">{([ ["stream", "时光流"], ["reader", "翻页看"] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</div><div className="journal-filters">{([ ["ALL", "全部"], ["JOURNAL", "手帐"], ["REVIEW", "点评"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilterAndReset(key)}>{label}</button>)}</div></div>
    {error && <div className="form-message" role="alert">{error}</div>}
    {notice && <div className="form-message success" role="status">{notice}</div>}
    {loading ? <div className="loading">正在整理时间线…</div> : !records.length ? <div className="empty"><BookOpen size={30} /><h2>还没有手帐</h2><p>写下第一篇，给今天留一个小小的标记。</p><Button onClick={() => openEditor()}><Plus size={16} />写第一篇</Button></div> : !filteredRecords.length ? <div className="empty"><BookOpen size={30} /><h2>没有这类记录</h2><p>换一个筛选条件，或写下第一篇。</p></div> : <>
      {view === "stream" && <StreamView records={filteredRecords} activeIndex={activeIndex} current={currentEntry} detailLoading={detailLoading} railRef={railRef} onSelect={selectIndex} onScroll={onRailScroll} onPointerDown={onRailPointerDown} onPointerMove={onRailPointerMove} onPointerUp={onRailPointerUp} onRetry={() => currentRecordId && void loadEntry(currentRecordId)} onEdit={() => currentEntry && openEditor(currentEntry)} onOpenReader={() => setView("reader")} />}
      {view === "reader" && <ReaderView activeIndex={activeIndex} count={filteredRecords.length} entry={currentEntry} loading={detailLoading} comments={comments} commentsLoading={commentsLoading} commentAnchor={commentAnchor} commentValue={commentText} commentSaving={commentSaving} onSelect={selectIndex} onRetry={() => currentRecordId && void loadEntry(currentRecordId)} onEdit={() => currentEntry && openEditor(currentEntry)} onRequestComment={setCommentAnchor} onCancelComment={() => { setCommentAnchor(null); setCommentText(""); }} onCommentChange={setCommentText} onCommentSubmit={submitComment} onRemoveComment={(id) => void removeComment(id)} />}
    </>}
    {editor && <EntryEditor editor={editor} saving={saving} onChange={setEditor} onClose={() => setEditor(null)} onDelete={() => void removeEntry()} onSubmit={saveEntry} />}
  </div></section>;
}

function StreamView({ records, activeIndex, current, detailLoading, railRef, onSelect, onScroll, onPointerDown, onPointerMove, onPointerUp, onRetry, onEdit, onOpenReader }: {
  records: EntryIndex[]; activeIndex: number; current: Entry | null; detailLoading: boolean; railRef: React.RefObject<HTMLDivElement | null>; onSelect: (index: number) => void; onScroll: () => void; onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void; onRetry: () => void; onEdit: () => void; onOpenReader: () => void;
}) {
  const currentRecord = records[activeIndex];
  const windowStart = Math.max(0, Math.min(records.length - JOURNAL_TICK_WINDOW, activeIndex - Math.floor(JOURNAL_TICK_WINDOW / 2)));
  const visibleRecords = records.slice(windowStart, windowStart + JOURNAL_TICK_WINDOW);
  const openReaderFromCard = (target: EventTarget | null) => {
    if (!current || (target as HTMLElement | null)?.closest("button, a, input, textarea, select")) return;
    onOpenReader();
  };
  return <div className="journal-stream-stage">
    <div className="journal-stream-meta"><strong>{currentRecord ? formatDate(currentRecord.entryDate) : "选择一天"}</strong><span>{activeIndex + 1} / {records.length} 条记录</span></div>
    <article
      className={`journal-entry-card${current?.type === "REVIEW" ? " review" : ""}`}
      role={current ? "button" : undefined}
      tabIndex={current ? 0 : undefined}
      aria-label={current ? `打开《${current.title}》的翻页视图` : undefined}
      onClick={(event) => openReaderFromCard(event.target)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !(event.target as HTMLElement).closest("button, a, input, textarea, select")) {
          event.preventDefault();
          onOpenReader();
        }
      }}
    >
      <span className="journal-liquid-orb orb-one" aria-hidden="true" /><span className="journal-liquid-orb orb-two" aria-hidden="true" />
      {!current ? <div className="journal-entry-loading" aria-live="polite">{detailLoading ? "正在打开这一页…" : <button type="button" onClick={onRetry}>这一页暂时没有打开，点击重试</button>}</div> : <>
        <div className="journal-entry-copy">
          <div className="journal-entry-meta"><span className="journal-kind"><span>{current.type === "REVIEW" ? "★" : "▧"}</span>{current.type === "REVIEW" ? "点评" : "手帐"}</span><span>{current.createdBy.displayName}</span><span>{current.visibility === "PUBLIC" ? "两个人可见" : "仅自己"}</span>{current.importedPath && <span className="journal-imported"><FileText size={12} />由 Markdown 迁入</span>}{current.rating != null && <span className="journal-rating">{stars(current.rating)}</span>}</div>
          <h2>{current.title}</h2><MarkdownPreview value={current.contentMarkdown} compact />
          <div className="journal-entry-foot"><span><MessageCircle size={14} />{currentRecord?._count?.comments ?? 0} 条回应</span><span>{current.category || "日常"}</span></div>
        </div>
        <div className="journal-entry-art" aria-hidden="true"><small>{new Date(current.entryDate).getFullYear()}</small><strong>{shortDate(current.entryDate)}</strong><span>{current.type === "REVIEW" ? "✦" : "☁"}</span></div>
        <button className="journal-entry-edit" type="button" onClick={onEdit}>编辑</button>
      </>}
    </article>
    <p className="journal-drag-hint"><span aria-hidden="true">↕</span>拖动右侧历史轴，查看全部记录</p>
    <aside className="journal-history-rail" aria-label="全部手帐历史">
      <div className="journal-history-line" aria-hidden="true" />
      <div className="journal-history-viewport" ref={railRef} onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        <div className="journal-history-spacer" aria-hidden="true" />
        <div className="journal-history-items" style={{ height: records.length * JOURNAL_TICK_HEIGHT }}>{visibleRecords.map((record, offset) => { const index = windowStart + offset; return <button key={record.id} type="button" style={{ top: index * JOURNAL_TICK_HEIGHT }} aria-label={`${formatDate(record.entryDate)}，${record.createdBy.displayName}：${record.title}`} className={`journal-history-tick${record.type === "REVIEW" ? " review" : ""}${index === activeIndex ? " active" : ""}`} onClick={() => onSelect(index)}><span>{isMonthStart(record, index, records) ? formatMonth(record.entryDate) : ""}</span><i /></button>; })}</div>
        <div className="journal-history-spacer" aria-hidden="true" />
      </div>
      <span className="journal-history-selection" aria-hidden="true">{currentRecord ? shortDate(currentRecord.entryDate) : "—"}</span>
    </aside>
  </div>;
}

function ReaderView({ activeIndex, count, entry, loading, comments, commentsLoading, commentAnchor, commentValue, commentSaving, onSelect, onRetry, onEdit, onRequestComment, onCancelComment, onCommentChange, onCommentSubmit, onRemoveComment }: {
  activeIndex: number;
  count: number;
  entry: Entry | null;
  loading: boolean;
  comments: EntryComment[];
  commentsLoading: boolean;
  commentAnchor: CommentAnchor | null;
  commentValue: string;
  commentSaving: boolean;
  onSelect: (index: number) => void;
  onRetry: () => void;
  onEdit: () => void;
  onRequestComment: (anchor: CommentAnchor) => void;
  onCancelComment: () => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: (event: React.FormEvent) => void;
  onRemoveComment: (id: string) => void;
}) {
  const gestureRef = useRef<{ x: number; y: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);
  const clearLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };
  const requestBlockComment = (blockElement: HTMLElement) => {
    const block = Number(blockElement.dataset.commentBlock);
    if (!Number.isInteger(block) || block < 0) return;
    gestureRef.current = null;
    setDragX(0);
    setDragging(false);
    onRequestComment({ block, quote: blockElement.dataset.commentQuote ?? "" });
  };
  const go = (delta: number) => {
    const target = activeIndex + delta;
    if (target < 0 || target >= count) return;
    clearLongPress();
    setDragX(0);
    setDragging(false);
    onSelect(target);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (event.button !== 0 || target.closest("button, a, input, textarea, [data-inline-comment]")) return;
    gestureRef.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
    const blockElement = target.closest<HTMLElement>("[data-comment-block]");
    if (blockElement) {
      clearLongPress();
      longPressTimerRef.current = setTimeout(() => requestBlockComment(blockElement), 520);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = gestureRef.current;
    if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.hypot(x, y) > 10) clearLongPress();
    if (Math.abs(x) > Math.abs(y)) setDragX(Math.max(-110, Math.min(110, x)));
  };
  const finishGesture = (event: React.PointerEvent<HTMLElement>) => {
    clearLongPress();
    const start = gestureRef.current;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const distance = start ? event.clientX - start.x : 0;
    if (Math.abs(distance) >= 56) go(distance < 0 ? 1 : -1);
    else { setDragX(0); setDragging(false); }
  };
  const cancelGesture = () => {
    clearLongPress();
    gestureRef.current = null;
    setDragX(0);
    setDragging(false);
  };
  return <div className="journal-reader-shell">
    <article
      aria-label="手帐正文，左右滑动切换上下篇"
      className={`journal-reader${entry?.type === "REVIEW" ? " review" : ""}${dragging ? " dragging" : ""}`}
      onContextMenu={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, a, input, textarea, [data-inline-comment]")) return;
        const blockElement = target.closest<HTMLElement>("[data-comment-block]");
        if (!blockElement) return;
        event.preventDefault();
        requestBlockComment(blockElement);
      }}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
        if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
        if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      }}
      onPointerCancel={cancelGesture}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      style={{ transform: `translate3d(${dragX}px, 0, 0)`, opacity: dragging ? Math.max(.72, 1 - Math.abs(dragX) / 400) : 1 }}
      tabIndex={0}
    >
      {!entry ? <div className="journal-reader-loading" aria-live="polite">{loading ? "正在打开这一页…" : <button type="button" onClick={onRetry}>这一页暂时没有打开，点击重试</button>}</div> : <>
        <span className="journal-liquid-orb orb-one" aria-hidden="true" /><aside><small>{entry.type === "REVIEW" ? "REVIEW" : "JOURNAL"}</small><strong>{shortDate(entry.entryDate)}</strong><span>{formatDate(entry.entryDate)}</span><span>{entry.createdBy.displayName}</span>{entry.rating != null && <b>{stars(entry.rating)}</b>}</aside><div className="journal-reader-body"><div className="journal-reader-actions"><div><span>{entry.category || "日常"}</span>{entry.importedPath && <em><FileText size={12} />Markdown 迁入</em>}</div><Button className="ghost small" onClick={onEdit}><PenLine size={14} />编辑</Button></div><h2>{entry.title}</h2><p className="journal-inline-comment-hint"><MessageCircle size={13} />长按正文任意一段添加评论</p><CommentableMarkdown entryId={entry.id} value={entry.contentMarkdown} comments={comments} commentsLoading={commentsLoading} activeAnchor={commentAnchor} commentValue={commentValue} commentSaving={commentSaving} onRequestComment={onRequestComment} onCancelComment={onCancelComment} onCommentChange={onCommentChange} onCommentSubmit={onCommentSubmit} onRemoveComment={onRemoveComment} /><div className="journal-tags">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
      </>}
    </article>
    <nav className="journal-reader-pagination" aria-label="手帐翻页"><button type="button" disabled={activeIndex === 0} onClick={() => go(-1)}><ChevronLeft size={16} />上一篇</button><span>{activeIndex + 1} / {count}<small>左右滑动切换</small></span><button type="button" disabled={activeIndex >= count - 1} onClick={() => go(1)}>下一篇<ChevronRight size={16} /></button></nav>
  </div>;
}

function CommentableMarkdown({ entryId, value, comments, commentsLoading, activeAnchor, commentValue, commentSaving, onRequestComment, onCancelComment, onCommentChange, onCommentSubmit, onRemoveComment }: {
  entryId: string;
  value: string;
  comments: EntryComment[];
  commentsLoading: boolean;
  activeAnchor: CommentAnchor | null;
  commentValue: string;
  commentSaving: boolean;
  onRequestComment: (anchor: CommentAnchor) => void;
  onCancelComment: () => void;
  onCommentChange: (value: string) => void;
  onCommentSubmit: (event: React.FormEvent) => void;
  onRemoveComment: (id: string) => void;
}) {
  const blocks = parseMarkdown(value);
  const commentsByBlock = new Map<number, EntryComment[]>();
  for (const comment of comments) {
    const quote = normalizeAnchorText(comment.anchorQuote ?? "");
    const matchingBlock = quote ? blocks.findIndex((block) => normalizeAnchorText(markdownBlockText(block)) === quote) : -1;
    const fallbackBlock = comment.anchorBlock != null && comment.anchorBlock < blocks.length ? comment.anchorBlock : blocks.length - 1;
    const blockIndex = matchingBlock >= 0 ? matchingBlock : Math.max(0, fallbackBlock);
    commentsByBlock.set(blockIndex, [...(commentsByBlock.get(blockIndex) ?? []), comment]);
  }
  return <div className="journal-markdown rich commentable">
    {blocks.map((block, index) => {
      const quote = markdownBlockText(block).slice(0, 500);
      const blockComments = commentsByBlock.get(index) ?? [];
      const isCommenting = activeAnchor?.block === index;
      return <div
        className={`journal-commentable-block${isCommenting ? " commenting" : ""}`}
        data-comment-block={index}
        data-comment-quote={quote}
        key={`${block.type}-${index}`}
        tabIndex={0}
        aria-label={`正文第 ${index + 1} 段，长按添加评论`}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key.toLowerCase() === "c") && event.target === event.currentTarget) {
            event.preventDefault();
            onRequestComment({ block: index, quote });
          }
        }}
      >
        {renderMarkdownBlock(block, `content-${index}`)}
        {blockComments.length > 0 && <div className="journal-inline-comments" data-inline-comment>
          {blockComments.map((comment, commentIndex) => <article className={`journal-inline-comment hue-${commentIndex % 4}`} key={comment.id}>
            <span className="journal-comment-avatar" aria-hidden="true">{comment.author.displayName.slice(0, 1)}</span>
            <div><div className="journal-comment-head"><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>{comment.canDelete && <button type="button" aria-label="删除这条评论" onClick={() => onRemoveComment(comment.id)}><Trash2 size={13} /></button>}</div><p>{comment.content}</p></div>
          </article>)}
        </div>}
        {commentsLoading && index === blocks.length - 1 && <span className="journal-inline-comments-loading" data-inline-comment>正在载入评论…</span>}
        {isCommenting && <form className="journal-inline-comment-composer" data-inline-comment onSubmit={onCommentSubmit}>
          <label htmlFor={`entry-comment-${entryId}-${index}`}>评论这一段</label>
          <textarea id={`entry-comment-${entryId}-${index}`} autoFocus maxLength={1200} rows={2} value={commentValue} onChange={(event) => onCommentChange(event.target.value)} placeholder="写下想说的话…" />
          <div><small>{commentValue.length} / 1200</small><button type="button" onClick={onCancelComment}>取消</button><button className="send" type="submit" disabled={commentSaving || !commentValue.trim()}><Send size={14} />{commentSaving ? "发送中" : "发送"}</button></div>
        </form>}
      </div>;
    })}
  </div>;
}

function EntryEditor({ editor, saving, onChange, onClose, onDelete, onSubmit }: { editor: EditorState; saving: boolean; onChange: (value: EditorState) => void; onClose: () => void; onDelete: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="journal-editor-backdrop"><section className="journal-editor" role="dialog" aria-modal="true" aria-labelledby="journal-editor-title"><header><div><span className="eyebrow">WRITE IT DOWN</span><h2 id="journal-editor-title">{editor.id ? "编辑记录" : "写一篇"}</h2></div><button type="button" aria-label="关闭" onClick={onClose}><X size={19} /></button></header><form className="form-stack" onSubmit={onSubmit}><div className="journal-editor-type"><button type="button" className={editor.type === "JOURNAL" ? "active" : ""} onClick={() => onChange({ ...editor, type: "JOURNAL" })}><BookOpen size={16} />手帐</button><button type="button" className={editor.type === "REVIEW" ? "active" : ""} onClick={() => onChange({ ...editor, type: "REVIEW" })}><Star size={16} />点评</button></div><Field label="标题" required><Input autoFocus value={editor.title} onChange={(event) => onChange({ ...editor, title: event.target.value })} placeholder="例如：周末一起去散步" maxLength={160} /></Field><div className="form-grid"><Field label="日期" required><Input type="date" value={editor.entryDate} onChange={(event) => onChange({ ...editor, entryDate: event.target.value })} /></Field><Field label="评分"><Input type="number" min="0" max="5" step="0.5" value={editor.rating} onChange={(event) => onChange({ ...editor, rating: event.target.value })} placeholder="点评时填写" /></Field></div><Field label="正文"><Textarea className="journal-editor-textarea" value={editor.contentMarkdown} onChange={(event) => onChange({ ...editor, contentMarkdown: event.target.value })} placeholder="写下今天发生的事，也可以直接粘贴 Markdown" maxLength={100000} /></Field><div className="form-grid"><Field label="分类"><Input value={editor.category} onChange={(event) => onChange({ ...editor, category: event.target.value })} placeholder="电影、散步、日常" /></Field><Field label="标签"><Input value={editor.tags} onChange={(event) => onChange({ ...editor, tags: event.target.value })} placeholder="用逗号分隔" /></Field></div><label className="journal-visibility"><input type="checkbox" checked={editor.visibility === "PRIVATE"} onChange={(event) => onChange({ ...editor, visibility: event.target.checked ? "PRIVATE" : "PUBLIC" })} />仅自己可见</label><div className="journal-editor-actions">{editor.id && <Button className="danger" disabled={saving} type="button" onClick={onDelete}>移入归档</Button>}<span /><Button className="secondary" type="button" onClick={onClose}>取消</Button><Button disabled={saving} type="submit">{saving ? "保存中…" : "保存"}</Button></div></form></section></div>;
}

function MarkdownPreview({ value, compact = false }: { value: string; compact?: boolean }) {
  if (compact) {
    const plain = value.replace(/```[\s\S]*?```/g, "").replace(/!\[[^\]]*\]\([^)]+\)/g, "[图片]").replace(/^#{1,6}\s+/gm, "").replace(/^[-*>]\s+/gm, "").replace(/\n+/g, " ").trim() || "还没有写下正文。";
    return <div className="journal-markdown compact"><p>{plain}</p></div>;
  }
  const blocks = parseMarkdown(value);
  return <div className="journal-markdown rich">{blocks.map((block, index) => renderMarkdownBlock(block, `${block.type}-${index}`))}</div>;
}

type MarkdownBlock = { type: "heading"; level: number; text: string } | { type: "quote"; text: string } | { type: "list"; ordered: boolean; items: string[] } | { type: "image"; alt: string; src: string } | { type: "code"; text: string } | { type: "rule" } | { type: "paragraph"; text: string };
function renderMarkdownBlock(block: MarkdownBlock, key: string) {
  if (block.type === "heading") return block.level === 1 ? <h3 key={key}>{block.text}</h3> : <h4 key={key}>{block.text}</h4>;
  if (block.type === "quote") return <blockquote key={key}>{block.text}</blockquote>;
  if (block.type === "list") return block.ordered ? <ol key={key}>{block.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <ul key={key}>{block.items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>;
  if (block.type === "image") return <figure className="journal-markdown-image" key={key}><img src={block.src} alt={block.alt} loading="lazy" />{block.alt && <figcaption>{block.alt}</figcaption>}</figure>;
  if (block.type === "code") return <pre key={key}><code>{block.text}</code></pre>;
  if (block.type === "rule") return <hr key={key} />;
  return <p key={key}>{block.text}</p>;
}
function markdownBlockText(block: MarkdownBlock) {
  if (block.type === "list") return block.items.join(" ");
  if (block.type === "image") return block.alt || "图片";
  if (block.type === "rule") return "分隔线";
  return block.text;
}
function normalizeAnchorText(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 500); }
function parseMarkdown(value: string): MarkdownBlock[] {
  const lines = value.trim() ? value.replace(/\r/g, "").split("\n") : ["还没有写下正文。"];
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }
    if (line.trim().startsWith("```")) {
      const code: string[] = []; index += 1;
      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) { code.push(lines[index] ?? ""); index += 1; }
      blocks.push({ type: "code", text: code.join("\n") }); index += 1; continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { blocks.push({ type: "heading", level: heading[1]!.length, text: heading[2]! }); index += 1; continue; }
    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)#]+)(?:#[^)]*)?\)$/);
    if (image) { blocks.push({ type: "image", alt: image[1]!, src: image[2]! }); index += 1; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push({ type: "rule" }); index += 1; continue; }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) { quote.push((lines[index] ?? "").replace(/^>\s?/, "")); index += 1; }
      blocks.push({ type: "quote", text: quote.join(" ") }); continue;
    }
    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]); const items: string[] = [];
      while (index < lines.length) { const item = (lines[index] ?? "").match(/^\s*(?:([-*+])|(\d+)\.)\s+(.+)$/); if (!item || Boolean(item[2]) !== ordered) break; items.push(item[3]!); index += 1; }
      blocks.push({ type: "list", ordered, items }); continue;
    }
    const paragraph = [line.trim()]; index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{1,6})\s+|^```|^>\s?|^\s*(?:[-*+]|\d+\.)\s+|^!\[[^\]]*\]\([^)]+\)$/.test(lines[index] ?? "")) { paragraph.push((lines[index] ?? "").trim()); index += 1; }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

function stars(value: number | string) { const number = Number(value); return `${"★".repeat(Math.floor(number))}${number % 1 ? "½" : ""}`; }
function toDateInput(value: Date) { const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 10); }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(value)); }
function shortDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value)); }
function formatMonth(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short" }).format(new Date(value)); }
function formatCommentTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function isMonthStart(record: EntryIndex, index: number, records: EntryIndex[]) { const previous = records[index - 1]; return index === 0 || !previous || record.entryDate.slice(0, 7) !== previous.entryDate.slice(0, 7); }
