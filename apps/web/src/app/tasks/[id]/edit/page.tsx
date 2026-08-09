"use client";
import { useParams } from "next/navigation";
import { TaskForm } from "@/components/task-form";
export default function EditTaskPage() { const params = useParams<{ id: string }>(); return <section className="section compact"><div className="narrow"><div className="section-heading"><div><span className="eyebrow">编辑</span><h1>修改任务</h1></div></div><div className="form-card"><TaskForm taskId={params.id} /></div></div></section>; }
