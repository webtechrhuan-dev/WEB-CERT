# Certificados Manager

Aplicação interna da Web Tech para consulta, cadastro, edição e relatórios sobre os registros da planilha de certificados. O Excel versionado no GitHub continua sendo a fonte permanente; não há banco de dados tradicional.

## Módulos

- `/` — menu principal.
- `/registros` — consulta da planilha real, pesquisa e paginação.
- `/cadastros` — inclusão de registro com validação e publicação de uma nova versão.
- `/editar` — pesquisa e edição de campos de um registro existente.
- `/relatorios` — agregações reais por ano/mês, modelo ou status/observação, com totais dos valores numéricos de faturamento e custo.

O cadastro permite campos vazios, mas exige ao menos um campo preenchido. Ano deve ter quatro dígitos, datas alteradas devem estar no formato `AAAA-MM-DD` e valores monetários devem ser números não negativos. Duplicidade não é bloqueada: não foi definida uma chave de negócio. Não há exclusão de registros.

## Configuração para usar

Copie `.env.example` para `.env.local` apenas para desenvolvimento e configure as credenciais no ambiente do servidor. Em Vercel, use **Project Settings → Environment Variables**; nunca exponha esses valores em componentes client, repositórios ou logs.

### Login com GitHub

1. Em GitHub → **Settings → Developer settings → OAuth Apps**, crie um OAuth App para o sistema.
2. Configure a Homepage URL como `https://web-cert-five.vercel.app` e o callback como `https://web-cert-five.vercel.app/api/auth/callback/github`. Para desenvolvimento, use `http://localhost:3000/api/auth/callback/github`.
3. Configure `AUTH_GITHUB_ID` e `AUTH_GITHUB_SECRET` na Vercel, junto com o `AUTH_SECRET` já gerado.
4. Defina `AUTH_ALLOWED_GITHUB_LOGINS` com os logins permitidos, separados por vírgulas. `AUTH_EDITOR_GITHUB_LOGINS` concede permissão de edição aos logins listados; os demais ficam como consulta. Uma allowlist vazia mantém a API fechada.

O login GitHub controla o acesso ao sistema, mas não torna privada a planilha quando o repositório GitHub é público.

### Planilha no GitHub

1. Configure `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` e `GITHUB_DATA_PATH` apontando ao repositório, branch e caminho real da planilha. O valor de exemplo do caminho aponta para a raiz; ajuste se o arquivo estiver numa subpasta.
2. Crie um fine-grained token com permissão **Contents: read and write**, limitado apenas ao repositório da planilha, e configure como `GITHUB_TOKEN` no ambiente seguro do servidor/Vercel.
3. O token da planilha não substitui o login da aplicação. Como este repositório está público, qualquer pessoa pode baixar o arquivo Excel diretamente pelo GitHub.

A API lê a versão atual do branch, identifica o commit esperado e publica o workbook atualizado por novos objetos Git e um commit. A referência do branch é atualizada sem `force`; versões obsoletas ou corridas são rejeitadas e exigem recarregar antes de tentar novamente. O token nunca é enviado ao navegador. O histórico de commits é rastreável, mas não substitui backup independente. Branch protection, permissões do token, limites e disponibilidade do GitHub continuam sendo dependências externas.

## Desenvolvimento e verificações

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Sem configuração GitHub, o ambiente de desenvolvimento consegue ler o arquivo local `CERTIFICADOS_UNIFICADOS_2024-2026.xlsx` (ou `EXCEL_FILE_PATH`) para análise; gravações continuam bloqueadas. Em produção, ausência da integração GitHub impede a leitura da fonte permanente. A autenticação Microsoft também precisa estar configurada antes de consultar qualquer dado via API.

Os testes de cadastro e edição trabalham somente em memória e não publicam commits. A integração remota e o login GitHub precisam ser habilitados e verificados após configurar os segredos e as allowlists na Vercel.

## Segurança e implantação

As rotas `/api/records` e `/api/records/[rowNumber]` exigem uma sessão GitHub autorizada pela allowlist; gravações também exigem função `editor`. As respostas não são cacheadas, as falhas não revelam caminhos internos, tokens ou valores do workbook e os logs não incluem células.

Não use o filesystem temporário da Vercel como armazenamento. A planilha local do workspace não garante disponibilidade em produção. Antes de publicar, configure o OAuth do GitHub, domínio/callback, usuários permitidos, variáveis de ambiente e uma política de backup/recuperação.

O arquivo oficial da logo não está no workspace; consulte [public/brand/README.md](./public/brand/README.md). O protótipo `Layout/index.html` não está presente e não foi recriado.
