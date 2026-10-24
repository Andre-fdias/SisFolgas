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
    const appTitle = (typeof Config !== 'undefined' && Config.APP_NAME) ? Config.APP_NAME : 'SisFolgas- São Roque';
    const template = HtmlService.createTemplateFromFile('Index');
    return template.evaluate()
      .setTitle(appTitle)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    Logger.log('Erro de Inicialização no doGet: ' + (err ? (err.stack || err.message) : err));
    const detalhesErro = err ? (err.stack || err.message || String(err)) : 'Erro desconhecido';
    return HtmlService.createHtmlOutput(`
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 2.5rem 1.5rem; max-width: 750px; margin: 2rem auto; color: #1e293b; background: #ffffff; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
          <span style="font-size: 2rem;">🚒</span>
          <h2 style="margin: 0; color: #b91c1c; font-size: 1.4rem;">Erro de Inicialização do Sistema</h2>
        </div>
        <p style="color: #475569; font-size: 0.95rem; line-height: 1.5;">
          Não foi possível inicializar a interface web no Google Apps Script.
        </p>
        <div style="margin-top: 1.25rem;">
          <div style="font-size: 0.8rem; font-weight: 700; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.4rem;">Detalhes Técnicos:</div>
          <pre style="text-align: left; background: #fef2f2; color: #991b1b; padding: 1.2rem; border-radius: 8px; overflow: auto; border: 1px solid #fecaca; font-size: 0.85rem; line-height: 1.5; font-family: Consolas, Monaco, monospace; white-space: pre-wrap;">${detalhesErro}</pre>
        </div>
        <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #94a3b8;">
          <span>Código: SRO-INIT-TRACE</span>
          <span>SisFolgas- São Roque</span>
        </div>
      </div>
    `);
  }
}

/**
 * Helper para inclusão de componentes HTML modulares (Styles, Scripts)
 */
function include(filename) {
  try {
    return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
  } catch (err) {
    try {
      return HtmlService.createHtmlOutputFromFile(filename).getContent();
    } catch (e2) {
      Logger.log('Erro ao incluir template modular ' + filename + ': ' + (err ? err.stack || err.message : err));
      return '<!-- Erro ao incluir ' + filename + ': ' + (err ? err.message : '') + ' -->';
    }
  }
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
function runSecureRpc(actionName, fn, sessionContextOrPayload) {
  const opId = ValidationService.generateUuid();
  try {
    let resolvedRe = null;
    if (typeof sessionContextOrPayload === 'string') {
      resolvedRe = sessionContextOrPayload;
    } else if (sessionContextOrPayload && typeof sessionContextOrPayload === 'object') {
      resolvedRe = sessionContextOrPayload.sessionRe || null;
    }

    const context = resolvedRe 
      ? AuthService.getUserContextByRe(resolvedRe) 
      : AuthService.getUserContext();
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
 * Login direto por Usuário (RE) e Senha
 */
function apiLogin(payload) {
  const opId = ValidationService.generateUuid();
  try {
    const usuario = payload ? (payload.re || payload.usuario) : null;
    if (!usuario) {
      throw new Error('Informe o RE (usuário) e a senha para entrar.');
    }
    const result = AuthService.loginWithCredentials(usuario, payload.senha);
    return {
      success: true,
      data: result,
      opId: opId
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: err.message || 'Falha ao autenticar usuário.'
      },
      opId: opId
    };
  }
}

/**
 * Alteração de Senha do Militar (CRUD de Senha)
 */
function apiAlterarSenha(payload) {
  const opId = ValidationService.generateUuid();
  try {
    if (!payload || !payload.re) {
      throw new Error('RE não informado para alteração de senha.');
    }
    const result = AuthService.changePassword(
      payload.re,
      payload.senhaAtual,
      payload.novaSenha,
      payload.confirmaSenha
    );
    return {
      success: true,
      data: result,
      opId: opId
    };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'PASSWORD_CHANGE_FAILED',
        message: err.message || 'Falha ao alterar senha.'
      },
      opId: opId
    };
  }
}

/**
 * Encerramento de sessão
 */
function apiLogout() {
  return {
    success: true,
    data: { mensagem: 'Sessão encerrada com sucesso.' }
  };
}

/**
 * Carrega estado inicial do usuário, permissões, período ativo, prontidões e filas
 */
function apiGetInitialState(payload) {
  const sessionRe = (payload && payload.sessionRe) ? payload.sessionRe : null;
  const unidadeFilter = (payload && payload.unidade) ? payload.unidade : null;

  return runSecureRpc('getInitialState', function(context, opId) {
    const activePeriod = PeriodService.getActivePeriod();
    const sanitizedMilitar = context.militar ? ValidationService.sanitizeMilitaryDto(context.militar, true) : null;

    const allMilitaresRaw = MilitaryService.getAllActive();

    // Obtém lista única de unidades presentes no cadastro
    const unidadesSet = new Set();
    allMilitaresRaw.forEach(m => {
      if (m.unidade) unidadesSet.add(m.unidade);
    });
    const unidades = Array.from(unidadesSet);
    if (unidades.length === 0) unidades.push('1º SGB');

    const prontidoes = Config.DEFAULTS.PRONTIDOES || ['Verde', 'Amarela', 'Azul'];

    let queues = {};
    prontidoes.forEach(team => {
      if (activePeriod) {
        try {
          queues[team] = ChoiceService.getTeamQueueStatus(activePeriod.periodo_id, team, unidadeFilter);
        } catch (e) {
          console.error(`Erro ao obter status da fila para prontidão ${team}:`, e);
          queues[team] = ChoiceService.getEmptyQueueFallback(team, unidadeFilter);
        }
      } else {
        queues[team] = ChoiceService.getEmptyQueueFallback(team, unidadeFilter);
      }
    });

    // Retrocompatibilidade para testes legados
    Config.DEFAULTS.LEGACY_TEAMS.forEach(team => {
      if (!queues[team]) {
        if (activePeriod) {
          try {
            queues[team] = ChoiceService.getTeamQueueStatus(activePeriod.periodo_id, team, unidadeFilter);
          } catch (e) {
            queues[team] = ChoiceService.getEmptyQueueFallback(team, unidadeFilter);
          }
        } else {
          queues[team] = ChoiceService.getEmptyQueueFallback(team, unidadeFilter);
        }
      }
    });

    // Lista completa de todos os militares cadastrados para exibição direta no sistema
    const allMilitares = allMilitaresRaw.map(m => {
      const isSelf = context.militar && (String(context.militar.re) === String(m.re));
      const isAdmin = context.perfil === Config.ROLES.ADMIN;
      return ValidationService.sanitizeMilitaryDto(m, isSelf || isAdmin);
    });

    let spreadsheetUrl = '';
    try {
      if (typeof Repository !== 'undefined' && Repository.getSpreadsheetUrl) {
        spreadsheetUrl = Repository.getSpreadsheetUrl();
      }
    } catch (e) {
      console.warn('Não foi possível obter spreadsheetUrl:', e);
    }

    if (!context.authenticated) {
      return {
        authenticated: false,
        error: context.error,
        email: context.email || '',
        militares: allMilitares,
        unidades: unidades,
        prontidoes: prontidoes,
        activePeriod: activePeriod,
        queues: queues,
        teams: prontidoes,
        spreadsheetUrl: spreadsheetUrl
      };
    }

    return {
      authenticated: true,
      user: {
        email: context.email,
        sessionRe: context.sessionRe || (context.militar ? context.militar.re : ''),
        perfil: context.perfil,
        permissions: context.permissions,
        militar: sanitizedMilitar,
        isOwner: Boolean(context.isOwner)
      },
      militares: allMilitares,
      unidades: unidades,
      prontidoes: prontidoes,
      activePeriod: activePeriod,
      queues: queues,
      teams: prontidoes,
      spreadsheetUrl: spreadsheetUrl,
      choiceWindow: {
        isOpen: ChoiceService.isWithinChoiceWindow(),
        currentDay: (new Date()).getDate(),
        startDay: Config.DEFAULTS.CHOICE_WINDOW_START_DAY,
        endDay: Config.DEFAULTS.CHOICE_WINDOW_END_DAY
      }
    };
  }, sessionRe);
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
  }, payload);
}

/**
 * Pré-cadastro e ativação de acesso de militar por RE e Nome
 * Se o militar existir na aba MILITARES e o nome conferir, o vínculo com a conta Google é realizado
 * e o cadastro em USUARIOS é ativado para permitir o login e acesso ao sistema.
 */
function apiPreCadastroMilitar(payload) {
  return runSecureRpc('preCadastroMilitar', function(context, opId) {
    if (!payload || !payload.re || !payload.nome) {
      throw new Error('Informe o RE e o Nome para realizar a ativação do seu cadastro.');
    }

    const email = context.email || AuthService.getAuthenticatedEmail();
    if (!email) {
      throw new Error('Sessão Google não identificada. É necessário estar conectado a uma conta Google.');
    }

    const cleanRe = ValidationService.normalizeRE(payload.re);
    
    // Busca na aba MILITARES por RE (coluna B / militar_id)
    const militar = MilitaryService.getByRE(cleanRe) || MilitaryService.getById(cleanRe);
    if (!militar || militar.ativo === false) {
      throw new Error(`Militar com RE '${cleanRe}' não foi localizado no efetivo cadastrado. Verifique o número digitado.`);
    }

    // Validação flexível e segura por Nome (Guerra ou Completo)
    const normalizeStr = function(s) {
      return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim();
    };

    const inputNameNorm = normalizeStr(payload.nome);
    const warNameNorm = normalizeStr(militar.nome_guerra);
    const fullNameNorm = normalizeStr(militar.nome_completo);

    const inputTokens = inputNameNorm.split(/\s+/).filter(t => t.length >= 2);
    const fullTokens = fullNameNorm.split(/\s+/).filter(t => t.length >= 2);
    const warTokens = warNameNorm.split(/\s+/).filter(t => t.length >= 2);

    const matchesWar = warNameNorm.includes(inputNameNorm) || inputNameNorm.includes(warNameNorm);
    const matchesFull = fullNameNorm.includes(inputNameNorm) || inputNameNorm.includes(fullNameNorm);
    const hasTokenMatch = inputTokens.some(t => fullTokens.includes(t) || warTokens.includes(t));

    if (!matchesWar && !matchesFull && !hasTokenMatch) {
      throw new Error(`O nome informado '${payload.nome}' não confere com o cadastro do RE ${cleanRe}. Informe seu nome de guerra ou nome completo.`);
    }

    // Se já estiver vinculado a outro e-mail ativo diferente
    if (militar.email_vinculado && militar.email_vinculado.toLowerCase() !== email.toLowerCase()) {
      const otherUser = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', militar.email_vinculado);
      if (otherUser && otherUser.ativo) {
        throw new Error(`Este militar já está vinculado à conta Google '${militar.email_vinculado}'. Se precisar alterar, procure o Administrador.`);
      }
    }

    // 1. Atualiza na aba MILITARES
    Repository.updateById(Config.SHEETS.MILITARES, 're', cleanRe, {
      email_vinculado: email,
      atualizado_em: new Date().toISOString()
    });

    // 2. Cria ou atualiza o usuário na aba USUARIOS
    const isOwner = Boolean(context.isOwner);
    const existingUser = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', email);
    let targetRole = Config.ROLES.MILITAR;
    if (isOwner || (existingUser && existingUser.perfil === Config.ROLES.ADMIN)) {
      targetRole = Config.ROLES.ADMIN;
    }

    if (existingUser) {
      Repository.updateById(Config.SHEETS.USUARIOS, 'usuario_id', existingUser.usuario_id, {
        militar_id: cleanRe,
        perfil: targetRole,
        ativo: true,
        atualizado_em: new Date().toISOString()
      });
    } else {
      Repository.insert(Config.SHEETS.USUARIOS, {
        usuario_id: ValidationService.generateUuid(),
        email_google: email,
        militar_id: cleanRe,
        perfil: targetRole,
        ativo: true,
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString()
      });
    }

    // 3. Auditoria do Pré-Cadastro
    AuditService.log({
      userEmail: email,
      militarId: cleanRe,
      acao: 'PRE_CADASTRO_ATIVACAO',
      entidade: 'USUARIOS',
      registroId: cleanRe,
      resultado: Config.AUDIT_RESULT.SUCESSO,
      justificativa: `Pré-cadastro realizado: militar ${militar.graduacao} ${militar.nome_guerra} (RE ${cleanRe}) ativado para a conta Google ${email}`,
      opId: opId
    });

    return {
      success: true,
      militar: ValidationService.sanitizeMilitaryDto(militar, true),
      mensagem: `Acesso ativado com sucesso! Bem-vindo(a), ${militar.graduacao} ${militar.nome_guerra}.`
    };
  }, payload);
}

function apiGetAllMilitares(payload) {
  return runSecureRpc('getAllMilitares', function(context) {
    const isAdmin = context.perfil === Config.ROLES.ADMIN;
    return MilitaryService.getAllActive().map(m => {
      const isSelf = context.militar && (String(context.militar.re) === String(m.re));
      return ValidationService.sanitizeMilitaryDto(m, isSelf || isAdmin);
    });
  }, payload);
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
  }, arg1);
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
  }, payload);
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
  }, payload);
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
  }, payload);
}

/**
 * Operações do Administrador - Cadastro de Militares
 */
function apiAdminSaveMilitary(payload) {
  return runSecureRpc('saveMilitary', function(context, opId) {
    return MilitaryService.saveMilitary(context, payload, opId);
  }, payload);
}

/**
 * Operações do Administrador - Gerenciamento de Períodos
 */
function apiAdminCreatePeriod(payload) {
  return runSecureRpc('createPeriod', function(context, opId) {
    return PeriodService.createPeriod(context, payload, opId);
  }, payload);
}

function apiAdminChangePeriodStatus(payload) {
  return runSecureRpc('changePeriodStatus', function(context, opId) {
    return PeriodService.changeStatus(context, payload.periodo_id, payload.status, payload.justificativa, opId);
  }, payload);
}

/**
 * Operações do Administrador - Relatório Operacional
 */
function apiAdminGetOperationalReport(periodoId, sessionContext) {
  return runSecureRpc('getOperationalReport', function(context, opId) {
    return AdminService.getOperationalReport(context, (typeof periodoId === 'object' && periodoId) ? periodoId.periodo_id : periodoId, opId);
  }, (typeof periodoId === 'object' && periodoId) ? periodoId : sessionContext);
}

/**
 * Operações do Administrador - Trilha de Auditoria
 */
function apiAdminGetAuditLogs(limit, sessionRe) {
  return runSecureRpc('getAuditLogs', function(context, opId) {
    const lim = (typeof limit === 'object' && limit) ? (limit.limit || 50) : (limit || 50);
    return AdminService.getAuditLogs(context, lim, opId);
  }, (typeof limit === 'object' && limit) ? limit : sessionRe);
}

/**
 * Operações do Administrador - Diagnóstico do Sistema
 */
function apiAdminRunDiagnostics(payload) {
  return runSecureRpc('runDiagnostics', function(context, opId) {
    AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);
    return DiagnosticsService.runFullDiagnostics();
  }, payload);
}

/**
 * Operações do Administrador - Backup
 */
function apiAdminRunBackup(payload) {
  return runSecureRpc('runBackup', function(context, opId) {
    return BackupService.generateBackupSnapshot(context, opId);
  }, payload);
}

/**
 * Operações de Crédito
 */
function apiGrantCredit(payload) {
  return runSecureRpc('grantCredit', function(context, opId) {
    return CreditService.grantCredit(context, payload, opId);
  }, payload);
}

/**
 * Operações de Afastamento
 */
function apiRegisterLeave(payload) {
  return runSecureRpc('registerLeave', function(context, opId) {
    return LeaveService.registerLeave(context, payload, opId);
  }, payload);
}

/**
 * Operações de Permuta
 */
function apiRequestSwap(payload) {
  return runSecureRpc('requestSwap', function(context, opId) {
    return SwapService.requestSwap(context, payload, opId);
  }, payload);
}

function apiApproveSwap(payload) {
  return runSecureRpc('approveSwap', function(context, opId) {
    return SwapService.approveSwap(context, payload.permuta_id, opId);
  }, payload);
}

function apiAdminGetPendingSwaps(payload) {
  return runSecureRpc('adminGetPendingSwaps', function(context) {
    return SwapService.getPendingSwaps(context);
  }, payload);
}

function apiAdminRejectSwap(payload) {
  return runSecureRpc('adminRejectSwap', function(context, opId) {
    return SwapService.rejectSwap(context, payload.permuta_id, payload.motivo, opId);
  }, payload);
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
  }, payload);
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
  }, payload);
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
  }, payload);
}

/**
 * Homologação de Acúmulo de Folga pelo Administrador
 */
function apiAdminApproveAccumulateLeave(payload) {
  return runSecureRpc('approveAccumulateLeave', function(context, opId) {
    return AdminService.approveAccumulateLeave(context, payload.escolha_id, opId);
  }, payload);
}

function apiAdminRejectAccumulateLeave(payload) {
  return runSecureRpc('rejectAccumulateLeave', function(context, opId) {
    return AdminService.rejectAccumulateLeave(context, payload.escolha_id, payload.motivo, opId);
  }, payload);
}

function apiAdminGetPendingAccumulateRequests(payload) {
  return runSecureRpc('getPendingAccumulateRequests', function(context, opId) {
    return AdminService.getPendingAccumulateRequests(context, opId);
  }, payload);
}

/**
 * Migração em lote de senhas legadas para SHA-256 (Apenas ADMINISTRADOR)
 */
function apiAdminMigratePasswords(payload) {
  return runSecureRpc('migratePasswordsToHash', function(context, opId) {
    return AdminService.migratePasswordsToHash(context, opId);
  }, payload);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    doGet,
    include,
    runSecureRpc,
    apiAdminMigratePasswords,
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
    apiPreCadastroMilitar,
    apiLogin,
    apiAlterarSenha,
    apiLogout,
    apiGetAllMilitares,
    setupInicializarSistema,
    setupCriarApenasAbas,
    setupPopularApenasMilitares
  };
}
