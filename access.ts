import "server-only";

// Compatibilidade para rotas antigas: toda verificação usa a mesma política
// atual, que consulta função e situação diretamente no MongoDB.
export { requireAccess, AccessError } from "@/lib/server/access";
export type { AccessContext, AccessErrorCode, UserRole } from "@/lib/server/access";
