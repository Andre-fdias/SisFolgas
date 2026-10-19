/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Code.js - Ponto de entrada Web App (doGet), roteamento de RPCs seguras e DTO envelopes
 */

if (typeof module !== 'undefined' && module.exports) {
  if (typeof global !== 'undefined') {
    global.Config = global.Config || require('./Config.js');
    global.ValidationService = global.ValidationService || require('./ValidationService.js');
    global.Repository = global.Repository || require('./Repository.js');
    global.AuditService = global.AuditService || require('./AuditService.js');
    global.AuthService = global.AuthService || require('./AuthService.js');
    global.MilitaryService = global.MilitaryService || require('./MilitaryService.js');
    global.PeriodService = global.PeriodService || require('./PeriodService.js');
    global.ChoiceService = global.ChoiceService || require('./ChoiceService.js');
    global.AdminService = global.AdminService || require('./AdminService.js');
    global.CreditService = global.CreditService || require('./CreditService.js');
    global.LeaveService = global.LeaveService || require('./LeaveService.js');
    global.SwapService = global.SwapService || require('./SwapService.js');
    global.DiagnosticsService = global.DiagnosticsService || require('./DiagnosticsService.js');
    global.BackupService = global.BackupService || require('./BackupService.js');
  }
}

/**
 * Ponto de entrada HTTP do Google Apps Script
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle(Config.APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(`
      <div style="font-family: sans-serif; padding: 2rem; text-align: center; color: #b91c1c;">
        <h2>Erro de Inicialização do Sistema</h2>
        <p>Não foi possível carregar a aplicação. Por favor, contate o administrador do sistema.</p>
      </div>
    `);
  }
}

/**
 * Helper para inclusão de componentes HTML modulares (Styles, Scripts)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * ============================================================================
 * FUNÇÃO DE INICIALIZAÇÃO DO SISTEMA NO GOOGLE APPS SCRIPT
 * Selecione 'setupInicializarSistema' no menu superior e clique em 'Executar'
 * ============================================================================
 */
function setupInicializarSistema() {
  Logger.log('1. Inicializando esquema de abas do banco de dados na Planilha...');
  const resBanco = Repository.initializeSchema();
  Logger.log('Estrutura do banco criada: ' + JSON.stringify(resBanco));

  Logger.log('2. Carregando dados de teste (21 militares fictícios e administrador)...');
  const resSeed = SeedData.populateTestData();
  Logger.log('Carga inicial: ' + JSON.stringify(resSeed));

  Logger.log('✅ Sistema SisFolgas inicializado com sucesso na planilha!');
}

function setupCriarApenasAbas() {
  Repository.initializeSchema();
  Logger.log('✅ As 9 abas do banco foram criadas com sucesso na planilha!');
}

function setupPopularApenasMilitares() {
  SeedData.populateTestData();
  Logger.log('✅ Militares de teste cadastrados com sucesso!');
}

/**
 * Wrapper de execução segura para todas as chamadas remotas (RPC Envelope)
 */
function runSecureRpc(actionName, fn) {
  const opId = ValidationService.generateUuid();
  try {
    const context = AuthService.getUserContext();
    const result = fn(context, opId);
    return {
      success: true,
      data: result,
      opId: opId
    };
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.error(`[RPC ERROR ${opId}] Falha na ação '${actionName}':`, err);
    }
    return {
      success: false,
      error: {
        code: 'OPERATION_FAILED',
        message: err.message || 'Ocorreu um erro ao processar a operação.'
      },
      opId: opId
    };
  }
}

/* ==========================================================================
   ENDPOINTS EXPOSTOS AO CLIENTE (google.script.run)
   ========================================================================== */

/**
 * Carrega estado inicial do usuário, permissões, período ativo e filas
 */
function apiGetInitialState() {
  return runSecureRpc('getInitialState', function(context, opId) {
    const activePeriod = PeriodService.getActivePeriod();
    const sanitizedMilitar = context.militar ? ValidationService.sanitizeMilitaryDto(context.militar, true) : null;

    let queues = {};
    if (activePeriod) {
      Config.DEFAULTS.TEAMS.forEach(team => {
        queues[team] = ChoiceService.getTeamQueueStatus(activePeriod.periodo_id, team);
      });
    }

    // Lista completa de todos os militares cadastrados para exibição direta no sistema
    const allMilitares = MilitaryService.getAllActive().map(m => {
      const isSelf = context.militar && (String(context.militar.re) === String(m.re));
      const isAdmin = context.perfil === Config.ROLES.ADMIN;
      return ValidationService.sanitizeMilitaryDto(m, isSelf || isAdmin);
    });

    if (!context.authenticated) {
      return {
        authenticated: false,
        error: context.error,
        email: context.email || '',
        militares: allMilitares,
        activePeriod: activePeriod,
        queues: queues,
        teams: Config.DEFAULTS.TEAMS
      };
    }

    return {
      authenticated: true,
      user: {
        email: context.email,
        perfil: context.perfil,
        permissions: context.permissions,
        militar: sanitizedMilitar,
        isOwner: Boolean(context.isOwner)
      },
      militares: allMilitares,
      activePeriod: activePeriod,
      queues: queues,
      teams: Config.DEFAULTS.TEAMS,
      choiceWindow: {
        isOpen: ChoiceService.isWithinChoiceWindow(),
        currentDay: (new Date()).getDate(),
        startDay: Config.DEFAULTS.CHOICE_WINDOW_START_DAY,
        endDay: Config.DEFAULTS.CHOICE_WINDOW_END_DAY
      }
    };
  });
}

/**
 * Vinculação direta de e-mail Google a um RE militar
 */
function apiLinkGoogleToMilitary(payload) {
  return runSecureRpc('linkGoogleToMilitary', function(context, opId) {
    const re = ValidationService.normalizeRE(payload.re);
    const militar = MilitaryService.getByRE(re);
    if (!militar) throw new Error(`Militar com RE ${re} não encontrado.`);

    const emailToLink = (context.perfil === Config.ROLES.ADMIN && payload.email) 
      ? ValidationService.normalizeEmail(payload.email) 
      : context.email;

    if (!emailToLink) throw new Error('E-mail Google obrigatório para vinculação.');

    // Atualiza o militar na aba MILITARES
    Repository.updateById(Config.SHEETS.MILITARES, 're', re, {
      email_vinculado: emailToLink,
      atualizado_em: new Date().toISOString()
    });

    // Cria ou atualiza o usuário na aba USUARIOS
    const existingUser = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', emailToLink);
    if (existingUser) {
      Repository.updateById(Config.SHEETS.USUARIOS, 'usuario_id', existingUser.usuario_id, {
        militar_id: re,
        atualizado_em: new Date().toISOString()
      });
    } else {
      Repository.insert(Config.SHEETS.USUARIOS, {
        usuario_id: ValidationService.generateUuid(),
        email_google: emailToLink,
        militar_id: re,
        perfil: Config.ROLES.MILITAR,
        ativo: true,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });
    }

    AuditService.log({
      userEmail: context.email,
      militarId: re,
      acao: 'VINCULACAO_CONTA_GOOGLE',
      entidade: 'USUARIOS',
      registroId: re,
      resultado: Config.AUDIT_RESULT.SUCESSO,
      justificativa: `Conta Google ${emailToLink} vinculada ao militar RE ${re} (${militar.nome_guerra})`,
      opId: opId
    });

    return {
      success: true,
      mensagem: `Conta Google ${emailToLink} vinculada com sucesso ao RE ${re} (${militar.nome_guerra})!`
    };
  });
}

function apiGetAllMilitares() {
  return runSecureRpc('getAllMilitares', function(context) {
    const isAdmin = context.perfil === Config.ROLES.ADMIN;
    return MilitaryService.getAllActive().map(m => {
      const isSelf = context.militar && (String(context.militar.re) === String(m.re));
      return ValidationService.sanitizeMilitaryDto(m, isSelf || isAdmin);
    });
  });
}

/**
 * Consulta atualizada da fila de uma equipe
 */
function apiGetTeamQueue(arg1, arg2) {
  let periodoId = arg1;
  let equipe = arg2;
  if (typeof arg1 === 'object' && arg1 !== null) {
    periodoId = arg1.periodo_id;
    equipe = arg1.equipe;
  }
  return runSecureRpc('getTeamQueue', function(context, opId) {
    AuthService.requireAuthentication(context);
    return ChoiceService.getTeamQueueStatus(periodoId, equipe);
  });
}

/**
 * Confirmação de escolha de folga pelo militar
 */
function apiMakeChoice(payload) {
  return runSecureRpc('makeChoice', function(context, opId) {
    return ChoiceService.makeChoice(
      context,
      payload.periodo_id,
      payload.militar_id,
      payload.data_folga,
      payload.idempotency_key,
      opId
    );
  });
}

/**
 * Cancelamento de escolha ativa
 */
function apiCancelChoice(payload) {
  return runSecureRpc('cancelChoice', function(context, opId) {
    return ChoiceService.cancelChoice(
      context,
      payload.escolha_id,
      payload.justificativa,
      opId
    );
  });
}

/**
 * Passagem administrativa de vez na fila
 */
function apiPassTurn(payload) {
  return runSecureRpc('passTurn', function(context, opId) {
    return AdminService.passTurn(
      context,
      payload.periodo_id,
      payload.militar_id,
      payload.justificativa,
      opId
    );
  });
}

/**
 * Operações do Administrador - Cadastro de Militares
 */
function apiAdminSaveMilitary(payload) {
  return runSecureRpc('saveMilitary', function(context, opId) {
    return MilitaryService.saveMilitary(context, payload, opId);
  });
}

/**
 * Operações do Administrador - Gerenciamento de Períodos
 */
function apiAdminCreatePeriod(payload) {
  return runSecureRpc('createPeriod', function(context, opId) {
    return PeriodService.createPeriod(context, payload, opId);
  });
}

function apiAdminChangePeriodStatus(payload) {
  return runSecureRpc('changePeriodStatus', function(context, opId) {
    return PeriodService.changeStatus(context, payload.periodo_id, payload.status, payload.justificativa, opId);
  });
}

/**
 * Operações do Administrador - Relatório Operacional
 */
function apiAdminGetOperationalReport(periodoId) {
  return runSecureRpc('getOperationalReport', function(context, opId) {
    return AdminService.getOperationalReport(context, periodoId, opId);
  });
}

/**
 * Operações do Administrador - Trilha de Auditoria
 */
function apiAdminGetAuditLogs(limit) {
  return runSecureRpc('getAuditLogs', function(context, opId) {
    return AdminService.getAuditLogs(context, limit || 50, opId);
  });
}

/**
 * Operações do Administrador - Diagnóstico do Sistema
 */
function apiAdminRunDiagnostics() {
  return runSecureRpc('runDiagnostics', function(context, opId) {
    AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);
    return DiagnosticsService.runFullDiagnostics();
  });
}

/**
 * Operações do Administrador - Backup
 */
function apiAdminRunBackup() {
  return runSecureRpc('runBackup', function(context, opId) {
    return BackupService.generateBackupSnapshot(context, opId);
  });
}

/**
 * Operações de Crédito
 */
function apiGrantCredit(payload) {
  return runSecureRpc('grantCredit', function(context, opId) {
    return CreditService.grantCredit(context, payload, opId);
  });
}

/**
 * Operações de Afastamento
 */
function apiRegisterLeave(payload) {
  return runSecureRpc('registerLeave', function(context, opId) {
    return LeaveService.registerLeave(context, payload, opId);
  });
}

/**
 * Operações de Permuta
 */
function apiRequestSwap(payload) {
  return runSecureRpc('requestSwap', function(context, opId) {
    return SwapService.requestSwap(context, payload, opId);
  });
}

function apiApproveSwap(payload) {
  return runSecureRpc('approveSwap', function(context, opId) {
    return SwapService.approveSwap(context, payload.permuta_id, opId);
  });
}

function apiAdminGetPendingSwaps() {
  return runSecureRpc('adminGetPendingSwaps', function(context) {
    return SwapService.getPendingSwaps(context);
  });
}

function apiAdminRejectSwap(payload) {
  return runSecureRpc('adminRejectSwap', function(context, opId) {
    return SwapService.rejectSwap(context, payload.permuta_id, payload.motivo, opId);
  });
}

/**
 * Troca de dia por outra vaga disponível (após todos da equipe escolherem)
 */
function apiChangeChoiceToAvailableDate(payload) {
  return runSecureRpc('changeChoiceToAvailableDate', function(context, opId) {
    return ChoiceService.changeChoiceToAvailableDate(
      context,
      payload.escolha_id,
      payload.nova_data_folga,
      payload.justificativa,
      opId
    );
  });
}

/**
 * Solicitação de acúmulo de folga para outro mês
 */
function apiRequestAccumulateLeave(payload) {
  return runSecureRpc('requestAccumulateLeave', function(context, opId) {
    return ChoiceService.requestAccumulateLeave(
      context,
      payload.periodo_id,
      payload.militar_id,
      payload.justificativa,
      opId
    );
  });
}

/**
 * Registro administrativo de NÃO FAZ JUS (férias, licença prêmio, convalescença, LTS)
 */
function apiAdminSetNaoFazJus(payload) {
  return runSecureRpc('setNaoFazJus', function(context, opId) {
    return AdminService.setNaoFazJus(
      context,
      payload.periodo_id,
      payload.militar_id,
      payload.motivo,
      payload.justificativa,
      opId
    );
  });
}

/**
 * Homologação de Acúmulo de Folga pelo Administrador
 */
function apiAdminApproveAccumulateLeave(payload) {
  return runSecureRpc('approveAccumulateLeave', function(context, opId) {
    return AdminService.approveAccumulateLeave(context, payload.escolha_id, opId);
  });
}

function apiAdminRejectAccumulateLeave(payload) {
  return runSecureRpc('rejectAccumulateLeave', function(context, opId) {
    return AdminService.rejectAccumulateLeave(context, payload.escolha_id, payload.motivo, opId);
  });
}

function apiAdminGetPendingAccumulateRequests() {
  return runSecureRpc('getPendingAccumulateRequests', function(context, opId) {
    return AdminService.getPendingAccumulateRequests(context, opId);
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    include,
    runSecureRpc,
    apiGetInitialState,
    apiGetTeamQueue,
    apiMakeChoice,
    apiCancelChoice,
    apiPassTurn,
    apiAdminSaveMilitary,
    apiAdminCreatePeriod,
    apiAdminChangePeriodStatus,
    apiAdminGetOperationalReport,
    apiAdminGetAuditLogs,
    apiAdminRunDiagnostics,
    apiAdminRunBackup,
    apiGrantCredit,
    apiRegisterLeave,
    apiRequestSwap,
    apiApproveSwap,
    apiChangeChoiceToAvailableDate,
    apiRequestAccumulateLeave,
    apiAdminSetNaoFazJus,
    apiAdminApproveAccumulateLeave,
    apiAdminRejectAccumulateLeave,
    apiAdminGetPendingAccumulateRequests,
    apiAdminGetPendingSwaps,
    apiAdminRejectSwap,
    apiLinkGoogleToMilitary,
    apiGetAllMilitares,
    setupInicializarSistema,
    setupCriarApenasAbas,
    setupPopularApenasMilitares
  };
}
