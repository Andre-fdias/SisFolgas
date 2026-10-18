/**
 * SERVIDOR DE DESENVOLVIMENTO E VISUALIZAÇÃO LOCAL (DEV SERVER)
 * Executa localmente sem depender da infraestrutura do Google Apps Script.
 * Fornece API RPC em memória com dados pré-carregados (SeedData) e seletor dinâmico de perfil.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Carrega os módulos do backend
const Config = require('./Config.js');
const ValidationService = require('./ValidationService.js');
const Repository = require('./Repository.js');
const AuditService = require('./AuditService.js');
const AuthService = require('./AuthService.js');
const MilitaryService = require('./MilitaryService.js');
const PeriodService = require('./PeriodService.js');
const ChoiceService = require('./ChoiceService.js');
const CreditService = require('./CreditService.js');
const SwapService = require('./SwapService.js');
const LeaveService = require('./LeaveService.js');
const DiagnosticsService = require('./DiagnosticsService.js');
const BackupService = require('./BackupService.js');
const AdminService = require('./AdminService.js');
const SeedData = require('./SeedData.js');
const Code = require('./Code.js');

// Simula escopo global do Apps Script
global.Config = Config;
global.ValidationService = ValidationService;
global.Repository = Repository;
global.AuditService = AuditService;
global.AuthService = AuthService;
global.MilitaryService = MilitaryService;
global.PeriodService = PeriodService;
global.ChoiceService = ChoiceService;
global.CreditService = CreditService;
global.SwapService = SwapService;
global.LeaveService = LeaveService;
global.DiagnosticsService = DiagnosticsService;
global.BackupService = BackupService;
global.AdminService = AdminService;

// Mock do Spreadsheet em memória
function createMockSpreadsheet() {
  const sheets = {};
  function createMockSheet(name) {
    const data = [];
    return {
      getName: () => name,
      getLastRow: () => data.length,
      getLastColumn: () => (data.length > 0 ? data[0].length : 0),
      setFrozenRows: () => {},
      appendRow: (rowValues) => { data.push([...rowValues]); },
      getRange: (startRow, startCol, numRows = 1, numCols = 1) => ({
        getValues: () => {
          const res = [];
          for (let r = 0; r < numRows; r++) {
            const rowIdx = startRow - 1 + r;
            const rowData = data[rowIdx] || [];
            const slice = [];
            for (let c = 0; c < numCols; c++) {
              const colIdx = startCol - 1 + c;
              slice.push(rowData[colIdx] !== undefined ? rowData[colIdx] : '');
            }
            res.push(slice);
          }
          return res;
        },
        setValues: (matrix) => {
          for (let r = 0; r < matrix.length; r++) {
            const rowIdx = startRow - 1 + r;
            while (data.length <= rowIdx) data.push([]);
            for (let c = 0; c < matrix[r].length; c++) {
              data[rowIdx][startCol - 1 + c] = matrix[r][c];
            }
          }
        },
        setValue: (val) => {
          const rowIdx = startRow - 1;
          const colIdx = startCol - 1;
          while (data.length <= rowIdx) data.push([]);
          data[rowIdx][colIdx] = val;
        }
      })
    };
  }

  return {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = createMockSheet(name);
      return sheets[name];
    }
  };
}

// Inicializa banco em memória
const mockSs = createMockSpreadsheet();
Repository.setSpreadsheetOverride(mockSs);
Repository.initializeSchema(mockSs);

// Carrega os 21 militares fictícios e o admin
const adminEmail = 'admin.cbm@gmail.com';
SeedData.populateTestData(adminEmail);

// Cria e abre um período de teste para 2026-11
const adminCtx = { authenticated: true, email: adminEmail, perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
const pTest = PeriodService.createPeriod(adminCtx, {
  competencia: '2026-11',
  data_abertura: '2026-10-01T00:00:00Z',
  data_encerramento: '2026-11-30T23:59:59Z'
});
PeriodService.changeStatus(adminCtx, pTest.periodo_id, Config.PERIOD_STATUS.ABERTO);

// E-mail ativo da sessão no dev server (padrão: 1º Sgt C. Silva - Equipe A, 1º da fila)
let currentSessionEmail = 'csilva.teste@gmail.com';
AuthService.setEmailOverride(currentSessionEmail);

const PORT = 3000;

const server = http.createServer((req, res) => {
  // Rota principal: HTML completo
  if (req.method === 'GET' && req.url.startsWith('/') && !req.url.startsWith('/api')) {
    try {
      let indexHtml = fs.readFileSync(path.join(__dirname, 'Index.html'), 'utf8');
      const stylesHtml = fs.readFileSync(path.join(__dirname, 'Styles.html'), 'utf8');
      const scriptsHtml = fs.readFileSync(path.join(__dirname, 'Scripts.html'), 'utf8');

      // Substitui as diretivas include do Google Apps Script
      indexHtml = indexHtml.replace("<?!= include('Styles'); ?>", stylesHtml);
      indexHtml = indexHtml.replace("<?!= include('Scripts'); ?>", scriptsHtml);

      // Injeta a barra de troca de usuário e a ponte mockada do google.script.run
      const devBridge = `
        <div id="dev-user-bar" style="background: #1e1b4b; border-bottom: 2px solid #6366f1; padding: 0.6rem 1.5rem; display: flex; align-items: center; justify-content: space-between; font-family: sans-serif; font-size: 0.82rem; color: #e0e7ff; z-index: 9999; position: sticky; top: 0;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <strong style="color: #a5b4fc;">⚡ LIVE PREVIEW MODE (Simulador Local)</strong>
            <span>| Alternar Usuário Ativo:</span>
            <select id="dev-user-select" style="background: #312e81; color: #fff; border: 1px solid #6366f1; padding: 0.25rem 0.6rem; border-radius: 6px; cursor: pointer;">
              <option value="csilva.teste@gmail.com">👨‍🚒 1º Sgt C. Silva (Equipe A - 1º Antiguidade - É A SUA VEZ)</option>
              <option value="oliveira.teste@gmail.com">👨‍🚒 2º Sgt Oliveira (Equipe A - 2º Antiguidade - Aguardando)</option>
              <option value="costa.teste@gmail.com">👨‍🚒 3º Sgt Costa (Equipe A - 3º Antiguidade)</option>
              <option value="ribeiro.teste@gmail.com">👨‍🚒 SubTen Ribeiro (Equipe B - 1º Antiguidade)</option>
              <option value="admin.cbm@gmail.com">👨‍💼 Administrador CBM (admin.cbm@gmail.com)</option>
            </select>
          </div>
          <div style="font-size: 0.75rem; color: #c7d2fe;">
            Planilha: <strong>SisFolgas (Em Memória)</strong> • Status: <strong>Período 2026-11 ABERTO</strong>
          </div>
        </div>

        <script>
          // Ponte do google.script.run para o servidor local
          window.google = {
            script: {
              run: {
                _successHandler: () => {},
                _failureHandler: () => {},
                withSuccessHandler: function(fn) {
                  this._successHandler = fn;
                  return this;
                },
                withFailureHandler: function(fn) {
                  this._failureHandler = fn;
                  return this;
                }
              }
            }
          };

          // Adiciona os métodos expostos na ponte
          const exposedMethods = [
            'apiGetInitialState',
            'apiGetTeamQueue',
            'apiMakeChoice',
            'apiCancelChoice',
            'apiPassTurn',
            'apiAdminSaveMilitary',
            'apiAdminCreatePeriod',
            'apiAdminChangePeriodStatus',
            'apiAdminGetOperationalReport',
            'apiAdminGetAuditLogs',
            'apiAdminRunDiagnostics',
            'apiAdminRunBackup',
            'apiGrantCredit',
            'apiRegisterLeave',
            'apiRequestSwap',
            'apiApproveSwap'
          ];

          exposedMethods.forEach(method => {
            window.google.script.run[method] = function(payload) {
              const self = window.google.script.run;
              fetch('/api/rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: method, payload: payload })
              })
              .then(r => r.json())
              .then(data => {
                if (data.success) {
                  self._successHandler(data);
                } else {
                  self._failureHandler(new Error(data.error ? data.error.message : 'Falha na requisição'));
                }
              })
              .catch(err => self._failureHandler(err));
            };
          });

          // Listener do seletor de usuário
          document.addEventListener('DOMContentLoaded', () => {
            const select = document.getElementById('dev-user-select');
            if (select) {
              fetch('/api/get-current-user')
                .then(r => r.json())
                .then(d => { select.value = d.email; });

              select.addEventListener('change', () => {
                fetch('/api/set-user', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: select.value })
                }).then(() => {
                  window.location.reload();
                });
              });
            }
          });
        </script>
      `;

      // Insere a barra no início do body
      indexHtml = indexHtml.replace('<body>', '<body>' + devBridge);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexHtml);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Erro ao renderizar template: ' + err.message);
    }
    return;
  }

  // Rota RPC para chamadas do frontend
  if (req.method === 'POST' && req.url === '/api/rpc') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const action = parsed.action;
        const payload = parsed.payload;

        if (typeof Code[action] !== 'function') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: { message: `Método '${action}' não encontrado.` } }));
          return;
        }

        AuthService.setEmailOverride(currentSessionEmail);
        const result = Code[action](payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message } }));
      }
    });
    return;
  }

  // Rota para alternar o usuário da sessão
  if (req.method === 'POST' && req.url === '/api/set-user') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      if (parsed.email) {
        currentSessionEmail = parsed.email;
        AuthService.setEmailOverride(currentSessionEmail);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, currentEmail: currentSessionEmail }));
    });
    return;
  }

  // Rota para obter usuário atual
  if (req.method === 'GET' && req.url === '/api/get-current-user') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ email: currentSessionEmail }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚒 SisFolgas - Servidor de Visualização Local Ativo!`);
  console.log(`🌐 Acesse no navegador: http://localhost:${PORT}`);
  console.log(`👤 Usuário inicial: ${currentSessionEmail}`);
  console.log(`======================================================\n`);
});
