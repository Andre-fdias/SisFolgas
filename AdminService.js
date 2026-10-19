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
    },

    /**
     * Registra condição de 'NÃO FAZ JUS' à folga (Apenas ADMINISTRADOR ou GESTOR)
     * Motivos: FÉRIAS, LICENÇA-PRÊMIO, CONVALESCENÇA ou LTS.
     * Pula a escolha do militar imediatamente para o próximo da fila!
     */
    setNaoFazJus: function(context, periodoId, militarId, motivo, justificativa, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const cleanMotivo = ValidationService.assertIn(
        motivo,
        Object.keys(Config.NAO_FAZ_JUS_MOTIVOS),
        'Motivo de Não Faz Jus'
      );
      const cleanJustificativa = ValidationService.sanitizeString(justificativa || '');
      const motivoDescricao = Config.NAO_FAZ_JUS_MOTIVOS[cleanMotivo];

      const militar = MilitaryService.getById(militarId);
      if (!militar) throw new Error('Militar não encontrado.');

      const record = {
        escolha_id: ValidationService.generateUuid(),
        periodo_id: periodoId,
        militar_id: militarId,
        data_folga: 'NAO_FAZ_JUS',
        equipe: militar.equipe,
        ordem_no_momento: Number(militar.ordem_antiguidade),
        status: Config.CHOICE_STATUS.ATIVA,
        justificativa_cancelamento: `NÃO FAZ JUS [${motivoDescricao}]: ${cleanJustificativa}`,
        idempotency_key: `nao-faz-jus-${periodoId}-${militarId}-${Date.now()}`,
        criado_em: new Date().toISOString(),
        criado_por: context.email,
        atualizado_em: new Date().toISOString()
      };

      Repository.insert(Config.SHEETS.ESCOLHAS, record);

      AuditService.log({
        userEmail: context.email,
        militarId: militarId,
        acao: 'MILITAR_NAO_FAZ_JUS',
        entidade: 'ESCOLHAS',
        registroId: record.escolha_id,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Militar não faz jus por motivo de ${motivoDescricao}`,
        dadosPosteriores: record,
        opId: opId
      });

      return {
        success: true,
        mensagem: `Condição de Não Faz Jus (${motivoDescricao}) registrada para ${militar.nome_guerra}. A vez foi repassada para o próximo militar da fila.`
      };
    },

    /**
     * Valida e Homologa o Acúmulo de Folga para outro mês (Apenas ADMINISTRADOR)
     * Cria 1 saldo em CREDITOS para o militar e libera o próximo da fila!
     */
    approveAccumulateLeave: function(context, escolhaId, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const cleanId = ValidationService.validateUuid(escolhaId, 'ID da Escolha');
      const escolha = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId);
      if (!escolha || escolha.status !== Config.CHOICE_STATUS.PENDENTE_VALIDACAO) {
        throw new Error('Solicitação de acúmulo não encontrada ou já processada.');
      }

      const periodo = PeriodService.getById(escolha.periodo_id);
      const militar = MilitaryService.getById(escolha.militar_id);
      const now = new Date().toISOString();

      // 1. Atualiza a escolha para ATIVA (concluindo a etapa do militar na fila)
      Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId, {
        status: Config.CHOICE_STATUS.ATIVA,
        atualizado_em: now
      });

      // 2. Concede 1 crédito disponível para uso futuro
      const creditoId = ValidationService.generateUuid();
      const credito = {
        credito_id: creditoId,
        militar_id: escolha.militar_id,
        periodo_origem: periodo ? periodo.competencia : '',
        motivo: `FOLGA_ACUMULADA_COMPETENCIA_${periodo ? periodo.competencia : ''}`,
        quantidade: 1,
        status: Config.CREDIT_STATUS.DISPONIVEL,
        escolha_relacionada_id: cleanId,
        criado_em: now,
        criado_por: context.email,
        utilizado_em: ''
      };
      Repository.insert(Config.SHEETS.CREDITOS, credito);

      AuditService.log({
        userEmail: context.email,
        militarId: escolha.militar_id,
        acao: 'ACUMULO_FOLGA_HOMOLOGADO',
        entidade: 'CREDITOS',
        registroId: creditoId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Acúmulo de folga homologado para ${militar ? militar.nome_guerra : escolha.militar_id}. Gerado 1 crédito de folga.`,
        dadosPosteriores: { escolhaId: cleanId, creditoId: creditoId },
        opId: opId
      });

      return {
        success: true,
        mensagem: `Acúmulo de folga homologado com sucesso! Saldo de 1 folga gerado em Créditos para ${militar ? militar.nome_guerra : 'o militar'}.`
      };
    },

    /**
     * Recusa o pedido de acúmulo de folga (Apenas ADMINISTRADOR)
     */
    rejectAccumulateLeave: function(context, escolhaId, motivoRecusa, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const cleanId = ValidationService.validateUuid(escolhaId, 'ID da Escolha');
      const cleanMotivo = ValidationService.sanitizeString(motivoRecusa || 'Não autorizado pelo Administrador');

      const escolha = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId);
      if (!escolha || escolha.status !== Config.CHOICE_STATUS.PENDENTE_VALIDACAO) {
        throw new Error('Solicitação de acúmulo não encontrada ou já processada.');
      }

      const now = new Date().toISOString();
      Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId, {
        status: Config.CHOICE_STATUS.CANCELADA,
        justificativa_cancelamento: `Acúmulo recusado: ${cleanMotivo}`,
        atualizado_em: now
      });

      AuditService.log({
        userEmail: context.email,
        militarId: escolha.militar_id,
        acao: 'ACUMULO_FOLGA_RECUSADO',
        entidade: 'ESCOLHAS',
        registroId: cleanId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: cleanMotivo,
        opId: opId
      });

      return {
        success: true,
        mensagem: 'Solicitação de acúmulo recusada. O militar poderá selecionar uma data normalmente.'
      };
    },

    /**
     * Retorna solicitações de acúmulo pendentes de validação pelo Administrador
     */
    getPendingAccumulateRequests: function(context, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const pendentes = Repository.find(Config.SHEETS.ESCOLHAS, e => 
        e.status === Config.CHOICE_STATUS.PENDENTE_VALIDACAO && e.data_folga === 'FOLGA_ACUMULADA'
      );

      return pendentes.map(p => {
        const militar = MilitaryService.getById(p.militar_id);
        return {
          escolha_id: p.escolha_id,
          periodo_id: p.periodo_id,
          militar_id: p.militar_id,
          nome_guerra: militar ? militar.nome_guerra : 'Desconhecido',
          graduacao: militar ? militar.graduacao : '',
          equipe: p.equipe,
          criado_em: p.criado_em,
          justificativa: p.justificativa_cancelamento
        };
      });
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdminService;
}
