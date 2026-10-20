/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * MilitaryService.js - Gestão de militares, equipes e ordenação de antiguidade
 */

const MilitaryService = (function() {
  return {
    /**
     * Retorna todos os militares ativos ordenados por antiguidade geral
     * Permite filtro opcional por unidade e prontidão
     */
    getAllActive: function(unidadeFilter, prontidaoFilter) {
      let militares = Repository.find(Config.SHEETS.MILITARES, function(m) {
        if (typeof ValidationService !== 'undefined' && ValidationService.normalizeMilitary) {
          ValidationService.normalizeMilitary(m);
        }
        return m.ativo !== false;
      });

      if (unidadeFilter && unidadeFilter !== 'TODAS') {
        militares = militares.filter(m => (m.unidade || '').toLowerCase() === unidadeFilter.toLowerCase());
      }

      if (prontidaoFilter && prontidaoFilter !== 'TODAS') {
        const norm = ValidationService.normalizeProntidao ? ValidationService.normalizeProntidao(prontidaoFilter) : prontidaoFilter;
        militares = militares.filter(m => {
          const p = (m.prontidao || m.equipe || '');
          return p.toLowerCase() === norm.toLowerCase() || p.toLowerCase() === prontidaoFilter.toLowerCase();
        });
      }

      // REGRA: Respeita a ordem geral de antiguidade do mais antigo ao mais novo
      return militares.sort(function(a, b) {
        return (Number(a.ordem_antiguidade) || 999) - (Number(b.ordem_antiguidade) || 999);
      });
    },

    /**
     * Retorna militares de uma prontidão/equipe específica ordenados por antiguidade
     */
    getByTeam: function(equipe, unidadeFilter) {
      if (!equipe) throw new Error('Prontidão/Equipe não informada.');
      const norm = ValidationService.normalizeProntidao ? ValidationService.normalizeProntidao(equipe) : equipe;
      const all = Repository.find(Config.SHEETS.MILITARES, function(m) {
        if (typeof ValidationService !== 'undefined' && ValidationService.normalizeMilitary) {
          ValidationService.normalizeMilitary(m);
        }
        return m.ativo !== false;
      });

      const filtered = all.filter(m => {
        const p = (m.prontidao || m.equipe || '');
        const matchesTeam = (p.toLowerCase() === norm.toLowerCase() || p.toLowerCase() === equipe.toLowerCase());
        if (!matchesTeam) return false;
        if (unidadeFilter && unidadeFilter !== 'TODAS') {
          return (m.unidade || '').toLowerCase() === unidadeFilter.toLowerCase();
        }
        return true;
      });

      return filtered.sort(function(a, b) {
        return (Number(a.ordem_antiguidade) || 999) - (Number(b.ordem_antiguidade) || 999);
      });
    },

    /**
     * Busca militar por ID ou RE
     * REGRA OBRIGATÓRIA: O ID deve ser sempre o RE coluna B da aba militares
     */
    getById: function(militarId) {
      if (!militarId) return null;
      const clean = String(militarId).trim();
      return Repository.findOne(Config.SHEETS.MILITARES, 're', clean) ||
             Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', clean);
    },

    /**
     * Busca militar por RE normalizado
     */
    getByRE: function(re) {
      const cleanRe = ValidationService.normalizeRE(re);
      return Repository.findOne(Config.SHEETS.MILITARES, 're', cleanRe);
    },

    /**
     * Cadastra ou atualiza militar com validação administrativa rigorosa
     */
    saveMilitary: function(context, data, opId) {
      AuthService.requireRole(context, [Config.ROLES.ADMIN], opId);

      const isUpdate = Boolean(data.militar_id);
      const cleanRe = ValidationService.normalizeRE(data.re);
      const digito = ValidationService.normalizeDigitoRE(data.digito_re);
      const nomeCompleto = ValidationService.sanitizeString(data.nome_completo);
      const nomeGuerra = ValidationService.sanitizeString(data.nome_guerra);
      const graduacao = ValidationService.sanitizeString(data.graduacao);
      const rawProntidao = data.prontidao || data.equipe || 'Verde';
      const prontidao = ValidationService.normalizeProntidao ? ValidationService.normalizeProntidao(rawProntidao) : rawProntidao;
      const antiguidade = parseInt(data.ordem_antiguidade, 10);
      const emailVinculado = data.email_vinculado ? ValidationService.normalizeEmail(data.email_vinculado) : '';

      if (!nomeCompleto || !nomeGuerra || !graduacao) {
        throw new Error('Nome completo, nome de guerra e graduação são obrigatórios.');
      }
      if (isNaN(antiguidade) || antiguidade < 1) {
        throw new Error('Ordem de antiguidade deve ser um número positivo.');
      }

      // Verifica unicidade de RE
      const existingRe = Repository.findOne(Config.SHEETS.MILITARES, 're', cleanRe);
      if (existingRe && (!isUpdate || existingRe.militar_id !== data.militar_id)) {
        throw new Error(`O RE ${cleanRe} já está cadastrado para outro militar (${existingRe.nome_guerra}).`);
      }

      // Verifica se o e-mail já está vinculado a outro militar ativo
      if (emailVinculado) {
        const existingEmail = Repository.findOne(Config.SHEETS.MILITARES, 'email_vinculado', emailVinculado);
        if (existingEmail && (!isUpdate || existingEmail.militar_id !== data.militar_id)) {
          throw new Error(`O e-mail ${emailVinculado} já está vinculado ao militar ${existingEmail.nome_guerra}.`);
        }
      }

      const now = new Date().toISOString();

      if (isUpdate) {
        const previous = Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', data.militar_id);
        if (!previous) throw new Error('Militar não encontrado para atualização.');

        const updated = Repository.updateById(Config.SHEETS.MILITARES, 'militar_id', data.militar_id, {
          re: cleanRe,
          digito_re: digito,
          nome_completo: nomeCompleto,
          nome_guerra: nomeGuerra,
          graduacao: graduacao,
          unidade: ValidationService.sanitizeString(data.unidade || previous.unidade || '1º SGB'),
          situacao: ValidationService.sanitizeString(data.situacao || previous.situacao || 'ATIVO'),
          prontidao: prontidao,
          equipe: prontidao,
          ordem_antiguidade: antiguidade,
          email_vinculado: emailVinculado,
          ativo: data.ativo !== undefined ? Boolean(data.ativo) : previous.ativo,
          atualizado_em: now
        });

        AuditService.log({
          userEmail: context.email,
          militarId: data.militar_id,
          acao: 'MILITAR_ATUALIZADO',
          entidade: 'MILITARES',
          registroId: data.militar_id,
          resultado: Config.AUDIT_RESULT.SUCESSO,
          dadosAnteriores: previous,
          dadosPosteriores: updated,
          opId: opId
        });

        return updated;
      } else {
        const militarId = cleanRe; // REGRA: O ID deve ser sempre o RE coluna B da aba militares
        const record = {
          militar_id: militarId,
          re: cleanRe,
          digito_re: digito,
          nome_completo: nomeCompleto,
          nome_guerra: nomeGuerra,
          graduacao: graduacao,
          unidade: ValidationService.sanitizeString(data.unidade || '1º SGB'),
          situacao: ValidationService.sanitizeString(data.situacao || 'ATIVO'),
          prontidao: prontidao,
          equipe: prontidao,
          ordem_antiguidade: antiguidade,
          email_vinculado: emailVinculado,
          ativo: true,
          criado_em: now,
          atualizado_em: now
        };

        Repository.insert(Config.SHEETS.MILITARES, record);

        AuditService.log({
          userEmail: context.email,
          militarId: militarId,
          acao: 'MILITAR_CADASTRADO',
          entidade: 'MILITARES',
          registroId: militarId,
          resultado: Config.AUDIT_RESULT.SUCESSO,
          dadosPosteriores: record,
          opId: opId
        });

        return record;
      }
    }
  };
})();

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarListagemMilitares() {
  Logger.log('=== LISTAGEM DE MILITARES CADASTRADOS ===');
  const militares = MilitaryService.listAll();
  Logger.log('Total de militares encontrados: ' + militares.length);
  militares.forEach(function(m) {
    Logger.log('[' + m.equipe + '] Antiguidade: ' + m.ordem_antiguidade + ' - ' + m.graduacao + ' ' + m.nome_guerra + ' (RE: ' + m.re + '-' + m.digito_re + ')');
  });
  return militares;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MilitaryService;
  module.exports.executarListagemMilitares = executarListagemMilitares;
}
