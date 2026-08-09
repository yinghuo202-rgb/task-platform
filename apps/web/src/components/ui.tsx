import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}
export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className}`} {...props} />;
}
export function Field({ label, error, required, children }: { label: string; error?: string; required?: boolean; children: ReactNode }) {
  return <label className="field"><span>{label}{required && <span aria-hidden="true"> *</span>}</span>{children}{error && <small className="error" role="alert">{error}</small>}</label>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: { href: string; label: string } }) {
  return <div className="empty"><h2>{title}</h2><p>{description}</p>{action && <Link className="button" href={action.href}>{action.label}</Link>}</div>;
}
export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    DRAFT: "草稿", PUBLISHED: "等人来做", CLAIMED: "已安排", IN_PROGRESS: "进行中",
    SUBMITTED: "等你确认", REVISION_REQUESTED: "需要补充", COMPLETED: "已完成",
    CANCELLED: "已取消", DISPUTED: "待商量", REMOVED: "已归档",
    PENDING: "等待回应", ACCEPTED: "对方同意了", REJECTED: "暂时不做", WITHDRAWN: "已撤回",
    ASSIGNED: "已安排", APPROVED: "已确认", ACTIVE: "正常", DISABLED: "已停用",
  };
  return <span className={`badge status-${status.toLowerCase()}`}>{labels[status] ?? status}</span>;
}
