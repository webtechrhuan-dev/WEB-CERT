import { LoginButton } from "@/components/login-button";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">WEB TECH · ACESSO INTERNO</p>
        <h1 id="login-title">Entrar</h1>
        <p>Informe seu usuário e senha para acessar o Certificados Manager.</p>
        <LoginButton />
        <p className="login-setup-notice">Acesso restrito aos usuários cadastrados no sistema.</p>
      </section>
    </main>
  );
}
