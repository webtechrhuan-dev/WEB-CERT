"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function KeyboardShortcuts() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editing = !!target?.isContentEditable || ["input", "textarea", "select"].includes(tag ?? "");
      if (event.key === "Escape") return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        const form = target?.closest("form") ?? document.querySelector("form.record-form");
        if (form instanceof HTMLFormElement) {
          event.preventDefault();
          form.requestSubmit();
        }
        return;
      }
      if (editing || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const go = (path: string) => { event.preventDefault(); router.push(path); };
      switch (event.key) {
        case "Insert":
          go("/cadastros");
          break;
        case "F2": {
          if (pathname !== "/editar") return;
          event.preventDefault();
          const selected = document.querySelector<HTMLButtonElement>(".record-picker-row.is-selected");
          const first = selected ?? document.querySelector<HTMLButtonElement>(".record-picker-row");
          if (first && !selected) first.click();
          first?.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => document.querySelector<HTMLInputElement>(".selected-record-form input:not([disabled]), .selected-record-form select")?.focus(), 80);
          break;
        }
        case "F3":
          // F3 nativo do navegador é preservado; use Alt+F3 para localizar vendas.
          if (!event.altKey) return;
          event.preventDefault();
          document.querySelector<HTMLInputElement>(".management-search input, input[type='search']")?.focus();
          break;
        case "F4":
          event.preventDefault();
          document.querySelectorAll<HTMLSelectElement>(".selected-record-form .record-form-grid select")[3]?.focus();
          break;
        case "F8":
          go("/relatorios");
          break;
        case "F9":
          go("/editar");
          break;
        case "F10":
          // F10 abre menus do navegador; Alt+F10 evita conflito.
          if (!event.altKey) return;
          event.preventDefault();
          router.push("/cadastros");
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname, router]);

  return null;
}
