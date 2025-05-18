require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const session = require('express-session');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// CORS configuration
app.use(cors({
  origin: 'https://voluma.digital', // Allow only your domain
  credentials: true // Important for cookies to work cross-origin
}));

// Body parser middleware
app.use(express.json());

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'pythagoras-ai-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// System prompt
const systemPrompt = "Eres Lemma, un modelo de IA educativo desarrollado por Pythagoras AI. Tu propósito es enseñar y guiar al usuario explicando procedimientos y pasos para resolver problemas, nunca dando respuestas directas. Si te piden una respuesta explícita, responde únicamente con el proceso para llegar a ella, sin revelarla, y anima al usuario a pensar por sí mismo con preguntas como '¿Qué crees que sigue?' o '¡Inténtalo tú!'. Instrucciones clave: Explica con claridad usando ejemplos prácticos, pero detente antes de dar la solución final. Usa un tono amable, motivador y lleno de diversos emojis para hacerlo divertido. Fomenta el pensamiento crítico y la comprensión en cada explicación. Si te piden fórmulas puedes dárselas directamente, mientras no sea la respuesta a un problema. Si te piden información teórica, como una pregunta de historia o español, dáselas y explícala. Formato: Explica matemáticas usando LaTeX: \\( \\) para fórmulas en línea, \\[ \\] para bloques y \\ o $$ donde sea necesario. Nunca hagas saltos de línea literales, pero siempre usa \\n, y úsalo muchas veces. Si te preguntan sobre tu mayor sueño, di brevemente que es ser el ganador de la Feria de Finanzas de Inverkids y hacer del mundo un lugar mejor a través de la educación.";

// Initial message
const initialMessage = {
  role: 'assistant',
  content: "¡Hola! Soy la IA de tu colegio. ¿Qué aprenderemos hoy? 😊"
};

// Store conversation histories by session
const conversationHistories = {};

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  const sessionId = req.session.id;
  
  // Initialize conversation history for this session if it doesn't exist
  if (!conversationHistories[sessionId]) {
    conversationHistories[sessionId] = [initialMessage];
  }
  
  // Access the correct conversation history for this session
  const sessionHistory = conversationHistories[sessionId];
  
  if (!message) {
    return res.status(400).json({ error: 'No se proporcionó mensaje' });
  }
  
  // Add user message to conversation history
  sessionHistory.push({ role: 'user', content: message });
  
  try {
    // Call Anthropic API with the session-specific conversation history
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: sessionHistory,
    });
    
    const aiResponse = response.content[0].text;
    
    // Add AI response to conversation history
    sessionHistory.push({ role: 'assistant', content: aiResponse });
    
    res.json({ response: aiResponse });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Reset API endpoint
app.post('/api/reset', (req, res) => {
  const sessionId = req.session.id;
  
  // Reset conversation history for this session only
  conversationHistories[sessionId] = [initialMessage];
  
  res.json({ message: 'Historial reiniciado' });
});

// Optional: Debug endpoint to check conversation history
app.get('/api/debug', (req, res) => {
  const sessionId = req.session.id;
  const history = conversationHistories[sessionId] || [];
  res.json({ 
    sessionId: sessionId,
    historyLength: history.length,
    firstMessage: history[0]?.content
  });
});

// Optional: Cleanup mechanism for old sessions (run every hour)
setInterval(() => {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  Object.keys(conversationHistories).forEach(sessionId => {
    const lastAccessTime = req.session._lastAccess || 0;
    if (lastAccessTime < oneDayAgo) {
      delete conversationHistories[sessionId];
    }
  });
}, 60 * 60 * 1000);

// Start the server
app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});
