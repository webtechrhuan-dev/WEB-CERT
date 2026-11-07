"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type GuideMood = "idle" | "wave" | "think" | "type" | "search" | "happy" | "alert" | "chart";

const routeHints: Record<string, { message: string; mood: GuideMood }> = {
  "/": { message: "Bem-vindo! Vamos começar pelo painel.", mood: "wave" },
  "/dashboard": { message: "Aqui você acompanha os números principais do negócio.", mood: "chart" },
  "/vendas": { message: "Na Gestão de Vendas, você pode consultar e acompanhar cada negociação.", mood: "think" },
  "/cadastros": { message: "Preencha os dados com atenção. A validade é calculada automaticamente.", mood: "think" },
  "/relatorios": { message: "Explore os filtros para encontrar os resultados que precisa.", mood: "chart" },
  "/certificados": { message: "Os certificados ficam vinculados à venda correspondente.", mood: "think" },
  "/registros": { message: "Use os filtros para localizar rapidamente um período ou cliente.", mood: "search" },
};

function routeHint(path: string) {
  const key = Object.keys(routeHints).sort((a, b) => b.length - a.length).find((item) => path === item || path.startsWith(item + "/"));
  if (key) return routeHints[key];
  if (/relat|report/i.test(path)) return routeHints["/relatorios"];
  if (/venda|sale/i.test(path)) return routeHints["/vendas"];
  if (/certific/i.test(path)) return routeHints["/certificados"];
  if (/cadast|registro/i.test(path)) return routeHints["/cadastros"];
  return { message: "Estou por aqui se precisar de uma orientação.", mood: "wave" as GuideMood };
}

export function TechCompanion() {
  const pathname = usePathname();
  const [message, setMessage] = useState("Oi! Sou o Tech. Vou te acompanhar por aqui.");
  const [mood, setMood] = useState<GuideMood>("wave");
  const [expanded, setExpanded] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAction = useRef(0);

  const speak = (text: string, nextMood: GuideMood = "wave", duration = 5200) => {
    setMessage(text);
    setMood(nextMood);
    setExpanded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setExpanded(false);
      setMood("idle");
    }, duration);
  };

  useEffect(() => {
    if (pathname === "/login") {
      speak("Olá! Selecione seu usuário e depois informe a senha.", "wave", 7000);
    } else {
      const hint = routeHint(pathname || "/");
      speak(hint.message, hint.mood, 6500);
    }
  }, [pathname]);

  useEffect(() => {
    const labelOf = (element: Element) => {
      const node = element.closest("button, a, [role='button'], input, select, textarea");
      if (!node) return "";
      const html = node as HTMLElement;
      return [
        html.getAttribute("aria-label"),
        html.getAttribute("title"),
        html.innerText,
        (node as HTMLInputElement).placeholder,
        (node as HTMLInputElement).name,
        (node as HTMLInputElement).id,
      ].filter(Boolean).join(" ").trim().toLocaleLowerCase("pt-BR");
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const label = labelOf(target);
      if (!label || Date.now() - lastAction.current < 900) return;
      lastAction.current = Date.now();

      if (/excluir|remover|apagar|deletar/.test(label)) speak("Atenção: confira o registro e a confirmação antes de excluir.", "alert", 6500);
      else if (/salvar|confirmar|gravar|cadastrar|emitir/.test(label)) speak("Confira os campos e aguarde a confirmação do sistema.", "think", 5600);
      else if (/novo|adicionar|cadastrar venda/.test(label)) speak("Vamos lá! Preencha os dados necessários para continuar.", "wave", 5600);
      else if (/pesquis|buscar|localizar|filtro/.test(label)) speak("Use o campo ou os filtros para refinar sua busca.", "search", 5200);
      else if (/relat|gráfico|grafico|exportar|baixar/.test(label)) speak("Estou analisando com você. Ajuste o período para comparar os resultados.", "chart", 6000);
      else if (/editar|alterar/.test(label)) speak("Faça os ajustes necessários e revise antes de salvar.", "think", 5200);
      else if (/instal|conclu|status/.test(label)) speak("Atualize o andamento conforme a etapa real do atendimento.", "happy", 5200);
    };

    const onInput = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      const id = (target.id + " " + target.name + " " + target.placeholder).toLocaleLowerCase("pt-BR");
      if (/search|busca|pesquis|cliente|nome/.test(id) && target.value.length > 0 && Date.now() - lastAction.current > 1800) {
        lastAction.current = Date.now();
        speak("Pode digitar parte do nome. Vou te lembrar: os filtros ajudam a reduzir a lista.", "search", 4200);
      } else if (pathname === "/login" && /password|senha/.test(id)) {
        speak("Pode digitar sua senha com tranquilidade. Não vou olhar! 🤖", "happy", 3600);
      } else if (Date.now() - lastAction.current > 4500) {
        lastAction.current = Date.now();
        setMood("type");
        setExpanded(false);
      }
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) return;
      if (target instanceof HTMLSelectElement || target.type === "date") {
        speak("Boa! A seleção foi atualizada. Confira os resultados exibidos.", "think", 4200);
      }
    };

    const onSubmit = () => speak("Ação enviada! Aguarde o retorno do sistema antes de repetir.", "think", 6500);

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [pathname]);

  return (
    <aside className={`tech-guide tech-guide--${mood}`} aria-label="Assistente Tech">
      <div className={`tech-guide-bubble${expanded ? " is-visible" : ""}`} role="status" aria-live="polite">
        <span className="tech-guide-bubble-label">DICA DO TECH</span>
        <span>{message}</span>
        <button type="button" className="tech-guide-close" onClick={() => setExpanded(false)} aria-label="Fechar dica">×</button>
      </div>
      <button
        type="button"
        className="tech-guide-character"
        onClick={() => {
          const hint = routeHint(pathname || "/");
          speak(hint.message, "wave", 6500);
        }}
        aria-label="Mostrar dica do Tech"
        title="Dica do Tech"
      >
        <span className="tech-guide-aura" />
        <span className="tech-guide-antenna"><i /></span>
        <span className="tech-guide-head">
          <i className="tech-guide-ear tech-guide-ear--left" />
          <i className="tech-guide-ear tech-guide-ear--right" />
          <span className="tech-guide-face">
            <i className="tech-guide-eye tech-guide-eye--left" />
            <i className="tech-guide-eye tech-guide-eye--right" />
            <i className="tech-guide-mouth" />
          </span>
        </span>
        <span className="tech-guide-neck" />
        <span className="tech-guide-body">
          <i className="tech-guide-core" />
          <i className="tech-guide-detail tech-guide-detail--left" />
          <i className="tech-guide-detail tech-guide-detail--right" />
        </span>
        <i className="tech-guide-arm tech-guide-arm--left"><i className="tech-guide-hand" /></i>
        <i className="tech-guide-arm tech-guide-arm--right"><i className="tech-guide-hand" /></i>
        <i className="tech-guide-ground" />
      </button>
      <span className="tech-guide-name">TECH <i>•</i> ASSISTENTE</span>
    </aside>
  );
}
