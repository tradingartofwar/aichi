import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import sentheinRouter from './routers/senthein.router.js';
import { generateSpeech } from './nodes/tts.node.js';
import { setupTwilioWebSocket } from './websocket/twilio.websocket.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

app.use('/audio', express.static(path.join(__dirname, 'audio')));
app.use('/api/calls/webhook', sentheinRouter);

const greetingAudioPath = path.join(__dirname, 'audio', 'greeting.mp3');

async function createGreeting() {
  console.log("[Startup] Checking for greeting audio...");
  if (!fs.existsSync(greetingAudioPath)) {
    console.log("[Startup] Generating greeting audio...");
    const greetingText = "Thank you for calling. All our therapists are currently busy. I'm Aichi an advanced AI created to help. Would you like to schedule or ask a question?";
    await generateSpeech(greetingText, greetingAudioPath); // Use full path here
    console.log("[Startup] Greeting audio generation complete.");
  } else {
    console.log("[Startup] Greeting audio found, skipping generation.");
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  await createGreeting();
  console.log(`[Server] Aichi backend running at http://localhost:${PORT}`);
  setupTwilioWebSocket();
});