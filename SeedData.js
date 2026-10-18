/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * SeedData.js - Carga inicial de dados fictícios para homologação segura (Em conformidade com a LGPD)
 */

const SeedData = (function() {
  const MOCK_MILITARES = [
    // Equipe A (7 militares)
    { re: '10101', digito_re: '1', nome_completo: 'Carlos Eduardo Silva', nome_guerra: 'C. Silva', graduacao: '1º Sgt PM', equipe: 'Equipe A', ordem_antiguidade: 1, email_vinculado: 'csilva.teste@gmail.com' },
    { re: '10102', digito_re: '2', nome_completo: 'Marcos Antonio Oliveira', nome_guerra: 'Oliveira', graduacao: '2º Sgt PM', equipe: 'Equipe A', ordem_antiguidade: 2, email_vinculado: 'oliveira.teste@gmail.com' },
    { re: '10103', digito_re: '3', nome_completo: 'Bruno Henrique Costa', nome_guerra: 'Costa', graduacao: '3º Sgt PM', equipe: 'Equipe A', ordem_antiguidade: 3, email_vinculado: 'costa.teste@gmail.com' },
    { re: '10104', digito_re: '4', nome_completo: 'Diego Alves Pereira', nome_guerra: 'Diego', graduacao: 'Cb PM', equipe: 'Equipe A', ordem_antiguidade: 4, email_vinculado: 'diego.teste@gmail.com' },
    { re: '10105', digito_re: '5', nome_completo: 'Eduardo Martins Rocha', nome_guerra: 'Rocha', graduacao: 'Cb PM', equipe: 'Equipe A', ordem_antiguidade: 5, email_vinculado: 'rocha.teste@gmail.com' },
    { re: '10106', digito_re: '6', nome_completo: 'Fabio Lucas Santos', nome_guerra: 'Lucas', graduacao: 'Sd PM', equipe: 'Equipe A', ordem_antiguidade: 6, email_vinculado: 'lucas.teste@gmail.com' },
    { re: '10107', digito_re: '7', nome_completo: 'Gabriel Souza Lima', nome_guerra: 'Souza Lima', graduacao: 'Sd PM', equipe: 'Equipe A', ordem_antiguidade: 7, email_vinculado: 'souza.teste@gmail.com' },

    // Equipe B (7 militares)
    { re: '20201', digito_re: '1', nome_completo: 'Henrique Cesar Ribeiro', nome_guerra: 'Ribeiro', graduacao: 'SubTen PM', equipe: 'Equipe B', ordem_antiguidade: 1, email_vinculado: 'ribeiro.teste@gmail.com' },
    { re: '20202', digito_re: '2', nome_completo: 'Igor Matheus Carvalho', nome_guerra: 'Carvalho', graduacao: '1º Sgt PM', equipe: 'Equipe B', ordem_antiguidade: 2, email_vinculado: 'carvalho.teste@gmail.com' },
    { re: '20203', digito_re: '3', nome_completo: 'Joao Paulo Barbosa', nome_guerra: 'Barbosa', graduacao: '2º Sgt PM', equipe: 'Equipe B', ordem_antiguidade: 3, email_vinculado: 'barbosa.teste@gmail.com' },
    { re: '20204', digito_re: '4', nome_completo: 'Lucas Fernandes Vieira', nome_guerra: 'Vieira', graduacao: 'Cb PM', equipe: 'Equipe B', ordem_antiguidade: 4, email_vinculado: 'vieira.teste@gmail.com' },
    { re: '20205', digito_re: '5', nome_completo: 'Mateus Ramos Dias', nome_guerra: 'M. Ramos', graduacao: 'Cb PM', equipe: 'Equipe B', ordem_antiguidade: 5, email_vinculado: 'mramos.teste@gmail.com' },
    { re: '20206', digito_re: '6', nome_completo: 'Nicolas Castro Cardoso', nome_guerra: 'Castro', graduacao: 'Sd PM', equipe: 'Equipe B', ordem_antiguidade: 6, email_vinculado: 'castro.teste@gmail.com' },
    { re: '20207', digito_re: '7', nome_completo: 'Otavio Barros Nogueira', nome_guerra: 'Nogueira', graduacao: 'Sd PM', equipe: 'Equipe B', ordem_antiguidade: 7, email_vinculado: 'nogueira.teste@gmail.com' },

    // Equipe C (7 militares)
    { re: '30301', digito_re: '1', nome_completo: 'Paulo Roberto Freitas', nome_guerra: 'Freitas', graduacao: '1º Sgt PM', equipe: 'Equipe C', ordem_antiguidade: 1, email_vinculado: 'freitas.teste@gmail.com' },
    { re: '30302', digito_re: '2', nome_completo: 'Rafael Duarte Mendes', nome_guerra: 'Duarte', graduacao: '2º Sgt PM', equipe: 'Equipe C', ordem_antiguidade: 2, email_vinculado: 'duarte.teste@gmail.com' },
    { re: '30303', digito_re: '3', nome_completo: 'Sergio Augusto Pires', nome_guerra: 'Pires', graduacao: '3º Sgt PM', equipe: 'Equipe C', ordem_antiguidade: 3, email_vinculado: 'pires.teste@gmail.com' },
    { re: '30304', digito_re: '4', nome_completo: 'Thiago Farias Guimaraes', nome_guerra: 'Farias', graduacao: 'Cb PM', equipe: 'Equipe C', ordem_antiguidade: 4, email_vinculado: 'farias.teste@gmail.com' },
    { re: '30305', digito_re: '5', nome_completo: 'Vinicius Monteiro Lopes', nome_guerra: 'Monteiro', graduacao: 'Cb PM', equipe: 'Equipe C', ordem_antiguidade: 5, email_vinculado: 'monteiro.teste@gmail.com' },
    { re: '30306', digito_re: '6', nome_completo: 'Wagner Teixeira Neves', nome_guerra: 'Teixeira', graduacao: 'Sd PM', equipe: 'Equipe C', ordem_antiguidade: 6, email_vinculado: 'teixeira.teste@gmail.com' },
    { re: '30307', digito_re: '7', nome_completo: 'Yuri Goncalves Ramos', nome_guerra: 'Yuri', graduacao: 'Sd PM', equipe: 'Equipe C', ordem_antiguidade: 7, email_vinculado: 'yuri.teste@gmail.com' }
  ];

  return {
    /**
     * Carrega os 21 militares fictícios e 1 administrador padrão na planilha de teste
     */
    populateTestData: function(adminEmail = 'admin.cbm@gmail.com') {
      const now = new Date().toISOString();

      // 1. Cadastra Administrador
      const existingAdmin = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', adminEmail);
      if (!existingAdmin) {
        Repository.insert(Config.SHEETS.USUARIOS, {
          usuario_id: ValidationService.generateUuid(),
          email_google: adminEmail,
          militar_id: '',
          perfil: Config.ROLES.ADMIN,
          ativo: true,
          criado_em: now,
          atualizado_em: now
        });
      }

      // 2. Cadastra os 21 militares fictícios
      let inserted = 0;
      MOCK_MILITARES.forEach(mock => {
        const existing = Repository.findOne(Config.SHEETS.MILITARES, 're', mock.re);
        if (!existing) {
          Repository.insert(Config.SHEETS.MILITARES, {
            militar_id: ValidationService.generateUuid(),
            re: mock.re,
            digito_re: mock.digito_re,
            nome_completo: mock.nome_completo,
            nome_guerra: mock.nome_guerra,
            graduacao: mock.graduacao,
            unidade: '1º Pelotão Bombeiros',
            prontidao: 'Ativa',
            equipe: mock.equipe,
            ordem_antiguidade: mock.ordem_antiguidade,
            email_vinculado: mock.email_vinculado,
            ativo: true,
            criado_em: now,
            atualizado_em: now
          });
          inserted++;
        }
      });

      return {
        success: true,
        adminCriado: adminEmail,
        militaresInseridos: inserted,
        totalMockMilitares: MOCK_MILITARES.length
      };
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SeedData;
}
