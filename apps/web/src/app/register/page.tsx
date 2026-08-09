import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
export const metadata: Metadata = { title: "注册" };
export default function RegisterPage() { return <section className="section"><div className="narrow"><div className="section-heading"><div><span className="eyebrow">PRIVATE SPACE</span><h1>加入 la vie</h1><p className="muted">输入对方分享的空间邀请码，创建只属于你们的账号。</p></div></div><div className="form-card"><AuthForm mode="register" /></div></div></section>; }
