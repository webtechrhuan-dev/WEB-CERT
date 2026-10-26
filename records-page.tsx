"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Icon, type IconName } from "@/components/icon";
import { AppHeader } from "@/components/app-header";
import type {
  WorkbookApiError,
  WorkbookCell,
  WorkbookData,
  WorkbookDateCell,
} from "@/lib/workbook-types";

const PAGE_SIZE = 20;
const CURRENCY_HEADERS = new Set(["Faturamento (R$)", "Custo (R$)"]);
const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const numberFormatter = new Intl.NumberFormat("pt-BR");

function isWorkbookData(value: unknown): value is WorkbookData {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data = value as Partial<WorkbookData>;
  return (
    Array.isArray(data.headers) &&
    typeof data.count === "number" &&
    Array.isArray(data.records)
  );
}

function isApiError(value: unknown): value is WorkbookApiError {
  if (typeof value !== "object" || value === null || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}

function normalizedText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function cellSearchText(cell: WorkbookCell): string {
  if (cell === null) {
    return "";
  }
  if (typeof cell === "object") {
    return `${cell.raw} ${cell.parsed ?? ""}`;
  }
  if (typeof cell === "number") {
    return `${cell} ${numberFormatter.format(cell)}`;
  }
  return String(cell);
}

function formatDate(parsed: string): string {
  const [year, month, day] = parsed.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("pt-BR");
}

function DateValue({ cell }: { cell: WorkbookDateCell }) {
  if (cell.parsed) {
    return (
      <span
        title={cell.source === "text" ? `Valor original: ${cell.raw}` : undefined}
      >
        {formatDate(cell.parsed)}
        {cell.source === "text" && (
          <span className="status-tag status-tag--warning ml-2">Texto</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {String(cell.raw)}
      <span className="status-tag status-tag--error">Data não validada</span>
    </span>
  );
}

function formatCell(cell: WorkbookCell, header: string) {
  if (cell === null || cell === "") {
    return <span className="empty-value" aria-label="Sem valor">—</span>;
  }
  if (typeof cell === "object") {
    return <DateValue cell={cell} />;
  }
  if (typeof cell === "number") {
    if (CURRENCY_HEADERS.has(header)) {
      return currencyFormatter.format(cell);
    }
    return String(cell);
  }
  return cell;
}

function LoadingState() {
  return (
    <section className="state-panel" aria-live="polite" aria-busy="true">
      <span className="loading-spinner" aria-hidden="true" />
      <div className="state-copy">
        <h2>Carregando registros</h2>
        <p>Buscando os dados mais recentes da planilha.</p>
      </div>
    </section>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="state-panel state-panel--error" aria-live="assertive">
      <span className="state-icon state-icon--error">
        <Icon name="alert" />
      </span>
      <div className="state-copy">
        <h2>Não foi possível carregar os registros</h2>
        <p>{message}</p>
        <button className="button button--secondary button--small" onClick={onRetry} type="button">
          <Icon name="refresh" />
          Tentar novamente
        </button>
      </div>
    </section>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="empty-state" role="status">
      <span className="state-icon">
        <Icon name={hasQuery ? "search" : "document"} />
      </span>
      <h2>{hasQuery ? "Nenhum resultado encontrado" : "Planilha sem registros"}</h2>
      <p>
        {hasQuery
          ? "Tente outros termos ou limpe a pesquisa para ver todos os registros."
          : "Não há registros abaixo do cabeçalho da planilha."}
      </p>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="pagination" aria-label="Paginação dos registros">
      <button
        className="button button--pagination"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        type="button"
      >
        <Icon name="chevronLeft" />
        <span className="pagination-label">Anterior</span>
      </button>
      <span className="pagination-current" aria-live="polite">
        <span className="pagination-mobile-label">Página</span>
        <strong>{page}</strong>
        <span className="pagination-divider">/</span>
        <span>{pageCount}</span>
      </span>
      <button
        className="button button--pagination"
        aria-label="Próxima página"
        disabled={page >= pageCount}
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        type="button"
      >
        <span className="pagination-label">Próxima</span>
        <Icon name="chevronRight" />
      </button>
    </nav>
  );
}

function SearchField({
  query,
  onChange,
}: {
  query: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="search-field">
      <span className="search-label">Pesquisar registros</span>
      <span className="search-control">
        <Icon name="search" className="search-icon" />
        <input
          id="record-search"
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Busque por qualquer campo..."
          type="search"
          value={query}
        />
        {query && (
          <button
            aria-label="Limpar pesquisa"
            className="search-clear"
            onClick={() => onChange("")}
            type="button"
          >
            <Icon name="close" />
          </button>
        )}
      </span>
    </label>
  );
}

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = useState<WorkbookData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (sessionStatus === "loading") {
      return;
    }
    if (!session) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function loadWorkbook() {
      try {
        const response = await fetch("/api/records", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            isApiError(payload)
              ? payload.error.message
              : "Não foi possível carregar a planilha.",
          );
        }
        if (!isWorkbookData(payload)) {
          throw new Error("A resposta da API está em um formato inesperado.");
        }

        setData(payload);
        setPage(1);
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") {
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar a planilha.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadWorkbook();
    return () => controller.abort();
  }, [reload, session, sessionStatus]);

  const filteredRecords = useMemo(() => {
    if (!data || !query.trim()) {
      return data?.records ?? [];
    }

    const term = normalizedText(query.trim());
    return data.records.filter((record) =>
      record.values.some((cell) =>
        normalizedText(cellSearchText(cell)).includes(term),
      ),
    );
  }, [data, query]);

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRecords = filteredRecords.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const rangeStart = filteredRecords.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filteredRecords.length);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function refresh() {
    setData(null);
    setPage(1);
    setReload((value) => value + 1);
  }

  return (
    <div className="app-shell">
      <AppHeader active="records" />
      <main className="workspace">
        <div className="page-heading">
          <div className="page-title-group">
            <div className="breadcrumb" aria-label="Localização">
              <span>Dados comerciais</span>
              <Icon name="chevronRight" />
              <span aria-current="page">Registros</span>
            </div>
            <div className="title-row">
              <div>
                <p className="eyebrow">DADOS COMERCIAIS</p>
                <h1>Registros</h1>
                <p className="page-description">
                  Consulte e pesquise os dados carregados da planilha.
                </p>
              </div>
            </div>
          </div>
          <div className="heading-actions">
            <span className="source-badge">
              <Icon name="spreadsheet" />
              {data?.source === "github"
                ? "Excel via GitHub"
                : data?.source === "local"
                  ? "Arquivo local"
                  : "Planilha Excel"}
            </span>
            <button
              className="button button--primary"
              disabled={loading}
              onClick={refresh}
              type="button"
            >
              <Icon name="refresh" className={loading ? "icon-spin" : undefined} />
              <span>{loading ? "Atualizando..." : "Atualizar leitura"}</span>
            </button>
          </div>
        </div>

        {sessionStatus === "loading" || (loading && session) ? (
          <LoadingState />
        ) : !session ? (
          <section className="state-panel state-panel--error">
            <span className="state-icon state-icon--error"><Icon name="lock" /></span>
            <div className="state-copy">
              <h2>Autenticação necessária</h2>
              <p>Entre com sua conta corporativa autorizada para consultar os dados.</p>
              <Link className="button button--secondary button--small" href="/login">Ir para o acesso</Link>
            </div>
          </section>
        ) : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : data ? (
          <>
            <section className="records-toolbar" aria-label="Resumo e pesquisa">
              <div className="record-count" aria-live="polite">
                <span className="count-icon">
                  <Icon name="spreadsheet" />
                </span>
                <span className="count-copy">
                  <span className="count-label">Registros encontrados</span>
                  <span className="count-value">
                    {data.count.toLocaleString("pt-BR")}
                    <span>no arquivo</span>
                  </span>
                </span>
              </div>
              <SearchField query={query} onChange={updateQuery} />
            </section>

            <section className="table-panel" aria-label="Tabela de registros">
              <div className="table-toolbar">
                <div className="table-heading">
                  <span className="table-title-icon">
                    <Icon name="list" />
                  </span>
                  <div>
                    <h2>Todos os registros</h2>
                    <p>
                      {query.trim()
                        ? `${filteredRecords.length.toLocaleString("pt-BR")} resultados para sua pesquisa`
                        : "Dados da planilha unificada"}
                    </p>
                  </div>
                </div>
                {filteredRecords.length > 0 && (
                  <Pagination
                    page={safePage}
                    pageCount={pageCount}
                    onPageChange={setPage}
                  />
                )}
              </div>

              {filteredRecords.length === 0 ? (
                <EmptyState hasQuery={Boolean(query.trim())} />
              ) : (
                <>
                  <div className="table-scroll" role="region" aria-label="Tabela de registros. Deslize horizontalmente para consultar todas as colunas." tabIndex={0}>
                    <table className="records-table">
                      <thead>
                        <tr>
                          {data.headers.map((header) => (
                            <th
                              className={CURRENCY_HEADERS.has(header) ? "cell-numeric" : undefined}
                              key={header}
                              scope="col"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRecords.map((record) => (
                          <tr key={record.rowNumber}>
                            {record.values.map((cell, index) => (
                              <td
                                className={[
                                  CURRENCY_HEADERS.has(data.headers[index]) ? "cell-numeric" : "",
                                  index === 0 ? "cell-year" : "",
                                ].filter(Boolean).join(" ")}
                                key={`${record.rowNumber}-${data.headers[index]}`}
                                data-label={data.headers[index]}
                              >
                                {formatCell(cell, data.headers[index])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <footer className="table-footer">
                    <p aria-live="polite">
                      Exibindo <strong>{rangeStart.toLocaleString("pt-BR")}–{rangeEnd.toLocaleString("pt-BR")}</strong>
                      {" "}de <strong>{filteredRecords.length.toLocaleString("pt-BR")}</strong>
                      {query.trim() ? " resultados" : " registros"}
                    </p>
                    <Pagination
                      page={safePage}
                      pageCount={pageCount}
                      onPageChange={setPage}
                    />
                  </footer>
                </>
              )}
            </section>
            <p className="page-footnote">
              <Icon name="lock" />
              Leitura somente · A planilha original não é alterada por esta tela
            </p>
          </>
        ) : null}
      </main>
    </div>
  );
}
