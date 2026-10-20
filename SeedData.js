/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * SeedData.js - Carga inicial de dados fictícios para homologação segura (Em conformidade com a LGPD)
 */

const SeedData = (function() {
  const MOCK_MILITARES = [
    // Prontidão Verde (7 militares com antiguidade geral intercalada)
    { re: '10101', digito_re: '1', nome_completo: 'Carlos Eduardo Silva', nome_guerra: 'C. Silva', graduacao: '1º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 2, email_vinculado: 'csilva.teste@gmail.com' },
    { re: '10102', digito_re: '2', nome_completo: 'Marcos Antonio Oliveira', nome_guerra: 'Oliveira', graduacao: '2º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 5, email_vinculado: 'oliveira.teste@gmail.com' },
    { re: '10103', digito_re: '3', nome_completo: 'Bruno Henrique Costa', nome_guerra: 'Costa', graduacao: '3º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 8, email_vinculado: 'costa.teste@gmail.com' },
    { re: '10104', digito_re: '4', nome_completo: 'Diego Alves Pereira', nome_guerra: 'Diego', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 11, email_vinculado: 'diego.teste@gmail.com' },
    { re: '10105', digito_re: '5', nome_completo: 'Eduardo Martins Rocha', nome_guerra: 'Rocha', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 13, email_vinculado: 'rocha.teste@gmail.com' },
    { re: '10106', digito_re: '6', nome_completo: 'Fabio Lucas Santos', nome_guerra: 'Lucas', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 16, email_vinculado: 'lucas.teste@gmail.com' },
    { re: '10107', digito_re: '7', nome_completo: 'Gabriel Souza Lima', nome_guerra: 'Souza Lima', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Verde', equipe: 'Verde', ordem_antiguidade: 19, email_vinculado: 'souza.teste@gmail.com' },

    // Prontidão Amarela (7 militares com antiguidade geral intercalada)
    { re: '20201', digito_re: '1', nome_completo: 'Henrique Cesar Ribeiro', nome_guerra: 'Ribeiro', graduacao: 'SubTen PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 1, email_vinculado: 'ribeiro.teste@gmail.com' },
    { re: '20202', digito_re: '2', nome_completo: 'Igor Matheus Carvalho', nome_guerra: 'Carvalho', graduacao: '1º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 4, email_vinculado: 'carvalho.teste@gmail.com' },
    { re: '20203', digito_re: '3', nome_completo: 'Joao Paulo Barbosa', nome_guerra: 'Barbosa', graduacao: '2º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 6, email_vinculado: 'barbosa.teste@gmail.com' },
    { re: '20204', digito_re: '4', nome_completo: 'Lucas Fernandes Vieira', nome_guerra: 'Vieira', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 10, email_vinculado: 'vieira.teste@gmail.com' },
    { re: '20205', digito_re: '5', nome_completo: 'Mateus Ramos Dias', nome_guerra: 'M. Ramos', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 14, email_vinculado: 'mramos.teste@gmail.com' },
    { re: '20206', digito_re: '6', nome_completo: 'Nicolas Castro Cardoso', nome_guerra: 'Castro', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 17, email_vinculado: 'castro.teste@gmail.com' },
    { re: '20207', digito_re: '7', nome_completo: 'Otavio Barros Nogueira', nome_guerra: 'Nogueira', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Amarela', equipe: 'Amarela', ordem_antiguidade: 20, email_vinculado: 'nogueira.teste@gmail.com' },

    // Prontidão Azul (7 militares com antiguidade geral intercalada)
    { re: '30301', digito_re: '1', nome_completo: 'Paulo Roberto Freitas', nome_guerra: 'Freitas', graduacao: '1º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 3, email_vinculado: 'freitas.teste@gmail.com' },
    { re: '30302', digito_re: '2', nome_completo: 'Rafael Duarte Mendes', nome_guerra: 'Duarte', graduacao: '2º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 7, email_vinculado: 'duarte.teste@gmail.com' },
    { re: '30303', digito_re: '3', nome_completo: 'Sergio Augusto Pires', nome_guerra: 'Pires', graduacao: '3º Sgt PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 9, email_vinculado: 'pires.teste@gmail.com' },
    { re: '30304', digito_re: '4', nome_completo: 'Thiago Farias Guimaraes', nome_guerra: 'Farias', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 12, email_vinculado: 'farias.teste@gmail.com' },
    { re: '30305', digito_re: '5', nome_completo: 'Vinicius Monteiro Lopes', nome_guerra: 'Monteiro', graduacao: 'Cb PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 15, email_vinculado: 'monteiro.teste@gmail.com' },
    { re: '30306', digito_re: '6', nome_completo: 'Wagner Teixeira Neves', nome_guerra: 'Teixeira', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 18, email_vinculado: 'teixeira.teste@gmail.com' },
    { re: '30307', digito_re: '7', nome_completo: 'Yuri Goncalves Ramos', nome_guerra: 'Yuri', graduacao: 'Sd PM', unidade: '1º SGB', situacao: 'ATIVO', prontidao: 'Azul', equipe: 'Azul', ordem_antiguidade: 21, email_vinculado: 'yuri.teste@gmail.com' }
  ];

  return {
    /**
     * Carrega os 21 militares fictícios e 1 administrador padrão na planilha de teste
     */
    populateTestData: function(adminEmail) {
      const now = new Date().toISOString();

      // Detecta automaticamente o dono da planilha ou usuário ativo
      let targetAdmin = adminEmail;
      if (!targetAdmin || targetAdmin === 'admin.cbm@gmail.com') {
        try {
          if (typeof SpreadsheetApp !== 'undefined') {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            if (ss && ss.getOwner && ss.getOwner().getEmail()) {
              targetAdmin = ss.getOwner().getEmail();
            }
          }
        } catch (e) {}
        try {
          if (!targetAdmin && typeof Session !== 'undefined' && Session.getActiveUser && Session.getActiveUser().getEmail()) {
            targetAdmin = Session.getActiveUser().getEmail();
          }
        } catch (e) {}
        if (!targetAdmin) targetAdmin = 'admin.cbm@gmail.com';
      }

      // 1. Cadastra Administrador (Dono da planilha)
      const existingAdmin = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', targetAdmin);
      if (!existingAdmin) {
        Repository.insert(Config.SHEETS.USUARIOS, {
          usuario_id: ValidationService.generateUuid(),
          email_google: targetAdmin,
          militar_id: '',
          senha: 'admin',
          perfil: Config.ROLES.ADMIN,
          ativo: true,
          criado_em: now,
          atualizado_em: now
        });
      }

      // 2. Cadastra os 21 militares fictícios (REGRA: o ID deve sempre ser o RE coluna B)
      let inserted = 0;
      MOCK_MILITARES.forEach(mock => {
        const cleanRe = String(mock.re);
        const existing = Repository.findOne(Config.SHEETS.MILITARES, 're', cleanRe) ||
                         Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', cleanRe);
        if (!existing) {
          Repository.insert(Config.SHEETS.MILITARES, {
            militar_id: cleanRe, // Coluna A = RE
            re: cleanRe,         // Coluna B = RE
            digito_re: mock.digito_re,
            nome_completo: mock.nome_completo,
            nome_guerra: mock.nome_guerra,
            graduacao: mock.graduacao,
            unidade: mock.unidade || '1º SGB',
            situacao: mock.situacao || 'ATIVO',
            prontidao: mock.prontidao,
            equipe: mock.equipe || mock.prontidao,
            ordem_antiguidade: mock.ordem_antiguidade,
            email_vinculado: mock.email_vinculado,
            ativo: true,
            criado_em: now,
            atualizado_em: now
          });
          inserted++;
        }

        // Garante que o usuário em USUARIOS existe com senha padrão = RE
        const userFound = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', cleanRe);
        if (!userFound) {
          Repository.insert(Config.SHEETS.USUARIOS, {
            usuario_id: ValidationService.generateUuid(),
            email_google: mock.email_vinculado || `${cleanRe}@sisfolgas.local`,
            militar_id: cleanRe,
            senha: cleanRe, // Senha padrão = RE
            perfil: Config.ROLES.MILITAR,
            ativo: true,
            criado_em: now,
            atualizado_em: now
          });
        }
      });

      // 3. Cadastra o Período Ativo Padrão NOV26 (se não houver nenhum cadastrado)
      let periodoCriado = null;
      const periodosExistentes = Repository.getAll(Config.SHEETS.PERIODOS);
      const temAberto = periodosExistentes.some(p => p.status === Config.PERIOD_STATUS.ABERTO);
      if (!temAberto) {
        periodoCriado = {
          periodo_id: ValidationService.generateUuid(),
          competencia: 'NOV26',
          data_abertura: '2026-11-01',
          data_encerramento: '2026-11-30',
          status: Config.PERIOD_STATUS.ABERTO,
          regras_json: JSON.stringify({ escala: '24x48', janela: '01-16' }),
          criado_por: targetAdmin,
          criado_em: now,
          atualizado_em: now
        };
        Repository.insert(Config.SHEETS.PERIODOS, periodoCriado);
      }

      return {
        success: true,
        adminCriado: targetAdmin,
        militaresInseridos: inserted,
        totalMockMilitares: MOCK_MILITARES.length,
        periodoAtivo: temAberto ? 'Existente' : 'NOV26 criado e ABERTO'
      };
    }
  };
})();

/**
 * Função executável diretamente pelo menu do Apps Script
 */
function executarCargaMilitaresTeste() {
  Logger.log('Iniciando carga de 21 bombeiros militares de teste...');
  const res = SeedData.populateTestData();
  Logger.log('Resultado: ' + JSON.stringify(res));
  Logger.log('✅ 21 militares cadastrados com sucesso nas 3 equipes!');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeedData;
}
