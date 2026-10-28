import Link from "next/link";
import { isConfigured } from "@/lib/env";
import { STUDY_TITLE } from "@/lib/study-info";
import { CodeEntry } from "./code-entry";

export const dynamic = "force-dynamic";

export default function Home() {
  const configured = isConfigured();
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
      <p className="text-sm font-medium text-accent">Macquarie University · Thesis study</p>
      <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-stone-900">{STUDY_TITLE}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-stone-600">
        Three short group chats with two other people on a light, everyday topic. If you&apos;ve been invited, open the link from your
        email or enter your group code below.
      </p>
      {!configured && (
        <div className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          The study database isn&apos;t connected yet. The researcher needs to finish setup.
        </div>
      )}
      <div className="mt-8">
        <CodeEntry />
      </div>
      <p className="mt-16 text-xs text-stone-400">
        <Link href="/admin" className="hover:text-stone-600">
          Researcher sign-in
        </Link>
      </p>
    </main>
  );
}
