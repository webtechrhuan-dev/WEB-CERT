"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";

type Topic = "home" | "cadastros" | "vendas" | "relatorios";
type Item = { question: string; answer: string };
const CONTENT: Record<Topic, { title: string; intro: string; items: Item[] }> = {
  home: {
    title: "Central de ajuda",
    intro: "Entenda os módulos e por onde começar.",
    items: [
      { question: "Para que serve cada módulo?", answer: "Cadastros permite incluir uma nova venda. Gestão de vendas permite localizar e editar registros existentes. Relatórios reúne indicadores, filtros, gráficos e análises financeiras." },
      { question: "De onde vêm as informações?", answer: "Os módulos consultam a base de dados vinculada à planilha comercial. As alterações salvas são refletidas nas telas que utilizam esses registros." },
      { question: "Posso acessar qualquer módulo?", answer: "O acesso depende da sua sessão e das permissões configuradas para sua conta." }
    ]
  },
  cadastros: {
    title: "Dúvidas sobre cadastros",
    intro: "Orientações para incluir uma venda corretamente.",
    items: [
      { question: "Quais informações devo preencher?", answer: "Informe os dados disponíveis do cliente, contato, período da planilha, data de emissão/renovação, modelo do certificado, faturamento, custo e status. Confira os campos obrigatórios indicados no formulário." },
      { question: "Como funciona a data de vencimento?", answer: "O vencimento é calculado automaticamente para um ano após a data de emissão/renovação. Confira a data de emissão antes de salvar." },
      { question: "Quais status posso selecionar?", answer: "Cancelado, não concluido, Emitido, Pendente instalar, Instalado e Concluido. Selecione a opção que representa a situação atual da venda." },
      { question: "Posso digitar um status diferente?", answer: "Não. O status é selecionado em uma lista para manter a padronização dos registros." },
      { question: "O que conferir antes de salvar?", answer: "Confira principalmente nome do cliente, contato, mês e ano, modelo, datas e valores. Corrija qualquer informação incorreta antes de confirmar o cadastro." }
    ]
  },
  vendas: {
    title: "Ajuda da gestão de vendas",
    intro: "Como localizar, editar e salvar registros.",
    items: [
      { question: "Como encontro uma venda?", answer: "Use os filtros de ano e mês e, se necessário, pesquise pelo nome do cliente. A lista apresenta os registros do período selecionado." },
      { question: "Como edito uma venda?", answer: "Selecione o registro desejado, altere os campos necessários e clique em Salvar alterações. O formulário deve carregar os valores atualmente cadastrados." },
      { question: "Como alterar o status?", answer: "Abra a venda e escolha uma das opções da lista Status / Observação: Cancelado, não concluido, Emitido, Pendente instalar, Instalado ou Concluido. Depois salve as alterações." },
      { question: "Por que o status não aparece selecionado?", answer: "O campo deve apresentar o valor salvo. Se estiver vazio ou diferente do cadastro, não salve por cima: atualize a tela e confira novamente. Se persistir, reporte o registro afetado." },
      { question: "O que fazer se aparecer erro ao salvar?", answer: "Verifique sua conexão e tente atualizar a página. Antes de repetir, confira se a alteração já foi gravada para evitar duplicidade. Se continuar, anote o cliente e a mensagem exibida." },
      { question: "A edição altera os relatórios?", answer: "Sim. Os relatórios usam os dados salvos e aplicam a regra financeira definida para cada status." }
    ]
  },
  relatorios: {
    title: "Dúvidas sobre relatórios",
    intro: "Como interpretar filtros, indicadores e valores financeiros.",
    items: [
      { question: "Quais status entram nos cálculos financeiros?", answer: "Entram Emitido, Pendente instalar, Instalado e Concluido. Não entram Cancelado nem não concluido." },
      { question: "Como é calculado o valor líquido estimado?", answer: "É o faturamento somado dos registros contabilizados menos a soma dos custos desses mesmos registros. Não representa necessariamente lucro contábil ou valor recebido." },
      { question: "Por que o total pode ser diferente do número de clientes?", answer: "O total de registros mostra os itens encontrados pelos filtros. Os indicadores financeiros consideram apenas os registros elegíveis pela regra de status; registros com dados financeiros ausentes podem exigir revisão." },
      { question: "Para que servem as datas e os filtros?", answer: "Data inicial e final limitam o período analisado. Os filtros de modelo e status refinam os registros usados nos gráficos, rankings e relatórios detalhados." },
      { question: "O que significa data divergente/ausente?", answer: "Indica registros com data vazia, inválida ou incompatível com o mês/ano informado na planilha. Revise o cadastro para corrigir a origem." },
      { question: "Os valores são atualizados automaticamente?", answer: "Os relatórios refletem os dados disponíveis quando a tela consulta a base. Após editar uma venda, atualize os relatórios para conferir os totais recalculados." }
    ]
  }
};

export function HelpFaq({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState<number | null>(null);
  const data = CONTENT[topic];
  return (
    <section className="wc-faq" aria-labelledby={`faq-${topic}`}>
      <div className="wc-faq-heading">
        <span className="wc-faq-icon"><Icon name="alert" /></span>
        <div><p className="eyebrow">SUPORTE RÁPIDO</p><h2 id={`faq-${topic}`}>{data.title}</h2><p>{data.intro}</p></div>
      </div>
      <div className="wc-faq-list">
        {data.items.map((item, index) => {
          const expanded = open === index;
          return <article className={`wc-faq-item${expanded ? " is-open" : ""}`} key={item.question}>
            <button type="button" className="wc-faq-question" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)}>
              <span>{item.question}</span><span className="wc-faq-chevron" aria-hidden="true">{expanded ? "−" : "+"}</span>
            </button>
            {expanded && <div className="wc-faq-answer">{item.answer}</div>}
          </article>;
        })}
      </div>
    </section>
  );
}
