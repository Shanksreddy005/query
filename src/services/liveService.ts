/**
 * QueryMind Live Voice Service
 * Connects to the server-side WebSocket bridge (/live) powered by Gemini Live API (gemini-3.8-live).
 * Handles browser microphone streaming (16kHz 16-bit PCM) and audio/text playback.
 */

export interface LiveSessionCallbacks {
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'speaking' | 'error', message?: string) => void;
  onTranscript?: (text: string, isModel: boolean) => void;
  onError?: (err: Error) => void;
}

class LiveSessionManager {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private isConnected = false;
  private playbackQueue: Float32Array[] = [];
  private isPlaying = false;
  private callbacks: LiveSessionCallbacks = {};

  public isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.WebSocket !== 'undefined' &&
      !!navigator?.mediaDevices?.getUserMedia
    );
  }

  public async connect(callbacks: LiveSessionCallbacks = {}) {
    if (this.isConnected) return;
    this.callbacks = callbacks;
    this.callbacks.onStatusChange?.('connecting', 'Connecting to Gemini Live Voice server...');

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/live`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.('connected', 'Connected to Gemini Live Assistant');
        await this.startMicrophone();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            this.callbacks.onError?.(new Error(data.error));
            this.callbacks.onStatusChange?.('error', data.error);
            return;
          }

          if (data.text) {
            this.callbacks.onTranscript?.(data.text, true);
          }

          if (data.audio) {
            this.callbacks.onStatusChange?.('speaking', 'Gemini speaking...');
            this.queueAudio(data.audio);
          }

          if (data.interrupted) {
            this.clearAudioQueue();
          }
        } catch (e: any) {
          console.error('[QueryMind Live] Parse error:', e);
        }
      };

      this.ws.onerror = (e) => {
        console.error('[QueryMind Live] WebSocket error:', e);
        this.callbacks.onStatusChange?.('error', 'Connection error');
        this.callbacks.onError?.(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        this.cleanup();
        this.callbacks.onStatusChange?.('disconnected', 'Disconnected');
      };
    } catch (err: any) {
      this.cleanup();
      this.callbacks.onStatusChange?.('error', err.message);
      this.callbacks.onError?.(err);
    }
  }

  private async startMicrophone() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 16000 });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 2048 at 16kHz is ~128ms per chunk
      this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processor.onaudioprocess = (e) => {
        if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32Array to 16-bit PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }

        // Base64 encode PCM bytes
        const uint8 = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < uint8.byteLength; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        const base64Audio = btoa(binary);

        this.ws.send(JSON.stringify({ audio: base64Audio }));
      };

      source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (err: any) {
      console.error('[QueryMind Live] Mic access error:', err);
      this.callbacks.onError?.(err);
      this.callbacks.onStatusChange?.('error', `Microphone permission required: ${err.message}`);
    }
  }

  public sendText(text: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ text }));
      this.callbacks.onTranscript?.(text, false);
    }
  }

  private queueAudio(base64Pcm: string) {
    try {
      const binary = atob(base64Pcm);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      this.playbackQueue.push(float32);
      if (!this.isPlaying) {
        this.playNextAudioChunk();
      }
    } catch (e) {
      console.error('[QueryMind Live] Audio decode error:', e);
    }
  }

  private async playNextAudioChunk() {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      if (this.isConnected) {
        this.callbacks.onStatusChange?.('connected', 'Listening...');
      }
      return;
    }

    this.isPlaying = true;
    const chunk = this.playbackQueue.shift()!;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: 24000 });
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const buffer = this.audioContext.createBuffer(1, chunk.length, 24000);
    buffer.getChannelData(0).set(chunk);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => {
      this.playNextAudioChunk();
    };
    source.start();
  }

  private clearAudioQueue() {
    this.playbackQueue = [];
    this.isPlaying = false;
  }

  public disconnect() {
    this.cleanup();
    this.callbacks.onStatusChange?.('disconnected', 'Disconnected');
  }

  private cleanup() {
    this.isConnected = false;
    this.clearAudioQueue();

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch (_) {}
      this.processor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (_) {}
      this.audioContext = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}

export const liveVoiceService = new LiveSessionManager();
