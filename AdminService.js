/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * AdminService.js - Painel de controle administrativo, relatórios e intervenções justificadas
 */

const AdminService = (function() {
  return {
    /**
     * Passagem manual de vez com justificativa obrigatória (ADMIN ou GESTOR)
     * Utilizada quando o militar não se manifesta dentro do prazo regulamentar
     */
    passTurn: function(context, periodoId, militarId, justificativa, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const cleanJustificativa = ValidationService.sanitizeString(justificativa);
      if (!cleanJustificativa) {
        throw new Error('Justificativa é obrigatória para realizar a passagem de vez.');
      }

      const militar = MilitaryService.getById(militarId);
      if (!militar) throw new Error('Militar não encontrado.');

      // Insere um registro especial de passagem de vez auditada
      const escolhaPassada = {
        escolha_id: ValidationService.generateUuid(),
        periodo_id: periodoId,
        militar_id: militarId,
        data_folga: 'PASSOU_A_VEZ',
        equipe: militar.equipe,
        ordem_no_momento: Number(militar.ordem_antiguidade),
        status: Config.CHOICE_STATUS.ATIVA,
        justificativa_cancelamento: cleanJustificativa,
        idempotency_key: `pass-turn-${periodoId}-${militarId}-${Date.now()}`,
        criado_em: new Date().toISOString(),
        criado_por: context.email,
        atualizado_em: new Date().toISOString()
      };

      Repository.insert(Config.SHEETS.ESCOLHAS, escolhaPassada);

      AuditService.log({
        userEmail: context.email,
        militarId: militarId,
        acao: 'PASSAGEM_VEZ_ADMINISTRATIVA',
        entidade: 'ESCOLHAS',
        registroId: escolhaPassada.escolha_id,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: cleanJustificativa,
        dadosPosteriores: escolhaPassada,
        opId: opId
      });

      return {
        success: true,
        mensagem: `Vez do militar ${militar.nome_guerra} passada com sucesso para o próximo da fila.`
      };
    },

    /**
     * Gera relatório operacional consolidado da competência para o comando
     */
    getOperationalReport: function(context, periodoId, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const cleanId = ValidationService.validateUuid(periodoId, 'ID do Período');
      const periodo = PeriodService.getById(cleanId);
      if (!periodo) throw new Error('Período não encontrado.');

      const report = {
        periodo: periodo,
        equipes: {},
        resumo: {
          totalMilitares: 0,
          totalEscolhidos: 0,
          totalPendentes: 0
        }
      };

      Config.DEFAULTS.TEAMS.forEach(equipe => {
        const queue = ChoiceService.getTeamQueueStatus(cleanId, equipe);
        report.equipes[equipe] = queue;
        report.resumo.totalMilitares += queue.total_militares;
        report.resumo.totalEscolhidos += queue.total_escolhidos;
        report.resumo.totalPendentes += (queue.total_militares - queue.total_escolhidos);
      });

      return report;
    },

    /**
     * Consulta registros da trilha de auditoria (Apenas ADMINISTRADOR)
     */
    getAuditLogs: function(context, limit = 50, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const logs = Repository.getAll(Config.SHEETS.AUDITORIA);
      // Retorna os mais recentes primeiro
      logs.sort((a, b) => (b.data_hora || '').localeCompare(a.data_hora || ''));

      return logs.slice(0, Math.min(limit, 200));
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminService;
}
