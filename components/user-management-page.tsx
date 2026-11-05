"use client";
import { useCallback, useEffect, useState } from "react";
type User = { username: string; displayName: string; role: "admin" | "editor" | "viewer"; active: boolean; createdAt: string | null; updatedAt: string | null };
const roleLabels = { admin: "Administrador", editor: "Editor", viewer: "Somente leitura" };
export function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const response = await fetch("/api/admin/users", { cache: "no-store" }); const body = await response.json(); if (!response.ok || !Array.isArray(body.users)) throw new Error(body.error?.message ?? "Não foi possível carregar os usuários."); setUsers(body.users); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Falha ao carregar usuários.", error: true }); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function update(user: User, changes: Partial<Pick<User, "role" | "active">>) { setSaving(user.username); setMessage(null); try { const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: user.username, ...changes }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível atualizar o usuário."); setUsers(current => current.map(item => item.username === user.username ? { ...item, ...changes } : item)); setMessage({ text: "Permissões de " + user.displayName + " atualizadas." }); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Falha ao atualizar usuário.", error: true }); } finally { setSaving(null); } }
  return <section className="content-panel"><div className="panel-heading"><div><h2>Contas cadastradas</h2><p>As senhas e hashes permanecem exclusivamente no servidor.</p></div><span className="record-count">{users.length} usuários</span></div>
    {message && <p className={message.error ? "form-message form-message--error" : "form-message"} role="status">{message.text}</p>}
    {loading ? <p className="empty-state">Carregando usuários…</p> : <div className="table-scroll"><table className="records-table"><thead><tr><th>Usuário</th><th>Permissão</th><th>Situação</th><th>Alterar permissão</th><th>Acesso</th></tr></thead><tbody>{users.map(user => <tr key={user.username}>
      <td><strong>{user.displayName}</strong><small className="muted-text">@{user.username}</small></td><td>{roleLabels[user.role]}</td>
      <td><span className={user.active ? "status-pill status-pill--success" : "status-pill status-pill--danger"}>{user.active ? "Ativo" : "Desativado"}</span></td>
      <td><select aria-label={"Permissão de " + user.displayName} value={user.role} disabled={saving === user.username} onChange={event => void update(user, { role: event.target.value as User["role"] })}><option value="admin">Administrador</option><option value="editor">Editor</option><option value="viewer">Somente leitura</option></select></td>
      <td><button className="button button--secondary" type="button" disabled={saving === user.username} onClick={() => void update(user, { active: !user.active })}>{saving === user.username ? "Salvando…" : user.active ? "Desativar" : "Reativar"}</button></td>
    </tr>)}</tbody></table></div>}
    <p className="helper-text">Proteções: a própria conta não pode ser alterada por esta tela e o sistema impede desativar/rebaixar o último administrador ativo.</p>
  </section>;
}
