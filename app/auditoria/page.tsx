import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppHeader } from "@/components/app-header";
import { AuditLogPage } from "@/components/audit-log-page";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await auth();
  if (!session?.user?.login) redirect("/login");
  if (!session.user.isAdmin) redirect("/");

  return (
    <div className="app-shell">
      <AppHeader active="audit" />
      <main className="workspace management-workspace">
        <div className="breadcrumb"><a href="/">Início</a><span aria-hidden="true">/</span><span aria-current="page">Auditoria</span></div>
        <section className="page-heading">
          <div><p className="eyebrow">ADMINISTRAÇÃO · SEGURANÇA</p><h1>Auditoria do sistema</h1><p>Acompanhe quem realizou operações e quando elas ocorreram.</p></div>
        </section>
        <AuditLogPage />
      </main>
    </div>
  );
}
