import { redirect } from "next/navigation";

export default function RewardsPage() {
  redirect("/tasks?view=rewards");
}
