import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { UserNav } from "@/components/user-nav";
import { isDemoMode } from "@/lib/config";
import { getMessages } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-serif-display", subsets: ["latin"] });

const m = getMessages();

export const metadata: Metadata = {
  title: { default: `${m.app.name} — ${m.app.fullName}`, template: `%s · ${m.app.name}` },
  description: m.app.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const demo = isDemoMode();
  return (
    <html lang={m.locale} className={`${inter.variable} ${serif.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col bg-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow"
        >
          {m.nav.skipToContent}
        </a>
        {demo && (
          <div className="bg-accent-50 px-4 py-2 text-center text-sm text-accent-700" role="note">
            <strong className="font-semibold">Demo</strong> · {m.demo.banner}
          </div>
        )}
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2.5" aria-label={`${m.app.fullName} home`}>
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-brand-800 font-serif text-lg font-bold text-white">
                U
              </span>
              <span className="leading-tight">
                <span className="block font-serif text-lg font-semibold text-brand-900">{m.app.name}</span>
                <span className="hidden text-xs text-muted sm:block">{m.app.fullName}</span>
              </span>
            </Link>
            <Suspense fallback={<div className="h-10 w-48 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />}>
              <UserNav />
            </Suspense>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-line bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
            <p>
              {m.app.fullName} · {m.app.tagline}
            </p>
            <p>Contact details are never shown to other members. UIS makes every introduction.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
