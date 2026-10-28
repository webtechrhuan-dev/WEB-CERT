"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Icon } from "@/components/icon";

export function AuthControl() {
  const { data: session, status } = useSession();
  if (status === "loading") {
    return <span className="auth-control-placeholder" aria-label="Verificando sessão" />;
  }
  if (!session?.user) {
    return <Link className="auth-control-link" href="/login">Entrar</Link>;
  }
  const role = session.user.role;
  const label = role === "admin" ? "ADM" : role === "editor" ? "Usuário" : "Consulta";
  return (
    <div className="auth-control">
      <span className="auth-user-role">{session.user.name} · {label}</span>
      <button className="auth-signout" onClick={() => void signOut({ redirectTo: "/login" })} type="button">
        <Icon name="lock" /> Sair
      </button>
    </div>
  );
}
