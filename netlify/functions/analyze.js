const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // Solo permitir POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Falta API Key" }) };
  }

  try {
    const body = JSON.parse(event.body);
    let { systemPrompt, userText, inputType, linkUrl } = body;

    // --- LÓGICA DE SCRAPING MEJORADA (SOLUCIÓN ERROR URL) ---
    if (inputType === 'url' && linkUrl) {
        try {
            console.log("Intentando descargar URL:", linkUrl);
            
            // Simular un navegador real para evitar bloqueos
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache"
            };

            const response = await fetch(linkUrl, { headers });
            
            if (!response.ok) {
                throw new Error(`El sitio web rechazó la conexión (Status: ${response.status})`);
            }
            
            const html = await response.text();
            
            // Limpieza PROFUNDA de HTML (Quita ruido para que la IA entienda mejor)
            userText = html
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, " ") // Quitar JS
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, " ")   // Quitar CSS
                .replace(/<nav\b[^>]*>([\s\S]*?)<\/nav>/gim, " ")       // Quitar menús nav
                .replace(/<footer\b[^>]*>([\s\S]*?)<\/footer>/gim, " ") // Quitar footer
                .replace(/<[^>]+>/g, "\n")                              // Quitar tags HTML
                .replace(/&nbsp;/g, " ")
                .replace(/\s+/g, " ")                                   // Colapsar espacios
                .trim();
                
            if (userText.length < 200) throw new Error("La página parece vacía o protegida contra lectura.");
            
        } catch (err) {
            console.error("Error Fetching URL:", err);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `No pudimos leer el sitio web. ${err.message}` })
            };
        }
    }

    // Inicializar Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Usamos el modelo Flash. Si tienes acceso a gemini-2.5-flash úsalo, si no gemini-1.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prompt final
    const finalPrompt = `${systemPrompt}\n\n--- TEXTO A ANALIZAR ---\n${userText}`;

    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, charCount: userText.length }),
    };

  } catch (error) {
    console.error("Error IA:", error);
    let msg = error.message || "Error desconocido";
    
    if (msg.includes("404")) msg = "Modelo IA no encontrado. Verifica la configuración.";
    if (msg.includes("Timed out") || msg.includes("timed out")) msg = "El análisis tardó demasiado (Timeout de Netlify).";

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error de IA", details: msg }),
    };
  }
};