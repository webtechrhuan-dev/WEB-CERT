"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CertificateFile = {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  expiresAt: string | null;
};

function messageFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = body.error;
  return typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
    ? error.message
    : null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function CertificateFiles({ rowNumber, canUpload, saleStatus, saleExpiry }: { rowNumber: number; canUpload: boolean; saleStatus: string; saleExpiry: string }) {
  const normalizedStatus = saleStatus.trim().toLocaleLowerCase("pt-BR");
  const statusAllowsCertificate = ["emitido", "pendente instalar", "instalado", "concluido", "concluído"].includes(normalizedStatus);
  const canManageCertificate = canUpload && statusAllowsCertificate;
  // Um vínculo legado em status inválido precisa continuar removível por um editor.
  const canDeleteCertificate = canUpload;
  const [files, setFiles] = useState<CertificateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<CertificateFile | null>(null);
  const [reauthUsername, setReauthUsername] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [fileToReveal, setFileToReveal] = useState<CertificateFile | null>(null);
  const [revealUsername, setRevealUsername] = useState("");
  const [revealPassword, setRevealPassword] = useState("");
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível consultar os certificados.");
      const list = typeof body === "object" && body !== null && "certificates" in body && Array.isArray(body.certificates)
        ? body.certificates as CertificateFile[]
        : [];
      setFiles(list);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao consultar arquivos.");
    } finally {
      setLoading(false);
    }
  }, [rowNumber]);

  useEffect(() => { void refresh(); }, [refresh]);

  function remove(file: CertificateFile) {
    if (!canManageCertificate || deleting) return;
    setError(null);
    setNotice(null);
    setReauthUsername("");
    setReauthPassword("");
    setFileToDelete(file);
  }

  async function confirmRemove() {
    if (!fileToDelete || !reauthUsername.trim() || !reauthPassword || deleting) {
      setError("Informe seu usuário e sua senha para confirmar a exclusão.");
      return;
    }
    setError(null);
    setNotice(null);
    setDeleting(true);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: fileToDelete.id, username: reauthUsername.trim(), password: reauthPassword }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível validar suas credenciais.");
      setFileToDelete(null);
      setReauthPassword("");
      setNotice("Certificado excluído permanentemente do armazenamento.");
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao excluir certificado.");
    } finally {
      setDeleting(false);
    }
  }

  function openPasswordReveal(file: CertificateFile) {
    setRevealError(null);
    setError(null);
    setNotice(null);
    setRevealUsername("");
    setRevealPassword("");
    setRevealedPassword(null);
    setFileToReveal(file);
  }

  async function confirmPasswordReveal() {
    if (!fileToReveal || !revealUsername.trim() || !revealPassword || revealing) {
      setRevealError("Informe seu usuário e sua senha para visualizar a senha do PFX.");
      return;
    }
    setRevealError(null);
    setRevealing(true);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates/${fileToReveal.id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ username: revealUsername.trim(), password: revealPassword }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível validar suas credenciais.");
      const value = typeof body === "object" && body !== null && "password" in body && typeof body.password === "string" ? body.password : null;
      if (value === null) throw new Error("O servidor não retornou uma senha válida.");
      setRevealedPassword(value);
      setRevealPassword("");
    } catch (revealError) {
      setRevealError(revealError instanceof Error ? revealError.message : "Falha ao consultar a senha do certificado.");
    } finally {
      setRevealing(false);
    }
  }

  async function upload(file?: File) {
    if (!file || uploading) return;
    setError(null);
    setNotice(null);
    if (!/\.pfx$/i.test(file.name)) {
      setError("Formato inválido. Selecione um arquivo .pfx.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo excede o limite de 10 MB.");
      return;
    }
    if (!password) { setError("Informe a senha do certificado PFX."); return; }
    const form = new FormData();
    form.set("file", file);
    form.set("password", password);
    setUploading(true);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates`, { method: "POST", body: form });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível enviar o certificado.");
      setNotice("Certificado armazenado com segurança e vinculado a esta venda.");
      setPassword("");
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha no envio do certificado.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="content-panel certificate-files-panel" aria-labelledby="certificate-files-title" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); }}>
      <div className="panel-heading">
        <div><h3 id="certificate-files-title">Certificados digitais anexados</h3><p>Um certificado PFX vinculado exclusivamente a esta venda.</p></div>
        <span className="record-count">{files.length} arquivo(s)</span>
      </div>
      {canManageCertificate && (
        <div className="certificate-upload-form" aria-label="Adicionar certificado digital">
          <label className="record-form-field certificate-upload-field">
            <span>Senha do certificado PFX</span>
            <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={uploading} placeholder="Senha do arquivo PFX" />
          </label>
          <label className="record-form-field certificate-upload-field">
            <span>Exclusão automática em</span>
            <input type="text" value={saleExpiry ? new Date(`${saleExpiry}T00:00:00`).toLocaleDateString("pt-BR") : "Defina a data no cadastro"} readOnly disabled aria-readonly="true" className="certificate-expiry-readonly" title="Esta data é obtida automaticamente do campo Data de vencimento da venda." />
          </label>
          <label className="record-form-field certificate-upload-field certificate-upload-file">
            <span>Arquivo do certificado</span>
            <input
              ref={inputRef}
              aria-label="Selecionar arquivo de certificado"
              accept=".pfx,application/x-pkcs12"
              disabled={uploading}
              onChange={(event) => void upload(event.target.files?.[0])}
              type="file"
            />
          </label>
          <p className="certificate-upload-help">Máximo de 10 MB. A exclusão automática seguirá a data de vencimento definida no cadastro da venda. A senha será criptografada antes de ser armazenada.</p>
        </div>
      )}
      {loading ? <p className="empty-state">Carregando arquivos…</p> : files.length === 0 ? (
        <p className="empty-state">Nenhum certificado anexado a esta venda.</p>
      ) : (
        <ul className="certificate-file-list">
          {files.map((file) => (
            <li key={file.id}>
              <div><strong>{file.name}</strong><span>{formatSize(file.size)} · Enviado em {new Date(file.uploadedAt).toLocaleString("pt-BR")} · Vence em {file.expiresAt ? new Date(file.expiresAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informado"} · {file.uploadedBy}</span></div>
              <div className="certificate-file-actions"><button className="button button--secondary button--small" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openPasswordReveal(file); }}>Ver senha</button><a className="button button--secondary button--small" href={`/api/certificates/${file.id}`} rel="noreferrer">Baixar</a>{canDeleteCertificate && <button className="button button--danger button--small" disabled={deleting} onClick={() => remove(file)} type="button">Excluir</button>}</div>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && <p className="certificate-delete-dependency">{statusAllowsCertificate ? "Esta venda não pode ser excluída enquanto houver certificado vinculado. Exclua primeiro o certificado usando a confirmação de usuário e senha." : "Atenção: o status atual desta venda não permite manter certificado vinculado. Exclua o arquivo usando a confirmação de usuário e senha antes de continuar."}</p>}
      {fileToReveal && (
        <div className="reauth-overlay" role="presentation" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => { if (event.target === event.currentTarget && !revealing) { setFileToReveal(null); setRevealedPassword(null); setRevealError(null); } }}>
          <section className="reauth-dialog" role="dialog" aria-modal="true" aria-labelledby="certificate-password-auth-title" onClick={(event) => event.stopPropagation()}>
            <div className="reauth-dialog-heading">
              <span className="reauth-warning-icon" aria-hidden="true">!</span>
              <div><h3 id="certificate-password-auth-title">Visualizar senha do certificado</h3><p>Confirme sua identidade para revelar a senha do arquivo <strong>{fileToReveal.name}</strong>.</p></div>
            </div>
            {!revealedPassword ? (
              <>
                <label className="record-form-field"><span>Usuário</span><select autoComplete="username" autoFocus value={revealUsername} onChange={(event) => setRevealUsername(event.target.value)}><option value="">Selecione seu usuário</option><option value="rhuan">Rhuan</option><option value="arthur">Arthur</option><option value="wesley">Wesley</option></select></label>
                <label className="record-form-field"><span>Senha de acesso</span><input autoComplete="current-password" type="password" value={revealPassword} onChange={(event) => setRevealPassword(event.target.value)} placeholder="Digite sua senha novamente" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void confirmPasswordReveal(); } }} /></label>
                <p className="reauth-security-note">A senha de acesso é validada no servidor. A senha PFX só será descriptografada após a confirmação e não ficará salva no navegador.</p>
              </>
            ) : (
              <div className="certificate-revealed-password">
                <label className="record-form-field"><span>Senha do certificado PFX</span><input type="text" readOnly autoComplete="off" spellCheck={false} value={revealedPassword} onClick={(event) => event.currentTarget.select()} aria-label="Senha do certificado revelada" /></label>
                <p className="reauth-security-note">Mantenha esta informação protegida. Fechar esta janela ocultará a senha novamente.</p>
              </div>
            )}
            {revealError && <p className="form-message form-message--error" role="alert">{revealError}</p>}
            <div className="form-actions">
              <button className="button button--secondary" type="button" disabled={revealing} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setFileToReveal(null); setRevealPassword(""); setRevealedPassword(null); setRevealError(null); }}>Fechar</button>
              {!revealedPassword && <button className="button button--primary" type="button" disabled={revealing || !revealUsername.trim() || !revealPassword} onClick={() => void confirmPasswordReveal()}>{revealing ? "Validando…" : "Confirmar e visualizar"}</button>}
            </div>
          </section>
        </div>
      )}
      {fileToDelete && (
        <div className="reauth-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !deleting) setFileToDelete(null); }}>
          <section className="reauth-dialog" role="dialog" aria-modal="true" aria-labelledby="certificate-delete-auth-title" onClick={(event) => event.stopPropagation()}>
            <div className="reauth-dialog-heading">
              <span className="reauth-warning-icon" aria-hidden="true">!</span>
              <div><h3 id="certificate-delete-auth-title">Confirmar exclusão do certificado</h3><p>O arquivo <strong>{fileToDelete.name}</strong> será removido permanentemente. Confirme sua identidade para continuar.</p></div>
            </div>
            <label className="record-form-field"><span>Usuário</span><select autoComplete="username" autoFocus value={reauthUsername} onChange={(event) => setReauthUsername(event.target.value)}><option value="">Selecione seu usuário</option><option value="rhuan">Rhuan</option><option value="arthur">Arthur</option><option value="wesley">Wesley</option></select></label>
            <label className="record-form-field"><span>Senha</span><input autoComplete="current-password" type="password" value={reauthPassword} onChange={(event) => setReauthPassword(event.target.value)} placeholder="Digite sua senha novamente" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void confirmRemove(); } }} /></label>
            {!fileToDelete && error && <p className="form-message form-message--error" role="alert">{error}</p>}
            <p className="reauth-security-note">A senha é validada no servidor e não é armazenada. Somente o usuário conectado pode confirmar a exclusão.</p>
            <div className="form-actions">
              <button className="button button--secondary" type="button" disabled={deleting} onClick={() => { setFileToDelete(null); setReauthPassword(""); }}>Cancelar</button>
              <button className="button button--danger" type="button" disabled={deleting || !reauthUsername.trim() || !reauthPassword} onClick={() => void confirmRemove()}>{deleting ? "Validando e excluindo…" : "Confirmar exclusão"}</button>
            </div>
          </section>
        </div>
      )}
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {notice && <p className="form-message form-message--success" role="status">{notice}</p>}
      <p className="form-help">Os arquivos ficam no mesmo banco MongoDB das vendas, em uma coleção GridFS exclusiva para certificados. O acesso exige autenticação e o envio exige permissão de edição.</p>
    </section>
  );
}
