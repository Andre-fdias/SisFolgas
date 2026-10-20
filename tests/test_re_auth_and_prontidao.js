const test = require('node:test');
const assert = require('node:assert/strict');

const Config = require('../Config.js');
const ValidationService = require('../ValidationService.js');
const Repository = require('../Repository.js');
const AuditService = require('../AuditService.js');
const AuthService = require('../AuthService.js');
const MilitaryService = require('../MilitaryService.js');
const PeriodService = require('../PeriodService.js');
const ChoiceService = require('../ChoiceService.js');
const SeedData = require('../SeedData.js');
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
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      sheets[name] = createMockSheet(name);
      return sheets[name];
    }
  };
}

test('Verificação das Regras Específicas: RE/Senha Padrão, CRUD de Senha e Colunas G, H, I, J', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);
  SeedData.populateTestData('admin.cbm@gmail.com');

  await t.test('1. Autenticação padrão por RE: usuário = RE e senha = RE por default', () => {
    // 1º Sgt C. Silva tem RE 10101
    const res = AuthService.loginWithCredentials('10101', '10101');
    assert.equal(res.success, true);
    assert.equal(res.militar.nome_guerra, 'C. Silva');
    assert.equal(res.militar.re, '10101');
    assert.equal(res.militar.prontidao, 'Verde');
    assert.equal(res.militar.unidade, '1º SGB');
    assert.equal(res.militar.situacao, 'ATIVO');
  });

  await t.test('2. Senha incorreta é rejeitada', () => {
    assert.throws(
      () => AuthService.loginWithCredentials('10101', 'senha_errada'),
      /Senha incorreta/
    );
  });

  await t.test('3. CRUD de alteração de senha: caso queira, usuário altera senha', () => {
    // Altera senha do militar 10101
    const resAlt = AuthService.changePassword('10101', '10101', 'bombeiro2026', 'bombeiro2026');
    assert.equal(resAlt.success, true);

    // Agora o login com a senha antiga falha
    assert.throws(
      () => AuthService.loginWithCredentials('10101', '10101'),
      /Senha incorreta/
    );

    // E o login com a nova senha tem sucesso
    const resNew = AuthService.loginWithCredentials('10101', 'bombeiro2026');
    assert.equal(resNew.success, true);
    assert.equal(resNew.militar.nome_guerra, 'C. Silva');
  });

  await t.test('4. Colunas da Planilha na aba MILITARES: H=situacao, I=prontidao, J=ordem_antiguidade, G=unidade', () => {
    const headers = Config.SCHEMAS.MILITARES;
    // Col G (index 6): unidade
    assert.equal(headers[6], 'unidade');
    // Col H (index 7): situacao
    assert.equal(headers[7], 'situacao');
    // Col I (index 8): prontidao
    assert.equal(headers[8], 'prontidao');
    // Col J (index 9): ordem_antiguidade
    assert.equal(headers[9], 'ordem_antiguidade');
  });

  await t.test('5. Lista de antiguidade geral (1 a 21) e filtragem Col G (unidade) e Col I (prontidao)', () => {
    // Todos os militares ativos
    const all = MilitaryService.getAllActive();
    assert.equal(all.length, 21);

    // Verifica que a lista respeita estritamente a ordem de antiguidade geral do 1º ao 21º
    for (let i = 0; i < all.length; i++) {
      assert.equal(Number(all[i].ordem_antiguidade), i + 1);
    }

    // Filtrando por Unidade: '1º SGB' e Prontidão: 'Verde'
    const militaresVerde1SGB = MilitaryService.getAllActive('1º SGB', 'Verde');
    assert.equal(militaresVerde1SGB.length, 7);
    // Cada militar deve pertencer ao 1º SGB e à Prontidão Verde
    militaresVerde1SGB.forEach(m => {
      assert.equal(m.unidade, '1º SGB');
      assert.equal(m.prontidao, 'Verde');
    });

    // Ordem por unidade e prontidão respeita a ordem de antiguidade geral
    assert.equal(militaresVerde1SGB[0].nome_guerra, 'C. Silva'); // 2º geral
    assert.equal(militaresVerde1SGB[1].nome_guerra, 'Oliveira'); // 5º geral
    assert.equal(militaresVerde1SGB[2].nome_guerra, 'Costa');    // 8º geral

    // Filtrando Prontidão Amarela
    const militaresAmarela = MilitaryService.getAllActive('1º SGB', 'Amarela');
    assert.equal(militaresAmarela.length, 7);
    assert.equal(militaresAmarela[0].nome_guerra, 'Ribeiro'); // 1º geral (1º da prontidão amarela)
    assert.equal(militaresAmarela[0].ordem_antiguidade, 1);

    // Filtrando Prontidão Azul
    const militaresAzul = MilitaryService.getAllActive('1º SGB', 'Azul');
    assert.equal(militaresAzul.length, 7);
    assert.equal(militaresAzul[0].nome_guerra, 'Freitas'); // 3º geral (1º da prontidão azul)
    assert.equal(militaresAzul[0].ordem_antiguidade, 3);
  });

  await t.test('6. API RPC apiLogin e apiAlterarSenha via Code.js', () => {
    const resRpcLogin = Code.apiLogin({ re: '20201', senha: '20201' });
    assert.equal(resRpcLogin.success, true);
    assert.equal(resRpcLogin.data.militar.nome_guerra, 'Ribeiro');

    const resRpcAlt = Code.apiAlterarSenha({
      re: '20201',
      senhaAtual: '20201',
      novaSenha: 'tenente2026',
      confirmaSenha: 'tenente2026'
    });
    assert.equal(resRpcAlt.success, true);

    const resRpcLoginNew = Code.apiLogin({ re: '20201', senha: 'tenente2026' });
    assert.equal(resRpcLoginNew.success, true);
  });
});
