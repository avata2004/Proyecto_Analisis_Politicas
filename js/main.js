/**
 * Privacy Guard - Lógica Principal
 * Optimizado con Procesamiento en Paralelo para evitar Timeouts de Netlify
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;

// Configuración de límites
// Netlify Free corta a los 10s. Gemini Flash procesa ~40k chars en 7-8s.
// Si el texto pasa de 45k, lo dividimos para procesarlo en paralelo.
const SAFE_CHUNK_SIZE = 45000;

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
    statModel: document.getElementById('statModel'),
    pdfUpload: document.getElementById('pdfUpload')
};

function init() {
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
    elements.textarea.addEventListener('input', handleTextInput);
    if (elements.pdfUpload) {
        elements.pdfUpload.addEventListener('change', handlePdfUpload);
    }
}

// ==========================================
// LÓGICA DE PDF (Estándar)
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
        alert('❌ Error al leer el PDF. Verifica que no tenga contraseña.');
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
// LÓGICA DE ANÁLISIS EN PARALELO
// ==========================================

async function analyzePrivacy() {
    const text = elements.textarea.value.trim();
    if (text.length < 50) {
        alert('⚠️ El texto es muy corto.');
        return;
    }

    // Decisión de estrategia basada en longitud
    if (text.length <= SAFE_CHUNK_SIZE) {
        // Estrategia Simple (1 Petición)
        toggleLoading(true, "Analizando documento con IA...");
        await performAnalysis([text]);
    } else {
        // Estrategia Paralela (>45k chars)
        // Dividimos y enviamos todo a la vez para "burlar" el límite de tiempo total
        const chunks = splitTextSafe(text, SAFE_CHUNK_SIZE);
        toggleLoading(true, `Documento extenso detectado. Analizando ${chunks.length} secciones en paralelo...`);
        await performAnalysis(chunks);
    }
}

/**
 * Ejecuta el análisis (sea 1 o varios bloques)
 */
async function performAnalysis(chunks) {
    try {
        // Creamos una "promesa" por cada bloque para enviarlos simultáneamente
        const promises = chunks.map((chunk, index) => {
            const isMulti = chunks.length > 1;
            // Si hay varios bloques, ajustamos levemente el prompt para que la IA sepa contexto
            const context = isMulti ? `(Parte ${index + 1} de ${chunks.length} del documento).` : "";
            return callAnalyzeAPI(chunk, context);
        });

        // Promise.all espera a que TODAS las peticiones terminen.
        // Como van en paralelo, si cada una tarda 8s, el total es ~8-9s.
        const results = await Promise.all(promises);

        // Unimos los resultados
        let finalMarkdown = "";

        if (results.length === 1) {
            finalMarkdown = results[0];
        } else {
            // Si hay varios, los unimos con separadores claros
            finalMarkdown = "# 📑 REPORTE DE ANÁLISIS COMPLETO\n\n";
            finalMarkdown += results.map((res, i) =>
                `## 🔹 Análisis de la Sección ${i + 1}\n${res}`
            ).join("\n\n---\n\n");
        }

        processFinalResult(finalMarkdown, elements.textarea.value.length);

    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Llama a la API (Backend) - Versión con reporte de errores real
 */
async function callAnalyzeAPI(textChunk, contextNote) {
    const systemPrompt = `Actúa como CISO experto.
    Analiza este texto legal ${contextNote}.
    
    Genera un reporte MARKDOWN conciso.
    Estructura:
    ## Resumen Ejecutivo
    ## Datos Recolectados
    ## Compartición con Terceros
    ## Banderas Rojas (Riesgos Críticos)
    ## Retención y Derechos
    
    Sé directo.`;

    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemPrompt: systemPrompt,
            userText: textChunk
        })
    });

    // Intentamos leer el mensaje de error real del servidor
    if (!response.ok) {
        let errorMessage = "Error desconocido";
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.details || "Error del servidor";
        } catch (e) {
            errorMessage = `Error HTTP ${response.status}`;
        }

        // Devolvemos el error visible en el reporte para depurar
        const detailMsg = errorData.details || errorData.error || errorMessage;
        return `⚠️ **ERROR TÉCNICO:** \n\nNo se pudo analizar esta sección.\n**Detalle:** ${detailMsg}`;
    }

    const data = await response.json();
    return data.content;
}

/**
 * Divide el texto sin cortar palabras
 */
function splitTextSafe(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = text.split('\n');

    for (let paragraph of paragraphs) {
        if ((currentChunk + paragraph).length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += paragraph + '\n';

        // Si un solo párrafo es gigante (raro, pero posible)
        if (currentChunk.length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk);
    return chunks;
}

// ==========================================
// UTILIDADES UI (Resultados y Carga)
// ==========================================

function processFinalResult(markdown, totalChars) {
    currentMarkdown = markdown;
    currentCharCount = totalChars;

    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Extraemos banderas rojas de TODO el documento combinado
    const allRisks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |---|$))/g);

    if (allRisks && allRisks.length > 0) {
        const riskHtml = allRisks.map(r => parseMarkdown(r)).join('<hr class="risk-separator">');
        elements.riskContent.innerHTML = riskHtml;
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se detectaron riesgos críticos evidentes.</p>';
    }

    updateStatistics(totalChars);
    showResults();
    switchTab(0);
}

function toggleLoading(show, text = "Cargando...") {
    if (show) {
        elements.loadingState.classList.add('active');
        if (elements.loadingText) elements.loadingText.textContent = text;
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
    if (elements.statChars) elements.statChars.textContent = charCount.toLocaleString();
    if (elements.statModel) elements.statModel.textContent = "Gemini 1.5 Flash";
    if (elements.statDate) {
        elements.statDate.textContent = new Date().toLocaleDateString('es-MX', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
}

function handleError(error) {
    console.error('Error:', error);
    alert(`❌ Hubo un problema: ${error.message}`);
    toggleLoading(false);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}