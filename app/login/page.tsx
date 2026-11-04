import { LoginButton } from "@/components/login-button";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel login-panel--branded" aria-labelledby="login-title">
        <div className="login-brand-stage">
          <img
            className="login-brand-logo"
            src="/web-tech-logo.svg"
            alt="Web Tech"
            width="1200"
            height="383"
          />
        </div>
        <p className="eyebrow">ACESSO INTERNO</p>
        <h1 id="login-title">Entrar</h1>
        <p>Informe seu usuário e senha para acessar o Certificados Manager.</p>
        <LoginButton />
        <p className="login-setup-notice">Acesso restrito aos usuários cadastrados no sistema.</p>
      </section>
    </main>
  );
}
