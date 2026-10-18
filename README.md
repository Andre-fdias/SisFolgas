# Sistema Seguro de Gerenciamento e Escolha de Folgas (CBM)
**Plataforma:** Google Apps Script V8 + Google Sheets (Storage Privado) + HtmlService

## Estrutura do Projeto

- `fase_1_arquitetura_seguranca.md`: Especificação técnica completa de arquitetura, segurança e modelo de dados.
- Arquivos de backend (.js / .gs) e frontend (.html) serão desenvolvidos em conformidade com as fases estabelecidas no plano diretor.

## Diretrizes de Segurança
1. **O RE é apenas identificador cadastral**, nunca credencial de autenticação.
2. **A planilha Google é 100% privada** (somente o script/admin tem acesso).
3. **Autenticação no servidor** via conta Google autorizada (`Session.getActiveUser().getEmail()`).
4. **Controle de concorrência atômico** com `LockService` contra disputas simultâneas da mesma data.
5. **Auditoria imutável** (append-only) de todas as operações sensíveis.
