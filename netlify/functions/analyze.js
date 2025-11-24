const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
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

    // --- LÓGICA NUEVA PARA LINKS ---
    if (inputType === 'url' && linkUrl) {
        try {
            console.log("Descargando URL:", linkUrl);
            const response = await fetch(linkUrl);
            if (!response.ok) throw new Error("No se pudo acceder a la URL");
            const html = await response.text();
            
            // Limpieza básica de HTML para obtener solo texto (sin librerías pesadas)
            userText = html
                .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "") // Quitar scripts
                .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "")   // Quitar estilos
                .replace(/<[^>]+>/g, "\n")                              // Quitar tags HTML
                .replace(/\s+/g, " ")                                   // Normalizar espacios
                .trim();
                
            if (userText.length < 100) throw new Error("No se encontró texto suficiente en la web.");
            
        } catch (err) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: `Error leyendo la URL: ${err.message}` })
            };
        }
    }

    // Inicializar Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    // Usamos 'gemini-1.5-flash' (o 'gemini-2.5-flash' si tu cuenta lo tiene)
    // Flash es CRÍTICO para velocidad.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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
    console.error("Error completo:", error);
    let msg = error.message || "Error desconocido";
    
    if (msg.includes("404")) msg = "Modelo no encontrado. Verifica el nombre del modelo en el código.";
    if (msg.includes("Timed out") || msg.includes("timed out")) msg = "El análisis tardó demasiado (Timeout).";

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error IA", details: msg }),
    };
  }
};