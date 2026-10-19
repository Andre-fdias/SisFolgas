/**
 * SUÍTE DE TESTES AUTOMATIZADOS - FASE 3: NÚCLEO OPERACIONAL
 * Executado via Node.js test runner nativo: node --test tests/test_core_operations.js
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

// Configura o escopo global do Apps Script V8
global.Config = Config;
global.ValidationService = ValidationService;
global.Repository = Repository;
global.AuditService = AuditService;
global.AuthService = AuthService;
global.MilitaryService = MilitaryService;
global.PeriodService = PeriodService;
global.ChoiceService = ChoiceService;

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

test('1. Escala 24x48 e Elegibilidade de Datas', async (t) => {
  await t.test('Rotação cíclica correta das três equipes na escala 24x48', () => {
    // Âncora: 2026-01-01 = Equipe A
    assert.equal(ChoiceService.getTeamForDate('2026-01-01'), 'Equipe A');
    assert.equal(ChoiceService.getTeamForDate('2026-01-02'), 'Equipe B');
    assert.equal(ChoiceService.getTeamForDate('2026-01-03'), 'Equipe C');
    assert.equal(ChoiceService.getTeamForDate('2026-01-04'), 'Equipe A');
    assert.equal(ChoiceService.getTeamForDate('2026-01-05'), 'Equipe B');
  });

  await t.test('getEligibleDatesForTeam retorna apenas dias de serviço da equipe no mês', () => {
    const datesEquipeA = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe A');
    const datesEquipeB = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe B');

    assert.ok(datesEquipeA.length > 0);
    assert.ok(datesEquipeB.length > 0);

    // Assegura que nenhuma data da Equipe A coincide com a Equipe B
    datesEquipeA.forEach(dA => {
      assert.equal(ChoiceService.getTeamForDate(dA), 'Equipe A');
      assert.ok(!datesEquipeB.includes(dA), 'Data da Equipe A não pode pertencer à Equipe B');
    });
  });
});

test('2. Ciclo de Vida de Períodos (PeriodService)', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = {
    authenticated: true,
    email: 'admin.cbm@gmail.com',
    perfil: Config.ROLES.ADMIN,
    permissions: Config.ROLE_PERMISSIONS.ADMIN
  };

  const militarCtx = {
    authenticated: true,
    email: 'militar@gmail.com',
    perfil: Config.ROLES.MILITAR,
    permissions: Config.ROLE_PERMISSIONS.MILITAR
  };

  await t.test('Militar comum não pode criar ou gerenciar períodos', () => {
    assert.throws(
      () => PeriodService.createPeriod(militarCtx, { competencia: '2026-11', data_abertura: '2026-10-01', data_encerramento: '2026-10-31' }),
      /Acesso negado/
    );
  });

  let periodoCriado = null;
  await t.test('Administrador cria período com sucesso no estado RASCUNHO', () => {
    periodoCriado = PeriodService.createPeriod(adminCtx, {
      competencia: '2026-11',
      data_abertura: '2026-10-01T08:00:00Z',
      data_encerramento: '2026-11-30T23:59:59Z'
    });

    assert.equal(periodoCriado.competencia, '2026-11');
    assert.equal(periodoCriado.status, Config.PERIOD_STATUS.RASCUNHO);
  });

  await t.test('Transição válida: RASCUNHO -> ABERTO -> PAUSADO -> ABERTO -> ENCERRADO', () => {
    const id = periodoCriado.periodo_id;

    // RASCUNHO -> ABERTO
    const aberto = PeriodService.changeStatus(adminCtx, id, Config.PERIOD_STATUS.ABERTO);
    assert.equal(aberto.status, Config.PERIOD_STATUS.ABERTO);
    assert.equal(PeriodService.getActivePeriod().periodo_id, id);

    // ABERTO -> PAUSADO
    const pausado = PeriodService.changeStatus(adminCtx, id, Config.PERIOD_STATUS.PAUSADO);
    assert.equal(pausado.status, Config.PERIOD_STATUS.PAUSADO);

    // PAUSADO -> ABERTO
    const reaberto = PeriodService.changeStatus(adminCtx, id, Config.PERIOD_STATUS.ABERTO);
    assert.equal(reaberto.status, Config.PERIOD_STATUS.ABERTO);

    // ABERTO -> ENCERRADO
    const encerrado = PeriodService.changeStatus(adminCtx, id, Config.PERIOD_STATUS.ENCERRADO, 'Competência concluída');
    assert.equal(encerrado.status, Config.PERIOD_STATUS.ENCERRADO);
  });

  await t.test('Transição inválida deve ser bloqueada', () => {
    const id = periodoCriado.periodo_id;
    // Tenta ENCERRADO -> PAUSADO (não permitido diretamente)
    assert.throws(
      () => PeriodService.changeStatus(adminCtx, id, Config.PERIOD_STATUS.PAUSADO),
      /Transição de status inválida/
    );
  });
});

test('3. Motor de Escolha, Ordem de Antiguidade e Concorrência Atômica', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  const adminCtx = {
    authenticated: true,
    email: 'admin.cbm@gmail.com',
    perfil: Config.ROLES.ADMIN,
    permissions: Config.ROLE_PERMISSIONS.ADMIN
  };

  // 1. Cadastra Período Aberto
  const periodo = PeriodService.createPeriod(adminCtx, {
    competencia: '2026-11',
    data_abertura: '2026-10-01T00:00:00Z',
    data_encerramento: '2026-11-30T23:59:59Z'
  });
  PeriodService.changeStatus(adminCtx, periodo.periodo_id, Config.PERIOD_STATUS.ABERTO);

  // 2. Cadastra 3 Militares na Equipe A com Antiguidades 1, 2 e 3
  const m1 = MilitaryService.saveMilitary(adminCtx, {
    re: '10001',
    nome_completo: 'Sargento Carlos Silva',
    nome_guerra: 'C. Silva',
    graduacao: '1º Sgt PM',
    equipe: 'Equipe A',
    ordem_antiguidade: 1,
    email_vinculado: 'csilva@gmail.com'
  });

  const m2 = MilitaryService.saveMilitary(adminCtx, {
    re: '10002',
    nome_completo: 'Cabo Marcos Oliveira',
    nome_guerra: 'Oliveira',
    graduacao: 'Cb PM',
    equipe: 'Equipe A',
    ordem_antiguidade: 2,
    email_vinculado: 'oliveira@gmail.com'
  });

  const m3 = MilitaryService.saveMilitary(adminCtx, {
    re: '10003',
    nome_completo: 'Soldado Bruno Costa',
    nome_guerra: 'Costa',
    graduacao: 'Sd PM',
    equipe: 'Equipe A',
    ordem_antiguidade: 3,
    email_vinculado: 'costa@gmail.com'
  });

  const ctxM1 = {
    authenticated: true,
    email: 'csilva@gmail.com',
    perfil: Config.ROLES.MILITAR,
    permissions: Config.ROLE_PERMISSIONS.MILITAR,
    militar: m1
  };

  const ctxM2 = {
    authenticated: true,
    email: 'oliveira@gmail.com',
    perfil: Config.ROLES.MILITAR,
    permissions: Config.ROLE_PERMISSIONS.MILITAR,
    militar: m2
  };

  const datasEquipeA = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe A');
  const data1 = datasEquipeA[0];
  const data2 = datasEquipeA[1];

  await t.test('Estado inicial da fila: Apenas o 1º mais antigo (C. Silva) tem status SUA_VEZ', () => {
    const queue = ChoiceService.getTeamQueueStatus(periodo.periodo_id, 'Equipe A');
    assert.equal(queue.fila[0].militar_id, m1.militar_id);
    assert.equal(queue.fila[0].status_fila, 'SUA_VEZ');
    assert.equal(queue.fila[1].status_fila, 'AGUARDANDO');
    assert.equal(queue.fila[2].status_fila, 'AGUARDANDO');
    assert.equal(queue.proximo_da_vez.militar_id, m1.militar_id);
  });

  await t.test('Militar que não é da vez (Oliveira) tenta escolher e é terminantemente barrado', () => {
    assert.throws(
      () => ChoiceService.makeChoice(ctxM2, periodo.periodo_id, m2.militar_id, data1, 'idemp-key-m2-fail-1'),
      /Ainda não é sua vez de escolher/
    );

    // Verifica que tentativa gerou auditoria de segurança
    const secLogs = Repository.find(Config.SHEETS.AUDITORIA, r => r.acao === 'OUT_OF_TURN_ATTEMPT');
    assert.ok(secLogs.length > 0);
  });

  await t.test('Militar da vez tenta escolher data fora do plantão da sua equipe e é barrado', () => {
    // Busca uma data que não é da Equipe A
    const datasEquipeB = ChoiceService.getEligibleDatesForTeam('2026-11', 'Equipe B');
    const dataErrada = datasEquipeB[0];

    assert.throws(
      () => ChoiceService.makeChoice(ctxM1, periodo.periodo_id, m1.militar_id, dataErrada, 'idemp-key-m1-fail-2'),
      /não é dia de plantão da sua equipe/
    );
  });

  await t.test('Militar da vez (C. Silva) escolhe data válida: sucesso atômico', () => {
    const res = ChoiceService.makeChoice(ctxM1, periodo.periodo_id, m1.militar_id, data1, 'idemp-key-m1-success-1');
    assert.equal(res.success, true);
    assert.equal(res.escolha.data_folga, data1);
    assert.equal(res.escolha.status, Config.CHOICE_STATUS.ATIVA);

    // Fila é atualizada automaticamente: C. Silva agora é ESCOLHIDO, Oliveira se torna SUA_VEZ
    const queue = ChoiceService.getTeamQueueStatus(periodo.periodo_id, 'Equipe A');
    assert.equal(queue.fila[0].status_fila, 'ESCOLHIDO');
    assert.equal(queue.fila[0].data_folga, data1);
    assert.equal(queue.fila[1].status_fila, 'SUA_VEZ');
    assert.equal(queue.proximo_da_vez.militar_id, m2.militar_id);
  });

  await t.test('Militar 1 tenta escolher novamente na mesma competência: bloqueado por limite', () => {
    assert.throws(
      () => ChoiceService.makeChoice(ctxM1, periodo.periodo_id, m1.militar_id, data2, 'idemp-key-m1-dup-1'),
      /Você já realizou sua escolha de folga para esta competência/
    );
  });

  await t.test('Militar 2 (agora é sua vez) tenta escolher a MESMA data já ocupada: bloqueado por exclusividade', () => {
    assert.throws(
      () => ChoiceService.makeChoice(ctxM2, periodo.periodo_id, m2.militar_id, data1, 'idemp-key-m2-dupdate-1'),
      /já foi escolhida por outro militar da sua equipe/
    );
  });

  await t.test('Militar 2 escolhe data disponível com sucesso', () => {
    const res = ChoiceService.makeChoice(ctxM2, periodo.periodo_id, m2.militar_id, data2, 'idemp-key-m2-success-1');
    assert.equal(res.success, true);
    assert.equal(res.escolha.data_folga, data2);

    // Próximo da vez agora é o Militar 3 (Costa)
    const queue = ChoiceService.getTeamQueueStatus(periodo.periodo_id, 'Equipe A');
    assert.equal(queue.proximo_da_vez.militar_id, m3.militar_id);
  });

  await t.test('Idempotência: reenvio com a mesma idempotency_key não gera duplicidade', () => {
    const totalAntes = Repository.getAll(Config.SHEETS.ESCOLHAS).length;
    const resRepetido = ChoiceService.makeChoice(ctxM2, periodo.periodo_id, m2.militar_id, data2, 'idemp-key-m2-success-1');
    const totalDepois = Repository.getAll(Config.SHEETS.ESCOLHAS).length;

    assert.equal(resRepetido.success, true);
    assert.equal(totalDepois, totalAntes, 'Nenhum registro extra deve ser inserido');
  });

  await t.test('Cancelamento de escolha preserva o histórico (Soft-cancel)', () => {
    const escolhas = Repository.find(Config.SHEETS.ESCOLHAS, e => e.militar_id === m1.militar_id && e.status === Config.CHOICE_STATUS.ATIVA);
    assert.equal(escolhas.length, 1);
    const escolhaId = escolhas[0].escolha_id;

    ChoiceService.cancelChoice(adminCtx, escolhaId, 'Necessidade de serviço operacional urgente');

    const escolhaCancelada = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', escolhaId);
    assert.equal(escolhaCancelada.status, Config.CHOICE_STATUS.CANCELADA);
    assert.equal(escolhaCancelada.justificativa_cancelamento, 'Necessidade de serviço operacional urgente');

    // Registro na auditoria confirmando o cancelamento
    const auditLogs = Repository.find(Config.SHEETS.AUDITORIA, r => r.acao === 'ESCOLHA_CANCELADA');
    assert.ok(auditLogs.length > 0);
  });
});
