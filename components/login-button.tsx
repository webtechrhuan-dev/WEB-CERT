"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { signIn } from "next-auth/react";

export function LoginButton() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  function handleCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Usuário ou senha inválidos. Confira os dados e tente novamente.");
        setPassword("");
        passwordRef.current?.focus();
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Não foi possível entrar. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-form login-form--premium" onSubmit={submit} noValidate={false} aria-busy={loading}>
      <label className="login-input-group" htmlFor="login-username">
        <span className="login-input-label">Usuário</span>
        <span className="login-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7"/><path d="M5 20c.6-3.4 3-5.2 7-5.2s6.4 1.8 7 5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          <input
            id="login-username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error-message" : undefined}
            onChange={(event) => { setUsername(event.target.value); setError(""); }}
            placeholder="Digite seu usuário"
            required
            value={username}
          />
        </span>
      </label>

      <label className="login-input-group" htmlFor="login-password">
        <span className="login-input-label">Senha</span>
        <span className="login-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
          <input
            ref={passwordRef}
            id="login-password"
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error-message" : undefined}
            onChange={(event) => { setPassword(event.target.value); setError(""); }}
            onKeyDown={handleCapsLock}
            onKeyUp={handleCapsLock}
            onBlur={() => setCapsLock(false)}
            placeholder="Digite sua senha"
            required
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={showPassword}
            aria-controls="login-password"
            className="login-password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            type="button"
          >
            {showPassword ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.5 5.2 9 7-.2.7-1.1 2.1-2.5 3.4M6.2 6.3C4.1 7.7 2.9 10.2 3 12c.5 1.8 3.8 7 9 7 1.2 0 2.3-.3 3.3-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12s3.2-7 9-7 9 7 9 7-3.2 7-9 7-9-7-9-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7"/></svg>
            )}
          </button>
        </span>
        {capsLock && <span className="login-caps-warning" role="status">Caps Lock está ativado.</span>}
      </label>

      {error && <p id="login-error-message" className="login-error" role="alert" aria-live="assertive">{error}</p>}

      <button className="login-submit" disabled={loading || !username.trim() || !password} type="submit">
        {loading ? <><span className="login-submit-spinner" aria-hidden="true" /> <span role="status">Validando acesso…</span></> : <>Entrar no sistema <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></>}
      </button>
      <p className="login-form-hint">Utilize o mesmo usuário e senha cadastrados pela administração.</p>
    </form>
  );
}
