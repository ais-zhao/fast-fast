import { loadingDeskPayload } from "@/lib/mock-data";
import { DeskApp } from "@/components/desk-app";

export const dynamic = "force-dynamic";

export default function Home() {
  return <DeskApp initialPayload={loadingDeskPayload()} />;
}
