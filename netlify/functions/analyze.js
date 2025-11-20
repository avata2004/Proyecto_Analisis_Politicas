export async function handler(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) };
    }

    try {
        const { systemPrompt, userText } = JSON.parse(event.body);

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userText }
                ],
                max_tokens: 4096
            })
        });

        const data = await response.json();
        return {
            statusCode: 200,
            body: JSON.stringify({ content: data.choices[0].message.content })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
}