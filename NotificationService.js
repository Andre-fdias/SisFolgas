/**
 * SISTEMA DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Módulo: NotificationService.js
 * Descrição: Gestão de configurações do sistema, envio da Escala Oficial por e-mail,
 *            fechamento automático no dia 17 e abertura de períodos no dia 01.
 */

var NotificationService = (function () {
  'use strict';

  var SETTINGS_KEYS = {
    EMAIL_DESTINO: 'EMAIL_NOTIFICACAO_OFICIAL',
    AUTO_TRIGGER_ATIVO: 'AUTO_TRIGGER_ATIVO',
    ULTIMO_FECHAMENTO_DATA: 'ULTIMO_FECHAMENTO_DATA',
    ULTIMO_FECHAMENTO_STATUS: 'ULTIMO_FECHAMENTO_STATUS'
  };

  /**
   * Obtém as configurações armazenadas na aba CONFIGURACOES.
   * @returns {Object} Mapa de configurações chave-valor
   */
  function getSettings() {
    var rows = Repository.findAll(Config.SHEET_NAMES.CONFIGURACOES) || [];
    var map = {};
    rows.forEach(function (row) {
      if (row.chave) {
        map[row.chave] = row.valor;
      }
    });

    return {
      emailNotificacao: map[SETTINGS_KEYS.EMAIL_DESTINO] || '',
      autoTriggerAtivo: map[SETTINGS_KEYS.AUTO_TRIGGER_ATIVO] !== 'FALSE',
      ultimoFechamentoData: map[SETTINGS_KEYS.ULTIMO_FECHAMENTO_DATA] || '',
      ultimoFechamentoStatus: map[SETTINGS_KEYS.ULTIMO_FECHAMENTO_STATUS] || ''
    };
  }

  /**
   * Salva as configurações do sistema de forma segura e auditada (Requer ADMIN).
   * 
   * @param {Object} context - Contexto do usuário autenticado
   * @param {Object} settings - Novas configurações { emailNotificacao, autoTriggerAtivo }
   * @param {string} [opId] - ID de correlação para auditoria
   */
  function saveSettings(context, settings, opId) {
    AuthService.requireRole(context, Config.ROLES.ADMIN);

    if (settings.emailNotificacao) {
      var emailClean = String(settings.emailNotificacao).trim();
      var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailClean)) {
        throw new Error('Formato de e-mail inválido para notificações: ' + emailClean);
      }
      _upsertConfig(SETTINGS_KEYS.EMAIL_DESTINO, emailClean);
    } else {
      _upsertConfig(SETTINGS_KEYS.EMAIL_DESTINO, '');
    }

    var autoAtivo = settings.autoTriggerAtivo !== false ? 'TRUE' : 'FALSE';
    _upsertConfig(SETTINGS_KEYS.AUTO_TRIGGER_ATIVO, autoAtivo);

    AuditService.logEvent({
      tipo_evento: 'CONFIGURACOES_ATUALIZADAS',
      usuario_email: context.email || 'admin@cbm',
      militar_id: context.militarId || null,
      dados_novos_json: JSON.stringify({
        emailNotificacao: settings.emailNotificacao,
        autoTriggerAtivo: autoAtivo
      }),
      correlacao_id: opId || Utilities_getUuid()
    });

    return getSettings();
  }

  function _upsertConfig(chave, valor) {
    var rows = Repository.findAll(Config.SHEET_NAMES.CONFIGURACOES) || [];
    var existing = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].chave === chave) {
        existing = rows[i];
        break;
      }
    }

    var now = new Date().toISOString();
    if (existing && (existing.configuracao_id || existing.chave)) {
      var idCol = existing.configuracao_id ? 'configuracao_id' : 'chave';
      var idVal = existing.configuracao_id || existing.chave;
      Repository.updateById(Config.SHEET_NAMES.CONFIGURACOES, idCol, idVal, {
        valor: valor,
        atualizado_em: now
      });
    } else {
      Repository.insert(Config.SHEET_NAMES.CONFIGURACOES, {
        configuracao_id: Utilities_getUuid(),
        chave: chave,
        valor: valor,
        descricao: 'Configuração do sistema SisFolgas',
        criado_em: now,
        atualizado_em: now
      });
    }
  }

  /**
   * Executa a rotina de encerramento do dia 17:
   * 1. Bloqueia o período ativo (status ENCERRADO);
   * 2. Trata militares pendentes como 'NAO_ESCOLHEU_NO_PRAZO';
   * 3. Gera a Escala Oficial em PDF;
   * 4. Envia por e-mail para o endereço cadastrado no painel Admin;
   * 5. Audita todo o fechamento.
   * 
   * @param {string} [opId] - ID de rastreabilidade
   * @returns {Object} Resumo da execução
   */
  function executeMonthlyClosingRoutine(opId) {
    var correlationId = opId || Utilities_getUuid();
    var periodos = Repository.findAll(Config.SHEET_NAMES.PERIODOS) || [];
    var periodoAtivo = null;

    for (var p = 0; p < periodos.length; p++) {
      if (periodos[p].status === Config.PERIOD_STATUS.ABERTO) {
        periodoAtivo = periodos[p];
        break;
      }
    }

    if (!periodoAtivo) {
      // Se nenhum ABERTO, busca o mais recente em RASCUNHO ou PAUSADO
      if (periodos.length > 0) {
        periodoAtivo = periodos[periodos.length - 1];
      }
    }

    if (!periodoAtivo) {
      return {
        success: false,
        message: 'Nenhum período localizado para encerramento.'
      };
    }

    var nowIso = new Date().toISOString();

    // 1. Encerra o período
    Repository.updateById(Config.SHEET_NAMES.PERIODOS, 'periodo_id', periodoAtivo.periodo_id, {
      status: Config.PERIOD_STATUS.ENCERRADO,
      atualizado_em: nowIso
    });

    // 2. Identifica militares sem escolha e encerra pendências
    var militares = Repository.findAll(Config.SHEET_NAMES.MILITARES).filter(function (m) {
      return m.ativo === true || m.ativo === 'TRUE';
    });

    var escolhas = Repository.findAll(Config.SHEET_NAMES.ESCOLHAS).filter(function (e) {
      return e.periodo_id === periodoAtivo.periodo_id && e.status !== Config.CHOICE_STATUS.CANCELADA;
    });

    var escolheuMap = {};
    escolhas.forEach(function (e) {
      escolheuMap[e.militar_id] = true;
    });

    var pendenciasResolvidas = 0;
    militares.forEach(function (m) {
      if (!escolheuMap[m.militar_id]) {
        Repository.insert(Config.SHEET_NAMES.ESCOLHAS, {
          escolha_id: Utilities_getUuid(),
          periodo_id: periodoAtivo.periodo_id,
          militar_id: m.militar_id,
          data_folga: '',
          equipe: m.prontidao || m.equipe || '',
          ordem_no_momento: m.ordem_antiguidade || 99,
          status: 'NAO_ESCOLHEU_NO_PRAZO',
          justificativa_cancelamento: 'Prazo expirado em 17/' + (periodoAtivo.competencia || ''),
          idempotency_key: 'auto_close_' + periodoAtivo.periodo_id + '_' + m.militar_id,
          criado_em: nowIso,
          atualizado_em: nowIso
        });
        pendenciasResolvidas++;
      }
    });

    // Invalida cache de filas
    if (typeof ChoiceService !== 'undefined' && ChoiceService.invalidateQueueCache) {
      ChoiceService.invalidateQueueCache(periodoAtivo.periodo_id);
    }

    // 3. Gera PDF da Escala Oficial
    var pdfBlob = ReportService.generateScalePdfBlob(periodoAtivo.periodo_id);

    // 4. Envia e-mail para o endereço configurado
    var settings = getSettings();
    var emailDestino = settings.emailNotificacao;
    var emailEnviado = false;

    if (emailDestino) {
      var assunto = '[SisFolgas - São Roque] Escala Oficial de Folgas - Competência ' + (periodoAtivo.competencia || '');
      var corpoHtml = '<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px;">' +
        '<div style="background-color: #dc2626; color: #fff; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">' +
        '<h2 style="margin: 0; font-size: 18px;">POLÍCIA MILITAR DO ESTADO DE SÃO PAULO</h2>' +
        '<h3 style="margin: 5px 0 0; font-size: 15px; font-weight: normal;">2º SGB - Estação de Bombeiros de São Roque</h3>' +
        '</div>' +
        '<div style="padding: 20px; border: 1px solid #e5e7eb; border-top: none; background: #ffffff;">' +
        '<p>Prezado(a) Encarregado(a) / Comandante,</p>' +
        '<p>Informamos que o período de escolha de folgas da competência <strong>' + (periodoAtivo.competencia || '') + '</strong> foi oficialmente <strong>ENCERRADO</strong> no dia 17 conforme regulamentação interna.</p>' +
        '<ul>' +
        '  <li><strong>Competência:</strong> ' + (periodoAtivo.competencia || '') + '</li>' +
        '  <li><strong>Data de Fechamento:</strong> ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '</li>' +
        '  <li><strong>Militares Ativos:</strong> ' + militares.length + '</li>' +
        '  <li><strong>Escolhas / Homologações Registradas:</strong> ' + (escolhas.length) + '</li>' +
        '  <li><strong>Militares sem Escolha (Prazo Expirado):</strong> ' + pendenciasResolvidas + '</li>' +
        '</ul>' +
        '<p>A <strong>Escala Oficial de Folgas</strong> encontra-se anexa a este e-mail em formato PDF, devidamente diagramada para publicação em Boletim Interno e afixação no quadro de avisos.</p>' +
        '<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">' +
        '<p style="font-size: 12px; color: #6b7280; text-align: center;">SisFolgas- São Roque | 2º SGB- Eb São Roque<br>Envio automático gerado sem intervenção humana.</p>' +
        '</div>' +
        '</div>';

      _sendEmailWithAttachment(emailDestino, assunto, corpoHtml, pdfBlob);
      emailEnviado = true;
    }

    // 5. Registra auditoria e atualiza status
    _upsertConfig(SETTINGS_KEYS.ULTIMO_FECHAMENTO_DATA, nowIso);
    _upsertConfig(SETTINGS_KEYS.ULTIMO_FECHAMENTO_STATUS, 'SUCESSO: Período ' + periodoAtivo.competencia + ' encerrado. ' + (emailEnviado ? ('E-mail enviado para ' + emailDestino) : 'Sem e-mail configurado'));

    AuditService.logEvent({
      tipo_evento: 'ROTINA_FECHAMENTO_MENSAL_EXECUTADA',
      usuario_email: 'SISTEMA_AUTOMATICO',
      militar_id: null,
      dados_novos_json: JSON.stringify({
        periodo_id: periodoAtivo.periodo_id,
        competencia: periodoAtivo.competencia,
        emailDestino: emailDestino,
        emailEnviado: emailEnviado,
        pendenciasResolvidas: pendenciasResolvidas
      }),
      correlacao_id: correlationId
    });

    return {
      success: true,
      periodoId: periodoAtivo.periodo_id,
      competencia: periodoAtivo.competencia,
      emailEnviadoPara: emailDestino || 'NENHUM (E-mail não cadastrado no painel Admin)',
      emailEnviado: emailEnviado,
      pendenciasResolvidas: pendenciasResolvidas,
      dataFechamento: nowIso
    };
  }

  /**
   * Executa a rotina de abertura do dia 01:
   * Calcula a próxima competência operacional e cria/abre o período automaticamente.
   * 
   * @param {string} [opId] - ID de rastreabilidade
   * @returns {Object} Resumo da abertura
   */
  function executeMonthlyOpeningRoutine(opId) {
    var correlationId = opId || Utilities_getUuid();
    var agora = new Date();
    
    // Calcula o próximo mês para a competência de folga
    // Ex: se hoje é 01 de novembro, abre para dezembro; se hoje é 01 de outubro, abre para novembro
    var mesAlvo = agora.getMonth() + 2; // +1 zero-indexed, +1 próximo mês
    var anoAlvo = agora.getFullYear();
    if (mesAlvo > 12) {
      mesAlvo = mesAlvo - 12;
      anoAlvo += 1;
    }

    var strMes = mesAlvo < 10 ? ('0' + mesAlvo) : String(mesAlvo);
    var competenciaIso = anoAlvo + '-' + strMes; // Ex: 2026-12

    // Verifica se já existe período para a competência
    var periodos = Repository.findAll(Config.SHEET_NAMES.PERIODOS) || [];
    var existente = null;
    for (var i = 0; i < periodos.length; i++) {
      if (periodos[i].competencia === competenciaIso) {
        existente = periodos[i];
        break;
      }
    }

    // Se o período calculado já estiver ENCERRADO, avança para a competência do mês seguinte
    if (existente && existente.status === Config.PERIOD_STATUS.ENCERRADO) {
      mesAlvo += 1;
      if (mesAlvo > 12) {
        mesAlvo = mesAlvo - 12;
        anoAlvo += 1;
      }
      strMes = mesAlvo < 10 ? ('0' + mesAlvo) : String(mesAlvo);
      competenciaIso = anoAlvo + '-' + strMes;
      existente = null;
      for (var j = 0; j < periodos.length; j++) {
        if (periodos[j].competencia === competenciaIso) {
          existente = periodos[j];
          break;
        }
      }
    }

    var nowIso = new Date().toISOString();

    if (existente) {
      // Se já existe e está RASCUNHO ou PAUSADO, promove para ABERTO
      if (existente.status === Config.PERIOD_STATUS.RASCUNHO || existente.status === Config.PERIOD_STATUS.PAUSADO) {
        Repository.updateById(Config.SHEET_NAMES.PERIODOS, 'periodo_id', existente.periodo_id, {
          status: Config.PERIOD_STATUS.ABERTO,
          atualizado_em: nowIso
        });
      }
      return {
        success: true,
        jaExistia: true,
        periodoId: existente.periodo_id,
        competencia: competenciaIso,
        status: Config.PERIOD_STATUS.ABERTO
      };
    }

    // Data de abertura: dia 01 do mês atual às 00:00
    // Data de encerramento: dia 16 do mês atual às 23:59:59
    var dataAbertura = new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0).toISOString();
    var dataEncerramento = new Date(agora.getFullYear(), agora.getMonth(), 16, 23, 59, 59).toISOString();

    var novoPeriodo = {
      periodo_id: Utilities_getUuid(),
      competencia: competenciaIso,
      data_abertura: dataAbertura,
      data_encerramento: dataEncerramento,
      status: Config.PERIOD_STATUS.ABERTO,
      regras_json: JSON.stringify({
        janelaInicioDia: 1,
        janelaFimDia: 16,
        criadoAutomaticamente: true
      }),
      criado_por: 'SISTEMA_AUTOMATICO_TRIGGER',
      criado_em: nowIso,
      atualizado_em: nowIso
    };

    Repository.insert(Config.SHEET_NAMES.PERIODOS, novoPeriodo);

    AuditService.logEvent({
      tipo_evento: 'ROTINA_ABERTURA_MENSAL_EXECUTADA',
      usuario_email: 'SISTEMA_AUTOMATICO',
      militar_id: null,
      dados_novos_json: JSON.stringify(novoPeriodo),
      correlacao_id: correlationId
    });

    return {
      success: true,
      jaExistia: false,
      periodoId: novoPeriodo.periodo_id,
      competencia: competenciaIso,
      status: Config.PERIOD_STATUS.ABERTO
    };
  }

  /**
   * Gatilho temporal diário do Google Apps Script.
   * Verifica se hoje é dia 01 ou dia 17 e dispara a automação correspondente.
   */
  function checkAndRunScheduledTriggers() {
    var settings = getSettings();
    if (!settings.autoTriggerAtivo) {
      return { triggered: false, reason: 'Gatilhos automáticos desativados nas configurações' };
    }

    var hoje = new Date();
    var dia = hoje.getDate();

    if (dia === 1) {
      return executeMonthlyOpeningRoutine();
    } else if (dia === 17) {
      return executeMonthlyClosingRoutine();
    }

    return {
      triggered: false,
      diaAtual: dia,
      message: 'Hoje é dia ' + dia + '. Gatilhos operam nos dias 01 (abertura) e 17 (fechamento).'
    };
  }

  function _sendEmailWithAttachment(toEmail, subject, htmlBody, pdfBlob) {
    // No Google Apps Script
    if (typeof MailApp !== 'undefined' && typeof MailApp.sendEmail === 'function') {
      MailApp.sendEmail({
        to: toEmail,
        subject: subject,
        htmlBody: htmlBody,
        attachments: [pdfBlob]
      });
      return true;
    }

    // No GmailApp como alternativa
    if (typeof GmailApp !== 'undefined' && typeof GmailApp.sendEmail === 'function') {
      GmailApp.sendEmail(toEmail, subject, '', {
        htmlBody: htmlBody,
        attachments: [pdfBlob]
      });
      return true;
    }

    // Em ambiente Node.js / Teste, registra em log
    if (typeof console !== 'undefined') {
      console.log('[MOCK EMAIL] Para: ' + toEmail + ' | Assunto: ' + subject + ' | Anexo: ' + (pdfBlob ? pdfBlob.getName() : 'nenhum'));
    }
    return true;
  }

  function Utilities_getUuid() {
    if (typeof Utilities !== 'undefined' && typeof Utilities.getUuid === 'function') {
      return Utilities.getUuid();
    }
    return 'uuid-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now();
  }

  return {
    getSettings: getSettings,
    saveSettings: saveSettings,
    executeMonthlyClosingRoutine: executeMonthlyClosingRoutine,
    executeMonthlyOpeningRoutine: executeMonthlyOpeningRoutine,
    checkAndRunScheduledTriggers: checkAndRunScheduledTriggers
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationService;
}
