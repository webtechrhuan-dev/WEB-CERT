import { LoginButton } from "@/components/login-button";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel login-panel--branded" aria-labelledby="login-title">
        <img
          className="login-brand-logo"
          src="/web-tech-logo.webp"
          alt="Logo Web Tech"
          width="600"
          height="192"
        />
        <p className="eyebrow">ACESSO INTERNO</p>
        <h1 id="login-title">Entrar</h1>
        <p>Informe seu usuário e senha para acessar o Certificados Manager.</p>
        <LoginButton />
        <p className="login-setup-notice">Acesso restrito aos usuários cadastrados no sistema.</p>
      </section>
    </main>
  );
}
