"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/app-header";
import { Icon } from "@/components/icon";
import { HelpFaq } from "@/components/help-faq";
import { saleStatusClass, saleStatusLabel } from "@/lib/sale-status";
import { useWorkbookData } from "@/lib/client/use-workbook-data";
import { getWorkbookReportRows, parseReportDate, summarizeWorkbook, type ReportDimension, type DetailedReportRow } from "@/lib/reporting";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numbers = new Intl.NumberFormat("pt-BR");
type Granularity = "month" | "week" | "year";
type Group = { label: string; count: number; eligibleCount: number; excludedCount?: number; reviewCount?: number; revenue: number; cost: number; profit: number };
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
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) return raw;
    return "";
  }
  // Aceita datas importadas de planilhas em DD/MM/AAAA, DD-MM-AAAA ou DD.MM.AAAA.
  match = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(raw);
  if (match) {
    const year = Number(match[3]), month = Number(match[2]), day = Number(match[1]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
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
    .map((line) => line.map(quote).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prospeccao-renovacoes-${month}-${year}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
function textValue(value: string) {
  return value && value !== "Sem preenchimento" ? value : "Não informado";
}
function canonicalMonth(value: string): string {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const month = MONTHS.find((item) => item.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalized);
  return month ?? value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}
function parsedDate(row: DetailedReportRow): Date | null {
  return parseReportDate(row.date);
}
function periodLabel(row: DetailedReportRow, granularity: Granularity): string {
  const date = parsedDate(row);
  // Mês/ano seguem a competência da pasta anual; a data pode ser de renovação antiga.
  if (granularity === "year") return textValue(row.year) !== "Não informado" ? row.year : date ? String(date.getFullYear()) : "";
  if (granularity === "month") {
    if (textValue(row.month) !== "Não informado" && textValue(row.year) !== "Não informado") return `${canonicalMonth(row.month)} ${row.year.trim()}`;
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
    ["Grupo", "Registros", "Registros incluídos no financeiro", "Faturamento bruto (R$)", "Custos (R$)", "Valor líquido (R$)"],
    ...rows.map((row) => [row.label, row.count, row.eligibleCount, row.revenue.toFixed(2), row.cost.toFixed(2), row.profit.toFixed(2)]),
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
function UnifiedChart({ rows }: { rows: Group[] }) {
  const [mode, setMode] = useState<"financial" | "volume">("financial");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (!rows.length) return <div className="unified-chart-empty">Sem dados suficientes para gerar o gráfico neste filtro.</div>;

  const financialSeries = [
    { key: "revenue", label: "Faturamento", color: "#168f91", value: (row: Group) => row.revenue },
    { key: "cost", label: "Custos", color: "#d99536", value: (row: Group) => row.cost },
    { key: "profit", label: "Valor líquido", color: "#4778d5", value: (row: Group) => row.profit },
  ];
  const volumeSeries = [
    { key: "eligible", label: "Incluídos no financeiro", color: "#168f91", value: (row: Group) => row.eligibleCount },
    { key: "excluded", label: "Excluídos", color: "#d99536", value: (row: Group) => row.excludedCount ?? 0 },
    { key: "review", label: "Em revisão", color: "#8b70c9", value: (row: Group) => row.reviewCount ?? 0 },
  ];
  const activeSeries = mode === "financial" ? financialSeries : volumeSeries;
  const total = rows.reduce((acc, row) => ({
    revenue: acc.revenue + row.revenue,
    cost: acc.cost + row.cost,
    profit: acc.profit + row.profit,
    eligible: acc.eligible + row.eligibleCount,
    excluded: acc.excluded + (row.excludedCount ?? 0),
    review: acc.review + (row.reviewCount ?? 0),
  }), { revenue: 0, cost: 0, profit: 0, eligible: 0, excluded: 0, review: 0 });
  const activeRow = activeIndex === null ? rows[rows.length - 1] : (rows[activeIndex] ?? rows[rows.length - 1]);
  const currencyCompact = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const money = (value: number) => currency.format(value);
  const count = (value: number) => numbers.format(value);
  const chartWidth = Math.max(760, rows.length * 108 + 112);
  const chartHeight = 352;
  const left = 78, right = 28, top = 24, bottom = 66;
  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;
  const minValue = mode === "financial" ? Math.min(0, ...rows.map((row) => row.profit)) * 1.12 : 0;
  const maxValue = Math.max(1, ...rows.flatMap((row) => activeSeries.map((series) => series.value(row)))) * 1.12;
  const y = (value: number) => top + ((maxValue - value) / (maxValue - minValue || 1)) * plotHeight;
  const baseline = y(0);
  const slot = plotWidth / rows.length;
  const groupWidth = Math.min(82, slot * 0.76);
  const barGap = 6;
  const isMonthlyPeriod = (label: string) => /^.+\s+\d{4}$/.test(label);
  const monthlyProfitRows = rows.map((row, index) => ({ row, index })).filter(({ row }) => isMonthlyPeriod(row.label));
  const profitPath = monthlyProfitRows.map(({ row, index }, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${left + slot * (index + 0.5)} ${y(row.profit)}`).join(" ");
  const axisFormat = (value: number) => mode === "financial" ? "R$ " + currencyCompact(value) : count(Math.round(value));
  const metrics = mode === "financial"
    ? [
        { label: "Faturamento", value: money(total.revenue), tone: "revenue" },
        { label: "Custos", value: money(total.cost), tone: "cost" },
        { label: "Valor líquido", value: money(total.profit), tone: "profit" },
      ]
    : [
        { label: "Incluídos no financeiro", value: count(total.eligible), tone: "revenue" },
        { label: "Excluídos", value: count(total.excluded), tone: "cost" },
        { label: "Em revisão", value: count(total.review), tone: "review" },
      ];

  return <div className="report-viz">
    <div className="report-viz-toolbar">
      <div className="report-viz-switch" role="group" aria-label="Tipo de visualização">
        <button type="button" className={mode === "financial" ? "is-active" : ""} aria-pressed={mode === "financial"} onClick={() => { setMode("financial"); setActiveIndex(null); }}>Financeiro</button>
        <button type="button" className={mode === "volume" ? "is-active" : ""} aria-pressed={mode === "volume"} onClick={() => { setMode("volume"); setActiveIndex(null); }}>Volume de registros</button>
      </div>
      <span className="report-viz-period-count">{count(rows.length)} períodos</span>
    </div>

    <div className="report-viz-metrics" aria-live="polite">
      {metrics.map((item) => <article key={item.label} className={"report-viz-metric report-viz-metric--" + item.tone}>
        <span><i />{item.label}</span><strong>{item.value}</strong>
      </article>)}
    </div>

    <div className="report-viz-legend" aria-label="Legenda do gráfico">
      {activeSeries.map((item) => <span key={item.key} className={item.key === "profit" ? "is-line" : ""}><i style={{ backgroundColor: item.color, borderColor: item.color }} />{item.key === "profit" && mode === "financial" ? "Valor líquido (linha mensal / barra anual)" : item.label}</span>)}
    </div>

    <div className="report-viz-scroll" role="region" aria-label="Gráfico por período. Role horizontalmente para consultar todo o histórico." tabIndex={0}>
      <svg className="report-viz-svg" role="img"
        aria-label={mode === "financial" ? "Comparação de faturamento, custos e valor líquido por período" : "Comparação de registros incluídos, excluídos e em revisão por período"}
        viewBox={"0 0 " + chartWidth + " " + chartHeight}
        style={{ width: chartWidth + "px", minWidth: chartWidth + "px" }}>
        <defs>
          <linearGradient id="reportVizRevenue" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#25aaa6" /><stop offset="100%" stopColor="#147c80" /></linearGradient>
          <linearGradient id="reportVizCost" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#efb65f" /><stop offset="100%" stopColor="#c47c27" /></linearGradient>
          <linearGradient id="reportVizProfit" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7199e8" /><stop offset="100%" stopColor="#3d68bd" /></linearGradient>
          <linearGradient id="reportVizReview" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#aa96e2" /><stop offset="100%" stopColor="#7860b4" /></linearGradient>
        </defs>
        <rect className="report-viz-plot" x={left} y={top} width={plotWidth} height={plotHeight} rx="12" />
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = minValue + (maxValue - minValue) * tick / 4;
          const tickY = y(value);
          return <g key={tick}>
            <line x1={left} x2={chartWidth - right} y1={tickY} y2={tickY} className={Math.abs(value) < 0.00001 ? "report-viz-zero" : "report-viz-gridline"} />
            <text x={left - 12} y={tickY + 4} textAnchor="end" className="report-viz-axis">{axisFormat(value)}</text>
          </g>;
        })}
        {mode === "financial" && <path className="report-viz-profit-line" d={profitPath} fill="none" stroke="url(#reportVizProfit)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />}
        {rows.map((row, index) => {
          const center = left + slot * (index + 0.5);
          const isMonthly = isMonthlyPeriod(row.label);
          const rowSeries = activeSeries.filter((series) => mode !== "financial" || isMonthly || series.key !== "profit");
          const rowBarCount = rowSeries.length;
          const rowBarWidth = Math.max(5, (groupWidth - barGap * (rowBarCount - 1)) / rowBarCount);
          return <g key={row.label}>
            {activeIndex === index && <rect className="report-viz-selection" x={left + index * slot + 3} y={top + 2} width={Math.max(0, slot - 6)} height={plotHeight - 4} rx="9" />}
            {rowSeries.map((series, seriesIndex) => {
              const value = series.value(row);
              const valueY = y(value);
              const barX = center - (rowBarCount * rowBarWidth + (rowBarCount - 1) * barGap) / 2 + seriesIndex * (rowBarWidth + barGap);
              const barY = Math.min(baseline, valueY);
              const height = Math.max(1, Math.abs(baseline - valueY));
              const gradient = series.key === "revenue" || series.key === "eligible" ? "url(#reportVizRevenue)"
                : series.key === "cost" || series.key === "excluded" ? "url(#reportVizCost)"
                : series.key === "review" ? "url(#reportVizReview)" : "url(#reportVizProfit)";
              return <g key={series.key}>
                <rect x={barX} y={barY} width={rowBarWidth} height={height} rx="4" fill={gradient} className="report-viz-bar">
                  <title>{row.label} · {series.label}: {mode === "financial" ? money(value) : count(value)}</title>
                </rect>
              </g>;
            })}
            {mode === "financial" && isMonthly && <circle className="report-viz-profit-point" cx={center} cy={y(row.profit)} r={activeIndex === index ? 6 : 4.5}>
              <title>{row.label} · Valor líquido: {money(row.profit)}</title>
            </circle>}
            <text x={center} y={chartHeight - 34} textAnchor="middle" className="report-viz-category">
              <title>{row.label}</title>{row.label.length > 16 ? row.label.slice(0, 14) + "…" : row.label}
            </text>
            <text x={center} y={chartHeight - 16} textAnchor="middle" className="report-viz-category-count">{count(row.count)} registros</text>
            <rect x={left + index * slot} y={top} width={slot} height={plotHeight} fill="transparent" className="report-viz-hit"
              tabIndex={0} role="button" aria-pressed={activeIndex === index}
              aria-label={"Ver valores de " + row.label}
              onMouseEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)}
              onClick={() => setActiveIndex(index)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveIndex(index); } }}
              onBlur={() => setActiveIndex(null)} />
          </g>;
        })}
      </svg>
    </div>

    <section className="report-viz-detail" aria-live="polite">
      <div className="report-viz-detail-heading"><span>RESUMO DO PERÍODO</span><strong>{activeRow.label}</strong></div>
      <div className="report-viz-detail-values">
        <div><span>Faturamento</span><strong>{money(activeRow.revenue)}</strong></div>
        <div><span>Custos</span><strong>{money(activeRow.cost)}</strong></div>
        <div><span>Valor líquido</span><strong>{money(activeRow.profit)}</strong></div>
        <div><span>Incluídos no financeiro</span><strong>{count(activeRow.eligibleCount)}</strong></div>
        <div><span>Excluídos</span><strong>{count(activeRow.excludedCount ?? 0)}</strong></div>
        <div><span>Em revisão</span><strong>{count(activeRow.reviewCount ?? 0)}</strong></div>
      </div>
    </section>
  </div>;
}


function ReportDonut({ segments, total, label }: { segments: { label: string; value: number; color: string }[]; total: number; label: string }) {
  const radius = 43;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="report-donut-layout">
    <div className="report-donut-chart">
      <svg viewBox="0 0 112 112" role="img" aria-label={label}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--line)" strokeWidth="12" />
        {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => {
          const length = circumference * segment.value / total;
          const currentOffset = offset;
          offset += length;
          return <circle key={segment.label} cx="56" cy="56" r={radius} fill="none" stroke={segment.color}
            strokeWidth="12" strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-currentOffset} transform="rotate(-90 56 56)" strokeLinecap="butt">
            <title>{segment.label}: {numbers.format(segment.value)} ({Math.round(segment.value / total * 100)}%)</title>
          </circle>;
        })}
        <text x="56" y="52" textAnchor="middle" className="report-donut-total">{numbers.format(total)}</text>
        <text x="56" y="67" textAnchor="middle" className="report-donut-caption">registros</text>
      </svg>
    </div>
    <div className="report-donut-legend">
      {segments.map((segment) => <div key={segment.label} className="report-donut-legend-item">
        <span className="report-donut-legend-label"><i style={{ background: segment.color }} />{segment.label}</span>
        <strong>{numbers.format(segment.value)} <small>{total ? Math.round(segment.value / total * 100) : 0}%</small></strong>
      </div>)}
    </div>
  </div>;
}

export default function ReportsPage() {
  const { data: session, status } = useSession();
  const { data, loading, error, refresh } = useWorkbookData(status === "authenticated");
  const [dimension, setDimension] = useState<ReportDimension>("period");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [expandedReportYears, setExpandedReportYears] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [detailSearch, setDetailSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [chartDateFrom, setChartDateFrom] = useState("");
  const [chartDateTo, setChartDateTo] = useState("");
  const [chartModel, setChartModel] = useState("all");
  const [chartTreatment, setChartTreatment] = useState("all");
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
    const eligible = filteredRows.filter((row) => row.financiallyEligible);
    return {
      count: filteredRows.length,
      eligibleCount: eligible.length,
      excludedCount: filteredRows.filter((row) => row.treatment === "Não elegível").length,
      reviewCount: filteredRows.filter((row) => row.treatment === "Revisar").length,
      revenue: eligible.reduce((sum, row) => sum + row.revenue, 0),
      cost: eligible.reduce((sum, row) => sum + row.cost, 0),
      profit: eligible.reduce((sum, row) => sum + row.profit, 0),
    };
  }, [filteredRows]);
  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    filteredRows.forEach((row) => {
      const label = groupLabel(row, dimension, granularity);
      const group = map.get(label) ?? { label, count: 0, eligibleCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.treatment === "Não elegível") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.financiallyEligible) { group.eligibleCount += 1; group.revenue += row.revenue; group.cost += row.cost; }
      if (row.financiallyEligible) group.profit += row.profit;
      map.set(label, group);
    });
    return [...map.values()].sort((a, b) => {
      if (dimension === "period" && granularity === "year") return a.label.localeCompare(b.label, "pt-BR", { numeric: true });
      if (dimension === "period" && granularity === "month") {
        const parse = (label: string) => { const m = /^(.*?)\s+(\d{4})$/.exec(label); return m ? Number(m[2]) * 12 + MONTHS.findIndex((month) => month.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === m[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "")) : Number.MAX_SAFE_INTEGER; };
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
    const currentYear = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(new Date()));
    const grouped = new Map<string, Group>();
    filteredRows.forEach((row) => {
      const sourceYear = Number(textValue(row.year)) || parsedDate(row)?.getFullYear() || currentYear;
      const isCurrentYear = sourceYear === currentYear;
      const label = isCurrentYear
        ? periodLabel(row, "month")
        : String(sourceYear);
      const group = grouped.get(label) ?? { label, count: 0, eligibleCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.treatment === "Não elegível") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.financiallyEligible) {
        group.eligibleCount += 1;
        group.revenue += row.revenue;
        group.cost += row.cost;
        group.profit += row.profit;
      }
      grouped.set(label, group);
    });
    return [...grouped.values()].sort((a, b) => {
      const parsePeriod = (label: string) => {
        const match = label.match(/^(.+?)\s+(\d{4})$/);
        if (match) {
          const normalizedMonth = match[1].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
          const monthIndex = MONTHS.findIndex((month) => month.normalize("NFD").replace(/[\u0300-\u036f]/g, "") === normalizedMonth);
          return { year: Number(match[2]), month: monthIndex };
        }
        const year = Number(label);
        return { year: Number.isFinite(year) ? year : Number.MAX_SAFE_INTEGER, month: -1 };
      };
      const left = parsePeriod(a.label);
      const right = parsePeriod(b.label);
      return left.year - right.year || left.month - right.month || a.label.localeCompare(b.label, "pt-BR", { numeric: true });
    });
  }, [filteredRows]);
  const modelRanking = useMemo(() => { const totals = new Map<string, number>(); filteredRows.filter((row) => row.financiallyEligible).forEach((row) => totals.set(textValue(row.model), (totals.get(textValue(row.model)) ?? 0) + row.revenue)); return [...totals.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a,b) => b.revenue-a.revenue).slice(0,5); }, [filteredRows]);
  const clientRanking = useMemo(() => {
    const totals = new Map<string, { revenue: number; sales: number }>();
    filteredRows.filter((row) => row.financiallyEligible).forEach((row) => {
      const client = row.client.trim() || "Cliente não identificado";
      const current = totals.get(client) ?? { revenue: 0, sales: 0 };
      current.revenue += row.revenue;
      current.sales += 1;
      totals.set(client, current);
    });
    return [...totals.entries()].map(([label, value]) => ({ label, ...value }))
      .sort((a,b) => b.revenue-a.revenue).slice(0,5);
  }, [filteredRows]);
  const dimensionLabels: Record<ReportDimension, string> = { period: "Período", model: "Modelo do certificado", status: "Status / observação" };

  const monthlyYearGroups = useMemo(() => {
    if (dimension !== "period" || granularity !== "month") return [];
    const years = new Map<string, Map<string, Group>>();
    const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    filteredRows.forEach((row) => {
      const date = parsedDate(row);
      const sourceYear = String(row.year ?? "").trim();
      const numericYear = Number(sourceYear);
      // A competência cadastrada é a fonte principal. A data de emissão não
      // participa da classificação quando ano e mês já estão preenchidos.
      const year = Number.isInteger(numericYear) && numericYear >= 1900 && numericYear <= 9999
        ? String(numericYear)
        : date ? String(date.getFullYear()) : "";
      if (!year) return;
      const sourceMonth = String(row.month ?? "").trim();
      const monthIndex = MONTHS.findIndex((month) => normalize(month) === normalize(sourceMonth));
      const numericMonth = /^\d{1,2}$/.test(sourceMonth) ? Number(sourceMonth) - 1 : -1;
      const validNumericMonth = numericMonth >= 0 && numericMonth < 12 ? numericMonth : -1;
      const month = monthIndex >= 0
        ? MONTHS[monthIndex]
        : validNumericMonth >= 0
          ? MONTHS[validNumericMonth]
          : date
            ? MONTHS[date.getMonth()]
            : "Mês não informado";
      const label = `${month} ${year}`;
      const yearMonths = years.get(year) ?? new Map<string, Group>();
      const group = yearMonths.get(label) ?? {
        label, count: 0, eligibleCount: 0, excludedCount: 0, reviewCount: 0,
        revenue: 0, cost: 0, profit: 0,
      };
      group.count += 1;
      if (row.treatment === "Não elegível") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.financiallyEligible) {
        group.eligibleCount += 1;
        group.revenue += row.revenue;
        group.cost += row.cost;
        group.profit += row.profit;
      }
      yearMonths.set(label, group);
      years.set(year, yearMonths);
    });
    return [...years.entries()].map(([year, monthMap]) => {
      const months = [...monthMap.values()].sort((a, b) => {
        const monthOf = (label: string) => MONTHS.findIndex((month) => normalize(month) === normalize(label.split(" ")[0]));
        return monthOf(a.label) - monthOf(b.label) || a.label.localeCompare(b.label, "pt-BR");
      });
      const total = months.reduce((acc, month) => ({
        label: year,
        count: acc.count + month.count,
        eligibleCount: acc.eligibleCount + month.eligibleCount,
        excludedCount: (acc.excludedCount ?? 0) + (month.excludedCount ?? 0),
        reviewCount: (acc.reviewCount ?? 0) + (month.reviewCount ?? 0),
        revenue: acc.revenue + month.revenue,
        cost: acc.cost + month.cost,
        profit: acc.profit + month.profit,
      }), { label: year, count: 0, eligibleCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 } as Group);
      return { year, months, total };
    }).filter(({ year, months }) => !search.trim() || year.includes(search.trim()) || months.some((month) => month.label.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))))
      .sort((a, b) => a.year.localeCompare(b.year, "pt-BR", { numeric: true }));
  }, [filteredRows, dimension, granularity, search]);
  const useYearGrouping = dimension === "period" && granularity === "month";

  return <div className="app-shell">
    <AppHeader active="reports" />
    <main className="workspace module-workspace report-workspace">
      <div className="breadcrumb" aria-label="Localização"><Link href="/">Início</Link><span aria-hidden="true">/</span><span aria-current="page">Relatórios</span></div>
      <section className="module-page-heading report-page-heading"><p className="eyebrow">INTELIGÊNCIA COMERCIAL</p><h1>Relatórios e análises</h1><p>Explore faturamento, custos, vendas, modelos e evolução por mês, semana ou ano.</p></section>
      {status === "loading" || loading ? <section className="state-panel" aria-busy="true"><span className="loading-spinner" /><div className="state-copy"><h2>Conferindo os dados da planilha…</h2><p>Os indicadores serão calculados após o carregamento.</p></div></section> : !session?.user ? <div><ReportError message={error ?? "Entre com sua conta para acessar os dados."} /><Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link></div> : error || !summary ? <div><ReportError message={error ?? "Não foi possível calcular os indicadores."} /><button className="button button--secondary button--small" onClick={() => void refresh()} type="button">Tentar novamente</button></div> : <div className="report-dashboard-stack">
        <section className="report-summary-heading"><div><h2>Resumo do negócio</h2><p>Mês/ano seguem a competência das pastas anuais; semanas usam a data de emissão/renovação. Valores incompletos ficam em revisão.</p></div><div><button className="button button--secondary button--small" type="button" onClick={() => void refresh()} disabled={loading}><Icon name="refresh" /> Atualizar dados</button><button className="button button--primary button--small" type="button" onClick={() => exportCsv(filteredGroups)} disabled={!filteredGroups.length}>Exportar CSV</button></div></section>
        <section aria-label="Filtros dos gráficos e relatórios" className="report-filter-panel">
          <div className="report-filter-heading">
            <div className="report-filter-copy"><h2>Filtros de análise</h2><p>Aplicados aos gráficos, rankings e relatórios detalhados.</p></div>
            <span className="report-filter-count"><strong>{numbers.format(filteredRows.length)}</strong> de {numbers.format(rows.length)} registros</span>
          </div>
          <div className="report-filter-grid">
            <label className="report-control-label">Data inicial<input className="report-control-input" type="date" value={chartDateFrom} max={chartDateTo || undefined} onChange={(e) => setChartDateFrom(e.target.value)} /></label>
            <label className="report-control-label">Data final<input className="report-control-input" type="date" value={chartDateTo} min={chartDateFrom || undefined} onChange={(e) => setChartDateTo(e.target.value)} /></label>
            <label className="report-control-label">Modelo do certificado<select className="report-control-input" value={chartModel} onChange={(e) => setChartModel(e.target.value)}><option value="all">Todos os modelos</option>{modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
            <label className="report-control-label">Situação financeira<select className="report-control-input" value={chartTreatment} onChange={(e) => setChartTreatment(e.target.value)}><option value="all">Todas as situações</option><option value="Elegível">Incluídos no financeiro</option><option value="Não elegível">Excluídos do financeiro</option><option value="Revisar">A revisar</option></select></label>
          </div>
          <div><button className="button button--secondary button--small" type="button" onClick={() => { setChartDateFrom(""); setChartDateTo(""); setChartModel("all"); setChartTreatment("all"); setSearch(""); }}>Limpar filtros</button></div>
        </section>
        <section aria-label="Indicadores financeiros" className="report-kpi-grid">
          {[
            { label: "Registros de clientes", value: numbers.format(filteredSummary.count), note: `${numbers.format(filteredSummary.eligibleCount)} incluídos no financeiro (exceto cancelados e não concluídos)`, tone: "navy" },
            { label: "Faturamento contabilizado", value: currency.format(filteredSummary.revenue), note: "Soma apenas os registros classificados para o cálculo financeiro", tone: "positive" },
            { label: "Custos contabilizados", value: currency.format(filteredSummary.cost), note: "Custos dos registros contabilizados", tone: "warning" },
            { label: "Valor líquido estimado", value: currency.format(filteredSummary.profit), note: "Faturamento bruto menos custos dos registros contabilizados", tone: filteredSummary.profit >= 0 ? "profit-positive" : "profit-negative" },
            { label: "Ticket médio", value: currency.format(filteredSummary.eligibleCount ? filteredSummary.revenue / filteredSummary.eligibleCount : 0), note: "Faturamento por registro contabilizado", tone: "teal" },
            { label: "Aguardando revisão", value: numbers.format(filteredSummary.reviewCount), note: "Status ausente em planilhas de 2026 ou posteriores; confira pendências financeiras nos detalhes", tone: "muted" },
            { label: "Datas divergentes/ausentes", value: numbers.format(filteredRows.filter((row) => row.dateIssue).length), note: "Data vazia ou fora do mês/ano da pasta", tone: "warning" },
          ].map((item, index) => <article key={item.label} className={`report-kpi-card report-kpi-card--${item.tone} ${index < 4 ? "report-kpi-card--primary" : "report-kpi-card--secondary"}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>)}
        </section>
        <section aria-labelledby="unified-chart-title" className="report-chart-panel">
          <div className="report-chart-heading">
            <div className="report-chart-heading-copy"><p className="eyebrow">VISÃO CONSOLIDADA</p><h2 id="unified-chart-title">Desempenho financeiro e comercial</h2><p>Alterne entre a visão financeira e o volume de registros. Passe o cursor sobre um período para consultar os valores exatos.</p></div>
            <span className="report-chart-record-count">{numbers.format(filteredRows.length)} registros no filtro</span>
          </div>
          <UnifiedChart rows={monthlyChart}/>
        </section>
        <section className="report-dashboard-insights" aria-label="Indicadores complementares">
          <article className="report-insight-card report-financial-health">
            <div className="report-insight-heading"><div><p className="eyebrow">EFICIÊNCIA</p><h3>Saúde financeira</h3></div><span className={`report-health-badge ${filteredSummary.profit >= 0 ? "is-positive" : "is-negative"}`}>{filteredSummary.profit >= 0 ? "Resultado positivo" : "Resultado negativo"}</span></div>
            <div className="report-health-primary"><span>Margem líquida</span><strong>{filteredSummary.revenue > 0 ? (filteredSummary.profit / filteredSummary.revenue * 100).toLocaleString("pt-BR",{maximumFractionDigits:1}) : "0"}%</strong></div>
            <div className="report-health-track"><span className={filteredSummary.profit >= 0 ? "is-positive" : "is-negative"} style={{width: `${Math.min(100,Math.max(0,filteredSummary.revenue > 0 ? filteredSummary.profit / filteredSummary.revenue * 100 : 0))}%`}} /></div>
            <div className="report-health-row"><span>Custos sobre o faturamento</span><strong>{filteredSummary.revenue > 0 ? (filteredSummary.cost / filteredSummary.revenue * 100).toLocaleString("pt-BR",{maximumFractionDigits:1}) : "0"}%</strong></div>
            <div className="report-health-track report-health-track--cost"><span style={{width: `${Math.min(100,Math.max(0,filteredSummary.revenue > 0 ? filteredSummary.cost / filteredSummary.revenue * 100 : 0))}%`}} /></div>
            <div className="report-health-foot"><span>Ticket médio</span><strong>{currency.format(filteredSummary.eligibleCount ? filteredSummary.revenue / filteredSummary.eligibleCount : 0)}</strong></div>
          </article>
          <article className="report-insight-card report-status-distribution">
            <div className="report-insight-heading"><div><p className="eyebrow">QUALIDADE DA CARTEIRA</p><h3>Distribuição dos registros</h3></div><span className="report-insight-subtitle">{numbers.format(filteredSummary.count)} no filtro</span></div>
            <ReportDonut label="Distribuição de registros incluídos, excluídos e em revisão" total={filteredSummary.count} segments={[
              {label:"No financeiro",value:filteredSummary.eligibleCount,color:"#159b8c"},
              {label:"Excluídos",value:filteredSummary.excludedCount,color:"#d99536"},
              {label:"Em revisão",value:filteredSummary.reviewCount,color:"#8b70c9"},
            ]}/>
          </article>
          <article className="report-insight-card report-model-ranking">
            <div className="report-insight-heading"><div><p className="eyebrow">MIX DE PRODUTOS</p><h3>Modelos com maior faturamento</h3></div><span className="report-insight-subtitle">Top {modelRanking.length}</span></div>
            {modelRanking.length ? <div className="report-model-bars">{modelRanking.map((item,index)=>{
              const maximum = Math.max(1,...modelRanking.map((entry)=>entry.revenue));
              return <div className="report-model-bar-item" key={item.label}>
                <div className="report-model-bar-meta"><span><b>{String(index+1).padStart(2,"0")}</b>{item.label}</span><strong>{currency.format(item.revenue)}</strong></div>
                <div className="report-model-bar-track"><span style={{width:`${Math.max(2,item.revenue/maximum*100)}%`}} /></div>
              </div>;
            })}</div> : <p className="report-insight-empty">Sem faturamento por modelo neste filtro.</p>}
          </article>
          <article className="report-insight-card report-client-ranking">
            <div className="report-insight-heading"><div><p className="eyebrow">CARTEIRA DE CLIENTES</p><h3>Clientes com maior faturamento</h3></div><span className="report-insight-subtitle">Top {clientRanking.length}</span></div>
            {clientRanking.length ? <div className="report-model-bars">{clientRanking.map((item,index)=>{
              const maximum = Math.max(1,...clientRanking.map((entry)=>entry.revenue));
              return <div className="report-model-bar-item" key={item.label}>
                <div className="report-model-bar-meta"><span><b>{String(index+1).padStart(2,"0")}</b>{item.label}<small className="report-client-sales-count">{numbers.format(item.sales)} vendas</small></span><strong>{currency.format(item.revenue)}</strong></div>
                <div className="report-model-bar-track"><span style={{width:`${Math.max(2,item.revenue/maximum*100)}%`}} /></div>
              </div>;
            })}</div> : <p className="report-insight-empty">Sem vendas contabilizadas neste filtro.</p>}
          </article>
        </section>
        <section aria-labelledby="renewals-title" className="report-renewals-panel">
          <div className="report-renewals-header">
            <div className="report-renewals-copy"><p className="eyebrow">PROSPECÇÃO COMERCIAL</p><h2 id="renewals-title">Clientes com certificado vencendo no mês</h2><p>Lista para entrar em contato e oferecer a renovação do certificado digital, ordenada pela data de vencimento.</p></div>
            <div className="report-renewals-controls">
              <label className="report-control-label">Mês<select className="report-control-input" value={renewalMonth} onChange={(e) => setRenewalMonth(e.target.value)}>{MONTHS.map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month.charAt(0).toLocaleUpperCase("pt-BR") + month.slice(1)}</option>)}</select></label>
              <label className="report-control-label">Ano<select className="report-control-input" value={renewalYear} onChange={(e) => setRenewalYear(e.target.value)}>{Array.from({ length: 7 }, (_, index) => String(new Date().getFullYear() - 2 + index)).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <button className="button button--primary button--small" type="button" onClick={() => exportRenewals(renewalRows, renewalMonth, renewalYear)} disabled={!renewalRows.length}>Exportar lista CSV</button>
            </div>
          </div>
          <div className="report-renewals-count"><strong>{numbers.format(renewalRows.length)}</strong> {renewalRows.length === 1 ? "cliente com vencimento" : "clientes com vencimento"} em {MONTHS[Number(renewalMonth) - 1]} de {renewalYear}.</div>
          <div className="report-table-scroll"><table className="records-table report-table report-renewals-table"><thead><tr><th>Cliente</th><th>Contato</th><th>Modelo do certificado</th><th>Data de vencimento</th><th>Status / observação</th></tr></thead><tbody>{renewalRows.map((row, index) => <tr key={`${row.client}-${row.expiry}-${index}`}><td className="report-renewals-client">{row.client}</td><td>{row.contact || "—"}</td><td>{row.model || "—"}</td><td className="report-renewals-expiry">{displayDate(row.expiry)}</td><td>{row.status || "—"}</td></tr>)}{!renewalRows.length && <tr><td colSpan={5} className="report-table-empty">Nenhum cliente com data de vencimento registrada para este mês. Confira também se os registros possuem o campo “Data de vencimento” preenchido.</td></tr>}</tbody></table></div>
        </section>
        <section className="report-details-panel">
          <div className="report-details-header"><div className="report-details-copy"><h2>Relatórios detalhados</h2><p>Clique em qualquer linha para abrir os registros que formam aquele total.</p></div><div className="report-details-controls"><label className="report-control-label report-details-control">Tipo de relatório<select className="report-control-input" value={dimension} onChange={(e) => { setDimension(e.target.value as ReportDimension); setSelectedLabel(null); setSearch(""); }}><option value="period">Por período</option><option value="model">Por modelo</option><option value="status">Por status</option></select></label>{dimension === "period" && <label className="report-control-label report-details-control">Intervalo<select className="report-control-input" value={granularity} onChange={(e) => { setGranularity(e.target.value as Granularity); setSelectedLabel(null); }}><option value="month">Mensal</option><option value="week">Semanal</option><option value="year">Anual</option></select></label>}<label className="report-control-label report-details-control report-details-search">Pesquisar grupo<input className="report-control-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para pesquisar…" /></label></div></div>
          <div className="report-details-meta"><span><strong>{filteredGroups.length}</strong> grupos · <strong>{rows.length}</strong> registros detalhados</span><span>{numbers.format(filteredSummary.excludedCount)} não concluídos · {numbers.format(filteredSummary.reviewCount)} para revisar · {numbers.format(filteredRows.filter((row) => row.dateIssue).length)} datas divergentes/ausentes · {numbers.format(summary.rowsIgnored)} linhas vazias/totalizadoras ignoradas</span></div>
          <div className="report-details-table-scroll"><table className="records-table report-table report-groups-table"><thead><tr><th>{dimensionLabels[dimension]}</th><th className="numeric-cell">Registros</th><th className="numeric-cell">Incluídos no financeiro</th><th className="numeric-cell">Faturamento</th><th className="numeric-cell">Custos</th><th className="numeric-cell">Valor líquido</th><th>Abrir</th></tr></thead><tbody>{useYearGrouping ? monthlyYearGroups.map(({ year, months, total }) => <Fragment key={year}>
            <tr
              onClick={() => setExpandedReportYears((current) => current.includes(year) ? current.filter((item) => item !== year) : [...current, year])}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedReportYears((current) => current.includes(year) ? current.filter((item) => item !== year) : [...current, year]); } }}
              tabIndex={0}
              role="button"
              aria-expanded={expandedReportYears.includes(year)}
              className="report-group-row report-group-row--year"
            >
              <td className="report-group-year-label"><span aria-hidden="true" className="report-group-chevron">{expandedReportYears.includes(year) ? "▾" : "▸"}</span>{year}<span className="report-group-caption">{months.length} {months.length === 1 ? "mês" : "meses"}</span></td>
              <td className="numeric-cell">{numbers.format(total.count)}</td>
              <td className="numeric-cell">{numbers.format(total.eligibleCount)}</td>
              <td className="numeric-cell">{currency.format(total.revenue)}</td>
              <td className="numeric-cell">{currency.format(total.cost)}</td>
              <td className={`numeric-cell report-profit-cell ${total.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(total.profit)}</td>
              <td><span className="report-group-action-label">{expandedReportYears.includes(year) ? "Ocultar meses" : "Ver meses"}</span></td>
            </tr>
            {expandedReportYears.includes(year) && months.map((group) => <tr key={group.label} onClick={() => { setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }} onKeyDown={(e) => { if (e.key === "Enter") setSelectedLabel(group.label); }} tabIndex={0} role="button" aria-label={`Abrir detalhes de ${group.label}`} className="report-group-row report-group-row--month">
              <td className="report-group-month-label">↳ {group.label}</td>
              <td className="numeric-cell">{numbers.format(group.count)}</td>
              <td className="numeric-cell">{numbers.format(group.eligibleCount)}</td>
              <td className="numeric-cell">{currency.format(group.revenue)}</td>
              <td className="numeric-cell">{currency.format(group.cost)}</td>
              <td className={`numeric-cell report-profit-cell ${group.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(group.profit)}</td>
              <td><button type="button" className="button button--secondary button--small" onClick={(e) => { e.stopPropagation(); setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }}>Ver vendas</button></td>
            </tr>)}
          </Fragment>) : filteredGroups.map((group) => <tr key={group.label} onClick={() => { setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }} onKeyDown={(e) => { if (e.key === "Enter") setSelectedLabel(group.label); }} tabIndex={0} role="button" aria-label={`Abrir detalhes de ${group.label}`} className="report-group-row"><td className="report-group-label">{group.label}</td><td className="numeric-cell">{numbers.format(group.count)}</td><td className="numeric-cell">{numbers.format(group.eligibleCount)}</td><td className="numeric-cell">{currency.format(group.revenue)}</td><td className="numeric-cell">{currency.format(group.cost)}</td><td className={`numeric-cell report-profit-cell ${group.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(group.profit)}</td><td><button type="button" className="button button--secondary button--small" onClick={(e) => { e.stopPropagation(); setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }}>Ver vendas</button></td></tr>)}{!filteredGroups.length && <tr><td colSpan={7} className="report-table-empty">Nenhum grupo corresponde à pesquisa.</td></tr>}</tbody><tfoot>{filteredGroups.length > 0 && <tr className="report-groups-total-row"><td>Total exibido</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.count, 0))}</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.eligibleCount, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.revenue, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.cost, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.profit, 0))}</td><td /></tr>}</tfoot></table></div>
        </section>
      </div>}
    </main>
    {selectedLabel && <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
      className="report-detail-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedLabel(null); }}
    >
      <section className="report-detail-dialog">
        <header className="report-detail-header">
          <div>
            <p className="report-detail-eyebrow">DETALHAMENTO DO GRUPO</p>
            <h2 id="detail-title">{selectedLabel}</h2>
            <p className="report-detail-subtitle">{selectedRows.length} registros encontrados · valores financeiros apenas para vendas concluídas</p>
          </div>
          <button className="button button--secondary button--small" type="button" onClick={() => setSelectedLabel(null)}>Fechar ✕</button>
        </header>
        <div className="report-detail-content">
          <div className="report-detail-kpis">
            {[{ label: "Registros incluídos no financeiro", value: numbers.format(selectedRows.filter((r) => r.financiallyEligible).length) }, { label: "Faturamento bruto", value: currency.format(selectedRows.reduce((n, r) => n + r.revenue, 0)) }, { label: "Custos", value: currency.format(selectedRows.reduce((n, r) => n + r.cost, 0)) }, { label: "Valor líquido", value: currency.format(selectedRows.reduce((n, r) => n + r.profit, 0)) }].map((item) => <div key={item.label} className="report-detail-kpi"><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div>
          <div className="report-detail-toolbar">
            <input className="report-detail-search" value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} placeholder="Pesquisar cliente, contato, modelo ou status…" />
            <select className="report-detail-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todas as situações</option><option value="Elegível">Incluídos no financeiro</option><option value="Não elegível">Excluídos do financeiro</option><option value="Revisar">A revisar</option>
            </select>
            <button className="button button--secondary button--small" type="button" onClick={() => {
              const headers = ["Cliente","Contato","Data","Modelo","Status","Certificado vinculado","Situação financeira","Data divergente/ausente","Valor financeiro ausente","Faturamento bruto","Custo","Valor líquido"];
              const body = selectedRows.map((r) => [r.client,r.contact,r.date,r.model,r.status,r.hasCertificate ? "Sim" : "Não",r.treatment,r.dateIssue ? "Sim" : "Não",r.financialIssue ? "Sim" : "Não",r.revenue.toFixed(2),r.cost.toFixed(2),r.profit.toFixed(2)]);
              const csv = [headers,...body].map((line) => line.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
              const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
              const a = document.createElement("a"); a.href = url; a.download = `detalhamento-${selectedLabel.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
            }}>Exportar detalhes CSV</button>
          </div>
          <div className="report-detail-table-wrap">
            <table className="records-table report-table report-detail-table">
              <thead><tr><th>Cliente</th><th>Data emissão/renovação</th><th>Modelo</th><th>Status</th><th>Certificado PFX</th><th>Situação</th><th>Qualidade dos dados</th><th className="numeric-cell">Faturamento bruto</th><th className="numeric-cell">Custo</th><th className="numeric-cell">Valor líquido</th></tr></thead>
              <tbody>
                {selectedRows.map((row) => <tr key={row.id}>
                  <td className="report-detail-client">{row.client}</td><td>{row.date}</td><td>{textValue(row.model)}</td>
                  <td><span className={`sale-status-badge ${saleStatusClass(row.status)}`}>{saleStatusLabel(row.status)}</span></td>
                  <td><span className={`sale-certificate-badge ${row.hasCertificate ? "is-linked" : "is-unlinked"}`}>{row.hasCertificate ? "Vinculado" : "Não vinculado"}</span></td>
                  <td><span className={`report-treatment-badge ${row.treatment === "Elegível" ? "report-treatment--complete" : row.treatment === "Revisar" ? "report-treatment--review" : "report-treatment--pending"}`}>{row.treatment}</span></td>
                  <td className="report-data-quality">
                    {row.dateIssue && <span className="report-data-issue report-data-issue--date">Data divergente/ausente</span>}
                    {row.financialIssue && <span className="report-data-issue report-data-issue--financial">Valor financeiro ausente</span>}
                    {!row.dateIssue && !row.financialIssue && <span className="report-data-quality__empty">—</span>}
                  </td>
                  <td className="numeric-cell">{currency.format(row.revenue)}</td><td className="numeric-cell">{currency.format(row.cost)}</td><td className="numeric-cell">{currency.format(row.profit)}</td>
                </tr>)}
                {!selectedRows.length && <tr><td colSpan={9} className="report-detail-empty">Nenhum registro encontrado com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>}
    <HelpFaq topic="relatorios" />
  </div>;
}
