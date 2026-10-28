import { redirect } from "next/navigation";
import { getResearcher } from "@/lib/auth";
import { isConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/admin";
import { ConsoleNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: LayoutProps<"/admin">) {
  if (!isConfigured()) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-sm text-stone-700">
        <h1 className="text-xl font-semibold">Setup needed</h1>
        <p className="mt-2">Supabase environment variables are missing. See the README for the setup steps.</p>
      </main>
    );
  }
  const researcher = await getResearcher();
  if (!researcher) redirect("/admin/login");
  // Make sure the researcher is in the table the row-level-security policies check.
  await db().from("researchers").upsert({ user_id: researcher.id, email: researcher.email }, { onConflict: "user_id", ignoreDuplicates: true });

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <ConsoleNav email={researcher.email} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8">{children}</main>
    </div>
  );
}
