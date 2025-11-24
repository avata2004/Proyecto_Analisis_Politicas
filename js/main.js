/**
 * Privacy Guard - Versión Ultra-Segura (Límites Bajos + CORS Proxy)
 */

// LÍMITE AGRESIVO: 12k caracteres asegura respuestas en <6 segundos.
// Esto evita el corte de 10s de Netlify Free.
const SAFE_CHUNK_SIZE = 12000; 

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

// --- UTILIDAD: Descargar URL desde el Navegador (Evita Bloqueo 403) ---
async function fetchUrlContent(url) {
    // Usamos un proxy CORS gratuito para evitar bloqueos directos
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("No se pudo conectar al Proxy");
    
    const data = await response.json();
    if (!data.contents) throw new Error("El sitio web no devolvió contenido legible");

    // Limpieza de HTML en el cliente
    let cleanText = data.contents
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, " ")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, " ")
        .replace(/<[^>]+>/g, "\n")
        .replace(/\s+/g, " ")
        .trim();
        
    return cleanText;
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
        alert('Error al leer PDF. Puede estar dañado.');
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
// LÓGICA DE ANÁLISIS
// ==========================================

async function analyzePrivacy() {
    hideResults();
    let textToAnalyze = "";

    try {
        // --- MODO URL ---
        if (currentInputType === 'url') {
            const url = elements.urlInput.value.trim();
            if (!url) { alert('URL inválida'); return; }
            if (!url.startsWith('http')) { alert('Usa http:// o https://'); return; }

            toggleLoading(true, "Descargando sitio web desde tu navegador...");
            textToAnalyze = await fetchUrlContent(url);
            
            if (textToAnalyze.length < 200) throw new Error("El sitio web parece vacío o bloqueó el acceso.");
            console.log(`Sitio descargado: ${textToAnalyze.length} caracteres.`);
        } 
        // --- MODO TEXTO ---
        else {
            textToAnalyze = elements.textarea.value.trim();
        }

        if (textToAnalyze.length < 50) return;

        // Estrategia de Análisis
        if (textToAnalyze.length <= SAFE_CHUNK_SIZE) {
            toggleLoading(true, "Analizando documento...");
            const result = await callAnalyzeAPI(textToAnalyze, "");
            processFinalResult(result.content, textToAnalyze.length);
        } else {
            const chunks = splitTextSafe(textToAnalyze, SAFE_CHUNK_SIZE);
            await performSequentialAnalysis(chunks, textToAnalyze.length);
        }

    } catch (error) {
        handleError(error);
    }
}

async function performSequentialAnalysis(chunks, totalLength) {
    const validResults = [];

    for (let i = 0; i < chunks.length; i++) {
        let success = false;
        let retries = 0;
        
        // Reintento simple por si falla una vez
        while(!success && retries < 2) {
            try {
                toggleLoading(true, `Analizando parte ${i + 1} de ${chunks.length}... ${retries > 0 ? '(Reintentando)' : ''}`);
                
                const context = `(Parte ${i+1} de ${chunks.length}). Extrae: Datos personales, Terceros, Riesgos. Sé breve.`;
                const result = await callAnalyzeAPI(chunks[i], context);
                
                if (result && result.content && !result.content.includes("ERROR TÉCNICO")) {
                    validResults.push(result.content);
                    success = true;
                } else {
                    throw new Error("Respuesta inválida");
                }
            } catch (err) {
                console.warn(`Error en parte ${i+1}:`, err);
                retries++;
                await new Promise(r => setTimeout(r, 2000)); // Esperar 2s antes de reintentar
            }
        }
        
        // Pausa entre bloques exitosos para no saturar
        if(success && i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    if (validResults.length === 0) {
        throw new Error("El servidor está saturado y no pudo procesar las secciones. Intenta con un texto más corto.");
    }

    // FUSIÓN
    toggleLoading(true, "Generando reporte final...");
    try {
        const combinedText = validResults.join("\n\n--- SECCIÓN ---\n\n");
        const mergePrompt = `Actúa como CISO. Fusiona estos ${validResults.length} resúmenes parciales en UN reporte final coherente.
        Elimina duplicados.
        Estructura:
        ## Resumen Ejecutivo
        ## Datos Recolectados
        ## Compartición con Terceros
        ## Banderas Rojas (Críticas)
        ## Retención y Derechos
        ## Recomendaciones`;

        const finalReport = await callAnalyzeAPI(combinedText, mergePrompt);
        processFinalResult(finalReport.content, totalLength);
    } catch (e) {
        // Si falla la fusión, mostramos lo que tenemos
        processFinalResult("# Reporte Parcial (Fusión fallida)\n" + validResults.join("\n\n"), totalLength);
    }
}

async function callAnalyzeAPI(text, promptContext) {
    const systemPrompt = `Eres experto en Ciberseguridad. ${promptContext} Genera reporte MARKDOWN.`;

    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, userText: text })
    });

    const data = await response.json();
    if (!response.ok) {
        const msg = data.details || data.error || "Error";
        throw new Error(msg);
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
    elements.riskContent.innerHTML = risks ? parseMarkdown(risks[0]) : "✅ Sin riesgos críticos.";
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
function handleError(e) { 
    console.error(e); 
    alert("Error: " + e.message); 
    toggleLoading(false); 
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();