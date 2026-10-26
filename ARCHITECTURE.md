# Arquitetura inicial

## Estado e limites desta etapa

O workspace aberto usa o provedor `vscode-vfs://github/...`. A listagem do workspace mostra `CERTIFICADOS_UNIFICADOS_2024-2026.xlsx`, mas `read_file` não consegue abrir o workbook: informa que o arquivo é binário e não pode ser aberto como texto. Não há ferramenta de inspeção XLSX disponível nesta sessão. A busca de arquivos também não expõe o conteúdo do workbook.

O terminal PowerShell está em `C:\Users\User`, fora do workspace. A consulta de variáveis de ambiente não encontrou um caminho do workspace. Portanto, não foi confirmado nenhum caminho local suportado para a planilha. Não procurei o disco nem tentei copiar ou baixar o arquivo para contornar essa limitação.

Sem acesso ao conteúdo, não foram inspecionados nomes de abas, cabeçalhos, quantidade de registros, tipos, datas, valores, vazios, duplicidades ou inconsistências. Nenhum modelo de dados ou relatório de qualidade é definido aqui. A planilha permanece intacta.

## Decisão de arquitetura proposta

- Aplicação: Next.js App Router, TypeScript, React e Tailwind CSS.
- Fonte comercial permanente: workbook Excel versionado no GitHub.
- Hospedagem: Vercel; seu filesystem não será usado como persistência.
- Acesso ao GitHub: somente em código de servidor, por um serviço de armazenamento independente das regras comerciais.
- Biblioteca de Excel: avaliar ExcelJS quando o arquivo puder ser lido e seu tamanho e estrutura forem conhecidos.
- Modelo lógico e regras de validação: pendentes da inspeção do workbook. Não inferir campos pelo protótipo visual.

O contrato de armazenamento deverá expor operações equivalentes a:

- Ler um snapshot binário junto de uma revisão opaca.
- Validar o workbook contra um contrato de dados definido após a inspeção.
- Publicar novos bytes somente se a revisão esperada ainda for atual.
- Criar e recuperar snapshots de backup segundo uma política autorizada.

Os módulos comerciais não devem depender de endpoints do GitHub nem de detalhes do Excel. A implementação desse contrato está pendente; este documento descreve o desenho, não uma integração ativa.

## Fluxo de leitura

1. O backend consulta a referência configurada do branch e registra o SHA do commit atual.
2. Obtém o workbook no caminho configurado nesse commit. Registra também o SHA do blob, que identifica a versão do arquivo.
3. Processa os bytes em memória, valida a estrutura depois que o contrato real estiver definido e converte os registros para modelos internos validados.
4. Retorna somente os dados necessários à rota autenticada. Nunca retorna token, bytes completos por padrão ou informação sensível em logs.
5. Erros de permissão, arquivo ausente, resposta inválida, limite de tamanho e falha de parsing são explícitos; não há fallback para dados fictícios ou cache tratado como fonte oficial.

## Fluxo de gravação proposto

Gravações permanecem desabilitadas até serem conhecidos o workbook, seu contrato, a autenticação e a política de backup.

Quando autorizadas, cada operação deverá:

1. Autenticar e autorizar a pessoa no servidor e validar a entrada com o contrato definido a partir dos dados reais.
2. Ler novamente o branch, o commit, o blob e o workbook atuais. Não confiar em SHA enviado pelo navegador.
3. Aplicar a operação a uma cópia em memória, validar o resultado e reabrir os bytes gerados para verificar a integridade do workbook.
4. Guardar a revisão base e criar o snapshot de recuperação exigido pela política aprovada.
5. Criar um blob, uma árvore baseada na árvore atual e um commit cujo parent seja o commit base.
6. Atualizar a referência do branch com `force=false`. Nunca forçar a referência.
7. Confirmar a resposta e reler a referência/arquivo para verificar que o commit publicado contém a versão esperada.
8. Retornar sucesso inequívoco ou erro tipado; não reportar sucesso antes da confirmação.

O endpoint de conteúdo do GitHub também exige o SHA atual do arquivo ao atualizar conteúdo e documenta conflitos. Para tornar explícita a relação entre commit base e avanço do branch, o fluxo proposto usa a Git Database API (blob/tree/commit/ref). A atualização de referência sem force aceita apenas avanço fast-forward. Dois commits divergentes baseados no mesmo commit não podem ser tratados como uma gravação sequencial silenciosa: o conflito deve interromper a operação, reler os dados e exigir reavaliação do comando contra o estado novo. Não repetir bytes calculados sobre uma versão obsoleta nem resolver conflitos automaticamente.

Esse controle reduz sobrescritas concorrentes, mas não transforma GitHub em banco transacional: não há transação abrangendo Excel, autorização, backup e outros serviços; podem existir objetos Git não referenciados após falhas; limites de API, tamanho, latência, branch protection e indisponibilidade continuam aplicáveis. Devem existir timeout, limites de tentativa, observabilidade sem dados pessoais e resposta de conflito recuperável.

## Backup, histórico e dados pessoais

O commit anterior permite reconstruir uma versão, mas o histórico do mesmo repositório não é backup independente. Uma cópia recuperável exige política separada de destino, frequência, retenção, controle de acesso e teste de restauração. Cópias e commits podem conservar dados pessoais mesmo após a alteração ou remoção do workbook atual. Antes de versionar dados comerciais, verificar a visibilidade real do repositório e aprovar a política de retenção e recuperação. Restaurar deve criar uma nova alteração autorizada; não reescrever histórico como rotina.

## Segredos e ambiente

`GITHUB_TOKEN`, proprietário, repositório, branch e caminho do arquivo devem ser configurados no ambiente de servidor. O token deve ter o menor conjunto de permissões compatível com leitura e gravação do conteúdo necessário. Não deve ser importado por componentes client-side, enviado em respostas, incluído em logs ou commitado. Um repositório privado não autentica nem autoriza os usuários da aplicação.

## Verificações e pendências

Antes da implementação, é necessário:

1. Abrir o workspace em um caminho local acessível ao terminal ou fornecer uma exportação sanitizada contendo nomes das abas, cabeçalhos e amostras sem dados pessoais. Para análise de qualidade completa, o agente precisará de acesso de leitura ao workbook original; não envie credenciais no chat.
2. Registrar por aba a quantidade de registros e os problemas de estrutura, datas, valores, vazios e duplicidades sem revelar identificadores pessoais.
3. Definir o modelo de dados, regras de validação, autenticação, política de backup, limites operacionais e permissões GitHub.
4. Inicializar Next.js sem substituir `Layout/index.html`; manter o protótipo até que a migração seja intencional e validada.
5. Criar testes unitários e de integração com workbooks sintéticos construídos a partir do contrato confirmado, incluindo leitura, integridade, conflito de revisão e proteção do token.

Não há aplicação executável, integração de persistência ou testes neste estágio. Build e testes não foram executados.

## Referências

- [GitHub REST API: repository contents](https://docs.github.com/en/rest/repos/contents)
- [GitHub REST API: Git references](https://docs.github.com/en/rest/git/refs)
- [GitHub REST API: Git commits](https://docs.github.com/en/rest/git/commits)