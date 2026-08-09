import type { Metadata } from "next";
import { JournalWorkspace } from "@/components/journal-workspace";

export const metadata: Metadata = { title: "手帐" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ entry?: string }> }) {
  const params = await searchParams;
  return <JournalWorkspace initialEntryId={params.entry} />;
}
