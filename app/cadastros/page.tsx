import { AppHeader } from "@/components/app-header";
import { RecordManagement } from "@/components/record-management";

export default function RegistrationPage() {
  return (
    <div className="app-shell">
      <AppHeader active="register" />
      <main className="workspace module-workspace">
        <div className="breadcrumb" aria-label="Localização"><span>Início</span><span aria-hidden="true">/</span><span aria-current="page">Cadastros</span></div>
        <section className="module-page-heading">
          <p className="eyebrow">GESTÃO DE DADOS</p>
          <h1>Cadastros</h1>
          <p>Adicione registros à planilha comercial com validação e histórico de versão.</p>
        </section>
        <RecordManagement mode="create" />
      </main>
    </div>
  );
}
