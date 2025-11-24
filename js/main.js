/**
 * Privacy Guard - Versión Experta (Secuencial y Robusta)
 */

// Tamaño de bloque seguro
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

let currentInputType = 'text';

function init() {
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
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
        elements.analyzeBtn.disabled = false;
    }
}

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
        alert('Error al leer PDF. Puede estar dañado o protegido.');
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
// LÓGICA DE ANÁLISIS ROBUSTA
// ==========================================

async function analyzePrivacy() {
    hideResults();
    
    // --- MODO URL ---
    if (currentInputType === 'url') {
        const url = elements.urlInput.value.trim();
        if (!url) { alert('Ingresa una URL válida'); return; }
        
        // Expresión regular básica para validar URL
        if (!url.startsWith('http')) { alert('La URL debe comenzar con http:// o https://'); return; }

        toggleLoading(true, "Accediendo al sitio web y extrayendo contenido...");
        
        try {
            // Mandamos URL, el backend se encarga de descargar y analizar
            // Usamos un prompt que pide resumen directo si cabe
            const result = await callAnalyzeAPI(null, "Analiza esta Política de Privacidad Web", 'url', url);
            
            // Si el backend devuelve el análisis listo
            processFinalResult(result.content, result.charCount || "Sitio Web");

        } catch (error) {
            handleError(error);
        } finally {
            toggleLoading(false);
        }
        return;
    }

    // --- MODO TEXTO / PDF ---
    const textToAnalyze = elements.textarea.value.trim();
    if (textToAnalyze.length < 50) return;

    toggleLoading(true, "Iniciando análisis...");

    if (textToAnalyze.length <= SAFE_CHUNK_SIZE) {
        // Texto corto: Análisis directo
        try {
            const result = await callAnalyzeAPI(textToAnalyze, "");
            processFinalResult(result.content, textToAnalyze.length);
        } catch (e) { handleError(e); } finally { toggleLoading(false); }
    } else {
        // Texto largo: Análisis SECUENCIAL (No paralelo, para evitar fallos)
        const chunks = splitTextSafe(textToAnalyze, SAFE_CHUNK_SIZE);
        await performSequentialAnalysis(chunks, textToAnalyze.length);
    }
}

/**
 * Procesa las partes UNA POR UNA para evitar saturación y timeouts
 */
async function performSequentialAnalysis(chunks, totalLength) {
    const validResults = [];

    try {
        for (let i = 0; i < chunks.length; i++) {
            toggleLoading(true, `Analizando parte ${i + 1} de ${chunks.length}... (Por favor espera)`);
            
            const context = `(Parte ${i+1} de ${chunks.length}). Extrae SOLAMENTE: Datos personales, Terceros, y Riesgos Críticos. Sé breve.`;
            
            try {
                // Llamada a la API
                const result = await callAnalyzeAPI(chunks[i], context);
                
                // Validación simple de que recibimos texto
                if (result && result.content && !result.content.includes("ERROR TÉCNICO")) {
                    validResults.push(result.content);
                }
            } catch (err) {
                console.warn(`Falló la parte ${i+1}, continuamos con la siguiente.`);
            }

            // Pequeña pausa de seguridad para no saturar
            if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000));
        }

        if (validResults.length === 0) {
            throw new Error("Fallaron todas las secciones. El servidor puede estar saturado.");
        }

        // FASE DE FUSIÓN
        toggleLoading(true, "Unificando todas las partes en un reporte final...");
        
        const combinedText = validResults.join("\n\n--- SIGUIENTE SECCIÓN ---\n\n");
        const mergePrompt = `Actúa como CISO. He analizado un documento largo en ${validResults.length} partes.
        A continuación te doy los resúmenes de cada parte.
        
        TU TAREA: Fusiona estos resúmenes en UN SOLO reporte final coherente en Markdown.
        
        Estructura:
        ## Resumen Ejecutivo
        ## Datos Recolectados (Lista unificada)
        ## Compartición con Terceros
        ## Banderas Rojas (Las más críticas de todo el documento)
        ## Retención y Derechos
        ## Recomendaciones
        `;

        const finalReport = await callAnalyzeAPI(combinedText, mergePrompt);
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
        // Si estamos en modo URL, lanzamos error para que lo atrape el catch principal
        if (type === 'url') throw new Error(msg);
        
        // Si estamos en modo texto secuencial, devolvemos objeto de error
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

function processFinalResult(markdown, chars) {
    elements.reportContent.innerHTML = parseMarkdown(markdown);
    const risks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/);
    elements.riskContent.innerHTML = risks ? parseMarkdown(risks[0]) : "✅ Sin riesgos críticos detectados.";
    
    if(elements.statChars) elements.statChars.textContent = typeof chars === 'number' ? chars.toLocaleString() : chars;
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

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();