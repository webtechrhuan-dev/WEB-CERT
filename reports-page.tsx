"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/app-header";
import { Icon } from "@/components/icon";
import { useWorkbookData } from "@/lib/client/use-workbook-data";
import { summarizeWorkbook, type ReportDimension } from "@/lib/reporting";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const numbers = new Intl.NumberFormat("pt-BR");

function ReportError({ message }: { message: string }) {
  return (
    <section className="state-panel state-panel--error">
      <span className="state-icon state-icon--error"><Icon name="alert" /></span>
      <div className="state-copy">
        <h2>Relatório indisponível</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const { data, loading, error, refresh } = useWorkbookData(
    status === "authenticated",
  );
  const [dimension, setDimension] = useState<ReportDimension>("period");
  const summary = useMemo(
    () => (data ? summarizeWorkbook(data, dimension) : null),
    [data, dimension],
  );
  const dimensionLabels: Record<ReportDimension, string> = {
    period: "Ano e mês",
    model: "Modelo",
    status: "Status / observação",
  };

  return (
    <div className="app-shell">
      <AppHeader active="reports" />
      <main className="workspace module-workspace">
        <div className="breadcrumb" aria-label="Localização">
          <Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Relatórios</span>
        </div>
        <section className="module-page-heading">
          <p className="eyebrow">ANÁLISE DOS REGISTROS</p>
          <h1>Relatórios</h1>
          <p>Resumo calculado sob demanda a partir da versão atual da planilha.</p>
        </section>
        {status === "loading" || loading ? (
          <section className="state-panel" aria-busy="true"><span className="loading-spinner" /><div className="state-copy"><h2>Carregando relatório</h2></div></section>
        ) : !session?.user ? (
          <div>
            <ReportError message={error ?? "Entre com sua conta corporativa para acessar os dados."} />
            <Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link>
          </div>
        ) : error || !summary ? (
          <div>
            <ReportError message={error ?? "Não foi possível calcular o relatório."} />
            <button className="button button--secondary button--small" onClick={() => void refresh()} type="button">Tentar novamente</button>
          </div>
        ) : (
          <div className="reports-content">
            <section className="report-summary-grid" aria-label="Resumo financeiro e quantidade">
              <article className="report-summary-card">
                <span>Registros considerados</span><strong>{numbers.format(summary.count)}</strong>
                <small>Quantidade real da planilha carregada</small>
              </article>
              <article className="report-summary-card">
                <span>Soma informada de faturamento</span><strong>{currency.format(summary.revenue)}</strong>
                <small>Soma dos valores monetários preenchidos</small>
              </article>
              <article className="report-summary-card">
                <span>Soma informada de custo</span><strong>{currency.format(summary.cost)}</strong>
                <small>Soma dos valores monetários preenchidos</small>
              </article>
            </section>

            <section className="content-panel report-panel">
              <div className="panel-heading">
                <div><h2>Distribuição dos registros</h2><p>Valores agregados; nenhuma coluna foi removida ou alterada na origem.</p></div>
                <label className="report-filter">
                  <span>Agrupar por</span>
                  <select value={dimension} onChange={(event) => setDimension(event.target.value as ReportDimension)}>
                    <option value="period">Ano e mês</option>
                    <option value="model">Modelo</option>
                    <option value="status">Status / observação</option>
                  </select>
                </label>
              </div>
              <div className="table-scroll report-table-scroll">
                <table className="records-table report-table">
                  <thead><tr><th>{dimensionLabels[dimension]}</th><th className="numeric-cell">Registros</th><th className="numeric-cell">Faturamento</th><th className="numeric-cell">Custo</th></tr></thead>
                  <tbody>
                    {summary.groups.map((group) => (
                      <tr key={group.label}>
                        <td>{group.label}</td>
                        <td className="numeric-cell">{numbers.format(group.count)}</td>
                        <td className="numeric-cell">{currency.format(group.revenue)}</td>
                        <td className="numeric-cell">{currency.format(group.cost)}</td>
                      </tr>
                    ))}
                    {summary.groups.length === 0 && <tr><td colSpan={4}>A planilha ainda não possui registros para resumir.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="report-footnote">
                Campos sem valor não são inferidos. Os totais somam somente valores numéricos preenchidos.
              </p>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
