"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/app-header";
import { Icon } from "@/components/icon";
import { useWorkbookData } from "@/lib/client/use-workbook-data";
import { getWorkbookReportRows, summarizeWorkbook, type ReportDimension, type DetailedReportRow } from "@/lib/reporting";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numbers = new Intl.NumberFormat("pt-BR");
type Granularity = "month" | "week" | "year";
type Group = { label: string; count: number; completedCount: number; revenue: number; cost: number; profit: number };
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null && "parsed" in value) {
    const parsed = (value as { parsed?: unknown }).parsed;
    if (typeof parsed === "string" && parsed) return parsed;
  }
  if (typeof value === "object" && value !== null && "raw" in value) return String((value as { raw: unknown }).raw ?? "");
  return String(value);
}
function isoDate(value: string): string {
  const raw = value.trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) return raw;
  // Aceita datas importadas de planilhas em DD/MM/AAAA, DD-MM-AAAA ou DD.MM.AAAA.
  match = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(raw);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return "";
}
function expiryFromIssueDate(value: string): string {
  const normalized = isoDate(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  const expiryYear = year + 1;
  const lastDay = new Date(Date.UTC(expiryYear, month, 0)).getUTCDate();
  return [expiryYear, String(month).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}
function displayDate(value: string): string {
  const normalized = isoDate(value);
  if (!normalized) return value || "—";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
}
function exportRenewals(rows: { client: string; contact: string; model: string; expiry: string; status: string }[], month: string, year: string) {
  const quote = (value: string) => `"${String(value).replace(/"/g, '""')}"`;
  const content = [["Cliente", "Contato", "Modelo do certificado", "Data de vencimento", "Status / observação"], ...rows.map((row) => [row.client, row.contact, row.model, displayDate(row.expiry), row.status])]
    .map((line) => line.map(quote).join(";")).join("\\r\\n");
  const url = URL.createObjectURL(new Blob(["\\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prospeccao-renovacoes-${month}-${year}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
function textValue(value: string) {
  return value && value !== "Sem preenchimento" ? value : "Não informado";
}
function parsedDate(row: DetailedReportRow): Date | null {
  const raw = row.date.trim();
  let match = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(raw);
  if (match) {
    const d = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return raw && !Number.isNaN(parsed.getTime()) ? parsed : null;
}
function periodLabel(row: DetailedReportRow, granularity: Granularity): string {
  const date = parsedDate(row);
  // Mês/ano seguem a competência da pasta anual; a data pode ser de renovação antiga.
  if (granularity === "year") return textValue(row.year) !== "Não informado" ? row.year : date ? String(date.getFullYear()) : "Ano não informado";
  if (granularity === "month") {
    if (textValue(row.month) !== "Não informado" && textValue(row.year) !== "Não informado") return `${row.month} ${row.year}`;
    return date ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}` : "Período não informado";
  }
  if (date) {
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("pt-BR");
    return `${fmt(monday)} – ${fmt(sunday)}`;
  }
  return `Semana sem data · ${textValue(row.month)} ${textValue(row.year)}`;
}
function groupLabel(row: DetailedReportRow, dimension: ReportDimension, granularity: Granularity) {
  if (dimension === "period") return periodLabel(row, granularity);
  if (dimension === "model") return textValue(row.model);
  return textValue(row.status);
}
function exportCsv(rows: Group[]) {
  const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const content = [
    ["Grupo", "Registros", "Vendas concluídas", "Faturamento bruto (R$)", "Custos (R$)", "Valor líquido (R$)"],
    ...rows.map((row) => [row.label, row.count, row.completedCount, row.revenue.toFixed(2), row.cost.toFixed(2), row.profit.toFixed(2)]),
  ].map((line) => line.map(quote).join(";")).join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "relatorio-certificados.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
function ReportError({ message }: { message: string }) {
  return <section className="state-panel state-panel--error"><span className="state-icon state-icon--error"><Icon name="alert" /></span><div className="state-copy"><h2>Não foi possível carregar os relatórios</h2><p>{message}</p></div></section>;
}
function BarChart({ rows }: { rows: Group[] }) {
  const visible = rows.slice(-12);
  const max = Math.max(1, ...visible.map((row) => Math.max(row.revenue, row.cost, Math.abs(row.profit))));
  if (!visible.length) return <p style={{ color: "#64748b" }}>Sem dados suficientes para gerar o gráfico.</p>;
  return <div style={{ overflowX: "auto" }}><svg role="img" aria-label="Gráfico de faturamento e custos por período" viewBox={`0 0 ${Math.max(560, visible.length * 86)} 250`} style={{ width: "100%", minWidth: 560, height: 250 }}>
    {[0, 1, 2, 3].map((line) => <g key={line}><line x1="42" x2={Math.max(520, visible.length * 86)} y1={25 + line * 35} y2={25 + line * 35} stroke="#e6edf5" /><text x="36" y={29 + line * 35} textAnchor="end" fontSize="9" fill="#64748b">{currency.format(max * (3 - line) / 3).replace(",00", "")}</text></g>)}
    {visible.map((row, i) => {
      const x = 54 + i * 86;
      const revHeight = row.revenue / max * 95;
      const costHeight = row.cost / max * 95;
      const profitHeight = Math.abs(row.profit) / max * 95;
      const moneyLabel = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
      const baseline = 130;
      const revY = Math.max(12, baseline - revHeight - 5);
      const costY = Math.max(12, baseline - costHeight - 5);
      const profitY = row.profit >= 0 ? Math.max(12, baseline - profitHeight - 5) : Math.min(239, baseline + profitHeight + 11);
      const profitBarY = row.profit >= 0 ? baseline - profitHeight : baseline;
      return <g key={row.label}><rect x={x} y={baseline - revHeight} width="15" height={revHeight} rx="3" fill="#087f8c"><title>{row.label}: faturamento bruto {currency.format(row.revenue)}</title></rect><rect x={x + 18} y={baseline - costHeight} width="15" height={costHeight} rx="3" fill="#e58b2a"><title>{row.label}: custos {currency.format(row.cost)}</title></rect><rect x={x + 36} y={profitBarY} width="15" height={profitHeight} rx="3" fill={row.profit >= 0 ? "#2563eb" : "#dc2626"}><title>{row.label}: valor líquido {currency.format(row.profit)}</title></rect><text x={x + 7.5} y={revY} textAnchor="middle" fontSize="7" fontWeight="700" fill="#087f8c"><title>Faturamento bruto: {currency.format(row.revenue)}</title>{moneyLabel(row.revenue)}</text><text x={x + 25.5} y={costY} textAnchor="middle" fontSize="7" fontWeight="700" fill="#b45309"><title>Custos: {currency.format(row.cost)}</title>{moneyLabel(row.cost)}</text><text x={x + 43.5} y={profitY} textAnchor="middle" fontSize="7" fontWeight="700" fill={row.profit >= 0 ? "#2563eb" : "#dc2626"}><title>Valor líquido: {currency.format(row.profit)}</title>{moneyLabel(row.profit)}</text><text x={x + 27} y="207" textAnchor="middle" fontSize="9" fill="#52647a">{row.label.length > 11 ? row.label.slice(0, 10) + "…" : row.label}</text></g>;
    })}
  </svg><div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "#52647a" }}><span><i style={{ display: "inline-block", width: 10, height: 10, background: "#087f8c", marginRight: 6, borderRadius: 2 }} />Faturamento bruto</span><span><i style={{ display: "inline-block", width: 10, height: 10, background: "#e58b2a", marginRight: 6, borderRadius: 2 }} />Custos</span><span><i style={{ display: "inline-block", width: 10, height: 10, background: "#2563eb", marginRight: 6, borderRadius: 2 }} />Valor líquido (vermelho quando negativo)</span></div></div>;
}
function DonutSummary({ rows }: { rows: DetailedReportRow[] }) {
  const counts = [
    { label: "Concluídas", value: rows.filter((row) => row.treatment === "Concluída").length, color: "#087f8c" },
    { label: "Não concluídas", value: rows.filter((row) => row.treatment === "Não concluída").length, color: "#e58b2a" },
    { label: "Revisar", value: rows.filter((row) => row.treatment === "Revisar").length, color: "#94a3b8" },
  ];
  const total = Math.max(1, counts.reduce((sum, item) => sum + item.value, 0));
  let offset = 0;
  const segments = counts.map((item) => {
    const length = item.value / total * 100;
    const segment = { ...item, length, offset };
    offset += length;
    return segment;
  });
  return <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}><svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Distribuição de situação dos registros"><circle cx="60" cy="60" r="42" fill="none" stroke="#edf2f7" strokeWidth="16" />{segments.map((item) => <circle key={item.label} cx="60" cy="60" r="42" fill="none" stroke={item.color} strokeWidth="16" strokeDasharray={`${item.length * 2.64} 264`} strokeDashoffset={-item.offset * 2.64} transform="rotate(-90 60 60)" />)}<text x="60" y="57" textAnchor="middle" fontSize="17" fontWeight="700" fill="#10233f">{rows.length}</text><text x="60" y="72" textAnchor="middle" fontSize="8" fill="#64748b">registros</text></svg><div style={{ display: "grid", gap: 9 }}>{counts.map((item) => <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 24, fontSize: 13 }}><span><i style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: item.color, marginRight: 7 }} />{item.label}</span><strong>{numbers.format(item.value)} ({(item.value / Math.max(1, rows.length) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)</strong></div>)}</div></div>;
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const { data, loading, error, refresh } = useWorkbookData(status === "authenticated");
  const [dimension, setDimension] = useState<ReportDimension>("period");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chartDateFrom, setChartDateFrom] = useState("");
  const [chartDateTo, setChartDateTo] = useState("");
  const [chartModel, setChartModel] = useState("all");
  const [chartTreatment, setChartTreatment] = useState("all");
  const [activeChart, setActiveChart] = useState<"financial" | "status" | null>(null);
  const currentMonthYear = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const [renewalMonth, setRenewalMonth] = useState(currentMonthYear.find((part) => part.type === "month")?.value ?? String(new Date().getMonth() + 1).padStart(2, "0"));
  const [renewalYear, setRenewalYear] = useState(currentMonthYear.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear()));
  const renewalRows = useMemo(() => {
    if (!data) return [];
    const clientIndex = data.headers.indexOf("Cliente");
    const contactIndex = data.headers.indexOf("Contato");
    const modelIndex = data.headers.indexOf("Modelo");
    const expiryIndex = data.headers.indexOf("Data de vencimento");
    const issueIndex = data.headers.indexOf("Data de emissão/renovação");
    const statusIndex = data.headers.indexOf("Status / Observação");
    if (clientIndex < 0 || (expiryIndex < 0 && issueIndex < 0)) return [];

    // Filtra primeiro o mês/ano solicitado; deduplica somente dentro desse período.
    // Uma renovação futura não deve apagar o vencimento anterior do relatório.
    const byClientForPeriod = new Map<string, { client: string; contact: string; model: string; expiry: string; issue: string; status: string }>();
    data.records.forEach((record) => {
      const client = cellText(record.values[clientIndex]).trim();
      if (!client || /^(total|subtotal|lucro|faturamento total|custo total)$/i.test(client)) return;
      const issue = issueIndex >= 0 ? isoDate(cellText(record.values[issueIndex])) : "";
      const expiry = expiryFromIssueDate(issue) || (expiryIndex >= 0 ? isoDate(cellText(record.values[expiryIndex])) : "");
      if (!expiry || expiry.slice(5, 7) !== renewalMonth || expiry.slice(0, 4) !== renewalYear) return;
      const key = client.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");
      if (!key) return;
      const candidate = {
        client,
        contact: contactIndex >= 0 ? cellText(record.values[contactIndex]) : "",
        model: modelIndex >= 0 ? cellText(record.values[modelIndex]) : "",
        expiry,
        issue,
        status: statusIndex >= 0 ? cellText(record.values[statusIndex]) : "",
      };
      const current = byClientForPeriod.get(key);
      if (!current || candidate.issue > current.issue || (candidate.issue === current.issue && candidate.expiry > current.expiry)) {
        byClientForPeriod.set(key, candidate);
      }
    });
    return [...byClientForPeriod.values()]
      .sort((a, b) => a.expiry.localeCompare(b.expiry) || a.client.localeCompare(b.client, "pt-BR"));
  }, [data, renewalMonth, renewalYear]);
  const summary = useMemo(() => data ? summarizeWorkbook(data, dimension) : null, [data, dimension]);
  const rows = useMemo(() => data ? getWorkbookReportRows(data) : [], [data]);
  const modelOptions = useMemo(() => [...new Set(rows.map((row) => textValue(row.model)).filter((value) => value !== "Não informado"))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const date = isoDate(row.date);
    if (chartDateFrom && (!date || date < chartDateFrom)) return false;
    if (chartDateTo && (!date || date > chartDateTo)) return false;
    if (chartModel !== "all" && textValue(row.model) !== chartModel) return false;
    if (chartTreatment !== "all" && row.treatment !== chartTreatment) return false;
    return true;
  }), [rows, chartDateFrom, chartDateTo, chartModel, chartTreatment]);
  const filteredSummary = useMemo(() => {
    const completed = filteredRows.filter((row) => row.completed);
    return {
      count: filteredRows.length,
      completedCount: completed.length,
      excludedCount: filteredRows.filter((row) => row.treatment === "Não concluída").length,
      reviewCount: filteredRows.filter((row) => row.treatment === "Revisar").length,
      revenue: completed.reduce((sum, row) => sum + row.revenue, 0),
      cost: completed.reduce((sum, row) => sum + row.cost, 0),
      profit: completed.reduce((sum, row) => sum + row.profit, 0),
    };
  }, [filteredRows]);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    filteredRows.forEach((row) => {
      const label = groupLabel(row, dimension, granularity);
      const group = map.get(label) ?? { label, count: 0, completedCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.completed) { group.completedCount += 1; group.revenue += row.revenue; group.cost += row.cost; }
      if (row.completed) group.profit += row.profit;
      map.set(label, group);
    });
    return [...map.values()].sort((a, b) => {
      if (dimension === "period" && granularity === "year") return a.label.localeCompare(b.label, "pt-BR", { numeric: true });
      if (dimension === "period" && granularity === "month") {
        const parse = (label: string) => { const m = /^(.*?)\s+(\d{4})$/.exec(label); return m ? Number(m[2]) * 12 + MONTHS.indexOf(m[1].toLocaleLowerCase("pt-BR")) : Number.MAX_SAFE_INTEGER; };
        return parse(a.label) - parse(b.label);
      }
      if (dimension === "period" && granularity === "week") {
        const weekStart = (label: string) => {
          const match = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(label);
          return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])).getTime() : Number.MAX_SAFE_INTEGER;
        };
        return weekStart(a.label) - weekStart(b.label) || a.label.localeCompare(b.label, "pt-BR", { numeric: true });
      }
      return a.label.localeCompare(b.label, "pt-BR", { numeric: true });
    });
  }, [filteredRows, dimension, granularity]);
  const filteredGroups = useMemo(() => groups.filter((group) => !search.trim() || group.label.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))), [groups, search]);
  const selectedRows = useMemo(() => filteredRows.filter((row) => selectedLabel && groupLabel(row, dimension, granularity) === selectedLabel).filter((row) => statusFilter === "all" || row.treatment === statusFilter).filter((row) => !detailSearch || [row.client, row.contact, row.model, row.status, row.date].join(" ").toLocaleLowerCase("pt-BR").includes(detailSearch.toLocaleLowerCase("pt-BR"))), [filteredRows, selectedLabel, dimension, granularity, statusFilter, detailSearch]);
  const monthlyChart = useMemo(() => {
    const monthly = new Map<string, Group>();
    filteredRows.forEach((row) => {
      const label = periodLabel(row, "month");
      const group = monthly.get(label) ?? { label, count: 0, completedCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.completed) { group.completedCount += 1; group.revenue += row.revenue; group.cost += row.cost; }
      if (row.completed) group.profit += row.profit;
      monthly.set(label, group);
    });
    return [...monthly.values()].sort((a, b) => {
      const value = (label: string) => { const match = /^(.*?)\s+(\d{4})$/.exec(label); return match ? Number(match[2]) * 12 + MONTHS.indexOf(match[1].toLocaleLowerCase("pt-BR")) : Number.MAX_SAFE_INTEGER; };
      return value(a.label) - value(b.label);
    });
  }, [filteredRows]);
  const modelRanking = useMemo(() => {
    const map = new Map<string, number>();
    filteredRows.filter((row) => row.completed).forEach((row) => map.set(textValue(row.model), (map.get(textValue(row.model)) ?? 0) + row.revenue));
    return [...map.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [filteredRows]);
  const dimensionLabels: Record<ReportDimension, string> = { period: "Período", model: "Modelo do certificado", status: "Status / observação" };

  return <div className="app-shell">
    <AppHeader active="reports" />
    <main className="workspace module-workspace" style={{ maxWidth: 1500 }}>
      <div className="breadcrumb" aria-label="Localização"><Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Relatórios</span></div>
      <section className="module-page-heading" style={{ marginBottom: 24 }}><p className="eyebrow">INTELIGÊNCIA COMERCIAL</p><h1>Relatórios e análises</h1><p>Explore faturamento, custos, vendas, modelos e evolução por mês, semana ou ano.</p></section>
      {status === "loading" || loading ? <section className="state-panel" aria-busy="true"><span className="loading-spinner" /><div className="state-copy"><h2>Conferindo os dados da planilha…</h2><p>Os indicadores serão calculados após o carregamento.</p></div></section> : !session?.user ? <div><ReportError message={error ?? "Entre com sua conta para acessar os dados."} /><Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link></div> : error || !summary ? <div><ReportError message={error ?? "Não foi possível calcular os indicadores."} /><button className="button button--secondary button--small" onClick={() => void refresh()} type="button">Tentar novamente</button></div> : <div style={{ display: "grid", gap: 22 }}>
        <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}><div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>Resumo do negócio</h2><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Mês/ano seguem a competência das pastas anuais; semanas usam a data de emissão/renovação. Valores incompletos ficam em revisão.</p></div><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button button--secondary button--small" type="button" onClick={() => void refresh()} disabled={loading}><Icon name="refresh" /> Atualizar dados</button><button className="button button--primary button--small" type="button" onClick={() => exportCsv(filteredGroups)} disabled={!filteredGroups.length}>Exportar CSV</button></div></section>
        <section aria-labelledby="renewals-title" style={{ background: "#fff", border: "1px solid #b8dfe2", borderRadius: 16, overflow: "hidden", boxShadow: "0 5px 20px rgba(15,23,42,.04)" }}>
          <div style={{ padding: "22px 24px", display: "flex", alignItems: "end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", borderBottom: "1px solid #e7edf4" }}>
            <div><p className="eyebrow" style={{ margin: "0 0 6px" }}>PROSPECÇÃO COMERCIAL</p><h2 id="renewals-title" style={{ margin: 0, fontSize: 19, color: "#10233f" }}>Clientes com certificado vencendo no mês</h2><p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>Lista para entrar em contato e oferecer a renovação do certificado digital, ordenada pela data de vencimento.</p></div>
            <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap" }}>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#52647a", fontWeight: 650 }}>Mês<select value={renewalMonth} onChange={(e) => setRenewalMonth(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", background: "#fff", color: "#10233f" }}>{MONTHS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month.charAt(0).toLocaleUpperCase("pt-BR") + month.slice(1)}</option>)}</select></label>
              <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#52647a", fontWeight: 650 }}>Ano<select value={renewalYear} onChange={(e) => setRenewalYear(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", background: "#fff", color: "#10233f" }}>{Array.from({ length: 7 }, (_, index) => String(new Date().getFullYear() - 2 + index)).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <button className="button button--primary button--small" type="button" onClick={() => exportRenewals(renewalRows, renewalMonth, renewalYear)} disabled={!renewalRows.length}>Exportar lista CSV</button>
            </div>
          </div>
          <div style={{ padding: "12px 24px", background: "#f7f9fc", borderBottom: "1px solid #e7edf4", color: "#52647a", fontSize: 13 }}><strong style={{ color: "#10233f" }}>{numbers.format(renewalRows.length)}</strong> {renewalRows.length === 1 ? "cliente com vencimento" : "clientes com vencimento"} em {MONTHS[Number(renewalMonth) - 1]} de {renewalYear}.</div>
          <div style={{ overflowX: "auto" }}><table className="records-table report-table" style={{ width: "100%", minWidth: 760 }}><thead><tr><th>Cliente</th><th>Contato</th><th>Modelo do certificado</th><th>Data de vencimento</th><th>Status / observação</th></tr></thead><tbody>{renewalRows.map((row, index) => <tr key={`${row.client}-${row.expiry}-${index}`}><td style={{ fontWeight: 650, color: "#10233f" }}>{row.client}</td><td>{row.contact || "—"}</td><td>{row.model || "—"}</td><td style={{ whiteSpace: "nowrap", fontWeight: 750, color: "#b45309" }}>{displayDate(row.expiry)}</td><td>{row.status || "—"}</td></tr>)}{!renewalRows.length && <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nenhum cliente com data de vencimento registrada para este mês. Confira também se os registros possuem o campo “Data de vencimento” preenchido.</td></tr>}</tbody></table></div>
        </section>
        <section aria-label="Filtros dos gráficos e relatórios" style={{ background: "#f7f9fc", border: "1px solid #dce5ef", borderRadius: 16, padding: 20, display: "grid", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><h2 style={{ margin: 0, fontSize: 17 }}>Filtros de análise</h2><p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Aplicados aos gráficos, rankings e relatórios detalhados.</p></div>
            <span style={{ fontSize: 12, color: "#52647a" }}><strong style={{ color: "#10233f" }}>{numbers.format(filteredRows.length)}</strong> de {numbers.format(rows.length)} registros</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#52647a" }}>Data inicial<input type="date" value={chartDateFrom} max={chartDateTo || undefined} onChange={(e) => setChartDateFrom(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#10233f" }} /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#52647a" }}>Data final<input type="date" value={chartDateTo} min={chartDateFrom || undefined} onChange={(e) => setChartDateTo(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#10233f" }} /></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#52647a" }}>Modelo do certificado<select value={chartModel} onChange={(e) => setChartModel(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#10233f" }}><option value="all">Todos os modelos</option>{modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
            <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#52647a" }}>Situação financeira<select value={chartTreatment} onChange={(e) => setChartTreatment(e.target.value)} style={{ minHeight: 42, border: "1px solid #cbd5e5", borderRadius: 9, padding: "0 10px", background: "#fff", color: "#10233f" }}><option value="all">Todas as situações</option><option value="Concluída">Concluídas</option><option value="Não concluída">Não concluídas</option><option value="Revisar">A revisar</option></select></label>
          </div>
          <div><button className="button button--secondary button--small" type="button" onClick={() => { setChartDateFrom(""); setChartDateTo(""); setChartModel("all"); setChartTreatment("all"); setSearch(""); }}>Limpar filtros</button></div>
        </section>
        <section aria-label="Indicadores financeiros" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
          {[
            { label: "Registros de clientes", value: numbers.format(filteredSummary.count), note: `${numbers.format(filteredSummary.completedCount)} contabilizados no financeiro`, color: "#10233f" },
            { label: "Faturamento contabilizado", value: currency.format(filteredSummary.revenue), note: "Somente registros classificados como concluídos", color: "#087443" },
            { label: "Custos contabilizados", value: currency.format(filteredSummary.cost), note: "Custos dos registros contabilizados", color: "#b45309" },
            { label: "Valor líquido estimado", value: currency.format(filteredSummary.profit), note: "Faturamento bruto menos custos das vendas concluídas", color: filteredSummary.profit >= 0 ? "#86efac" : "#fca5a5", dark: true },
            { label: "Ticket médio", value: currency.format(filteredSummary.completedCount ? filteredSummary.revenue / filteredSummary.completedCount : 0), note: "Faturamento por venda contabilizada", color: "#0f766e" },
            { label: "Aguardando revisão", value: numbers.format(filteredSummary.reviewCount), note: "Status ou valores financeiros incompletos", color: "#64748b" },
            { label: "Datas divergentes/ausentes", value: numbers.format(rows.filter((row) => row.dateIssue).length), note: "Data vazia ou fora do mês/ano da pasta", color: "#b45309" },
          ].map((item) => <article key={item.label} style={{ background: item.dark ? "#10233f" : "#fff", border: `1px solid ${item.dark ? "#10233f" : "#dce5ef"}`, borderRadius: 14, padding: 20, boxShadow: "0 4px 14px rgba(15,23,42,.04)" }}><span style={{ color: item.dark ? "#c8d6e8" : "#52647a", fontSize: 13 }}>{item.label}</span><strong style={{ display: "block", marginTop: 10, fontSize: 25, letterSpacing: "-.04em", color: item.color }}>{item.value}</strong><small style={{ color: item.dark ? "#c8d6e8" : "#64748b" }}>{item.note}</small></article>)}
        </section>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          <article role="button" tabIndex={0} aria-label="Abrir gráfico de evolução financeira em tela dedicada" onClick={() => setActiveChart("financial")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveChart("financial"); } }} style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 16, padding: 22, minWidth: 0, cursor: "pointer" }}><div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}><h2 style={{ margin: "0 0 5px", fontSize: 17 }}>Evolução financeira</h2><span style={{ color: "#087f8c", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Ampliar ↗</span></div><p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>Faturamento versus custos, agrupados por mês. Clique para abrir somente este gráfico.</p><BarChart rows={monthlyChart} /></article>
          <article role="button" tabIndex={0} aria-label="Abrir gráfico de situação dos registros em tela dedicada" onClick={() => setActiveChart("status")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setActiveChart("status"); } }} style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 16, padding: 22, cursor: "pointer" }}><div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 12 }}><h2 style={{ margin: "0 0 5px", fontSize: 17 }}>Situação dos registros</h2><span style={{ color: "#087f8c", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>Ampliar ↗</span></div><p style={{ margin: "0 0 16px", color: "#64748b", fontSize: 13 }}>Distribuição entre concluídos, não concluídos e itens para revisar. Clique para abrir somente este gráfico.</p><DonutSummary rows={filteredRows} /><div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e7edf4" }}><h3 style={{ fontSize: 14, margin: "0 0 10px" }}>Modelos com maior faturamento</h3>{modelRanking.length ? modelRanking.map((item, i) => <div key={item.label} style={{ marginTop: 10 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, marginBottom: 5 }}><span>{i + 1}. {item.label}</span><strong>{currency.format(item.revenue)}</strong></div><div style={{ height: 6, borderRadius: 6, background: "#edf2f7", overflow: "hidden" }}><div style={{ height: "100%", width: `${item.revenue / Math.max(1, modelRanking[0].revenue) * 100}%`, background: "#087f8c", borderRadius: 6 }} /></div></div>) : <p style={{ color: "#64748b", fontSize: 13 }}>Nenhum modelo com faturamento disponível.</p>}</div></article>
        </section>
        <section style={{ background: "#fff", border: "1px solid #dce5ef", borderRadius: 16, overflow: "hidden", boxShadow: "0 5px 20px rgba(15,23,42,.04)" }}>
          <div style={{ padding: "22px 24px", display: "flex", alignItems: "end", justifyContent: "space-between", gap: 18, flexWrap: "wrap", borderBottom: "1px solid #e7edf4" }}><div><h2 style={{ margin: 0, fontSize: 18, fontWeight: 750, color: "#10233f" }}>Relatórios detalhados</h2><p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748b" }}>Clique em qualquer linha para abrir os registros que formam aquele total.</p></div><div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}><label style={{ display: "grid", gap: 6, minWidth: 160, fontSize: 12, color: "#52647a", fontWeight: 650 }}>Tipo de relatório<select value={dimension} onChange={(e) => { setDimension(e.target.value as ReportDimension); setSelectedLabel(null); setSearch(""); }} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", background: "#fff", color: "#10233f" }}><option value="period">Por período</option><option value="model">Por modelo</option><option value="status">Por status</option></select></label>{dimension === "period" && <label style={{ display: "grid", gap: 6, minWidth: 150, fontSize: 12, color: "#52647a", fontWeight: 650 }}>Intervalo<select value={granularity} onChange={(e) => { setGranularity(e.target.value as Granularity); setSelectedLabel(null); }} style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", background: "#fff", color: "#10233f" }}><option value="month">Mensal</option><option value="week">Semanal</option><option value="year">Anual</option></select></label>}<label style={{ display: "grid", gap: 6, minWidth: 200, fontSize: 12, color: "#52647a", fontWeight: 650 }}>Pesquisar grupo<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para pesquisar…" style={{ minHeight: 42, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px", color: "#10233f" }} /></label></div></div>
          <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, background: "#f7f9fc", borderBottom: "1px solid #e7edf4", color: "#52647a", fontSize: 12 }}><span><strong style={{ color: "#10233f" }}>{filteredGroups.length}</strong> grupos · <strong style={{ color: "#10233f" }}>{rows.length}</strong> registros detalhados</span><span>{numbers.format(filteredSummary.excludedCount)} não concluídos · {numbers.format(summary.reviewCount)} para revisar · {numbers.format(rows.filter((row) => row.dateIssue).length)} datas divergentes/ausentes · {numbers.format(summary.rowsIgnored)} linhas vazias/totalizadoras ignoradas</span></div>
          <div style={{ overflowX: "auto" }}><table className="records-table report-table" style={{ width: "100%", minWidth: 800 }}><thead><tr><th>{dimensionLabels[dimension]}</th><th className="numeric-cell">Registros</th><th className="numeric-cell">Concluídos</th><th className="numeric-cell">Faturamento</th><th className="numeric-cell">Custos</th><th className="numeric-cell">Valor líquido</th><th>Abrir</th></tr></thead><tbody>{filteredGroups.map((group) => <tr key={group.label} onClick={() => { setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }} onKeyDown={(e) => { if (e.key === "Enter") setSelectedLabel(group.label); }} tabIndex={0} role="button" aria-label={`Abrir detalhes de ${group.label}`} style={{ cursor: "pointer" }}><td style={{ fontWeight: 650, color: "#10233f" }}>{group.label}</td><td className="numeric-cell">{numbers.format(group.count)}</td><td className="numeric-cell">{numbers.format(group.completedCount)}</td><td className="numeric-cell">{currency.format(group.revenue)}</td><td className="numeric-cell">{currency.format(group.cost)}</td><td className="numeric-cell" style={{ fontWeight: 650, color: group.profit >= 0 ? "#087443" : "#b91c1c" }}>{currency.format(group.profit)}</td><td><button type="button" className="button button--secondary button--small" onClick={(e) => { e.stopPropagation(); setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }}>Ver vendas</button></td></tr>)}{!filteredGroups.length && <tr><td colSpan={7} style={{ padding: 28, textAlign: "center", color: "#64748b" }}>Nenhum grupo corresponde à pesquisa.</td></tr>}</tbody><tfoot>{filteredGroups.length > 0 && <tr style={{ background: "#f7f9fc", fontWeight: 750 }}><td>Total exibido</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.count, 0))}</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.completedCount, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.revenue, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.cost, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.profit, 0))}</td><td /></tr>}</tfoot></table></div>
        </section>
      </div>}
    </main>
    {activeChart && <div role="dialog" aria-modal="true" aria-labelledby="expanded-chart-title" onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveChart(null); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(15,23,42,.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}><section style={{ width: "min(1400px, 100%)", height: "min(900px, 94vh)", overflow: "auto", background: "#fff", borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,.3)", padding: "clamp(18px, 3vw, 36px)" }}><header style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 20, marginBottom: 24, borderBottom: "1px solid #e7edf4", paddingBottom: 18 }}><div><p style={{ margin: "0 0 6px", color: "#087f8c", fontSize: 11, fontWeight: 800, letterSpacing: ".12em" }}>VISUALIZAÇÃO AMPLIADA</p><h2 id="expanded-chart-title" style={{ margin: 0, color: "#10233f", fontSize: 26 }}>{activeChart === "financial" ? "Evolução financeira" : "Situação dos registros"}</h2><p style={{ margin: "7px 0 0", color: "#64748b", fontSize: 14 }}>Os filtros aplicados na página de relatórios continuam ativos neste gráfico.</p></div><button type="button" className="button button--secondary" onClick={() => setActiveChart(null)}>Voltar aos relatórios ✕</button></header><div style={{ padding: "clamp(8px, 2vw, 24px)", border: "1px solid #e7edf4", borderRadius: 14, minHeight: 300 }}>{activeChart === "financial" ? <BarChart rows={monthlyChart} /> : <DonutSummary rows={filteredRows} />}</div><p style={{ marginTop: 16, color: "#64748b", fontSize: 13 }}>Registros considerados: <strong style={{ color: "#10233f" }}>{numbers.format(filteredRows.length)}</strong></p></section></div>}
    {selectedLabel && <div role="dialog" aria-modal="true" aria-labelledby="detail-title" style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,.48)", display: "flex", justifyContent: "center", alignItems: "center", padding: 18 }} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedLabel(null); }}><section style={{ width: "min(1200px, 100%)", maxHeight: "90vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,.25)" }}><header style={{ position: "sticky", top: 0, zIndex: 1, background: "#fff", padding: "20px 24px", borderBottom: "1px solid #e7edf4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}><div><p style={{ margin: "0 0 5px", color: "#087f8c", fontSize: 11, fontWeight: 800, letterSpacing: ".12em" }}>DETALHAMENTO DO GRUPO</p><h2 id="detail-title" style={{ margin: 0, fontSize: 22 }}>{selectedLabel}</h2><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>{selectedRows.length} registros encontrados · valores financeiros apenas para vendas concluídas</p></div><button className="button button--secondary button--small" type="button" onClick={() => setSelectedLabel(null)}>Fechar ✕</button></header><div style={{ padding: 24, display: "grid", gap: 16 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>{[{ label: "Vendas concluídas", value: numbers.format(selectedRows.filter((r) => r.completed).length) }, { label: "Faturamento bruto", value: currency.format(selectedRows.reduce((n, r) => n + r.revenue, 0)) }, { label: "Custos", value: currency.format(selectedRows.reduce((n, r) => n + r.cost, 0)) }, { label: "Valor líquido", value: currency.format(selectedRows.reduce((n, r) => n + r.profit, 0)) }].map((item) => <div key={item.label} style={{ background: "#f7f9fc", border: "1px solid #e7edf4", borderRadius: 12, padding: 15 }}><span style={{ color: "#64748b", fontSize: 12 }}>{item.label}</span><strong style={{ display: "block", marginTop: 7, fontSize: 20, color: "#10233f" }}>{item.value}</strong></div>)}</div><div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}><input value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} placeholder="Pesquisar cliente, contato, modelo ou status…" style={{ minHeight: 40, flex: "1 1 260px", border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px" }} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minHeight: 40, border: "1px solid #cbd7e5", borderRadius: 9, padding: "0 12px" }}><option value="all">Todas as situações</option><option value="Concluída">Concluídas</option><option value="Não concluída">Não concluídas</option><option value="Revisar">A revisar</option></select><button className="button button--secondary button--small" type="button" onClick={() => { const headers = ["Cliente","Contato","Data","Modelo","Status","Situação financeira","Data divergente/ausente","Valor financeiro ausente","Faturamento bruto","Custo","Valor líquido"]; const body = selectedRows.map((r) => [r.client,r.contact,r.date,r.model,r.status,r.treatment,r.dateIssue ? "Sim" : "Não",r.financialIssue ? "Sim" : "Não",r.revenue.toFixed(2),r.cost.toFixed(2),r.profit.toFixed(2)]); const csv = [headers,...body].map((line) => line.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n"); const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"})); const a = document.createElement("a"); a.href = url; a.download = `detalhamento-${selectedLabel.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url); }}>Exportar detalhes CSV</button></div><div style={{ overflowX: "auto" }}><table className="records-table report-table" style={{ width: "100%", minWidth: 1050 }}><thead><tr><th>Cliente</th><th>Data emissão/renovação</th><th>Modelo</th><th>Status</th><th>Situação</th><th>Qualidade dos dados</th><th className="numeric-cell">Faturamento bruto</th><th className="numeric-cell">Custo</th><th className="numeric-cell">Valor líquido</th></tr></thead><tbody>{selectedRows.map((row) => <tr key={row.id}><td style={{ fontWeight: 650 }}>{row.client}</td><td>{row.date}</td><td>{textValue(row.model)}</td><td>{textValue(row.status)}</td><td><span style={{ display: "inline-block", borderRadius: 20, padding: "4px 8px", fontSize: 11, background: row.treatment === "Concluída" ? "#dcfce7" : row.treatment === "Revisar" ? "#f1f5f9" : "#ffedd5", color: row.treatment === "Concluída" ? "#166534" : row.treatment === "Revisar" ? "#475569" : "#9a3412" }}>{row.treatment}</span></td><td>{row.dateIssue && <span style={{ display: "inline-block", margin: "2px", borderRadius: 6, padding: "3px 6px", fontSize: 10, background: "#ffedd5", color: "#9a3412" }}>Data divergente/ausente</span>}{row.financialIssue && <span style={{ display: "inline-block", margin: "2px", borderRadius: 6, padding: "3px 6px", fontSize: 10, background: "#fee2e2", color: "#991b1b" }}>Valor financeiro ausente</span>}{!row.dateIssue && !row.financialIssue && <span style={{ color: "#64748b" }}>—</span>}</td><td className="numeric-cell">{currency.format(row.revenue)}</td><td className="numeric-cell">{currency.format(row.cost)}</td><td className="numeric-cell">{currency.format(row.profit)}</td></tr>)}{!selectedRows.length && <tr><td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Nenhum registro encontrado com esses filtros.</td></tr>}</tbody></table></div></div></section></div>}
  </div>;
}
