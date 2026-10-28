import Link from "next/link";
import { requirePageSession } from "@/lib/server/require-page-session";
import { AppHeader } from "@/components/app-header";
import { Icon, type IconName } from "@/components/icon";

type ModuleCardProps = {
  title: string;
  description: string;
  icon: IconName;
  status: "available" | "planned";
  href?: string;
};

function ModuleCard({
  title,
  description,
  icon,
  status,
  href,
}: ModuleCardProps) {
  const content = (
    <>
      <span className={`module-icon${status === "planned" ? " module-icon--muted" : ""}`}>
        <Icon name={icon} />
      </span>
      <span className="module-card-copy">
        <span className="module-card-topline">
          <strong>{title}</strong>
          <span
            className={`module-status${status === "available" ? " module-status--available" : ""}`}
          >
            <span className="module-status-dot" />
            {status === "available" ? "Implementado" : "Planejado"}
          </span>
        </span>
        <span className="module-card-description">{description}</span>
      </span>
      {status === "available" ? (
        <span className="module-card-action" aria-hidden="true">
          <Icon name="chevronRight" />
        </span>
      ) : (
        <span className="module-card-lock">
          <Icon name="lock" />
          Em breve
        </span>
      )}
    </>
  );

  return href ? (
    <Link className="module-card module-card--available" href={href}>
      {content}
    </Link>
  ) : (
    <article aria-disabled="true" className="module-card module-card--planned">
      {content}
    </article>
  );
}

export default async function Home() {
  await requirePageSession();
  return (
    <div className="app-shell">
      <AppHeader active="home" />
      <main className="workspace dashboard-workspace">
        <div className="breadcrumb" aria-label="Localização">
          <span aria-current="page">Início</span>
        </div>

        <section className="dashboard-hero" aria-labelledby="dashboard-title">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">WEB TECH · OPERAÇÃO COMERCIAL</p>
            <h1 id="dashboard-title">Certificados Manager</h1>
            <p>
              Acesse os módulos de consulta e gestão dos dados de certificados
              em um único lugar.
            </p>
          </div>
          <div className="dashboard-hero-mark" aria-hidden="true">
            <span className="hero-mark-grid">
              <Icon name="grid" />
            </span>
          </div>
        </section>

        <section className="modules-section" aria-labelledby="modules-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NAVEGAÇÃO</p>
              <h2 id="modules-title">Menu principal</h2>
              <p>Escolha uma área para continuar.</p>
            </div>
            <span className="modules-section-label">MÓDULOS DO SISTEMA</span>
          </div>

          <div className="module-grid">
            <ModuleCard
              description="Consulte e pesquise todos os registros carregados do Excel."
              href="/registros"
              icon="spreadsheet"
              status="available"
              title="Consulta de registros"
            />
            <ModuleCard
              description="Inclua um registro com validação de tipos e publicação versionada."
              href="/cadastros"
              icon="users"
              status="available"
              title="Cadastros"
            />
            <ModuleCard
              description="Localize uma linha, altere campos e detecte conflitos antes de publicar."
              href="/editar"
              icon="document"
              status="available"
              title="Edição da planilha"
            />
            <ModuleCard
              description="Agrupe registros por período, modelo ou status e consulte os totais financeiros."
              href="/relatorios"
              icon="chart"
              status="available"
              title="Relatórios"
            />
          </div>
        </section>

        <aside className="dashboard-note" aria-label="Estado da integração">
          <span className="dashboard-note-icon">
            <Icon name="lock" />
          </span>
          <p>
            <strong>Modo de consulta</strong>
            <span>
              Consulta e relatórios usam os dados reais. Cadastro e edição exigem
              uma conta autorizada e integração GitHub configurada no servidor.
            </span>
          </p>
        </aside>
      </main>
    </div>
  );
}
