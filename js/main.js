/**
 * Privacy Guard - Main Application Logic
 * Versión: Chunking + Consolidación Final (Map-Reduce)
 */

// Variables globales
let currentMarkdown = '';
let currentCharCount = 0;

// Configuración
const CHUNK_SIZE = 3500; // Seguro para timeouts
const MAX_RETRIES = 2; 

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
// LÓGICA DE ANÁLISIS "MAP-REDUCE"
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
        // Prompt estándar para documentos cortos
        const prompt = `Actúa como CISO. Analiza este documento legal.
        Genera un reporte MARKDOWN:
        ## Resumen Ejecutivo
        ## Datos Personales Recolectados
        ## Compartición con Terceros
        ## Banderas Rojas
        ## Retención y Derechos
        ## Recomendaciones
        `;
        
        const result = await callAnalyzeAPI(text, prompt);
        processFinalResult(result, text.length);
    } catch (error) {
        handleError(error);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Estrategia Map-Reduce: 
 * 1. Analiza cada trozo para extraer datos (Map)
 * 2. Envía todos los datos extraídos para crear un resumen final (Reduce)
 */
async function analyzeLargeDocument(text) {
    const chunks = splitTextSafe(text, CHUNK_SIZE);
    let intermediateResults = []; // Aquí guardamos las notas de cada sección

    toggleLoading(true, `Iniciando análisis de ${chunks.length} secciones...`);

    try {
        // FASE 1: EXTRACCIÓN (MAP)
        for (let i = 0; i < chunks.length; i++) {
            let success = false;
            let attempt = 1;
            
            // Prompt enfocado en EXTRACCIÓN DE DATOS (no en formato final)
            const chunkPrompt = `Analiza esta SECCIÓN (${i+1}/${chunks.length}) de un contrato.
            Extrae SOLAMENTE en lista de bullets:
            - Datos personales específicos mencionados.
            - Terceros con quienes se comparten datos.
            - Cláusulas abusivas o riesgos (Banderas Rojas).
            - Periodos de retención.
            Sé muy conciso. No escribas introducciones.`;

            // Pausa entre peticiones
            if (i > 0) await new Promise(r => setTimeout(r, 1500));

            while (!success && attempt <= MAX_RETRIES) {
                try {
                    if(elements.loadingText) {
                        elements.loadingText.textContent = `Analizando parte ${i + 1} de ${chunks.length}...`;
                    }

                    const result = await callAnalyzeAPI(chunks[i], chunkPrompt);
                    intermediateResults.push(`--- NOTAS SECCIÓN ${i+1} ---\n${result}`);
                    success = true;
                } catch (err) {
                    console.warn(`Fallo parte ${i+1}`, err);
                    attempt++;
                    if (attempt <= MAX_RETRIES) await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // FASE 2: CONSOLIDACIÓN (REDUCE)
        if (intermediateResults.length > 0) {
            await generateFinalMasterReport(intermediateResults, text.length);
        } else {
            throw new Error("No se pudo extraer información de ninguna sección.");
        }

    } catch (error) {
        handleError(error);
        toggleLoading(false);
    }
}

/**
 * Genera el reporte final consolidado
 */
async function generateFinalMasterReport(notesArray, totalChars) {
    if(elements.loadingText) elements.loadingText.textContent = "Unificando resultados y generando reporte final...";
    
    // Unimos todas las notas en un solo texto
    const allNotes = notesArray.join("\n\n");

    // Prompt de consolidación
    const masterPrompt = `Actúa como CISO experto. A continuación te doy las NOTAS EXTRAÍDAS de varias secciones de un documento legal largo.
    
    Tu tarea es UNIFICAR y RESUMIR estas notas en un único reporte coherente.
    IMPORTANTE:
    - Elimina duplicados (ej: si "email" aparece en 5 secciones, ponlo una sola vez).
    - Si hay banderas rojas repetidas, únelas.
    - Mantén el formato MARKDOWN estricto.

    Estructura requerida:
    ## Resumen Ejecutivo
    (Visión global del riesgo)
    
    ## Datos Personales Recolectados
    (Lista unificada y limpia)

    ## Compartición con Terceros
    (Lista unificada de quién recibe los datos)

    ## Banderas Rojas (Riesgos Altos)
    (Las cláusulas más peligrosas encontradas en todo el documento)

    ## Retención y Derechos
    (Resumen de tiempos y cómo borrar datos)

    ## Recomendaciones de Seguridad
    (3 consejos finales)

    AQUÍ ESTÁN LAS NOTAS A PROCESAR:
    `;

    try {
        // Enviamos las notas a la IA para que escriba el reporte final
        // Nota: Usamos las notas como "userText"
        const finalReport = await callAnalyzeAPI(allNotes, masterPrompt);
        
        processFinalResult(finalReport, totalChars);
    } catch (error) {
        // Si falla la consolidación (timeout), mostramos las notas crudas como fallback
        console.error("Error en consolidación final:", error);
        alert("⚠️ El documento es muy complejo. Se mostrarán las notas de cada sección sin resumir.");
        const rawReport = "# ⚠️ Reporte No Consolidado\n" + allNotes;
        processFinalResult(rawReport, totalChars);
    } finally {
        toggleLoading(false);
    }
}

/**
 * Llamada genérica a la API
 */
async function callAnalyzeAPI(textToSend, promptInstruction) {
    const response = await fetch("/.netlify/functions/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemPrompt: promptInstruction,
            userText: textToSend
        })
    });

    if (!response.ok) throw new Error(`Error API: ${response.status}`);
    const data = await response.json();
    if (data.content.includes('ERROR_CONTEXTO')) throw new Error("Texto inválido");
    
    return data.content;
}

function processFinalResult(markdown, totalChars) {
    currentMarkdown = markdown;
    currentCharCount = totalChars;

    elements.reportContent.innerHTML = parseMarkdown(markdown);

    // Regex para extraer banderas rojas del reporte final
    const risksMatch = markdown.match(/## Banderas Rojas[\s\S]*?(?=## Retención|## |$)/);
    
    if (risksMatch) {
        elements.riskContent.innerHTML = parseMarkdown(risksMatch[0]);
    } else {
        elements.riskContent.innerHTML = '<p style="color: #10b981;">✅ No se encontraron riesgos críticos específicos en el reporte final.</p>';
    }

    updateStatistics(totalChars);
    showResults();
    switchTab(0);
}

// Utilidades UI (Sin cambios)
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