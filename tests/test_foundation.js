/**
 * SUÍTE DE TESTES AUTOMATIZADOS - FASE 2: FUNDAÇÃO SEGURA
 * Executado via Node.js test runner nativo: node --test tests/test_foundation.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const Config = require('../Config.js');
const ValidationService = require('../ValidationService.js');
const Repository = require('../Repository.js');
const AuditService = require('../AuditService.js');
const AuthService = require('../AuthService.js');

// Simula o escopo global nativo do Google Apps Script (V8)
global.Config = Config;
global.ValidationService = ValidationService;
global.Repository = Repository;
global.AuditService = AuditService;
global.AuthService = AuthService;

/**
 * Mock robusto de Planilha Google (SpreadsheetApp / Sheet / Range) para testes locais
 */
function createMockSpreadsheet() {
  const sheets = {};

  function createMockSheet(name) {
    const data = []; // Matriz bidimensional de linhas e colunas
    let frozenRows = 0;

    return {
      getName: () => name,
      getLastRow: () => data.length,
      getLastColumn: () => (data.length > 0 ? data[0].length : 0),
      setFrozenRows: (rows) => { frozenRows = rows; },
      appendRow: (rowValues) => {
        data.push([...rowValues]);
      },
      getRange: (startRow, startCol, numRows = 1, numCols = 1) => {
        return {
          getValues: () => {
            const result = [];
            for (let r = 0; r < numRows; r++) {
              const rowIdx = startRow - 1 + r;
              const rowData = data[rowIdx] || [];
              const rowSlice = [];
              for (let c = 0; c < numCols; c++) {
                const colIdx = startCol - 1 + c;
                rowSlice.push(rowData[colIdx] !== undefined ? rowData[colIdx] : '');
              }
              result.push(rowSlice);
            }
            return result;
          },
          setValues: (valuesMatrix) => {
            for (let r = 0; r < valuesMatrix.length; r++) {
              const rowIdx = startRow - 1 + r;
              while (data.length <= rowIdx) {
                data.push([]);
              }
              for (let c = 0; c < valuesMatrix[r].length; c++) {
                const colIdx = startCol - 1 + c;
                data[rowIdx][colIdx] = valuesMatrix[r][c];
              }
            }
          },
          setValue: (val) => {
            const rowIdx = startRow - 1;
            const colIdx = startCol - 1;
            while (data.length <= rowIdx) {
              data.push([]);
            }
            data[rowIdx][colIdx] = val;
          }
        };
      },
      _getData: () => data
    };
  }

  return {
    getSheetByName: (name) => sheets[name] || null,
    insertSheet: (name) => {
      if (sheets[name]) throw new Error(`Aba '${name}' já existe.`);
      sheets[name] = createMockSheet(name);
      return sheets[name];
    },
    _getAllSheets: () => sheets
  };
}

test('1. ValidationService - Sanitização, Tipos e DTOs', async (t) => {
  await t.test('Sanitização anti-XSS deve escapar caracteres perigosos', () => {
    const malicious = '<script>alert("XSS")</script>&foo=\'bar\'';
    const sanitized = ValidationService.sanitizeString(malicious);
    assert.ok(!sanitized.includes('<script>'));
    assert.ok(sanitized.includes('&lt;script&gt;'));
    assert.ok(sanitized.includes('&amp;foo=&#x27;bar&#x27;'));
  });

  await t.test('Normalização de RE deve aceitar apenas formato válido', () => {
    assert.equal(ValidationService.normalizeRE('12345'), '12345');
    assert.equal(ValidationService.normalizeRE('RE 123.456-7'), '1234567');
    assert.throws(() => ValidationService.normalizeRE('12'), /deve conter entre 4 e 8 dígitos/i);
    assert.throws(() => ValidationService.normalizeRE('1234567890'), /deve conter entre 4 e 8 dígitos/i);
  });

  await t.test('Validação de datas no calendário real (incluindo bissextos)', () => {
    assert.equal(ValidationService.validateIsoDate('2026-11-15', 'Data de Folga'), '2026-11-15');
    // 2026 não é ano bissexto -> 29 de fevereiro é inexistente
    assert.throws(() => ValidationService.validateIsoDate('2026-02-29', 'Data'), /data inexistente no calendário/);
    // 31 de abril é inexistente (abril tem 30 dias)
    assert.throws(() => ValidationService.validateIsoDate('2026-04-31', 'Data'), /data inexistente no calendário/);
  });

  await t.test('Sanitização de DTO militar oculta RE e e-mail para outros militares (LGPD)', () => {
    const militar = {
      militar_id: 'm-1',
      re: '123456',
      digito_re: '7',
      nome_completo: 'Carlos Silva Souza',
      nome_guerra: 'C. Silva',
      graduacao: 'Cb PM',
      unidade: '1º Pelotão',
      prontidao: 'Ativa',
      equipe: 'Equipe A',
      ordem_antiguidade: 1,
      email_vinculado: 'carlos.silva@gmail.com',
      ativo: true
    };

    // Consulta por outro militar (isCurrentUserOrAdmin = false)
    const dtoOutroMilitar = ValidationService.sanitizeMilitaryDto(militar, false);
    assert.equal(dtoOutroMilitar.nome_guerra, 'C. Silva');
    assert.equal(dtoOutroMilitar.graduacao, 'Cb PM');
    assert.equal(dtoOutroMilitar.re, undefined, 'RE não deve ser exposto a outros militares');
    assert.equal(dtoOutroMilitar.email_vinculado, undefined, 'E-mail não deve ser exposto a outros militares');

    // Consulta pelo próprio militar ou administrador (isCurrentUserOrAdmin = true)
    const dtoProprio = ValidationService.sanitizeMilitaryDto(militar, true);
    assert.equal(dtoProprio.re, '123456');
    assert.equal(dtoProprio.email_vinculado, 'carlos.silva@gmail.com');
  });
});

test('2. Repository - Inicialização não-destrutiva de esquema e CRUD', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);

  await t.test('initializeSchema deve criar as 9 abas com cabeçalhos exatos', () => {
    const report = Repository.initializeSchema(mockSs);
    assert.equal(report.createdSheets.length, 9);
    Object.keys(Config.SCHEMAS).forEach(sheetName => {
      const sheet = mockSs.getSheetByName(sheetName);
      assert.ok(sheet !== null, `Aba ${sheetName} deve existir`);
      const headers = sheet.getRange(1, 1, 1, Config.SCHEMAS[sheetName].length).getValues()[0];
      assert.deepEqual(headers, Config.SCHEMAS[sheetName]);
    });
  });

  await t.test('initializeSchema repetido NÃO deve apagar dados pré-existentes (Idempotência)', () => {
    // Insere dado de teste na aba MILITARES
    Repository.insert(Config.SHEETS.MILITARES, {
      militar_id: 'm-test-1',
      re: '99999',
      nome_guerra: 'Militar Teste',
      equipe: 'Equipe A',
      ordem_antiguidade: 1,
      email_vinculado: 'teste@gmail.com',
      ativo: true
    });

    const report2 = Repository.initializeSchema(mockSs);
    assert.equal(report2.createdSheets.length, 0, 'Nenhuma aba deve ser recriada');
    assert.equal(report2.verifiedSheets.length, 9);

    // Verifica se o militar continua presente
    const militares = Repository.getAll(Config.SHEETS.MILITARES);
    assert.equal(militares.length, 1);
    assert.equal(militares[0].re, '99999');
  });

  await t.test('CRUD: inserção, consulta e atualização parcial funcionam', () => {
    const updated = Repository.updateById(Config.SHEETS.MILITARES, 'militar_id', 'm-test-1', {
      nome_guerra: 'Militar Atualizado'
    });
    assert.equal(updated.nome_guerra, 'Militar Atualizado');

    const found = Repository.findOne(Config.SHEETS.MILITARES, 'militar_id', 'm-test-1');
    assert.equal(found.nome_guerra, 'Militar Atualizado');
  });
});

test('3. AuditService - Registro Imutável e Resiliência', async () => {
  const opId = ValidationService.generateUuid();
  const auditId = AuditService.log({
    userEmail: 'admin@bombeiros.gov.br',
    militarId: 'm-123',
    acao: 'TESTE_AUDITORIA',
    entidade: 'SISTEMA',
    registroId: 'reg-1',
    resultado: Config.AUDIT_RESULT.SUCESSO,
    justificativa: 'Teste automatizado de trilha',
    opId: opId
  });

  assert.ok(auditId !== null);
  const logs = Repository.getAll(Config.SHEETS.AUDITORIA);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].usuario_autenticado_email, 'admin@bombeiros.gov.br');
  assert.equal(logs[0].correlacao_operacao_id, opId);
});

test('4. AuthService - Identidade Google, RBAC e Anti-Impersonação', async (t) => {
  const mockSs = createMockSpreadsheet();
  Repository.setSpreadsheetOverride(mockSs);
  Repository.initializeSchema(mockSs);

  // 1. Cadastra militar autorizado com e-mail vinculado
  Repository.insert(Config.SHEETS.MILITARES, {
    militar_id: 'mil-sd-alves',
    re: '154321',
    nome_guerra: 'Alves',
    graduacao: 'Sd PM',
    equipe: 'Equipe A',
    ordem_antiguidade: 2,
    email_vinculado: 'alves.bombeiro@gmail.com',
    ativo: true
  });

  // 2. Cadastra Administrador na tabela USUARIOS
  Repository.insert(Config.SHEETS.USUARIOS, {
    usuario_id: 'usr-admin-1',
    email_google: 'admin.cbm@gmail.com',
    militar_id: '',
    perfil: Config.ROLES.ADMIN,
    ativo: true
  });

  await t.test('Sessão sem e-mail deve ser rejeitada como não autenticada', () => {
    AuthService.setEmailOverride('');
    const ctx = AuthService.getUserContext();
    assert.equal(ctx.authenticated, false);
    assert.throws(() => AuthService.requireAuthentication(ctx), /Sessão não identificada/);
  });

  await t.test('E-mail desconhecido é barrado e gera log de segurança', () => {
    AuthService.setEmailOverride('hacker.estranho@gmail.com');
    const ctx = AuthService.getUserContext();
    assert.equal(ctx.authenticated, false);
    assert.ok(ctx.error.includes('não possui cadastro ativo'));

    // Verifica log de segurança gerado
    const secLogs = Repository.find(Config.SHEETS.AUDITORIA, r => r.acao === 'UNREGISTERED_ACCESS_ATTEMPT');
    assert.ok(secLogs.length > 0);
  });

  await t.test('Militar autorizado no primeiro acesso realiza auto-onboarding auditado', () => {
    AuthService.setEmailOverride('alves.bombeiro@gmail.com');
    const ctx = AuthService.getUserContext();
    assert.equal(ctx.authenticated, true);
    assert.equal(ctx.perfil, Config.ROLES.MILITAR);
    assert.equal(ctx.militar.nome_guerra, 'Alves');

    // Verifica se criou o usuário em USUARIOS
    const userInDb = Repository.findOne(Config.SHEETS.USUARIOS, 'email_google', 'alves.bombeiro@gmail.com');
    assert.ok(userInDb !== null);
    assert.equal(userInDb.militar_id, 'mil-sd-alves');
  });

  await t.test('Militar comum é barrado de executar funções de Administrador (RBAC)', () => {
    AuthService.setEmailOverride('alves.bombeiro@gmail.com');
    const ctx = AuthService.getUserContext();
    assert.throws(
      () => AuthService.requireRole(ctx, [Config.ROLES.ADMIN]),
      /Acesso negado: Perfil de acesso insuficiente/
    );
  });

  await t.test('Militar é terminantemente proibido de escolher ou agir por outro militar (Anti-Impersonation)', () => {
    AuthService.setEmailOverride('alves.bombeiro@gmail.com');
    const ctx = AuthService.getUserContext();
    
    // Tentativa legítima em nome de si mesmo
    assert.doesNotThrow(() => AuthService.assertCanActOnMilitary(ctx, 'mil-sd-alves'));

    // Tentativa maliciosa de agir em nome de outro militar 'mil-sgt-souza'
    assert.throws(
      () => AuthService.assertCanActOnMilitary(ctx, 'mil-sgt-souza'),
      /Violação de segurança: Não é permitido realizar operações em nome de outro militar/
    );

    // Verifica se foi registrado evento de segurança
    const impLogs = Repository.find(Config.SHEETS.AUDITORIA, r => r.acao === 'IMPERSONATION_ATTEMPT');
    assert.ok(impLogs.length > 0);
  });

  await t.test('Administrador pode intervir administrativamente em favor de militar', () => {
    AuthService.setEmailOverride('admin.cbm@gmail.com');
    const adminCtx = AuthService.getUserContext();
    assert.equal(adminCtx.perfil, Config.ROLES.ADMIN);
    assert.doesNotThrow(() => AuthService.assertCanActOnMilitary(adminCtx, 'mil-sd-alves'));
  });
});
