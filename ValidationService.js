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
   * Valida e normaliza competência para o padrão ISO (YYYY-MM).
   * Aceita tanto o formato militar corporativo (NOV26, DEZ26, JAN27) quanto ISO (2026-11).
   */
  validateCompetencia: function(comp) {
    if (!comp || typeof comp !== 'string') {
      throw new Error('Competência deve ser informada (ex: NOV26 ou 2026-11).');
    }
    const clean = comp.trim().toUpperCase().replace('/', '');
    const milMatch = clean.match(/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)[-]?(\d{2})$/);
    if (milMatch) {
      const months = {
        'JAN': '01', 'FEV': '02', 'MAR': '03', 'ABR': '04',
        'MAI': '05', 'JUN': '06', 'JUL': '07', 'AGO': '08',
        'SET': '09', 'OUT': '10', 'NOV': '11', 'DEZ': '12'
      };
      const monthStr = months[milMatch[1]];
      const yearStr = '20' + milMatch[2];
      return `${yearStr}-${monthStr}`;
    }
    const match = clean.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (!match) {
      throw new Error(`Competência inválida: '${comp}'. Formato esperado: NOV26 ou YYYY-MM.`);
    }
    return clean;
  },

  /**
   * Formata competência para o padrão oficial militar (ex: 2026-11 -> NOV26, 2027-01 -> JAN27)
   */
  formatCompetencia: function(comp) {
    if (!comp || typeof comp !== 'string') return '--';
    const clean = comp.trim().toUpperCase().replace('/', '');
    const milMatch = clean.match(/^(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(\d{2})$/);
    if (milMatch) return clean;

    const isoMatch = clean.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
    if (isoMatch) {
      const months = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
      const monthIdx = parseInt(isoMatch[2], 10) - 1;
      const yearShort = isoMatch[1].slice(-2);
      return `${months[monthIdx]}${yearShort}`;
    }
    return comp;
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
   * Valida Identificador Geral (UUID v4 ou RE militar)
   * REGRA OBRIGATÓRIA: O ID militar deve ser sempre o RE (coluna B da aba militares)
   */
  validateId: function(id, fieldName) {
    const name = fieldName || 'Identificador';
    if (!id || (typeof id !== 'string' && typeof id !== 'number')) {
      throw new Error(`${name} inválido ou ausente.`);
    }
    const clean = String(id).trim();
    if (!clean) {
      throw new Error(`${name} não pode ser vazio.`);
    }
    return clean;
  },

  /**
   * Valida UUID v4 ou RE militar
   */
  validateUuid: function(uuid, fieldName) {
    const name = fieldName || 'Identificador';
    if (!uuid || (typeof uuid !== 'string' && typeof uuid !== 'number')) {
      throw new Error(`${name} inválido ou ausente.`);
    }
    const clean = String(uuid).trim();
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    // Aceita UUID ou RE/ID alfanumérico seguro (conforme regra do RE como ID)
    if (regex.test(clean) || /^[a-zA-Z0-9_\-\.]{1,36}$/.test(clean)) {
      return clean;
    }
    throw new Error(`${name} não é um identificador válido: '${uuid}'.`);
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
    if (fieldName === 'Equipe' || fieldName === 'Prontidão') {
      const allowed = ['Verde', 'Amarela', 'Azul', 'Equipe A', 'Equipe B', 'Equipe C'];
      if (!allowed.includes(val)) {
        throw new Error(`Valor inválido para ${fieldName}: '${val}'. Permitidos: ${allowed.join(', ')}`);
      }
      return val;
    }
    if (!allowedValues.includes(val)) {
      throw new Error(`Valor inválido para ${fieldName}: '${val}'. Permitidos: ${allowedValues.join(', ')}`);
    }
    return val;
  },

  /**
   * Normaliza o nome da prontidão / equipe
   */
  normalizeProntidao: function(p) {
    if (!p) return 'Verde';
    const clean = String(p).trim();
    if (clean.toLowerCase().includes('verde') || clean.toUpperCase() === 'EQUIPE A') return 'Verde';
    if (clean.toLowerCase().includes('amarel') || clean.toUpperCase() === 'EQUIPE B') return 'Amarela';
    if (clean.toLowerCase().includes('azul') || clean.toUpperCase() === 'EQUIPE C') return 'Azul';
    return clean;
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
   * Normaliza os campos do militar contra legados da planilha (Col H situação e Col I prontidão)
   */
  normalizeMilitary: function(m) {
    if (!m) return m;
    let situacao = m.situacao;
    let prontidao = m.prontidao;
    let equipe = m.equipe;

    // Detecta se prontidao contém status funcional (ex: "Ativa", "Ativo", "Férias", "Licença", etc.)
    const valPront = String(prontidao || '').trim().toLowerCase();
    const isSituacaoVal = ['ativ', 'feria', 'féria', 'licen', 'lts', 'afast', 'inativ'].some(s => valPront.includes(s));
    
    if (isSituacaoVal) {
      if (!situacao) situacao = prontidao;
      prontidao = equipe; // A verdadeira prontidão de serviço estava no campo equipe (Col I)
    }

    // Normaliza a prontidão para Verde, Amarela ou Azul
    const normPront = this.normalizeProntidao(prontidao || equipe || 'Verde');

    // Determina situação funcional
    const valSit = String(situacao || '').trim().toUpperCase();
    m.situacao = (valSit && valSit !== 'UNDEFINED') ? valSit : (m.ativo !== false ? 'ATIVO' : 'INATIVO');

    m.prontidao = normPront;
    m.equipe = normPront;

    // Garante unidade limpa
    m.unidade = (m.unidade && String(m.unidade).trim()) || '1º SGB';

    // Garante ordem_antiguidade numérica
    m.ordem_antiguidade = (m.ordem_antiguidade !== undefined && m.ordem_antiguidade !== null && m.ordem_antiguidade !== '')
      ? Number(m.ordem_antiguidade)
      : 999;

    // Trata ativo como booleano (default true a menos que explicitamente inativado)
    if (m.ativo === false || m.ativo === 'FALSE' || m.ativo === 'NÃO' || m.ativo === 'NAO') {
      m.ativo = false;
    } else {
      m.ativo = true;
    }

    return m;
  },

  /**
   * Sanitiza DTO de militar para retorno seguro no cliente (Princípio do Menor Privilégio e LGPD)
   * Oculta RE completo de outros militares, e-mails privados e observações médicas restritas.
   */
  sanitizeMilitaryDto: function(militar, isCurrentUserOrAdmin) {
    if (!militar) return null;
    this.normalizeMilitary(militar);
    return {
      militar_id: militar.militar_id,
      nome_guerra: militar.nome_guerra,
      graduacao: militar.graduacao,
      equipe: militar.prontidao,
      prontidao: militar.prontidao,
      situacao: militar.situacao,
      unidade: militar.unidade,
      ordem_antiguidade: Number(militar.ordem_antiguidade) || 999,
      ativo: Boolean(militar.ativo),
      // Dados funcionais exibidos apenas para o próprio militar ou para a administração:
      nome_completo: isCurrentUserOrAdmin ? militar.nome_completo : undefined,
      re: isCurrentUserOrAdmin ? militar.re : undefined,
      digito_re: isCurrentUserOrAdmin ? militar.digito_re : undefined,
      email_vinculado: isCurrentUserOrAdmin ? militar.email_vinculado : undefined
    };
  }
};

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarTestesValidacao() {
  Logger.log('=== TESTES DE VALIDAÇÃO E SANITIZAÇÃO ===');
  const safeStr = ValidationService.sanitizeString('<script>alert("teste")</script>Bombeiro');
  Logger.log('Sanitização anti-XSS testada: ' + safeStr);
  const uuid = ValidationService.generateUuid();
  Logger.log('UUID gerado com sucesso: ' + uuid);
  return { safeStr: safeStr, uuid: uuid };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ValidationService;
  module.exports.executarTestesValidacao = executarTestesValidacao;
}
