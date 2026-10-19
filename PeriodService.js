/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * PeriodService.js - Ciclo de vida de períodos de escolha (Abertura, Pausa, Encerramento)
 */

const PeriodService = (function() {
  const VALID_TRANSITIONS = {
    RASCUNHO: ['ABERTO', 'CANCELADO'],
    ABERTO: ['PAUSADO', 'ENCERRADO', 'CANCELADO'],
    PAUSADO: ['ABERTO', 'ENCERRADO', 'CANCELADO'],
    ENCERRADO: ['ABERTO'], // Reabertura administrativa excepcional
    CANCELADO: []
  };

  return {
    /**
     * Retorna todos os períodos cadastrados
     */
    getAll: function() {
      return Repository.getAll(Config.SHEETS.PERIODOS).sort(function(a, b) {
        return (b.competencia || '').localeCompare(a.competencia || '');
      });
    },

    /**
     * Busca período por ID
     */
    getById: function(periodoId) {
      if (!periodoId) return null;
      return Repository.findOne(Config.SHEETS.PERIODOS, 'periodo_id', periodoId);
    },

    /**
     * Retorna o período atualmente ABERTO para escolha
     */
    getActivePeriod: function() {
      const openPeriods = Repository.find(Config.SHEETS.PERIODOS, function(p) {
        return p.status === Config.PERIOD_STATUS.ABERTO;
      });
      return openPeriods.length > 0 ? openPeriods[0] : null;
    },

    /**
     * Cria um novo período em estado RASCUNHO
     */
    createPeriod: function(context, data, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const comp = ValidationService.validateCompetencia(data.competencia);
      const abertura = ValidationService.validateIsoDate(data.data_abertura ? data.data_abertura.substring(0, 10) : '', 'Data de Abertura');
      const encerramento = ValidationService.validateIsoDate(data.data_encerramento ? data.data_encerramento.substring(0, 10) : '', 'Data de Encerramento');

      if (new Date(abertura) >= new Date(encerramento)) {
        throw new Error('A data de abertura deve ser anterior à data de encerramento.');
      }

      // Verifica se já existe período para a mesma competência
      const existing = Repository.findOne(Config.SHEETS.PERIODOS, 'competencia', comp);
      if (existing && existing.status !== Config.PERIOD_STATUS.CANCELADO) {
        throw new Error(`Já existe um período cadastrado para a competência ${comp} com status ${existing.status}.`);
      }

      const now = new Date().toISOString();
      const periodoId = ValidationService.generateUuid();

      const record = {
        periodo_id: periodoId,
        competencia: comp,
        data_abertura: data.data_abertura,
        data_encerramento: data.data_encerramento,
        status: Config.PERIOD_STATUS.RASCUNHO,
        regras_json: typeof data.regras === 'object' ? JSON.stringify(data.regras) : (data.regras_json || '{}'),
        criado_por: context.email,
        criado_em: now,
        atualizado_em: now
      };

      Repository.insert(Config.SHEETS.PERIODOS, record);

      AuditService.log({
        userEmail: context.email,
        acao: 'PERIODO_CRIADO',
        entidade: 'PERIODOS',
        registroId: periodoId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        dadosPosteriores: record,
        opId: opId
      });

      return record;
    },

    /**
     * Transiciona o status de um período de forma controlada
     */
    changeStatus: function(context, periodoId, newStatus, justificativa, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const cleanId = ValidationService.validateUuid(periodoId, 'ID do Período');
      const cleanStatus = ValidationService.assertIn(
        newStatus,
        Object.values(Config.PERIOD_STATUS),
        'Novo Status'
      );

      const period = this.getById(cleanId);
      if (!period) throw new Error('Período informado não foi encontrado.');

      const allowedNext = VALID_TRANSITIONS[period.status] || [];
      if (!allowedNext.includes(cleanStatus)) {
        throw new Error(`Transição de status inválida: De '${period.status}' para '${cleanStatus}'.`);
      }

      // Se for abrir o período, garante que nenhum outro esteja ABERTO simultaneamente
      if (cleanStatus === Config.PERIOD_STATUS.ABERTO) {
        const currentlyOpen = this.getActivePeriod();
        if (currentlyOpen && currentlyOpen.periodo_id !== cleanId) {
          throw new Error(`Não é possível abrir o período: a competência ${currentlyOpen.competencia} já está com status ABERTO.`);
        }
      }

      // Se for cancelar ou reabrir, justificativa é obrigatória
      if ((cleanStatus === Config.PERIOD_STATUS.CANCELADO || period.status === Config.PERIOD_STATUS.ENCERRADO) && !justificativa) {
        throw new Error('Justificativa administrativa é obrigatória para esta alteração de status.');
      }

      const now = new Date().toISOString();
      const updated = Repository.updateById(Config.SHEETS.PERIODOS, 'periodo_id', cleanId, {
        status: cleanStatus,
        atualizado_em: now
      });

      AuditService.log({
        userEmail: context.email,
        acao: `PERIODO_STATUS_${cleanStatus}`,
        entidade: 'PERIODOS',
        registroId: cleanId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: justificativa || `Alteração para ${cleanStatus}`,
        dadosAnteriores: { status: period.status },
        dadosPosteriores: { status: cleanStatus },
        opId: opId
      });

      return updated;
    }
  };
})();

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarListagemPeriodos() {
  Logger.log('=== LISTAGEM DE PERÍODOS DE FOLGA ===');
  const periodos = PeriodService.list();
  Logger.log('Total de períodos cadastrados: ' + periodos.length);
  periodos.forEach(function(p) {
    Logger.log('Competência: ' + p.competencia + ' | Status: ' + p.status + ' | Início: ' + p.data_inicio + ' | Fim: ' + p.data_fim);
  });
  return periodos;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PeriodService;
  module.exports.executarListagemPeriodos = executarListagemPeriodos;
}
