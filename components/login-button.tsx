"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
  return (
    <button
      className="button button--primary"
      onClick={() => void signIn("github", { redirectTo: "/" })}
      type="button"
    >
      Entrar com GitHub
    </button>
  );
}
