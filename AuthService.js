/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * AuthService.js - Autenticação delegada Google, RBAC e controle estrito de sessão
 */

const AuthService = (function() {
  let _emailOverride = null; // Para suíte de testes
  let _sessionReOverride = null; // Para sessões por RE

  return {
    /**
     * Permite injeção de e-mail mockado em testes automatizados
     */
    setEmailOverride: function(email) {
      _emailOverride = email;
    },

    /**
     * Permite injeção de sessão por RE
     */
    setSessionReOverride: function(re) {
      _sessionReOverride = re;
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
     * Resolve o contexto completo do usuário por RE
     */
    getUserContextByRe: function(re) {
      if (!re) return null;
      let cleanRe = '';
      try {
        cleanRe = ValidationService.normalizeRE(re);
      } catch (e) {
        cleanRe = String(re).trim();
      }

      const isAdminLogin = (cleanRe.toLowerCase() === 'admin');

      let user = null;
      if (isAdminLogin) {
        user = Repository.findOne(Config.SHEETS.USUARIOS, 'perfil', Config.ROLES.ADMIN);
      } else {
        user = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', cleanRe);
      }

      let militar = MilitaryService.getByRE(cleanRe) || MilitaryService.getById(cleanRe);

      if (!user && militar) {
        user = {
          usuario_id: ValidationService.generateUuid(),
          email_google: militar.email_vinculado || `${cleanRe}@sisfolgas.local`,
          militar_id: cleanRe,
          senha: cleanRe, // default senha é o próprio RE
          perfil: Config.ROLES.MILITAR,
          ativo: true,
          criado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString()
        };
        Repository.insert(Config.SHEETS.USUARIOS, user);
      }

      if (!user) {
        return {
          authenticated: false,
          user: null,
          militar: null,
          perfil: null,
          permissions: [],
          error: `Militar com RE '${cleanRe}' não possui cadastro ativo.`
        };
      }

      const permissions = Config.ROLE_PERMISSIONS[user.perfil] || [];

      return {
        authenticated: true,
        email: user.email_google || `${cleanRe}@sisfolgas.local`,
        sessionRe: cleanRe,
        isOwner: user.perfil === Config.ROLES.ADMIN,
        usuario_id: user.usuario_id,
        perfil: user.perfil,
        permissions: permissions,
        militar: militar,
        error: null
      };
    },

    /**
     * Login por Usuário (RE) e Senha
     */
    loginWithCredentials: function(re, senha) {
      if (!re) throw new Error('Informe o RE (usuário) para entrar.');
      if (senha === null || senha === undefined || String(senha).trim() === '') {
        throw new Error('Informe a senha para entrar.');
      }

      let cleanRe = '';
      try {
        cleanRe = ValidationService.normalizeRE(re);
      } catch (e) {
        cleanRe = String(re).trim();
      }

      const isAdminLogin = (cleanRe.toLowerCase() === 'admin');

      let user = null;
      if (isAdminLogin) {
        user = Repository.findOne(Config.SHEETS.USUARIOS, 'perfil', Config.ROLES.ADMIN);
      } else {
        user = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', cleanRe);
      }

      let militar = MilitaryService.getByRE(cleanRe) || MilitaryService.getById(cleanRe);

      if (!user) {
        if (militar) {
          user = {
            usuario_id: ValidationService.generateUuid(),
            email_google: militar.email_vinculado || `${cleanRe}@sisfolgas.local`,
            militar_id: cleanRe,
            senha: cleanRe, // Senha default = RE
            perfil: Config.ROLES.MILITAR,
            ativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          };
          Repository.insert(Config.SHEETS.USUARIOS, user);
        } else if (!isAdminLogin) {
          throw new Error(`Militar com RE '${cleanRe}' não foi localizado no efetivo cadastrado.`);
        }
      }

      const expectedSenha = (user && user.senha) ? String(user.senha) : (isAdminLogin ? 'admin' : cleanRe);
      const inputSenha = String(senha).trim();

      if (inputSenha !== expectedSenha) {
        throw new Error('Senha incorreta. A senha padrão inicial é o seu próprio RE.');
      }

      AuditService.log({
        userEmail: user ? user.email_google : `${cleanRe}@sisfolgas.local`,
        militarId: cleanRe,
        acao: 'LOGIN_SUCESSO',
        entidade: 'USUARIOS',
        registroId: user ? user.usuario_id : cleanRe,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Login realizado com sucesso via RE e Senha pelo militar ${cleanRe}`
      });

      return {
        success: true,
        authenticated: true,
        sessionRe: cleanRe,
        user: {
          email: user ? user.email_google : `${cleanRe}@sisfolgas.local`,
          perfil: user ? user.perfil : Config.ROLES.MILITAR,
          permissions: Config.ROLE_PERMISSIONS[user ? user.perfil : Config.ROLES.MILITAR] || [],
          militar: militar ? ValidationService.sanitizeMilitaryDto(militar, true) : null,
          isOwner: user ? (user.perfil === Config.ROLES.ADMIN) : false
        },
        militar: militar ? ValidationService.sanitizeMilitaryDto(militar, true) : null,
        mensagem: `Acesso realizado com sucesso! Bem-vindo(a), ${militar ? (militar.graduacao + ' ' + militar.nome_guerra) : 'Administrador'}.`
      };
    },

    /**
     * Alteração de Senha do Militar (CRUD de Senha)
     */
    changePassword: function(re, senhaAtual, novaSenha, confirmaSenha) {
      if (!re) throw new Error('RE não identificado.');
      if (!senhaAtual) throw new Error('Informe a sua senha atual.');
      if (!novaSenha) throw new Error('Informe a nova senha desejada.');
      if (String(novaSenha).trim().length < 3) throw new Error('A nova senha deve ter no mínimo 3 caracteres.');
      if (String(novaSenha).trim() !== String(confirmaSenha).trim()) {
        throw new Error('A confirmação da nova senha não confere.');
      }

      let cleanRe = '';
      try {
        cleanRe = ValidationService.normalizeRE(re);
      } catch (e) {
        cleanRe = String(re).trim();
      }

      const isAdminLogin = (cleanRe.toLowerCase() === 'admin');
      let user = isAdminLogin 
        ? Repository.findOne(Config.SHEETS.USUARIOS, 'perfil', Config.ROLES.ADMIN)
        : Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', cleanRe);

      if (!user) {
        const militar = MilitaryService.getByRE(cleanRe) || MilitaryService.getById(cleanRe);
        if (militar) {
          user = {
            usuario_id: ValidationService.generateUuid(),
            email_google: militar.email_vinculado || `${cleanRe}@sisfolgas.local`,
            militar_id: cleanRe,
            senha: cleanRe,
            perfil: Config.ROLES.MILITAR,
            ativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          };
          Repository.insert(Config.SHEETS.USUARIOS, user);
        } else {
          throw new Error('Usuário não localizado para alteração de senha.');
        }
      }

      const expectedSenha = user.senha ? String(user.senha) : (isAdminLogin ? 'admin' : cleanRe);
      if (String(senhaAtual).trim() !== expectedSenha) {
        throw new Error('A senha atual informada está incorreta.');
      }

      Repository.updateById(Config.SHEETS.USUARIOS, 'usuario_id', user.usuario_id, {
        senha: String(novaSenha).trim(),
        atualizado_em: new Date().toISOString()
      });

      AuditService.log({
        userEmail: user.email_google || `${cleanRe}@sisfolgas.local`,
        militarId: cleanRe,
        acao: 'ALTERACAO_SENHA',
        entidade: 'USUARIOS',
        registroId: user.usuario_id,
        resultado: Config.AUDIT_RESULT.SUCESSO,
        justificativa: `Senha alterada pelo militar RE ${cleanRe}`
      });

      return {
        success: true,
        mensagem: 'Senha alterada com sucesso! Utilize sua nova senha nos próximos acessos.'
      };
    },

    /**
     * Resolve o contexto completo do usuário autenticado a partir do banco de dados
     */
    getUserContext: function(optionalIdentifier) {
      if (_sessionReOverride) {
        const reCtx = this.getUserContextByRe(_sessionReOverride);
        if (reCtx && reCtx.authenticated) return reCtx;
      }

      if (optionalIdentifier && !String(optionalIdentifier).includes('@')) {
        const reCtx = this.getUserContextByRe(optionalIdentifier);
        if (reCtx && reCtx.authenticated) return reCtx;
      }

      const email = (optionalIdentifier && String(optionalIdentifier).includes('@')) 
        ? ValidationService.normalizeEmail(optionalIdentifier) 
        : this.getAuthenticatedEmail();

      if (!email) {
        return {
          authenticated: false,
          user: null,
          militar: null,
          perfil: null,
          permissions: [],
          error: 'Sessão não identificada. Realize o login informando seu RE e senha.'
        };
      }

      // 0. Detecta se o e-mail corresponde ao dono da planilha ou criador do script
      let isOwner = false;
      try {
        if (typeof SpreadsheetApp !== 'undefined') {
          const ss = SpreadsheetApp.getActiveSpreadsheet();
          if (ss && ss.getOwner && ss.getOwner().getEmail()) {
            const ownerEmail = ValidationService.normalizeEmail(ss.getOwner().getEmail());
            if (ownerEmail && ownerEmail.toLowerCase() === email.toLowerCase()) {
              isOwner = true;
            }
          }
        }
      } catch (e) {}

      try {
        if (!isOwner && typeof Session !== 'undefined' && Session.getEffectiveUser && Session.getEffectiveUser().getEmail()) {
          const effEmail = ValidationService.normalizeEmail(Session.getEffectiveUser().getEmail());
          if (effEmail && effEmail.toLowerCase() === email.toLowerCase()) {
            isOwner = true;
          }
        }
      } catch (e) {}

      // 1. Busca cadastro na aba USUARIOS
      const users = Repository.find(Config.SHEETS.USUARIOS, function(u) {
        return u.email_google && u.email_google.toLowerCase() === email.toLowerCase() && u.ativo === true;
      });

      let user = users.length > 0 ? users[0] : null;

      // Se for o Dono da Planilha, ele é AUTOMATICAMENTE o ADMINISTRADOR do sistema!
      if (isOwner) {
        if (!user) {
          user = {
            usuario_id: ValidationService.generateUuid(),
            email_google: email,
            militar_id: '',
            perfil: Config.ROLES.ADMIN,
            ativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          };
          Repository.insert(Config.SHEETS.USUARIOS, user);
        } else if (user.perfil !== Config.ROLES.ADMIN) {
          user = Repository.updateById(Config.SHEETS.USUARIOS, 'usuario_id', user.usuario_id, {
            perfil: Config.ROLES.ADMIN,
            atualizado_em: new Date().toISOString()
          });
        }
      }

      // 2. Se não existir na aba USUARIOS, busca na aba MILITARES pelo e-mail vinculado cadastrado pelo Admin
      if (!user) {
        const militares = Repository.find(Config.SHEETS.MILITARES, function(m) {
          return m.email_vinculado && m.email_vinculado.toLowerCase() === email.toLowerCase() && m.ativo === true;
        });

        if (militares.length > 0) {
          const militar = militares[0];
          // Auto-onboarding seguro: cria registro do usuário com perfil MILITAR
          // REGRA: O ID deve ser sempre o RE coluna B da aba militares (ou militar_id se já preenchido)
          const targetMilitarId = militar.militar_id || militar.re;
          user = {
            usuario_id: ValidationService.generateUuid(),
            email_google: email,
            militar_id: targetMilitarId,
            perfil: Config.ROLES.MILITAR,
            ativo: true,
            criado_em: new Date().toISOString(),
            atualizado_em: new Date().toISOString()
          };
          Repository.insert(Config.SHEETS.USUARIOS, user);

          AuditService.log({
            userEmail: email,
            militarId: targetMilitarId,
            acao: 'AUTO_ONBOARDING_USUARIO',
            entidade: 'USUARIOS',
            registroId: user.usuario_id,
            resultado: Config.AUDIT_RESULT.SUCESSO,
            justificativa: 'Primeiro acesso de militar autorizado com e-mail vinculado'
          });
        }
      }

      // Se o usuário não foi autorizado pelo administrador nem é o dono da planilha
      if (!user) {
        AuditService.logSecurityEvent('UNREGISTERED_ACCESS_ATTEMPT', { email: email }, email);
        return {
          authenticated: false,
          email: email,
          isOwner: isOwner,
          user: null,
          militar: null,
          perfil: null,
          permissions: [],
          error: `O e-mail '${email}' não possui cadastro ativo no sistema. Procure o Administrador.`
        };
      }

      // 3. Resolve os dados funcionais do militar associado (suporta busca por RE ou militar_id)
      let militar = null;
      if (user.militar_id) {
        militar = Repository.findOne(Config.SHEETS.MILITARES, 're', user.militar_id) ||
                  Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', user.militar_id);
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

      // Se for perfil MILITAR, deve coincidir com seu próprio militar_id ou RE
      const mId = context.militar ? String(context.militar.militar_id) : '';
      const mRe = context.militar ? String(context.militar.re || '') : '';
      const targetStr = String(targetMilitarId);
      if (!context.militar || (mId !== targetStr && mRe !== targetStr)) {
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
