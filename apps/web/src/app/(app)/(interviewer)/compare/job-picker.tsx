"use client";

import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@repo/ui/select";

export function JobPicker({
  jobs,
  value,
  basePath = "/compare",
}: {
  jobs: Array<{ id: string; title: string }>;
  value?: string;
  basePath?: string;
}) {
  const router = useRouter();
  return (
    <Select value={value} onValueChange={(v) => router.push(`${basePath}?jobId=${v}`)}>
      <SelectTrigger className="w-64" aria-label="Job">
        <SelectValue placeholder="Select a job" />
      </SelectTrigger>
      <SelectContent>
        {jobs.map((j) => (
          <SelectItem key={j.id} value={j.id}>
            {j.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
