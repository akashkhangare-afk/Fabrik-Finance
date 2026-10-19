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
        <h1 className="relative max-w-md text-[38px] leading-[1.12] font-semibold tracking-[-0.02em]">Know your numbers. Find funding. Make better decisions.</h1>
        <div />
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
