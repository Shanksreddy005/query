import express from 'express';
import http from 'node:http';
import path from 'node:path';
import 'dotenv/config';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(express.json({ limit: '10mb' }));

/**
 * Shared Gemini client factory.
 * Sets required 'User-Agent': 'aistudio-build' header for telemetry.
 */
function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const isCustom = customApiKey &&
    customApiKey !== 'server-provided' &&
    customApiKey !== 'server-managed' &&
    customApiKey.trim().length > 0;

  const apiKey = isCustom ? customApiKey! : (process.env.GEMINI_API_KEY || '');

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// --------------------------------------------------------------------------
// 1. Generate Content Endpoint (Text / Structured JSON)
// --------------------------------------------------------------------------
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const apiKeyHeader = req.headers['x-goog-api-key'] as string | undefined;
    const ai = getGeminiClient(apiKeyHeader);
    const { model, prompt, contents, config, responseMimeType, systemInstruction } = req.body;
    const targetModel = model || 'gemini-3.8-flash';

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: contents || prompt,
      config: {
        systemInstruction: systemInstruction || config?.systemInstruction,
        responseMimeType: responseMimeType || config?.responseMimeType || 'application/json',
        ...(config?.thinkingConfig ? { thinkingConfig: config.thinkingConfig } : {}),
        ...(config?.responseSchema ? { responseSchema: config.responseSchema } : {}),
      },
    });

    const text = response.text || '';
    return res.json({
      text,
      data: text,
      effectiveModel: targetModel,
    });
  } catch (err: any) {
    console.error('Gemini generateContent error:', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Gemini generation failed',
      status,
    });
  }
});

// --------------------------------------------------------------------------
// 2. Streaming Content Endpoint (Server-Sent Events)
// --------------------------------------------------------------------------
app.post('/api/gemini/stream', async (req, res) => {
  try {
    const apiKeyHeader = req.headers['x-goog-api-key'] as string | undefined;
    const ai = getGeminiClient(apiKeyHeader);
    const { model, prompt, contents, config, systemInstruction, responseMimeType } = req.body;
    const targetModel = model || 'gemini-3.8-flash';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await ai.models.generateContentStream({
      model: targetModel,
      contents: contents || prompt,
      config: {
        systemInstruction: systemInstruction || config?.systemInstruction,
        responseMimeType: responseMimeType || config?.responseMimeType,
      },
    });

    for await (const chunk of stream) {
      const chunkText = chunk.text || '';
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('Gemini stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

// --------------------------------------------------------------------------
// 3. Key Verification Endpoint
// --------------------------------------------------------------------------
app.post('/api/gemini/verify-key', async (req, res) => {
  try {
    const apiKeyHeader = req.headers['x-goog-api-key'] as string | undefined;
    const { key } = req.body || {};
    const keyToTest = (apiKeyHeader && apiKeyHeader !== 'server-provided' && apiKeyHeader !== 'server-managed' && apiKeyHeader.trim().length > 0)
      ? apiKeyHeader
      : (key || process.env.GEMINI_API_KEY);

    if (!keyToTest) {
      return res.status(400).json({ error: 'No API key provided or configured on server.' });
    }

    const ai = getGeminiClient(keyToTest);
    const testResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: 'Ping',
      config: { maxOutputTokens: 5 },
    });

    return res.json({ valid: true, model: 'gemini-3.8-flash', ping: testResponse.text });
  } catch (err: any) {
    return res.status(err.status || 400).json({ error: err.message || 'Key verification failed' });
  }
});

// --------------------------------------------------------------------------
// 4. Server Health & Status
// --------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    hasServerKey: Boolean(process.env.GEMINI_API_KEY),
    provider: 'gemini',
  });
});

const server = http.createServer(app);

// --------------------------------------------------------------------------
// 5. Live API WebSocket Bridge (Real-Time Audio with gemini-3.8-live)
// --------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
  if (pathname === '/live' || pathname === '/api/gemini/live') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', async (clientWs, request) => {
  let session: any = null;
  try {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    const customKey = url.searchParams.get('key') || undefined;
    const ai = getGeminiClient(customKey);

    session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
        },
        systemInstruction: 'You are QueryMind, a conversational voice data analyst assistant.',
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          for (const part of message.serverContent?.modelTurn?.parts ?? []) {
            if (part.inlineData?.data && clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
          }
          if (message.serverContent?.interrupted && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }
        },
        onclose: () => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
          }
        },
        onerror: (err) => {
          console.error('Live session callback error:', err);
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ error: err.message }));
          }
        },
      },
    });

    clientWs.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.audio && session) {
          session.sendRealtimeInput({
            audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        }
      } catch (e) {
        console.error('Error handling client live message:', e);
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch (_) {}
    });
  } catch (err: any) {
    console.error('Failed to establish Live session:', err);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ error: err.message || 'Failed to connect Live session' }));
      clientWs.close();
    }
  }
});

// --------------------------------------------------------------------------
// 6. Vite Middleware (Dev) & Static Serving (Prod)
// --------------------------------------------------------------------------
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`QueryMind full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
