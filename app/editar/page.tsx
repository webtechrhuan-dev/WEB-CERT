import { AppHeader } from "@/components/app-header";
import { requirePageSession } from "@/lib/server/require-page-session";
import { RecordManagement } from "@/components/record-management";
import { HelpFaq } from "@/components/help-faq";

export default async function WorkbookEditPage() {
  await requirePageSession();
  return (
    <div className="app-shell">
      <AppHeader active="edit" />
      <main className="workspace module-workspace">
        <div className="breadcrumb" aria-label="Localização"><span>Início</span><span aria-hidden="true">/</span><span aria-current="page">Gestão de vendas</span></div>
        <section className="module-page-heading">
          <p className="eyebrow">GESTÃO DE DADOS</p>
          <h1>Gestão de vendas</h1>
          <p>Consulte, pesquise e edite os dados da venda, incluindo o status, em um único lugar.</p>
        </section>
        <RecordManagement mode="edit" />
        <HelpFaq topic="vendas" />
      </main>
    </div>
  );
}
