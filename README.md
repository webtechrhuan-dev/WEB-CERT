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

### Microsoft Entra ID

1. Registre uma aplicação corporativa de tenant único no Microsoft Entra.
2. Cadastre os callback URLs:
   - Desenvolvimento: `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   - Produção: `https://SEU-DOMINIO/api/auth/callback/microsoft-entra-id`
3. Configure no servidor `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET` e `AUTH_MICROSOFT_ENTRA_ID_ISSUER` (`https://login.microsoftonline.com/ID-DO-TENANT/v2.0/`).
4. Defina `AUTH_ALLOWED_EMAILS` como lista separada por vírgulas de e-mails exatos permitidos. `AUTH_EDITOR_EMAILS` concede permissão de alteração somente aos e-mails listados; os demais são somente consulta. Não configure uma lista vazia para liberar acesso: sem configuração completa, a API fecha o acesso.

Gere `AUTH_SECRET` com um valor aleatório forte e mantenha o segredo apenas no ambiente do servidor.

### Planilha no GitHub

1. Configure `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` e `GITHUB_DATA_PATH` apontando ao repositório, branch e caminho real da planilha. O valor de exemplo do caminho aponta para a raiz; ajuste se o arquivo estiver numa subpasta.
2. Crie um fine-grained token com permissão **Contents: read and write**, limitado apenas ao repositório da planilha, e configure como `GITHUB_TOKEN` no ambiente seguro do servidor/Vercel.
3. Mantenha o repositório privado. O acesso privado ao GitHub não substitui o login da aplicação.

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

Os testes de cadastro e edição trabalham somente em memória e não publicam commits. Não há credenciais GitHub/Entra configuradas neste workspace, portanto a integração remota deve ser habilitada e verificada após configurar segredos e o repositório na Vercel.

## Segurança e implantação

As rotas `/api/records` e `/api/records/[rowNumber]` exigem uma sessão Microsoft autorizada; gravações também exigem função `editor`. As respostas não são cacheadas, as falhas não revelam caminhos internos, tokens ou valores do workbook e os logs não incluem células.

Não use o filesystem temporário da Vercel como armazenamento. A planilha local do workspace não garante disponibilidade em produção. Antes de publicar, configure a autenticação, o GitHub, domínio/callbacks, usuários permitidos, variáveis de ambiente e uma política de backup/recuperação.

O arquivo oficial da logo não está no workspace; consulte [public/brand/README.md](./public/brand/README.md). O protótipo `Layout/index.html` não está presente e não foi recriado.
