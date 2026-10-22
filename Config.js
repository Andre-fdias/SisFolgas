/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Config.js - Centralização de configurações, esquemas, perfis e constantes
 */

const Config = {
  APP_NAME: 'SisFolgas- São Roque',
  APP_VERSION: '1.0.0',
  SCHEMA_VERSION: '1.0.0',

  // Nomes padronizados das abas no Google Sheets
  SHEETS: {
    MILITARES: 'MILITARES',
    USUARIOS: 'USUARIOS',
    PERIODOS: 'PERIODOS',
    ESCOLHAS: 'ESCOLHAS',
    CREDITOS: 'CREDITOS',
    PERMUTAS: 'PERMUTAS',
    AFASTAMENTOS: 'AFASTAMENTOS',
    AUDITORIA: 'AUDITORIA',
    CONFIGURACOES: 'CONFIGURACOES'
  },

  // Esquema detalhado de cabeçalhos das 9 abas
  SCHEMAS: {
    MILITARES: [
      'militar_id',        // Col A (1)
      're',                // Col B (2)
      'digito_re',         // Col C (3)
      'nome_completo',     // Col D (4)
      'nome_guerra',       // Col E (5)
      'graduacao',         // Col F (6)
      'unidade',           // Col G (7)
      'situacao',          // Col H (8) - Situação funcional (Ativo, Férias, etc.)
      'prontidao',         // Col I (9) - Prontidão de serviço (Verde, Amarela, Azul)
      'ordem_antiguidade', // Col J (10) - Ordem geral de antiguidade
      'email_vinculado',   // Col K (11)
      'ativo',             // Col L (12)
      'criado_em',         // Col M (13)
      'atualizado_em'      // Col N (14)
    ],
    USUARIOS: [
      'usuario_id',
      'email_google',
      'militar_id',
      'senha',
      'perfil',
      'ativo',
      'criado_em',
      'atualizado_em'
    ],
    PERIODOS: [
      'periodo_id',
      'competencia',
      'data_abertura',
      'data_encerramento',
      'status',
      'regras_json',
      'criado_por',
      'criado_em',
      'atualizado_em'
    ],
    ESCOLHAS: [
      'escolha_id',
      'periodo_id',
      'militar_id',
      'data_folga',
      'equipe',
      'ordem_no_momento',
      'status',
      'justificativa_cancelamento',
      'idempotency_key',
      'criado_em',
      'criado_por',
      'atualizado_em'
    ],
    CREDITOS: [
      'credito_id',
      'militar_id',
      'periodo_origem',
      'motivo',
      'quantidade',
      'status',
      'escolha_relacionada_id',
      'criado_em',
      'criado_por',
      'utilizado_em'
    ],
    PERMUTAS: [
      'permuta_id',
      'militar_origem_id',
      'militar_destino_id',
      'escolha_origem_id',
      'escolha_destino_id',
      'data_solicitacao',
      'status',
      'aprovado_por',
      'data_conclusao',
      'justificativa'
    ],
    AFASTAMENTOS: [
      'afastamento_id',
      'militar_id',
      'data_inicio',
      'data_fim',
      'tipo_operacional',
      'status',
      'observacao_administrativa',
      'criado_por',
      'criado_em'
    ],
    AUDITORIA: [
      'auditoria_id',
      'data_hora',
      'usuario_autenticado_email',
      'militar_relacionado_id',
      'acao',
      'entidade',
      'registro_id',
      'resultado',
      'justificativa',
      'dados_anteriores',
      'dados_posteriores',
      'correlacao_operacao_id'
    ],
    CONFIGURACOES: [
      'chave',
      'valor',
      'descricao',
      'tipo',
      'atualizado_em',
      'atualizado_por'
    ]
  },

  // Perfis de acesso do sistema (RBAC)
  ROLES: {
    ADMIN: 'ADMIN',
    GESTOR: 'GESTOR',
    MILITAR: 'MILITAR'
  },

  // Catálogo formal de permissões
  PERMISSIONS: {
    // Administrativas
    MANAGE_MILITARY: 'MANAGE_MILITARY',
    MANAGE_USERS: 'MANAGE_USERS',
    MANAGE_PERIODS: 'MANAGE_PERIODS',
    MANAGE_SETTINGS: 'MANAGE_SETTINGS',
    VIEW_AUDIT_LOGS: 'VIEW_AUDIT_LOGS',
    RUN_BACKUP: 'RUN_BACKUP',
    RUN_DIAGNOSTICS: 'RUN_DIAGNOSTICS',
    ADMIN_OVERRIDE_CHOICE: 'ADMIN_OVERRIDE_CHOICE',

    // Operacionais do Gestor
    VIEW_TEAM_QUEUE: 'VIEW_TEAM_QUEUE',
    PASS_TURN: 'PASS_TURN',
    MANAGE_LEAVES: 'MANAGE_LEAVES',
    APPROVE_SWAPS: 'APPROVE_SWAPS',
    VIEW_REPORTS: 'VIEW_REPORTS',

    // Ações do Militar
    VIEW_OWN_PROFILE: 'VIEW_OWN_PROFILE',
    VIEW_ELIGIBLE_DATES: 'VIEW_ELIGIBLE_DATES',
    MAKE_CHOICE: 'MAKE_CHOICE',
    REQUEST_SWAP: 'REQUEST_SWAP',
    VIEW_OWN_HISTORY: 'VIEW_OWN_HISTORY'
  },

  // Mapeamento de permissões por perfil
  ROLE_PERMISSIONS: {
    ADMIN: [
      'MANAGE_MILITARY',
      'MANAGE_USERS',
      'MANAGE_PERIODS',
      'MANAGE_SETTINGS',
      'VIEW_AUDIT_LOGS',
      'RUN_BACKUP',
      'RUN_DIAGNOSTICS',
      'ADMIN_OVERRIDE_CHOICE',
      'VIEW_TEAM_QUEUE',
      'PASS_TURN',
      'MANAGE_LEAVES',
      'APPROVE_SWAPS',
      'VIEW_REPORTS',
      'VIEW_OWN_PROFILE',
      'VIEW_ELIGIBLE_DATES',
      'MAKE_CHOICE',
      'REQUEST_SWAP',
      'VIEW_OWN_HISTORY'
    ],
    GESTOR: [
      'VIEW_TEAM_QUEUE',
      'PASS_TURN',
      'MANAGE_LEAVES',
      'APPROVE_SWAPS',
      'VIEW_REPORTS',
      'VIEW_OWN_PROFILE',
      'VIEW_ELIGIBLE_DATES',
      'MAKE_CHOICE',
      'REQUEST_SWAP',
      'VIEW_OWN_HISTORY'
    ],
    MILITAR: [
      'VIEW_OWN_PROFILE',
      'VIEW_TEAM_QUEUE',
      'VIEW_ELIGIBLE_DATES',
      'MAKE_CHOICE',
      'REQUEST_SWAP',
      'VIEW_OWN_HISTORY'
    ]
  },

  // Estados dos Períodos de Escolha
  PERIOD_STATUS: {
    RASCUNHO: 'RASCUNHO',
    ABERTO: 'ABERTO',
    PAUSADO: 'PAUSADO',
    ENCERRADO: 'ENCERRADO',
    CANCELADO: 'CANCELADO'
  },

  // Estados das Escolhas
  CHOICE_STATUS: {
    ATIVA: 'ATIVA',
    CANCELADA: 'CANCELADA',
    SUBSTITUIDA: 'SUBSTITUIDA',
    PENDENTE_VALIDACAO: 'PENDENTE_VALIDACAO' // Para solicitações que exigem aprovação do Admin (ex: Acúmulo)
  },

  // Motivos regulamentares em que o militar NÃO FAZ JUS à folga
  NAO_FAZ_JUS_MOTIVOS: {
    FERIAS: 'Férias Regulamentares',
    LICENCA_PREMIO: 'Licença-Prêmio',
    CONVALESCENCA: 'Convalescença',
    LTS: 'Licença para Tratamento de Saúde (LTS)'
  },

  // Estados dos Créditos
  CREDIT_STATUS: {
    DISPONIVEL: 'DISPONIVEL',
    UTILIZADO: 'UTILIZADO',
    EXPIRADO: 'EXPIRADO',
    CANCELADO: 'CANCELADO'
  },

  // Estados das Permutas
  SWAP_STATUS: {
    PENDENTE: 'PENDENTE',
    APROVADA: 'APROVADA',
    RECUSADA: 'RECUSADA',
    CANCELADA: 'CANCELADA'
  },

  // Estados de Afastamento
  LEAVE_STATUS: {
    ATIVO: 'ATIVO',
    CANCELADO: 'CANCELADO'
  },

  // Resultados de Auditoria
  AUDIT_RESULT: {
    SUCESSO: 'SUCESSO',
    FALHA_AUTORIZACAO: 'FALHA_AUTORIZACAO',
    FALHA_CONCORRENCIA: 'FALHA_CONCORRENCIA',
    FALHA_VALIDACAO: 'FALHA_VALIDACAO',
    ERRO_SISTEMA: 'ERRO_SISTEMA'
  },

  // Padrões operacionais regulamentares
  DEFAULTS: {
    LOCK_TIMEOUT_MS: 10000, // 10 segundos de espera máxima para lock
    CHOICE_WINDOW_HOURS: 24, // Janela recomendada de tempo por militar
    MAX_CHOICES_PER_PERIOD: 1, // 1 folga por competência
    SCALE_TYPE: '24x48',
    TEAMS: ['Verde', 'Amarela', 'Azul'],
    PRONTIDOES: ['Verde', 'Amarela', 'Azul'],
    LEGACY_TEAMS: ['Equipe A', 'Equipe B', 'Equipe C'],
    // Janela regulamentar mensal de escolhas e trocas:
    CHOICE_WINDOW_START_DAY: 1,  // Início no dia 01
    CHOICE_WINDOW_END_DAY: 16    // Fim no dia 16. Do dia 17 em diante, o sistema bloqueia edição!
  }
};

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarExibirConfiguracoes() {
  Logger.log('=== CONFIGURAÇÕES DO SISTEMA SISFOLGAS ===');
  Logger.log('App: ' + Config.APP.NAME + ' v' + Config.APP.VERSION);
  Logger.log('Equipes: ' + Config.DEFAULTS.TEAMS.join(', '));
  Logger.log('Escala: ' + Config.DEFAULTS.SCALE_TYPE);
  Logger.log('Janela de escolha: dias ' + Config.DEFAULTS.CHOICE_WINDOW_START_DAY + ' a ' + Config.DEFAULTS.CHOICE_WINDOW_END_DAY);
  return Config.APP;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
  module.exports.executarExibirConfiguracoes = executarExibirConfiguracoes;
}
