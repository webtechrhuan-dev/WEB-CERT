import Link from "next/link";
import { AuthControl } from "@/components/auth-control";
import { Icon } from "@/components/icon";

type AppHeaderProps = {
  active: "home" | "records" | "register" | "edit" | "reports";
};

const menu = [
  { label: "Início", href: "/", icon: "grid" as const, key: "home" },
  { label: "Gestão de vendas", href: "/editar", icon: "spreadsheet" as const, key: "edit" },
  { label: "Cadastros", href: "/cadastros", icon: "users" as const, key: "register" },

  { label: "Relatórios", href: "/relatorios", icon: "chart" as const, key: "reports" },
];

export function AppHeader({ active }: AppHeaderProps) {
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
            <span className="brand-name">WEB TECH</span>
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
            <AuthControl />
          </div>
        </div>
      </header>
      <nav className="primary-nav" aria-label="Menu principal">
        <div className="primary-nav-inner">
          {menu.slice(0, 2).map((item) => (
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
          {menu.slice(2).map((item) => (
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
        </div>
      </nav>
    </>
  );
}
