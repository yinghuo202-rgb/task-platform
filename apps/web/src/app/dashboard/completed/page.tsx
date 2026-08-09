import { redirect } from "next/navigation";
export default function Page() { redirect("/tasks?status=COMPLETED"); }
