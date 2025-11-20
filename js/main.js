/**
 * Privacy Guard - Main Application Logic
 * Gestiona el flujo principal de la aplicación
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;
let currentInputMode = 'text'; // 'text' o 'file'
let selectedFile = null;

// Elementos del DOM
const elements = {
    textarea: document.getElementById('privacyText'),
    charCount: document.getElementById('charCount'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    loadingState: document.getElementById('loadingState'),
    resultsSection: document.getElementById('resultsSection'),
    reportContent: document.getElementById('reportContent'),
    riskContent: document.getElementById('riskContent'),
    statChars: document.getElementById('statChars'),
    statModel: document.getElementById('statModel'),
    statDate: document.getElementById('statDate'),
    pdfFile: document.getElementById('pdfFile'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileSize: document.getElementById('fileSize'),
    textInputMode: document.getElementById('textInputMode'),
    fileInputMode: document.getElementById('fileInputMode')
};

/**
 * Inicialización de la aplicación
 */
function init() {
    setupEventListeners();
    hideResults();
}

/**
 * Configura los event listeners
 */
function setupEventListeners() {
    elements.textarea.addEventListener('input', handleTextInput);
}

/**
 * Maneja el cambio de texto en el textarea
 */
function handleTextInput() {
    const count = elements.textarea.value.length;
    elements.charCount.textContent = count;
    elements.analyzeBtn.disabled = count < 50;
}

/**
 * Cambia entre tabs
 * @param {number} index - Índice del tab
 */
function switchTab(index) {
    // Actualizar botones de tabs
    document.querySelectorAll('.tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    // Actualizar paneles de tabs
    document.querySelectorAll('.tab-panel').forEach((panel, i) => {
        panel.classList.toggle('active', i === index);
    });
}

/**
 * Muestra el estado de carga
 */
function showLoading() {
    elements.loadingState.classList.add('active');
    elements.resultsSection.classList.remove('active');
    elements.analyzeBtn.disabled = true;
}

/**
 * Oculta el estado de carga
 */
function hideLoading() {
    elements.loadingState.classList.remove('active');
    elements.analyzeBtn.disabled = false;
}

/**
 * Muestra los resultados
 */
function showResults() {
    elements.resultsSection.classList.add('active');
    elements.resultsSection.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest' 
    });
}

/**
 * Oculta los resultados
 */
function hideResults() {
    elements.resultsSection.classList.remove('active');
}

/**
 * Función principal de análisis
 */
async function analyzePrivacy() {
    const text = elements.textarea.value.trim();

    // Validación de entrada
    if (text.length < 50) {
        alert('⚠️ El texto es muy corto para un análisis significativo (mínimo 50 caracteres).');
        return;
    }

    // Mostrar loading
    showLoading();

    // Prompt del sistema
    const systemPrompt = `Actúa como un experto senior en Ciberseguridad y Privacidad de Datos (CISO). 
Tu tarea es analizar los siguientes "Términos y Condiciones" o "Política de Privacidad".

Debes generar un reporte estructurado en formato MARKDOWN.
El tono debe ser profesional pero comprensible para un usuario promedio.

Estructura OBLIGATORIA de la respuesta:

## Resumen Ejecutivo
(Máx 100 palabras) Una visión general del nivel de intrusión.

## Datos Personales Recolectados
Lista con viñetas (e.g., email, ubicación, IP, datos biométricos).

## Compartición con Terceros
¿A quién le venden o dan los datos? (Partners, anunciantes, gobierno).

## Banderas Rojas (Riesgos Altos)
Cláusulas peligrosas, renuncias de derechos excesivas o retención indefinida.

## Retención y Derechos
Cuánto tiempo guardan los datos y cómo borrarlos.

## Recomendaciones de Seguridad
3 consejos prácticos para el usuario basados en este texto.

Si el texto proporcionado NO parece ser un término legal o política de privacidad, responde solamente: "ERROR_CONTEXTO: El texto proporcionado no parece ser un documento legal válido para analizar."`;

    try {
        // Llamada a la API
        const response = await fetch("/.netlify/functions/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemPrompt: systemPrompt,
                userText: text
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Error ${response.status}`);
        }

        const data = await response.json();
        const aiResponse = data.content;

        // Validar respuesta
        if (aiResponse.includes('ERROR_CONTEXTO')) {
            alert('❌ El texto no parece ser un documento legal válido.');
            hideLoading();
            return;
        }

        // Guardar datos globales
        currentMarkdown = aiResponse;
        currentCharCount = text.length;

        // Mostrar resultados
        displayResults(aiResponse, text.length);

    } catch (error) {
        console.error('Error completo:', error);
        alert(`❌ Error al analizar: ${error.message}\n\nPor favor, verifica tu conexión e intenta nuevamente.`);
    } finally {
        hideLoading();
    }
}

/**
 * Muestra los resultados del análisis
 * @param {string} markdown - Texto en formato markdown
 * @param {number} charCount - Cantidad de caracteres analizados
 */
function displayResults(markdown, charCount) {
    // Renderizar el reporte completo
    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Extraer y renderizar la sección de riesgos
    const risksSection = markdown.match(/## Banderas Rojas[\s\S]*?(?=## Retención|## Recomendaciones|$)/);
    if (risksSection) {
        elements.riskContent.innerHTML = parseMarkdown(risksSection[0]);
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se detectaron banderas rojas críticas en el análisis.</p>';
    }

    // Actualizar estadísticas
    updateStatistics(charCount);

    // Mostrar la sección de resultados
    showResults();
    
    // Activar el primer tab
    switchTab(0);
}

/**
 * Actualiza las estadísticas mostradas
 * @param {number} charCount - Cantidad de caracteres
 */
function updateStatistics(charCount) {
    elements.statChars.textContent = charCount.toLocaleString();
    elements.statModel.textContent = "Llama 3.3 70B";
    elements.statDate.textContent = new Date().toLocaleDateString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Maneja errores de la aplicación
 * @param {Error} error - Objeto de error
 */
function handleError(error) {
    console.error('Error:', error);
    alert(`❌ Ha ocurrido un error: ${error.message}`);
    hideLoading();
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}