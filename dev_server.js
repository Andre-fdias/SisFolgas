/**
 * SERVIDOR DE DESENVOLVIMENTO E VISUALIZAÇÃO LOCAL (DEV SERVER)
 * Executa localmente sem depender da infraestrutura do Google Apps Script.
 * Fornece API RPC em memória com dados pré-carregados (SeedData) e seletor dinâmico de perfil.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Carrega os módulos do backend e simula escopo global do Apps Script
global.Config = require('./Config.js');
global.ValidationService = require('./ValidationService.js');
global.Repository = require('./Repository.js');
global.AuditService = require('./AuditService.js');
global.AuthService = require('./AuthService.js');
global.MilitaryService = require('./MilitaryService.js');
global.PeriodService = require('./PeriodService.js');
global.ChoiceService = require('./ChoiceService.js');
global.CreditService = require('./CreditService.js');
global.SwapService = require('./SwapService.js');
global.LeaveService = require('./LeaveService.js');
global.DiagnosticsService = require('./DiagnosticsService.js');
global.BackupService = require('./BackupService.js');
global.AdminService = require('./AdminService.js');
global.SeedData = require('./SeedData.js');
global.Code = require('./Code.js');

const Config = global.Config;
const ValidationService = global.ValidationService;
const Repository = global.Repository;
const AuditService = global.AuditService;
const AuthService = global.AuthService;
const MilitaryService = global.MilitaryService;
const PeriodService = global.PeriodService;
const ChoiceService = global.ChoiceService;
const CreditService = global.CreditService;
const SwapService = global.SwapService;
const LeaveService = global.LeaveService;
const DiagnosticsService = global.DiagnosticsService;
const BackupService = global.BackupService;
const AdminService = global.AdminService;
const SeedData = global.SeedData;
const Code = global.Code;

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
    getUrl: () => 'https://docs.google.com/spreadsheets/d/1hydYQOk_C8ITjLs7E3lbnN5l7RCWMJSPewMU8bSuKIFNSmmuc8WqVObD/edit',
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

// Carrega os militares fictícios, admin e período padrão NOV26
const adminEmail = 'admin.cbm@gmail.com';
SeedData.populateTestData(adminEmail);

// Garante o militar real 108154 (1º Sgt PM Andre Dias - ADMIN)
if (!MilitaryService.getByRE('108154')) {
  Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: '108154',
    re: '108154',
    digito_re: '3',
    nome_completo: 'Andre Dias',
    nome_guerra: 'Andre Dias',
    graduacao: '1º Sgt PM',
    unidade: '703152301 - EB SÃO ROQUE',
    situacao: 'ATIVO',
    prontidao: 'Verde',
    equipe: 'Verde',
    ordem_antiguidade: 1,
    email_vinculado: 'andredias@gmail.com',
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  });
}
const userAndre = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', '108154');
if (!userAndre) {
  Repository.insert(Config.SHEETS.USUARIOS, {
    usuario_id: ValidationService.generateUuid(),
    email_google: 'andredias@gmail.com',
    militar_id: '108154',
    senha: '108154',
    perfil: Config.ROLES.ADMIN,
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  });
} else if (userAndre.perfil !== Config.ROLES.ADMIN) {
  Repository.updateById(Config.SHEETS.USUARIOS, 'usuario_id', userAndre.usuario_id, {
    perfil: Config.ROLES.ADMIN
  });
}

// Garante o militar real 982635 na inicialização do dev_server local
if (!MilitaryService.getByRE('982635')) {
  Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: '982635',
    re: '982635',
    digito_re: '1',
    nome_completo: 'Militar Efetivo São Roque',
    nome_guerra: 'São Roque',
    graduacao: '1º Sgt PM',
    unidade: '2º SGB- Eb São Roque',
    situacao: 'ATIVO',
    prontidao: 'Verde',
    equipe: 'Verde',
    ordem_antiguidade: 2,
    email_vinculado: 'militar982635@gmail.com',
    ativo: true,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  });
}

let pTest = PeriodService.getActivePeriod();
if (!pTest) {
  const adminCtx = { authenticated: true, email: adminEmail, perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  pTest = PeriodService.createPeriod(adminCtx, {
    competencia: 'NOV26',
    data_abertura: '2026-11-01',
    data_encerramento: '2026-11-30'
  });
  PeriodService.changeStatus(adminCtx, pTest.periodo_id, Config.PERIOD_STATUS.ABERTO);
}

// E-mail ativo da sessão no dev server (padrão: 1º Sgt C. Silva - Equipe A, 1º da fila)
let currentSessionEmail = 'csilva.teste@gmail.com';
AuthService.setEmailOverride(currentSessionEmail);

// Controle da Janela de Escolha (Simulação: padrão aberta 01 a 16)
let simulatedWindowOpen = true;
ChoiceService.setBypassWindowCheck(simulatedWindowOpen);

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
        <div id="dev-user-bar" style="background: #1e1b4b; border-bottom: 2px solid #6366f1; padding: 0.6rem 1.5rem; display: flex; align-items: center; justify-content: space-between; font-family: sans-serif; font-size: 0.82rem; color: #e0e7ff; z-index: 9999; position: sticky; top: 0; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
            <strong style="color: #a5b4fc;">⚡ LIVE PREVIEW (2º SGB- Eb São Roque)</strong>
            <span>| Alternar Usuário:</span>
            <select id="dev-user-select" style="background: #312e81; color: #fff; border: 1px solid #6366f1; padding: 0.25rem 0.6rem; border-radius: 6px; cursor: pointer;">
              <option value="andredias@gmail.com">👨‍🚒 1º Sgt PM Andre Dias (RE 108154-3 • 703152301 - EB SÃO ROQUE • VERDE - ADMIN)</option>
              <option value="militar982635@gmail.com">👨‍🚒 1º Sgt São Roque (RE 982635 • Prontidão Verde - É A VEZ)</option>
              <option value="csilva.teste@gmail.com">👨‍🚒 1º Sgt C. Silva (RE 10101 • Prontidão Verde)</option>
              <option value="oliveira.teste@gmail.com">👨‍🚒 2º Sgt Oliveira (RE 10102 • Prontidão Verde)</option>
              <option value="souza.teste@gmail.com">👨‍🚒 1º Ten Souza (RE 10201 • Prontidão Amarela)</option>
              <option value="pereira.teste@gmail.com">👨‍🚒 Cap Pereira (RE 10301 • Prontidão Azul)</option>
              <option value="admin.cbm@gmail.com">👨‍💼 Administrador (admin)</option>
            </select>

            <button id="btn-quick-switch-admin" style="background: #4338ca; color: #fff; border: 1px solid #818cf8; padding: 0.25rem 0.65rem; border-radius: 6px; cursor: pointer; font-weight: 600;">
              👑 Entrar como Administrador
            </button>

            <button id="dev-window-toggle" style="background: ${simulatedWindowOpen ? '#065f46' : '#991b1b'}; color: #fff; border: 1px solid ${simulatedWindowOpen ? '#10b981' : '#ef4444'}; padding: 0.25rem 0.65rem; border-radius: 6px; cursor: pointer; font-weight: 600;">
              ${simulatedWindowOpen ? '📅 Janela: Aberta (01 a 16)' : '🔒 Janela: Bloqueada (17+)'}
            </button>

            <a href="https://script.google.com/macros/s/AKfycbyW_SNl57Kso3XyxeNLlMJsmq64C40WcSVX7IlaFkHRB0siYELxf-mYd9uducfQk899/exec" target="_blank" style="background: #059669; color: #fff; border: 1px solid #10b981; padding: 0.25rem 0.65rem; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.35rem;">
              🌐 Web App Real (Planilha Google)
            </a>
          </div>
          <div style="font-size: 0.75rem; color: #c7d2fe;">
            Planilha: <strong>SisFolgas</strong> • Período: <strong>${ValidationService.formatCompetencia('2026-11')} ABERTO</strong>
          </div>
        </div>

        <script>
          // Ponte robusta e concorrente do google.script.run para o servidor local
          (function() {
            function createRunner(successFn, failureFn) {
              const base = {
                withSuccessHandler: function(fn) {
                  return createRunner(fn, failureFn);
                },
                withFailureHandler: function(fn) {
                  return createRunner(successFn, fn);
                }
              };

              return new Proxy(base, {
                get(target, prop) {
                  if (prop in target) return target[prop];
                  return function(payload) {
                    fetch('/api/rpc', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: prop, payload: payload })
                    })
                    .then(r => r.json())
                    .then(res => {
                      if (res && res.success) {
                        if (typeof successFn === 'function') successFn(res);
                      } else {
                        const err = new Error(res && res.error ? res.error.message : 'Falha na requisição');
                        if (typeof failureFn === 'function') failureFn(err);
                      }
                    })
                    .catch(err => {
                      if (typeof failureFn === 'function') failureFn(err);
                    });
                  };
                }
              });
            }

            window.google = {
              script: {
                run: createRunner(() => {}, () => {})
              }
            };
          })();

          // Listener do seletor de usuário e botão de alternância de janela
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

            const winBtn = document.getElementById('dev-window-toggle');
            if (winBtn) {
              winBtn.addEventListener('click', () => {
                fetch('/api/toggle-window-mode', { method: 'POST' })
                  .then(() => window.location.reload());
              });
            }

            const adminBtn = document.getElementById('btn-quick-switch-admin');
            if (adminBtn) {
              adminBtn.addEventListener('click', () => {
                fetch('/api/set-user', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'admin.cbm@gmail.com' })
                }).then(() => window.location.reload());
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

        // No dev_server local: se for tentativa de login com RE de 6 dígitos que ainda não está no mock, auto-cadastra
        if (action === 'apiLogin' && payload && payload.re) {
          const reqRe = String(payload.re).trim();
          if (reqRe.toLowerCase() !== 'admin') {
            try {
              const cleanRe = ValidationService.normalizeRE(reqRe);
              const exists = MilitaryService.getByRE(cleanRe) || MilitaryService.getById(cleanRe);
              if (!exists) {
                Repository.insert(Config.SHEETS.MILITARES, {
                  militar_id: cleanRe,
                  re: cleanRe,
                  digito_re: '1',
                  nome_completo: `Militar Efetivo (${cleanRe})`,
                  nome_guerra: `Mil. ${cleanRe}`,
                  graduacao: '1º Sgt PM',
                  unidade: '2º SGB- Eb São Roque',
                  situacao: 'ATIVO',
                  prontidao: 'Verde',
                  equipe: 'Verde',
                  ordem_antiguidade: 1,
                  email_vinculado: `${cleanRe}@sisfolgas.local`,
                  ativo: true,
                  criado_em: new Date().toISOString(),
                  atualizado_em: new Date().toISOString()
                });
              }
            } catch (e) {}
          }
        }

        AuthService.setEmailOverride(currentSessionEmail);
        const result = Code[action](payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error('SERVER RPC ERROR:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: { message: err.message, stack: err.stack } }));
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

  // Rota para alternar a janela de escolha (Simulação 01-16 vs 17+)
  if (req.method === 'POST' && req.url === '/api/toggle-window-mode') {
    simulatedWindowOpen = !simulatedWindowOpen;
    ChoiceService.setBypassWindowCheck(simulatedWindowOpen);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, windowOpen: simulatedWindowOpen }));
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
