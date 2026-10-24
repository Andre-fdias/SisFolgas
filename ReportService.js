/**
 * SISTEMA DE GERENCIAMENTO E ESCOLHA DE FOLGAS (CBM)
 * Módulo: ReportService.js
 * Descrição: Geração do documento e relatório oficial da Escala Mensal de Folgas
 *            formatado para Boletim Interno, mural da prontidão e exportação em PDF.
 */

var ReportService = (function () {
  'use strict';

  /**
   * Constrói o HTML oficial da Escala de Folgas para uma competência específica
   * formatado nos padrões da Polícia Militar / Corpo de Bombeiros (2º SGB - Eb São Roque).
   * 
   * @param {string} periodoId - ID do período
   * @returns {string} Código HTML completo com formatação militar
   */
  function generateScaleReportHtml(periodoId) {
    var periodo = Repository.findById(Config.SHEET_NAMES.PERIODOS, periodoId);
    if (!periodo) {
      throw new Error('Período não encontrado: ' + periodoId);
    }

    var militares = Repository.findAll(Config.SHEET_NAMES.MILITARES).filter(function (m) {
      return m.ativo === true || m.ativo === 'TRUE';
    });

    var escolhas = Repository.findAll(Config.SHEET_NAMES.ESCOLHAS).filter(function (e) {
      return e.periodo_id === periodoId && e.status !== Config.CHOICE_STATUS.CANCELADA;
    });

    var escolhasPorMilitar = {};
    escolhas.forEach(function (e) {
      escolhasPorMilitar[e.militar_id] = e;
    });

    // Mapeamento das 3 Prontidões Operacionais
    var prontidoes = [
      { id: 'VERDE', nome: 'Prontidão Verde (Equipe A)', cor: '#16a34a' },
      { id: 'AMARELA', nome: 'Prontidão Amarela (Equipe B)', cor: '#ca8a04' },
      { id: 'VERMELHA', nome: 'Prontidão Vermelha (Equipe C)', cor: '#dc2626' }
    ];

    var agoraFormatado = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    var html = '<!DOCTYPE html>\n<html>\n<head>\n<meta charset="utf-8">\n';
    html += '<title>Escala Oficial de Folgas - ' + (periodo.competencia || '') + ' - 2º SGB Eb São Roque</title>\n';
    html += '<style>\n';
    html += '  @page { size: A4 landscape; margin: 12mm 15mm; }\n';
    html += '  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11pt; color: #111827; margin: 0; padding: 15px; background: #fff; }\n';
    html += '  .header-box { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }\n';
    html += '  .header-box h1 { font-size: 14pt; margin: 0 0 4px 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }\n';
    html += '  .header-box h2 { font-size: 12pt; margin: 0 0 4px 0; font-weight: 600; color: #1f2937; }\n';
    html += '  .header-box h3 { font-size: 11pt; margin: 0; color: #374151; font-weight: 500; }\n';
    html += '  .meta-bar { display: flex; justify-content: space-between; font-size: 9.5pt; color: #4b5563; margin-bottom: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }\n';
    html += '  .team-section { margin-bottom: 20px; page-break-inside: avoid; }\n';
    html += '  .team-title { font-size: 12pt; font-weight: bold; padding: 6px 10px; color: #fff; border-radius: 3px; margin-bottom: 5px; }\n';
    html += '  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 10pt; }\n';
    html += '  th { background-color: #f3f4f6; color: #111827; border: 1px solid #9ca3af; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9.5pt; text-transform: uppercase; }\n';
    html += '  td { border: 1px solid #d1d5db; padding: 5px 8px; vertical-align: middle; }\n';
    html += '  tr:nth-child(even) { background-color: #f9fafb; }\n';
    html += '  .badge-status { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; }\n';
    html += '  .status-ativa { background: #dcfce7; color: #166534; }\n';
    html += '  .status-acumulado { background: #dbeafe; color: #1e40af; }\n';
    html += '  .status-permuta { background: #fef3c7; color: #92400e; }\n';
    html += '  .status-nao-faz-jus { background: #fee2e2; color: #991b1b; }\n';
    html += '  .status-pendente { background: #f3f4f6; color: #6b7280; font-style: italic; }\n';
    html += '  .signature-box { display: flex; justify-content: space-around; margin-top: 35px; page-break-inside: avoid; }\n';
    html += '  .sig-line { text-align: center; width: 40%; border-top: 1px solid #000; padding-top: 6px; font-size: 9.5pt; }\n';
    html += '  .footer-note { font-size: 8pt; color: #6b7280; text-align: center; margin-top: 25px; border-top: 1px dashed #d1d5db; padding-top: 5px; }\n';
    html += '</style>\n</head>\n<body>\n';

    // Cabeçalho Oficial Militar
    html += '<div class="header-box">\n';
    html += '  <h1>POLÍCIA MILITAR DO ESTADO DE SÃO PAULO</h1>\n';
    html += '  <h2>CORPO DE BOMBEIROS - 2º SUBGRUPAMENTO DE BOMBEIROS (2º SGB)</h2>\n';
    html += '  <h3>ESTAÇÃO DE BOMBEIROS DE SÃO ROQUE | SISFOLGAS- SÃO ROQUE</h3>\n';
    html += '</div>\n';

    // Barra de Metadados
    html += '<div class="meta-bar">\n';
    html += '  <span><strong>Competência:</strong> ' + (periodo.competencia || 'Mês Operacional') + '</span>\n';
    html += '  <span><strong>Status do Período:</strong> ' + (periodo.status || 'ENCERRADO') + '</span>\n';
    html += '  <span><strong>Data de Homologação/Emissão:</strong> ' + agoraFormatado + '</span>\n';
    html += '</div>\n';

    // Tabelas por Prontidão Operacional
    prontidoes.forEach(function (pront) {
      var membros = militares.filter(function (m) {
        var p = (m.prontidao || '').toUpperCase();
        return p === pront.id || p === ('EQUIPE ' + pront.id);
      }).sort(function (a, b) {
        return (Number(a.ordem_antiguidade) || 99) - (Number(b.ordem_antiguidade) || 99);
      });

      html += '<div class="team-section">\n';
      html += '  <div class="team-title" style="background-color: ' + pront.cor + ';">' + pront.nome + ' - Efetivo: ' + membros.length + ' Militares</div>\n';
      html += '  <table>\n';
      html += '    <thead>\n';
      html += '      <tr>\n';
      html += '        <th style="width: 45px; text-align: center;">Ant.</th>\n';
      html += '        <th style="width: 85px;">Graduação</th>\n';
      html += '        <th style="width: 95px;">RE</th>\n';
      html += '        <th>Nome de Guerra</th>\n';
      html += '        <th style="width: 110px; text-align: center;">Data da Folga</th>\n';
      html += '        <th style="width: 140px; text-align: center;">Situação / Destino</th>\n';
      html += '        <th>Observações Operacionais</th>\n';
      html += '      </tr>\n';
      html += '    </thead>\n';
      html += '    <tbody>\n';

      if (membros.length === 0) {
        html += '      <tr><td colspan="7" style="text-align: center; color: #6b7280; padding: 10px;">Nenhum militar alocado nesta prontidão.</td></tr>\n';
      } else {
        membros.forEach(function (m) {
          var esc = escolhasPorMilitar[m.militar_id];
          var dataFolga = '-';
          var statusHtml = '<span class="badge-status status-pendente">Não Escolheu</span>';
          var obs = '-';

          if (esc) {
            if (esc.data_folga) {
              var partes = esc.data_folga.split('-');
              if (partes.length === 3) {
                dataFolga = partes[2] + '/' + partes[1] + '/' + partes[0];
              } else {
                dataFolga = esc.data_folga;
              }
            }

            if (esc.status === Config.CHOICE_STATUS.ATIVA) {
              statusHtml = '<span class="badge-status status-ativa">Folga Confirmada</span>';
            } else if (esc.status === Config.CHOICE_STATUS.ACUMULADO) {
              statusHtml = '<span class="badge-status status-acumulado">Folga Acumulada</span>';
              obs = 'Homologado acúmulo de saldo para mês posterior';
            } else if (esc.status === Config.CHOICE_STATUS.PERMUTA) {
              statusHtml = '<span class="badge-status status-permuta">Permuta Aprovada</span>';
              obs = 'Permuta autorizada entre militares';
            } else if (esc.status === Config.CHOICE_STATUS.NAO_FAZ_JUS) {
              statusHtml = '<span class="badge-status status-nao-faz-jus">Não Faz Jus</span>';
              obs = esc.motivo_nao_faz_jus ? ('Motivo: ' + esc.motivo_nao_faz_jus) : 'Afastamento regulamentar';
            } else if (esc.status === 'NAO_ESCOLHEU_NO_PRAZO') {
              statusHtml = '<span class="badge-status status-nao-faz-jus">Prazo Expirado</span>';
              obs = 'Não registrou escolha até o dia 16';
            }
          }

          var reFormatado = m.re + (m.digito_re ? ('-' + m.digito_re) : '');

          html += '      <tr>\n';
          html += '        <td style="text-align: center; font-weight: bold;">' + (m.ordem_antiguidade || '-') + 'º</td>\n';
          html += '        <td>' + (m.graduacao || '') + '</td>\n';
          html += '        <td><code>' + reFormatado + '</code></td>\n';
          html += '        <td><strong>' + (m.nome_guerra || m.nome_completo || '') + '</strong></td>\n';
          html += '        <td style="text-align: center; font-weight: bold; color: #1e3a8a;">' + dataFolga + '</td>\n';
          html += '        <td style="text-align: center;">' + statusHtml + '</td>\n';
          html += '        <td style="font-size: 8.5pt; color: #4b5563;">' + obs + '</td>\n';
          html += '      </tr>\n';
        });
      }

      html += '    </tbody>\n';
      html += '  </table>\n';
      html += '</div>\n';
    });

    // Quadro de Assinaturas
    html += '<div class="signature-box">\n';
    html += '  <div class="sig-line">\n';
    html += '    <strong>Sgt PM Encarregado de Escala</strong><br>\n';
    html += '    <span>2º SGB - Eb São Roque</span>\n';
    html += '  </div>\n';
    html += '  <div class="sig-line">\n';
    html += '    <strong>Comandante da Estação de Bombeiros</strong><br>\n';
    html += '    <span>Estação de Bombeiros de São Roque</span>\n';
    html += '  </div>\n';
    html += '</div>\n';

    // Rodapé de Autenticação
    html += '<div class="footer-note">\n';
    html += '  Documento oficial gerado e homologado via SisFolgas- São Roque (2º SGB- Eb São Roque). Conforme regulamentação interna e escala 24x48.\n';
    html += '</div>\n';

    html += '</body>\n</html>';

    return html;
  }

  /**
   * Converte o relatório em Blob PDF oficial pronto para anexo de e-mail ou salvamento no Google Drive.
   * 
   * @param {string} periodoId - ID do período
   * @returns {Object} Blob do PDF gerado
   */
  function generateScalePdfBlob(periodoId) {
    var periodo = Repository.findById(Config.SHEET_NAMES.PERIODOS, periodoId);
    var competencia = periodo ? periodo.competencia : 'Geral';
    var htmlContent = generateScaleReportHtml(periodoId);
    var filename = 'Escala_Oficial_Folgas_' + competencia + '_2SGB_SaoRoque.pdf';

    // Se estiver executando no Google Apps Script nativo
    if (typeof Utilities !== 'undefined' && typeof Utilities.newBlob === 'function') {
      var htmlBlob = Utilities.newBlob(htmlContent, 'text/html', 'escala.html');
      var pdfBlob = htmlBlob.getAs('application/pdf');
      pdfBlob.setName(filename);
      return pdfBlob;
    }

    // Ambiente de testes / Node.js
    return {
      getName: function () { return filename; },
      getContentType: function () { return 'application/pdf'; },
      getBytes: function () {
        return (typeof Buffer !== 'undefined') ? Buffer.from(htmlContent, 'utf-8') : [];
      },
      getDataAsString: function () {
        return htmlContent;
      }
    };
  }

  return {
    generateScaleReportHtml: generateScaleReportHtml,
    generateScalePdfBlob: generateScalePdfBlob
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ReportService;
}
