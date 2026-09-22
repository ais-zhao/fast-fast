import { getDeskPayload } from "@/lib/mock-data";
import { DeskApp } from "@/components/desk-app";

export const dynamic = "force-dynamic";

export default function Home() {
  const initialPayload = getDeskPayload("ok");
  return <DeskApp initialPayload={initialPayload} />;
}
