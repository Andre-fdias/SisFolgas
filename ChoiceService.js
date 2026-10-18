/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * ChoiceService.js - Motor de fila, cálculo de escala 24x48, concorrência atômica com LockService
 */

const ChoiceService = (function() {
  // Data base de referência para a rotação 24x48:
  // 2026-01-01 = Equipe A, 2026-01-02 = Equipe B, 2026-01-03 = Equipe C
  const ANCHOR_DATE = '2026-01-01';
  const ANCHOR_TEAM_INDEX = 0; // 0: Equipe A, 1: Equipe B, 2: Equipe C

  let _lockOverride = null; // Para testes automatizados

  function getLock() {
    if (_lockOverride) return _lockOverride;
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      return LockService.getScriptLock();
    }
    // Fallback in-memory lock para Node.js
    return {
      waitLock: function() { return true; },
      releaseLock: function() { return true; }
    };
  }

  return {
    /**
     * Permite injeção de lock mockado para suíte de testes
     */
    setLockOverride: function(mockLock) {
      _lockOverride = mockLock;
    },

    /**
     * Determina qual equipe está escalada de serviço de 24h em uma determinada data
     */
    getTeamForDate: function(dateStr) {
      const cleanDate = ValidationService.validateIsoDate(dateStr, 'Data');
      const d1 = new Date(ANCHOR_DATE + 'T00:00:00Z');
      const d2 = new Date(cleanDate + 'T00:00:00Z');
      const diffTime = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      // Ajusta módulo para dias anteriores à data base se necessário
      const teamIdx = ((diffDays % 3) + 3) % 3;
      return Config.DEFAULTS.TEAMS[teamIdx];
    },

    /**
     * Calcula todas as datas em que uma determinada equipe está de plantão na competência
     */
    getEligibleDatesForTeam: function(competencia, equipe) {
      const comp = ValidationService.validateCompetencia(competencia);
      ValidationService.assertIn(equipe, Config.DEFAULTS.TEAMS, 'Equipe');

      const parts = comp.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10); // 1 a 12

      const daysInMonth = new Date(year, month, 0).getDate();
      const eligibleDates = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = day < 10 ? '0' + day : String(day);
        const monthStr = month < 10 ? '0' + month : String(month);
        const dateStr = `${year}-${monthStr}-${dayStr}`;

        if (this.getTeamForDate(dateStr) === equipe) {
          eligibleDates.push(dateStr);
        }
      }

      return eligibleDates;
    },

    /**
     * Retorna o status completo e higienizado da fila de uma equipe para a competência
     */
    getTeamQueueStatus: function(periodoId, equipe) {
      ValidationService.validateUuid(periodoId, 'ID do Período');
      ValidationService.assertIn(equipe, Config.DEFAULTS.TEAMS, 'Equipe');

      const periodo = PeriodService.getById(periodoId);
      if (!periodo) throw new Error('Período informado não existe.');

      const militares = MilitaryService.getByTeam(equipe);
      const escolhas = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
        return e.periodo_id === periodoId && e.equipe === equipe && e.status === Config.CHOICE_STATUS.ATIVA;
      });

      // Mapeia escolhas ativas por militar_id
      const escolhasPorMilitar = {};
      const datasOcupadas = {};
      escolhas.forEach(function(e) {
        escolhasPorMilitar[e.militar_id] = e;
        datasOcupadas[e.data_folga] = e;
      });

      // Mapeia afastamentos e passagens de vez registradas nas configurações/auditoria
      const queue = [];
      let nextTurnFound = false;

      for (let i = 0; i < militares.length; i++) {
        const m = militares[i];
        const escolha = escolhasPorMilitar[m.militar_id];

        let statusFila = 'AGUARDANDO';
        let dataEscolhida = null;

        if (escolha) {
          statusFila = 'ESCOLHIDO';
          dataEscolhida = escolha.data_folga;
        } else if (!nextTurnFound) {
          // É o primeiro militar da fila ainda sem escolha
          statusFila = 'SUA_VEZ';
          nextTurnFound = true;
        }

        queue.push({
          posicao: i + 1,
          militar_id: m.militar_id,
          nome_guerra: m.nome_guerra,
          graduacao: m.graduacao,
          ordem_antiguidade: m.ordem_antiguidade,
          status_fila: statusFila,
          data_folga: dataEscolhida
        });
      }

      const allEligibleDates = this.getEligibleDatesForTeam(periodo.competencia, equipe);
      const availableDates = allEligibleDates.filter(d => !datasOcupadas[d]);

      return {
        periodo_id: periodoId,
        competencia: periodo.competencia,
        equipe: equipe,
        total_militares: militares.length,
        total_escolhidos: escolhas.length,
        vagas_restantes: availableDates.length,
        datas_disponiveis: availableDates,
        datas_ocupadas: Object.keys(datasOcupadas),
        proximo_da_vez: queue.find(q => q.status_fila === 'SUA_VEZ') || null,
        fila: queue
      };
    },

    /**
     * Realiza a confirmação atômica de uma escolha de folga protegida por LockService
     */
    makeChoice: function(context, periodoId, militarId, dataFolga, idempotencyKey, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();

      // 1. Validações preliminares antes de adquirir o lock
      ValidationService.validateUuid(periodoId, 'ID do Período');
      ValidationService.validateUuid(militarId, 'ID do Militar');
      ValidationService.validateIsoDate(dataFolga, 'Data da Folga');
      ValidationService.validateIdempotencyKey(idempotencyKey);

      // Garante que o usuário autenticado pode atuar pelo militar
      AuthService.assertCanActOnMilitary(context, militarId, cleanOpId);

      // 2. Adquire o ScriptLock para proteger a seção crítica
      const lock = getLock();
      const lockAcquired = lock.waitLock(Config.DEFAULTS.LOCK_TIMEOUT_MS);

      if (!lockAcquired) {
        AuditService.logConcurrencyConflict('LOCK_TIMEOUT', {
          periodoId: periodoId,
          militarId: militarId,
          dataFolga: dataFolga
        }, context.email, cleanOpId);
        throw new Error('O sistema está processando outra solicitação simultânea. Por favor, tente novamente em alguns segundos.');
      }

      try {
        // 3. Verificação de idempotência (evita duplicidade por duplo clique ou reenvio)
        const existingWithKey = Repository.findOne(Config.SHEETS.ESCOLHAS, 'idempotency_key', idempotencyKey);
        if (existingWithKey) {
          return {
            success: true,
            escolha: existingWithKey,
            mensagem: 'Escolha já confirmada anteriormente.'
          };
        }

        // 4. Reler dados atualizados do Período
        const periodo = PeriodService.getById(periodoId);
        if (!periodo || periodo.status !== Config.PERIOD_STATUS.ABERTO) {
          throw new Error('O período selecionado não está aberto para escolhas.');
        }

        const nowIso = new Date().toISOString();
        if (periodo.data_abertura && nowIso < periodo.data_abertura) {
          throw new Error('O período de escolha ainda não atingiu o horário de abertura.');
        }
        if (periodo.data_encerramento && nowIso > periodo.data_encerramento) {
          throw new Error('O prazo para escolha de folga deste período já se encerrou.');
        }

        // 5. Reler dados atualizados do Militar
        const militar = MilitaryService.getById(militarId);
        if (!militar || !militar.ativo) {
          throw new Error('Militar inativo ou não encontrado.');
        }

        // 6. Verificar se a data escolhida pertence à competência e à escala 24x48 da equipe
        if (!dataFolga.startsWith(periodo.competencia)) {
          throw new Error(`A data ${dataFolga} não pertence à competência ${periodo.competencia}.`);
        }
        const equipeEscalada = this.getTeamForDate(dataFolga);
        if (equipeEscalada !== militar.equipe) {
          throw new Error(`A data ${dataFolga} não é dia de plantão da sua equipe (${militar.equipe}). Dia escalado para a ${equipeEscalada}.`);
        }

        // 7. Verificar se o militar já realizou uma escolha ativa nesta competência
        const escolhasMilitar = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
          return e.periodo_id === periodoId && e.militar_id === militarId && e.status === Config.CHOICE_STATUS.ATIVA;
        });
        if (escolhasMilitar.length >= Config.DEFAULTS.MAX_CHOICES_PER_PERIOD) {
          throw new Error('Você já realizou sua escolha de folga para esta competência.');
        }

        // 8. Verificar se a vaga da data já foi ocupada na equipe (Exclusividade de vaga)
        const vagaOcupada = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
          return e.periodo_id === periodoId && e.equipe === militar.equipe && e.data_folga === dataFolga && e.status === Config.CHOICE_STATUS.ATIVA;
        });
        if (vagaOcupada.length > 0) {
          AuditService.logConcurrencyConflict('DATE_ALREADY_TAKEN', {
            dataFolga: dataFolga,
            equipe: militar.equipe,
            militarTentou: militar.nome_guerra
          }, context.email, cleanOpId);
          throw new Error(`A data ${dataFolga} já foi escolhida por outro militar da sua equipe.`);
        }

        // 9. Verificar a ordem da fila: É estritamente a vez deste militar?
        const queueStatus = this.getTeamQueueStatus(periodoId, militar.equipe);
        const proximo = queueStatus.proximo_da_vez;

        if (!proximo || proximo.militar_id !== militarId) {
          AuditService.logSecurityEvent('OUT_OF_TURN_ATTEMPT', {
            militarTentouId: militarId,
            militarTentouNome: militar.nome_guerra,
            proximoRealId: proximo ? proximo.militar_id : null,
            proximoRealNome: proximo ? proximo.nome_guerra : 'Nenhum'
          }, context.email, cleanOpId);
          throw new Error(`Ainda não é sua vez de escolher. O militar ${proximo ? proximo.nome_guerra : 'anterior'} está na sua frente na ordem de antiguidade.`);
        }

        // 10. Gravação atômica da escolha
        const escolhaId = ValidationService.generateUuid();
        const now = new Date().toISOString();

        const novaEscolha = {
          escolha_id: escolhaId,
          periodo_id: periodoId,
          militar_id: militarId,
          data_folga: dataFolga,
          equipe: militar.equipe,
          ordem_no_momento: Number(militar.ordem_antiguidade),
          status: Config.CHOICE_STATUS.ATIVA,
          justificativa_cancelamento: '',
          idempotency_key: idempotencyKey,
          criado_em: now,
          criado_por: context.email,
          atualizado_em: now
        };

        Repository.insert(Config.SHEETS.ESCOLHAS, novaEscolha);

        // 11. Gravação obrigatória da Auditoria
        AuditService.log({
          userEmail: context.email,
          militarId: militarId,
          acao: 'ESCOLHA_CONFIRMADA',
          entidade: 'ESCOLHAS',
          registroId: escolhaId,
          resultado: Config.AUDIT_RESULT.SUCESSO,
          dadosPosteriores: novaEscolha,
          opId: cleanOpId
        });

        return {
          success: true,
          escolha: novaEscolha,
          mensagem: `Folga confirmada com sucesso para o dia ${dataFolga}!`
        };

      } finally {
        // Libera o lock incondicionalmente
        lock.releaseLock();
      }
    },

    /**
     * Cancela uma escolha ativa preservando o histórico (Soft-cancel auditado)
     */
    cancelChoice: function(context, escolhaId, justificativa, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();
      const cleanId = ValidationService.validateUuid(escolhaId, 'ID da Escolha');
      const cleanJustificativa = ValidationService.sanitizeString(justificativa);

      if (!cleanJustificativa) {
        throw new Error('Justificativa é obrigatória para cancelamento de folga.');
      }

      const lock = getLock();
      lock.waitLock(Config.DEFAULTS.LOCK_TIMEOUT_MS);

      try {
        const escolha = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId);
        if (!escolha || escolha.status !== Config.CHOICE_STATUS.ATIVA) {
          throw new Error('Escolha ativa não encontrada para cancelamento.');
        }

        // Valida se o usuário tem permissão (Admin ou o próprio militar)
        AuthService.assertCanActOnMilitary(context, escolha.militar_id, cleanOpId);

        const now = new Date().toISOString();
        const updated = Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId, {
          status: Config.CHOICE_STATUS.CANCELADA,
          justificativa_cancelamento: cleanJustificativa,
          atualizado_em: now
        });

        AuditService.log({
          userEmail: context.email,
          militarId: escolha.militar_id,
          acao: 'ESCOLHA_CANCELADA',
          entidade: 'ESCOLHAS',
          registroId: cleanId,
          resultado: Config.AUDIT_RESULT.SUCESSO,
          justificativa: cleanJustificativa,
          dadosAnteriores: { status: Config.CHOICE_STATUS.ATIVA },
          dadosPosteriores: { status: Config.CHOICE_STATUS.CANCELADA },
          opId: cleanOpId
        });

        return updated;
      } finally {
        lock.releaseLock();
      }
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChoiceService;
}
