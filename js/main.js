/**
 * Privacy Guard - Versión Client-Side (Sin Backend)
 * Elimina problemas de Timeout de Netlify y errores de conexión.
 */

// Importamos la librería directamente desde la web (gracias al importmap en index.html)
import { GoogleGenerativeAI } from "@google/generative-ai";

// ==========================================
// ⚠️ CONFIGURACIÓN: PEGA TU API KEY AQUÍ
// ==========================================
const API_KEY = "AIzaSyDGXGGf__tN9B7OZxa99kQJSOeFznwwbNY"; 

// Configuración de límites (Ahora podemos subir más porque no hay timeout de 10s)
const CHUNK_SIZE = 30000; 

// Elementos del DOM
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
    pdfUpload: document.getElementById('pdfUpload')
};

let currentInputType = 'text';

// Inicialización
function init() {
    if (!elements.analyzeBtn) return; // Esperar al DOM
    setupEventListeners();
    hideResults();
}

function setupEventListeners() {
    elements.inputModeText.addEventListener('click', () => switchInputMode('text'));
    elements.inputModeUrl.addEventListener('click', () => switchInputMode('url'));
    elements.textarea.addEventListener('input', handleTextInput);
    elements.analyzeBtn.addEventListener('click', analyzePrivacy); // Ojo: sin onclick en HTML
    
    if(elements.pdfUpload) elements.pdfUpload.addEventListener('change', handlePdfUpload);
    
    // Funciones globales para que el HTML las vea (tab switch, etc)
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

// --- UTILIDAD: Proxy CORS para URLs ---
async function fetchUrlContent(url) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("No se pudo conectar al sitio web");
    const data = await response.json();
    if (!data.contents) throw new Error("Sitio vacío o bloqueado");

    return data.contents
        .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, " ")
        .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, " ")
        .replace(/<[^>]+>/g, "\n")
        .replace(/\s+/g, " ")
        .trim();
}

// --- LÓGICA DE IA DIRECTA (CLIENT SIDE) ---
async function callGeminiDirect(text, promptContext) {
    if (!API_KEY || API_KEY.includes("AQUI_PEGA")) {
        throw new Error("Falta la API Key en main.js");
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    // Usamos Flash porque es rápido y barato
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `Actúa como Experto CISO. ${promptContext}
    Analiza el siguiente texto legal.
    Genera un reporte MARKDOWN bien estructurado.
    
    Estructura:
    ## Resumen Ejecutivo
    ## Datos Recolectados
    ## Compartición con Terceros
    ## Banderas Rojas (Riesgos Críticos)
    ## Retención y Derechos
    ## Recomendaciones`;

    const fullPrompt = `${systemPrompt}\n\n--- TEXTO ---\n${text}`;

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
            toggleLoading(true, "Descargando sitio web...");
            textToAnalyze = await fetchUrlContent(url);
            if (textToAnalyze.length < 200) throw new Error("Sitio web vacío o ilegible.");
        } else {
            textToAnalyze = elements.textarea.value.trim();
        }

        if (textToAnalyze.length < 50) return;

        // ESTRATEGIA: Si es corto, 1 llamada. Si es largo, secuencial.
        if (textToAnalyze.length <= CHUNK_SIZE) {
            toggleLoading(true, "Analizando con IA...");
            const markdown = await callGeminiDirect(textToAnalyze, "Analisis Completo");
            processFinalResult(markdown);
        } else {
            // Secuencial
            const chunks = splitTextSafe(textToAnalyze, CHUNK_SIZE);
            const partials = [];
            
            for (let i = 0; i < chunks.length; i++) {
                toggleLoading(true, `Analizando parte ${i+1} de ${chunks.length}...`);
                const context = `(Parte ${i+1} de ${chunks.length}). Extrae puntos clave.`;
                const res = await callGeminiDirect(chunks[i], context);
                partials.push(res);
                // Pequeña pausa para no saturar la API
                await new Promise(r => setTimeout(r, 1000));
            }

            toggleLoading(true, "Unificando reporte final...");
            const combined = partials.join("\n\n");
            const finalReport = await callGeminiDirect(combined, "Fusiona estos reportes parciales en uno solo coherente. Elimina duplicados.");
            processFinalResult(finalReport);
        }

    } catch (error) {
        console.error(error);
        alert(`❌ Error: ${error.message}`);
        toggleLoading(false);
    }
}

// Utilidades PDF y Texto
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
    if(window.parseMarkdown) {
        elements.reportContent.innerHTML = window.parseMarkdown(markdown);
        const risks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/);
        elements.riskContent.innerHTML = risks ? window.parseMarkdown(risks[0]) : "✅ Sin riesgos críticos.";
    } else {
        elements.reportContent.innerText = markdown; // Fallback
    }
    
    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    toggleLoading(false);
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

function switchTab(index) {
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    document.querySelectorAll('.tab-panel').forEach((panel, i) => {
        panel.classList.toggle('active', i === index);
    });
}

// Iniciar
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();