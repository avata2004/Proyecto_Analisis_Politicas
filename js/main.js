/**
 * Privacy Guard - Lógica con Consolidación y Soporte de Links
 */

// LÍMITE REDUCIDO A 25k para evitar Timeouts de 30s
const SAFE_CHUNK_SIZE = 25000; 

const elements = {
    textarea: document.getElementById('privacyText'),
    urlInput: document.getElementById('urlInput'),
    inputModeText: document.getElementById('modeText'),
    inputModeUrl: document.getElementById('modeUrl'),
    textInputContainer: document.getElementById('textInputContainer'),
    urlInputContainer: document.getElementById('urlInputContainer'),
    
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

let currentInputType = 'text'; // 'text' o 'url'

function init() {
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
    // Cambio de modo (Texto vs URL)
    elements.inputModeText.addEventListener('click', () => switchInputMode('text'));
    elements.inputModeUrl.addEventListener('click', () => switchInputMode('url'));

    elements.textarea.addEventListener('input', handleTextInput);
    if(elements.pdfUpload) elements.pdfUpload.addEventListener('change', handlePdfUpload);
}

function switchInputMode(mode) {
    currentInputType = mode;
    if (mode === 'text') {
        elements.inputModeText.classList.add('active-mode');
        elements.inputModeUrl.classList.remove('active-mode');
        elements.textInputContainer.style.display = 'block';
        elements.urlInputContainer.style.display = 'none';
        elements.analyzeBtn.disabled = elements.textarea.value.length < 50;
    } else {
        elements.inputModeUrl.classList.add('active-mode');
        elements.inputModeText.classList.remove('active-mode');
        elements.urlInputContainer.style.display = 'block';
        elements.textInputContainer.style.display = 'none';
        elements.analyzeBtn.disabled = false; // Asumimos URL válida al intentar
    }
}

// ... (Lógica PDF se mantiene igual, omitida por brevedad, usa la anterior) ...
// PEGA AQUÍ LA FUNCIÓN handlePdfUpload DEL CÓDIGO ANTERIOR SI LA NECESITAS
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        toggleLoading(true, "Leyendo PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ');
        }
        elements.textarea.value = fullText;
        handleTextInput();
        switchInputMode('text');
        toggleLoading(false);
    } catch (error) {
        alert('Error al leer PDF');
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
// LÓGICA PRINCIPAL DE ANÁLISIS
// ==========================================

async function analyzePrivacy() {
    hideResults();
    
    let textToAnalyze = "";
    
    // CASO 1: ANÁLISIS POR URL
    if (currentInputType === 'url') {
        const url = elements.urlInput.value.trim();
        if (!url) { alert('Ingresa una URL válida'); return; }
        
        toggleLoading(true, "Descargando y analizando sitio web...");
        
        // Enviamos la URL directa al backend (sin partir, el backend la descarga)
        // El backend nos devolverá el análisis directo O el texto para partir.
        // Para simplificar: Mandamos URL, el backend descarga, si es enorme el backend falla.
        // MEJOR ESTRATEGIA: El backend descarga y devuelve el ANÁLISIS directo.
        // Si la web es gigante, usaremos la estrategia de texto.
        
        try {
            const result = await callAnalyzeAPI(null, "Analisis Web", 'url', url);
            // El backend también devuelve 'charCount'
            processFinalResult(result.content, result.charCount || "Web");
        } catch (error) {
            handleError(error);
        } finally {
            toggleLoading(false);
        }
        return;
    }

    // CASO 2: ANÁLISIS DE TEXTO / PDF
    textToAnalyze = elements.textarea.value.trim();
    if (textToAnalyze.length < 50) return;

    toggleLoading(true, "Analizando documento...");

    // Estrategia de División
    if (textToAnalyze.length <= SAFE_CHUNK_SIZE) {
        // Texto corto: 1 llamada
        try {
            const result = await callAnalyzeAPI(textToAnalyze, "");
            processFinalResult(result.content, textToAnalyze.length);
        } catch (e) { handleError(e); } finally { toggleLoading(false); }
    } else {
        // Texto largo: Paralelo + Fusión
        const chunks = splitTextSafe(textToAnalyze, SAFE_CHUNK_SIZE);
        toggleLoading(true, `Documento extenso (${chunks.length} partes). Analizando en paralelo...`);
        await performParallelAnalysis(chunks, textToAnalyze.length);
    }
}

async function performParallelAnalysis(chunks, totalLength) {
    try {
        // 1. Enviar todas las partes a la vez
        const promises = chunks.map((chunk, i) => {
            const context = `(Parte ${i+1} de ${chunks.length}). Extrae los puntos clave de Datos, Terceros y Riesgos.`;
            return callAnalyzeAPI(chunk, context);
        });

        const results = await Promise.all(promises);
        
        // Verificar errores en partes
        const validResults = results.map(r => r.content).filter(r => !r.includes("ERROR TÉCNICO"));
        
        if (validResults.length === 0) throw new Error("Fallaron todas las secciones.");

        // 2. FASE DE FUSIÓN (CONSOLIDACIÓN)
        toggleLoading(true, "Unificando resultados en un solo reporte...");
        
        const combinedText = validResults.join("\n\n--- SIGUIENTE PARTE ---\n\n");
        const mergePrompt = `Actúa como CISO. Tienes ${validResults.length} reportes parciales de un mismo documento.
        
        TU TAREA: Fusiónalos en UN SOLO reporte final coherente.
        - No repitas "Parte 1", "Parte 2".
        - Consolida las listas de datos y terceros.
        - Resume las banderas rojas más críticas.
        
        Estructura Final:
        ## Resumen Ejecutivo
        ## Datos Recolectados
        ## Compartición con Terceros
        ## Banderas Rojas
        ## Retención y Recomendaciones`;

        // Llamada final para unir todo
        const finalReport = await callAnalyzeAPI(combinedText, mergePrompt); // Enviamos el resumen como "userText"
        
        processFinalResult(finalReport.content, totalLength);

    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

async function callAnalyzeAPI(text, promptContext, type = 'text', url = null) {
    const systemPrompt = `Eres un experto en Ciberseguridad. ${promptContext}
    Genera un reporte MARKDOWN conciso.`;

    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemPrompt: systemPrompt,
            userText: text,
            inputType: type,
            linkUrl: url
        })
    });

    const data = await response.json();
    if (!response.ok) {
        const msg = data.details || data.error || "Error desconocido";
        // Si falla una parte en paralelo, devolvemos un texto de error pero no lanzamos excepción para no matar todo
        return { content: `⚠️ ERROR TÉCNICO EN ESTA PARTE: ${msg}` };
    }
    return data;
}

function splitTextSafe(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = text.split('\n');
    for (let p of paragraphs) {
        if ((currentChunk + p).length > maxLength) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += p + '\n';
    }
    if (currentChunk.trim()) chunks.push(currentChunk);
    return chunks;
}

// Utilidades UI
function processFinalResult(markdown, chars) {
    elements.reportContent.innerHTML = parseMarkdown(markdown);
    // Extracción de riesgos (simple)
    const risks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/);
    elements.riskContent.innerHTML = risks ? parseMarkdown(risks[0]) : "✅ Sin riesgos críticos detectados.";
    
    if(elements.statChars) elements.statChars.textContent = chars.toLocaleString();
    if(elements.statDate) elements.statDate.textContent = new Date().toLocaleDateString();
    
    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function toggleLoading(show, txt) {
    if(show) {
        elements.loadingState.classList.add('active');
        if(elements.loadingText) elements.loadingText.textContent = txt;
        elements.resultsSection.classList.remove('active');
    } else {
        elements.loadingState.classList.remove('active');
    }
}

function hideResults() { elements.resultsSection.classList.remove('active'); }
function handleError(e) { alert("Error: " + e.message); toggleLoading(false); }

// Init
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();