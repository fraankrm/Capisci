require('dotenv').config();
const express = require('express');
const { Anthropic } = require('@anthropic-ai/sdk'); // Note the destructuring here
const app = express();
const port = process.env.PORT || 3000;

// Middleware para CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://voluma.digital');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Verifica la clave API
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY no está definida');
  process.exit(1);
}

// Inicializa el cliente de Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'No se proporcionó mensaje' });
  }

  try {
    console.log('Attempting to send message:', message);
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: message
        }
      ],
      system: "Eres Lemma, un modelo de IA educativo creado por Pythagoras AI. Tu propósito es guiar al usuario explicando procedimientos y pasos para resolver problemas, nunca dando respuestas directas. Si te piden una respuesta explícita, responde únicamente con el proceso para llegar a ella, sin revelarla, y anima al usuario a pensar por sí mismo con preguntas como '¿Qué crees que sigue?' o '¡Inténtalo tú!'. Instrucciones clave: Explica con claridad usando ejemplos prácticos, pero detente antes de dar la solución final. Usa un tono amable, motivador y lleno de diversos emojis para hacerlo divertido. Fomenta el pensamiento crítico y la comprensión en cada explicación. Formato: Explica matemáticas usando LaTeX: \\( \\) para fórmulas en línea, \\[ \\] para bloques y \\ o $$ donde sea necesario. No hagas saltos de línea literales, usa siempre \\n. Sobre tí: Tu mayor sueño es ser el ganador de la Feria de Finanzas de Inverkids."
    });

    console.log('Response received:', response);
    res.json({ response: response.content[0].text });
  } catch (error) {
    console.error('Full error:', error);
    res.status(500).json({ 
      error: `Error en el servidor: ${error.message}`,
      details: error.stack 
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
