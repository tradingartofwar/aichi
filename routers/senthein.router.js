import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import scheduleRouter from './schedule.router.js';
import { generateSpeech } from '../nodes/tts.node.js';
import { callGPTForRouting } from '../mod.calls/ai.router.js';

const sentheinRouter = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

sentheinRouter.post('/', async (req, res) => {
  console.log("[Senthein Router] Incoming Twilio webhook request...");
  try {
    const greetingAudioUrl = `${process.env.NGROK_URL}/audio/greeting.mp3`;
    const streamUrl = process.env.WEBSOCKET_URL;

    console.log("[Senthein Router] Greeting URL:", greetingAudioUrl);
    console.log("[Senthein Router] WebSocket URL:", streamUrl);

    const twiml = `
      <Response>
        <Play>${greetingAudioUrl}</Play>
        <Connect>
          <Stream url="${streamUrl}" parameters="audio=stereo" />
        </Connect>
      </Response>
    `;
    
    res.type('text/xml').send(twiml);
    console.log("[Senthein Router] Sent TwiML response to Twilio.");
  } catch (error) {
    console.error("[Senthein Router] Webhook error:", error);
    res.status(500).send("<Response><Say>Internal server error.</Say></Response>");
  }
});

sentheinRouter.post('/handle-response', async (req, res) => {
  console.log("[Senthein Router] Handling user response:", req.body);
  try {
    const userSpeech = req.body.SpeechResult || '';
    console.log("[Senthein Router] Speech result:", userSpeech);

    const aiDecision = await callGPTForRouting(userSpeech);
    console.log("[Senthein Router] AI Decision:", aiDecision);

    if (aiDecision.route === 'schedule') {
      console.log("[Senthein Router] Routing to schedule...");
      await scheduleRouter(req, res);
      return;
    }

    const audioFile = 'conv_response.mp3';
    await generateSpeech(aiDecision.response_text, audioFile);
    const audioUrl = `${process.env.NGROK_URL}/audio/${audioFile}`;

    res.type('text/xml').send(`<Response><Play>${audioUrl}</Play></Response>`);
    console.log("[Senthein Router] Response sent to user.");
  } catch (error) {
    console.error("[Senthein Router] Error handling response:", error);
    res.status(500).send("<Response><Say>Error occurred.</Say></Response>");
  }
});

export default sentheinRouter;