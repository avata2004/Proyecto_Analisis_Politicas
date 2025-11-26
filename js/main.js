/**
 * Privacy Guard - Secure Client-Side
 * Modelo: Gemini 2.5 Flash
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

const CHUNK_SIZE = 30000;

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
    progressBar: document.getElementById('progressBar'),
    loadingPercent: document.getElementById('loadingPercent'),
    resultsSection: document.getElementById('resultsSection'),
    reportContent: document.getElementById('reportContent'),
    riskContent: document.getElementById('riskContent'),
    pdfUpload: document.getElementById('pdfUpload'),
    // Nuevos elementos del semáforo
    riskGaugeContainer: document.getElementById('riskGaugeContainer'),
    riskIndicator: document.getElementById('riskIndicator'),
    riskIcon: document.getElementById('riskIcon'),
    riskLabel: document.getElementById('riskLabel'),
    riskSummary: document.getElementById('riskSummary')
};

let currentInputType = 'text';
// Variable para guardar la key temporalmente
let CACHED_API_KEY = null;

function init() {
    if (!elements.analyzeBtn) return;
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
    elements.inputModeText.addEventListener('click', () => switchInputMode('text'));
    elements.inputModeUrl.addEventListener('click', () => switchInputMode('url'));
    elements.textarea.addEventListener('input', handleTextInput);
    elements.analyzeBtn.addEventListener('click', analyzePrivacy);

    if (elements.pdfUpload) elements.pdfUpload.addEventListener('change', handlePdfUpload);
    window.switchTab = switchTab;
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

// --- OBTENER API KEY SEGURA ---
async function getApiKey() {
    if (CACHED_API_KEY) return CACHED_API_KEY;

    try {
        const response = await fetch('/.netlify/functions/get-apikey');
        if (!response.ok) throw new Error("No se pudo obtener la configuración de seguridad.");
        const data = await response.json();
        if (!data.key) throw new Error("Clave de API no encontrada en el servidor.");

        CACHED_API_KEY = data.key;
        return CACHED_API_KEY;
    } catch (error) {
        console.error("Auth Error:", error);
        throw new Error("Error de autenticación. Verifica las variables de entorno en Netlify.");
    }
}

async function fetchUrlContent(url) {
    const readerUrl = `https://r.jina.ai/${url}`;
    try {
        const response = await fetch(readerUrl, { headers: { 'x-no-cache': 'true' } });
        if (!response.ok) throw new Error("El servicio de lectura no pudo acceder al sitio.");
        let text = await response.text();
        if (!text || text.length < 100 || text.includes("Jina AI - Access Denied")) {
            throw new Error("El sitio web tiene protección anti-bot muy estricta.");
        }
        return text.slice(0, 100000);
    } catch (error) {
        throw new Error("No se pudo descargar la web automáticamente.");
    }
}

// --- IA DIRECTA ---
async function callGeminiDirect(text, promptContext) {
    // 1. Obtenemos la clave de forma segura antes de llamar a Google
    const apiKey = await getApiKey();

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // === PROMPT OPTIMIZADO PARA BREVEDAD ===
    const systemPrompt = `Actúa como CISO asesorando a un USUARIO COMUN. ${promptContext}
    
    OBJETIVO: Generar un reporte EXTREMADAMENTE CONCISO y resumido.
    NO transcribas el texto original. Solo extrae los puntos clave.
    
    INSTRUCCIONES DE SALIDA:
    1. Usa listas con viñetas (bullets) cortas para TODO.
    2. Sé directo y claro.

    Estructura OBLIGATORIA:
    ## Resumen Ejecutivo
    (Máximo 3 puntos clave sobre el riesgo general).

    ## Datos Recolectados
    (Lista breve de datos sensibles).

    ## Compartición con Terceros
    (Lista breve de quién recibe datos).

    ## Banderas Rojas
    (Lista de las cláusulas más peligrosas).

    ## Retención y Derechos
    (Lista breve sobre tiempos y cómo borrar).

    ## Recomendaciones para el Usuario
    (3 acciones prácticas que el usuario debe tomar).`;

    const fullPrompt = `${systemPrompt}\n\n--- TEXTO A ANALIZAR ---\n${text}`;

    // INTENTOS (RETRY LOGIC)
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const result = await model.generateContent(fullPrompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.warn(`Intento ${attempt} fallido:`, error.message);
            lastError = error;
            
            if (error.message.includes("503") || error.message.includes("overloaded")) {
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    continue;
                }
            }
            throw error;
        }
    }
    throw new Error("El servidor de Google está muy saturado. Intenta de nuevo en 1 minuto.");
}

// --- FLUJO PRINCIPAL ---
async function analyzePrivacy() {
    hideResults();
    let textToAnalyze = "";

    try {
        if (currentInputType === 'url') {
            const url = elements.urlInput.value.trim();
            if (!url.startsWith('http')) { alert('URL inválida'); return; }
            toggleLoading(true, 0, "Conectando con lector inteligente...");
            setTimeout(() => updateProgress(30, "Descargando y limpiando contenido..."), 800);
            textToAnalyze = await fetchUrlContent(url);
            if (textToAnalyze.length < 200) throw new Error("Sitio web vacío.");
        } else {
            textToAnalyze = elements.textarea.value.trim();
        }

        if (textToAnalyze.length < 50) return;

        if (textToAnalyze.length <= CHUNK_SIZE) {
            toggleLoading(true, 50, "Analizando con IA...");
            const markdown = await callGeminiDirect(textToAnalyze, "Analisis Completo");
            updateProgress(100, "Finalizando...");
            setTimeout(() => processFinalResult(markdown), 800);
        } else {
            const chunks = splitTextSafe(textToAnalyze, CHUNK_SIZE);
            const partials = [];
            toggleLoading(true, 0, "Iniciando análisis secuencial...");

            for (let i = 0; i < chunks.length; i++) {
                const progress = Math.round(((i) / chunks.length) * 90);
                updateProgress(progress, `Analizando sección ${i + 1} de ${chunks.length}...`);
                const context = `(Parte ${i + 1} de ${chunks.length}). Extrae SOLO puntos clave muy resumidos.`;
                const res = await callGeminiDirect(chunks[i], context);
                partials.push(res);
                await new Promise(r => setTimeout(r, 500));
            }

            updateProgress(90, "Unificando reporte final...");
            const combined = partials.join("\n\n");
            const finalReport = await callGeminiDirect(combined, "Fusiona estos reportes en un RESUMEN FINAL MUY CORTO Y CONCISO. Elimina todo lo repetitivo.");
            updateProgress(100, "¡Listo!");
            setTimeout(() => processFinalResult(finalReport), 800);
        }

    } catch (error) {
        console.error(error);
        alert(`❌ Error: ${error.message}`);
        toggleLoading(false);
    }
}

// --- UTILIDADES ---
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        toggleLoading(true, 0, "Leyendo PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
            const pct = Math.round((i / pdf.numPages) * 100);
            updateProgress(pct, `Leyendo página ${i} de ${pdf.numPages}...`);
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
    if (elements.analyzeBtn) elements.analyzeBtn.disabled = count < 50;
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

// --- NUEVA FUNCIÓN PARA CALCULAR EL RIESGO ---
function calculateRisk(markdown) {
    // 1. Extraer la sección de banderas rojas
    const riskSectionMatch = markdown.match(/## Banderas Rojas\s+([\s\S]*?)(?=## |$)/i);
    if (!riskSectionMatch || !riskSectionMatch[1]) return 'low';

    const riskContent = riskSectionMatch[1].trim();
    
    // 2. Contar los bullets (* o -) que indican una bandera
    const redFlagsCount = riskContent.split('\n')
        .filter(line => /^\s*[-*]\s+/.test(line))
        .length;

    // 3. Determinar nivel
    if (redFlagsCount === 0) return 'low';
    if (redFlagsCount <= 3) return 'medium';
    return 'high';
}

// --- NUEVA FUNCIÓN PARA ACTUALIZAR EL SEMÁFORO ---
function updateRiskGauge(riskLevel) {
    const container = elements.riskGaugeContainer;
    const icon = elements.riskIcon;
    const label = elements.riskLabel;
    const summary = elements.riskSummary;

    // Reset classes
    container.classList.remove('risk-low', 'risk-medium', 'risk-high');

    switch(riskLevel) {
        case 'low':
            container.classList.add('risk-low');
            icon.textContent = '🟢';
            label.textContent = 'Bajo Riesgo';
            summary.textContent = 'Parece ser una política estándar con pocas cláusulas preocupantes.';
            break;
        case 'medium':
            container.classList.add('risk-medium');
            icon.textContent = '🟡';
            label.textContent = 'Riesgo Medio';
            summary.textContent = 'Se detectaron algunas cláusulas que requieren tu atención.';
            break;
        case 'high':
            container.classList.add('risk-high');
            icon.textContent = '🔴';
            label.textContent = 'Alto Riesgo';
            summary.textContent = 'Contiene múltiples cláusulas que podrían comprometer tu privacidad.';
            break;
    }
}

function processFinalResult(markdown) {
    window.currentMarkdown = markdown;
    
    // --- NUEVO: Calcular y mostrar riesgo en el semáforo ---
    const riskLevel = calculateRisk(markdown);
    updateRiskGauge(riskLevel);
    // -------------------------------------------------------

    if (window.parseMarkdown) {
        elements.reportContent.innerHTML = window.parseMarkdown(markdown);
        const risks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/);
        elements.riskContent.innerHTML = risks ? window.parseMarkdown(risks[0]) : "✅ Sin riesgos críticos.";
    } else {
        elements.reportContent.innerText = markdown;
    }
    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    toggleLoading(false);
}

function toggleLoading(show, percent = 0, text = "Cargando...") {
    if (show) {
        elements.loadingState.classList.add('active');
        elements.resultsSection.classList.remove('active');
        updateProgress(percent, text);
    } else {
        elements.loadingState.classList.remove('active');
    }
}

function updateProgress(percent, text) {
    if (elements.progressBar) elements.progressBar.style.width = `${percent}%`;
    if (elements.loadingPercent) elements.loadingPercent.textContent = `${percent}%`;
    if (elements.loadingText && text) elements.loadingText.textContent = text;
}

function hideResults() {
    elements.resultsSection.classList.remove('active');
    // Reset del semáforo al ocultar resultados
    elements.riskGaugeContainer.classList.remove('risk-low', 'risk-medium', 'risk-high');
    elements.riskIcon.textContent = '🟢';
    elements.riskLabel.textContent = 'Analizando...';
    elements.riskSummary.textContent = '';
}

function switchTab(index) {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.tab-panel').forEach((panel, i) => {
        panel.classList.toggle('active', i === index);
    });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();