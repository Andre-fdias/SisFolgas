/**
 * TESTES AUTOMATIZADOS - FASE 4: AUTOMAÇÃO, NOTIFICAÇÕES E EXPERIÊNCIA MOBILE
 * Cobertura de:
 * 1. Gestão de Configurações e E-mail de Notificação (NotificationService)
 * 2. Geração da Escala Oficial em HTML e PDF (ReportService)
 * 3. Rotina Automática de Fechamento do Dia 17 (NotificationService)
 * 4. Rotina Automática de Abertura do Dia 01 (NotificationService)
 * 5. Gatilhos Diários e Manifesto PWA (manifest.json)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Módulos globais
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
global.ReportService = require('../ReportService.js');
global.NotificationService = require('../NotificationService.js');
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
    getUrl: () => 'https://docs.google.com/spreadsheets/d/mock-sheet-id/edit',
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = createMockSheet(name);
      return sheets[name];
    }
  };
}

function setupInMemorySpreadsheet() {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema();
}

test('Fase 4: Automação, Notificações da Escala e PWA Mobile', async (t) => {
  setupInMemorySpreadsheet();

  const adminCtx = {
    authenticated: true,
    email: 'admin.cbm@gmail.com',
    perfil: Config.ROLES.ADMIN,
    isOwner: true
  };

  const militarCtx = {
    authenticated: true,
    email: 'bombeiro1@pmesp.sp.gov.br',
    perfil: Config.ROLES.MILITAR
  };

  await t.test('4.1 Gestão de Configurações e E-mail Institucional', () => {
    // 1. Militar comum não pode salvar configurações (RBAC)
    assert.throws(() => {
      NotificationService.saveSettings(militarCtx, { emailNotificacao: 'teste@bombeiros.sp.gov.br' });
    }, /Acesso negado/);

    // 2. E-mail com formato inválido deve ser rejeitado
    assert.throws(() => {
      NotificationService.saveSettings(adminCtx, { emailNotificacao: 'email-invalido-sem-arroba' });
    }, /Formato de e-mail inválido/);

    // 3. Administrador salva e-mail institucional oficial com sucesso
    const saved = NotificationService.saveSettings(adminCtx, {
      emailNotificacao: 'sgb2.ebsaoroque@policiamilitar.sp.gov.br',
      autoTriggerAtivo: true
    });

    assert.equal(saved.emailNotificacao, 'sgb2.ebsaoroque@policiamilitar.sp.gov.br');
    assert.equal(saved.autoTriggerAtivo, true);

    // 4. Leitura das configurações persiste os valores
    const current = NotificationService.getSettings();
    assert.equal(current.emailNotificacao, 'sgb2.ebsaoroque@policiamilitar.sp.gov.br');
    assert.equal(current.autoTriggerAtivo, true);
  });

  await t.test('4.2 Geração da Escala Oficial em HTML e PDF (ReportService)', () => {
    // Cria período e militares para compor o relatório
    const periodo = PeriodService.createPeriod(adminCtx, {
      competencia: '2026-11',
      data_abertura: '2026-10-01',
      data_encerramento: '2026-10-16'
    });

    Repository.insert(Config.SHEET_NAMES.MILITARES, {
      militar_id: 'mil-001',
      re: '108154',
      digito_re: '3',
      nome_completo: 'Andre Dias',
      nome_guerra: 'Andre Dias',
      graduacao: '1º Sgt PM',
      unidade: '2º SGB- Eb São Roque',
      prontidao: 'VERDE',
      equipe: 'VERDE',
      ordem_antiguidade: 1,
      ativo: true
    });

    Repository.insert(Config.SHEET_NAMES.ESCOLHAS, {
      escolha_id: 'esc-001',
      periodo_id: periodo.periodo_id,
      militar_id: 'mil-001',
      data_folga: '2026-11-05',
      equipe: 'VERDE',
      ordem_no_momento: 1,
      status: Config.CHOICE_STATUS.ATIVA
    });

    // Gera HTML
    const html = ReportService.generateScaleReportHtml(periodo.periodo_id);
    assert.ok(html.includes('SisFolgas- São Roque'), 'HTML deve conter SisFolgas- São Roque');
    assert.ok(html.includes('2º SUBGRUPAMENTO DE BOMBEIROS (2º SGB)'), 'HTML deve conter 2º SGB');
    assert.ok(html.includes('ESTAÇÃO DE BOMBEIROS DE SÃO ROQUE'), 'HTML deve conter Eb São Roque');
    assert.ok(html.includes('108154-3'), 'HTML deve conter o RE formatado');
    assert.ok(html.includes('05/11/2026'), 'HTML deve conter a data da folga formatada');
    assert.ok(html.includes('Folga Confirmada'), 'HTML deve conter badge de situação');

    // Gera Blob PDF
    const pdfBlob = ReportService.generateScalePdfBlob(periodo.periodo_id);
    assert.ok(pdfBlob.getName().includes('Escala_Oficial_Folgas_2026-11_2SGB_SaoRoque.pdf'));
    assert.equal(pdfBlob.getContentType(), 'application/pdf');
    assert.ok(pdfBlob.getBytes().length > 0);
  });

  await t.test('4.3 Rotina de Fechamento do Dia 17 (Automática & Despacho de PDF)', () => {
    // Período ativo
    const activePer = Repository.findAll(Config.SHEET_NAMES.PERIODOS)[0];
    Repository.updateById(Config.SHEET_NAMES.PERIODOS, 'periodo_id', activePer.periodo_id, {
      status: Config.PERIOD_STATUS.ABERTO
    });

    // Insere militar que NÃO escolheu no prazo
    Repository.insert(Config.SHEET_NAMES.MILITARES, {
      militar_id: 'mil-002',
      re: '123456',
      digito_re: '7',
      nome_completo: 'Joao Silva',
      nome_guerra: 'Silva',
      graduacao: 'Cb PM',
      unidade: '2º SGB- Eb São Roque',
      prontidao: 'VERDE',
      equipe: 'VERDE',
      ordem_antiguidade: 2,
      ativo: true
    });

    // Executa rotina de fechamento
    const res = NotificationService.executeMonthlyClosingRoutine('test-op-17');
    assert.equal(res.success, true);
    assert.equal(res.periodoId, activePer.periodo_id);
    assert.equal(res.emailEnviado, true);
    assert.equal(res.emailEnviadoPara, 'sgb2.ebsaoroque@policiamilitar.sp.gov.br');
    assert.equal(res.pendenciasResolvidas, 1, 'Militar 2 pendente deve ser finalizado como expirado');

    // Verifica se período foi encerrado
    const updatedPer = Repository.findById(Config.SHEET_NAMES.PERIODOS, activePer.periodo_id);
    assert.equal(updatedPer.status, Config.PERIOD_STATUS.ENCERRADO);

    // Verifica se militar 2 recebeu status NAO_ESCOLHEU_NO_PRAZO
    const escolhas = Repository.findAll(Config.SHEET_NAMES.ESCOLHAS);
    const m2Choice = escolhas.find(e => e.militar_id === 'mil-002');
    assert.ok(m2Choice);
    assert.equal(m2Choice.status, 'NAO_ESCOLHEU_NO_PRAZO');

    // Verifica auditoria
    const logs = Repository.findAll(Config.SHEET_NAMES.AUDITORIA);
    const auditClosing = logs.find(l => (l.acao === 'ROTINA_FECHAMENTO_MENSAL_EXECUTADA' || l.tipo_evento === 'ROTINA_FECHAMENTO_MENSAL_EXECUTADA'));
    assert.ok(auditClosing);
  });

  await t.test('4.4 Rotina de Abertura do Dia 01 (Abertura de Competência)', () => {
    const res = NotificationService.executeMonthlyOpeningRoutine('test-op-01');
    assert.equal(res.success, true);
    assert.equal(res.status, Config.PERIOD_STATUS.ABERTO);
    assert.ok(res.competencia);

    // Verifica se período foi inserido
    const periodo = Repository.findById(Config.SHEET_NAMES.PERIODOS, res.periodoId);
    assert.ok(periodo);
    assert.equal(periodo.status, Config.PERIOD_STATUS.ABERTO);
  });

  await t.test('4.5 Validação do Manifesto PWA (manifest.json)', () => {
    const manifestPath = path.join(__dirname, '..', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json deve existir na raiz');

    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    assert.equal(content.name, 'SisFolgas- São Roque');
    assert.equal(content.short_name, 'SisFolgas');
    assert.equal(content.display, 'standalone');
    assert.equal(content.theme_color, '#dc2626');
    assert.ok(Array.isArray(content.icons) && content.icons.length > 0);
  });

  await t.test('4.6 Integração RPC em Code.js para Fase 4', () => {
    const settingsRpc = Code.apiGetSettings({ sessionRe: 'admin' });
    assert.equal(settingsRpc.success, true);
    assert.ok(settingsRpc.data.emailNotificacao);

    const saveRpc = Code.apiSaveSettings({
      sessionRe: 'admin',
      settings: { emailNotificacao: 'comando.saoroque@bombeiros.sp.gov.br' }
    });
    assert.equal(saveRpc.success, true);
    assert.equal(saveRpc.data.emailNotificacao, 'comando.saoroque@bombeiros.sp.gov.br');
  });
});
