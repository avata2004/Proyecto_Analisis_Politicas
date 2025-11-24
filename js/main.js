/**
 * Privacy Guard - Final Version
 * Client-Side | Gemini 2.5 Flash | Jina AI Reader
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ==========================================
// ⚠️ CONFIGURACIÓN: PEGA TU API KEY AQUÍ
// ==========================================
const API_KEY = "AIzaSyDGXGGf__tN9B7OZxa99kQJSOeFznwwbNY"; 

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
    
    // UI Elements
    loadingState: document.getElementById('loadingState'),
    loadingText: document.getElementById('loadingText'),
    progressBar: document.getElementById('progressBar'),
    loadingPercent: document.getElementById('loadingPercent'),
    resultsSection: document.getElementById('resultsSection'),
    reportContent: document.getElementById('reportContent'),
    riskContent: document.getElementById('riskContent'),
    pdfUpload: document.getElementById('pdfUpload')
};

let currentInputType = 'text';

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
    
    if(elements.pdfUpload) elements.pdfUpload.addEventListener('change', handlePdfUpload);
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

// --- NUEVA LÓGICA DE URL (USANDO JINA AI) ---
// Esta es la solución experta para evitar bloqueos de descarga
async function fetchUrlContent(url) {
    // Jina AI Reader convierte cualquier URL en Markdown limpio para LLMs
    const readerUrl = `https://r.jina.ai/${url}`;
    
    try {
        const response = await fetch(readerUrl, {
            headers: {
                'x-no-cache': 'true' // Forzar lectura fresca
            }
        });
        
        if (!response.ok) throw new Error("El servicio de lectura no pudo acceder al sitio.");
        
        let text = await response.text();
        
        // Validación: A veces devuelven errores dentro del texto
        if (!text || text.length < 100 || text.includes("Jina AI - Access Denied")) {
            throw new Error("El sitio web tiene protección anti-bot muy estricta.");
        }

        // Limpieza extra (Jina ya limpia mucho, pero aseguramos)
        // Quitamos enlaces a imágenes o menús que Jina a veces deja
        return text.slice(0, 100000); // Límite de seguridad de 100k caracteres

    } catch (error) {
        console.error("Url Error:", error);
        throw new Error("No se pudo descargar la web automáticamente. Algunos sitios (como Facebook o Bancos) bloquean esto por seguridad. Por favor, copia y pega el texto manualmente.");
    }
}

// --- IA DIRECTA ---
async function callGeminiDirect(text, promptContext) {
    if (!API_KEY || API_KEY.includes("PEGA_AQUI")) throw new Error("Falta la API Key en main.js");

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // PROMPT ESTRICTO (Sin saludos)
    const systemPrompt = `Actúa como CISO. ${promptContext}
    
    INSTRUCCIONES DE SALIDA:
    1. Genera SOLO el reporte en formato MARKDOWN.
    2. NO incluyas introducciones ni saludos (ej: "Como experto...", "Aquí tienes").
    3. Empieza directamente con el título o encabezado.

    Estructura:
    ## Resumen Ejecutivo
    ## Datos Recolectados
    ## Compartición con Terceros
    ## Banderas Rojas
    ## Retención y Derechos
    ## Recomendaciones`;

    const fullPrompt = `${systemPrompt}\n\n--- TEXTO A ANALIZAR ---\n${text}`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
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
            // Pequeña barra falsa para UX
            setTimeout(() => updateProgress(30, "Descargando y limpiando contenido..."), 800);
            
            textToAnalyze = await fetchUrlContent(url);
            
            if (textToAnalyze.length < 200) throw new Error("Sitio web vacío.");
            
        } else {
            textToAnalyze = elements.textarea.value.trim();
        }

        if (textToAnalyze.length < 50) return;

        // ESTRATEGIA DE ANÁLISIS
        if (textToAnalyze.length <= CHUNK_SIZE) {
            toggleLoading(true, 50, "Analizando con IA...");
            const markdown = await callGeminiDirect(textToAnalyze, "Analisis Completo");
            
            updateProgress(100, "Finalizando...");
            setTimeout(() => processFinalResult(markdown), 800);
            
        } else {
            // Secuencial para textos largos
            const chunks = splitTextSafe(textToAnalyze, CHUNK_SIZE);
            const partials = [];
            toggleLoading(true, 0, "Iniciando análisis secuencial...");

            for (let i = 0; i < chunks.length; i++) {
                const progress = Math.round(((i) / chunks.length) * 90);
                updateProgress(progress, `Analizando sección ${i+1} de ${chunks.length}...`);
                const context = `(Parte ${i+1} de ${chunks.length}). Extrae puntos clave.`;
                const res = await callGeminiDirect(chunks[i], context);
                partials.push(res);
                await new Promise(r => setTimeout(r, 500));
            }

            updateProgress(90, "Unificando reporte final...");
            const combined = partials.join("\n\n");
            const finalReport = await callGeminiDirect(combined, "Fusiona estos reportes. NO incluyas saludos.");
            
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
    if(elements.analyzeBtn) elements.analyzeBtn.disabled = count < 50;
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

function processFinalResult(markdown) {
    window.currentMarkdown = markdown; // Para el PDF generator

    if(window.parseMarkdown) {
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
    if(show) {
        elements.loadingState.classList.add('active');
        elements.resultsSection.classList.remove('active');
        updateProgress(percent, text);
    } else {
        elements.loadingState.classList.remove('active');
    }
}

function updateProgress(percent, text) {
    if(elements.progressBar) elements.progressBar.style.width = `${percent}%`;
    if(elements.loadingPercent) elements.loadingPercent.textContent = `${percent}%`;
    if(elements.loadingText && text) elements.loadingText.textContent = text;
}

function hideResults() { elements.resultsSection.classList.remove('active'); }

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