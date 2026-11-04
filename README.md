# WEB-CERT — Gestão de certificados digitais | Web Tech

Aplicação interna para cadastro, consulta, edição, relatórios e gestão de arquivos de certificados digitais. A aplicação usa Next.js App Router, TypeScript, Auth.js e MongoDB Atlas. A hospedagem é feita na Vercel.

## Módulos

- `/` — painel inicial.
- `/login` — autenticação interna.
- `/cadastros` — cadastro de vendas.
- `/editar` — consulta por ano/mês, pesquisa por cliente e edição inline.
- `/registros` — consulta de registros.
- `/relatorios` — indicadores financeiros e relatórios por período/status.
- Anexos da venda — upload, listagem e download de arquivos `.p12` e `.pfx` dentro da edição de uma venda.

## Dados e persistência

- A base comercial principal usa a variável `MONGODB_URI` e o banco definido por `MONGODB_DB` (padrão `web_cert`). A coleção `certificates` contém os registros de venda.
- Os arquivos binários de certificados são armazenados separadamente em MongoDB Atlas/GridFS, usando `MONGODB_CERTIFICATES_URI` e `MONGODB_CERTIFICATES_DB` (padrão `certificates_store`). Não se deve apontar essa URI para o cluster comercial se a intenção for manter os arquivos isolados.
- Cada arquivo recebe metadados de associação ao `rowNumber` da venda, nome original, usuário e data de envio.
- Não armazene senhas dos arquivos PFX/P12 no banco, em logs ou em variáveis de ambiente.
- O sistema não deve usar o filesystem efêmero da Vercel como armazenamento permanente.

## Acesso e segurança

- A autenticação usa usuário e senha internos, com hash scrypt e salt aleatório persistidos na coleção `users` do banco principal.
- Usuários de bootstrap: `rhuan` (administrador), `arthur` e `wesley` (editores). O bootstrap só cria contas quando as variáveis de senha correspondentes estão configuradas com pelo menos 16 caracteres; valores existentes não são sobrescritos.
- `AUTH_SECRET` e `MONGODB_URI` são necessários para autenticação.
- Consultar vendas e baixar anexos exige sessão autenticada. Alterar vendas e enviar anexos exige papel `editor` ou `admin`.
- Upload aceita somente extensão `.p12` ou `.pfx`, até 10 MB por arquivo.
- Segredos devem existir apenas nas variáveis de ambiente do servidor/Vercel. Nunca incluir valores reais em commits ou no bundle do navegador.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` apenas no desenvolvimento e preencha os valores localmente. Em produção, configure no painel da Vercel:

- `AUTH_SECRET`
- `MONGODB_URI` e `MONGODB_DB`
- `MONGODB_CERTIFICATES_URI` e `MONGODB_CERTIFICATES_DB`
- `BOOTSTRAP_RHUAN_PASSWORD`, `BOOTSTRAP_ARTHUR_PASSWORD`, `BOOTSTRAP_WESLEY_PASSWORD` (somente para provisionar contas ainda inexistentes)

As variáveis `EXCEL_FILE_PATH` e `GITHUB_*` são compatibilidade/documentação de fluxos anteriores; não representam a fonte principal do cadastro atual.

## Desenvolvimento e validação

Requisitos: Node.js compatível com a versão do Next.js do projeto e npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Os testes unitários devem usar dados sintéticos e mocks; não devem modificar o banco de produção nem carregar arquivos reais de clientes. Testes de integração com MongoDB devem usar um banco isolado e credenciais próprias.

## Implantação e operação

1. Configure as variáveis de ambiente de produção na Vercel.
2. Verifique conectividade e permissões do cluster comercial e do cluster de arquivos.
3. Confirme que o usuário de banco tem acesso mínimo necessário às coleções.
4. Execute CI (typecheck, testes e build) antes de integrar na `main`.
5. Valide autenticação, cadastro, edição, relatórios, upload e download em preview com dados de teste.
6. Configure backup independente para os dois bancos, incluindo política de retenção e teste de restauração.

## Limitações conhecidas / próximos controles

- A tela de administração completa de usuários ainda precisa ser implementada.
- Auditoria persistente de ações de usuários ainda precisa ser concluída.
- Backup independente e restauração ainda dependem de configuração operacional no Atlas e de ensaio de recuperação.
- Paginação no acesso ao MongoDB precisa ser aplicada nos endpoints de consulta para volumes maiores.
- A exclusão de uma venda e a retenção/limpeza de anexos relacionados precisam de política explícita antes de habilitar exclusões em massa.
- A presença das variáveis de ambiente e a conectividade dos clusters devem ser verificadas no projeto Vercel; este repositório não contém nem deve conter credenciais.

## Identidade visual

A interface utiliza a identidade visual Web Tech. Não inclua arquivos de logo ou credenciais de clientes sem autorização e origem confirmada.
