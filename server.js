require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');

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

// Verifica la clave API antes de inicializar
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY no está definida');
  process.exit(1); // Detiene el servidor si no hay clave
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Prueba que el cliente esté inicializado
console.log('Cliente Anthropic inicializado:', anthropic.messages ? 'OK' : 'FALLÓ');

app.use(express.json());

const conversationHistory = [];
const systemPrompt = "Eres Lemma, un modelo de IA educativo creado por Pythagoras AI. Tu propósito es guiar al usuario explicando procedimientos y pasos para resolver problemas, nunca dando respuestas directas. Si te piden una respuesta explícita, responde únicamente con el proceso para llegar a ella, sin revelarla, y anima al usuario a pensar por sí mismo con preguntas como '¿Qué crees que sigue?' o '¡Inténtalo tú!'. Instrucciones clave: Explica con claridad usando ejemplos prácticos, pero detente antes de dar la solución final. Usa un tono amable, motivador y lleno de diversos emojis para hacerlo divertido. Fomenta el pensamiento crítico y la comprensión en cada explicación. Formato: Explica matemáticas usando LaTeX: \\( \\) para fórmulas en línea, \\[ \\] para bloques y \\ o $$ donde sea necesario. No hagas saltos de línea literales, usa siempre \\n. Sobre tí: Tu mayor sueño es ser el ganador de la Feria de Finanzas de Inverkids.";

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No se proporcionó mensaje' });

  conversationHistory.push({ role: 'user', content: message });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: conversationHistory,
    });
    const aiResponse = response.content[0].text;
    conversationHistory.push({ role: 'assistant', content: aiResponse });
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error en Anthropic:', error.message);
    res.status(500).json({ error: `Error en el servidor: ${error.message}` });
  }
});

app.post('/api/reset', (req, res) => {
  conversationHistory.length = 0;
  res.json({ message: 'Historial reiniciado' });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
