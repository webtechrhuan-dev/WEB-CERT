import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function encryptionKey(): Buffer {
  const encoded = process.env.CERTIFICATE_PASSWORD_ENCRYPTION_KEY;
  if (!encoded) throw new Error("CERTIFICATE_PASSWORD_ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("CERTIFICATE_PASSWORD_ENCRYPTION_KEY deve conter exatamente 32 bytes em base64.");
  return key;
}

/** Retorna IV, tag e conteúdo cifrado em base64; nunca persiste a senha em texto puro. */
export function encryptCertificatePassword(password: string): { algorithm: string; iv: string; authTag: string; ciphertext: string } {
  if (!password) throw new Error("CERTIFICATE_PASSWORD_REQUIRED");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptCertificatePassword(value: { algorithm: string; iv: string; authTag: string; ciphertext: string }): string {
  if (value.algorithm !== ALGORITHM) throw new Error("CERTIFICATE_PASSWORD_CIPHERTEXT_INVALID");
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
