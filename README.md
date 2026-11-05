# WEB-CERT — Gestão de certificados digitais | Web Tech

Aplicação interna da Web Tech para cadastro e gestão de vendas de certificados digitais, acompanhamento de vencimentos, relatórios e armazenamento seguro de arquivos PFX/P12.

## Módulos

- `/` — painel inicial.
- `/login` — autenticação interna.
- `/cadastros` — cadastro de vendas.
- `/editar` — consulta por período, pesquisa por cliente e edição inline.
- `/registros` — consulta de registros.
- `/relatorios` — indicadores financeiros e relatórios por período/status.
- `/admin/usuarios` — administração de contas, papéis e ativação (somente administrador).
- `/auditoria` — consulta da trilha de auditoria (somente administrador).
- Anexos da venda — upload, listagem, download e exclusão individual de arquivos `.p12` e `.pfx` na edição de uma venda.

## Dados e persistência

- A base comercial usa `MONGODB_URI` e o banco definido por `MONGODB_DB` (padrão `web_cert`). A coleção `certificates` contém os registros de venda.
- Os binários dos certificados ficam em outro MongoDB Atlas/GridFS, configurado por `MONGODB_CERTIFICATES_URI` e `MONGODB_CERTIFICATES_DB` (padrão `certificates_store`). Para manter isolamento, a URI deve apontar para o cluster de arquivos, não para o cluster comercial.
- Cada arquivo é associado ao `rowNumber` da venda por metadados GridFS. O sistema cria índice composto em `metadata.rowNumber` e `uploadDate` para acelerar a listagem e a contagem de anexos.
- O armazenamento permanente não depende do filesystem efêmero da Vercel.
- Não armazene senhas de PFX/P12 no banco, em logs ou em variáveis de ambiente.

## Acesso e segurança

- Auth.js com credenciais internas; senhas persistidas com scrypt e salt aleatório.
- Contas de bootstrap: `rhuan` (administrador), `arthur` e `wesley` (editores). O bootstrap só cria contas inexistentes quando as variáveis de senha correspondentes estão configuradas com pelo menos 16 caracteres; não sobrescreve credenciais existentes.
- `AUTH_SECRET` e `MONGODB_URI` são necessários para autenticação e acesso à base comercial.
- Cada rota protegida valida a sessão e o papel atual do usuário no MongoDB. A interface não substitui a autorização no servidor.
- Consultar vendas e baixar anexos exige sessão autenticada. Criar/editar vendas e enviar/remover anexos exige papel `editor` ou `admin`.
- A administração de usuários é exclusiva de administradores e protege contra auto-rebaixamento/desativação e contra desativar o último administrador ativo.
- A exclusão de venda exige reautenticação com usuário e senha. Uma venda com anexos não pode ser excluída; os arquivos devem ser removidos individualmente primeiro.
- Upload aceita somente extensão `.p12` ou `.pfx`, até 10 MB por arquivo. O corpo multipart é limitado por bytes efetivamente recebidos, inclusive quando `Content-Length` está ausente ou incorreto.
- A checagem do marcador ASN.1 DER inicial é apenas estrutural e não substitui validação criptográfica completa do PKCS#12.
- Downloads e exclusões de anexos usam reservas individuais com expiração para reduzir condições de corrida entre transmissão e remoção.
- A trilha de auditoria registra ações comerciais, de usuários e de certificados sem armazenar senhas, tokens ou conteúdo binário.

## Variáveis de ambiente

Use `.env.example` como referência. Em desenvolvimento, configure valores locais em `.env.local`; em produção, configure-os no painel da Vercel:

- `AUTH_SECRET`
- `MONGODB_URI` e `MONGODB_DB`
- `MONGODB_CERTIFICATES_URI` e `MONGODB_CERTIFICATES_DB`
- `BOOTSTRAP_RHUAN_PASSWORD`, `BOOTSTRAP_ARTHUR_PASSWORD`, `BOOTSTRAP_WESLEY_PASSWORD` (somente para provisionar contas ainda inexistentes)

As variáveis `EXCEL_FILE_PATH` e `GITHUB_*` pertencem à arquitetura histórica e não representam a fonte atual dos dados comerciais. Nunca inclua valores reais de segredos em commits ou no bundle do navegador.

## Desenvolvimento e validação

Requisitos: Node.js compatível com a versão do Next.js do projeto e npm.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
```

Os testes unitários usam dados sintéticos e mocks; não devem modificar bancos de produção nem carregar certificados reais. Testes de integração MongoDB devem usar bancos isolados e credenciais próprias.

## Implantação e operação

1. Configure as variáveis de ambiente na Vercel.
2. Confirme conectividade e permissões mínimas nos dois clusters.
3. Execute CI (testes, TypeScript e build) antes de integrar na `main`.
4. Valide autenticação, cadastro, edição, relatórios, administração, auditoria e fluxo de anexos com dados fictícios.
5. Configure backup independente dos bancos comercial e de arquivos e faça um ensaio de restauração.
6. Monitore falhas de upload/download, bloqueios de concorrência e gravações de auditoria.

A integração ocorre por branch de trabalho e pull request. A `main` e a produção Vercel só devem ser alteradas após aprovação explícita e conclusão das validações.

## Limitações e próximos controles

- O cluster separado de certificados precisa estar configurado no ambiente e validado com upload/download de teste.
- Backup, retenção, RPO/RTO e restauração dos dois bancos ainda dependem de configuração operacional e ensaio no Atlas.
- A paginação da consulta comercial é atualmente client-side; a API ainda carrega o conjunto completo. Migrar para paginação por cursor no MongoDB quando o volume justificar.
- A validação de arquivo verifica extensão, tamanho e marcador ASN.1 inicial; ainda não realiza validação criptográfica completa nem inspeciona validade, cadeia ou chave privada do certificado.
- O limite do multipart protege o tamanho total recebido, mas o corpo é materializado em memória antes do parsing; não é upload em streaming direto para o GridFS.
- A auditoria é best-effort: falha na gravação não desfaz uma operação principal já concluída. Alertas e reconciliação operacional continuam pendentes.

## Identidade visual

A interface utiliza a identidade visual Web Tech, com temas claro/escuro, componentes responsivos e suporte a `prefers-reduced-motion`. Preserve o logo oficial e valide novos componentes nos dois temas e em larguras móveis.
