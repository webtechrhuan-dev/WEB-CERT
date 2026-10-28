"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";

export function LoginButton() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Usuário ou senha inválidos.");
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Não foi possível entrar. Verifique a conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label className="record-form-field">
        <span>Usuário</span>
        <input
          autoComplete="username"
          autoFocus
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Digite seu usuário"
          required
          value={username}
        />
      </label>
      <label className="record-form-field">
        <span>Senha</span>
        <input
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Digite sua senha"
          required
          type="password"
          value={password}
        />
      </label>
      {error && <p className="form-message form-message--error" role="alert">{error}</p>}
      <button className="button button--primary" disabled={loading} type="submit">
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
