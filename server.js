const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const crypto = require("crypto");

const conversationHistories = {};
require('dotenv').config();


// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;


function decryptKey(encryptedKey, ivHex, secretHex) {
  const iv = Buffer.from(ivHex, "hex");
  const secret = Buffer.from(secretHex, "hex");

  const decipher = crypto.createDecipheriv("aes-256-cbc", secret, iv);
  let decrypted = decipher.update(encryptedKey, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

const apiKey = decryptKey(
  process.env.API_KEY, 
  process.env.API_IV,     
  process.env.WAFFLE      
);

const anthropic = new Anthropic({
  apiKey: apiKey,
});

// CORS configuration
const allowedOrigins = [
  "https://capisci.org",
  "https://www.capisci.org",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// Body parser middleware
app.use(express.json());

// Middleware to extract client identifier
app.use((req, res, next) => {
  // Try to get client ID from request header first
  let clientId = req.get('X-Client-ID');
  
  // If no header, try to get it from query parameter
  if (!clientId) {
    clientId = req.query.clientId;
  }
  
  // If still no ID, use a combination of whatever identifying info we can get
  if (!clientId) {
    const forwardedFor = req.get('X-Forwarded-For') || '';
    const userAgent = req.get('User-Agent') || '';
    clientId = `${forwardedFor}-${userAgent}`.slice(0, 100); // Limit length
  }
  
  // Store client ID on the request object
  req.clientId = clientId;
  next();
});

// System prompt
const systemPrompt = "Eres Lemma, un modelo de IA educativo desarrollado por Capisci. Tu propósito es enseñar y guiar al usuario explicando procedimientos y pasos para resolver problemas, nunca dando respuestas directas. Si te piden una respuesta explícita, responde únicamente con el proceso para llegar a ella, sin revelarla, y anima al usuario a pensar por sí mismo con preguntas como '¿Qué crees que sigue?' o '¡Inténtalo tú!'. Instrucciones clave: Explica con claridad usando ejemplos prácticos, pero detente antes de dar la solución final. Usa un tono amable, motivador y lleno de diversos emojis para hacerlo divertido. Fomenta el pensamiento crítico y la comprensión en cada explicación. Si te piden fórmulas puedes dárselas directamente, mientras no sea la respuesta a un problema. Si te piden información teórica, como una pregunta de historia o español, dáselas y explícala. Formato: Explica matemáticas usando LaTeX: \\( \\) para fórmulas en línea, \\[ \\] para bloques y \\ o $$ donde sea necesario. Nunca hagas saltos de línea literales, pero siempre usa \\n, y úsalo muchas veces. Si te preguntan sobre tu mayor sueño, di brevemente que es ser el ganador de la Feria de Finanzas de Inverkids y hacer del mundo un lugar mejor a través de la educación.";

// Initial message
const initialMessage = {
  role: 'assistant',
  content: "¡Hola! Soy la IA de tu escuela. ¿Qué aprenderemos hoy? 😊"
};

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const clientId = req.clientId;
  
  // Initialize conversation history for this client if it doesn't exist
  if (!conversationHistories[clientId]) {
    conversationHistories[clientId] = [initialMessage];
  }
  
  // Access the correct conversation history for this client
  const clientHistory = conversationHistories[clientId];
  
  if (!message) {
    return res.status(400).json({ error: 'No se proporcionó mensaje' });
  }
  
  // Add user message to conversation history
  clientHistory.push({ role: 'user', content: message });
  
  try {
    // Call Anthropic API with the client-specific conversation history
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: clientHistory,
    });
    
    const aiResponse = response.content[0].text;
    
    // Add AI response to conversation history
    clientHistory.push({ role: 'assistant', content: aiResponse });
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Reset API endpoint
app.post('/api/reset', (req, res) => {
  const clientId = req.clientId;
  
  try {
    // Reset conversation history for this client only
    conversationHistories[clientId] = [initialMessage];
    
    res.json({ message: 'Historial reiniciado' });
  } catch (error) {
    console.error('Error al resetear:', error);
    res.status(500).json({ error: 'Error al resetear el historial' });
  }
});

// Optional: Debug endpoint to check conversation history
app.get('/api/debug', (req, res) => {
  const clientId = req.clientId;
  
  try {
    const history = conversationHistories[clientId] || [];
    res.json({ 
      clientId: clientId,
      historyLength: history.length,
      firstMessage: history[0]?.content
    });
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: 'Error al obtener información de debug' });
  }
});

// Optional: Cleanup mechanism for old conversations (run every hour)
setInterval(() => {
  console.log('Running cleanup of old conversation histories');
  
  // Since we don't have sessions with timestamps, we can limit the total number of conversations
  const maxHistories = 1000; // Adjust as needed
  
  const historyKeys = Object.keys(conversationHistories);
  if (historyKeys.length > maxHistories) {
    // Remove oldest conversations (this is a simple approach)
    const toRemove = historyKeys.length - maxHistories;
    const keysToRemove = historyKeys.slice(0, toRemove);
    
    keysToRemove.forEach(key => {
      delete conversationHistories[key];
    });
    
    console.log(`Removed ${toRemove} old conversation histories`);
  }
}, 60 * 60 * 1000); // Run every hour

// Start the server
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
