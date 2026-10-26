# Arquitetura e relatório técnico

## Estado verificado

O terminal PowerShell acessou o workspace local em `C:\WEB CERT\WEB-CERT-main` e leu o workbook original em modo somente leitura. O editor consegue exibir os arquivos de texto, mas não renderiza o conteúdo binário XLSX. A busca de ferramentas do VS Code nesta sessão não encontrou um inspetor de planilhas; Python e pacotes Node para XLSX também não estavam disponíveis. A inspeção foi feita com as APIs ZIP/XML do .NET já presentes no PowerShell, sem copiar, converter ou modificar o arquivo.

O arquivo `CERTIFICADOS_UNIFICADOS_2024-2026.xlsx` permanece intacto. O terminal não encontrou `git`; o workspace não está configurado como repositório Git nesta máquina. `Layout/index.html` não está presente no workspace atual e não foi recriado nem removido por esta etapa.

## Relatório de qualidade do workbook

Inspeção estrutural das partes XML do arquivo. Nenhum valor de célula foi incluído neste relatório.

| Aba | Estado | Registros abaixo do cabeçalho | Colunas |
|---|---|---:|---:|
| Todos os dados | Visível | 170 | 9 |

Cabeçalhos detectados:

1. Ano da planilha
2. Mês da planilha
3. Cliente
4. Contato
5. Data de emissão/renovação
6. Modelo
7. Faturamento (R$)
8. Custo (R$)
9. Status / Observação

| Campo | Preenchidos | Vazios | Tipos/observações estruturais |
|---|---:|---:|---|
| Ano da planilha | 170 | 0 | Numérico |
| Mês da planilha | 170 | 0 | Texto |
| Cliente | 142 | 28 | Texto |
| Contato | 93 | 77 | 88 células de texto e 5 numéricas |
| Data de emissão/renovação | 138 | 32 | 110 datas numéricas com formato de data e 28 células de texto não interpretáveis como data |
| Modelo | 140 | 30 | 112 células de texto e 28 numéricas |
| Faturamento (R$) | 128 | 42 | Numérico em todas as células preenchidas; nenhum negativo |
| Custo (R$) | 132 | 38 | Numérico em todas as células preenchidas; nenhum negativo |
| Status / Observação | 62 | 108 | Texto |

Outras verificações:

- 355 células vazias na área de dados (170 linhas × 9 colunas).
- 1 linha repetida exatamente em todas as colunas preenchidas; não foi inferida uma chave de negócio para procurar duplicidades parciais.
- 0 fórmulas e 0 células com erros Excel detectáveis.
- Entre as 110 datas numéricas formatadas como data, foram contadas 11 divergências com o ano da planilha e 4 divergências com o mês da planilha.
- Os 28 valores textuais no campo de data não foram interpretáveis pelo parser de data pt-BR utilizado. Seu conteúdo não foi revelado; podem exigir classificação manual em vez de exclusão automática.
- As contagens numéricas em `Contato` e `Modelo` e a mistura de formatos no campo de data são alertas de consistência, não conclusões de erro sem entendimento das regras de negócio.

Os vazios não são necessariamente inválidos: obrigatoriedade, significado de “status”, chaves e duplicidade dependem de validação com o responsável pelos dados. Essa inspeção não recalculou fórmulas (não havia fórmulas), não abriu o arquivo no Excel e não alterou qualquer célula.

## Arquitetura implementada e limites atuais

- Aplicação: Next.js App Router, TypeScript, React e Tailwind CSS.
- Fonte permanente dos dados comerciais: Excel versionado em repositório GitHub; não haverá banco de dados tradicional.
- Hospedagem: Vercel, sem usar seu filesystem temporário como persistência.
- Acesso ao GitHub: apenas no backend, por `lib/server/github-workbook.ts`.
- GitHub OAuth/Auth.js protege as rotas de dados por allowlist explícita de logins. `AUTH_EDITOR_GITHUB_LOGINS` separa editores de usuários de consulta.
- As regras de entrada preservam campos opcionais; ano deve ter quatro dígitos, datas alteradas usam ISO válido e valores monetários são finitos e não negativos. Não existe deduplicação nem exclusão, pois não há chave de negócio.
- `Layout/index.html` não está presente no workspace atual; a página administrativa é independente e não substitui um arquivo ausente.
- O formato continua baseado nos nove cabeçalhos reais. Datas históricas em texto e vazios não são normalizados automaticamente.
- As credenciais OAuth e o token GitHub não ficam no workspace; integração remota e autenticação real dependem da configuração segura das variáveis de ambiente.

## Leitura implementada

- `GET /api/records` executa exclusivamente no runtime Node.js e exige uma sessão autorizada.
- O serviço usa ExcelJS para abrir a aba `Todos os dados`. Exige o conjunto de cabeçalhos confirmado acima, mantém a ordem presente no workbook e representa as células vazias como `null`. Linhas sem dados são ignoradas.
- ExcelJS não resolve corretamente a referência absoluta da tabela `xl/tables/table1.xml` deste workbook. Para leitura, o serviço ajusta essa referência no ZIP em memória antes de analisá-lo. Os bytes originais nunca são regravados; a mudança afeta apenas a referência estrutural usada pelo parser.
- Datas Excel são serializadas em ISO `AAAA-MM-DD`; textos na coluna de data permanecem com seu valor original e recebem um campo `parsed` apenas quando correspondem sem ambiguidade a `D/M/AAAA` ou `AAAA-M-D`. Texto não interpretável e números sem tipo de data são marcados como não validados, sem conversão presumida. Números e textos de outras colunas mantêm seus tipos.
- A API responde com cabeçalhos, quantidade, registros, origem e versão opaca (SHA do commit remoto ou hash local). Falhas conhecidas retornam mensagens genéricas. Respostas usam `Cache-Control: no-store`; a rota não registra valores de células.
- Com configuração GitHub completa, o servidor lê o branch e a planilha via Git Data API. Sem ela, apenas desenvolvimento pode ler o arquivo local; produção falha explicitamente e não depende do filesystem da Vercel.
- A interface apresenta os cabeçalhos e valores, busca textual, paginação de 20 linhas, carregamento, erro e estado vazio. Campos monetários confirmados são formatados para exibição em BRL; as datas válidas são exibidas em pt-BR. Os valores retornados não são editados.
- Os dados pessoais retornados pela API são protegidos por sessão Entra e allowlist. A qualidade e eficácia da configuração precisam ser verificadas no tenant e deployment reais antes de disponibilizar a produção.

## Menu principal

- `/` é o menu principal; `/registros` consulta; `/cadastros` inclui; `/editar` localiza e altera uma linha; `/relatorios` agrega por período, modelo ou status/observação.
- Cadastro/edição são exibidos e executados apenas por editores; a API revalida o papel no servidor. O navegador envia somente campos alterados no modo de edição.
- Os relatórios usam dados reais. Os totais de faturamento/custo somam valores numéricos preenchidos, sem inferir valores ausentes.

## Persistência versionada no GitHub

1. **Ler:** o backend resolve o branch em commit SHA, obtém árvore, blob e bytes do arquivo configurado pela Git Data API.
2. **Identificar versão:** a resposta entrega o SHA de commit ao cliente; o servidor compara a versão solicitada com o snapshot atual e não confia em SHA do navegador.
3. **Validar:** ExcelJS carrega os bytes em memória, confere aba e cabeçalhos, valida os campos, serializa e reabre a saída. Testes do workbook local verificam as linhas não alteradas e a referência da tabela após inclusão.
4. **Alterar:** `POST /api/records` e `PATCH /api/records/[rowNumber]` exigem papel `editor`; nenhuma credencial do GitHub sai do backend.
5. **Publicar:** o serviço cria blob, árvore e commit com o commit-base como pai, então atualiza a referência do branch com `force=false`.
6. **Detectar conflito:** SHA obsoleto é rejeitado antes da gravação; divergência entre leitura e atualização da ref também é rejeitada pelo GitHub. A interface pede atualização e nunca reaplica a edição antiga automaticamente.
7. **Falha ambígua:** objetos Git não referenciados podem ficar órfãos. Em erro na atualização da ref, o serviço relê o branch e distingue commit publicado, conflito ou indisponibilidade, sem presumir sucesso.
8. **Histórico e recuperação:** commits preservam versões anteriores, mas não são backup independente nem transação de banco. É necessário aprovar e configurar uma política independente de backup/restauração antes de produção.
9. **Credenciais:** token, proprietário, repositório, branch e caminho são variáveis somente do servidor/Vercel. Recomenda-se token fine-grained limitado ao repositório, com Contents read/write.

O GitHub não é banco transacional: permanecem limites de API, disponibilidade, branch protection, operações parciais e necessidade de backup separado. A integração não foi testada contra o repositório remoto porque as credenciais não estão configuradas no workspace.

## Estrutura da aplicação

```text
app/
  api/auth/[...nextauth]/route.ts
  api/records/[rowNumber]/route.ts
  api/records/route.ts
  cadastros/page.tsx
  editar/page.tsx
  globals.css
  layout.tsx
  login/page.tsx
  page.tsx
  relatorios/page.tsx
  registros/page.tsx
components/
  app-header.tsx
  auth-control.tsx
  icon.tsx
  login-button.tsx
  record-management.tsx
  reports-page.tsx
  records-page.tsx
  session-provider.tsx
lib/
  client/use-workbook-data.ts
  reporting.ts
  server/access.ts
  server/api-errors.ts
  server/github-workbook.ts
  server/workbook-mutations.ts
  server/workbook-store.ts
  server/workbook.ts
  server/workbook-api.ts
  workbook-types.ts
tests/
  github-workbook.test.ts
  reporting.test.ts
  workbook.test.ts
types/
  exceljs.d.ts
  next-auth.d.ts
next.config.ts
postcss.config.mjs
tsconfig.json
package.json
package-lock.json
vitest.config.mts
```

Tailwind CSS 4 é integrado pelo plugin oficial de PostCSS. O `.gitignore` exclui `.env*` (mantém `.env.example`), dependências e artefatos Next. `.env.example` documenta as variáveis de servidor para GitHub OAuth e acesso ao workbook, sem credenciais reais.

## Testes e preparação de implantação

Os testes usam registros sintéticos para os casos unitários e leem a planilha local sem imprimir valores. Cobrem leitura válida, arquivo inexistente, cabeçalhos, células vazias, datas, workbook inválido, mutações em memória, preservação de linhas, expansão da tabela, validação, relatórios e rejeição de uma versão GitHub obsoleta.

Antes de produção: configurar e testar o OAuth GitHub, domínio, callback e allowlists; configurar token GitHub e branch; verificar permissões da Vercel; estabelecer backup/restauração independente; validar manualmente as divergências históricas e testar atualização/conflito real sem expor dados pessoais. A integração externa não pode ser validada sem as credenciais do proprietário do projeto.

## Referências

- [GitHub REST API: Git references](https://docs.github.com/en/rest/git/refs)
- [GitHub REST API: Git commits](https://docs.github.com/en/rest/git/commits)
- [Auth.js: GitHub](https://authjs.dev/getting-started/providers/github)