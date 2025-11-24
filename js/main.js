/**
 * Privacy Guard - Main Application Logic
 * Versión simplificada para uso con Google Gemini 1.5 Flash
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;

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
    statModel: document.getElementById('statModel'), // Si decidiste dejarlo en el HTML
    pdfUpload: document.getElementById('pdfUpload')
};

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
// LÓGICA DE PDF (Sin cambios)
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
        alert('❌ Error al leer el archivo PDF. Asegúrate de que no esté protegido.');
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
// LÓGICA DE ANÁLISIS (SIMPLIFICADA PARA GEMINI)
// ==========================================

async function analyzePrivacy() {
    const text = elements.textarea.value.trim();

    // Validación básica
    if (text.length < 50) {
        alert('⚠️ El texto es muy corto para un análisis significativo (mínimo 50 caracteres).');
        return;
    }

    // Mensaje de carga
    toggleLoading(true, "Analizando documento completo con IA...");

    // Prompt del sistema (Instrucciones para Gemini)
    const systemPrompt = `Actúa como un experto senior en Ciberseguridad y Privacidad de Datos (CISO).
Tu tarea es analizar los siguientes "Términos y Condiciones" o "Política de Privacidad".

Debes generar un reporte estructurado estrictamente en formato MARKDOWN.
El tono debe ser profesional, objetivo y claro para un usuario promedio.

Estructura OBLIGATORIA de la respuesta:

## Resumen Ejecutivo
(Un párrafo conciso de máx 100 palabras sobre el nivel general de intrusión).

## Datos Personales Recolectados
(Lista con viñetas exhaustiva de qué datos se llevan: e.g., • Datos de contacto, • Ubicación precisa, • Datos biométricos).

## Compartición con Terceros
(¿A quién le dan los datos? Socios, anunciantes, autoridades).

## Banderas Rojas (Riesgos Altos)
(Analiza críticamente: cláusulas abusivas, renuncias de derechos, retención indefinida, venta de datos. Si no hay riesgos graves, indícalo).

## Retención y Derechos
(Cuánto tiempo guardan los datos y el proceso para borrarlos).

## Recomendaciones de Seguridad
(3 consejos prácticos accionables para el usuario).

Si el texto proporcionado NO parece ser un documento legal, responde ÚNICAMENTE: "ERROR_CONTEXTO".`;

    try {
        // Llamada única a la API
        const response = await fetch("/.netlify/functions/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemPrompt: systemPrompt,
                userText: text
            })
        });

        if (!response.ok) {
            // Intentar leer el mensaje de error del backend si existe
            let errorMsg = `Error ${response.status}`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch(e) {}
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const aiResponse = data.content;

        // Validar respuesta de contexto
        if (aiResponse && aiResponse.includes('ERROR_CONTEXTO')) {
            alert('❌ El texto analizado no parece ser un documento legal válido.');
            return;
        }

        processFinalResult(aiResponse, text.length);

    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}


/**
 * Procesa y muestra los resultados finales
 */
function processFinalResult(markdown, totalChars) {
    currentMarkdown = markdown;
    currentCharCount = totalChars;

    // Renderizar Markdown completo
    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Extraer sección de riesgos para su pestaña
    const risksMatch = markdown.match(/## Banderas Rojas[\s\S]*?(?=## Retención|## |$)/);
    
    if (risksMatch && risksMatch[0].length > 30) {
        elements.riskContent.innerHTML = parseMarkdown(risksMatch[0]);
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se detectaron banderas rojas críticas en el análisis.</p>';
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
    
    // Si decidiste mantener el elemento en el HTML, lo actualizamos
    if(elements.statModel) elements.statModel.textContent = "Gemini 1.5 Flash";

    if(elements.statDate) {
        elements.statDate.textContent = new Date().toLocaleDateString('es-MX', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
}

function handleError(error) {
    console.error('Error completo:', error);
    alert(`❌ Ha ocurrido un error: ${error.message}\n\nSi el documento es extremadamente largo, podría ser un límite de tiempo del servidor gratuito.`);
    toggleLoading(false);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}