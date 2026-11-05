"use client";

import { useCallback, useEffect, useState } from "react";

type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  occurredAt: string;
  outcome: string;
  metadata: Record<string, unknown>;
};

const ACTION_LABELS: Record<string, string> = {
  "sale.created": "Venda cadastrada",
  "sale.updated": "Venda alterada",
  "sale.deleted": "Venda excluída",
  "certificate.uploaded": "Certificado enviado",
  "certificate.downloaded": "Certificado baixado",
  "user.updated": "Permissões de usuário alteradas",
};

function detail(event: AuditEvent): string {
  const changed = event.metadata.changedFields;
  if (Array.isArray(changed)) return `Campos: ${changed.join(", ")}`;
  if (typeof event.metadata.rowNumber === "number") return `Venda #${event.metadata.rowNumber}`;
  if (typeof event.metadata.size === "number") return `Arquivo: ${(event.metadata.size / 1024).toFixed(1)} KB`;
  if (event.entity === "user") return `Função: ${String(event.metadata.role ?? "—")} · ${event.metadata.active === false ? "Inativo" : "Ativo"}`;
  return event.entity === "sale" ? `Venda #${event.entityId}` : event.entity === "user" ? `Usuário @${event.entityId}` : "—";
}

export function AuditLogPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextCursor?: string) => {
    if (nextCursor) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (nextCursor) query.set("cursor", nextCursor);
      const response = await fetch(`/api/admin/audit?${query}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("Não foi possível carregar a trilha de auditoria.");
      if (typeof body !== "object" || body === null || !("events" in body) || !Array.isArray(body.events)) {
        throw new Error("Resposta de auditoria inválida.");
      }
      const result = body as { events: AuditEvent[]; nextCursor: string | null };
      setEvents((current) => nextCursor ? [...current, ...result.events] : result.events);
      setCursor(result.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao consultar auditoria.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="content-panel audit-log-panel">
      <div className="panel-heading">
        <div><h2>Histórico de atividades</h2><p>Registros operacionais de alterações e movimentações de certificados. Nenhum conteúdo ou senha de certificado é exibido.</p></div>
        <span className="record-count">{events.length} eventos carregados</span>
      </div>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {loading ? <p className="empty-state">Carregando histórico…</p> : events.length === 0 ? (
        <p className="empty-state">Ainda não há eventos registrados.</p>
      ) : (
        <div className="table-scroll">
          <table className="records-table audit-log-table">
            <thead><tr><th>Data e hora</th><th>Usuário</th><th>Atividade</th><th>Referência</th><th>Detalhes</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.occurredAt).toLocaleString("pt-BR")}</td>
                  <td><strong>{event.actor}</strong></td>
                  <td>{ACTION_LABELS[event.action] ?? event.action}</td>
                  <td>{event.entity === "sale" ? `Venda #${event.entityId}` : event.entity === "user" ? `Usuário @${event.entityId}` : "Certificado"}</td>
                  <td>{detail(event)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && (
        <div className="form-actions audit-log-more">
          <button className="button button--secondary" disabled={loadingMore} onClick={() => void load(cursor)} type="button">
            {loadingMore ? "Carregando…" : "Carregar eventos anteriores"}
          </button>
        </div>
      )}
    </section>
  );
}
