/** Normaliza nomes de arquivos para uso seguro em metadados e Content-Disposition. */
export function sanitizeCertificateFileName(value: string): string {
  const normalized = value.normalize("NFKC")
    .replace(/[\/\\\u0000-\u001F\u007F"]/g, "_")
    .trim()
    .slice(0, 160);
  return !normalized || /^[_\s.]*$/.test(normalized) ? "certificado.pfx" : normalized;
}
