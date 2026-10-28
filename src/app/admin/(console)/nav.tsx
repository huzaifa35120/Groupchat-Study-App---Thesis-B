"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";

const LINKS = [
  { href: "/admin", label: "Sessions" },
  { href: "/admin/runs", label: "AI runs" },
  { href: "/admin/results", label: "Results" },
  { href: "/admin/data", label: "Data & ethics" },
];

export function ConsoleNav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
        <Link href="/admin" className="text-sm font-semibold text-stone-900">Group Chat Study</Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {LINKS.map((l) => {
            const active = l.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/groups") || pathname.startsWith("/admin/sessions") : pathname.startsWith(l.href);
            return (
              <Link key={l.href} href={l.href} className={cx("rounded-md px-3 py-1.5 text-sm whitespace-nowrap", active ? "bg-stone-100 font-medium text-stone-900" : "text-stone-600 hover:text-stone-900")}>
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden text-xs text-stone-500 sm:block">{email}</div>
        <button
          className="text-sm text-stone-600 hover:text-stone-900"
          onClick={async () => {
            await supabaseBrowser()?.auth.signOut();
            router.replace("/admin/login");
            router.refresh();
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
