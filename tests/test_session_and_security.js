const test = require('node:test');
const assert = require('node:assert/strict');

// Simulação de ambiente Google Apps Script
global.Config = require('../Config.js');
global.ValidationService = require('../ValidationService.js');
global.Repository = require('../Repository.js');
global.AuditService = require('../AuditService.js');
global.AuthService = require('../AuthService.js');
global.MilitaryService = require('../MilitaryService.js');
global.PeriodService = require('../PeriodService.js');
global.ChoiceService = require('../ChoiceService.js');
global.CreditService = require('../CreditService.js');
global.SwapService = require('../SwapService.js');
global.LeaveService = require('../LeaveService.js');
global.DiagnosticsService = require('../DiagnosticsService.js');
global.BackupService = require('../BackupService.js');
global.AdminService = require('../AdminService.js');
global.SeedData = require('../SeedData.js');
global.Code = require('../Code.js');

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
    getUrl: () => 'https://docs.google.com/spreadsheets/d/1lZ7YX6QnSZYES1_FziJczRPxbsu7DUdJdjd63zRj7CU/edit?gid=0#gid=0',
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = createMockSheet(name);
      return sheets[name];
    }
  };
}

test('Segurança de Sessão, Hashing SHA-256 e Propagação de Contexto RPC', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  // Cadastra militar de teste
  Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: '123456',
    re: '123456',
    digito_re: '7',
    nome_completo: 'Militar Teste Seguranca',
    nome_guerra: 'Seguranca',
    graduacao: 'Cb PM',
    unidade: '703152301 - EB SÃO ROQUE',
    situacao: 'ATIVO',
    prontidao: 'Verde',
    equipe: 'Verde',
    ordem_antiguidade: 1,
    ativo: true
  });

  await t.test('1. hashPassword gera SHA-256 consistente de 64 caracteres hexadecimais', () => {
    const hash1 = AuthService.hashPassword('minhasenha123');
    const hash2 = AuthService.hashPassword('minhasenha123');
    const hashDifferent = AuthService.hashPassword('outrasenha');

    assert.equal(hash1.length, 64);
    assert.match(hash1, /^[0-9a-fA-F]{64}$/);
    assert.equal(hash1, hash2);
    assert.notEqual(hash1, hashDifferent);
  });

  await t.test('2. verifyPassword valida corretamente texto puro legado e hashes SHA-256', () => {
    // Texto puro (compatibilidade transitória)
    assert.equal(AuthService.verifyPassword('123456', '123456'), true);
    assert.equal(AuthService.verifyPassword('errada', '123456'), false);

    // Hash SHA-256
    const hash = AuthService.hashPassword('senhaForte@2026');
    assert.equal(AuthService.verifyPassword('senhaForte@2026', hash), true);
    assert.equal(AuthService.verifyPassword('senhaIncorreta', hash), false);
  });

  await t.test('3. changePassword armazena nova senha criptografada em SHA-256', () => {
    // Login inicial com senha default (123456)
    const loginInitial = Code.apiLogin({ re: '123456', senha: '123456' });
    assert.equal(loginInitial.success, true);
    assert.ok(loginInitial.data.sessionToken);

    // Altera senha de '123456' para 'NovaSenha@99'
    const altRes = Code.apiAlterarSenha({
      re: '123456',
      senhaAtual: '123456',
      novaSenha: 'NovaSenha@99',
      confirmaSenha: 'NovaSenha@99'
    });
    assert.equal(altRes.success, true);

    // Verifica que na aba USUARIOS a senha está armazenada como HASH de 64 caracteres
    const userInDb = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', '123456');
    assert.ok(userInDb);
    assert.equal(userInDb.senha.length, 64);
    assert.notEqual(userInDb.senha, 'NovaSenha@99');

    // Login com a nova senha funciona perfeitamente
    const loginNew = Code.apiLogin({ re: '123456', senha: 'NovaSenha@99' });
    assert.equal(loginNew.success, true);

    // Login com a senha antiga falha
    const loginOld = Code.apiLogin({ re: '123456', senha: '123456' });
    assert.equal(loginOld.success, false);
  });

  await t.test('4. Endpoints RPC em Code.js propagam sessionRe do payload com segurança', () => {
    // Cria período aberto com admin autenticado
    const created = PeriodService.createPeriod({ authenticated: true, perfil: Config.ROLES.ADMIN }, {
      competencia: '2026-11',
      data_abertura: '2026-10-01T08:00:00Z',
      data_encerramento: '2026-11-30T23:59:59Z'
    });
    PeriodService.changeStatus({ authenticated: true, perfil: Config.ROLES.ADMIN }, created.periodo_id, Config.PERIOD_STATUS.ABERTO, 'Abertura para testes');
    const period = PeriodService.getActivePeriod();
    assert.ok(period);
    ChoiceService.setBypassWindowCheck(true);

    const eligibleDates = ChoiceService.getEligibleDatesForTeam('NOV26', 'Verde');
    assert.ok(eligibleDates.length > 0);
    const validDate = eligibleDates[0];

    // Chama apiMakeChoice passando sessionRe no payload
    const choicePayload = {
      sessionRe: '123456',
      periodo_id: period.periodo_id,
      militar_id: '123456',
      data_folga: validDate,
      idempotency_key: 'test-sec-idemp-1'
    };

    const resChoice = Code.apiMakeChoice(choicePayload);
    assert.equal(resChoice.success, true);
    assert.ok(resChoice.data.mensagem);

    // Valida que o militar 123456 agora tem sua escolha gravada
    const allChoices = Repository.getAll(Config.SHEETS.ESCOLHAS);
    const myChoice = allChoices.find(c => c.militar_id === '123456');
    assert.ok(myChoice);
    assert.equal(myChoice.data_folga, validDate);
  });
});
