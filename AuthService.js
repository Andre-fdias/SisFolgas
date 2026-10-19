/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * AuthService.js - Autenticação delegada Google, RBAC e controle estrito de sessão
 */

const AuthService = (function() {
  let _emailOverride = null; // Para suíte de testes

  return {
    /**
     * Permite injeção de e-mail mockado em testes automatizados
     */
    setEmailOverride: function(email) {
      _emailOverride = email;
    },

    /**
     * Obtém o e-mail autenticado com segurança da sessão Google Apps Script
     */
    getAuthenticatedEmail: function() {
      if (_emailOverride !== null) {
        return _emailOverride ? ValidationService.normalizeEmail(_emailOverride) : '';
      }
      if (typeof Session !== 'undefined' && Session.getActiveUser) {
        const user = Session.getActiveUser();
        if (user && user.getEmail) {
          const email = user.getEmail();
          return email ? ValidationService.normalizeEmail(email) : '';
        }
      }
      return '';
    },

    /**
     * Resolve o contexto completo do usuário autenticado a partir do banco de dados
     */
    getUserContext: function(optionalEmail) {
      const email = optionalEmail ? ValidationService.normalizeEmail(optionalEmail) : this.getAuthenticatedEmail();

      if (!email) {
        return {
          authenticated: false,
          user: null,
          militar: null,
          perfil: null,
          permissions: [],
          error: 'Sessão não identificada. É obrigatório estar conectado a uma conta Google autorizada.'
        };
      }

      // 1. Busca cadastro na aba USUARIOS
      const users = Repository.find(Config.SHEETS.USUARIOS, function(u) {
        return u.email_google && u.email_google.toLowerCase() === email.toLowerCase() && u.ativo === true;
      });

      let user = users.length > 0 ? users[0] : null;

      // 2. Se não existir na aba USUARIOS, busca na aba MILITARES pelo e-mail vinculado cadastrado pelo Admin
      if (!user) {
        const militares = Repository.find(Config.SHEETS.MILITARES, function(m) {
          return m.email_vinculado && m.email_vinculado.toLowerCase() === email.toLowerCase() && m.ativo === true;
        });

        if (militares.length > 0) {
          const militar = militares[0];
          // Auto-onboarding seguro: cria registro do usuário com perfil MILITAR
          user = {
            usuario_id: ValidationService.generateUuid(),
            email_google: email,
            militar_id: militar.militar_id,
            perfil: Config.ROLES.MILITAR,
            ativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          };
          Repository.insert(Config.SHEETS.USUARIOS, user);

          AuditService.log({
            userEmail: email,
            militarId: militar.militar_id,
            acao: 'AUTO_ONBOARDING_USUARIO',
            entidade: 'USUARIOS',
            registroId: user.usuario_id,
            resultado: Config.AUDIT_RESULT.SUCESSO,
            justificativa: 'Primeiro acesso de militar autorizado com e-mail vinculado'
          });
        }
      }

      // Se o usuário não foi autorizado pelo administrador
      if (!user) {
        AuditService.logSecurityEvent('UNREGISTERED_ACCESS_ATTEMPT', { email: email }, email);
        return {
          authenticated: false,
          user: null,
          militar: null,
          perfil: null,
          permissions: [],
          error: `O e-mail '${email}' não possui cadastro ativo no sistema. Procure o Administrador.`
        };
      }

      // 3. Resolve os dados funcionais do militar associado
      let militar = null;
      if (user.militar_id) {
        militar = Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', user.militar_id);
      }

      const permissions = Config.ROLE_PERMISSIONS[user.perfil] || [];

      return {
        authenticated: true,
        email: email,
        usuario_id: user.usuario_id,
        perfil: user.perfil,
        permissions: permissions,
        militar: militar,
        error: null
      };
    },

    /**
     * Valida obrigatoriedade de autenticação
     */
    requireAuthentication: function(context) {
      if (!context || !context.authenticated) {
        throw new Error(context ? context.error : 'Usuário não autenticado.');
      }
    },

    /**
     * Valida se o usuário autenticado possui um dos perfis exigidos
     */
    requireRole: function(context, allowedRoles, opId) {
      this.requireAuthentication(context);
      if (!allowedRoles.includes(context.perfil)) {
        AuditService.logSecurityEvent('PERFIL_INSUFICIENTE', {
          usuario: context.email,
          perfilAtual: context.perfil,
          perfisExigidos: allowedRoles
        }, context.email, opId);
        throw new Error('Acesso negado: Perfil de acesso insuficiente para esta operação.');
      }
    },

    /**
     * Valida se o usuário possui permissão específica
     */
    requirePermission: function(context, permission, opId) {
      this.requireAuthentication(context);
      if (!context.permissions.includes(permission)) {
        AuditService.logSecurityEvent('PERMISSAO_NEGADA', {
          usuario: context.email,
          permissaoExigida: permission
        }, context.email, opId);
        throw new Error(`Acesso negado: Permissão '${permission}' ausente.`);
      }
    },

    /**
     * Garante que um militar só possa atuar em nome de si mesmo
     * Administradores e Gestores autorizados possuem prerrogativas administrativas controladas
     */
    assertCanActOnMilitary: function(context, targetMilitarId, opId) {
      this.requireAuthentication(context);

      if (context.perfil === Config.ROLES.ADMIN) {
        return true; // Administrador pode intervir administrativamente
      }

      if (context.perfil === Config.ROLES.GESTOR) {
        return true; // Gestor pode registrar afastamento ou passagem justificada
      }

      // Se for perfil MILITAR, deve coincidir exatamente com seu próprio militar_id
      if (!context.militar || String(context.militar.militar_id) !== String(targetMilitarId)) {
        AuditService.logSecurityEvent('IMPERSONATION_ATTEMPT', {
          usuarioTentativa: context.email,
          militarAutenticadoId: context.militar ? context.militar.militar_id : null,
          militarAlvoId: targetMilitarId
        }, context.email, opId);
        throw new Error('Violação de segurança: Não é permitido realizar operações em nome de outro militar.');
      }

      return true;
    }
  };
})();

/**
 * Função executável de topo para execução direta no editor do Google Apps Script
 */
function executarVerificacaoSessao() {
  Logger.log('=== VERIFICAÇÃO DE SESSÃO E IDENTIDADE GOOGLE ===');
  const email = (typeof Session !== 'undefined' && Session.getActiveUser) ? Session.getActiveUser().getEmail() : 'local';
  Logger.log('E-mail do usuário ativo no Google: ' + email);
  return email;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthService;
  module.exports.executarVerificacaoSessao = executarVerificacaoSessao;
}
