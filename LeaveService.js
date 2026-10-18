/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * LeaveService.js - Registro de afastamentos operacionais com estrita observância à LGPD
 */

const LeaveService = (function() {
  const TIPOS_OPERACIONAIS = ['FERIAS', 'LICENCA_PREMIO', 'DISPENSA_SERVICO', 'CURSO', 'MISSAO'];

  return {
    /**
     * Retorna todos os afastamentos ativos
     */
    getAllActive: function() {
      return Repository.find(Config.SHEETS.AFASTAMENTOS, function(a) {
        return a.status === Config.LEAVE_STATUS.ATIVO;
      });
    },

    /**
     * Registra afastamento operacional (Apenas ADMINISTRADOR ou GESTOR)
     * Respeito à LGPD: Proibido registrar CIDs, laudos ou detalhes íntimos
     */
    registerLeave: function(context, data, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const militarId = ValidationService.validateUuid(data.militar_id, 'ID do Militar');
      const dataInicio = ValidationService.validateIsoDate(data.data_inicio, 'Data de Início');
      const dataFim = ValidationService.validateIsoDate(data.data_fim, 'Data de Término');
      const tipo = ValidationService.assertIn(data.tipo_operacional, TIPOS_OPERACIONAIS, 'Tipo Operacional');
      const observacao = ValidationService.sanitizeString(data.observacao_administrativa || '');

      if (new Date(dataInicio) > new Date(dataFim)) {
        throw new Error('A data de início deve ser anterior ou igual à data de término.');
      }

      const militar = MilitaryService.getById(militarId);
      if (!militar || !militar.ativo) {
        throw new Error('Militar não encontrado ou inativo.');
      }

      const afastamentoId = ValidationService.generateUuid();
      const now = new Date().toISOString();

      const record = {
        afastamento_id: afastamentoId,
        militar_id: militarId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        tipo_operacional: tipo,
        status: Config.LEAVE_STATUS.ATIVO,
        observacao_administrativa: observacao,
        criado_por: context.email,
        criado_em: now
      };

      Repository.insert(Config.SHEETS.AFASTAMENTOS, record);

      AuditService.log({
        userEmail: context.email,
        militarId: militarId,
        acao: 'AFASTAMENTO_REGISTRADO',
        entidade: 'AFASTAMENTOS',
        registroId: afastamentoId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Afastamento tipo ${tipo} registrado`,
        dadosPosteriores: record,
        opId: opId
      });

      return record;
    },

    /**
     * Verifica se o militar possui afastamento ativo em uma data específica
     */
    isMilitaryOnLeave: function(militarId, dateStr) {
      const leaves = Repository.find(Config.SHEETS.AFASTAMENTOS, function(a) {
        return a.militar_id === militarId && a.status === Config.LEAVE_STATUS.ATIVO &&
               dateStr >= a.data_inicio && dateStr <= a.data_fim;
      });
      return leaves.length > 0;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeaveService;
}
