/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * ChoiceService.js - Motor de fila, escala 24x48, janela 01-16, trocas pós-conclusão e acúmulo de folgas
 */

const ChoiceService = (function() {
  // Data base de referência para a rotação 24x48:
  // 2026-01-01 = Equipe A, 2026-01-02 = Equipe B, 2026-01-03 = Equipe C
  const ANCHOR_DATE = '2026-01-01';

  let _lockOverride = null;
  let _bypassWindowCheck = false; // Flag para testes automatizados

  function getLock() {
    if (_lockOverride) return _lockOverride;
    if (typeof LockService !== 'undefined' && LockService.getScriptLock) {
      return LockService.getScriptLock();
    }
    return {
      waitLock: function() { return true; },
      releaseLock: function() { return true; }
    };
  }

  return {
    setLockOverride: function(mockLock) {
      _lockOverride = mockLock;
    },

    setBypassWindowCheck: function(bypass) {
      _bypassWindowCheck = Boolean(bypass);
    },

    /**
     * Valida se a data atual está dentro da janela regulamentar de escolha (dias 01 a 16 do mês).
     * Do dia 17 em diante, o sistema bloqueia qualquer edição/escolha!
     */
    assertWithinChoiceWindow: function(optionalDate) {
      if (_bypassWindowCheck) return true;

      const now = optionalDate ? new Date(optionalDate) : new Date();
      const day = now.getDate(); // 1 a 31

      if (day < Config.DEFAULTS.CHOICE_WINDOW_START_DAY || day > Config.DEFAULTS.CHOICE_WINDOW_END_DAY) {
        throw new Error(
          `O período para escolhas e alterações de folga ocorre entre os dias ${Config.DEFAULTS.CHOICE_WINDOW_START_DAY} e ${Config.DEFAULTS.CHOICE_WINDOW_END_DAY} de cada mês. ` +
          `Atualmente (dia ${day}), o sistema encontra-se bloqueado para edições.`
        );
      }
      return true;
    },

    /**
     * Retorna se a janela de escolhas (dias 01 a 16) está atualmente aberta.
     */
    isWithinChoiceWindow: function(optionalDate) {
      if (_bypassWindowCheck) return true;
      const now = optionalDate ? new Date(optionalDate) : new Date();
      const day = now.getDate();
      return (day >= Config.DEFAULTS.CHOICE_WINDOW_START_DAY && day <= Config.DEFAULTS.CHOICE_WINDOW_END_DAY);
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
      const month = parseInt(parts[1], 10);

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
     * Retorna o status da fila da equipe, identificando se todos já escolheram (liberando fase de trocas)
     */
    getTeamQueueStatus: function(periodoId, equipe) {
      ValidationService.validateUuid(periodoId, 'ID do Período');
      ValidationService.assertIn(equipe, Config.DEFAULTS.TEAMS, 'Equipe');

      const periodo = PeriodService.getById(periodoId);
      if (!periodo) throw new Error('Período informado não existe.');

      const militares = MilitaryService.getByTeam(equipe);
      
      // Busca escolhas ativas ou pendentes de validação
      const escolhas = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
        return e.periodo_id === periodoId && e.equipe === equipe && 
               (e.status === Config.CHOICE_STATUS.ATIVA || e.status === Config.CHOICE_STATUS.PENDENTE_VALIDACAO);
      });

      const escolhasPorMilitar = {};
      const datasOcupadas = {};

      escolhas.forEach(function(e) {
        escolhasPorMilitar[e.militar_id] = e;
        if (e.status === Config.CHOICE_STATUS.ATIVA && e.data_folga && e.data_folga.startsWith(periodo.competencia)) {
          datasOcupadas[e.data_folga] = e;
        }
      });

      const queue = [];
      let nextTurnFound = false;

      for (let i = 0; i < militares.length; i++) {
        const m = militares[i];
        const escolha = escolhasPorMilitar[m.militar_id];

        let statusFila = 'AGUARDANDO';
        let dataEscolhida = null;
        let tipoConclusao = null;

        if (escolha) {
          if (escolha.status === Config.CHOICE_STATUS.PENDENTE_VALIDACAO) {
            statusFila = 'PENDENTE_VALIDACAO';
            dataEscolhida = escolha.data_folga;
            tipoConclusao = 'ACUMULO_PENDENTE';
          } else if (escolha.data_folga === 'NAO_FAZ_JUS') {
            statusFila = 'NAO_FAZ_JUS';
            dataEscolhida = 'NÃO FAZ JUS';
            tipoConclusao = 'NAO_FAZ_JUS';
          } else if (escolha.data_folga === 'FOLGA_ACUMULADA') {
            statusFila = 'FOLGA_ACUMULADA';
            dataEscolhida = 'FOLGA ACUMULADA';
            tipoConclusao = 'ACUMULADA';
          } else if (escolha.data_folga === 'PASSOU_A_VEZ') {
            statusFila = 'PASSOU_A_VEZ';
            dataEscolhida = 'PASSOU A VEZ';
            tipoConclusao = 'PASSOU';
          } else {
            statusFila = 'ESCOLHIDO';
            dataEscolhida = escolha.data_folga;
            tipoConclusao = 'FOLGA_ESCOLHIDA';
          }
        } else if (!nextTurnFound) {
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
          data_folga: dataEscolhida,
          tipo_conclusao: tipoConclusao,
          escolha_id: escolha ? escolha.escolha_id : null,
          justificativa: escolha ? escolha.justificativa_cancelamento : ''
        });
      }

      const allEligibleDates = this.getEligibleDatesForTeam(periodo.competencia, equipe);
      const availableDates = allEligibleDates.filter(d => !datasOcupadas[d]);

      // Verifica se TODOS os militares ativos da equipe concluíram sua etapa
      const statusResolvidos = ['ESCOLHIDO', 'NAO_FAZ_JUS', 'FOLGA_ACUMULADA', 'PASSOU_A_VEZ'];
      const totalResolvidos = queue.filter(q => statusResolvidos.includes(q.status_fila)).length;
      const todasEscolhasConcluidas = (militares.length > 0 && totalResolvidos === militares.length);

      // A fase de trocas fica liberada se todos escolheram e ainda estamos na janela 01-16
      const now = new Date();
      const currentDay = now.getDate();
      const isWindowOpen = (currentDay >= Config.DEFAULTS.CHOICE_WINDOW_START_DAY && currentDay <= Config.DEFAULTS.CHOICE_WINDOW_END_DAY) || _bypassWindowCheck;
      const faseTrocasLiberada = todasEscolhasConcluidas && isWindowOpen;

      return {
        periodo_id: periodoId,
        competencia: periodo.competencia,
        equipe: equipe,
        total_militares: militares.length,
        total_resolvidos: totalResolvidos,
        todas_escolhas_concluidas: todasEscolhasConcluidas,
        fase_trocas_liberada: faseTrocasLiberada,
        janela_edicao_aberta: isWindowOpen,
        vagas_restantes: availableDates.length,
        datas_disponiveis: availableDates,
        datas_ocupadas: Object.keys(datasOcupadas),
        proximo_da_vez: todasEscolhasConcluidas ? null : (queue.find(q => q.status_fila === 'SUA_VEZ') || null),
        fila: queue
      };
    },

    /**
     * Realiza a confirmação de escolha de folga pelo militar
     */
    makeChoice: function(context, periodoId, militarId, dataFolga, idempotencyKey, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();

      // 1. Valida janela de escolha (dias 01 a 16)
      this.assertWithinChoiceWindow();

      ValidationService.validateUuid(periodoId, 'ID do Período');
      ValidationService.validateUuid(militarId, 'ID do Militar');
      ValidationService.validateIsoDate(dataFolga, 'Data da Folga');
      ValidationService.validateIdempotencyKey(idempotencyKey);

      AuthService.assertCanActOnMilitary(context, militarId, cleanOpId);

      const lock = getLock();
      const lockAcquired = lock.waitLock(Config.DEFAULTS.LOCK_TIMEOUT_MS);

      if (!lockAcquired) {
        AuditService.logConcurrencyConflict('LOCK_TIMEOUT', { periodoId, militarId, dataFolga }, context.email, cleanOpId);
        throw new Error('O sistema está processando outra solicitação simultânea. Por favor, tente novamente em alguns segundos.');
      }

      try {
        const existingWithKey = Repository.findOne(Config.SHEETS.ESCOLHAS, 'idempotency_key', idempotencyKey);
        if (existingWithKey) {
          return { success: true, escolha: existingWithKey, mensagem: 'Escolha já confirmada anteriormente.' };
        }

        const periodo = PeriodService.getById(periodoId);
        if (!periodo || periodo.status !== Config.PERIOD_STATUS.ABERTO) {
          throw new Error('O período selecionado não está aberto para escolhas.');
        }

        const militar = MilitaryService.getById(militarId);
        if (!militar || !militar.ativo) {
          throw new Error('Militar inativo ou não encontrado.');
        }

        if (!dataFolga.startsWith(periodo.competencia)) {
          throw new Error(`A data ${dataFolga} não pertence à competência ${periodo.competencia}.`);
        }
        const equipeEscalada = this.getTeamForDate(dataFolga);
        if (equipeEscalada !== militar.equipe) {
          throw new Error(`A data ${dataFolga} não é dia de plantão da sua equipe (${militar.equipe}). Dia escalado para a ${equipeEscalada}.`);
        }

        const escolhasMilitar = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
          return e.periodo_id === periodoId && e.militar_id === militarId && e.status === Config.CHOICE_STATUS.ATIVA;
        });
        if (escolhasMilitar.length >= Config.DEFAULTS.MAX_CHOICES_PER_PERIOD) {
          throw new Error('Você já realizou sua escolha de folga para esta competência.');
        }

        const vagaOcupada = Repository.find(Config.SHEETS.ESCOLHAS, function(e) {
          return e.periodo_id === periodoId && e.equipe === militar.equipe && e.data_folga === dataFolga && e.status === Config.CHOICE_STATUS.ATIVA;
        });
        if (vagaOcupada.length > 0) {
          AuditService.logConcurrencyConflict('DATE_ALREADY_TAKEN', { dataFolga, equipe: militar.equipe, militarTentou: militar.nome_guerra }, context.email, cleanOpId);
          throw new Error(`A data ${dataFolga} já foi escolhida por outro militar da sua equipe.`);
        }

        const queueStatus = this.getTeamQueueStatus(periodoId, militar.equipe);
        const proximo = queueStatus.proximo_da_vez;

        if (!proximo || proximo.militar_id !== militarId) {
          AuditService.logSecurityEvent('OUT_OF_TURN_ATTEMPT', {
            militarTentouId: militarId,
            militarTentouNome: militar.nome_guerra,
            proximoRealId: proximo ? proximo.militar_id : null
          }, context.email, cleanOpId);
          throw new Error(`Ainda não é sua vez de escolher. O militar ${proximo ? proximo.nome_guerra : 'anterior'} está na sua frente na ordem de antiguidade.`);
        }

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
        lock.releaseLock();
      }
    },

    /**
     * Troca a data de folga por uma vaga remanescente disponível.
     * EXIGÊNCIA: Somente liberado entre os dias 01 e 16 APÓS todos os militares da equipe escolherem!
     */
    changeChoiceToAvailableDate: function(context, escolhaId, novaDataFolga, justificativa, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();

      this.assertWithinChoiceWindow();

      const cleanId = ValidationService.validateUuid(escolhaId, 'ID da Escolha');
      const cleanData = ValidationService.validateIsoDate(novaDataFolga, 'Nova Data de Folga');
      const cleanJustificativa = ValidationService.sanitizeString(justificativa || 'Troca por dia vago após conclusão da fila');

      const lock = getLock();
      lock.waitLock(Config.DEFAULTS.LOCK_TIMEOUT_MS);

      try {
        const escolha = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId);
        if (!escolha || escolha.status !== Config.CHOICE_STATUS.ATIVA) {
          throw new Error('Escolha ativa não encontrada.');
        }

        AuthService.assertCanActOnMilitary(context, escolha.militar_id, cleanOpId);

        // Verifica se todas as escolhas da equipe estão concluídas
        const queueStatus = this.getTeamQueueStatus(escolha.periodo_id, escolha.equipe);
        if (!queueStatus.fase_trocas_liberada) {
          throw new Error('A troca de data de folga só é permitida após todos os militares da equipe concluírem suas escolhas iniciais.');
        }

        // Verifica se a nova data pertence à escala da equipe
        const equipeNovaData = this.getTeamForDate(cleanData);
        if (equipeNovaData !== escolha.equipe) {
          throw new Error(`A data ${cleanData} não é dia de plantão da sua equipe (${escolha.equipe}).`);
        }

        // Verifica se a nova data está livre
        if (!queueStatus.datas_disponiveis.includes(cleanData)) {
          throw new Error(`A data ${cleanData} não está disponível (já ocupada por outro militar).`);
        }

        const dataAnterior = escolha.data_folga;
        const now = new Date().toISOString();

        const updated = Repository.updateById(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId, {
          data_folga: cleanData,
          justificativa_cancelamento: `Troca de ${dataAnterior} para ${cleanData}: ${cleanJustificativa}`,
          atualizado_em: now
        });

        AuditService.log({
          userEmail: context.email,
          militarId: escolha.militar_id,
          acao: 'TROCA_FOLGA_DIA_VAGO',
          entidade: 'ESCOLHAS',
          registroId: cleanId,
          resultado: Config.AUDIT_RESULT.SUCESSO,
          justificativa: cleanJustificativa,
          dadosAnteriores: { data_folga: dataAnterior },
          dadosPosteriores: { data_folga: cleanData },
          opId: cleanOpId
        });

        return {
          success: true,
          escolha: updated,
          mensagem: `Folga alterada com sucesso de ${dataAnterior} para ${cleanData}!`
        };
      } finally {
        lock.releaseLock();
      }
    },

    /**
     * Solicitação pelo militar para acumular a folga do mês para uso futuro.
     * Fica com status PENDENTE_VALIDACAO até homologação do Administrador.
     */
    requestAccumulateLeave: function(context, periodoId, militarId, justificativa, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();

      this.assertWithinChoiceWindow();

      ValidationService.validateUuid(periodoId, 'ID do Período');
      ValidationService.validateUuid(militarId, 'ID do Militar');
      const cleanJust = ValidationService.sanitizeString(justificativa || 'Solicitação de acúmulo de folga para competência futura');

      AuthService.assertCanActOnMilitary(context, militarId, cleanOpId);

      const militar = MilitaryService.getById(militarId);
      if (!militar || !militar.ativo) throw new Error('Militar não encontrado.');

      const queueStatus = this.getTeamQueueStatus(periodoId, militar.equipe);
      const proximo = queueStatus.proximo_da_vez;

      if (!proximo || proximo.militar_id !== militarId) {
        throw new Error('A solicitação de acúmulo só pode ser realizada quando for a sua vez na fila.');
      }

      const escolhaId = ValidationService.generateUuid();
      const now = new Date().toISOString();

      const record = {
        escolha_id: escolhaId,
        periodo_id: periodoId,
        militar_id: militarId,
        data_folga: 'FOLGA_ACUMULADA',
        equipe: militar.equipe,
        ordem_no_momento: Number(militar.ordem_antiguidade),
        status: Config.CHOICE_STATUS.PENDENTE_VALIDACAO,
        justificativa_cancelamento: cleanJust,
        idempotency_key: `accumulate-${periodoId}-${militarId}-${Date.now()}`,
        criado_em: now,
        criado_por: context.email,
        atualizado_em: now
      };

      Repository.insert(Config.SHEETS.ESCOLHAS, record);

      AuditService.log({
        userEmail: context.email,
        militarId: militarId,
        acao: 'SOLICITACAO_ACUMULO_FOLGA',
        entidade: 'ESCOLHAS',
        registroId: escolhaId,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: cleanJust,
        dadosPosteriores: record,
        opId: cleanOpId
      });

      return {
        success: true,
        escolha: record,
        mensagem: 'Solicitação de acúmulo de folga enviada com sucesso! Aguardando validação do Administrador.'
      };
    },

    /**
     * Cancela uma escolha ativa preservando o histórico
     */
    cancelChoice: function(context, escolhaId, justificativa, opId) {
      const cleanOpId = opId || ValidationService.generateUuid();

      this.assertWithinChoiceWindow();

      const cleanId = ValidationService.validateUuid(escolhaId, 'ID da Escolha');
      const cleanJustificativa = ValidationService.sanitizeString(justificativa);

      if (!cleanJustificativa) {
        throw new Error('Justificativa é obrigatória para cancelamento de folga.');
      }

      const lock = getLock();
      lock.waitLock(Config.DEFAULTS.LOCK_TIMEOUT_MS);

      try {
        const escolha = Repository.findOne(Config.SHEETS.ESCOLHAS, 'escolha_id', cleanId);
        if (!escolha || (escolha.status !== Config.CHOICE_STATUS.ATIVA && escolha.status !== Config.CHOICE_STATUS.PENDENTE_VALIDACAO)) {
          throw new Error('Escolha ativa ou pendente não encontrada para cancelamento.');
        }

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
          dadosAnteriores: { status: escolha.status },
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

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarVerificacaoEscolhas() {
  Logger.log('=== STATUS DA FILA E ESCOLHAS ===');
  const periodos = PeriodService.list();
  const ativo = periodos.find(function(p) { return p.status === Config.PERIOD_STATUS.ABERTO; });
  if (!ativo) {
    Logger.log('Nenhum período de escolha ABERTO no momento.');
    return null;
  }
  Logger.log('Período Ativo: ' + ativo.competencia);
  Config.DEFAULTS.TEAMS.forEach(function(eq) {
    const queue = ChoiceService.getTeamQueueStatus(ativo.periodo_id, eq);
    Logger.log('Equipe ' + eq + ': Fase Trocas=' + queue.fase_trocas_liberada + ', Total Escolhas=' + (queue.escolhas_feitas ? queue.escolhas_feitas.length : 0));
  });
  return ativo;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChoiceService;
  module.exports.executarVerificacaoEscolhas = executarVerificacaoEscolhas;
}
