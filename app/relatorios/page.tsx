import ReportsPage from "@/components/reports-page";
import { requirePageSession } from "@/lib/server/require-page-session";

export default async function ReportsRoute() {\n  await requirePageSession();
  return <ReportsPage />;
}