"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/client";

type Result = { ok: boolean; message?: string; error?: string };

/** Runs a server action, toasts the outcome and refreshes the server components. */
export function useAct() {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast({ tone: "success", title: r.message ?? "Done" });
      else toast({ tone: "error", title: r.error ?? "Something went wrong" });
      after?.(r);
      router.refresh();
    });
  return { pending, act };
}
