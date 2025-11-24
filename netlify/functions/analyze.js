const { GoogleGenerativeAI } = require("@google/generative-ai");

exports.handler = async (event) => {
  // 1. Solo permitir peticiones POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // 2. Verificar seguridad: ¿Existe la API Key en Netlify?
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("CRITICAL: GEMINI_API_KEY no está configurada en las variables de entorno de Netlify.");
    return {
        statusCode: 500,
        body: JSON.stringify({ error: "Error de configuración del servidor (Falta API Key)." })
    };
  }

  try {
    // 3. Obtener los datos del frontend
    const { systemPrompt, userText } = JSON.parse(event.body);

    if (!userText) {
        return { statusCode: 400, body: JSON.stringify({ error: "Falta el texto a analizar." }) };
    }

    console.log(`Iniciando análisis con Gemini Flash. Longitud del texto: ${userText.length} caracteres.`);

    // 4. Inicializar el cliente de Google con la clave
    const genAI = new GoogleGenerativeAI(apiKey);

    // === CRÍTICO: Usamos 'gemini-1.5-flash' por velocidad ===
    // Este modelo es rápido y tiene 1 Millón de tokens de contexto.
    // Perfecto para documentos largos en Netlify Free Tier.
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        // Ajustes de seguridad opcionales (para evitar bloqueos falsos en textos legales)
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ]
    });

    // 5. Construir el Prompt Combinado
    // Gemini funciona mejor si le damos las instrucciones y el contexto juntos.
    const finalPrompt = `${systemPrompt}\n\n--- INICIO DEL DOCUMENTO LEGAL A ANALIZAR ---\n\n${userText}\n\n--- FIN DEL DOCUMENTO ---`;

    // 6. Llamar a la API (Generar contenido)
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const text = response.text();

    console.log("Respuesta recibida de Gemini exitosamente.");

    // 7. Devolver el resultado al frontend
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    };

  } catch (error) {
    console.error("Error en la función de Netlify (Gemini):", error);

    // Manejo de errores básicos
    let errorMessage = "Ocurrió un error al procesar el documento.";
    // Si el error menciona "deadline exceeded" es el timeout de 10s de Netlify
    if (error.message && error.message.toLowerCase().includes("deadline")) {
        errorMessage = "El análisis tardó más de 10 segundos y Netlify cerró la conexión. Intenta con un texto ligeramente más corto.";
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: errorMessage, details: error.message }),
    };
  }
};