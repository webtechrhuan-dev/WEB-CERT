export type SaleStatus = "Cancelado" | "não concluido" | "Emitido" | "Pendente instalar" | "Instalado" | "Concluido";

const STATUS_CLASS: Record<SaleStatus, string> = {
  "Cancelado": "sale-status--cancelado",
  "não concluido": "sale-status--nao-concluido",
  "Emitido": "sale-status--emitido",
  "Pendente instalar": "sale-status--pendente",
  "Instalado": "sale-status--instalado",
  "Concluido": "sale-status--concluido",
};

function normalizeText(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function normalizeSaleStatus(value: string): SaleStatus | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return (Object.keys(STATUS_CLASS) as SaleStatus[]).find((status) => normalizeText(status) === normalized) ?? null;
}

export function saleStatusClass(value: string): string {
  const status = normalizeSaleStatus(value);
  return status ? STATUS_CLASS[status] : "sale-status--unknown";
}

export function saleStatusLabel(value: string): string {
  return normalizeSaleStatus(value) ?? (value.trim() || "Sem status");
}

export const SALE_STATUS_LEGEND: { label: SaleStatus; className: string; description: string }[] = [
  { label: "Emitido", className: STATUS_CLASS.Emitido, description: "Certificado emitido." },
  { label: "Pendente instalar", className: STATUS_CLASS["Pendente instalar"], description: "Aguardando instalação." },
  { label: "Instalado", className: STATUS_CLASS.Instalado, description: "Instalação realizada." },
  { label: "Concluido", className: STATUS_CLASS.Concluido, description: "Processo concluído." },
  { label: "não concluido", className: STATUS_CLASS["não concluido"], description: "Processo não finalizado." },
  { label: "Cancelado", className: STATUS_CLASS.Cancelado, description: "Venda cancelada." },
];
