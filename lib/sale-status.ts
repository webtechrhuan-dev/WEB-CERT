export type SaleStatus = "Cancelado" | "não concluido" | "Emitido" | "Pendente instalar" | "Instalado" | "Concluido";

const STATUS_CLASS: Record<SaleStatus, string> = {
  "Cancelado": "status-cancelado",
  "não concluido": "status-nao-concluido",
  "Emitido": "status-emitido",
  "Pendente instalar": "status-pendente-instalar",
  "Instalado": "status-instalado",
  "Concluido": "status-concluido",
};

export function normalizeSaleStatus(value: string): SaleStatus | null {
  const normalized = value.trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!normalized) return null;
  const found = (Object.keys(STATUS_CLASS) as SaleStatus[]).find((status) =>
    status.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLocaleLowerCase("pt-BR") === normalized
  );
  return found ?? null;
}

export function saleStatusClass(value: string): string {
  const status = normalizeSaleStatus(value);
  return status ? STATUS_CLASS[status] : "status-sem-definicao";
}

export function saleStatusLabel(value: string): string {
  return normalizeSaleStatus(value) ?? (value.trim() || "Sem status");
}

export const SALE_STATUS_LEGEND: { label: SaleStatus; className: string; description: string }[] = [
  { label: "Emitido", className: STATUS_CLASS.Emitido, description: "Certificado emitido." },
  { label: "Pendente instalar", className: STATUS_CLASS["Pendente instalar"], description: "Aguardando instalação." },
  { label: "Instalado", className: STATUS_CLASS.Instalado, description: "Certificado instalado." },
  { label: "Concluido", className: STATUS_CLASS.Concluido, description: "Processo concluído." },
  { label: "não concluido", className: STATUS_CLASS["não concluido"], description: "Processo ainda não concluído." },
  { label: "Cancelado", className: STATUS_CLASS.Cancelado, description: "Venda cancelada." },
];
