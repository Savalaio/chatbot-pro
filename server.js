const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configurações
const EVOLUTION_API_URL = 'https://evo.realizador.com.br';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = 'Controle_11';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Evolution client
const evolution = {
  headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
  
  async sendText(number, text) {
    const clean = number.replace(/\D/g, '');
    const formatted = clean.includes('@') ? clean : `${clean}@s.whatsapp.net`;
    return axios.post(
      `${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`,
      { number: formatted, text, options: { delay: 1200 } },
      { headers: this.headers }
    );
  },
  
  async status() {
    return axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`, { headers: this.headers });
  }
};

// Storage
const history = new Map();

// AI processing
async function processAI(text) {
  if (!OPENAI_API_KEY) return "[DEMO] " + text;
  const { OpenAI } = require('openai');
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const chat = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "system", content: "Assistente profissional, respostas curtas em portugues." }, { role: "user", content: text }],
    max_tokens: 500
  });
  return chat.choices[0].message.content;
}

// Webhook
app.post('/webhook/evolution', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data?.message) return res.send('OK');
    
    const from = data.key?.remoteJid || data.sender;
    const text = data.message.conversation || data.message.extendedTextMessage?.text || '';
    if (!text) return res.send('OK');
    
    const phone = from.replace('@s.whatsapp.net', '').replace('@g.us', '');
    const reply = await processAI(text);
    await evolution.sendText(phone, reply);
    
    io.emit('whatsapp-msg', { phone, text, reply, time: new Date().toISOString() });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// API routes
app.get('/api/health', (req, res) => res.json({ status: 'OK' }));

app.get('/api/status', async (req, res) => {
  try {
    const { data } = await evolution.status();
    res.json({ connected: data.state === 'open', state: data.state });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { number, message } = req.body;
    await evolution.sendText(number, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// WebSocket
io.on('connection', (socket) => {
  socket.on('join', (room) => {
    socket.join(room);
    socket.emit('history', history.get(room) || []);
  });
  
  socket.on('msg', async (data) => {
    const { room, text } = data;
    const userMsg = { id: Date.now(), text, sender: 'user', time: new Date().toISOString() };
    const list = history.get(room) || [];
    list.push(userMsg);
    history.set(room, list);
    io.to(room).emit('new-msg', userMsg);
    
    const reply = await processAI(text);
    const botMsg = { id: Date.now() + 1, text: reply, sender: 'bot', time: new Date().toISOString() };
    list.push(botMsg);
    history.set(room, list);
    io.to(room).emit('new-msg', botMsg);
  });
});

// Start
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Servidor na porta ' + PORT);
});
