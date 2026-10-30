"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Topic = "home" | "cadastros" | "vendas" | "relatorios";
type Item = { question: string; answer: string };
type Shortcut = { key: string; label: string };
const SHORTCUTS: Record<Topic, Shortcut[]> = {
  home: [{key:"Insert",label:"Abrir novo cadastro"},{key:"F8",label:"Abrir relatórios"},{key:"F9",label:"Abrir gestão de vendas"},{key:"Alt + F10",label:"Abrir cadastros"},{key:"Alt + F3",label:"Ir para pesquisa (quando disponível)"},{key:"Ctrl + S",label:"Salvar formulário aberto"},{key:"Esc",label:"Fechar janela ou diálogo"}],
  cadastros: [{key:"Insert",label:"Abrir a tela de novo cadastro"},{key:"Ctrl + S",label:"Salvar cadastro"},{key:"F8",label:"Abrir relatórios"},{key:"F9",label:"Abrir gestão de vendas"},{key:"Esc",label:"Fechar janela ou diálogo"}],
  vendas: [{key:"F2",label:"Selecionar/abrir a primeira venda ou a venda selecionada"},{key:"Alt + F3",label:"Focar a pesquisa de cliente"},{key:"F4",label:"Focar o campo de status na edição aberta"},{key:"Insert",label:"Abrir novo cadastro"},{key:"Ctrl + S",label:"Salvar edição"},{key:"F8",label:"Abrir relatórios"},{key:"Esc",label:"Fechar janela ou diálogo"}],
  relatorios: [{key:"F9",label:"Abrir gestão de vendas"},{key:"Insert",label:"Abrir novo cadastro"},{key:"Alt + F10",label:"Abrir cadastros"},{key:"Esc",label:"Fechar janela ou diálogo"}]
};
const CONTENT: Record<Topic, { title: string; intro: string; items: Item[] }> = {
  home: { title: "Ajuda do sistema", intro: "Informações para navegar pelo WEB-CERT.", items: [
    { question: "Para que serve cada módulo?", answer: "Cadastros permite incluir uma nova venda. Gestão de vendas permite localizar e editar registros existentes. Relatórios reúne indicadores, filtros, gráficos e análises financeiras." },
    { question: "De onde vêm as informações?", answer: "Os módulos consultam a base de dados vinculada à planilha comercial. As alterações salvas são refletidas nas telas que utilizam esses registros." },
    { question: "O que fazer se uma tela não carregar?", answer: "Confira sua conexão, atualize a página e tente novamente. Se o problema continuar, registre a tela e a mensagem de erro para o suporte." }
  ]},
  cadastros: { title: "Ajuda — Cadastros", intro: "Orientações para incluir uma venda corretamente.", items: [
    { question: "Quais informações devo preencher?", answer: "Informe os dados do cliente, contato, ano e mês da planilha, data de emissão/renovação, modelo, faturamento, custo e status. Confira os campos obrigatórios do formulário." },
    { question: "Como funciona a data de vencimento?", answer: "O vencimento é calculado automaticamente para um ano após a data de emissão/renovação. Confira a data de emissão antes de salvar." },
    { question: "Quais status posso selecionar?", answer: "Cancelado, não concluido, Emitido, Pendente instalar, Instalado e Concluido. Selecione a opção que representa a situação atual da venda." },
    { question: "O que conferir antes de salvar?", answer: "Confira nome do cliente, contato, mês e ano, modelo, datas e valores. Corrija qualquer informação incorreta antes de confirmar o cadastro." }
  ]},
  vendas: { title: "Ajuda — Gestão de vendas", intro: "Como localizar, editar e salvar registros.", items: [
    { question: "Como encontro uma venda?", answer: "Use os filtros de ano e mês e, se necessário, pesquise pelo nome do cliente." },
    { question: "Como edito uma venda?", answer: "Selecione o registro, altere os campos necessários e clique em Salvar alterações. O formulário deve carregar os valores atualmente cadastrados." },
    { question: "Como alterar o status?", answer: "Escolha uma das opções da lista Status / Observação: Cancelado, não concluido, Emitido, Pendente instalar, Instalado ou Concluido. Depois salve as alterações." },
    { question: "O que fazer se aparecer erro ao salvar?", answer: "Verifique sua conexão. Antes de repetir, confira se a alteração já foi gravada para evitar duplicidade. Se continuar, anote o cliente e a mensagem exibida." },
    { question: "A edição altera os relatórios?", answer: "Sim. Os relatórios usam os dados salvos e aplicam a regra financeira definida para cada status." }
  ]},
  relatorios: { title: "Ajuda — Relatórios", intro: "Como interpretar filtros, indicadores e valores financeiros.", items: [
    { question: "Quais status entram nos cálculos financeiros?", answer: "Entram Emitido, Pendente instalar, Instalado e Concluido. Não entram Cancelado nem não concluido." },
    { question: "Como é calculado o valor líquido estimado?", answer: "É o faturamento somado dos registros contabilizados menos a soma dos custos desses mesmos registros. Não representa necessariamente lucro contábil ou valor efetivamente recebido." },
    { question: "Por que o total pode ser diferente do número de registros?", answer: "O total de registros mostra os itens encontrados pelos filtros. Os indicadores financeiros consideram apenas os registros elegíveis pela regra de status." },
    { question: "Para que servem as datas e os filtros?", answer: "Data inicial e final limitam o período analisado. Os filtros de modelo e status refinam os registros usados nos gráficos, rankings e relatórios detalhados." },
    { question: "O que significa data divergente/ausente?", answer: "Indica registros com data vazia, inválida ou incompatível com o mês/ano informado na planilha. Revise o cadastro para corrigir a origem." },
    { question: "Os valores são atualizados automaticamente?", answer: "Após editar uma venda, atualize os relatórios para consultar os totais recalculados com os dados salvos." }
  ]}
};

export function HelpFaq({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const legendTriggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const openHelp = () => { setExpanded(0); setOpen(true); };
    window.addEventListener("webcert:open-help", openHelp);
    return () => window.removeEventListener("webcert:open-help", openHelp);
  }, []);
  const data = CONTENT[topic];
  useEffect(() => {
    if (!legendOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setLegendOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [legendOpen]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(".wc-help-dialog");
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKey); triggerRef.current?.focus(); };
  }, [open]);
  if (!mounted) return null;
  return createPortal(<>
    <div className="wc-floating-tools" aria-label="Ferramentas de ajuda">
      <button ref={triggerRef} type="button" className="wc-help-trigger" aria-label="Abrir ajuda desta tela" title="Ajuda desta tela" onClick={() => { setExpanded(0); setOpen(true); }}>
        <span aria-hidden="true">?</span>
      </button>
      <button ref={legendTriggerRef} type="button" className="wc-legend-trigger" aria-label="Abrir atalhos e legendas desta tela" title="Atalhos e legendas" onClick={() => setLegendOpen(true)}><span aria-hidden="true">i</span></button>
    </div>
    {legendOpen && <div className="wc-help-backdrop wc-legend-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setLegendOpen(false); }}>
      <section className="wc-help-dialog wc-legend-dialog" role="dialog" aria-modal="true" aria-labelledby="wc-legend-title">
        <header className="wc-help-dialog-header"><span className="wc-help-dialog-symbol wc-legend-symbol" aria-hidden="true">i</span><div><p className="eyebrow">CONSULTA RÁPIDA</p><h2 id="wc-legend-title">Atalhos e legendas</h2><p>Comandos e indicadores desta tela.</p></div><button type="button" className="wc-help-close" aria-label="Fechar atalhos e legendas" onClick={() => setLegendOpen(false)}>×</button></header>
        <div className="wc-help-dialog-body"><section className="wc-help-shortcuts wc-legend-shortcuts"><div className="wc-help-shortcuts-heading"><div><p className="eyebrow">PRODUTIVIDADE</p><h3>Atalhos desta tela</h3></div><span aria-hidden="true">⌨</span></div><div className="wc-help-shortcuts-list">{SHORTCUTS[topic].map((shortcut) => <div className="wc-help-shortcut" key={shortcut.key}><kbd>{shortcut.key}</kbd><span>{shortcut.label}</span></div>)}</div><p className="wc-help-shortcuts-note">Atalhos de navegação não são executados enquanto você digita em campos. Ctrl + S salva o formulário quando houver um formulário disponível.</p></section>
          <section className="wc-help-legend-list" aria-label="Legenda dos elementos"><h3>Legenda dos elementos</h3><div className="wc-help-legend-row"><span className="wc-help-legend-mark wc-mark-required">*</span><span><strong>Campo obrigatório</strong><small>Precisa ser preenchido para concluir o cadastro.</small></span></div><div className="wc-help-legend-row"><span className="wc-help-legend-mark wc-mark-focus"></span><span><strong>Campo em destaque</strong><small>Indica foco ou seleção atual na interface.</small></span></div><div className="wc-help-legend-row"><span className="wc-help-legend-mark wc-mark-help">?</span><span><strong>Central de ajuda</strong><small>Abre explicações e orientações sobre esta tela.</small></span></div><div className="wc-help-legend-row"><span className="wc-help-legend-mark wc-mark-info">i</span><span><strong>Atalhos e legendas</strong><small>Mostra os comandos e o significado dos indicadores.</small></span></div></section>
        </div><footer className="wc-help-footer">As informações são específicas da tela atualmente aberta.</footer>
      </section>
    </div>}
    {open && <div className="wc-help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="wc-help-dialog" role="dialog" aria-modal="true" aria-labelledby="wc-help-title">
        <header className="wc-help-dialog-header">
          <span className="wc-help-dialog-symbol" aria-hidden="true">?</span>
          <div><p className="eyebrow">CENTRAL DE AJUDA</p><h2 id="wc-help-title">{data.title}</h2><p>{data.intro}</p></div>
          <button ref={closeRef} type="button" className="wc-help-close" aria-label="Fechar ajuda" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="wc-help-dialog-body">
          {data.items.map((item, index) => {
            const active = expanded === index;
            return <article className={`wc-help-item${active ? " is-open" : ""}`} key={item.question}>
              <button type="button" className="wc-help-question" aria-expanded={active} onClick={() => setExpanded(active ? null : index)}>
                <span>{item.question}</span><span className="wc-help-plus" aria-hidden="true">{active ? "−" : "+"}</span>
              </button>
              {active && <p className="wc-help-answer">{item.answer}</p>}
            </article>;
          })}
        </div>
        <section className="wc-help-shortcuts" aria-label="Atalhos de teclado">
          <div className="wc-help-shortcuts-heading"><div><p className="eyebrow">PRODUTIVIDADE</p><h3>Atalhos desta tela</h3></div><span aria-hidden="true">⌨</span></div>
          <div className="wc-help-shortcuts-list">{SHORTCUTS[topic].map((shortcut) => <div className="wc-help-shortcut" key={shortcut.key}><kbd>{shortcut.key}</kbd><span>{shortcut.label}</span></div>)}</div>
          <p className="wc-help-shortcuts-note">Os atalhos não são executados enquanto você digita em campos. F3 e F10 nativos do navegador são preservados; use Alt + F3 e Alt + F10 no sistema.</p>
        </section>
        <footer className="wc-help-footer">As orientações e os atalhos são específicos desta tela.</footer>
      </section>
    </div>}
  </>, document.body);
}
