/**
 * SUÍTE DE TESTES AUTOMATIZADOS - FASE 5: INTEGRAÇÃO DE ENDPOINTS E RPC (Code.js)
 * Executado via Node.js: node --test tests/test_api_endpoints.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const Config = require('../Config.js');
const ValidationService = require('../ValidationService.js');
const Repository = require('../Repository.js');
const AuditService = require('../AuditService.js');
const AuthService = require('../AuthService.js');
const MilitaryService = require('../MilitaryService.js');
const PeriodService = require('../PeriodService.js');
const ChoiceService = require('../ChoiceService.js');
const CreditService = require('../CreditService.js');
const SwapService = require('../SwapService.js');
const LeaveService = require('../LeaveService.js');
const DiagnosticsService = require('../DiagnosticsService.js');
const BackupService = require('../BackupService.js');
const AdminService = require('../AdminService.js');
const Code = require('../Code.js');

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

ChoiceService.setBypassWindowCheck(true);

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

test('1. Endpoints RPC em Code.js - Resposta Envelopada e Tratamento Seguro de Erros', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  // 1. Cadastra admin e militar de teste
  Repository.insert(Config.SHEETS.USUARIOS, {
    usuario_id: 'u-admin-api',
    email_google: 'admin.cbm@gmail.com',
    perfil: Config.ROLES.ADMIN,
    ativo: true
  });

  const m1Id = ValidationService.generateUuid();
  const m1 = Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: m1Id,
    re: '33301',
    nome_completo: 'Soldado Ramos',
    nome_guerra: 'Ramos',
    graduacao: 'Sd PM',
    equipe: 'Equipe A',
    ordem_antiguidade: 1,
    email_vinculado: 'ramos@gmail.com',
    ativo: true
  });

  // Cria período aberto com UUID válido
  const p1Id = ValidationService.generateUuid();
  const p1 = Repository.insert(Config.SHEETS.PERIODOS, {
    periodo_id: p1Id,
    competencia: '2026-11',
    status: Config.PERIOD_STATUS.ABERTO,
    data_abertura: '2026-10-01T00:00:00Z',
    data_encerramento: '2026-11-30T23:59:59Z'
  });

  await t.test('apiGetInitialState para usuário não autenticado retorna envelope seguro sem crash', () => {
    AuthService.setEmailOverride('');
    const res = Code.apiGetInitialState();
    assert.equal(res.success, true);
    assert.equal(res.data.authenticated, false);
    assert.ok(res.opId !== undefined);
  });

  await t.test('apiGetInitialState para militar autenticado retorna dados higienizados e filas', () => {
    AuthService.setEmailOverride('ramos@gmail.com');
    const res = Code.apiGetInitialState();
    assert.equal(res.success, true);
    assert.equal(res.data.authenticated, true);
    assert.equal(res.data.user.email, 'ramos@gmail.com');
    assert.equal(res.data.user.militar.nome_guerra, 'Ramos');
    assert.ok(res.data.queues['Equipe A'] !== undefined);
  });

  await t.test('apiMakeChoice executa com sucesso e retorna confirmação', () => {
    AuthService.setEmailOverride('ramos@gmail.com');
    const datas = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe A');
    const res = Code.apiMakeChoice({
      periodo_id: p1.periodo_id,
      militar_id: m1.militar_id,
      data_folga: datas[0],
      idempotency_key: 'idemp-api-test-1'
    });

    assert.equal(res.success, true);
    assert.equal(res.data.success, true);
    assert.equal(res.data.escolha.data_folga, datas[0]);
  });

  await t.test('apiAdminRunDiagnostics retorna status HEALTHY quando chamado por Admin', () => {
    AuthService.setEmailOverride('admin.cbm@gmail.com');
    const res = Code.apiAdminRunDiagnostics();
    assert.equal(res.success, true);
    assert.equal(res.data.status, 'HEALTHY');
  });

  await t.test('Militar tentando chamar apiAdminRunDiagnostics é bloqueado com erro seguro', () => {
    AuthService.setEmailOverride('ramos@gmail.com');
    const res = Code.apiAdminRunDiagnostics();
    assert.equal(res.success, false);
    assert.ok(res.error.message.includes('Acesso negado'));
    assert.ok(res.opId !== undefined);
  });

  // Cadastra militar pendente de ativação para teste de pré-cadastro
  Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: '44401',
    re: '44401',
    nome_completo: 'Fabio Lucas Santos',
    nome_guerra: 'Lucas',
    graduacao: 'Sd PM',
    equipe: 'Equipe B',
    ordem_antiguidade: 2,
    email_vinculado: '',
    ativo: true
  });

  await t.test('apiPreCadastroMilitar: rejeita RE inexistente no efetivo', () => {
    AuthService.setEmailOverride('novato@gmail.com');
    const res = Code.apiPreCadastroMilitar({ re: '99999', nome: 'Inexistente' });
    assert.equal(res.success, false);
    assert.ok(res.error.message.includes('não foi localizado no efetivo'));
  });

  await t.test('apiPreCadastroMilitar: rejeita RE existente quando o nome informado não confere', () => {
    AuthService.setEmailOverride('novato@gmail.com');
    const res = Code.apiPreCadastroMilitar({ re: '44401', nome: 'Albuquerque Totalmente Diferente' });
    assert.equal(res.success, false);
    assert.ok(res.error.message.includes('não confere com o cadastro'));
  });

  await t.test('apiPreCadastroMilitar: ativa cadastro com sucesso por RE e Nome, concedendo acesso imediato', () => {
    AuthService.setEmailOverride('lucas.bombeiro.sp@gmail.com');
    // RE 44401 é Fabio Lucas Santos (Guerra: Lucas)
    const res = Code.apiPreCadastroMilitar({ re: '44401', nome: 'Lucas' });
    assert.equal(res.success, true);
    assert.ok(res.data.mensagem.includes('Acesso ativado com sucesso'));

    // Verifica se criou usuário em USUARIOS com militar_id = RE
    const userInDb = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', 'lucas.bombeiro.sp@gmail.com');
    assert.ok(userInDb !== null);
    assert.equal(userInDb.militar_id, '44401');
    assert.equal(userInDb.perfil, Config.ROLES.MILITAR);

    // Verifica se apiGetInitialState agora reconhece a sessão como autenticada
    const stateRes = Code.apiGetInitialState();
    assert.equal(stateRes.success, true);
    assert.equal(stateRes.data.authenticated, true);
    assert.equal(stateRes.data.user.email, 'lucas.bombeiro.sp@gmail.com');
    assert.equal(stateRes.data.user.militar.re, '44401');
    assert.equal(stateRes.data.user.militar.nome_guerra, 'Lucas');
  });
});
