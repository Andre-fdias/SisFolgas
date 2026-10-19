/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * AuditService.js - Gravação imutável de trilha de auditoria e segurança
 */

const AuditService = (function() {
  return {
    /**
     * Registra evento de auditoria no log append-only
     */
    log: function(params) {
      try {
        const auditRecord = {
          auditoria_id: ValidationService.generateUuid(),
          data_hora: new Date().toISOString(),
          usuario_autenticado_email: ValidationService.sanitizeString(params.userEmail || 'ANÔNIMO'),
          militar_relacionado_id: params.militarId ? String(params.militarId) : '',
          acao: ValidationService.sanitizeString(params.acao || 'EVENTO_DESCONHECIDO'),
          entidade: ValidationService.sanitizeString(params.entidade || 'SISTEMA'),
          registro_id: params.registroId ? String(params.registroId) : '',
          resultado: params.resultado || Config.AUDIT_RESULT.SUCESSO,
          justificativa: ValidationService.sanitizeString(params.justificativa || ''),
          dados_anteriores: params.dadosAnteriores ? (typeof params.dadosAnteriores === 'string' ? params.dadosAnteriores : JSON.stringify(params.dadosAnteriores)) : '',
          dados_posteriores: params.dadosPosteriores ? (typeof params.dadosPosteriores === 'string' ? params.dadosPosteriores : JSON.stringify(params.dadosPosteriores)) : '',
          correlacao_operacao_id: params.opId || ValidationService.generateUuid()
        };

        Repository.insert(Config.SHEETS.AUDITORIA, auditRecord);
        return auditRecord.auditoria_id;
      } catch (err) {
        // Falha no log de auditoria não deve expor detalhes internos, mas deve registrar no console
        if (typeof console !== 'undefined') {
          console.error('[AUDIT ERROR] Falha crítica ao persistir auditoria:', err);
        }
        return null;
      }
    },

    /**
     * Registra evento de segurança ou tentativa de acesso indevido
     */
    logSecurityEvent: function(action, details, authEmail, opId) {
      return this.log({
        userEmail: authEmail || 'ANÔNIMO',
        acao: action,
        entidade: 'SEGURANÇA',
        resultado: Config.AUDIT_RESULT.FALHA_AUTORIZACAO,
        justificativa: 'Tentativa de violação ou acesso negado',
        dados_posteriores: details,
        opId: opId
      });
    },

    /**
     * Registra evento de concorrência ou colisão de vagas
     */
    logConcurrencyConflict: function(action, details, authEmail, opId) {
      return this.log({
        userEmail: authEmail || 'SISTEMA',
        acao: action,
        entidade: 'ESCOLHAS',
        resultado: Config.AUDIT_RESULT.FALHA_CONCORRENCIA,
        justificativa: 'Conflito de concorrência - vaga simultânea',
        dados_posteriores: details,
        opId: opId
      });
    }
  };
})();

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarConsultaAuditoria() {
  Logger.log('=== CONSULTA DE AUDITORIA (ÚLTIMOS 10 REGISTROS) ===');
  const logs = AuditService.getRecentLogs(10);
  Logger.log('Total de registros recentes encontrados: ' + logs.length);
  Logger.log(JSON.stringify(logs, null, 2));
  return logs;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuditService;
  module.exports.executarConsultaAuditoria = executarConsultaAuditoria;
}
