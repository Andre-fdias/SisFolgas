/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * CreditService.js - Gestão auditada de créditos de folga (concessão, saldo e consumo)
 */

const CreditService = (function() {
  return {
    /**
     * Retorna créditos ativos/disponíveis de um militar
     */
    getAvailableCredits: function(militarId) {
      ValidationService.validateUuid(militarId, 'ID do Militar');
      return Repository.find(Config.SHEETS.CREDITOS, function(c) {
        return c.militar_id === militarId && c.status === Config.CREDIT_STATUS.DISPONIVEL;
      });
    },

    /**
     * Concede crédito de folga para um militar (Apenas ADMINISTRADOR)
     */
    grantCredit: function(context, data, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const militarId = ValidationService.validateUuid(data.militar_id, 'ID do Militar');
      const motivo = ValidationService.sanitizeString(data.motivo);
      const quantidade = parseInt(data.quantidade, 10) || 1;
      const periodoOrigem = data.periodo_origem ? ValidationService.validateCompetencia(data.periodo_origem) : '';

      if (!motivo) throw new Error('Motivo da concessão do crédito é obrigatório.');
      if (quantidade < 1 || quantidade > 10) {
        throw new Error('Quantidade de créditos deve estar entre 1 e 10.');
      }

      const militar = MilitaryService.getById(militarId);
      if (!militar || !militar.ativo) {
        throw new Error('Militar inválido ou inativo.');
      }

      const creditoId = ValidationService.generateUuid();
      const now = new Date().toISOString();

      const record = {
        credito_id: creditoId,
        militar_id: militarId,
        periodo_origem: periodoOrigem,
        motivo: motivo,
        quantidade: quantidade,
        status: Config.CREDIT_STATUS.DISPONIVEL,
        escolha_relacionada_id: '',
        criado_em: now,
        criado_por: context.email,
        utilizado_em: ''
      };

      Repository.insert(Config.SHEETS.CREDITOS, record);

      AuditService.log({
        userEmail: context.email,
        militarId: militarId,
        acao: 'CREDITO_CONCEDIDO',
        entidade: 'CREDITOS',
        registroId: creditoId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: motivo,
        dadosPosteriores: record,
        opId: opId
      });

      return record;
    },

    /**
     * Consome um crédito disponível vinculando-o a uma escolha
     */
    consumeCredit: function(creditoId, escolhaId, userEmail, opId) {
      const credito = Repository.findOne(Config.SHEETS.CREDITOS, 'credito_id', creditoId);
      if (!credito || credito.status !== Config.CREDIT_STATUS.DISPONIVEL) {
        throw new Error('Crédito informado não está disponível para utilização.');
      }

      const now = new Date().toISOString();
      const updated = Repository.updateById(Config.SHEETS.CREDITOS, 'credito_id', creditoId, {
        status: Config.CREDIT_STATUS.UTILIZADO,
        escolha_relacionada_id: escolhaId,
        utilizado_em: now
      });

      AuditService.log({
        userEmail: userEmail,
        militarId: credito.militar_id,
        acao: 'CREDITO_UTILIZADO',
        entidade: 'CREDITOS',
        registroId: creditoId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        dadosAnteriores: { status: Config.CREDIT_STATUS.DISPONIVEL },
        dadosPosteriores: { status: Config.CREDIT_STATUS.UTILIZADO, escolhaId: escolhaId },
        opId: opId
      });

      return updated;
    }
  };
})();

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarListagemCreditos() {
  Logger.log('=== LISTAGEM DE CRÉDITOS DE FOLGA ===');
  const creditos = Repository.findAll(Config.SHEETS.CREDITOS);
  Logger.log('Total de créditos registrados: ' + creditos.length);
  creditos.forEach(function(c) {
    Logger.log('Militar ID: ' + c.militar_id + ' | Qtd: ' + c.quantidade + ' | Motivo: ' + c.motivo + ' | Status: ' + c.status);
  });
  return creditos;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CreditService;
  module.exports.executarListagemCreditos = executarListagemCreditos;
}
