/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Code.js - Ponto de entrada Web App (doGet), roteamento de RPCs seguras e DTO envelopes
 */

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
    if (!context.authenticated) {
      return {
        authenticated: false,
        error: context.error
      };
    }

    const activePeriod = PeriodService.getActivePeriod();
    const sanitizedMilitar = context.militar ? ValidationService.sanitizeMilitaryDto(context.militar, true) : null;

    let queues = {};
    if (activePeriod) {
      Config.DEFAULTS.TEAMS.forEach(team => {
        queues[team] = ChoiceService.getTeamQueueStatus(activePeriod.periodo_id, team);
      });
    }

    return {
      authenticated: true,
      user: {
        email: context.email,
        perfil: context.perfil,
        permissions: context.permissions,
        militar: sanitizedMilitar
      },
      activePeriod: activePeriod,
      queues: queues,
      teams: Config.DEFAULTS.TEAMS
    };
  });
}

/**
 * Consulta atualizada da fila de uma equipe
 */
function apiGetTeamQueue(periodoId, equipe) {
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
    apiApproveSwap
  };
}
