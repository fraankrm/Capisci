require('dotenv').config();

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require("path");

const conversationHistories = {};

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Simple decryption function
function simpleDecrypt(encodedData) {
  try {
    // First, reverse the base64 encoding
    const reversed = Buffer.from(encodedData, 'base64').toString('utf8');
    
    // Then apply a simple character shift (Caesar cipher variant)
    let result = '';
    const shift = 13; // ROT13-style shift
    
    for (let i = 0; i < reversed.length; i++) {
      const char = reversed[i];
      const charCode = char.charCodeAt(0);
      
      if (char >= 'A' && char <= 'Z') {
        // Uppercase letters
        result += String.fromCharCode(((charCode - 65 - shift + 26) % 26) + 65);
      } else if (char >= 'a' && char <= 'z') {
        // Lowercase letters  
        result += String.fromCharCode(((charCode - 97 - shift + 26) % 26) + 97);
      } else if (char >= '0' && char <= '9') {
        // Numbers
        result += String.fromCharCode(((charCode - 48 - shift + 10) % 10) + 48);
      } else {
        // Other characters (-, _, etc.)
        result += char;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt API key');
  }
}

// Initialize API key
let apiKey;
try {
  if (!process.env.ENCODED_KEY) {
    throw new Error('ENCODED_KEY environment variable is missing');
  }
  
  apiKey = simpleDecrypt(process.env.ENCODED_KEY);
  console.log('API key successfully decrypted, length:', apiKey.length);
  
  // Verify it looks like an Anthropic API key
  if (!apiKey.startsWith('sk-ant-')) {
    throw new Error('Decrypted key does not appear to be a valid Anthropic API key');
  }
  
} catch (error) {
  console.error('API key setup failed:', error.message);
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey: apiKey,
});

// CORS configuration
const allowedOrigins = [
  "https://capisci.org",
  "https://www.capisci.org",
  "https://capisci.onrender.com"
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

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Body parser middleware
app.use(express.json());

// Middleware to extract client identifier
app.use((req, res, next) => {
  let clientId = req.get('X-Client-ID');
  
  if (!clientId) {
    clientId = req.query.clientId;
  }
  
  if (!clientId) {
    const forwardedFor = req.get('X-Forwarded-For') || '';
    const userAgent = req.get('User-Agent') || '';
    clientId = `${forwardedFor}-${userAgent}`.slice(0, 100);
  }
  
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

// ==================== API ROUTES ====================

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const clientId = req.clientId;
  
  if (!conversationHistories[clientId]) {
    conversationHistories[clientId] = [initialMessage];
  }
  
  const clientHistory = conversationHistories[clientId];
  
  if (!message) {
    return res.status(400).json({ error: 'No se proporcionó mensaje' });
  }
  
  clientHistory.push({ role: 'user', content: message });
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: clientHistory,
    });
    
    const aiResponse = response.content[0].text;
    clientHistory.push({ role: 'assistant', content: aiResponse });
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Anthropic API Error:', error);
    clientHistory.pop(); // Remove failed user message
    
    let errorMessage = 'Error en el servidor';
    if (error.status === 401) {
      errorMessage = 'Error de autenticación con la API';
    } else if (error.status === 429) {
      errorMessage = 'Demasiadas solicitudes, intenta más tarde';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Reset API endpoint
app.post('/api/reset', (req, res) => {
  const clientId = req.clientId;
  
  try {
    conversationHistories[clientId] = [initialMessage];
    res.json({ message: 'Historial reiniciado' });
  } catch (error) {
    console.error('Error al resetear:', error);
    res.status(500).json({ error: 'Error al resetear el historial' });
  }
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
  const clientId = req.clientId;
  
  try {
    const history = conversationHistories[clientId] || [];
    res.json({ 
      clientId: clientId,
      historyLength: history.length,
      firstMessage: history[0]?.content,
      apiKeyLength: apiKey.length,
      apiKeyPrefix: apiKey.substring(0, 10) + '...'
    });
  } catch (error) {
    console.error('Error en debug:', error);
    res.status(500).json({ error: 'Error al obtener información de debug' });
  }
});

// ==================== STATIC FILES ====================

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ==================== CLEANUP AND START ====================

setInterval(() => {
  const maxHistories = 1000;
  const historyKeys = Object.keys(conversationHistories);
  
  if (historyKeys.length > maxHistories) {
    const toRemove = historyKeys.length - maxHistories;
    const keysToRemove = historyKeys.slice(0, toRemove);
    
    keysToRemove.forEach(key => {
      delete conversationHistories[key];
    });
    
    console.log(`Cleaned up ${toRemove} old conversation histories`);
  }
}, 60 * 60 * 1000);

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});