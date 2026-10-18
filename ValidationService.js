/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * ValidationService.js - Sanitização anti-XSS, validação de tipos e dados funcionais
 */

const ValidationService = {
  /**
   * Sanitiza strings contra injeção de HTML e scripts (Anti-XSS)
   */
  sanitizeString: function(input) {
    if (input === null || input === undefined) return '';
    const str = String(input).trim();
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  },

  /**
   * Normaliza e valida e-mail Google
   */
  normalizeEmail: function(email) {
    if (!email || typeof email !== 'string') return '';
    const clean = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    if (!emailRegex.test(clean)) {
      throw new Error('E-mail informado possui formato inválido.');
    }
    return clean;
  },

  /**
   * Normaliza e valida RE do militar (apenas dígitos numéricos)
   */
  normalizeRE: function(re) {
    if (re === null || re === undefined) {
      throw new Error('RE não informado.');
    }
    const clean = String(re).replace(/\D/g, '');
    if (clean.length < 4 || clean.length > 8) {
      throw new Error(`RE inválido: '${re}'. Deve conter entre 4 e 8 dígitos.`);
    }
    return clean;
  },

  /**
   * Valida dígito verificador do RE se fornecido
   */
  normalizeDigitoRE: function(digito) {
    if (digito === null || digito === undefined || digito === '') return '';
    const clean = String(digito).trim().toUpperCase();
    if (clean.length > 2) {
      throw new Error('Dígito do RE inválido.');
    }
    return clean;
  },

  /**
   * Valida formato de competência YYYY-MM
   */
  validateCompetencia: function(comp) {
    if (!comp || typeof comp !== 'string') {
      throw new Error('Competência deve ser uma string no formato YYYY-MM.');
    }
    const match = comp.trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) {
      throw new Error(`Competência inválida: '${comp}'. Formato esperado: YYYY-MM.`);
    }
    return comp.trim();
  },

  /**
   * Valida data ISO (YYYY-MM-DD) e verifica se a data é real no calendário
   */
  validateIsoDate: function(dateStr, fieldName) {
    const name = fieldName || 'Data';
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`${name} é obrigatória no formato YYYY-MM-DD.`);
    }
    const trimmed = dateStr.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error(`${name} com formato inválido: '${dateStr}'. Esperado YYYY-MM-DD.`);
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed no JS
    const day = parseInt(match[3], 10);

    const d = new Date(year, month, day);
    if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      throw new Error(`${name} corresponde a uma data inexistente no calendário: '${dateStr}'.`);
    }

    return trimmed;
  },

  /**
   * Valida UUID v4
   */
  validateUuid: function(uuid, fieldName) {
    const name = fieldName || 'Identificador';
    if (!uuid || typeof uuid !== 'string') {
      throw new Error(`${name} inválido ou ausente.`);
    }
    const clean = uuid.trim();
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!regex.test(clean)) {
      throw new Error(`${name} não é um UUID válido.`);
    }
    return clean;
  },

  /**
   * Valida chave de idempotência anti-duplicidade
   */
  validateIdempotencyKey: function(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Chave de idempotência (idempotency_key) é obrigatória para esta operação.');
    }
    const clean = key.trim();
    if (clean.length < 10 || clean.length > 64) {
      throw new Error('Chave de idempotência com tamanho inválido.');
    }
    return clean;
  },

  /**
   * Assegura que um valor esteja dentro de um conjunto permitido (Enum)
   */
  assertIn: function(val, allowedValues, fieldName) {
    if (!allowedValues.includes(val)) {
      throw new Error(`Valor inválido para ${fieldName}: '${val}'. Permitidos: ${allowedValues.join(', ')}`);
    }
    return val;
  },

  /**
   * Gera UUID v4 nativo ou compatível com Apps Script
   */
  generateUuid: function() {
    if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
      return Utilities.getUuid();
    }
    // Fallback padrão RFC4122 para Node.js / Ambientes sem Utilities
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Sanitiza DTO de militar para retorno seguro no cliente (Princípio do Menor Privilégio e LGPD)
   * Oculta RE completo de outros militares, e-mails privados e observações médicas restritas.
   */
  sanitizeMilitaryDto: function(militar, isCurrentUserOrAdmin) {
    if (!militar) return null;
    return {
      militar_id: militar.militar_id,
      nome_guerra: militar.nome_guerra,
      graduacao: militar.graduacao,
      equipe: militar.equipe,
      ordem_antiguidade: Number(militar.ordem_antiguidade),
      ativo: Boolean(militar.ativo),
      // Dados funcionais exibidos apenas para o próprio militar ou para a administração:
      nome_completo: isCurrentUserOrAdmin ? militar.nome_completo : undefined,
      re: isCurrentUserOrAdmin ? militar.re : undefined,
      digito_re: isCurrentUserOrAdmin ? militar.digito_re : undefined,
      email_vinculado: isCurrentUserOrAdmin ? militar.email_vinculado : undefined,
      unidade: militar.unidade,
      prontidao: militar.prontidao
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ValidationService;
}
