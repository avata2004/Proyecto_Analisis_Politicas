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
    const { systemPrompt, userText } = body; // Ya no manejamos URLs aquí

    if (!userText || userText.length < 10) {
        return { statusCode: 400, body: JSON.stringify({ error: "Texto vacío o muy corto." }) };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Usamos Flash por velocidad crítica
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const finalPrompt = `${systemPrompt}\n\n--- TEXTO A ANALIZAR ---\n${userText}`;

    // Generar contenido
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    };

  } catch (error) {
    console.error("Error IA:", error);
    let msg = error.message || "Error desconocido";
    
    // Detectar Timeout de Netlify disfrazado
    if (msg.includes("500") || msg.includes("timeout")) msg = "Tiempo de espera agotado (Límite 10s Netlify).";

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error de IA", details: msg }),
    };
  }
};