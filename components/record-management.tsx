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

function formValues(record?: WorkbookRecord): FormValues {
  const values = Object.fromEntries(
    WORKBOOK_HEADERS.map((header, index) => [header, valueAsText(record?.values[index])]),
  );
  if (!record) {
    const period = currentPeriod();
    values["Ano da planilha"] = period.year;
    values["Mês da planilha"] = period.month;
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
        Campos podem ficar vazios. Datas alteradas devem usar AAAA-MM-DD; valores monetários aceitam formato brasileiro ou decimal.
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
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const canEdit = session?.user.role === "editor";
  const canPersist = data?.source === "github" || data?.source === "mongodb";

  const records = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return data.records.filter((record) => {
      if (!query) return true;
      return record.values.some((value) => valueAsText(value).toLocaleLowerCase("pt-BR").includes(query));
    });
  }, [data, search]);
  const selectedRecord = data?.records.find((record) => record.rowNumber === selectedRow);

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
            <div><h2>Selecionar registro</h2><p>Pesquise e escolha uma linha para editar todos os seus campos.</p></div>
            <span className="record-count">{records.length} de {data.count}</span>
          </div>
          <label className="search-field management-search">
            <span className="search-label">Pesquisar registros</span>
            <span className="search-control">
              <Icon name="search" className="search-icon" />
              <input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedRow(null); }} placeholder="Nome, modelo, ano ou qualquer campo" type="search" />
            </span>
          </label>
          <div className="record-picker">
            {records.length === 0 ? (
              <p className="empty-state">Nenhum registro corresponde à pesquisa.</p>
            ) : (
              records.map((record) => {
                const clientIndex = data.headers.indexOf("Cliente");
                const modelIndex = data.headers.indexOf("Modelo");
                const yearIndex = data.headers.indexOf("Ano da planilha");
                return (
                  <button
                    aria-pressed={selectedRow === record.rowNumber}
                    className={`record-picker-row${selectedRow === record.rowNumber ? " is-selected" : ""}`}
                    key={record.rowNumber}
                    onClick={() => setSelectedRow(record.rowNumber)}
                    type="button"
                  >
                    <span className="record-picker-number">Linha {record.rowNumber}</span>
                    <strong>{displayListValue(record.values[clientIndex], "Cliente")}</strong>
                    <span>{displayListValue(record.values[modelIndex], "Modelo")} · {displayListValue(record.values[yearIndex], "Ano da planilha")}</span>
                    <Icon name="chevronRight" />
                  </button>
                );
              })
            )}
          </div>
          {selectedRecord && (
            <div className="selected-record-form">
              <div className="panel-heading">
                <div><h2>Editar linha {selectedRecord.rowNumber}</h2><p>Somente os campos alterados serão enviados.</p></div>
                <button className="button button--secondary button--small" onClick={() => setSelectedRow(null)} type="button">Cancelar</button>
              </div>
              {canEdit && canPersist ? (
                <RecordForm
                  key={`edit-${selectedRecord.rowNumber}-${data.version}`}
                  mode="edit"
                  record={selectedRecord}
                  version={data.version ?? ""}
                  onSaved={handleSaved}
                />
              ) : (
                <p className="empty-state">
                  {canEdit
                    ? "A edição será habilitada quando a fonte estiver configurada no GitHub."
                    : "Edição disponível apenas para usuários autorizados como editores."}
                </p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
