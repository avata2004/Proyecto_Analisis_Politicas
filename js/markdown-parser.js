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
    
    // 1. Listas numeradas (1. item, 2. item) -> Las convertimos a <li>
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

    // 2. Listas con asterisco (* item)
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');

    // 3. Listas con guion (- item)
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
    
    // Consolidar <ul> consecutivos (ej: </ul><ul> se vuelve nada para unir las listas)
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