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
        <h2>Não foi possível carregar os relatórios</h2>
        <p>{message}</p>
      </div>
    </section>
  );
}

function exportCsv(rows: Array<{ label: string; count: number; completedCount: number; revenue: number; cost: number }>) {
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const content = [
    ["Grupo", "Registros", "Vendas contabilizadas", "Faturamento (R$)", "Custo (R$)", "Resultado (R$)"],
    ...rows.map((row) => [row.label, row.count, row.completedCount, row.revenue.toFixed(2), row.cost.toFixed(2), (row.revenue - row.cost).toFixed(2)]),
  ].map((line) => line.map(quote).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "relatorio-certificados.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const { data, loading, error, refresh } = useWorkbookData(status === "authenticated");
  const [dimension, setDimension] = useState<ReportDimension>("period");
  const [search, setSearch] = useState("");
  const summary = useMemo(
    () => (data ? summarizeWorkbook(data, dimension) : null),
    [data, dimension],
  );
  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return (summary?.groups ?? []).filter((group) => !query || group.label.toLocaleLowerCase("pt-BR").includes(query));
  }, [summary, search]);
  const dimensionLabels: Record<ReportDimension, string> = {
    period: "Período",
    model: "Modelo do certificado",
    status: "Status / observação",
  };

  return (
    <div className="app-shell">
      <AppHeader active="reports" />
      <main className="workspace module-workspace" style={{ maxWidth: 1500 }}>
        <div className="breadcrumb" aria-label="Localização">
          <Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Relatórios</span>
        </div>

        <section className="module-page-heading" style={{ marginBottom: 24 }}>
          <p className="eyebrow">VISÃO FINANCEIRA</p>
          <h1>Relatórios</h1>
          <p>Acompanhe vendas, custos e resultado com base nos registros válidos da planilha.</p>
        </section>

        {status === "loading" || loading ? (
          <section className="state-panel" aria-busy="true"><span className="loading-spinner" /><div className="state-copy"><h2>Conferindo os dados da planilha…</h2><p>Os indicadores serão calculados após o carregamento.</p></div></section>
        ) : !session?.user ? (
          <div><ReportError message={error ?? "Entre com sua conta para acessar os dados."} /><Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link></div>
        ) : error || !summary ? (
          <div><ReportError message={error ?? "Não foi possível calcular os indicadores."} /><button className="button button--secondary button--small" onClick={() => void refresh()} type="button">Tentar novamente</button></div>
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>Resumo do negócio</h2>
                <p style={{ margin: "5px 0 0", color: "var(--muted, #64748b)", fontSize: 13 }}>O financeiro considera vendas concluídas. Oportunidades perdidas, agendadas, ofertas e status ambíguos não entram nos totais.</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button button--secondary button--small" type="button" onClick={() => void refresh()} disabled={loading}><Icon name="refresh" /> Atualizar dados</button>
                <button className="button button--primary button--small" type="button" onClick={() => exportCsv(filteredGroups)} disabled={!filteredGroups.length}>Exportar CSV</button>
              </div>
            </section>

            <section aria-label="Indicadores financeiros" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 }}>
              <article style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 14, padding: 20, boxShadow: "0 4px 14px rgba(15,23,42,.04)" }}>
                <span style={{ color: "#52647a", fontSize: 13 }}>Registros de clientes</span>
                <strong style={{ display: "block", marginTop: 10, fontSize: 30, letterSpacing: "-.04em", color: "#10233f" }}>{numbers.format(summary.count)}</strong>
                <small style={{ color: "#64748b" }}>{numbers.format(summary.completedCount)} contabilizados no financeiro</small>
              </article>
              <article style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 14, padding: 20, boxShadow: "0 4px 14px rgba(15,23,42,.04)" }}>
                <span style={{ color: "#52647a", fontSize: 13 }}>Faturamento informado</span>
                <strong style={{ display: "block", marginTop: 10, fontSize: 28, letterSpacing: "-.04em", color: "#087443" }}>{currency.format(summary.revenue)}</strong>
                <small style={{ color: "#64748b" }}>Soma dos valores preenchidos</small>
              </article>
              <article style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 14, padding: 20, boxShadow: "0 4px 14px rgba(15,23,42,.04)" }}>
                <span style={{ color: "#52647a", fontSize: 13 }}>Custo informado</span>
                <strong style={{ display: "block", marginTop: 10, fontSize: 28, letterSpacing: "-.04em", color: "#b45309" }}>{currency.format(summary.cost)}</strong>
                <small style={{ color: "#64748b" }}>Soma dos custos preenchidos</small>
              </article>
              <article style={{ background: "#10233f", border: "1px solid #10233f", borderRadius: 14, padding: 20, boxShadow: "0 4px 14px rgba(15,23,42,.08)" }}>
                <span style={{ color: "#c8d6e8", fontSize: 13 }}>Resultado estimado</span>
                <strong style={{ display: "block", marginTop: 10, fontSize: 28, letterSpacing: "-.04em", color: summary.profit >= 0 ? "#86efac" : "#fca5a5" }}>{currency.format(summary.profit)}</strong>
                <small style={{ color: "#c8d6e8" }}>Faturamento menos custo informado</small>
              </article>
            </section>

            <section style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 16, overflow: "hidden", boxShadow: "0 5px 20px rgba(15,23,42,.04)" }}>
              <div style={{ padding: "22px 24px", display: "flex", alignItems: "end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", borderBottom: "1px solid #e7edf4" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: "#10233f" }}>Detalhamento</h2>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>Agrupe e filtre os resultados. Os totais abaixo acompanham o filtro de pesquisa.</p>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
                  <label style={{ display: "grid", gap: 6, minWidth: 190, fontSize: 12, color: "#52647a", fontWeight: 650 }}>
                    Agrupar por
                    <select value={dimension} onChange={(event) => { setDimension(event.target.value as ReportDimension); setSearch(""); }} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", background: "#fff", color: "#10233f" }}>
                      <option value="period">Ano e mês</option><option value="model">Modelo</option><option value="status">Status / observação</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6, minWidth: 220, fontSize: 12, color: "#52647a", fontWeight: 650 }}>
                    Filtrar grupos
                    <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite para pesquisar…" style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", color: "#10233f" }} />
                  </label>
                </div>
              </div>

              <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, background: "#f7f9fc", borderBottom: "1px solid #e7edf4", color: "#52647a", fontSize: 12 }}>
                <span><strong style={{ color: "#10233f" }}>{numbers.format(filteredGroups.length)}</strong> grupos exibidos</span>
                <span><strong style={{ color: "#10233f" }}>{numbers.format(summary.excludedCount)}</strong> excluídos por status · <strong style={{ color: "#10233f" }}>{numbers.format(summary.reviewCount)}</strong> aguardando revisão · <strong style={{ color: "#10233f" }}>{numbers.format(summary.rowsIgnored)}</strong> totalizadores/vazios ignorados</span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="records-table report-table" style={{ width: "100%", minWidth: 720 }}>
                  <thead><tr><th>{dimensionLabels[dimension]}</th><th className="numeric-cell">Registros</th><th className="numeric-cell">Concluídos</th><th className="numeric-cell">Faturamento</th><th className="numeric-cell">Custo</th><th className="numeric-cell">Resultado</th></tr></thead>
                  <tbody>
                    {filteredGroups.map((group) => (
                      <tr key={group.label}>
                        <td style={{ fontWeight: 650, color: "#10233f" }}>{group.label}</td>
                        <td className="numeric-cell">{numbers.format(group.count)}</td>
                        <td className="numeric-cell">{numbers.format(group.completedCount)}</td>
                        <td className="numeric-cell">{currency.format(group.revenue)}</td>
                        <td className="numeric-cell">{currency.format(group.cost)}</td>
                        <td className="numeric-cell" style={{ fontWeight: 650, color: group.revenue - group.cost >= 0 ? "#087443" : "#b91c1c" }}>{currency.format(group.revenue - group.cost)}</td>
                      </tr>
                    ))}
                    {!filteredGroups.length && <tr><td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#64748b" }}>Nenhum grupo corresponde à pesquisa.</td></tr>}
                  </tbody>
                  {filteredGroups.length > 0 && <tfoot><tr style={{ background: "#f7f9fc", fontWeight: 750 }}><td>Total dos grupos exibidos</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((total, group) => total + group.count, 0))}</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((total, group) => total + group.completedCount, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((total, group) => total + group.revenue, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((total, group) => total + group.cost, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((total, group) => total + group.revenue - group.cost, 0))}</td></tr></tfoot>}
                </table>
              </div>
              <div style={{ padding: "14px 24px", borderTop: "1px solid #e7edf4", color: "#64748b", fontSize: 12, lineHeight: 1.6 }}>
                Atenção: resultado estimado é uma conta simples de faturamento menos custo preenchido; não representa lucro contábil. Campos vazios não são presumidos como valores reais. Confira os dados de origem se algum total não bater com a planilha.
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
