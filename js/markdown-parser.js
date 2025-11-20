/**
 * Markdown Parser
 * Convierte texto en formato Markdown a HTML
 */

/**
 * Parsea texto markdown simple a HTML
 * @param {string} text - Texto en formato markdown
 * @returns {string} - HTML generado
 */
function parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // Títulos H2 (##)
    html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');

    // Títulos H3 (###)
    html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');

    // Negrita (**texto**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Listas con asterisco (* item)
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');

    // Listas con guion (- item)
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

    // Envolver listas consecutivas en <ul>
    html = html.replace(/(<li>.*?<\/li>\n?)+/gs, '<ul>$&</ul>');

    // Doble salto de línea = <br>
    html = html.replace(/\n\n/g, '<br><br>');

    // Limpiar tags duplicados
    html = cleanDuplicateTags(html);

    return html;
}

/**
 * Limpia tags duplicados o anidados incorrectamente
 * @param {string} html - HTML a limpiar
 * @returns {string} - HTML limpio
 */
function cleanDuplicateTags(html) {
    // Eliminar <ul> vacíos
    html = html.replace(/<ul>\s*<\/ul>/g, '');
    
    // Consolidar <ul> consecutivos
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    
    return html;
}

/**
 * Extrae una sección específica del markdown
 * @param {string} markdown - Texto markdown completo
 * @param {string} sectionTitle - Título de la sección a extraer
 * @returns {string|null} - Contenido de la sección o null
 */
function extractSection(markdown, sectionTitle) {
    const regex = new RegExp(`## ${sectionTitle}[\\s\\S]*?(?=## |$)`, 'i');
    const match = markdown.match(regex);
    return match ? match[0] : null;
}

/**
 * Convierte markdown a texto plano (sin HTML)
 * @param {string} markdown - Texto markdown
 * @returns {string} - Texto plano
 */
function markdownToPlainText(markdown) {
    return markdown
        .replace(/^#+\s/gm, '') // Eliminar headers
        .replace(/\*\*/g, '')    // Eliminar negrita
        .replace(/^\*\s/gm, '• ') // Convertir listas a bullets
        .replace(/^-\s/gm, '• ') // Convertir listas a bullets
        .trim();
}

/**
 * Cuenta palabras en un texto markdown
 * @param {string} markdown - Texto markdown
 * @returns {number} - Cantidad de palabras
 */
function countWords(markdown) {
    const plainText = markdownToPlainText(markdown);
    return plainText.split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Estima el tiempo de lectura de un texto
 * @param {string} markdown - Texto markdown
 * @param {number} wpm - Palabras por minuto (default: 200)
 * @returns {number} - Tiempo estimado en minutos
 */
function estimateReadingTime(markdown, wpm = 200) {
    const words = countWords(markdown);
    return Math.ceil(words / wpm);
}