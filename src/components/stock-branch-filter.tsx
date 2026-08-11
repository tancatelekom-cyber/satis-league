"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  branches: string[];
  selectedBranch: string;
};

export function StockBranchFilter({ branches, selectedBranch }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changeBranch(branch: string) {
    startTransition(() => {
      router.push(branch ? `/stok-bilgisi?branch=${encodeURIComponent(branch)}` : "/stok-bilgisi");
    });
  }

  return (
    <label>
      <span>Şube filtresi</span>
      <select
        aria-label="Şube filtresi"
        value={selectedBranch}
        disabled={isPending}
        onChange={(event) => changeBranch(event.target.value)}
      >
        <option value="">Firma Tümü</option>
        {branches.map((branch) => <option value={branch} key={branch}>{branch}</option>)}
      </select>
    </label>
  );
}
