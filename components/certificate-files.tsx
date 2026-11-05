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

export function CertificateFiles({ rowNumber, canUpload }: { rowNumber: number; canUpload: boolean }) {
  const [files, setFiles] = useState<CertificateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  async function remove(file: CertificateFile) {
    if (!canUpload || !window.confirm(`Excluir permanentemente o certificado "${file.name}" desta venda?`)) return;
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível excluir o certificado.");
      setNotice("Certificado excluído do armazenamento.");
      await refresh();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao excluir certificado.");
    }
  }

  async function upload(file?: File) {
    if (!file || uploading) return;
    setError(null);
    setNotice(null);
    if (!/\.(p12|pfx)$/i.test(file.name)) {
      setError("Formato inválido. Selecione um arquivo .pfx.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo excede o limite de 10 MB.");
      return;
    }
    if (!password) { setError("Informe a senha do certificado PFX."); return; }
    if (!expiresAt) { setError("Informe a data de vencimento do certificado."); return; }
    const form = new FormData();
    form.set("file", file);
    form.set("password", password);
    form.set("expiresAt", expiresAt);
    setUploading(true);
    try {
      const response = await fetch(`/api/records/${rowNumber}/certificates`, { method: "POST", body: form });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(messageFrom(body) ?? "Não foi possível enviar o certificado.");
      setNotice("Certificado armazenado com segurança e vinculado a esta venda.");
      setPassword("");
      setExpiresAt("");
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha no envio do certificado.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="content-panel certificate-files-panel" aria-labelledby="certificate-files-title">
      <div className="panel-heading">
        <div><h3 id="certificate-files-title">Certificados digitais anexados</h3><p>Um certificado PFX vinculado exclusivamente a esta venda.</p></div>
        <span className="record-count">{files.length} arquivo(s)</span>
      </div>
      {canUpload && (
        <div className="form-actions">
          <label className="record-form-field"><span>Senha do certificado PFX</span><input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={uploading} placeholder="Senha do arquivo PFX" /></label>
          <label className="record-form-field"><span>Vencimento do certificado</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} disabled={uploading} /></label>
          <input
            ref={inputRef}
            aria-label="Selecionar arquivo de certificado"
            accept=".pfx,application/x-pkcs12"
            disabled={uploading}
            onChange={(event) => void upload(event.target.files?.[0])}
            type="file"
          />
          <span className="form-help">Máximo de 10 MB. Informe a senha e a validade do certificado; a senha será criptografada antes de ser armazenada.</span>
        </div>
      )}
      {loading ? <p className="empty-state">Carregando arquivos…</p> : files.length === 0 ? (
        <p className="empty-state">Nenhum certificado anexado a esta venda.</p>
      ) : (
        <ul className="certificate-file-list">
          {files.map((file) => (
            <li key={file.id}>
              <div><strong>{file.name}</strong><span>{formatSize(file.size)} · Enviado em {new Date(file.uploadedAt).toLocaleString("pt-BR")} · Vence em {file.expiresAt ? new Date(file.expiresAt).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "não informado"} · {file.uploadedBy}</span></div>
              <div className="certificate-file-actions"><a className="button button--secondary button--small" href={`/api/certificates/${file.id}`} rel="noreferrer">Baixar</a>{canUpload && <button className="button button--danger button--small" onClick={() => void remove(file)} type="button">Excluir</button>}</div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      {notice && <p className="form-message form-message--success" role="status">{notice}</p>}
      <p className="form-help">Os arquivos ficam no mesmo banco MongoDB das vendas, em uma coleção GridFS exclusiva para certificados. O acesso exige autenticação e o envio exige permissão de edição.</p>
    </section>
  );
}
