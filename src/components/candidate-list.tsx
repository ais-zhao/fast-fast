import { CandidateCard } from "@/components/candidate-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Candidate } from "@/lib/types";

export function CandidateList({
  candidates,
  selectedCode,
  heldCodes,
  onSelect,
}: {
  candidates: Candidate[];
  selectedCode: string | null;
  heldCodes: string[];
  onSelect: (code: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {candidates.map((candidate) => (
        <CandidateCard
          key={candidate.code}
          candidate={candidate}
          selected={selectedCode === candidate.code}
          alreadyHeld={heldCodes.includes(candidate.code)}
          onSelect={() => onSelect(candidate.code)}
        />
      ))}
    </div>
  );
}

export function CandidateListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-32 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function CapitalBarSkeleton() {
  return <Skeleton className="h-24 w-full rounded-xl" />;
}
