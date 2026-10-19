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

## ⚡ Implantação Automática via CLASP (Sem Copiar e Colar)

O projeto está configurado com o **CLASP** (*Command Line Apps Script Projects*), a ferramenta oficial da Google para sincronização e deploy direto pelo terminal ou CI/CD.

### Pré-requisito (Única vez)
1. Acesse suas configurações de usuário do Google Apps Script: [https://script.google.com/home/usersettings](https://script.google.com/home/usersettings)
2. Ative a opção: **Google Apps Script API** (altere a chave para **ATIVADO / ON**).

### Passo 1: Autenticar sua Conta Google
No terminal da pasta do projeto, execute:
```bash
npm run login
```
*Uma janela do navegador será aberta para você autorizar o Google Apps Script CLI.*

### Passo 2: Vincular ao seu Projeto do Apps Script
Crie o arquivo `.clasp.json` na raiz do projeto com o `scriptId` do seu projeto do Apps Script (encontrado em *Configurações do Projeto* > *ID do Script*):
```json
{
  "scriptId": "SEU_SCRIPT_ID_DO_APPS_SCRIPT_AQUI"
}
```
*(Ou se preferir criar um novo script autônomo diretamente pelo terminal: `npx @google/clasp create --type webapp --title "SisFolgas CBM"`)*.

### Passo 3: Enviar Todos os Arquivos (Push Direto)
Para enviar todo o código (backend e frontend) de uma só vez:
```bash
npm run push
```
*O clasp enviará todos os arquivos `.js` e `.html` para o editor do Google em segundos, ignorando automaticamente testes e arquivos locais conforme o `.claspignore`.*

### Passo 4: Criar Nova Versão de Deploy (Publicar Web App)
Para publicar ou atualizar o aplicativo da web diretamente:
```bash
npm run deploy
```

Para abrir o editor no navegador:
```bash
npm run open
```

---

## 🔄 CI/CD 100% Automático via GitHub Actions (Deploy no `git push`)

O repositório já inclui o workflow `.github/workflows/deploy.yml`. Para que cada `git push origin main` execute os testes e faça o deploy automático no Google Apps Script:

1. Acesse o seu repositório no GitHub: **Settings** > **Secrets and variables** > **Actions**.
2. Adicione os dois segredos:
   - `SCRIPT_ID`: O ID do seu projeto no Apps Script.
   - `CLASPRC_JSON`: O conteúdo do arquivo `~/.clasprc.json` (gerado após você rodar `npm run login` na sua máquina).
3. A partir de agora, qualquer `git push` executará a suíte de testes (68 testes) e, se todos passarem, fará o push e deploy automaticamente no Google Apps Script!

---

## 🚀 Inicialização do Banco na Planilha e Primeiro Acesso

1. No editor do Apps Script (ou via `npm run open`), selecione o arquivo `Repository.js`, aponte para a função `initializeSchema` e clique em **Executar**.
   - As **9 abas** do banco de dados serão criadas e formatadas na planilha.
2. Selecione `SeedData.js`, aponte para `populateTestData` e clique em **Executar**.
   - Criará os 21 militares de teste e registrará o administrador.
3. Se o script não for vinculado (*container-bound* à planilha), adicione o ID da planilha em **Configurações do Projeto** > **Propriedades do Script** com a chave `SPREADSHEET_ID`.

