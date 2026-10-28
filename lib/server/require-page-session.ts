import "server-only";

import { auth } from "@/auth";
import { redirect } from "next/navigation";

export async function requirePageSession(): Promise<void> {
  const session = await auth();
  if (!session?.user?.login) redirect("/login");
}
