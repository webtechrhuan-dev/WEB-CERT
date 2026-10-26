import { AppHeader } from "@/components/app-header";
import { RecordManagement } from "@/components/record-management";

export default function WorkbookEditPage() {
  return (
    <div className="app-shell">
      <AppHeader active="edit" />
      <main className="workspace module-workspace">
        <div className="breadcrumb" aria-label="Localização"><span>Início</span><span aria-hidden="true">/</span><span aria-current="page">Editar planilha</span></div>
        <section className="module-page-heading">
          <p className="eyebrow">GESTÃO DE DADOS</p>
          <h1>Edição da planilha</h1>
          <p>Localize um registro, altere os campos necessários e publique uma nova versão.</p>
        </section>
        <RecordManagement mode="edit" />
      </main>
    </div>
  );
}
