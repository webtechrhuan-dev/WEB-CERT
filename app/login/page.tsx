import { LoginButton } from "@/components/login-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginMascot } from "@/components/login-mascot";

export default function LoginPage() {
  return (
    <main className="login-page login-page--premium">
      <div className="login-theme-control"><ThemeToggle /></div>

      <div className="login-layout">
        <section className="login-showcase" aria-label="Web Tech Certificados Manager">
          <div className="login-showcase-orbit login-showcase-orbit--one" aria-hidden="true" />
          <div className="login-showcase-orbit login-showcase-orbit--two" aria-hidden="true" />
          <LoginMascot />
          <div className="login-showcase-content">
            <div className="login-showcase-brand">
              <img src="/web-tech-logo.svg" alt="Web Tech" width="1200" height="383" />
            </div>
            <div className="login-showcase-copy">
              <p className="login-kicker"><span /> PLATAFORMA DE GESTÃO</p>
              <h1>Gestão inteligente.<br /><span>Controle completo.</span></h1>
              <p className="login-showcase-description">
                Todas as informações dos seus certificados digitais em um só lugar.
                Acompanhe vendas, gerencie registros e tenha clareza sobre os resultados.
              </p>
            </div>
            <div className="login-feature-list">
              <div className="login-feature">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span><strong>Acesso protegido</strong><small>Ambiente interno para usuários autorizados</small></span>
              </div>
              <div className="login-feature">
                <span className="login-feature-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M4 19V5m0 14h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="m7 15 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                <span><strong>Visão do negócio</strong><small>Vendas, relatórios e acompanhamento</small></span>
              </div>
            </div>
            <div className="login-showcase-footer">
              <span className="login-status-dot" /> SISTEMA WEB TECH
              <span className="login-footer-separator" />
              CERTIFICADOS MANAGER
            </div>
          </div>
        </section>

        <section className="login-panel login-panel--branded login-panel--premium" aria-labelledby="login-title">
          <div className="login-panel-topline">
            <span className="login-panel-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><rect x="5" y="10" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 10V7a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path d="M12 14v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
            </span>
            <span>ÁREA RESTRITA</span>
          </div>
          <div className="login-panel-heading">
            <p className="eyebrow">BEM-VINDO DE VOLTA</p>
            <h2 id="login-title">Acesse sua conta</h2>
            <p>Entre com suas credenciais para continuar no Certificados Manager.</p>
          </div>
          <LoginButton />
          <details className="login-tips">
            <summary>
              <span className="login-tips-bulb" aria-hidden="true">✦</span>
              Dicas rápidas para entrar
              <svg className="login-tips-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </summary>
            <div className="login-tips-content">
              <p><strong>Usuário:</strong> informe o usuário exatamente como foi cadastrado pela administração.</p>
              <p><strong>Senha:</strong> confira se o Caps Lock está desligado. Use o ícone de olho para conferir o que digitou.</p>
              <p><strong>Problemas de acesso?</strong> Solicite à administração a conferência ou redefinição das suas credenciais.</p>
            </div>
          </details>
          <div className="login-panel-security">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span><strong>Seus dados protegidos</strong><small>Acesso exclusivo aos usuários cadastrados no sistema.</small></span>
          </div>
          <p className="login-copyright">© {new Date().getFullYear()} Web Tech. Todos os direitos reservados.</p>
        </section>
      </div>
    </main>
  );
}
