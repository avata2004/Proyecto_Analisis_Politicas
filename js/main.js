/**
 * Privacy Guard 
 * Modelo: Gemini 2.5 Flash
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

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
    riskGaugeContainer: document.getElementById('riskGaugeContainer'),
    riskIndicator: document.getElementById('riskIndicator'),
    riskLabel: document.getElementById('riskLabel'),
    riskSummary: document.getElementById('riskSummary')
};

let currentInputType = 'text';
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
        throw new Error("Error de autenticación. Verifica las variables de entorno.");
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
        return text; // Ya no recortamos artificialmente
    } catch (error) {
        throw new Error("No se pudo descargar la web automáticamente.");
    }
}

// --- IA DIRECTA ---
async function callGeminiDirect(text) {
    const apiKey = await getApiKey();
    const genAI = new GoogleGenerativeAI(apiKey);
    // Usamos el modelo Flash que tiene ventana de contexto masiva (1M tokens)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const systemPrompt = `Actúa como experto legal y CISO asesorando a un USUARIO COMUN.
    
    OBJETIVO: Generar un reporte EXTREMADAMENTE CONCISO y resumido.

    INSTRUCCIONES DE SALIDA:
    1. Usa listas con viñetas (bullets) cortas.
    2. Sé directo.
    3. Empieza directo con el título.

    Estructura OBLIGATORIA:
    ## Resumen Ejecutivo
    (Máximo 5 líneas).

    ## Datos Recolectados
    (Lista breve).

    ## Compartición con Terceros
    (Resumen breve).

    ## Banderas Rojas
    (CRÍTICO: Usa una lista de viñetas ("- ") para cada riesgo detectado. Si no hay riesgos graves, escribe "Ninguno". Solo menciona cláusulas realmente abusivas o peligrosas, citando textualmente si es necesario).    
    
    ## Retención y Derechos
    (Brevemente).

    ## Recomendaciones para el Usuario
    (3 acciones prácticas respecto al texto que el usuario proporcionó).`;

    const fullPrompt = `${systemPrompt}\n\n--- TEXTO A ANALIZAR ---\n${text}`;



    try {
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Error:", error);
        if (error.message.includes("429")) throw new Error("Límite de cuota excedido. Intenta en unos minutos.");
        if (error.message.includes("503")) throw new Error("Servidores de Google saturados.");
        throw error;
    }
}

// --- FLUJO PRINCIPAL OPTIMIZADO ---
async function analyzePrivacy() {
    hideResults();
    let textToAnalyze = "";

    try {
        // 1. Obtención del Texto
        if (currentInputType === 'url') {
            const url = elements.urlInput.value.trim();
            if (!url.startsWith('http')) { alert('URL inválida'); return; }

            toggleLoading(true, 10, "Conectando con lector inteligente...");
            // Pequeño delay visual
            setTimeout(() => updateProgress(30, "Descargando contenido completo..."), 500);

            textToAnalyze = await fetchUrlContent(url);

            if (!textToAnalyze || textToAnalyze.length < 200) throw new Error("Sitio web vacío o inaccesible.");
        } else {
            textToAnalyze = elements.textarea.value.trim();
        }

        if (textToAnalyze.length < 50) {
            alert("El texto es muy corto para analizar.");
            toggleLoading(false);
            return;
        }

        // 2. Análisis en una sola pasada
        // Enviamos todo el texto de golpe. Gemini Flash soporta ~700,000 palabras.
        // Tu límite de 100k caracteres es juego de niños para este modelo.

        toggleLoading(true, 50, "Analizando legalmente todo el documento...");

        const markdown = await callGeminiDirect(textToAnalyze);

        updateProgress(100, "Generando reporte...");
        setTimeout(() => processFinalResult(markdown), 800);

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
        toggleLoading(true, 0, "Procesando PDF...");
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = "";

        // Leemos todas las páginas
        for (let i = 1; i <= pdf.numPages; i++) {
            const pct = Math.round((i / pdf.numPages) * 100);
            updateProgress(pct, `Leyendo página ${i} de ${pdf.numPages}...`); // Feedback visual
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map(item => item.str).join(' ');
        }

        elements.textarea.value = fullText;
        handleTextInput();
        switchInputMode('text');
        toggleLoading(false);
    } catch (error) {
        console.error(error);
        alert('Error al leer el archivo PDF. Asegúrate de que no sea una imagen escaneada.');
        toggleLoading(false);
    }
    event.target.value = '';
}

function handleTextInput() {
    const count = elements.textarea.value.length;
    elements.charCount.textContent = count.toLocaleString();
    if (elements.analyzeBtn) elements.analyzeBtn.disabled = count < 50;
}

// --- CÁLCULO DE RIESGO ---
function calculateRisk(markdown) {
    // Buscamos la sección de banderas rojas
    const riskSectionMatch = markdown.match(/## Banderas Rojas[\s\S]*?(?=## |$)/i);

    // Si no encuentra la sección o está vacía, riesgo bajo
    if (!riskSectionMatch) return 'low';

    const riskContent = riskSectionMatch[0];

    // Contamos items de lista (bullets) en esa sección
    // Esto es una heurística: más bullets en "Banderas Rojas" = más peligro
    const redFlagsCount = (riskContent.match(/^[-*]\s/gm) || []).length;

    if (redFlagsCount <= 1) return 'low';
    if (redFlagsCount <= 4) return 'medium';
    return 'high';
}

// --- ACTUALIZACIÓN VISUAL (MINIMALISTA) ---
function updateRiskGauge(riskLevel) {
    const container = elements.riskGaugeContainer;
    const label = elements.riskLabel;
    const summary = elements.riskSummary;

    container.classList.remove('risk-low', 'risk-medium', 'risk-high');

    switch (riskLevel) {
        case 'low':
            container.classList.add('risk-low');
            label.textContent = 'Bajo Riesgo';
            summary.textContent = 'El documento parece estándar. No se detectaron cláusulas inusualmente agresivas.';
            break;
        case 'medium':
            container.classList.add('risk-medium');
            label.textContent = 'Riesgo Medio';
            summary.textContent = 'Atención: Hay cláusulas que limitan tus derechos o recolectan más datos de lo necesario.';
            break;
        case 'high':
            container.classList.add('risk-high');
            label.textContent = 'Alto Riesgo';
            summary.textContent = 'ALERTA: Se detectaron múltiples cláusulas abusivas, venta de datos o renuncias de derechos graves.';
            break;
    }
}

function processFinalResult(markdown) {
    window.currentMarkdown = markdown;

    const riskLevel = calculateRisk(markdown);
    updateRiskGauge(riskLevel);

    if (window.parseMarkdown) {
        elements.reportContent.innerHTML = window.parseMarkdown(markdown);

        // Extraemos solo la parte de riesgos para la pestaña de "Riesgos"
        const risksMatch = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/i);
        const risksText = risksMatch ? risksMatch[0] : "✅ No se detectaron riesgos críticos específicos.";
        elements.riskContent.innerHTML = window.parseMarkdown(risksText);
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
    elements.riskGaugeContainer.classList.remove('risk-low', 'risk-medium', 'risk-high');
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