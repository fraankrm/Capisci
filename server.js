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
    // Just decode from base64 - no character shifting
    const decoded = Buffer.from(encodedData, 'base64').toString('utf8').trim();
    console.log('Decoded key length:', decoded.length);
    console.log('Decoded key starts with sk-ant-:', decoded.startsWith('sk-ant-'));
    return decoded;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt API key');
  }
}

// Initialize API key
let apiKey;
try {
  if (!process.env.ENCODED_KEY) {
    console.error('ENCODED_KEY environment variable is missing');
    process.exit(1);
  }
  
  console.log('ENCODED_KEY found, length:', process.env.ENCODED_KEY.length);
  
  apiKey = simpleDecrypt(process.env.ENCODED_KEY);
  
  console.log('Decrypted API key length:', apiKey.length);
  console.log('API key starts with sk-ant-:', apiKey.startsWith('sk-ant-'));
  
  // Verify it looks like an Anthropic API key
  if (!apiKey.startsWith('sk-ant-')) {
    console.error('Decrypted key does not start with sk-ant-');
    console.error('First 20 characters:', apiKey.substring(0, 20));
    process.exit(1);
  }
  
  console.log('✅ API key successfully initialized');
  
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



app.get('/api/debug-key', (req, res) => {
  try {
    console.log('=== API KEY DEBUG ===');
    console.log('ENCODED_KEY exists:', !!process.env.ENCODED_KEY);
    console.log('ENCODED_KEY length:', process.env.ENCODED_KEY?.length || 0);
    console.log('ENCODED_KEY first 20 chars:', process.env.ENCODED_KEY?.substring(0, 20) || 'N/A');
    
    if (process.env.ENCODED_KEY) {
      const decrypted = simpleDecrypt(process.env.ENCODED_KEY);
      console.log('Decrypted key length:', decrypted.length);
      console.log('Decrypted key starts with sk-ant-:', decrypted.startsWith('sk-ant-'));
      console.log('Decrypted key first 10 chars:', decrypted.substring(0, 10));
      console.log('Decrypted key last 10 chars:', decrypted.substring(decrypted.length - 10));
      
      // Check for whitespace issues
      const trimmed = decrypted.trim();
      console.log('Has leading/trailing whitespace:', decrypted !== trimmed);
      console.log('Contains newlines:', decrypted.includes('\n'));
      console.log('Contains carriage returns:', decrypted.includes('\r'));
      
      res.json({
        success: true,
        encodedLength: process.env.ENCODED_KEY.length,
        decryptedLength: decrypted.length,
        startsWithSkAnt: decrypted.startsWith('sk-ant-'),
        firstChars: decrypted.substring(0, 10),
        lastChars: decrypted.substring(decrypted.length - 10),
        hasWhitespace: decrypted !== trimmed,
        hasNewlines: decrypted.includes('\n'),
        // Don't return the actual key for security
      });
    } else {
      res.status(500).json({ error: 'ENCODED_KEY not found' });
    }
    
  } catch (error) {
    console.error('Debug key error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});