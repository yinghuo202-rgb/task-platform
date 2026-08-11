"use client";
/* eslint-disable @next/next/no-img-element -- journal images are authenticated same-origin assets with imported dimensions */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarDays, FileDown, FileText, MessageCircle, PenLine, Plus, Send, Sparkles, Star, Trash2, X } from "lucide-react";
import { apiFetch, ApiError } from "@/lib/api";
import { Button, Field, Input, Textarea } from "./ui";

type EntryKind = "JOURNAL" | "REVIEW";
type FilterKind = "ALL" | EntryKind;
type EntryAuthor = { id: string; displayName: string; username: string; avatarPath?: string | null };
type EntryIndex = { id: string; type: EntryKind; title: string; entryDate: string; rating: number | string | null; updatedAt: string; createdBy: EntryAuthor; _count?: { versions: number; comments: number } };
type EntryIndexResponse = { records: EntryIndex[]; total: number; canImport: boolean };
type Entry = EntryIndex & { contentMarkdown: string; category: string | null; tags: string[]; visibility: "PUBLIC" | "PRIVATE"; version: number; importedPath?: string | null };
type EntryComment = { id: string; content: string; createdAt: string; canDelete: boolean; author: { id: string; displayName: string; username: string; avatarPath?: string | null } };
type ImportResult = { imported: number; skipped: number; comments?: number; assets?: number; mode?: "structured" };
type EditorState = { id: string | null; version: number; type: EntryKind; title: string; entryDate: string; rating: string; category: string; tags: string; contentMarkdown: string; visibility: "PUBLIC" | "PRIVATE" };

const emptyEditor = (): EditorState => ({ id: null, version: 1, type: "JOURNAL", title: "", entryDate: toDateInput(new Date()), rating: "", category: "", tags: "", contentMarkdown: "", visibility: "PUBLIC" });

export function JournalWorkspace({ initialEntryId }: { initialEntryId?: string } = {}) {
  const [records, setRecords] = useState<EntryIndex[]>([]);
  const [canImport, setCanImport] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [filter, setFilter] = useState<FilterKind>("ALL");
  const [view, setView] = useState<"stream" | "reader" | "memory">("stream");
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
  const [commentSaving, setCommentSaving] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; scrollTop: number } | null>(null);
  const userScrolledRef = useRef(false);

  const filteredRecords = useMemo(() => filter === "ALL" ? records : records.filter((record) => record.type === filter), [filter, records]);
  const currentRecord = filteredRecords[activeIndex] ?? filteredRecords[0] ?? null;
  const currentRecordId = currentRecord?.id;

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
    setDetailLoading(true);
    try {
      const response = await apiFetch<Entry>(`/entries/${id}`);
      setSelected(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "手帐内容加载失败");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadComments = useCallback(async (id: string) => {
    setCommentsLoading(true);
    try {
      const response = await apiFetch<EntryComment[]>(`/entries/${id}/comments`);
      setComments(response.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "留言加载失败");
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => { void loadIndex(initialEntryId); }, [initialEntryId, loadIndex]);
  useEffect(() => {
    if (currentRecordId) void Promise.all([loadEntry(currentRecordId), loadComments(currentRecordId)]);
  }, [currentRecordId, loadComments, loadEntry]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !filteredRecords.length || userScrolledRef.current) return;
    const rowHeight = 24;
    rail.scrollTo({ top: Math.max(0, activeIndex * rowHeight - rail.clientHeight / 2 + rowHeight / 2), behavior: "smooth" });
  }, [activeIndex, filteredRecords.length]);

  const selectIndex = (index: number) => {
    if (!filteredRecords.length) return;
    const nextIndex = Math.min(Math.max(index, 0), filteredRecords.length - 1);
    setActiveIndex(nextIndex);
    const rail = railRef.current;
    if (rail) rail.scrollTo({ top: Math.max(0, nextIndex * 24 - rail.clientHeight / 2 + 12), behavior: "smooth" });
  };

  const onRailScroll = () => {
    const rail = railRef.current;
    if (!rail || !filteredRecords.length) return;
    userScrolledRef.current = true;
    const nextIndex = Math.min(filteredRecords.length - 1, Math.max(0, Math.round((rail.scrollTop + rail.clientHeight / 2 - 12) / 24)));
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
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
        entryDate: new Date(`${editor.entryDate}T00:00:00`).toISOString(),
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
    if (!selected || !commentText.trim()) return;
    setCommentSaving(true);
    setError("");
    try {
      const response = await apiFetch<EntryComment>(`/entries/${selected.id}/comments`, { method: "POST", body: JSON.stringify({ content: commentText.trim() }) });
      setComments((current) => [...current, response.data]);
      setCommentText("");
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
      <div className="journal-header-actions"><Button className="secondary" onClick={() => openEditor()}><PenLine size={16} />写一篇</Button>{canImport && <Button className="ghost" disabled={importing} onClick={() => void importEntries()}><FileDown size={16} />{importing ? "导入中…" : "导入旧 Markdown"}</Button>}</div>
    </header>
    <div className="journal-toolbar"><div className="journal-view-tabs" role="tablist" aria-label="手帐视图">{([ ["stream", "时光流"], ["reader", "翻页看"], ["memory", "回忆"] ] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</div><div className="journal-filters">{([ ["ALL", "全部"], ["JOURNAL", "手帐"], ["REVIEW", "点评"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} className={filter === key ? "active" : ""} onClick={() => setFilterAndReset(key)}>{label}</button>)}</div></div>
    {error && <div className="form-message" role="alert">{error}</div>}
    {notice && <div className="form-message success" role="status">{notice}</div>}
    {loading ? <div className="loading">正在整理时间线…</div> : !records.length ? <div className="empty"><BookOpen size={30} /><h2>还没有手帐</h2><p>写下第一篇，给今天留一个小小的标记。</p><Button onClick={() => openEditor()}><Plus size={16} />写第一篇</Button></div> : <>
      {view === "stream" && <StreamView records={filteredRecords} activeIndex={activeIndex} current={selected} detailLoading={detailLoading} railRef={railRef} onSelect={selectIndex} onScroll={onRailScroll} onPointerDown={onRailPointerDown} onPointerMove={onRailPointerMove} onPointerUp={onRailPointerUp} onEdit={() => selected && openEditor(selected)} />}
      {view === "reader" && <ReaderView entry={selected} loading={detailLoading} onEdit={() => selected && openEditor(selected)} />}
      {view === "memory" && <MemoryView records={records} />}
      {view !== "memory" && selected && <JournalConversation entry={selected} comments={comments} loading={commentsLoading} value={commentText} saving={commentSaving} onChange={setCommentText} onSubmit={submitComment} onRemove={(id) => void removeComment(id)} />}
    </>}
    {editor && <EntryEditor editor={editor} saving={saving} onChange={setEditor} onClose={() => setEditor(null)} onDelete={() => void removeEntry()} onSubmit={saveEntry} />}
  </div></section>;
}

function StreamView({ records, activeIndex, current, detailLoading, railRef, onSelect, onScroll, onPointerDown, onPointerMove, onPointerUp, onEdit }: {
  records: EntryIndex[]; activeIndex: number; current: Entry | null; detailLoading: boolean; railRef: React.RefObject<HTMLDivElement | null>; onSelect: (index: number) => void; onScroll: () => void; onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void; onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void; onEdit: () => void;
}) {
  const currentRecord = records[activeIndex];
  return <div className="journal-stream-stage">
    <div className="journal-stream-meta"><strong>{currentRecord ? formatDate(currentRecord.entryDate) : "选择一天"}</strong><span>{activeIndex + 1} / {records.length} 条记录</span></div>
    <article className={`journal-entry-card${current?.type === "REVIEW" ? " review" : ""}`}>
      <span className="journal-liquid-orb orb-one" aria-hidden="true" /><span className="journal-liquid-orb orb-two" aria-hidden="true" />
      {detailLoading || !current ? <div className="journal-entry-loading">正在打开这一页…</div> : <>
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
        <div className="journal-history-items">{records.map((record, index) => <button key={record.id} type="button" aria-label={`${formatDate(record.entryDate)}，${record.createdBy.displayName}：${record.title}`} className={`journal-history-tick${record.type === "REVIEW" ? " review" : ""}${index === activeIndex ? " active" : ""}`} onClick={() => onSelect(index)}><span>{isMonthStart(record, index, records) ? formatMonth(record.entryDate) : ""}</span><i /></button>)}</div>
        <div className="journal-history-spacer" aria-hidden="true" />
      </div>
      <span className="journal-history-selection" aria-hidden="true">{currentRecord ? shortDate(currentRecord.entryDate) : "—"}</span>
    </aside>
  </div>;
}

function ReaderView({ entry, loading, onEdit }: { entry: Entry | null; loading: boolean; onEdit: () => void }) {
  if (loading || !entry) return <div className="loading">正在打开这一页…</div>;
  return <article className={`journal-reader${entry.type === "REVIEW" ? " review" : ""}`}><span className="journal-liquid-orb orb-one" aria-hidden="true" /><aside><small>{entry.type === "REVIEW" ? "REVIEW" : "JOURNAL"}</small><strong>{shortDate(entry.entryDate)}</strong><span>{formatDate(entry.entryDate)}</span><span>{entry.createdBy.displayName}</span>{entry.rating != null && <b>{stars(entry.rating)}</b>}</aside><div className="journal-reader-body"><div className="journal-reader-actions"><div><span>{entry.category || "日常"}</span>{entry.importedPath && <em><FileText size={12} />Markdown 迁入</em>}</div><Button className="ghost small" onClick={onEdit}><PenLine size={14} />编辑</Button></div><h2>{entry.title}</h2><MarkdownPreview value={entry.contentMarkdown} /><div className="journal-tags">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div></article>;
}

function MemoryView({ records }: { records: EntryIndex[] }) {
  const monthCounts = records.reduce<Record<string, number>>((result, record) => { const key = record.entryDate.slice(0, 7); result[key] = (result[key] ?? 0) + 1; return result; }, {});
  const reviewCount = records.filter((record) => record.type === "REVIEW").length;
  const journalCount = records.length - reviewCount;
  const months = Object.entries(monthCounts).slice(0, 12);
  const today = new Date();
  const todaySuffix = `-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const sameDayMemories = records.filter((record) => record.entryDate.slice(0, 10).endsWith(todaySuffix) && Number(record.entryDate.slice(0, 4)) < today.getFullYear()).slice(0, 3);
  return <div className="journal-memory"><section className="journal-memory-panel"><div className="journal-memory-heading"><div><span className="eyebrow">ALL THE LITTLE DAYS</span><h2>留下来的日子</h2></div><Sparkles size={22} /></div><div className="journal-memory-grid">{months.length ? months.map(([month, count]) => <div className="journal-month-stat" key={month}><span>{month.replace("-", " 年 ")} 月</span><strong>{count}</strong><small>条记录</small><i style={{ height: `${Math.max(18, Math.min(100, count * 14))}%` }} /></div>) : <p className="muted">写下第一篇后，这里会出现时间分布。</p>}</div></section><section className="journal-memory-panel journal-memory-summary"><h2>记录构成</h2><div><BookOpen size={18} /><span>手帐</span><strong>{journalCount}</strong></div><div><Star size={18} /><span>点评</span><strong>{reviewCount}</strong></div><p>回忆页只做内容聚合，不会增加额外的记录流程。</p></section><section className="journal-memory-today"><CalendarDays size={20} /><div><strong>往年的今天</strong>{sameDayMemories.length ? <nav>{sameDayMemories.map((record) => <Link href={`/journal?entry=${record.id}`} key={record.id}><span>{record.entryDate.slice(0, 4)}</span>{record.title}</Link>)}</nav> : <p>这一天还没有旧记录。今天写下的内容，明年会在这里重逢。</p>}</div></section></div>;
}

function JournalConversation({ entry, comments, loading, value, saving, onChange, onSubmit, onRemove }: { entry: Entry; comments: EntryComment[]; loading: boolean; value: string; saving: boolean; onChange: (value: string) => void; onSubmit: (event: React.FormEvent) => void; onRemove: (id: string) => void }) {
  const quickReplies = ["我也记得这一刻", "下次还要一起", "看到这里又笑了"];
  return <section className="journal-conversation">
    <header><div><span className="journal-conversation-icon"><MessageCircle size={18} /></span><div><h2>留一句话</h2><p>正文继续记录生活，回应留给此刻的我们。</p></div></div><span>{comments.length} 条回应</span></header>
    <div className="journal-comment-list">
      {loading ? <div className="journal-comment-empty">正在找回这些回应…</div> : comments.length ? comments.map((comment, index) => <article className={`journal-comment-card hue-${index % 4}`} key={comment.id}><span className="journal-comment-avatar" aria-hidden="true">{comment.author.displayName.slice(0, 1)}</span><div><div className="journal-comment-head"><strong>{comment.author.displayName}</strong><time dateTime={comment.createdAt}>{formatCommentTime(comment.createdAt)}</time>{comment.canDelete && <button type="button" aria-label="删除这条回应" onClick={() => onRemove(comment.id)}><Trash2 size={13} /></button>}</div><MarkdownPreview value={comment.content} /></div></article>) : <div className="journal-comment-empty"><Sparkles size={19} /><span>还没有回应。可以写下看完这一篇时最先想到的话。</span></div>}
    </div>
    <form className="journal-comment-composer" onSubmit={onSubmit}>
      <div className="journal-quick-replies">{quickReplies.map((reply) => <button type="button" key={reply} onClick={() => onChange(reply)}>{reply}</button>)}</div>
      <label htmlFor={`entry-comment-${entry.id}`}>回应《{entry.title}》</label>
      <div><textarea id={`entry-comment-${entry.id}`} maxLength={1200} rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder="写下此刻想到的一句话…" /><button type="submit" disabled={saving || !value.trim()} aria-label="发送回应"><Send size={17} /><span>{saving ? "发送中" : "发送"}</span></button></div>
      <small>{value.length} / 1200</small>
    </form>
  </section>;
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
  return <div className="journal-markdown rich">{blocks.map((block, index) => {
    const key = `${block.type}-${index}`;
    if (block.type === "heading") return block.level === 1 ? <h3 key={key}>{block.text}</h3> : <h4 key={key}>{block.text}</h4>;
    if (block.type === "quote") return <blockquote key={key}>{block.text}</blockquote>;
    if (block.type === "list") return block.ordered ? <ol key={key}>{block.items.map((item) => <li key={item}>{item}</li>)}</ol> : <ul key={key}>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    if (block.type === "image") return <figure className="journal-markdown-image" key={key}><img src={block.src} alt={block.alt} loading="lazy" />{block.alt && <figcaption>{block.alt}</figcaption>}</figure>;
    if (block.type === "code") return <pre key={key}><code>{block.text}</code></pre>;
    if (block.type === "rule") return <hr key={key} />;
    return <p key={key}>{block.text}</p>;
  })}</div>;
}

type MarkdownBlock = { type: "heading"; level: number; text: string } | { type: "quote"; text: string } | { type: "list"; ordered: boolean; items: string[] } | { type: "image"; alt: string; src: string } | { type: "code"; text: string } | { type: "rule" } | { type: "paragraph"; text: string };
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
