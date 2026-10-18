/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * SwapService.js - Gestão e homologação de permutas entre militares
 */

const SwapService = (function() {
  return {
    /**
     * Solicita permuta de folga entre dois militares
     */
    requestSwap: function(context, data, opId) {
      AuthService.requireAuthentication(context);

      const escolhaOrigemId = ValidationService.validateUuid(data.escolha_origem_id, 'Escolha de Origem');
      const militarDestinoId = ValidationService.validateUuid(data.militar_destino_id, 'Militar de Destino');
      const escolhaDestinoId = ValidationService.validateUuid(data.escolha_destino_id, 'Escolha de Destino');
      const justificativa = ValidationService.sanitizeString(data.justificativa);

      if (!justificativa) throw new Error('Justificativa é obrigatória para solicitação de permuta.');

      const escolhaOrigem = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', escolhaOrigemId);
      if (!escolhaOrigem || escolhaOrigem.status !== Config.CHOICE_STATUS.ATIVA) {
        throw new Error('Sua escolha de folga informada não está ativa.');
      }

      // Garante que o solicitante é o dono da escolha de origem
      AuthService.assertCanActOnMilitary(context, escolhaOrigem.militar_id, opId);

      const escolhaDestino = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', escolhaDestinoId);
      if (!escolhaDestino || escolhaDestino.status !== Config.CHOICE_STATUS.ATIVA) {
        throw new Error('A escolha de folga do militar de destino não está ativa.');
      }

      if (escolhaDestino.militar_id !== militarDestinoId) {
        throw new Error('Inconsistência nos dados do militar de destino.');
      }

      const permutaId = ValidationService.generateUuid();
      const now = new Date().toISOString();

      const record = {
        permuta_id: permutaId,
        militar_origem_id: escolhaOrigem.militar_id,
        militar_destino_id: militarDestinoId,
        escolha_origem_id: escolhaOrigemId,
        escolha_destino_id: escolhaDestinoId,
        data_solicitacao: now,
        status: Config.SWAP_STATUS.PENDENTE,
        aprovado_por: '',
        data_conclusao: '',
        justificativa: justificativa
      };

      Repository.insert(Config.SHEETS.PERMUTAS, record);

      AuditService.log({
        userEmail: context.email,
        militarId: escolhaOrigem.militar_id,
        acao: 'PERMUTA_SOLICITADA',
        entidade: 'PERMUTAS',
        registroId: permutaId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: justificativa,
        dadosPosteriores: record,
        opId: opId
      });

      return record;
    },

    /**
     * Homologa/Aprova permuta (Apenas ADMINISTRADOR ou GESTOR)
     */
    approveSwap: function(context, permutaId, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN, Config.ROLES.GESTOR], opId);

      const cleanId = ValidationService.validateUuid(permutaId, 'ID da Permuta');
      const permuta = Repository.findOne(Config.SHEETS.PERMUTAS, 'permuta_id', cleanId);
      if (!permuta || permuta.status !== Config.SWAP_STATUS.PENDENTE) {
        throw new Error('Permuta informada não está pendente de aprovação.');
      }

      const eOrigem = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', permuta.escolha_origem_id);
      const eDestino = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', permuta.escolha_destino_id);

      if (!eOrigem || eOrigem.status !== Config.CHOICE_STATUS.ATIVA || !eDestino || eDestino.status !== Config.CHOICE_STATUS.ATIVA) {
        throw new Error('Uma das escolhas relacionadas à permuta não está mais ativa.');
      }

      const now = new Date().toISOString();

      // Troca atômica das datas das duas escolhas
      const dataOrigemTemp = eOrigem.data_folga;
      const dataDestinoTemp = eDestino.data_folga;

      Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', eOrigem.escolha_id, {
        data_folga: dataDestinoTemp,
        atualizado_em: now
      });

      Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', eDestino.escolha_id, {
        data_folga: dataOrigemTemp,
        atualizado_em: now
      });

      const updatedPermuta = Repository.updateById(Config.SHEETS.PERMUTAS, 'permuta_id', cleanId, {
        status: Config.SWAP_STATUS.APROVADA,
        aprovado_por: context.email,
        data_conclusao: now
      });

      AuditService.log({
        userEmail: context.email,
        acao: 'PERMUTA_APROVADA',
        entidade: 'PERMUTAS',
        registroId: cleanId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Permuta homologada entre militar ${permuta.militar_origem_id} e ${permuta.militar_destino_id}`,
        dadosPosteriores: {
          permutaId: cleanId,
          novaDataOrigem: dataDestinoTemp,
          novaDataDestino: dataOrigemTemp
        },
        opId: opId
      });

      return updatedPermuta;
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SwapService;
}
