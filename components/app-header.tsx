import Link from "next/link";
import { AuthControl } from "@/components/auth-control";
import { AdminNavLink, AdminUsersNavLink } from "@/components/admin-nav-link";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";

type AppHeaderProps = {
  active: "home" | "records" | "register" | "edit" | "reports" | "audit" | "admin";
};

const menu = [
  { label: "Início", href: "/", icon: "grid" as const, key: "home" },
  { label: "Gestão de vendas", href: "/editar", icon: "spreadsheet" as const, key: "edit" },
  { label: "Cadastros", href: "/cadastros", icon: "users" as const, key: "register" },

  { label: "Relatórios", href: "/relatorios", icon: "chart" as const, key: "reports" },
  { label: "Auditoria", href: "/auditoria", icon: "shield" as const, key: "audit", adminOnly: true },
  { label: "Usuários", href: "/admin/usuarios", icon: "users" as const, key: "admin", adminOnly: true },
];

export function AppHeader({ active }: AppHeaderProps) {
  const visibleMenu = menu.filter((item) => !("adminOnly" in item && item.adminOnly));
  const activeItem = menu.find((item) => item.key === active) ?? menu[0];
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link
            aria-label="Web Tech, Certificados Manager — início"
            className="brand-lockup"
            href="/"
          >
            <img className="brand-logo" src="/web-tech-symbol.svg" alt="Símbolo Web Tech" />
            <span className="brand-divider" aria-hidden="true" />
            <span className="product-name">
              Certificados <strong>Manager</strong>
            </span>
          </Link>
          <div className="topbar-meta">
            <span className="environment-indicator">
              <span className="environment-dot" />
              <span>Área interna</span>
            </span>
            <span className="topbar-separator" aria-hidden="true" />
            <span className="topbar-section">
              <Icon name={activeItem.icon} />
              {active === "home" ? "Menu principal" : activeItem.label}
            </span>
            <ThemeToggle />
            <AuthControl />
          </div>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Menu principal">
        <div className="primary-nav-inner">
          {visibleMenu.slice(0, 2).map((item) => (
            <Link
              aria-current={active === item.key ? "page" : undefined}
              className={`primary-nav-link${active === item.key ? " is-active" : ""}`}
              href={item.href}
              key={item.key}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
          <span className="primary-nav-divider" aria-hidden="true" />
          {visibleMenu.slice(2).map((item) => (
            <Link
              aria-current={active === item.key ? "page" : undefined}
              className={`primary-nav-link${active === item.key ? " is-active" : ""}`}
              href={item.href}
              key={item.key}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
          <AdminNavLink active={active === "audit"} />
          <AdminUsersNavLink active={active === "admin"} />
        </div>
      </nav>
    </>
  );
}
