# WEB-CERT — Arquitetura e controles técnicos

## Estado atual do código

- Framework: Next.js App Router, React, TypeScript.
- Hospedagem: Vercel.
- Autenticação: Auth.js com Credentials.
- Base comercial: MongoDB Atlas, conexão por `lib/server/mongodb.ts`, banco configurável em `MONGODB_DB`.
- Arquivos digitais: MongoDB Atlas/GridFS em cluster/banco separados, conexão por `lib/server/certificates-mongodb.ts`.
- UI: componentes React em `components/` e folhas CSS em `app/visual/`.

> Este documento descreve o código atual. Relatórios de inspeção do antigo workbook Excel e fluxos GitHub são históricos e não devem ser tratados como a arquitetura ativa.

## Fluxo de autenticação e autorização

1. `auth.ts` autentica usuários internos contra a coleção `users` do banco comercial.
2. Senhas são verificadas com scrypt e comparação em tempo constante; cada conta possui salt.
3. O bootstrap reconhece Rhuan como admin e Arthur/Wesley como editores. Uma conta nova só é criada quando a variável de senha correspondente existe e contém pelo menos 16 caracteres.
4. `lib/server/access.ts` valida sessão e papel nas rotas. A UI não é a fronteira de segurança: cada endpoint deve exigir a permissão adequada no servidor.
5. A sessão JWT tem duração configurada de 8 horas.

## Registros comerciais

- `app/api/records/route.ts`: leitura e criação de vendas.
- `app/api/records/[rowNumber]/route.ts`: edição e exclusão de venda.
- `lib/server/certificate-store.ts`: persistência na coleção `certificates`, numeração sequencial e controle otimista de versão.
- `lib/server/record-validation.ts`: validação de campos, status, modelo, datas e valores monetários.
- As gravações devem manter as regras comerciais: somente `Cancelado` e `não concluido` ficam fora do cálculo financeiro.

O contador de linha é incrementado atomicamente. A edição compara a versão esperada para evitar sobrescrever uma alteração concorrente. A coleção possui índice único para `rowNumber`.

## Arquivos de certificados digitais

### Fluxo implementado nesta branch

- `GET /api/records/[rowNumber]/certificates`: lista metadados dos arquivos associados a uma venda.
- `POST /api/records/[rowNumber]/certificates`: upload de arquivo, permitido a editores/admins.
- `GET /api/certificates/[fileId]`: download autenticado.
- `components/certificate-files.tsx`: interface de upload, listagem e download exibida na edição da venda.
- `lib/server/certificates-mongodb.ts`: cliente MongoDB separado, GridFS, validação de ObjectId e limite de 10 MB.

O arquivo é associado ao `rowNumber` da venda no campo `metadata` do GridFS. A listagem retorna apenas metadados; o binário só é transmitido pela rota autenticada de download. Extensões aceitas: `.p12` e `.pfx`. O servidor normaliza o nome e registra usuário/data de envio.

### Variáveis de ambiente

- `MONGODB_CERTIFICATES_URI`: URI do cluster exclusivo de arquivos.
- `MONGODB_CERTIFICATES_DB`: banco de arquivos (padrão `certificates_store`).

A aplicação principal continua funcional sem a configuração opcional do cluster de arquivos; as rotas de anexos retornarão erro controlado quando o armazenamento não estiver configurado. Não registrar nem armazenar senhas de certificados.

### Pontos de segurança a validar

- Validar conteúdo binário real do PKCS#12, além da extensão, antes de produção.
- Definir política de retenção e remoção de anexos quando uma venda for excluída.
- Definir se anexos podem ser removidos individualmente e por quais papéis.
- Configurar limite de requisição e monitoramento de falhas de upload/download.
- Confirmar isolamento de rede e usuário de banco com privilégios mínimos.

## Relatórios e regras financeiras

- A lógica de agregação está em `lib/reporting.ts`.
- Os registros elegíveis financeiramente excluem `Cancelado` e `não concluido`.
- Elegibilidade financeira não deve ser rotulada como venda concluída; o status de conclusão é um conceito separado.
- Testes de `tests/reporting.test.ts` cobrem os critérios financeiros.

## CSS e experiência

- `app/visual/` concentra tokens, temas, componentes, formulários, gestão, relatórios, responsividade e movimento.
- Animações devem respeitar `prefers-reduced-motion`.
- Novas telas e estados devem ser testados nos temas claro/escuro e em larguras móveis.

## Testes e implantação

Comandos locais:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

A integração deve ocorrer por branch de trabalho e pull request. A `main` e o Vercel de produção permanecem intocados até que:
1. typecheck, testes e build passem;
2. rotas protegidas sejam revisadas;
3. preview seja testado com dados fictícios;
4. uploads e downloads sejam validados com cluster de teste;
5. configurações de produção e backup tenham sido confirmadas.

## Pendências operacionais

- Auditoria persistente de ações: registrar ator, ação, entidade, data, resultado e identificador de correlação, sem gravar senhas, tokens ou conteúdo de certificados.
- Administração de usuários: criar/editar/desativar contas com controle de acesso administrativo e trilha de auditoria.
- Backup e recuperação: configurar backup independente dos bancos comercial e de arquivos; documentar RPO/RTO e testar restauração.
- Paginação: evitar carregar todos os documentos em memória quando a base crescer; adotar cursor/limites no backend e paginação real no cliente.
- Exclusão e integridade referencial: política explícita para anexos órfãos e ações compensatórias.
- Validação PKCS#12: validar assinatura/formato e, quando possível, conteúdo sem persistir senhas.
- Teste visual manual: validar todas as rotas, temas e breakpoints em preview.

## Legado Excel/GitHub

O projeto teve uma arquitetura anterior baseada em workbook Excel e integração GitHub. Os arquivos e variáveis legados podem permanecer no repositório por compatibilidade/histórico, mas não descrevem o fluxo comercial atual baseado em MongoDB. Não reativar nem remover migrações históricas sem plano de dados e backup aprovado.
