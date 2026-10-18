# SisFolgas — Sistema Seguro de Gerenciamento e Escolha de Folgas (CBM)

> **Plataforma:** Google Apps Script V8 + Google Sheets (Storage Privado) + HtmlService (Frontend Responsivo)  
> **Repositório Oficial:** [git@github.com:Andre-fdias/SisFolgas.git](https://github.com/Andre-fdias/SisFolgas)  
> **Versão do Sistema:** 1.0.0 | **Esquema de Dados:** 1.0.0

---

## 🚒 Visão Geral

Desenvolvido para gerenciar a escala 24x48 e a escolha de folgas dos militares do Corpo de Bombeiros, com prioridade máxima na **segurança dos dados funcionais**, **prevenção de fraudes**, **controle estrito de concorrência** e conformidade com a **LGPD**.

### Princípios Fundamentais de Segurança
1. **O RE é apenas identificador funcional único, NUNCA uma credencial ou senha.** Conhecer o RE de um militar não permite que ninguém escolha folga por ele.
2. **A planilha Google é 100% privada.** O Web App executa como a conta de serviço/desenvolvedor (`Execute as: Me`). Nenhum usuário comum tem acesso de leitura ou escrita direta à planilha.
3. **Autenticação Real no Servidor.** A identidade do chamador é verificada via conta Google autenticada (`Session.getActiveUser().getEmail()`) associada à tabela `USUARIOS` e `MILITARES`.
4. **Controle Atômico de Concorrência.** O `LockService` com timeout e releitura em memória elimina condições de corrida (*race conditions*), impedindo que dois militares escolham a mesma vaga simultaneamente.
5. **Trilha Imutável de Auditoria.** Todas as operações sensíveis (escolhas, cancelamentos, passagens de vez, logins e incidentes de segurança) são registradas de forma *append-only* com o e-mail real autenticado.

---

## 📂 Arquitetura dos Módulos

```text
├── appsscript.json             # Manifesto de configuração do Apps Script (V8, Timezone)
├── Code.js                     # Ponto de entrada (doGet) e endpoints RPC seguros
├── Config.js                   # Esquema das 9 abas, perfis RBAC, constantes e status
├── AuthService.js              # Sessão Google, vinculação de conta, RBAC e anti-impersonation
├── ValidationService.js        # Sanitização anti-XSS, validação de tipos, RE e datas
├── Repository.js               # Persistência segura em lote e inicialização não destrutiva
├── MilitaryService.js          # Gestão de militares, equipes e antiguidade oficial
├── PeriodService.js            # Ciclo de vida dos períodos de competência
├── ChoiceService.js            # Motor de fila, cálculo 24x48 e LockService atômico
├── CreditService.js            # Saldo e consumo auditado de créditos de folga
├── SwapService.js              # Solicitação e aprovação atômica de permutas
├── LeaveService.js             # Afastamentos operacionais em conformidade com a LGPD
├── DiagnosticsService.js       # Varredura automatizada de integridade e colisões
├── BackupService.js            # Geração de snapshot serializado e plano de recuperação
├── AdminService.js             # Passagem de vez justificada, relatórios e auditoria
├── SeedData.js                 # Carga de 21 militares fictícios para homologação
├── Index.html                  # Estrutura semântica responsiva da interface
├── Styles.html                 # Design system moderno com identidade visual do CBM
├── Scripts.html                # Controlador reativo frontend com proteção anti-duplo clique
└── tests/                      # Suíte de 55 testes automatizados (0 falhas)
    ├── test_foundation.js
    ├── test_core_operations.js
    ├── test_complementary_modules.js
    └── test_api_endpoints.js
```

---

## 🧪 Testes Automatizados

Para executar os 55 testes unitários e integrados localmente:

```bash
npm test
```

---

## 🚀 Como Vincular à Planilha do Google e Implantar

### 1. Criar ou Vincular a Planilha Privada
Abra a sua planilha no Google Sheets (por exemplo, a planilha `SisFolgas` criada):
1. No menu superior da planilha, clique em **Extensões** > **Apps Script**.
2. Cole ou faça push do código deste repositório para o projeto.
3. Se o script for do tipo *container-bound* (aberto a partir da planilha), ele se conecta automaticamente via `SpreadsheetApp.getActiveSpreadsheet()`.
4. Se for um script autônomo (*standalone*), adicione o ID da planilha nas Propriedades do Script:
   - Chave: `SPREADSHEET_ID`
   - Valor: `[ID_DA_PLANILHA]`

### 2. Inicializar o Banco de Dados e os Dados de Teste
No editor do Google Apps Script:
1. Abra `Repository.gs`, selecione a função `initializeSchema` e clique em **Executar**.
   - As **9 abas** serão criadas com formatação e cabeçalhos oficiais.
2. Abra `SeedData.gs`, selecione a função `populateTestData` e clique em **Executar**.
   - Carregará 21 militares fictícios distribuídos nas Equipes A, B e C com antiguidades de 1 a 7, além de registrar o e-mail administrador.

### 3. Publicar o Web App
1. Clique em **Implantar** > **Nova Implantação**.
2. Tipo: **Aplicativo da Web**.
3. Configuração de Acesso:
   - **Executar como:** `Eu (seu-email@gmail.com)`
   - **Quem tem acesso:** `Qualquer pessoa com uma Conta do Google`
4. Conceda as autorizações e compartilhe a URL gerada com a tropa.
