"use client";
import { useParams } from "next/navigation";
import { TaskDetail } from "@/components/task-detail";
export default function TaskDetailPage() { const params = useParams<{ id: string }>(); return <section className="section compact"><div className="container"><TaskDetail id={params.id} /></div></section>; }
