# WEB CERT

Aplicação em planejamento para gestão comercial de certificados digitais e análise dos dados históricos em Excel.

## Diagnóstico do workspace

No momento da inspeção, o workspace contém este README, `Layout/index.html` e a planilha `CERTIFICADOS_UNIFICADOS_2024-2026.xlsx`. Não foram encontrados `package.json`, configuração TypeScript, estrutura Next.js, testes ou serviços de persistência. O HTML é apenas um protótipo visual estático; seus indicadores e registros são demonstrativos e não representam dados da planilha.

A planilha está presente, mas seu conteúdo não pôde ser inspecionado neste ambiente. Portanto, abas, cabeçalhos, formatos, inconsistências e relações entre registros ainda não foram confirmados. Nenhum modelo de dados ou regra de migração deve ser considerado definido antes dessa análise. O arquivo original foi preservado sem alterações.

## Segurança e persistência

- A planilha deve continuar sendo a fonte oficial dos dados. O arquivo operacional atual está na raiz e seu caminho deverá ser configurado por `GITHUB_DATA_PATH`.
- Uma integração com o GitHub deverá operar exclusivamente no servidor. `GITHUB_TOKEN` nunca deve ser enviado ao navegador, incluído em logs ou preenchido neste repositório.
- O histórico de commits pode reter dados pessoais mesmo após a substituição de uma planilha. Confirme que o repositório é privado e defina política de acesso, retenção e backup antes de armazenar dados comerciais nele.
- A API do GitHub e o SHA do arquivo permitem detectar algumas alterações concorrentes, mas não oferecem uma transação Excel atômica. Conflitos e falhas precisam ser tratados explicitamente; o histórico GitHub não substitui uma cópia de segurança recuperável.
- Repositório privado não substitui autenticação e autorização da aplicação.

## Configuração

`.env.example` lista as variáveis reservadas para a integração planejada. Copie-as para `.env.local` somente no ambiente local e configure os mesmos valores no ambiente de deploy. O token deve ter o menor escopo possível e permanecer somente no backend. Nenhuma integração está ativa neste estágio.

## Próxima etapa

Disponibilizar a inspeção local da planilha e do workspace. Em seguida, documentar abas e cabeçalhos reais, identificar inconsistências sem alterar os dados, definir o mapeamento e testar a leitura de forma isolada. Só depois disso deve ser criado o modelo de dados e a persistência.
