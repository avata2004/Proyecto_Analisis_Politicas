exports.handler = async (event, context) => {
    // Solo permitimos peticiones desde tu propia web (Seguridad básica)
    // o desde localhost para pruebas
    const headers = {
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "API Key no configurada en Netlify" })
        };
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ key: apiKey })
    };
};