import { Check } from "lucide-react";
import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] bg-surface">
      <aside className="hidden lg:flex flex-col justify-between bg-brand-900 text-white px-12 py-10 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full opacity-[0.07]" aria-hidden>
          <defs>
            <pattern id="rows" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
              <path d="M0 14h28" stroke="white" strokeWidth="1.2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#rows)" />
        </svg>
        <div className="relative">
          <div className="inline-flex rounded-xl bg-white px-3 py-2">
            <Wordmark />
          </div>
        </div>
        <div className="relative max-w-md">
          <div className="text-[13px] uppercase tracking-[0.14em] text-brand-300 font-medium">Books · Funding · CFO</div>
          <h1 className="mt-4 text-[38px] leading-[1.12] font-semibold tracking-[-0.02em]">Know your numbers. Find funding. Make better decisions.</h1>
          <p className="mt-5 text-[15px] text-white/70 leading-relaxed">Fabrik connects to your accounting data, uses AI to understand your finances, processes financial documents, identifies potential funding and helps you decide what&apos;s next.</p>
          <ul className="mt-8 space-y-3 text-[14px] text-white/85">
            {["Books kept current by AI — you only answer real questions", "13-week cash forecast and what-if scenarios", "USDA, FSA and state programs matched to your farm", "Ask Fabrik anything about your finances"].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 size-5 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <Check className="size-3.5 text-brand-300" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-[12px] text-white/50">QuickBooks Online remains your system of record. Demo data is synthetic.</div>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-8">
            <Wordmark />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
