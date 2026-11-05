import { redirect } from "next/navigation";
import { requireAccess } from "@/lib/server/access";
import { AppHeader } from "@/components/app-header";
import { UserManagementPage } from "@/components/user-management-page";

export const dynamic = "force-dynamic";

export default async function UserAdministrationPage() {
  try { await requireAccess("admin"); } catch { redirect("/"); }
  return <div className="app-shell"><AppHeader active="admin" /><main className="workspace management-workspace">
    <div className="breadcrumb"><a href="/">Início</a><span aria-hidden="true">/</span><span>Administração</span></div>
    <section className="page-heading"><div><p className="eyebrow">ADMINISTRAÇÃO · ACESSOS</p><h1>Usuários e permissões</h1><p>Gerencie as funções e o acesso das contas existentes sem visualizar ou alterar senhas.</p></div></section>
    <UserManagementPage />
  </main></div>;
}
