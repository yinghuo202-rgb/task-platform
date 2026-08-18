import type { Metadata } from "next";
import { RewardHistory } from "@/components/reward-history";

export const metadata: Metadata = { title: "奖励" };

export default function RewardsPage() {
  return <RewardHistory />;
}
