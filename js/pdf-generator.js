/**
 * PDF Generator
 * Genera archivos PDF a partir del análisis
 */

/**
 * Genera y descarga el PDF del análisis
 */
async function downloadPDF() {
    // Validar que haya contenido
    if (!currentMarkdown) {
        alert('⚠️ No hay contenido para generar el PDF');
        return;
    }

    // Obtener botón y mostrar estado de carga
    const btn = document.querySelector('.btn-download');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>⏳ Generando PDF...</span>';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Configuración del documento
        const config = {
            margin: 20,
            pageWidth: doc.internal.pageSize.getWidth(),
            pageHeight: doc.internal.pageSize.getHeight()
        };
        config.maxWidth = config.pageWidth - (config.margin * 2);

        let yPosition = config.margin;

        /**
         * Verifica si es necesario agregar una nueva página
         * @param {number} neededSpace - Espacio necesario en mm
         */
        function checkPageBreak(neededSpace) {
            if (yPosition + neededSpace > config.pageHeight - config.margin) {
                doc.addPage();
                yPosition = config.margin;
                return true;
            }
            return false;
        }

        // ===== HEADER DEL PDF =====
        renderPDFHeader(doc, config);
        yPosition = 55;

        // ===== PROCESAR CONTENIDO =====
        const lines = currentMarkdown.split('\n');
        doc.setTextColor(0, 0, 0);

        for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Títulos H2
            if (line.startsWith('## ')) {
                checkPageBreak(15);
                renderH2(doc, line, config, yPosition);
                yPosition += 12;
            }
            // Títulos H3
            else if (line.startsWith('### ')) {
                checkPageBreak(12);
                renderH3(doc, line, config, yPosition);
                yPosition += 10;
            }
            // Items de lista
            else if (line.startsWith('* ') || line.startsWith('- ')) {
                checkPageBreak(10);
                yPosition = renderListItem(doc, line, config, yPosition);
            }
            // Texto normal
            else {
                checkPageBreak(10);
                yPosition = renderParagraph(doc, line, config, yPosition);
            }
        }

        // ===== FOOTER EN TODAS LAS PÁGINAS =====
        renderPDFFooters(doc, config);

        // ===== GUARDAR ARCHIVO =====
        const fileName = generateFileName();
        doc.save(fileName);

        // Restaurar botón
        btn.disabled = false;
        btn.innerHTML = originalText;

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('❌ Error al generar el PDF. Por favor, intenta nuevamente.');
        
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

/**
 * Renderiza el header del PDF
 * @param {jsPDF} doc - Documento PDF
 * @param {Object} config - Configuración
 */
function renderPDFHeader(doc, config) {
    // Fondo del header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, config.pageWidth, 45, 'F');

    // Título principal
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    doc.text('Privacy Guard', config.pageWidth / 2, 20, { align: 'center' });

    // Subtítulo
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text('Análisis de Política de Privacidad', config.pageWidth / 2, 32, { align: 'center' });

    // Línea decorativa
    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(0.5);
    doc.line(config.margin, 40, config.pageWidth - config.margin, 40);
}

/**
 * Renderiza un título H2
 * @param {jsPDF} doc - Documento PDF
 * @param {string} line - Línea de texto
 * @param {Object} config - Configuración
 * @param {number} y - Posición Y
 */
function renderH2(doc, line, config, y) {
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(30, 41, 59);
    const title = cleanMarkdown(line.replace('## ', ''));
    doc.text(title, config.margin, y);
    
    // Línea debajo del título
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(config.margin, y + 2, config.pageWidth - config.margin, y + 2);
}

/**
 * Renderiza un título H3
 * @param {jsPDF} doc - Documento PDF
 * @param {string} line - Línea de texto
 * @param {Object} config - Configuración
 * @param {number} y - Posición Y
 */
function renderH3(doc, line, config, y) {
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(51, 65, 85);
    const title = cleanMarkdown(line.replace('### ', ''));
    doc.text(title, config.margin, y);
}

/**
 * Renderiza un item de lista
 * @param {jsPDF} doc - Documento PDF
 * @param {string} line - Línea de texto
 * @param {Object} config - Configuración
 * @param {number} y - Posición Y
 * @returns {number} - Nueva posición Y
 */
function renderListItem(doc, line, config, y) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    
    const text = cleanMarkdown(line.replace(/^[*-]\s/, ''));
    const splitText = doc.splitTextToSize('• ' + text, config.maxWidth - 10);
    
    doc.text(splitText, config.margin + 5, y);
    return y + (splitText.length * 6);
}

/**
 * Renderiza un párrafo
 * @param {jsPDF} doc - Documento PDF
 * @param {string} line - Línea de texto
 * @param {Object} config - Configuración
 * @param {number} y - Posición Y
 * @returns {number} - Nueva posición Y
 */
function renderParagraph(doc, line, config, y) {
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(71, 85, 105);
    
    const text = cleanMarkdown(line);
    const splitText = doc.splitTextToSize(text, config.maxWidth);
    
    doc.text(splitText, config.margin, y);
    return y + (splitText.length * 6);
}

/**
 * Renderiza footers en todas las páginas
 * @param {jsPDF} doc - Documento PDF
 * @param {Object} config - Configuración
 */
function renderPDFFooters(doc, config) {
    const totalPages = doc.internal.pages.length - 1;
    const footerText = `Generado por Privacy Guard • ${new Date().toLocaleDateString('es-MX')}`;

    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        
        // Línea superior del footer
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(config.margin, config.pageHeight - 15, config.pageWidth - config.margin, config.pageHeight - 15);
        
        // Texto del footer
        doc.text(footerText, config.pageWidth / 2, config.pageHeight - 10, { align: 'center' });
        doc.text(`Página ${i} de ${totalPages}`, config.pageWidth - config.margin, config.pageHeight - 10, { align: 'right' });
    }
}

/**
 * Limpia el texto markdown de caracteres especiales
 * @param {string} text - Texto a limpiar
 * @returns {string} - Texto limpio
 */
function cleanMarkdown(text) {
    return text
        .replace(/\*\*/g, '')     // Eliminar negritas
        .replace(/\*/g, '')       // Eliminar asteriscos
        .replace(/_{2}/g, '')     // Eliminar subrayados
        .replace(/`/g, '')        // Eliminar backticks
        .trim();
}

/**
 * Genera el nombre del archivo PDF
 * @returns {string} - Nombre del archivo
 */
function generateFileName() {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
    return `analisis-privacidad-${dateStr}_${timeStr}.pdf`;
}