const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Módulos do Sistema
const Config = require('../Config.js');
const ValidationService = require('../ValidationService.js');
const Repository = require('../Repository.js');
const AuditService = require('../AuditService.js');
const AuthService = require('../AuthService.js');
const MilitaryService = require('../MilitaryService.js');
const PeriodService = require('../PeriodService.js');
const ChoiceService = require('../ChoiceService.js');
const SwapService = require('../SwapService.js');
const AdminService = require('../AdminService.js');
const Code = require('../Code.js');

function createMockSpreadsheet() {
  const sheets = {};
  function createMockSheet(name) {
    const data = [];
    return {
      getName: () => name,
      getLastRow: () => data.length,
      getLastColumn: () => (data.length > 0 ? data[0].length : 0),
      setFrozenRows: () => {},
      appendRow: (rowValues) => { data.push([...rowValues]); },
      getRange: (startRow, startCol, numRows = 1, numCols = 1) => ({
        getValues: () => {
          const res = [];
          for (let r = 0; r < numRows; r++) {
            const rowIdx = startRow - 1 + r;
            const rowData = data[rowIdx] || [];
            const slice = [];
            for (let c = 0; c < numCols; c++) {
              const colIdx = startCol - 1 + c;
              slice.push(rowData[colIdx] !== undefined ? rowData[colIdx] : '');
            }
            res.push(slice);
          }
          return res;
        },
        setValues: (matrix) => {
          for (let r = 0; r < matrix.length; r++) {
            const rowIdx = startRow - 1 + r;
            while (data.length <= rowIdx) data.push([]);
            for (let c = 0; c < matrix[r].length; c++) {
              data[rowIdx][startCol - 1 + c] = matrix[r][c];
            }
          }
        },
        setValue: (val) => {
          const rowIdx = startRow - 1;
          const colIdx = startCol - 1;
          while (data.length <= rowIdx) data.push([]);
          data[rowIdx][colIdx] = val;
        }
      })
    };
  }

  return {
    getUrl: () => 'https://docs.google.com/spreadsheets/d/1lZ7YX6QnSZYES1_FziJczRPxbsu7DUdJdjd63zRj7CU/edit?gid=0#gid=0',
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = createMockSheet(name);
      return sheets[name];
    }
  };
}

test('Fase 3: Modernização de Arquitetura, Componentização, Cache e Criptografia', async (t) => {

  await t.test('3.1 Modularização do SPA em Componentes Separados', () => {
    const baseDir = path.join(__dirname, '..');
    
    // Verifica existência dos arquivos modulares
    const files = ['Index.html', 'ViewLogin.html', 'ViewDashboard.html', 'ViewAdmin.html', 'Modals.html', 'Styles.html', 'Scripts.html'];
    files.forEach(f => {
      assert.ok(fs.existsSync(path.join(baseDir, f)), `Arquivo modular ${f} deve existir.`);
    });

    const indexHtml = fs.readFileSync(path.join(baseDir, 'Index.html'), 'utf8');
    assert.match(indexHtml, /<\?!=\s*include\('ViewLogin'\);?\s*\?>/, 'Index.html deve incluir ViewLogin');
    assert.match(indexHtml, /<\?!=\s*include\('ViewDashboard'\);?\s*\?>/, 'Index.html deve incluir ViewDashboard');
    assert.match(indexHtml, /<\?!=\s*include\('ViewAdmin'\);?\s*\?>/, 'Index.html deve incluir ViewAdmin');
    assert.match(indexHtml, /<\?!=\s*include\('Modals'\);?\s*\?>/, 'Index.html deve incluir Modals');

    // Validação da resolução completa sem quebras
    let resolved = indexHtml;
    let limit = 10;
    while (/<\?!=\s*include\(['"]([^'"]+)['"]\);?\s*\?>/.test(resolved) && limit > 0) {
      resolved = resolved.replace(/<\?!=\s*include\(['"]([^'"]+)['"]\);?\s*\?>/g, (_, name) => {
        return fs.readFileSync(path.join(baseDir, name + '.html'), 'utf8');
      });
      limit--;
    }

    assert.ok(!resolved.includes('<?!='), 'Todo o template deve ser resolvido sem sobrar tags de include');
    assert.ok(resolved.includes('id="login-screen"'), 'Template final deve conter a tela de login');
    assert.ok(resolved.includes('id="tab-escolha"'), 'Template final deve conter a aba de escolha');
    assert.ok(resolved.includes('id="tab-admin"'), 'Template final deve conter a aba de admin');
    assert.ok(resolved.includes('id="modal-confirm-choice"'), 'Template final deve conter os modais');
  });

  await t.test('3.2 Cache de Leitura de Filas e Invalidação Atômica em Mutações', () => {
    const mockSs = createMockSpreadsheet();
    Repository.setSpreadsheetOverride(mockSs);
    Repository.initializeSchema();
    ChoiceService.setBypassWindowCheck(true);
    ChoiceService.clearAllCache();

    const adminCtx = { authenticated: true, email: 'admin.cbm@gmail.com', perfil: Config.ROLES.ADMIN };
    const p = PeriodService.createPeriod(adminCtx, { competencia: '2026-11', data_abertura: '2026-10-01', data_encerramento: '2026-11-30' });
    PeriodService.changeStatus(adminCtx, p.periodo_id, Config.PERIOD_STATUS.ABERTO);

    // Cadastra 2 militares na prontidão Verde
    Repository.insert(Config.SHEETS.MILITARES, {
      militar_id: 'mil-cache-1',
      re: '982635',
      digito_re: '0',
      nome_guerra: 'Dias',
      graduacao: '1º Sgt PM',
      unidade: '703152301 - EB SÃO ROQUE',
      situacao: 'EFETIVO',
      prontidao: 'Verde',
      ordem_antiguidade: 1,
      email_vinculado: 'dias@cbm.sp.gov.br',
      ativo: true
    });
    Repository.insert(Config.SHEETS.MILITARES, {
      militar_id: 'mil-cache-2',
      re: '982636',
      digito_re: '1',
      nome_guerra: 'Silva',
      graduacao: '2º Sgt PM',
      unidade: '703152301 - EB SÃO ROQUE',
      situacao: 'EFETIVO',
      prontidao: 'Verde',
      ordem_antiguidade: 2,
      email_vinculado: 'silva@cbm.sp.gov.br',
      ativo: true
    });

    // 1ª Leitura: Carrega no cache
    const q1 = ChoiceService.getTeamQueueStatus(p.periodo_id, 'Verde');
    assert.equal(q1.proximo_da_vez.militar_id, 'mil-cache-1');
    assert.equal(q1.total_resolvidos, 0);

    // 2ª Leitura: Deve vir do cache idêntico
    const q2 = ChoiceService.getTeamQueueStatus(p.periodo_id, 'Verde');
    assert.deepEqual(q1, q2);

    // Mutação: Militar 1 escolhe a data
    const d1 = ChoiceService.getEligibleDatesForTeam('2026-11', 'Verde')[0];
    const userCtx = { authenticated: true, email: 'dias@cbm.sp.gov.br', perfil: Config.ROLES.MILITAR, militarId: 'mil-cache-1', militar: { militar_id: 'mil-cache-1' } };
    ChoiceService.makeChoice(userCtx, p.periodo_id, 'mil-cache-1', d1, 'idemp-cache-1');

    // 3ª Leitura pós-mutação: Cache foi invalidado atômica e automaticamente!
    const q3 = ChoiceService.getTeamQueueStatus(p.periodo_id, 'Verde');
    assert.equal(q3.total_resolvidos, 1, 'Após escolha, status deve refletir 1 resolvido');
    assert.equal(q3.proximo_da_vez.militar_id, 'mil-cache-2', 'A vez deve ter avançado para o militar 2');
  });

  await t.test('3.3 Migração em Lote de Senhas Legadas para Hash SHA-256 (AdminService)', () => {
    const mockSs = createMockSpreadsheet();
    Repository.setSpreadsheetOverride(mockSs);
    Repository.initializeSchema();

    // Insere usuários com senhas em texto puro e um usuário já com hash SHA-256
    const plainRe1 = '982635';
    const plainRe2 = '108154';
    const alreadyHashedRe = '999999';
    const existingHash = AuthService.hashPassword('segredo_antigo');

    Repository.insert(Config.SHEETS.USUARIOS, {
      usuario_id: 'usr-1',
      militar_id: plainRe1,
      senha: 'minhasenha123',
      perfil: Config.ROLES.MILITAR,
      criado_em: new Date().toISOString()
    });
    Repository.insert(Config.SHEETS.USUARIOS, {
      usuario_id: 'usr-2',
      militar_id: plainRe2,
      senha: 'outrasenha456',
      perfil: Config.ROLES.ADMIN,
      criado_em: new Date().toISOString()
    });
    Repository.insert(Config.SHEETS.USUARIOS, {
      usuario_id: 'usr-3',
      militar_id: alreadyHashedRe,
      senha: existingHash,
      perfil: Config.ROLES.MILITAR,
      criado_em: new Date().toISOString()
    });

    const adminCtx = { authenticated: true, email: 'admin.cbm@gmail.com', perfil: Config.ROLES.ADMIN };
    
    // Executa migração em lote
    const res = AdminService.migratePasswordsToHash(adminCtx);
    assert.equal(res.success, true);
    assert.equal(res.totalMigrados, 2, 'Deve migrar exatamente 2 senhas em texto puro');
    assert.equal(res.totalJaHashed, 1, 'Deve identificar 1 senha que já estava em hash');

    // Verifica no repositório se foram devidamente convertidas para 64 caracteres
    const u1 = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', plainRe1);
    const u2 = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', plainRe2);
    const u3 = Repository.findOne(Config.SHEETS.USUARIOS, 'militar_id', alreadyHashedRe);

    assert.equal(u1.senha.length, 64, 'Senha 1 deve ter 64 caracteres hexadecimais');
    assert.equal(u2.senha.length, 64, 'Senha 2 deve ter 64 caracteres hexadecimais');
    assert.equal(u3.senha, existingHash, 'Senha que já era hash deve permanecer idêntica');

    // Valida que o login com a senha original funciona normalmente via verifyPassword
    assert.ok(AuthService.verifyPassword('minhasenha123', u1.senha), 'Login com senha original deve funcionar');
    assert.ok(AuthService.verifyPassword('outrasenha456', u2.senha), 'Login com senha original 2 deve funcionar');

    // Segunda execução da migração: deve acusar 0 pendentes
    const res2 = AdminService.migratePasswordsToHash(adminCtx);
    assert.equal(res2.totalMigrados, 0);
    assert.equal(res2.totalJaHashed, 3);
  });

  await t.test('3.4 Estilos e Recursos Oficiais de Impressão e PDF (@media print)', () => {
    const stylesPath = path.join(__dirname, '..', 'Styles.html');
    const stylesContent = fs.readFileSync(stylesPath, 'utf8');

    assert.ok(stylesContent.includes('@media print'), 'Styles.html deve conter diretiva @media print');
    assert.ok(stylesContent.includes('A4 landscape'), 'Impressão deve estar configurada para A4 landscape');
    assert.ok(stylesContent.includes('SISFOLGAS - POLÍCIA MILITAR DO ESTADO DE SÃO PAULO'), 'Rodapé oficial militar deve estar presente');
    assert.ok(stylesContent.includes('page-break-inside: avoid'), 'Tabela deve evitar quebras de página em linhas');
    assert.ok(stylesContent.includes('#dev-user-bar'), 'Barra de dev e menus devem ser ocultados na impressão');

    // Verifica botões de impressão em ViewDashboard.html
    const dashboardPath = path.join(__dirname, '..', 'ViewDashboard.html');
    const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
    assert.ok(dashboardContent.includes('btn-print-escala'), 'ViewDashboard deve ter o botão btn-print-escala');
    assert.ok(dashboardContent.includes('btn-print-militares'), 'ViewDashboard deve ter o botão btn-print-militares');
  });

});
