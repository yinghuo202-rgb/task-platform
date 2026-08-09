import type { Metadata } from "next";
import { TaskForm } from "@/components/task-form";
export const metadata: Metadata = { title: "加一件事" };
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  return <section className="section compact"><div className="narrow"><div className="section-heading"><div><span className="eyebrow">LA VIE · TO DO</span><h1>加一件事</h1><p className="muted">一句话、一个时间，就够了。</p></div></div><div className="form-card"><TaskForm initialProjectId={project} /></div></div></section>;
}
