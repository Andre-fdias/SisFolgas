/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Repository.js - Camada de persistência segura, acesso em lote e verificação de esquema
 */

const Repository = (function() {
  // Referência customizada de Spreadsheet para testes ou execução real
  let _spreadsheetOverride = null;

  function getSpreadsheet() {
    if (_spreadsheetOverride) {
      return _spreadsheetOverride;
    }
    if (typeof SpreadsheetApp !== 'undefined') {
      const active = SpreadsheetApp.getActiveSpreadsheet();
      if (active) return active;
      
      // Se não for script vinculado, busca pelo ID salvo nas propriedades do script
      const props = PropertiesService.getScriptProperties();
      const sheetId = props.getProperty('SPREADSHEET_ID');
      if (sheetId) {
        return SpreadsheetApp.openById(sheetId);
      }
    }
    throw new Error('Planilha Google de banco de dados não configurada ou inacessível.');
  }

  return {
    /**
     * Permite injeção de mock de Spreadsheet para suíte de testes automatizados
     */
    setSpreadsheetOverride: function(mock) {
      _spreadsheetOverride = mock;
    },

    /**
     * Inicializa ou atualiza o esquema das 9 abas de forma segura e não destrutiva.
     * Preserva 100% dos dados já gravados na planilha.
     */
    initializeSchema: function(spreadsheet) {
      const ss = spreadsheet || getSpreadsheet();
      const report = {
        createdSheets: [],
        verifiedSheets: [],
        missingColumnsAdded: []
      };

      const schemas = Config.SCHEMAS;
      const sheetKeys = Object.keys(schemas);

      sheetKeys.forEach(function(sheetName) {
        const expectedHeaders = schemas[sheetName];
        let sheet = ss.getSheetByName(sheetName);

        if (!sheet) {
          sheet = ss.insertSheet(sheetName);
          report.createdSheets.push(sheetName);
          // Grava cabeçalhos na linha 1
          sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
          sheet.setFrozenRows(1);
        } else {
          report.verifiedSheets.push(sheetName);
          // Verifica integridade dos cabeçalhos existentes
          const lastCol = Math.max(sheet.getLastColumn(), 1);
          const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

          // Verifica se cabeçalhos estão vazios
          if (currentHeaders.length === 0 || !currentHeaders[0]) {
            sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
            sheet.setFrozenRows(1);
          } else {
            // Verifica se alguma coluna obrigatória está ausente e adiciona ao final
            const missing = expectedHeaders.filter(h => !currentHeaders.includes(h));
            if (missing.length > 0) {
              const startCol = lastCol + 1;
              sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
              report.missingColumnsAdded.push({ sheet: sheetName, columns: missing });
            }
          }
        }
      });

      // Grava versão do esquema na tabela CONFIGURACOES
      this.upsertSetting(ss, 'SCHEMA_VERSION', Config.SCHEMA_VERSION, 'Versão do esquema de dados');
      this.upsertSetting(ss, 'INITIALIZED_AT', new Date().toISOString(), 'Data da última inicialização/verificação');

      return report;
    },

    /**
     * Obtém todas as linhas de uma aba como array de objetos JavaScript indexados
     */
    getAll: function(sheetName) {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        throw new Error(`Aba obrigatória '${sheetName}' não existe na planilha.`);
      }

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow <= 1 || lastCol === 0) {
        return [];
      }

      const rawValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
      const headers = rawValues[0].map(h => String(h).trim());
      const rows = [];

      for (let i = 1; i < rawValues.length; i++) {
        const rowData = rawValues[i];
        // Ignora linhas totalmente vazias
        const hasData = rowData.some(val => val !== '' && val !== null && val !== undefined);
        if (!hasData) continue;

        const obj = { _rowIndex: i + 1 }; // Linha real no Google Sheets (1-indexed)
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j];
          if (header) {
            let val = rowData[j];
            // Tratar booleanos literais se gravados como texto
            if (val === 'TRUE' || val === true) val = true;
            else if (val === 'FALSE' || val === false) val = false;
            obj[header] = val;
          }
        }
        rows.push(obj);
      }

      return rows;
    },

    /**
     * Busca linhas que satisfaçam um predicado de filtro
     */
    find: function(sheetName, predicate) {
      const all = this.getAll(sheetName);
      return all.filter(predicate);
    },

    /**
     * Busca uma única linha por chave identificadora
     */
    findOne: function(sheetName, idField, idValue) {
      const all = this.getAll(sheetName);
      return all.find(row => String(row[idField]) === String(idValue)) || null;
    },

    /**
     * Insere uma nova linha de forma append-only
     */
    insert: function(sheetName, dataObj) {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error(`Aba '${sheetName}' não encontrada.`);

      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

      const rowValues = headers.map(header => {
        const val = dataObj[header];
        if (val === undefined || val === null) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return val;
      });

      sheet.appendRow(rowValues);
      return dataObj;
    },

    /**
     * Insere múltiplas linhas em lote atômico (Batch Insert)
     */
    batchInsert: function(sheetName, dataObjects) {
      if (!dataObjects || dataObjects.length === 0) return;
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error(`Aba '${sheetName}' não encontrada.`);

      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

      const rowsToInsert = dataObjects.map(obj => {
        return headers.map(header => {
          const val = obj[header];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return val;
        });
      });

      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToInsert.length, headers.length).setValues(rowsToInsert);
    },

    /**
     * Atualiza campos de uma linha específica sem afetar as demais colunas
     */
    updateById: function(sheetName, idField, idValue, updatedFields) {
      const ss = getSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error(`Aba '${sheetName}' não encontrada.`);

      const allRows = this.getAll(sheetName);
      const target = allRows.find(row => String(row[idField]) === String(idValue));
      if (!target) {
        throw new Error(`Registro com ${idField}='${idValue}' não encontrado em ${sheetName}.`);
      }

      const rowIndex = target._rowIndex;
      const lastCol = sheet.getLastColumn();
      const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());

      // Grava apenas nas colunas que foram modificadas
      Object.keys(updatedFields).forEach(field => {
        const colIndex = headers.indexOf(field);
        if (colIndex !== -1) {
          let val = updatedFields[field];
          if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
          sheet.getRange(rowIndex, colIndex + 1).setValue(val);
        }
      });

      return Object.assign({}, target, updatedFields);
    },

    /**
     * Salva ou atualiza uma chave em CONFIGURACOES
     */
    upsertSetting: function(spreadsheet, chave, valor, descricao) {
      const ss = spreadsheet || getSpreadsheet();
      const sheet = ss.getSheetByName(Config.SHEETS.CONFIGURACOES);
      if (!sheet) return;

      const lastRow = sheet.getLastRow();
      let foundRow = -1;

      if (lastRow > 1) {
        const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          if (String(keys[i][0]) === String(chave)) {
            foundRow = i + 2;
            break;
          }
        }
      }

      const now = new Date().toISOString();
      const tipo = typeof valor === 'object' ? 'JSON' : typeof valor;
      const valStr = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);

      if (foundRow !== -1) {
        sheet.getRange(foundRow, 2, 1, 4).setValues([[valStr, descricao || '', tipo, now]]);
      } else {
        sheet.appendRow([chave, valStr, descricao || '', tipo, now, 'SISTEMA']);
      }
    }
  };
})();

/**
 * Função executável diretamente pelo menu do Apps Script
 */
function executarCriacaoDeAbas() {
  Logger.log('Iniciando criação das 9 abas do SisFolgas...');
  const res = Repository.initializeSchema();
  Logger.log('Resultado: ' + JSON.stringify(res));
  Logger.log('✅ 9 abas verificadas e prontas na planilha!');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Repository;
}
