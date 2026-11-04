"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icon";

export function AdminNavLink({ active }: { active: boolean }) {
  const { data: session, status } = useSession();
  if (status !== "authenticated" || session?.user?.isAdmin !== true) return null;

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`primary-nav-link${active ? " is-active" : ""}`}
      href="/auditoria"
    >
      <Icon name="shield" />
      Auditoria
    </Link>
  );
}
