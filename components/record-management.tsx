"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Icon } from "@/components/icon";
import { useWorkbookData } from "@/lib/client/use-workbook-data";
import { WORKBOOK_HEADERS } from "@/lib/workbook-types";
import type { WorkbookCell, WorkbookRecord } from "@/lib/workbook-types";

type ManagementMode = "create" | "edit";
type FormValues = Record<string, string>;

const numberFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function valueAsText(value: WorkbookCell | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    return value.parsed ?? String(value.raw);
  }
  return String(value);
}

function apiErrorMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return null;
  }
  const error = value.error;
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : null;
}

const PERIOD_FIELDS = ["Ano da planilha", "Mês da planilha"] as const;
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function normalizeMonth(value: string): string {
  const normalized = value.trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").replace(/\\s+/g, " ").toLocaleLowerCase("pt-BR");
  return MONTH_NAMES.find((month) => month.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "") === normalized) ?? normalized;
}

function availableYears(): string[] {
  const currentYear = Number(currentPeriod().year);
  return Array.from({ length: Math.max(0, currentYear - 2024 + 1) }, (_, index) => String(currentYear - index));
}

function currentPeriod(): { year: string; month: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? String(new Date().getFullYear());
  const monthNumber = Number(parts.find((part) => part.type === "month")?.value ?? new Date().getMonth() + 1);
  return { year, month: MONTH_NAMES[monthNumber - 1] ?? MONTH_NAMES[0] };
}

function expiryFromIssueDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const expiryYear = year + 1;
  const lastDay = new Date(Date.UTC(expiryYear, month, 0)).getUTCDate();
  return [expiryYear, String(month).padStart(2, "0"), String(Math.min(day, lastDay)).padStart(2, "0")].join("-");
}
function formValues(record?: WorkbookRecord): FormValues {
  const values = Object.fromEntries(
    WORKBOOK_HEADERS.map((header, index) => [header, valueAsText(record?.values[index])]),
  );
  if (!record) {
    const period = currentPeriod();
    values["Ano da planilha"] = period.year;
    values["Mês da planilha"] = period.month;
    // Todo registro cadastrado nesta tela representa uma venda já fechada.
    // Mantém o campo legado preenchido internamente para compatibilidade com os relatórios.
    values["Status / Observação"] = "Concluído";
  }
  return values;
}

function RecordForm({
  mode,
  record,
  version,
  onSaved,
}: {
  mode: ManagementMode;
  record?: WorkbookRecord;
  version: string;
  onSaved: (message: string) => void;
}) {
  const initialValues = useMemo(() => formValues(record), [record]);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const changes = Object.fromEntries(
      WORKBOOK_HEADERS
        .filter((header) => mode === "create" || values[header] !== initialValues[header])
        .map((header) => [header, values[header] === "" ? null : values[header]]),
    );
    if (Object.keys(changes).length === 0) {
      setError("Altere pelo menos um campo antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        mode === "create" ? "/api/records" : `/api/records/${record?.rowNumber}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedVersion: version, values: changes }),
        },
      );
      const body: unknown = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setConflict(true);
        }
        throw new Error(apiErrorMessage(body) ?? "Não foi possível salvar a alteração.");
      }
      onSaved(
        mode === "create"
          ? "Registro cadastrado com sucesso na base de dados."
          : "Registro atualizado com sucesso na base de dados.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a alteração.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="record-form" onSubmit={submit}>
      <div className="record-form-grid">
        {WORKBOOK_HEADERS.map((header) => {
          const periodField = PERIOD_FIELDS.includes(header as (typeof PERIOD_FIELDS)[number]);
          const yearField = header === "Ano da planilha";
          const monthField = header === "Mês da planilha";
          const dateField = header === "Data de emissão/renovação";
          const expiryField = header === "Data de vencimento";
          const moneyField =
            header === "Faturamento (R$)" || header === "Custo (R$)";
          return (
            <label className="record-form-field" key={header}>
              <span>{header}</span>
              {periodField ? (
                <select
                  value={values[header] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [header]: event.target.value,
                    }))
                  }
                >
                  <option value="">{yearField ? "Selecione o ano" : "Selecione o mês"}</option>
                  {yearField
                    ? availableYears().map((year) => <option key={year} value={year}>{year}</option>)
                    : MONTH_NAMES.map((month) => <option key={month} value={month}>{month.charAt(0).toLocaleUpperCase("pt-BR") + month.slice(1)}</option>)}
                </select>
              ) : dateField ? (
                <input autoComplete="off" type="date" value={values[header] ?? ""}
                  onChange={(event) => {
                    const issueDate = event.target.value;
                    setValues((current) => ({ ...current, [header]: issueDate, ["Data de vencimento"]: expiryFromIssueDate(issueDate) }));
                  }}
                />
              ) : expiryField ? (
                <input
                  type="date"
                  value={values[header] ?? ""}
                  readOnly
                  disabled={!values["Data de emissão/renovação"]}
                  aria-readonly="true"
                  title="Calculado automaticamente: um ano após a emissão."
                  style={{
                    opacity: 0.55,
                    cursor: "not-allowed",
                    backgroundColor: "var(--input-disabled-bg, #e5e7eb)",
                    color: "var(--input-disabled-color, #6b7280)",
                  }}
                />
              ) : header === "Status / Observação" ? (
                <input
                  autoComplete="off"
                  onChange={(event) => setValues((current) => ({ ...current, [header]: event.target.value }))}
                  placeholder="Ex.: Concluído, Pendente, Cancelado..."
                  type="text"
                  value={values[header] ?? ""}
                />
              ) : header === "Modelo" ? (
                <select
                  value={values[header] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [header]: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione o modelo</option>
                  <option value="CNPJ - A1">CNPJ - A1</option>
                  <option value="CPF - A1">CPF - A1</option>
                </select>
              ) : (
                <input
                  autoComplete="off"
                                    inputMode={moneyField ? "decimal" : undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [header]: event.target.value,
                    }))
                  }
                  placeholder={
                    dateField
                      ? "AAAA-MM-DD"
                      : moneyField
                        ? "Ex.: 1.250,00"
                        : "Opcional"
                  }
                  type="text"
                  value={values[header] ?? ""}
                />
              )}
            </label>
          );
        })}
      </div>
      <p className="form-help">
        Ano e mês podem ser selecionados em cada venda; o período atual aparece como padrão e as opções de ano começam em 2024 e avançam automaticamente com o calendário.
        O status/observação pode ser alterado nesta tela. A data de vencimento é calculada automaticamente para um ano após a emissão e não pode ser alterada manualmente. Valores monetários aceitam formato brasileiro ou decimal.
      </p>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {conflict && (
        <button
          className="button button--secondary button--small"
          onClick={() => window.location.reload()}
          type="button"
        >
          Recarregar versão atual
        </button>
      )}
      <div className="form-actions">
        <button className="button button--primary" disabled={saving} type="submit">
          {saving ? "Salvando…" : mode === "create" ? "Cadastrar registro" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}

function displayListValue(value: WorkbookCell | undefined, header: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    return value.parsed ?? String(value.raw);
  }
  if (typeof value === "number" && (header === "Faturamento (R$)" || header === "Custo (R$)")) {
    return numberFormat.format(value);
  }
  return String(value);
}

export function RecordManagement({ mode }: { mode: ManagementMode }) {
  const { data: session, status } = useSession();
  const { data, loading, error, refresh } = useWorkbookData(
    status === "authenticated",
  );
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const canEdit = session?.user.role === "editor";
  const canPersist = data?.source === "github" || data?.source === "mongodb";

  const periodIndexes = useMemo(() => ({
    year: data?.headers.indexOf("Ano da planilha") ?? -1,
    month: data?.headers.indexOf("Mês da planilha") ?? -1,
  }), [data]);
  const availableYearOptions = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.records.map((record) => valueAsText(record.values[periodIndexes.year])).filter(Boolean))]
      .sort((a, b) => Number(b) - Number(a));
  }, [data, periodIndexes]);
  const records = useMemo(() => {
    if (!data || !filterYear || !filterMonth) return [];
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.records.filter((record) => {
      const year = valueAsText(record.values[periodIndexes.year]);
      const month = normalizeMonth(valueAsText(record.values[periodIndexes.month]));
      if (year.trim() !== filterYear.trim() || month !== normalizeMonth(filterMonth)) return false;
      if (!query) return true;
      const clientIndex = data.headers.indexOf("Cliente");
      const clientName = valueAsText(record.values[clientIndex]).toLocaleLowerCase("pt-BR");
      return clientName.includes(query);
    });
  }, [data, filterYear, filterMonth, search, periodIndexes]);
  const yearIndexForGroup = data?.headers.indexOf("Ano da planilha") ?? -1;
  const monthIndexForGroup = data?.headers.indexOf("Mês da planilha") ?? -1;
  const groupedRecords = useMemo(() => {
    const groups = new Map<string, WorkbookRecord[]>();
    for (const record of records) {
      const year = valueAsText(record.values[yearIndexForGroup]) || "Sem ano";
      const rawMonth = valueAsText(record.values[monthIndexForGroup]) || "Sem mês";
      const month = rawMonth === "Sem mês" ? rawMonth : normalizeMonth(rawMonth);
      const key = `${year.trim()}||${month}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(record);
    }
    const monthOrder = new Map(MONTH_NAMES.map((month, index) => [month.toLocaleLowerCase("pt-BR"), index]));
    return [...groups.entries()].sort(([a], [b]) => {
      const [yearA, monthA] = a.split("||");
      const [yearB, monthB] = b.split("||");
      const yearDiff = (Number(yearB) || 0) - (Number(yearA) || 0);
      if (yearDiff) return yearDiff;
      return (monthOrder.get(monthA.toLocaleLowerCase("pt-BR")) ?? 99) - (monthOrder.get(monthB.toLocaleLowerCase("pt-BR")) ?? 99);
    });
  }, [records, yearIndexForGroup, monthIndexForGroup]);


  function handleSaved(message: string) {
    setSavedMessage(message);
    setSelectedRow(null);
    void refresh();
  }

  if (status === "loading" || loading) {
    return (
      <section className="state-panel" aria-busy="true">
        <span className="loading-spinner" aria-hidden="true" />
        <div className="state-copy"><h2>Carregando planilha</h2></div>
      </section>
    );
  }

  if (!session?.user) {
    return (
      <section className="state-panel state-panel--error">
        <span className="state-icon state-icon--error"><Icon name="lock" /></span>
        <div className="state-copy">
          <h2>Autenticação necessária</h2>
          <p>{error ?? "Entre com sua conta corporativa para continuar."}</p>
          <Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link>
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="state-panel state-panel--error">
        <span className="state-icon state-icon--error"><Icon name="alert" /></span>
        <div className="state-copy">
          <h2>Não foi possível carregar a planilha</h2>
          <p>{error ?? "Atualize a página para tentar novamente."}</p>
          <button className="button button--secondary button--small" onClick={() => void refresh()} type="button">Tentar novamente</button>
        </div>
      </section>
    );
  }

  return (
    <div className="management-content">
      {!canEdit && (
        <div className="access-notice" role="status">
          Sua conta tem acesso de consulta. Peça ao administrador para incluir seu e-mail
          na lista de editores para cadastrar ou alterar registros.
        </div>
      )}
      {canEdit && !canPersist && (
        <div className="access-notice" role="status">
          A leitura está usando o arquivo local. Configure a integração GitHub no servidor
          antes de cadastrar ou editar; esta aplicação não grava no disco local.
        </div>
      )}
      {savedMessage && <p className="form-message form-message--success" role="status">{savedMessage}</p>}
      {mode === "create" ? (
        <section className="content-panel">
          <div className="panel-heading">
            <div><h2>Novo registro</h2><p>Os dados serão salvos na base de dados conectada ao sistema.</p></div>
            <span className="record-count">{data.count} registros atuais</span>
          </div>
          {canEdit && canPersist ? (
            <RecordForm key={`create-${data.version}`} mode="create" version={data.version ?? ""} onSaved={handleSaved} />
          ) : (
            <p className="empty-state">
              {canEdit
                ? "O formulário será habilitado quando a fonte estiver configurada no GitHub."
                : "Cadastro disponível apenas para usuários autorizados como editores."}
            </p>
          )}
        </section>
      ) : (
        <section className="content-panel">
          <div className="panel-heading">
            <div><h2>Gestão de vendas</h2><p>Selecione o ano e o mês para exibir somente as vendas do período escolhido.</p></div>
            <span className="record-count">{filterYear && filterMonth ? `${records.length} vendas` : `${data.count} registros disponíveis`}</span>
          </div>
          <div className="period-filter-bar">
            <label className="record-form-field">
              <span>Ano</span>
              <select value={filterYear} onChange={(event) => { setFilterYear(event.target.value); setSearch(""); setSelectedRow(null); }}>
                <option value="">Selecione o ano</option>
                {availableYearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="record-form-field">
              <span>Mês</span>
              <select value={filterMonth} onChange={(event) => { setFilterMonth(event.target.value); setSearch(""); setSelectedRow(null); }}>
                <option value="">Selecione o mês</option>
                {MONTH_NAMES.map((month) => <option key={month} value={month}>{month.charAt(0).toLocaleUpperCase("pt-BR") + month.slice(1)}</option>)}
              </select>
            </label>
            <button className="button button--secondary button--small period-filter-clear" onClick={() => { setFilterYear(""); setFilterMonth(""); setSearch(""); setSelectedRow(null); }} type="button">Limpar filtros</button>
          </div>
          {filterYear && filterMonth && (
            <label className="search-field management-search">
              <span className="search-label">Buscar venda pelo nome do cliente</span>
              <span className="search-control">
                <Icon name="search" className="search-icon" />
                <input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedRow(null); }} placeholder="Digite o nome do cliente..." type="search" />
              </span>
            </label>
          )}
          {!filterYear || !filterMonth ? (
            <p className="period-filter-empty">Selecione um ano e um mês para carregar as vendas. Nenhum registro será exibido antes disso.</p>
          ) : (
          <div className="record-picker record-picker--grouped">
            {records.length === 0 ? (
              <p className="empty-state">Nenhum registro corresponde à pesquisa.</p>
            ) : (
              groupedRecords.map(([groupKey, groupRecords]) => {
                const [groupYear, groupMonth] = groupKey.split("||");
                return (
                  <section className="record-period-group" key={groupKey}>
                    <div className="record-period-heading">
                      <strong>{groupYear}</strong><span>{groupMonth.charAt(0).toLocaleUpperCase("pt-BR") + groupMonth.slice(1)}</span>
                      <span className="record-count">{groupRecords.length} {groupRecords.length === 1 ? "venda" : "vendas"}</span>
                    </div>
                    {groupRecords.map((record) => {
                      const clientIndex = data.headers.indexOf("Cliente");
                      const modelIndex = data.headers.indexOf("Modelo");
                      const yearIndex = data.headers.indexOf("Ano da planilha");
                      return (
                        <div className="record-inline-item" key={record.rowNumber}>
                          <button
                            aria-expanded={selectedRow === record.rowNumber}
                            className={`record-picker-row${selectedRow === record.rowNumber ? " is-selected" : ""}`}
                            onClick={() => setSelectedRow((current) => current === record.rowNumber ? null : record.rowNumber)}
                            type="button"
                          >
                            <span className="record-picker-number">Linha {record.rowNumber}</span>
                            <strong>{displayListValue(record.values[clientIndex], "Cliente")}</strong>
                            <span>{displayListValue(record.values[modelIndex], "Modelo")} · {displayListValue(record.values[yearIndex], "Ano da planilha")}</span>
                            <Icon name="chevronRight" />
                          </button>
                          {selectedRow === record.rowNumber && (
                            <div className="selected-record-form selected-record-form--inline">
                              <div className="panel-heading">
                                <div><h2>Editar: {displayListValue(record.values[clientIndex], "Cliente")}</h2><p>Altere os campos necessários e salve. A edição aparece logo abaixo da venda selecionada.</p></div>
                                <button className="button button--secondary button--small" onClick={() => setSelectedRow(null)} type="button">Fechar</button>
                              </div>
                              {canEdit && canPersist ? (
                                <RecordForm key={`edit-${record.rowNumber}-${data.version}`} mode="edit" record={record} version={data.version ?? ""} onSaved={handleSaved} />
                              ) : (
                                <p className="empty-state">{canEdit ? "A edição será habilitada quando a fonte estiver configurada." : "Edição disponível apenas para usuários autorizados como editores."}</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </section>
                );
              })
            )}
          </div>
          )}

        </section>
      )}
    </div>
  );
}
