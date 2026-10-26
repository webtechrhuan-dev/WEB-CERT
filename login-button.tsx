"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
  return (
    <button
      className="button button--primary"
      onClick={() => void signIn("microsoft-entra-id", { redirectTo: "/" })}
      type="button"
    >
      Entrar com Microsoft 365
    </button>
  );
}
