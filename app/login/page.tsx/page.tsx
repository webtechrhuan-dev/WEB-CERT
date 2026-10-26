import { LoginButton } from "@/components/login-button";
import { authConfigured } from "@/auth";

export default function LoginPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">WEB TECH · ACESSO INTERNO</p>
        <h1 id="login-title">Entrar</h1>
        <p>Entre com sua conta GitHub autorizada para acessar os dados.</p>
        {authConfigured ? (
          <LoginButton />
        ) : (
          <p className="login-setup-notice" role="status">
            O acesso ainda não foi configurado. Peça ao administrador para concluir
            o OAuth do GitHub e a lista de logins autorizados na Vercel.
          </p>
        )}
      </section>
    </main>
  );
}
