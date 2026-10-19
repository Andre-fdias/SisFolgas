/**
 * SUÍTE DE TESTES AUTOMATIZADOS - NOVAS REGRAS DE NEGÓCIO:
 * 1. Janela de escolha 01 a 16 (bloqueio do dia 17 ao fim do mês)
 * 2. Liberação de trocas de folga e permutas APÓS todos da equipe escolherem
 * 3. Regra de Não Faz Jus (férias, licença prêmio, convalescença, LTS) pulando a vez
 * 4. Acúmulo de folga para outro mês validado obrigatoriamente pelo Administrador
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

test('1. Janela de Escolha Mensal (01 a 16 e Bloqueio 17 ao fim do mês)', async (t) => {
  ChoiceService.setBypassWindowCheck(false);

  await t.test('assertWithinChoiceWindow permite operações entre dias 01 e 16', () => {
    assert.doesNotThrow(() => ChoiceService.assertWithinChoiceWindow('2026-11-01T10:00:00'));
    assert.doesNotThrow(() => ChoiceService.assertWithinChoiceWindow('2026-11-10T12:00:00'));
    assert.doesNotThrow(() => ChoiceService.assertWithinChoiceWindow('2026-11-16T23:59:59'));
  });

  await t.test('assertWithinChoiceWindow bloqueia edições do dia 17 em diante', () => {
    assert.throws(
      () => ChoiceService.assertWithinChoiceWindow('2026-11-17T00:00:01'),
      /bloqueado para edições/
    );
    assert.throws(
      () => ChoiceService.assertWithinChoiceWindow('2026-11-28T15:30:00'),
      /bloqueado para edições/
    );
  });
});

test('2. Regra de Não Faz Jus (Férias, Licença-Prêmio, Convalescença, LTS)', async (t) => {
  ChoiceService.setBypassWindowCheck(true);
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin.cbm@gmail.com', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };

  const p1 = PeriodService.createPeriod(adminCtx, { competencia: '2026-11', data_abertura: '2026-10-01', data_encerramento: '2026-11-30' });
  PeriodService.changeStatus(adminCtx, p1.periodo_id, Config.PERIOD_STATUS.ABERTO);
  const p1Id = p1.periodo_id;

  // Cadastra 2 militares na Equipe B (Antiguidade 1 e 2)
  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '91001', nome_completo: 'Sgt Ferias', nome_guerra: 'Ferias', graduacao: '1º Sgt', equipe: 'Equipe B', ordem_antiguidade: 1, email_vinculado: 'm1@gmail.com' });
  const m2 = MilitaryService.saveMilitary(adminCtx, { re: '91002', nome_completo: 'Cb Ativo', nome_guerra: 'Ativo', graduacao: 'Cb', equipe: 'Equipe B', ordem_antiguidade: 2, email_vinculado: 'm2@gmail.com' });

  // Estado inicial: m1 é a vez
  let queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe B');
  assert.equal(queue.proximo_da_vez.militar_id, m1.militar_id);

  await t.test('Admin marca NÃO FAZ JUS por FÉRIAS e a vez pula automaticamente para m2', () => {
    const res = AdminService.setNaoFazJus(adminCtx, p1Id, m1.militar_id, 'FERIAS', 'Militar em gozo de férias regulamentares');
    assert.equal(res.success, true);

    // Fila recalculada: m1 agora é NAO_FAZ_JUS, e m2 é SUA_VEZ!
    queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe B');
    assert.equal(queue.fila[0].status_fila, 'NAO_FAZ_JUS');
    assert.equal(queue.fila[1].status_fila, 'SUA_VEZ');
    assert.equal(queue.proximo_da_vez.militar_id, m2.militar_id);
  });
});

test('3. Regra de Acúmulo de Folga para Outro Mês (Homologado por Administrador)', async (t) => {
  ChoiceService.setBypassWindowCheck(true);
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin.cbm@gmail.com', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  const p1 = PeriodService.createPeriod(adminCtx, { competencia: '2026-11', data_abertura: '2026-10-01', data_encerramento: '2026-11-30' });
  PeriodService.changeStatus(adminCtx, p1.periodo_id, Config.PERIOD_STATUS.ABERTO);
  const p1Id = p1.periodo_id;

  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '92001', nome_completo: 'Sd Acumula', nome_guerra: 'Acumula', graduacao: 'Sd', equipe: 'Equipe C', ordem_antiguidade: 1, email_vinculado: 'ac@gmail.com' });
  const m2 = MilitaryService.saveMilitary(adminCtx, { re: '92002', nome_completo: 'Sd Segue', nome_guerra: 'Segue', graduacao: 'Sd', equipe: 'Equipe C', ordem_antiguidade: 2, email_vinculado: 'seg@gmail.com' });

  const ctxM1 = { authenticated: true, email: 'ac@gmail.com', perfil: Config.ROLES.MILITAR, permissions: Config.ROLE_PERMISSIONS.MILITAR, militar: m1 };

  await t.test('Militar da vez solicita acumular folga: entra em PENDENTE_VALIDACAO', () => {
    const res = ChoiceService.requestAccumulateLeave(ctxM1, p1Id, m1.militar_id, 'Desejo acumular para o mês de Dezembro');
    assert.equal(res.success, true);
    assert.equal(res.escolha.status, Config.CHOICE_STATUS.PENDENTE_VALIDACAO);
    assert.equal(res.escolha.data_folga, 'FOLGA_ACUMULADA');
  });

  await t.test('Admin homologa acúmulo: gera saldo em Créditos e a fila libera para m2', () => {
    const pendentes = AdminService.getPendingAccumulateRequests(adminCtx);
    assert.equal(pendentes.length, 1);
    assert.equal(pendentes[0].militar_id, m1.militar_id);

    const escolhaId = pendentes[0].escolha_id;
    const resAprov = AdminService.approveAccumulateLeave(adminCtx, escolhaId);
    assert.equal(resAprov.success, true);

    // Verifica que m1 recebeu 1 crédito de folga
    const creditos = CreditService.getAvailableCredits(m1.militar_id);
    assert.equal(creditos.length, 1);
    assert.equal(creditos[0].quantidade, 1);

    // Fila recalculada: m1 agora tem FOLGA_ACUMULADA, e m2 é SUA_VEZ!
    const queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe C');
    assert.equal(queue.fila[0].status_fila, 'FOLGA_ACUMULADA');
    assert.equal(queue.fila[1].status_fila, 'SUA_VEZ');
    assert.equal(queue.proximo_da_vez.militar_id, m2.militar_id);
  });
});

test('4. Liberação da Fase de Trocas e Permutas APÓS todos da equipe escolherem', async (t) => {
  ChoiceService.setBypassWindowCheck(true);
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = { authenticated: true, email: 'admin.cbm@gmail.com', perfil: Config.ROLES.ADMIN, permissions: Config.ROLE_PERMISSIONS.ADMIN };
  const p1 = PeriodService.createPeriod(adminCtx, { competencia: '2026-11', data_abertura: '2026-10-01', data_encerramento: '2026-11-30' });
  PeriodService.changeStatus(adminCtx, p1.periodo_id, Config.PERIOD_STATUS.ABERTO);
  const p1Id = p1.periodo_id;

  // Equipe A com apenas 2 militares para teste
  const m1 = MilitaryService.saveMilitary(adminCtx, { re: '93001', nome_completo: 'Mil Um', nome_guerra: 'Um', graduacao: 'Sd', equipe: 'Equipe A', ordem_antiguidade: 1, email_vinculado: 'um@gmail.com' });
  const m2 = MilitaryService.saveMilitary(adminCtx, { re: '93002', nome_completo: 'Mil Dois', nome_guerra: 'Dois', graduacao: 'Sd', equipe: 'Equipe A', ordem_antiguidade: 2, email_vinculado: 'dois@gmail.com' });

  const ctxM1 = { authenticated: true, email: 'um@gmail.com', perfil: Config.ROLES.MILITAR, permissions: Config.ROLE_PERMISSIONS.MILITAR, militar: m1 };
  const ctxM2 = { authenticated: true, email: 'dois@gmail.com', perfil: Config.ROLES.MILITAR, permissions: Config.ROLE_PERMISSIONS.MILITAR, militar: m2 };

  const datas = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe A');
  const d1 = datas[0];
  const d2 = datas[1];
  const d3 = datas[2]; // vaga que sobrará

  // Militar 1 escolhe d1
  const res1 = ChoiceService.makeChoice(ctxM1, p1Id, m1.militar_id, d1, 'idempotency-key-mil-1');

  await t.test('Enquanto m2 não escolheu, a fase de trocas está bloqueada', () => {
    let queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe A');
    assert.equal(queue.todas_escolhas_concluidas, false);
    assert.equal(queue.fase_trocas_liberada, false);

    // m1 tenta trocar por d3 antes de m2 escolher -> bloqueado!
    assert.throws(
      () => ChoiceService.changeChoiceToAvailableDate(ctxM1, res1.escolha.escolha_id, d3, 'Troca precoce'),
      /só é permitida após todos os militares da equipe concluírem/
    );
  });

  // Militar 2 escolhe d2
  const res2 = ChoiceService.makeChoice(ctxM2, p1Id, m2.militar_id, d2, 'idempotency-key-mil-2');

  await t.test('Após todos escolherem, a fase de trocas é LIBERADA na equipe!', () => {
    const queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe A');
    assert.equal(queue.todas_escolhas_concluidas, true);
    assert.equal(queue.fase_trocas_liberada, true);
    assert.equal(queue.proximo_da_vez, null);
  });

  await t.test('Militar 1 troca seu dia para a vaga d3 com sucesso', () => {
    const resTroca = ChoiceService.changeChoiceToAvailableDate(ctxM1, res1.escolha.escolha_id, d3, 'Prefiro d3');
    assert.equal(resTroca.success, true);
    assert.equal(resTroca.escolha.data_folga, d3);

    // Agora d1 ficou vaga e d3 ficou ocupada!
    const queue = ChoiceService.getTeamQueueStatus(p1Id, 'Equipe A');
    assert.ok(queue.datas_disponiveis.includes(d1));
    assert.ok(!queue.datas_disponiveis.includes(d3));
  });

  await t.test('Militar 2 permuta diretamente seu dia d2 com o dia d3 do Militar 1', () => {
    const permuta = SwapService.requestSwap(ctxM2, {
      escolha_origem_id: res2.escolha.escolha_id,
      militar_destino_id: m1.militar_id,
      escolha_destino_id: res1.escolha.escolha_id,
      justificativa: 'Troca mútua acordada'
    });
    assert.equal(permuta.status, Config.SWAP_STATUS.PENDENTE);

    SwapService.approveSwap(adminCtx, permuta.permuta_id);

    const e1 = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', res1.escolha.escolha_id);
    const e2 = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', res2.escolha.escolha_id);
    assert.equal(e1.data_folga, d2);
    assert.equal(e2.data_folga, d3);
  });
});
