import type { Metadata } from "next";
import { TaskForm } from "@/components/task-form";
export const metadata: Metadata = { title: "发布任务" };
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <section className="section compact"><div className="narrow"><div className="section-heading"><div><span className="eyebrow">LA VIE · FOR YOU</span><h1>发布给对方</h1><p className="muted">写下事情、时间和奖励，对方接取后进入自己的清单。</p></div></div><div className="form-card"><TaskForm initialProjectId={project} /></div></div></section>;
}
