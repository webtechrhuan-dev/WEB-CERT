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

    const onFocusIn = (event: FocusEvent) => {\n      const target = event.target;\n      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;\n      const context = [target.id, target.name, target.placeholder, target.closest("label")?.textContent].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");\n      if (/cliente|nome/.test(context)) speak("Aqui você informa o cliente. Confira a grafia para facilitar as próximas buscas.", "think", 4800);\n      else if (/modelo|tipo.*certificado|certificado/.test(context)) speak("Selecione o tipo correto do certificado antes de avançar.", "think", 4600);\n      else if (/valor|faturamento|preço|preco|custo/.test(context)) speak("Confira os valores. O custo e o valor de venda alimentam os indicadores financeiros.", "chart", 5200);\n      else if (/emissão|emissao|data/.test(context)) speak("Atenção às datas: a validade é calculada a partir da emissão.", "think", 5000);\n      else if (/vencimento|validade/.test(context)) speak("Este campo é informativo quando a data vem automaticamente do cadastro.", "alert", 4800);\n      else if (/status|situação|situacao/.test(context)) speak("Escolha o status que representa a etapa atual do atendimento.", "think", 4700);\n      else if (/senha|password/.test(context)) speak("Digite sua senha com tranquilidade. Não vou olhar! 🤖", "happy", 3600);\n      else if (/pfx|arquivo|upload/.test(context)) speak("Confira se selecionou o arquivo PFX correto antes de vinculá-lo.", "think", 5000);\n    };\n\n    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement || target instanceof HTMLInputElement)) return;
      if (target instanceof HTMLSelectElement || target.type === "date") {
        speak("Boa! A seleção foi atualizada. Confira os resultados exibidos.", "think", 4200);
      }
    };

    const onSubmit = () => speak("Ação enviada! Aguarde o retorno do sistema antes de repetir.", "think", 6500);\n\n    const toastObserver = new MutationObserver((mutations) => {\n      for (const mutation of mutations) {\n        const element = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;\n        const notice = element?.closest("[role=alert], [data-sonner-toast], [role=status], .toast, .login-error, .form-message");\n        const text = notice?.textContent?.trim();\n        if (!text || text.length < 4 || text.length > 180 || notice?.classList.contains("tech-guide-bubble")) continue;\n        if (/sucesso|salvo|salva|cadastrad|concluíd|concluido|emitid|excluíd|excluido|atualizad/i.test(text)) {\n          speak("Boa! O sistema confirmou a operação. Vamos para a próxima etapa!", "happy", 6200);\n          break;\n        }\n        if (/erro|falha|inválid|invalido|não foi possível|nao foi possivel|obrigatóri|obrigatorio/i.test(text)) {\n          speak("Opa, encontrei um aviso. Leia a mensagem na tela e ajuste o que for necessário.", "alert", 6800);\n          break;\n        }\n      }\n    });\n    toastObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);\n    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);\n      document.removeEventListener("focusin", onFocusIn, true);\n      toastObserver.disconnect();
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
