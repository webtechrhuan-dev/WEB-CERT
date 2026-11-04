"use client";

import Link from "next/link";
import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { AppHeader } from "@/components/app-header";
import { Icon } from "@/components/icon";
import { HelpFaq } from "@/components/help-faq";
import { saleStatusClass, saleStatusLabel } from "@/lib/sale-status";
import { useWorkbookData } from "@/lib/client/use-workbook-data";
import { getWorkbookReportRows, summarizeWorkbook, type ReportDimension, type DetailedReportRow } from "@/lib/reporting";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numbers = new Intl.NumberFormat("pt-BR");
type Granularity = "month" | "week" | "year";
type Group = { label: string; count: number; completedCount: number; excludedCount?: number; reviewCount?: number; revenue: number; cost: number; profit: number };
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
function UnifiedChart({ rows }: { rows: Group[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const [hoveredRow, setHoveredRow] = useState<Group | null>(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 24, y: 100 });
  const visible = rows;
  if (!visible.length) return <div className="unified-chart-empty">Sem dados suficientes para gerar o gráfico neste filtro.</div>;

  const width = Math.max(900, visible.length * 148 + 132);
  const height = 390;
  const left = 82, right = 76, top = 34, bottom = 88;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const minMoney = Math.min(0, ...visible.map((row) => row.profit)) * 1.16;
  const maxMoney = Math.max(1, ...visible.flatMap((row) => [row.revenue, row.cost, row.profit])) * 1.16;
  const maxCount = Math.max(1, ...visible.map((row) => row.count)) * 1.2;
  const x = (index: number) => left + (index + 0.5) * plotWidth / visible.length;
  const yMoney = (value: number) => top + ((maxMoney - value) / (maxMoney - minMoney || 1)) * plotHeight;
  const yCount = (value: number) => top + plotHeight - (value / maxCount) * plotHeight;
  const colors = { revenue: "#0e9aa7", cost: "#f0a34a", profit: "#4778e8", completed: "#16a477", excluded: "#e58b42", review: "#8b6be8" };
  const compactMoney = (value: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 2 }).format(value);
  const series = [
    { key: "completed", label: "Concluídas", value: (row: Group) => row.completedCount, color: colors.completed },
    { key: "excluded", label: "Não concluídas", value: (row: Group) => row.excludedCount ?? 0, color: colors.excluded },
    { key: "review", label: "Em revisão", value: (row: Group) => row.reviewCount ?? 0, color: colors.review },
  ];
  const financial = [
    { key: "revenue", label: "Faturamento", value: (row: Group) => row.revenue, color: colors.revenue, gradient: "chartRevenue" },
    { key: "cost", label: "Custos", value: (row: Group) => row.cost, color: colors.cost, gradient: "chartCost" },
    { key: "profit", label: "Resultado líquido", value: (row: Group) => row.profit, color: colors.profit, gradient: "chartProfit" },
  ];
  const isVisible = (key: string) => !hidden.includes(key);
  const toggle = (key: string) => setHidden((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const linePath = (value: (row: Group) => number) => visible.map((row, index) => (index ? "L" : "M") + " " + x(index) + " " + yCount(value(row))).join(" ");

  // Motor de posicionamento: mede caixas de texto e procura posições alternativas
  // antes de renderizar. Prioriza rótulos financeiros e distribui os rótulos das linhas
  // acima/abaixo/laterais dos pontos, sem permitir colisões entre textos.
  type LabelBox = { x: number; y: number; w: number; h: number };
  const placedLabelBoxes: LabelBox[] = [];
  const labelPositions = new Map<string, { x: number; y: number }>();
  const overlaps = (a: LabelBox, b: LabelBox, gap = 3) =>
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  const clampLabel = (box: LabelBox) => ({
    x: Math.max(left + 2, Math.min(width - right - box.w - 2, box.x)),
    y: Math.max(top + 2, Math.min(top + plotHeight - box.h - 2, box.y)),
  });
  const lineSegments = series.filter((item) => isVisible(item.key)).flatMap((item) =>
    visible.slice(0, -1).map((row, index) => ({
      x1: x(index), y1: yCount(item.value(row)),
      x2: x(index + 1), y2: yCount(item.value(visible[index + 1])),
    }))
  );
  const pointObstacles = series.filter((item) => isVisible(item.key)).flatMap((item) =>
    visible.map((row, index) => ({ x: x(index), y: yCount(item.value(row)) }))
      .filter((point) => Number.isFinite(point.y))
  );
  const distanceToSegment = (px: number, py: number, seg: {x1:number;y1:number;x2:number;y2:number}) => {
    const dx = seg.x2 - seg.x1, dy = seg.y2 - seg.y1;
    const t = Math.max(0, Math.min(1, ((px-seg.x1)*dx+(py-seg.y1)*dy)/(dx*dx+dy*dy || 1)));
    return Math.hypot(px-(seg.x1+t*dx), py-(seg.y1+t*dy));
  };
  const collidesWithLine = (box: LabelBox) => lineSegments.some((seg) => {
    const samples = 5;
    return Array.from({length:samples+1},(_,n)=>n/samples).some((t) => {
      const px=seg.x1+(seg.x2-seg.x1)*t, py=seg.y1+(seg.y2-seg.y1)*t;
      return px >= box.x-3 && px <= box.x+box.w+3 && py >= box.y-3 && py <= box.y+box.h+3 &&
        distanceToSegment(px,py,seg) < 8;
    });
  });
  const registerLabel = (key: string, anchorX: number, anchorY: number, text: string, kind: "bar" | "line") => {
    const w = Math.max(18, text.length * (kind === "bar" ? 4.7 : 5.1));
    const h = 12;
    const offsets = kind === "bar"
      ? [[-w/2,-16],[-w/2,-29],[-w/2,5],[-w/2,18],[-w/2-10,-16],[-w/2+10,-29],[-w/2-18,5],[-w/2+18,18]]
      : [[-w/2,-20],[-w/2,12],[-w/2-18,-8],[18,-8],[-w/2,-34],[-w/2,26],[-w/2-28,10],[28,10]];
    let selected: {x:number;y:number} | null = null;
    for (const [dx,dy] of offsets) {
      const candidate = clampLabel({x:anchorX+dx,y:anchorY+dy,w,h});
      const box = {...candidate,w,h};
      const textCollision = placedLabelBoxes.some((other) => overlaps(box,other,4));
      const pointCollision = kind === "line" && pointObstacles.some((p) =>
        Math.hypot(p.x-(box.x+w/2),p.y-(box.y+h/2)) < 12
      );
      if (!textCollision && !pointCollision && !collidesWithLine(box)) { selected=candidate; break; }
    }
    // Se nenhuma posição estiver livre, omite somente esse rótulo (o valor exato
    // continua no tooltip), em vez de desenhar texto por cima de outro elemento.
    if (!selected) return;
    // O SVG usa textAnchor="middle": converte a caixa (canto superior esquerdo)
    // em ponto central para alinhar o texto exatamente ao centro da coluna/ponto.
    labelPositions.set(key,{x:selected.x+w/2,y:selected.y+h-2});
    placedLabelBoxes.push({...selected,w,h});
  };
  visible.forEach((row,index) => financial.forEach((item,itemIndex) => {
    if (!isVisible(item.key)) return;
    const value=item.value(row);
    if (!value) return;
    const groupWidth=Math.min(96,plotWidth/visible.length*.78);
    const barWidth=groupWidth/3;
    const barX=x(index)-groupWidth/2+itemIndex*barWidth;
    const valueY=yMoney(value);
    const text=new Intl.NumberFormat("pt-BR",{notation:"compact",maximumFractionDigits:2}).format(value);
    registerLabel("bar:"+index+":"+item.key,barX+(barWidth-4)/2,valueY,text,"bar");
  }));
  series.forEach((item) => {
    if (!isVisible(item.key)) return;
    visible.forEach((row,index) => {
      const count=item.value(row);
      if (!count || plotWidth/visible.length<116) return;
      registerLabel("line:"+index+":"+item.key,x(index),yCount(count),
        numbers.format(count),"line");
    });
  });

  return <div className="unified-chart">
    <section className="chart-key-panel report-chart-legend" aria-label="Legenda e instruções do gráfico">
      <header className="report-chart-legend__header">
        <div>
          <strong className="report-chart-legend__title">Legenda do gráfico</strong>
          <p className="report-chart-legend__intro">Cada cor identifica uma informação. As colunas mostram dinheiro; as linhas mostram quantidade de vendas.</p>
        </div>
        <span className="report-chart-legend__hint">Clique em uma legenda para ocultar ou exibir</span>
      </header>
      <div className="report-chart-legend__groups">
        <section className="report-chart-legend__group" aria-label="Séries financeiras">
          <h3 className="report-chart-legend__eyebrow">COLUNAS · EIXO ESQUERDO · VALORES EM R$</h3>
          <div className="report-chart-legend__items">
            {financial.map((item) => <button key={item.key} type="button" className={"chart-legend-item report-chart-legend__item" + (isVisible(item.key) ? "" : " is-muted")} aria-pressed={isVisible(item.key)} onClick={() => toggle(item.key)} style={{ "--legend-color": item.color } as CSSProperties}>
              <span aria-hidden="true" className="report-chart-legend__swatch report-chart-legend__swatch--bar" />
              <span className="report-chart-legend__copy"><strong>{item.label}</strong><small>{item.key === "revenue" ? "Total bruto vendido no período" : item.key === "cost" ? "Soma dos custos das vendas" : "Faturamento menos custos"}</small></span>
              <span className="report-chart-legend__state">{isVisible(item.key) ? "VISÍVEL" : "OCULTA"}</span>
            </button>)}
          </div>
        </section>
        <section className="report-chart-legend__group" aria-label="Séries de quantidade">
          <h3 className="report-chart-legend__eyebrow">LINHAS E PONTOS · EIXO DIREITO · QUANTIDADE</h3>
          <div className="report-chart-legend__items">
            {series.map((item) => <button key={item.key} type="button" className={"chart-legend-item report-chart-legend__item" + (isVisible(item.key) ? "" : " is-muted")} aria-pressed={isVisible(item.key)} onClick={() => toggle(item.key)} style={{ "--legend-color": item.color } as CSSProperties}>
              <span aria-hidden="true" className="report-chart-legend__swatch report-chart-legend__swatch--line"><i /></span>
              <span className="report-chart-legend__copy"><strong>{item.label}</strong><small>{item.key === "completed" ? "Vendas com status concluído" : item.key === "excluded" ? "Canceladas ou não concluídas" : "Registros que precisam de revisão"}</small></span>
              <span className="report-chart-legend__state">{isVisible(item.key) ? "VISÍVEL" : "OCULTA"}</span>
            </button>)}
          </div>
        </section>
      </div>
      <footer className="report-chart-legend__reading-guide">
        <p><strong>Como ler as colunas:</strong> em cada período, as três colunas coloridas representam faturamento, custos e resultado líquido. A altura corresponde ao valor em reais.</p>
        <p><strong>Como ler as linhas:</strong> cada linha liga os pontos da mesma situação ao longo dos períodos. O ponto indica quantos registros existem naquela situação.</p>
        <p><strong>Eixos e períodos:</strong> escala esquerda = dinheiro (R$); escala direita = quantidade de registros. O nome abaixo identifica o mês ou ano analisado.</p>
      </footer>
    </section>
    <div className="unified-chart-scroll report-chart-scroll" role="region" aria-label="Gráfico com rolagem horizontal; use Shift e a roda do mouse ou a barra inferior para navegar" tabIndex={0}>
      <svg role="img" aria-label="Gráfico combinado de faturamento, custos, resultado e quantidade de registros por período" viewBox={"0 0 " + width + " " + height} className="unified-chart-svg" style={{ width: width + "px", minWidth: width + "px" }} onMouseLeave={() => setHoveredRow(null)}>
        <defs>
          <linearGradient id="chartRevenue" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colors.revenue} stopOpacity=".96"/><stop offset="100%" stopColor={colors.revenue} stopOpacity=".62"/></linearGradient>
          <linearGradient id="chartCost" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colors.cost} stopOpacity=".96"/><stop offset="100%" stopColor={colors.cost} stopOpacity=".62"/></linearGradient>
          <linearGradient id="chartProfit" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colors.profit} stopOpacity=".96"/><stop offset="100%" stopColor={colors.profit} stopOpacity=".62"/></linearGradient>
          <filter id="chartPointShadow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity=".2"/></filter>
          <filter id="chartBarShadow" x="-50%" y="-30%" width="200%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity=".12"/></filter>
        </defs>
        <rect x={left} y={top} width={plotWidth} height={plotHeight} rx="12" fill="#f8fafc"/>
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = minMoney + (maxMoney - minMoney) * tick / 4;
          const y = yMoney(value);
          return <g key={tick}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke={Math.abs(value) < 0.0001 ? "#94a3b8" : "#e3eaf2"} strokeWidth={Math.abs(value) < 0.0001 ? 1.6 : 1} strokeDasharray={Math.abs(value) < 0.0001 ? undefined : "3 6"}/>
            <text x={left - 12} y={y + 4} textAnchor="end" className="chart-axis-label">{compactMoney(value)}</text>
            <text x={width - right + 12} y={y + 4} className="chart-axis-label">{Math.round(maxCount * tick / 4)}</text>
          </g>;
        })}
        <text x="16" y="19" className="chart-axis-caption">VALOR (R$)</text>
        <text x={width - 12} y="19" textAnchor="end" className="chart-axis-caption">REGISTROS</text>
        {visible.map((row, index) => {
          const center = x(index);
          const groupWidth = Math.min(96, plotWidth / visible.length * .78);
          const barWidth = groupWidth / 3;
          const base = yMoney(0);
          return <g key={row.label}>
            {financial.map((item, itemIndex) => {
              if (!isVisible(item.key)) return null;
              const value = item.value(row);
              const valueY = yMoney(value);
              const fill = item.key === "profit" && value < 0 ? "#df5b65" : "url(#" + item.gradient + ")";
              const barX = center - groupWidth / 2 + itemIndex * barWidth;
              const labelFits = plotWidth / visible.length >= 116 && barWidth >= 30 && Math.abs(value) > 0;
              const labelPosition = labelPositions.get("bar:" + index + ":" + item.key);
              const tinyValue = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 2 }).format(value);
              return <g key={item.key}>
                <rect x={barX} y={Math.min(valueY, base)} width={Math.max(2, barWidth - 4)} height={Math.max(1.5, Math.abs(base - valueY))} rx="4" fill={fill} className="chart-bar" filter="url(#chartBarShadow)" pointerEvents="none">
                  <title>{row.label}: {item.label} — {currency.format(value)}</title>
                </rect>
                {labelFits && labelPosition && isVisible(item.key) && <text
                  x={labelPosition.x}
                  y={labelPosition.y}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="750"
                  fill="#26384b"
                  stroke="#f8fafc"
                  strokeWidth="2.5"
                  paintOrder="stroke"
                  pointerEvents="none"
                  aria-hidden="true"
                >{tinyValue}</text>}
              </g>;
            })}
            <text x={center} y={height - 48} textAnchor="middle" className="chart-category-label">{row.label.length > 18 ? row.label.slice(0, 16) + "…" : row.label}</text>
            <text x={center} y={height - 27} textAnchor="middle" className="chart-category-count">{numbers.format(row.count)} registros</text>
          </g>;
        })}
        {series.map((item, seriesIndex) => isVisible(item.key) && <g key={item.key}>
          <path d={linePath(item.value)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="chart-series-line"/>
          {visible.map((row, index) => {
            const count = item.value(row);
            const pointY = yCount(count);
            // Só exibe rótulos quando há espaço entre os períodos; cada série recebe
            // um pequeno deslocamento horizontal para evitar que números se encostem.
            const showPointLabel = count > 0 && plotWidth / visible.length >= 116;
            const labelPosition = labelPositions.get("line:" + index + ":" + item.key);
            const labelX = labelPosition?.x ?? x(index);
            const labelY = labelPosition?.y ?? Math.max(top + 12, pointY - 19);
            return <g key={row.label}>
              {count > 0 && <circle cx={x(index)} cy={pointY} r="5.5" fill={item.color} stroke="#fff" strokeWidth="2.2" filter="url(#chartPointShadow)" pointerEvents="none">
                <title>{row.label}: {item.label} — {numbers.format(count)} registros</title>
              </circle>}
              {showPointLabel && labelPosition && <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                fontSize="8"
                fontWeight="800"
                fill={item.color}
                stroke="#f8fafc"
                strokeWidth="2.8"
                paintOrder="stroke"
                pointerEvents="none"
                aria-hidden="true"
              >{numbers.format(count)}</text>}
            </g>;
          })}
        </g>)}
        {visible.map((row, index) => <rect
          key={"hover-" + row.label}
          x={left + index * (plotWidth / visible.length)}
          y={top}
          width={plotWidth / visible.length}
          height={plotHeight}
          fill="transparent"
          pointerEvents="all"
          tabIndex={0}
          role="button"
          aria-label={"Ver resumo de " + row.label}
          onMouseEnter={() => setHoveredRow(row)}
          onMouseMove={(event) => {
            const cardWidth = 340;
            const cardHeight = 300;
            setHoverPosition({
              x: Math.max(12, Math.min(event.clientX + 18, window.innerWidth - cardWidth - 12)),
              y: Math.max(12, Math.min(event.clientY + 18, window.innerHeight - cardHeight - 12)),
            });
          }}
          onFocus={() => setHoveredRow(row)}
          onBlur={() => setHoveredRow(null)}
        />)}
      </svg>
    </div>
    {hoveredRow && typeof document !== "undefined" && createPortal(
      <div className="chart-hover-tooltip" role="status" aria-live="polite" style={{ left: hoverPosition.x, top: hoverPosition.y }}>
        <div className="chart-hover-tooltip__eyebrow">RESUMO DO PERÍODO</div>
        <div className="chart-hover-tooltip__heading">{hoveredRow.label}</div>
        <div className="chart-hover-tooltip__grid">
          <div><span><i style={{ background: colors.revenue }} />Faturamento</span><strong>{currency.format(hoveredRow.revenue)}</strong></div>
          <div><span><i style={{ background: colors.cost }} />Custos</span><strong>{currency.format(hoveredRow.cost)}</strong></div>
          <div><span><i style={{ background: colors.profit }} />Resultado líquido</span><strong>{currency.format(hoveredRow.profit)}</strong></div>
          <div><span><i style={{ background: colors.completed }} />Concluídas</span><strong>{numbers.format(hoveredRow.completedCount)}</strong></div>
          <div><span><i style={{ background: colors.excluded }} />Não concluídas</span><strong>{numbers.format(hoveredRow.excludedCount ?? 0)}</strong></div>
          <div><span><i style={{ background: colors.review }} />Em revisão</span><strong>{numbers.format(hoveredRow.reviewCount ?? 0)}</strong></div>
          <div><span><i style={{ background: "#64748b" }} />Total de registros</span><strong>{numbers.format(hoveredRow.count)}</strong></div>
        </div>
      </div>,
      document.body
    )}
    <details className="chart-data-details">
      <summary>Consultar valores exatos por período</summary>
      <div className="chart-data-table-scroll report-data-scroll">
        <table className="chart-data-table report-chart-data-table">
          <colgroup><col style={{ width: 150 }} /><col style={{ width: 175 }} /><col style={{ width: 145 }} /><col style={{ width: 195 }} /><col style={{ width: 155 }} /><col style={{ width: 185 }} /><col style={{ width: 155 }} /><col style={{ width: 165 }} /></colgroup><thead><tr><th>Período</th><th>Faturamento</th><th>Custos</th><th>Resultado líquido</th><th>Concluídas</th><th>Não concluídas</th><th>Em revisão</th><th>Total de registros</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.label}>
            <th scope="row">{row.label}</th><td>{currency.format(row.revenue)}</td><td>{currency.format(row.cost)}</td><td>{currency.format(row.profit)}</td><td>{numbers.format(row.completedCount)}</td><td>{numbers.format(row.excludedCount ?? 0)}</td><td>{numbers.format(row.reviewCount ?? 0)}</td><td>{numbers.format(row.count)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>
    <div className="unified-chart-footnote"><span className="chart-footnote-dot" /> Os valores financeiros são exibidos nas barras e as quantidades nas linhas. Consulte a tabela abaixo para conferir os totais exatos de cada período.</div>
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
      const group = map.get(label) ?? { label, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.treatment === "Não concluída") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.completed) { group.completedCount += 1; group.revenue += row.revenue; group.cost += row.cost; }
      if (row.completed) group.profit += row.profit;
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
      const group = grouped.get(label) ?? { label, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 };
      group.count += 1;
      if (row.treatment === "Não concluída") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.completed) {
        group.completedCount += 1;
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
  const modelRanking = useMemo(() => { const totals = new Map<string, number>(); filteredRows.filter((row) => row.completed).forEach((row) => totals.set(textValue(row.model), (totals.get(textValue(row.model)) ?? 0) + row.revenue)); return [...totals.entries()].map(([label, revenue]) => ({ label, revenue })).sort((a,b) => b.revenue-a.revenue).slice(0,5); }, [filteredRows]);
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
        label, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0,
        revenue: 0, cost: 0, profit: 0,
      };
      group.count += 1;
      if (row.treatment === "Não concluída") group.excludedCount = (group.excludedCount ?? 0) + 1;
      if (row.treatment === "Revisar") group.reviewCount = (group.reviewCount ?? 0) + 1;
      if (row.completed) {
        group.completedCount += 1;
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
        completedCount: acc.completedCount + month.completedCount,
        excludedCount: (acc.excludedCount ?? 0) + (month.excludedCount ?? 0),
        reviewCount: (acc.reviewCount ?? 0) + (month.reviewCount ?? 0),
        revenue: acc.revenue + month.revenue,
        cost: acc.cost + month.cost,
        profit: acc.profit + month.profit,
      }), { label: year, count: 0, completedCount: 0, excludedCount: 0, reviewCount: 0, revenue: 0, cost: 0, profit: 0 } as Group);
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
        <section aria-label="Filtros dos gráficos e relatórios" className="report-filter-panel">
          <div className="report-filter-heading">
            <div className="report-filter-copy"><h2>Filtros de análise</h2><p>Aplicados aos gráficos, rankings e relatórios detalhados.</p></div>
            <span className="report-filter-count"><strong>{numbers.format(filteredRows.length)}</strong> de {numbers.format(rows.length)} registros</span>
          </div>
          <div className="report-filter-grid">
            <label className="report-control-label">Data inicial<input className="report-control-input" type="date" value={chartDateFrom} max={chartDateTo || undefined} onChange={(e) => setChartDateFrom(e.target.value)} /></label>
            <label className="report-control-label">Data final<input className="report-control-input" type="date" value={chartDateTo} min={chartDateFrom || undefined} onChange={(e) => setChartDateTo(e.target.value)} /></label>
            <label className="report-control-label">Modelo do certificado<select className="report-control-input" value={chartModel} onChange={(e) => setChartModel(e.target.value)}><option value="all">Todos os modelos</option>{modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
            <label className="report-control-label">Situação financeira<select className="report-control-input" value={chartTreatment} onChange={(e) => setChartTreatment(e.target.value)}><option value="all">Todas as situações</option><option value="Concluída">Concluídas</option><option value="Não concluída">Não concluídas</option><option value="Revisar">A revisar</option></select></label>
          </div>
          <div><button className="button button--secondary button--small" type="button" onClick={() => { setChartDateFrom(""); setChartDateTo(""); setChartModel("all"); setChartTreatment("all"); setSearch(""); }}>Limpar filtros</button></div>
        </section>
        <section aria-label="Indicadores financeiros" className="report-kpi-grid">
          {[
            { label: "Registros de clientes", value: numbers.format(filteredSummary.count), note: `${numbers.format(filteredSummary.completedCount)} incluídos no financeiro (exceto cancelados e não concluídos)`, tone: "navy" },
            { label: "Faturamento contabilizado", value: currency.format(filteredSummary.revenue), note: "Soma apenas os registros classificados para o cálculo financeiro", tone: "positive" },
            { label: "Custos contabilizados", value: currency.format(filteredSummary.cost), note: "Custos dos registros contabilizados", tone: "warning" },
            { label: "Valor líquido estimado", value: currency.format(filteredSummary.profit), note: "Faturamento bruto menos custos dos registros contabilizados", tone: filteredSummary.profit >= 0 ? "profit-positive" : "profit-negative" },
            { label: "Ticket médio", value: currency.format(filteredSummary.completedCount ? filteredSummary.revenue / filteredSummary.completedCount : 0), note: "Faturamento por registro contabilizado", tone: "teal" },
            { label: "Aguardando revisão", value: numbers.format(filteredSummary.reviewCount), note: "Status ausente em planilhas de 2026 ou posteriores; confira pendências financeiras nos detalhes", tone: "muted" },
            { label: "Datas divergentes/ausentes", value: numbers.format(filteredRows.filter((row) => row.dateIssue).length), note: "Data vazia ou fora do mês/ano da pasta", tone: "warning" },
          ].map((item) => <article key={item.label} className={`report-kpi-card report-kpi-card--${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong><small>{item.note}</small></article>)}
        </section>
        <section aria-labelledby="unified-chart-title" className="report-chart-panel">
          <div className="report-chart-heading">
            <div className="report-chart-heading-copy"><p className="eyebrow">VISÃO CONSOLIDADA</p><h2 id="unified-chart-title">Desempenho financeiro e comercial</h2><p>Anos anteriores consolidados por ano; o ano atual detalhado mês a mês, com valores exibidos diretamente nas barras e nos pontos das linhas.</p></div>
            <span className="report-chart-record-count">{numbers.format(filteredRows.length)} registros no filtro</span>
          </div>
          <UnifiedChart rows={monthlyChart}/>
          {modelRanking.length > 0 && <div className="report-model-ranking">
            <h3 className="report-model-ranking-title">Modelos com maior faturamento</h3>
            <div className="report-model-ranking-grid">
              {modelRanking.map((item,index)=><div key={item.label} className="report-model-ranking-item"><span className="report-model-ranking-label">{index+1}. {item.label}</span><strong className="report-model-ranking-value">{currency.format(item.revenue)}</strong></div>)}
            </div>
          </div>}
        </section>
        <section className="report-details-panel">
          <div className="report-details-header"><div className="report-details-copy"><h2>Relatórios detalhados</h2><p>Clique em qualquer linha para abrir os registros que formam aquele total.</p></div><div className="report-details-controls"><label className="report-control-label report-details-control">Tipo de relatório<select className="report-control-input" value={dimension} onChange={(e) => { setDimension(e.target.value as ReportDimension); setSelectedLabel(null); setSearch(""); }}><option value="period">Por período</option><option value="model">Por modelo</option><option value="status">Por status</option></select></label>{dimension === "period" && <label className="report-control-label report-details-control">Intervalo<select className="report-control-input" value={granularity} onChange={(e) => { setGranularity(e.target.value as Granularity); setSelectedLabel(null); }}><option value="month">Mensal</option><option value="week">Semanal</option><option value="year">Anual</option></select></label>}<label className="report-control-label report-details-control report-details-search">Pesquisar grupo<input className="report-control-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para pesquisar…" /></label></div></div>
          <div className="report-details-meta"><span><strong>{filteredGroups.length}</strong> grupos · <strong style={{ color: "#10233f" }}>{rows.length}</strong> registros detalhados</span><span>{numbers.format(filteredSummary.excludedCount)} não concluídos · {numbers.format(filteredSummary.reviewCount)} para revisar · {numbers.format(filteredRows.filter((row) => row.dateIssue).length)} datas divergentes/ausentes · {numbers.format(summary.rowsIgnored)} linhas vazias/totalizadoras ignoradas</span></div>
          <div className="report-details-table-scroll"><table className="records-table report-table report-groups-table"><thead><tr><th>{dimensionLabels[dimension]}</th><th className="numeric-cell">Registros</th><th className="numeric-cell">Concluídos</th><th className="numeric-cell">Faturamento</th><th className="numeric-cell">Custos</th><th className="numeric-cell">Valor líquido</th><th>Abrir</th></tr></thead><tbody>{useYearGrouping ? monthlyYearGroups.map(({ year, months, total }) => <Fragment key={year}>
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
              <td className="numeric-cell">{numbers.format(total.completedCount)}</td>
              <td className="numeric-cell">{currency.format(total.revenue)}</td>
              <td className="numeric-cell">{currency.format(total.cost)}</td>
              <td className={`numeric-cell report-profit-cell ${total.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(total.profit)}</td>
              <td><span className="report-group-action-label">{expandedReportYears.includes(year) ? "Ocultar meses" : "Ver meses"}</span></td>
            </tr>
            {expandedReportYears.includes(year) && months.map((group) => <tr key={group.label} onClick={() => { setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }} onKeyDown={(e) => { if (e.key === "Enter") setSelectedLabel(group.label); }} tabIndex={0} role="button" aria-label={`Abrir detalhes de ${group.label}`} className="report-group-row report-group-row--month">
              <td className="report-group-month-label">↳ {group.label}</td>
              <td className="numeric-cell">{numbers.format(group.count)}</td>
              <td className="numeric-cell">{numbers.format(group.completedCount)}</td>
              <td className="numeric-cell">{currency.format(group.revenue)}</td>
              <td className="numeric-cell">{currency.format(group.cost)}</td>
              <td className={`numeric-cell report-profit-cell ${group.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(group.profit)}</td>
              <td><button type="button" className="button button--secondary button--small" onClick={(e) => { e.stopPropagation(); setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }}>Ver vendas</button></td>
            </tr>)}
          </Fragment>) : filteredGroups.map((group) => <tr key={group.label} onClick={() => { setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }} onKeyDown={(e) => { if (e.key === "Enter") setSelectedLabel(group.label); }} tabIndex={0} role="button" aria-label={`Abrir detalhes de ${group.label}`} className="report-group-row"><td className="report-group-label">{group.label}</td><td className="numeric-cell">{numbers.format(group.count)}</td><td className="numeric-cell">{numbers.format(group.completedCount)}</td><td className="numeric-cell">{currency.format(group.revenue)}</td><td className="numeric-cell">{currency.format(group.cost)}</td><td className={`numeric-cell report-profit-cell ${group.profit >= 0 ? "is-positive" : "is-negative"}`}>{currency.format(group.profit)}</td><td><button type="button" className="button button--secondary button--small" onClick={(e) => { e.stopPropagation(); setSelectedLabel(group.label); setDetailSearch(""); setStatusFilter("all"); }}>Ver vendas</button></td></tr>)}{!filteredGroups.length && <tr><td colSpan={7} className="report-table-empty">Nenhum grupo corresponde à pesquisa.</td></tr>}</tbody><tfoot>{filteredGroups.length > 0 && <tr className="report-groups-total-row"><td>Total exibido</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.count, 0))}</td><td className="numeric-cell">{numbers.format(filteredGroups.reduce((n, g) => n + g.completedCount, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.revenue, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.cost, 0))}</td><td className="numeric-cell">{currency.format(filteredGroups.reduce((n, g) => n + g.profit, 0))}</td><td /></tr>}</tfoot></table></div>
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
            {[{ label: "Vendas concluídas", value: numbers.format(selectedRows.filter((r) => r.completed).length) }, { label: "Faturamento bruto", value: currency.format(selectedRows.reduce((n, r) => n + r.revenue, 0)) }, { label: "Custos", value: currency.format(selectedRows.reduce((n, r) => n + r.cost, 0)) }, { label: "Valor líquido", value: currency.format(selectedRows.reduce((n, r) => n + r.profit, 0)) }].map((item) => <div key={item.label} className="report-detail-kpi"><span>{item.label}</span><strong>{item.value}</strong></div>)}
          </div>
          <div className="report-detail-toolbar">
            <input className="report-detail-search" value={detailSearch} onChange={(e) => setDetailSearch(e.target.value)} placeholder="Pesquisar cliente, contato, modelo ou status…" />
            <select className="report-detail-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Todas as situações</option><option value="Concluída">Concluídas</option><option value="Não concluída">Não concluídas</option><option value="Revisar">A revisar</option>
            </select>
            <button className="button button--secondary button--small" type="button" onClick={() => {
              const headers = ["Cliente","Contato","Data","Modelo","Status","Situação financeira","Data divergente/ausente","Valor financeiro ausente","Faturamento bruto","Custo","Valor líquido"];
              const body = selectedRows.map((r) => [r.client,r.contact,r.date,r.model,r.status,r.treatment,r.dateIssue ? "Sim" : "Não",r.financialIssue ? "Sim" : "Não",r.revenue.toFixed(2),r.cost.toFixed(2),r.profit.toFixed(2)]);
              const csv = [headers,...body].map((line) => line.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\r\n");
              const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
              const a = document.createElement("a"); a.href = url; a.download = `detalhamento-${selectedLabel.replace(/[^a-z0-9]+/gi,"-").toLowerCase()}.csv`; a.click(); URL.revokeObjectURL(url);
            }}>Exportar detalhes CSV</button>
          </div>
          <div className="report-detail-table-wrap">
            <table className="records-table report-table report-detail-table">
              <thead><tr><th>Cliente</th><th>Data emissão/renovação</th><th>Modelo</th><th>Status</th><th>Situação</th><th>Qualidade dos dados</th><th className="numeric-cell">Faturamento bruto</th><th className="numeric-cell">Custo</th><th className="numeric-cell">Valor líquido</th></tr></thead>
              <tbody>
                {selectedRows.map((row) => <tr key={row.id}>
                  <td className="report-detail-client">{row.client}</td><td>{row.date}</td><td>{textValue(row.model)}</td>
                  <td><span className={`sale-status-badge ${saleStatusClass(row.status)}`}>{saleStatusLabel(row.status)}</span></td>
                  <td><span className={`report-treatment-badge ${row.treatment === "Concluída" ? "report-treatment--complete" : row.treatment === "Revisar" ? "report-treatment--review" : "report-treatment--pending"}`}>{row.treatment}</span></td>
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
