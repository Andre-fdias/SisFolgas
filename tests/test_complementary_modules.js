/**
 * SUÍTE DE TESTES AUTOMATIZADOS - FASE 4: MÓDULOS COMPLEMENTARES
 * Executado via Node.js: node --test tests/test_complementary_modules.js
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

test('1. Gestão de Créditos (CreditService)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin@bombeiros.gov.br', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  const militarCtx = { authenticated: true, email: 'mil@gmail.com', perfil: Config.ROLES.MILITAR, permissions: Config.ROLE_PERMISSIONS.MILITAR };

  const m1 = MilitaryService.saveMilitary(adminCtx, {
    re: '55501',
    nome_completo: 'Cabo Souza',
    nome_guerra: 'Souza',
    graduacao: 'Cb PM',
    equipe: 'Equipe B',
    ordem_antiguidade: 1,
    email_vinculado: 'mil@gmail.com'
  });

  await t.test('Militar não pode conceder crédito a si mesmo', () => {
    assert.throws(
      () => CreditService.grantCredit(militarCtx, { militar_id: m1.militar_id, motivo: 'Auto-concessão', quantidade: 1 }),
      /Acesso negado/
    );
  });

  let credito = null;
  await t.test('Administrador concede crédito auditado com sucesso', () => {
    credito = CreditService.grantCredit(adminCtx, {
      militar_id: m1.militar_id,
      motivo: 'Plantão extra em operação especial de enchente',
      quantidade: 1,
      periodo_origem: '2026-10'
    });

    assert.equal(credito.status, Config.CREDIT_STATUS.DISPONIVEL);
    const disponiveis = CreditService.getAvailableCredits(m1.militar_id);
    assert.equal(disponiveis.length, 1);
  });

  await t.test('Consumo de crédito atualiza status e vincula à escolha', () => {
    const choiceId = ValidationService.generateUuid();
    const consumido = CreditService.consumeCredit(credito.credito_id, choiceId, adminCtx.email);
    assert.equal(consumido.status, Config.CREDIT_STATUS.UTILIZADO);
    assert.equal(consumido.escolha_relacionada_id, choiceId);

    // Tentar consumir novamente deve falhar
    assert.throws(
      () => CreditService.consumeCredit(credito.credito_id, choiceId, adminCtx.email),
      /não está disponível/
    );
  });
});

test('2. Permutas entre Militares (SwapService)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin@bombeiros.gov.br', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };

  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '60001', nome_completo: 'Sd A', nome_guerra: 'A', graduacao: 'Sd', equipe: 'Equipe A', ordem_antiguidade: 1, email_vinculado: 'a@gmail.com' });
  const m2 = MilitaryService.saveMilitary(adminCtx, { re: '60002', nome_completo: 'Sd B', nome_guerra: 'B', graduacao: 'Sd', equipe: 'Equipe A', ordem_antiguidade: 2, email_vinculado: 'b@gmail.com' });

  const ctxA = { authenticated: true, email: 'a@gmail.com', perfil: Config.ROLES.MILITAR, permissions: Config.ROLE_PERMISSIONS.MILITAR, militar: m1 };

  // Cadastra duas escolhas ativas
  const e1 = { escolha_id: ValidationService.generateUuid(), periodo_id: 'p-1', militar_id: m1.militar_id, data_folga: '2026-11-04', equipe: 'Equipe A', ordem_no_momento: 1, status: Config.CHOICE_STATUS.ATIVA };
  const e2 = { escolha_id: ValidationService.generateUuid(), periodo_id: 'p-1', militar_id: m2.militar_id, data_folga: '2026-11-10', equipe: 'Equipe A', ordem_no_momento: 2, status: Config.CHOICE_STATUS.ATIVA };
  Repository.insert(Config.SHEETS.ESCOLHAS, e1);
  Repository.insert(Config.SHEETS.ESCOLHAS, e2);

  let permuta = null;
  await t.test('Militar A solicita permuta com Militar B', () => {
    permuta = SwapService.requestSwap(ctxA, {
      escolha_origem_id: e1.escolha_id,
      militar_destino_id: m2.militar_id,
      escolha_destino_id: e2.escolha_id,
      justificativa: 'Compromisso pessoal inadiável'
    });

    assert.equal(permuta.status, Config.SWAP_STATUS.PENDENTE);
  });

  await t.test('Administrador aprova permuta e as datas são trocadas atomicamente', () => {
    const aprovada = SwapService.approveSwap(adminCtx, permuta.permuta_id);
    assert.equal(aprovada.status, Config.SWAP_STATUS.APROVADA);

    // Verifica que a folga de m1 agora é 2026-11-10 e a de m2 é 2026-11-04
    const e1Atualizada = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', e1.escolha_id);
    const e2Atualizada = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', e2.escolha_id);

    assert.equal(e1Atualizada.data_folga, '2026-11-10');
    assert.equal(e2Atualizada.data_folga, '2026-11-04');
  });
});

test('3. Afastamentos Operacionais e LGPD (LeaveService)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin@bombeiros.gov.br', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '70001', nome_completo: 'Cb Ferias', nome_guerra: 'Ferias', graduacao: 'Cb', equipe: 'Equipe C', ordem_antiguidade: 1, email_vinculado: 'f@gmail.com' });

  await t.test('Registro de férias operacionais sem dados sensíveis de saúde', () => {
    const leave = LeaveService.registerLeave(adminCtx, {
      militar_id: m1.militar_id,
      data_inicio: '2026-11-01',
      data_fim: '2026-11-15',
      tipo_operacional: 'FERIAS',
      observacao_administrativa: '1º período regulamentar'
    });

    assert.equal(leave.status, Config.LEAVE_STATUS.ATIVO);
    assert.equal(LeaveService.isMilitaryOnLeave(m1.militar_id, '2026-11-05'), true);
    assert.equal(LeaveService.isMilitaryOnLeave(m1.militar_id, '2026-11-20'), false);
  });
});

test('4. Diagnóstico de Integridade e Backups (Diagnostics & Backup)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin@bombeiros.gov.br', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };

  await t.test('Diagnóstico em banco íntegro retorna status HEALTHY', () => {
    const diag = DiagnosticsService.runFullDiagnostics();
    assert.equal(diag.status, 'HEALTHY');
    assert.equal(diag.totalIssues, 0);
  });

  await t.test('Backup gera snapshot completo serializado e auditado', () => {
    const backup = BackupService.generateBackupSnapshot(adminCtx);
    assert.ok(backup.timestamp);
    assert.equal(backup.schemaVersion, Config.SCHEMA_VERSION);
    assert.ok(backup.data[Config.SHEETS.MILITARES] !== undefined);

    const auditBackup = Repository.find(Config.SHEETS.AUDITORIA, a => a.acao === 'BACKUP_GERADO');
    assert.ok(auditBackup.length > 0);
  });
});

test('5. Intervenção Administrativa e Passagem de Vez Justificada (AdminService)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin@bombeiros.gov.br', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '80001', nome_completo: 'Sd Lento', nome_guerra: 'Lento', graduacao: 'Sd', equipe: 'Equipe A', ordem_antiguidade: 1, email_vinculado: 'l@gmail.com' });

  await t.test('Passagem de vez justificada é gravada na auditoria e libera a fila', () => {
    const res = AdminService.passTurn(adminCtx, 'p-1', m1.militar_id, 'Não se manifestou no prazo de 24 horas');
    assert.equal(res.success, true);

    const auditPass = Repository.find(Config.SHEETS.AUDITORIA, a => a.acao === 'PASSAGEM_VEZ_ADMINISTRATIVA');
    assert.ok(auditPass.length > 0);
    assert.equal(auditPass[0].justificativa, 'Não se manifestou no prazo de 24 horas');
  });
});
