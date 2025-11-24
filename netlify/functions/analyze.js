const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // 1. Solo permitir peticiones POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2. Verificar API Key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
        statusCode: 500,
        body: JSON.stringify({ error: "Falta la API Key en la configuración del servidor." })
    };
  }

  try {
    const { systemPrompt, userText } = JSON.parse(event.body);

    // 3. Inicializar Google AI
    const genAI = new GoogleGenerativeAI(apiKey);

    // === CAMBIO CLAVE AQUÍ ===
    // Usamos el modelo que aparece en tu lista: "Gemini 2.5 Flash".
    // ID probable: "gemini-2.5-flash" (o "gemini-2.5-flash-001" a veces).
    // Usamos la versión Flash para evitar el timeout de 10s de Netlify.
    // Si quisieras el 3 Pro, cambiarías esto a "gemini-3-pro", pero podría ser muy lento.
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 4. Configurar Prompt
    const finalPrompt = `${systemPrompt}\n\n--- DOCUMENTO A ANALIZAR ---\n${userText}`;

    // 5. Generar contenido
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    };

  } catch (error) {
    console.error("Error Gemini:", error);
    
    let errorMessage = error.message || "Error desconocido";
    
    // Si vuelve a dar 404, es posible que el ID interno sea ligeramente diferente
    if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        errorMessage = `El modelo 'gemini-2.5-flash' no fue encontrado. 
        Revisa en Google AI Studio el botón 'Get Code' para ver el ID exacto (ej. gemini-2.5-flash-001).`;
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ 
          error: "Error procesando con IA", 
          details: errorMessage 
      }),
    };
  }
};