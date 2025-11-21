/**
 * Privacy Guard - Main Application Logic
 * Gestiona el flujo principal de la aplicación con soporte para documentos largos (Chunking)
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;

// Configuración
const CHUNK_SIZE = 15000; // 15k caracteres por petición (seguro para timeout de 10s)

// Elementos del DOM
const elements = {
    textarea: document.getElementById('privacyText'),
    charCount: document.getElementById('charCount'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    loadingState: document.getElementById('loadingState'),
    loadingText: document.getElementById('loadingText'),
    resultsSection: document.getElementById('resultsSection'),
    reportContent: document.getElementById('reportContent'),
    riskContent: document.getElementById('riskContent'),
    statChars: document.getElementById('statChars'),
    statDate: document.getElementById('statDate'),
    pdfUpload: document.getElementById('pdfUpload')
};

/**
 * Inicialización
 */
function init() {
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
    elements.textarea.addEventListener('input', handleTextInput);
    if(elements.pdfUpload) {
        elements.pdfUpload.addEventListener('change', handlePdfUpload);
    }
}

// ==========================================
// LÓGICA DE PDF (Sin cambios mayores)
// ==========================================
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
        alert('❌ Por favor, sube un archivo PDF válido.');
        return;
    }

    try {
        toggleLoading(true, "Leyendo PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + "\n\n";
        }

        elements.textarea.value = fullText;
        handleTextInput();
        toggleLoading(false);

    } catch (error) {
        console.error('Error al leer PDF:', error);
        alert('❌ Error al leer el archivo PDF.');
        toggleLoading(false);
    }
    event.target.value = '';
}

function handleTextInput() {
    const count = elements.textarea.value.length;
    elements.charCount.textContent = count.toLocaleString();
    elements.analyzeBtn.disabled = count < 50;
}

// ==========================================
// LÓGICA DE ANÁLISIS (MODIFICADA PARA CHUNKING)
// ==========================================

/**
 * Divide el texto en bloques seguros sin cortar palabras
 */
function splitTextSafe(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = text.split('\n'); // Dividir por párrafos primero

    for (let paragraph of paragraphs) {
        // Si un solo párrafo es gigante, lo cortamos por palabras
        if (paragraph.length > maxLength) {
            const words = paragraph.split(' ');
            for (let word of words) {
                if ((currentChunk + word).length > maxLength) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
                currentChunk += word + ' ';
            }
        } else {
            // Lógica normal por párrafos
            if ((currentChunk + paragraph).length > maxLength) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            currentChunk += paragraph + '\n';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk);
    return chunks;
}

async function analyzePrivacy() {
    const text = elements.textarea.value.trim();
    if (text.length < 50) return;

    // 1. Decidir estrategia según longitud
    if (text.length > CHUNK_SIZE) {
        await analyzeLargeDocument(text);
    } else {
        await analyzeSingleBlock(text);
    }
}

/**
 * Estrategia A: Documento Corto (Una sola petición)
 */
async function analyzeSingleBlock(text) {
    toggleLoading(true, "Analizando documento...");
    try {
        const result = await callAnalyzeAPI(text, "General");
        processFinalResult(result, text.length);
    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Estrategia B: Documento Largo (Múltiples peticiones)
 */
async function analyzeLargeDocument(text) {
    const chunks = splitTextSafe(text, CHUNK_SIZE);
    let finalReport = "";
    let hasErrors = false;

    toggleLoading(true, `Iniciando análisis de ${chunks.length} secciones...`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            // Actualizar UI
            const progressMsg = `Analizando parte ${i + 1} de ${chunks.length}...`;
            if(elements.loadingText) elements.loadingText.textContent = progressMsg;
            
            // Llamada a la API
            try {
                // Añadimos contexto al prompt para que la IA sepa que es una parte
                const chunkContext = `(Parte ${i + 1} de ${chunks.length} del documento). `;
                const result = await callAnalyzeAPI(chunks[i], chunkContext);
                
                // Agregar cabecera visual para separar secciones
                finalReport += `\n\n# 📑 ANÁLISIS DE LA SECCIÓN ${i + 1}\n---\n${result}`;
            
            } catch (err) {
                console.warn(`Error en parte ${i+1}`, err);
                finalReport += `\n\n# ❌ ERROR EN SECCIÓN ${i + 1}\nNo se pudo analizar esta sección por timeout o error de red.\n`;
                hasErrors = true;
            }
        }

        if (!finalReport.trim()) throw new Error("No se pudo obtener ningún resultado.");

        if (hasErrors) {
            alert("⚠️ Algunas secciones no pudieron ser analizadas correctamente, pero se generó el reporte parcial.");
        }

        processFinalResult(finalReport, text.length);

    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Llamada genérica a la API
 */
async function callAnalyzeAPI(textChunk, contextNote = "") {
    const systemPrompt = `Actúa como experto CISO. Analiza este fragmento de Términos/Privacidad.
    ${contextNote ? "NOTA: Este texto es solo una sección de un documento más grande. " : ""}
    
    Genera un reporte en MARKDOWN. Estructura:
    ## Resumen Ejecutivo
    ## Datos Personales Recolectados
    ## Compartición con Terceros
    ## Banderas Rojas (Riesgos Altos)
    ## Retención y Derechos
    
    Si el texto no tiene sentido legal, responde "ERROR_CONTEXTO".`;

    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemPrompt: systemPrompt,
            userText: textChunk
        })
    });

    if (!response.ok) {
        throw new Error(`Error API: ${response.status}`);
    }

    const data = await response.json();
    if (data.content.includes('ERROR_CONTEXTO')) {
        throw new Error("Texto no válido detectado.");
    }
    return data.content;
}

/**
 * Procesa y muestra los resultados finales
 */
function processFinalResult(markdown, totalChars) {
    currentMarkdown = markdown;
    currentCharCount = totalChars;

    // Renderizar Markdown completo
    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Extraer TODAS las banderas rojas de todas las secciones
    const allRisks = markdown.match(/## Banderas Rojas[\s\S]*?(?=## Retención|## |$)/g);
    
    if (allRisks && allRisks.length > 0) {
        // Unir y limpiar banderas rojas repetidas
        const riskHtml = allRisks.map(riskBlock => parseMarkdown(riskBlock)).join('<hr class="risk-separator">');
        elements.riskContent.innerHTML = riskHtml;
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se detectaron banderas rojas críticas.</p>';
    }

    updateStatistics(totalChars);
    showResults();
    switchTab(0);
}

// ==========================================
// UTILIDADES DE UI
// ==========================================

function toggleLoading(show, text = "Cargando...") {
    if (show) {
        elements.loadingState.classList.add('active');
        if(elements.loadingText) elements.loadingText.textContent = text;
        elements.resultsSection.classList.remove('active');
        elements.analyzeBtn.disabled = true;
    } else {
        elements.loadingState.classList.remove('active');
        elements.analyzeBtn.disabled = false;
    }
}

function showResults() {
    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResults() {
    elements.resultsSection.classList.remove('active');
}

function switchTab(index) {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.tab-panel').forEach((panel, i) => {
        panel.classList.toggle('active', i === index);
    });
}

function updateStatistics(charCount) {
    if(elements.statChars) elements.statChars.textContent = charCount.toLocaleString();
    // Eliminamos referencia a statModel para evitar errores
    if(elements.statDate) {
        elements.statDate.textContent = new Date().toLocaleDateString('es-MX', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
}

function handleError(error) {
    console.error('Error:', error);
    alert(`❌ Ha ocurrido un error: ${error.message}`);
    toggleLoading(false);
}

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}