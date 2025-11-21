/**
 * Privacy Guard - Main Application Logic
 * Versión optimizada para Netlify Free Tier (Timeouts estrictos)
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;

// CONFIGURACIÓN CRÍTICA PARA NETLIFY FREE
// 3500 chars = ~800 tokens. Esto da margen para que la IA responda en <10s.
const CHUNK_SIZE = 3500; 
const MAX_RETRIES = 2; // Intentos por bloque si falla

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
    pdfUpload: document.getElementById('pdfUpload')
};

/**
 * Inicialización
 */
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
// LÓGICA DE PDF
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
        alert('❌ Error al leer el archivo PDF.');
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

function splitTextSafe(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const paragraphs = text.split('\n');

    for (let paragraph of paragraphs) {
        if (paragraph.length > maxLength) {
            const words = paragraph.split(' ');
            for (let word of words) {
                if ((currentChunk + word).length > maxLength) {
                    chunks.push(currentChunk);
                    currentChunk = '';
                }
                currentChunk += word + ' ';
            }
        } else {
            if ((currentChunk + paragraph).length > maxLength) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
            currentChunk += paragraph + '\n';
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk);
    return chunks;
}

async function analyzePrivacy() {
    const text = elements.textarea.value.trim();
    if (text.length < 50) return;

    if (text.length > CHUNK_SIZE) {
        await analyzeLargeDocument(text);
    } else {
        await analyzeSingleBlock(text);
    }
}

async function analyzeSingleBlock(text) {
    toggleLoading(true, "Analizando documento...");
    try {
        const result = await callAnalyzeAPI(text, "General");
        processFinalResult(result, text.length);
    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Procesa documentos largos con reintentos automáticos
 */
async function analyzeLargeDocument(text) {
    const chunks = splitTextSafe(text, CHUNK_SIZE);
    let finalReport = "";
    let hasErrors = false;
    let failedSections = [];

    toggleLoading(true, `Iniciando análisis de ${chunks.length} secciones...`);

    try {
        for (let i = 0; i < chunks.length; i++) {
            let success = false;
            let attempt = 1;
            const chunkContext = `(Parte ${i + 1} de ${chunks.length}). Sé conciso.`;

            // Pausa de seguridad entre bloques (evita rate limits)
            if (i > 0) await new Promise(r => setTimeout(r, 2000));

            // BUCLE DE REINTENTOS
            while (!success && attempt <= MAX_RETRIES) {
                try {
                    // Actualizar UI con número de intento
                    const attemptMsg = attempt > 1 ? ` (Reintento ${attempt})` : "";
                    if(elements.loadingText) {
                        elements.loadingText.textContent = `Analizando parte ${i + 1} de ${chunks.length}${attemptMsg}...`;
                    }

                    const result = await callAnalyzeAPI(chunks[i], chunkContext);
                    finalReport += `\n\n# 📑 ANÁLISIS PARTE ${i + 1}\n---\n${result}`;
                    success = true; // ¡Éxito! Salimos del while

                } catch (err) {
                    console.warn(`Fallo en parte ${i+1}, intento ${attempt}`, err);
                    attempt++;
                    
                    // Si falló, esperamos 2 segundos extra antes de reintentar
                    if (attempt <= MAX_RETRIES) {
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }

            // Si después de los intentos sigue fallando:
            if (!success) {
                finalReport += `\n\n# ❌ ERROR EN PARTE ${i + 1}\nSección omitida por tiempo de espera.\n`;
                hasErrors = true;
                failedSections.push(i + 1);
            }
        }

        if (!finalReport.trim()) throw new Error("No se pudo obtener ningún resultado.");

        if (hasErrors) {
            alert(`⚠️ Análisis parcial completado.\nLas secciones ${failedSections.join(', ')} no pudieron procesarse por lentitud del servidor.`);
        }

        processFinalResult(finalReport, text.length);

    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

async function callAnalyzeAPI(textChunk, contextNote = "") {
    // Prompt optimizado para ser más rápido (menos verboso)
    const systemPrompt = `Eres CISO. Analizas una SECCIÓN de una política de privacidad.
    ${contextNote}
    
    Responde en MARKDOWN. Sé MUY BREVE y directo para evitar timeout.
    
    Estructura requerida:
    ## Datos Personales (Solo de esta sección)
    ## Terceros (Solo si menciona compartir datos)
    ## Banderas Rojas (Riesgos críticos en esta sección)
    ## Retención (Si se menciona)

    Si la sección no tiene información relevante, responde: "Sin hallazgos críticos en esta sección."
    Si no es texto legal, responde "ERROR_CONTEXTO".`;

    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemPrompt: systemPrompt,
            userText: textChunk
        })
    });

    if (!response.ok) throw new Error(`Timeout o Error ${response.status}`);

    const data = await response.json();
    if (data.content.includes('ERROR_CONTEXTO')) throw new Error("Texto inválido");
    
    return data.content;
}

function processFinalResult(markdown, totalChars) {
    currentMarkdown = markdown;
    currentCharCount = totalChars;

    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Regex ajustado para capturar mejor las secciones
    const allRisks = markdown.match(/## Banderas Rojas[\s\S]*?(?=(## |$))/g);
    
    if (allRisks && allRisks.length > 0) {
        // Filtramos secciones vacías o repetitivas
        const validRisks = allRisks.filter(r => r.length > 25 && !r.includes("Sin hallazgos"));
        
        if (validRisks.length > 0) {
            elements.riskContent.innerHTML = validRisks.map(r => parseMarkdown(r)).join('<hr class="risk-separator">');
        } else {
            elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se encontraron riesgos críticos específicos.</p>';
        }
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se detectaron banderas rojas críticas.</p>';
    }

    updateStatistics(totalChars);
    showResults();
    switchTab(0);
}

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
    if(elements.statDate) {
        elements.statDate.textContent = new Date().toLocaleDateString('es-MX', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }
}

function handleError(error) {
    console.error('Error:', error);
    alert(`❌ Ha ocurrido un error: ${error.message}`);
    toggleLoading(false);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}