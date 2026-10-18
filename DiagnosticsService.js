/**
 * SISTEMA SEGURO DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * DiagnosticsService.js - Diagnóstico abrangente de integridade, concorrência e dados
 */

const DiagnosticsService = (function() {
  return {
    /**
     * Executa varredura completa de integridade na base de dados
     */
    runFullDiagnostics: function() {
      const issues = [];
      const stats = {};

      // 1. Verificação da existência e cabeçalhos das 9 abas
      Object.keys(Config.SCHEMAS).forEach(sheetName => {
        try {
          const rows = Repository.getAll(sheetName);
          stats[sheetName] = rows.length;
        } catch (err) {
          issues.push({
            severity: 'CRITICAL',
            sheet: sheetName,
            message: `Aba obrigatória inacessível ou corrompida: ${err.message}`
          });
        }
      });

      // 2. Verificação de integridade dos Militares (RE único, antiguidade única por equipe)
      const militares = Repository.getAll(Config.SHEETS.MILITARES);
      const reMap = {};
      const teamSeniorityMap = {};

      militares.forEach(m => {
        // Checagem de RE duplicado
        if (m.re) {
          if (reMap[m.re]) {
            issues.push({
              severity: 'CRITICAL',
              sheet: Config.SHEETS.MILITARES,
              message: `RE duplicado detectado: ${m.re} (${m.nome_guerra} e ${reMap[m.re].nome_guerra})`
            });
          } else {
            reMap[m.re] = m;
          }
        }

        // Checagem de antiguidade duplicada na mesma equipe
        if (m.ativo && m.equipe && m.ordem_antiguidade) {
          const key = `${m.equipe}_${m.ordem_antiguidade}`;
          if (teamSeniorityMap[key]) {
            issues.push({
              severity: 'WARNING',
              sheet: Config.SHEETS.MILITARES,
              message: `Antiguidade duplicada na ${m.equipe}: Posição ${m.ordem_antiguidade} ocupada por ${m.nome_guerra} e ${teamSeniorityMap[key].nome_guerra}`
            });
          } else {
            teamSeniorityMap[key] = m;
          }
        }
      });

      // 3. Verificação de colisões e exclusividade de vagas em ESCOLHAS
      const escolhas = Repository.getAll(Config.SHEETS.ESCOLHAS);
      const slotMap = {};
      const militarChoiceMap = {};

      escolhas.forEach(e => {
        if (e.status === Config.CHOICE_STATUS.ATIVA) {
          // Vaga dupla na mesma equipe e data
          const slotKey = `${e.periodo_id}_${e.equipe}_${e.data_folga}`;
          if (slotMap[slotKey]) {
            issues.push({
              severity: 'CRITICAL',
              sheet: Config.SHEETS.ESCOLHAS,
              message: `Colisão de vaga: Dois militares da ${e.equipe} com folga ativa na data ${e.data_folga} (Escolhas: ${e.escolha_id} e ${slotMap[slotKey].escolha_id})`
            });
          } else {
            slotMap[slotKey] = e;
          }

          // Escolha dupla para o mesmo militar no mesmo período
          const militarPeriodKey = `${e.periodo_id}_${e.militar_id}`;
          if (militarChoiceMap[militarPeriodKey]) {
            issues.push({
              severity: 'CRITICAL',
              sheet: Config.SHEETS.ESCOLHAS,
              message: `Duplicidade de folga: Militar ${e.militar_id} possui múltiplas escolhas ativas no período ${e.periodo_id}`
            });
          } else {
            militarChoiceMap[militarPeriodKey] = e;
          }
        }
      });

      const hasCritical = issues.some(i => i.severity === 'CRITICAL');
      const hasWarning = issues.some(i => i.severity === 'WARNING');

      return {
        timestamp: new Date().toISOString(),
        status: hasCritical ? 'CRITICAL' : (hasWarning ? 'WARNING' : 'HEALTHY'),
        totalIssues: issues.length,
        issues: issues,
        recordCounts: stats
      };
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DiagnosticsService;
}
