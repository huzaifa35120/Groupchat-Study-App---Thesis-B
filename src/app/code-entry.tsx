"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui";

export function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (clean) router.push(`/join/${clean}`);
      }}
    >
      <Input
        aria-label="Group code"
        placeholder="Group code, e.g. K7QF2M"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="font-mono uppercase tracking-wider"
        maxLength={12}
      />
      <Button type="submit" disabled={!code.trim()}>
        Continue
      </Button>
    </form>
  );
}
