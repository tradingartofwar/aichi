// websocket/twilio.websocket.js (Updated with Angie and Bell Scheduling)

import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { callGPTForRouting } from '../mod.calls/ai.router.js';
import { generateSpeech } from '../nodes/tts.node.js';
import { checkAvailability, scheduleAppointment, findNextAvailable } from '../nodes/schedule.node.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const businessData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/info.json'), 'utf-8'));

export function setupTwilioWebSocket() {
  const wss = new WebSocketServer({ port: 8080 });
  console.log("[WebSocket Server] Listening on ws://localhost:8080");

  wss.on('connection', (ws) => {
    console.log('[WebSocket] New client connected.');
    ws.isAiSpeaking = false;

    const callContext = {
      previousQuestions: [],
      userIntention: null,
      userName: null,
      lastInteractionTime: Date.now(),
      streamSid: null,
      currentState: "Initial Greeting",
      pendingScheduling: null,
      schedulingAlternative: null,
      awaitingConfirmation: false,
      isBookingInProgress: false,
      bookingConfirmed: false,
      collectedDetails: { date: null, time: null, duration: null, staff: "Any" }
    };

    let audioChunks = [];
    let processing = false;
    let chunkCount = 0;
    let lastTranscription = null;
    let lastTranscriptionTime = 0;
    let failedTranscriptionCount = 0;

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);
        if (data.event === 'start' && data.streamSid) {
          callContext.streamSid = data.streamSid;
          console.log("[WebSocket] Captured streamSid:", callContext.streamSid);
        }
        if (data.event === 'media' && data.media && data.media.payload) {
          const mulawBuffer = Buffer.from(data.media.payload, 'base64');
          audioChunks.push(mulawBuffer);
          chunkCount++;
        }
      } catch (err) {
        console.error('[WebSocket] Error parsing JSON message:', err);
      }
    });

    const interval = setInterval(async () => {
      if (ws.isAiSpeaking) {
        console.log('[WebSocket] Skipping processing while AI is speaking');
        audioChunks = [];
        chunkCount = 0;
        return;
      }

      if (callContext.pendingScheduling) {
        if (callContext.isBookingInProgress) {
          console.log("[Scheduling] Booking already in progress, skipping");
          return;
        }

        const { date, time, duration, staff } = callContext.pendingScheduling;
        const preferredStaff = staff === 'Any' ? 'Angie' : staff;
        const altStaff = preferredStaff === 'Angie' ? 'Bell' : 'Angie';

        const startTime = new Date(`${date}T${time}:00`);
        const durationMinutes = parseInt(duration.split(' ')[0]);
        const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

        try {
          callContext.isBookingInProgress = true;
          const isPreferredAvailable = await checkAvailability(preferredStaff, startTime, endTime);
          let followUpText;

          if (isPreferredAvailable) {
            const eventDetails = {
              staff: preferredStaff,
              summary: `Massage with ${preferredStaff}`,
              start: { dateTime: startTime.toISOString() },
              end: { dateTime: endTime.toISOString() }
            };
            const result = await scheduleAppointment(eventDetails);
            if (result.success) {
              followUpText = `I’ve scheduled you with ${preferredStaff} at 5 p.m. on ${date}.`;
              console.log("[Scheduling] Booking completed with preferred staff:", result.link);
              callContext.pendingScheduling = null;
              callContext.bookingConfirmed = true;
              callContext.currentState = "Booking Confirmed";
            } else {
              followUpText = "There was an issue scheduling your appointment. Could you try another time?";
              console.error("[Scheduling] Failed to book with preferred staff:", result.error);
            }
            await sendAudioResponse(ws, callContext, followUpText, audioChunks);
          } else {
            const isAltAvailable = await checkAvailability(altStaff, startTime, endTime);
            if (isAltAvailable) {
              const eventDetails = {
                staff: altStaff,
                summary: `Massage with ${altStaff}`,
                start: { dateTime: startTime.toISOString() },
                end: { dateTime: endTime.toISOString() }
              };
              const result = await scheduleAppointment(eventDetails);
              if (result.success) {
                followUpText = `Angie isn’t available, but I’ve scheduled you with ${altStaff} at 5 p.m. on ${date}. Does that work, or would you prefer to wait for Angie?`;
                console.log("[Scheduling] Booking completed with alternate staff:", result.link);
                callContext.pendingScheduling = null;
                callContext.bookingConfirmed = true;
                callContext.currentState = "Booking Confirmed";
              } else {
                followUpText = "There was an issue scheduling your appointment. Could you try another time?";
                console.error("[Scheduling] Failed to book with alternate staff:", result.error);
              }
              await sendAudioResponse(ws, callContext, followUpText, audioChunks);
            } else {
              const nextSlot = await findNextAvailable(preferredStaff, durationMinutes, startTime);
              if (nextSlot) {
                const nextTime = nextSlot.startTime.toTimeString().slice(0, 5);
                const nextDate = nextSlot.startTime.toISOString().slice(0, 10);
                followUpText = `${preferredStaff} is booked at ${time}. The next available slot is ${nextTime} on ${nextDate}. Would that work for you?`;
                callContext.schedulingAlternative = { staff: preferredStaff, date: nextDate, time: nextTime, duration };
                callContext.awaitingConfirmation = true;
                console.log("[Scheduling] Offering next slot:", callContext.schedulingAlternative);
                await sendAudioResponse(ws, callContext, followUpText, audioChunks);
                callContext.pendingScheduling = null;
              } else {
                followUpText = `${preferredStaff} isn’t available soon. Would you like to try a different time or schedule with ${altStaff}?`;
                callContext.schedulingAlternative = { staff: altStaff, date, time, duration };
                callContext.awaitingConfirmation = true;
                console.log("[Scheduling] Offering alternative staff:", callContext.schedulingAlternative);
                await sendAudioResponse(ws, callContext, followUpText, audioChunks);
                callContext.pendingScheduling = null;
              }
            }
          }
        } catch (error) {
          console.error('Scheduling error:', error);
          await sendAudioResponse(ws, callContext, "Something went wrong while checking availability. Please try again.", audioChunks);
          callContext.pendingScheduling = null;
        } finally {
          callContext.isBookingInProgress = false;
        }
        return;
      }

      if (processing || audioChunks.length < 80) return;
      processing = true;

      const mulawData = Buffer.concat(audioChunks);
      audioChunks = [];
      chunkCount = 0;

      console.log('[WebSocket] Processing audio chunk...');
      try {
        const pcmData = await convertToPCM(mulawData);
        const response = await axios.post('http://localhost:8000/transcribe', pcmData, {
          headers: { 'Content-Type': 'application/octet-stream' }
        });
        const text = response.data.text;
        console.log("[Whisper] Transcribed:", text);

        const now = Date.now();
        if (text && (text !== lastTranscription || now - lastTranscriptionTime > 3000)) {
          failedTranscriptionCount = 0;
          lastTranscription = text;
          lastTranscriptionTime = now;

          if (callContext.awaitingConfirmation) {
            const lowerText = text.toLowerCase();
            const altStaffLower = callContext.schedulingAlternative.staff.toLowerCase();
            const affirmativeKeywords = ['yes', 'sure', 'okay', 'please', 'i would like', 'schedule with', 'book with'];
            const negativeKeywords = ['no', 'not', 'don’t', 'decline'];

            if (affirmativeKeywords.some(keyword => lowerText.includes(keyword)) || lowerText.includes(altStaffLower)) {
              const { staff, date, time, duration } = callContext.schedulingAlternative;
              callContext.pendingScheduling = { date, time, duration, staff };
              callContext.awaitingConfirmation = false;
              callContext.schedulingAlternative = null;
              console.log("[Scheduling] User accepted alternative:", { staff, date, time, duration });
            } else if (negativeKeywords.some(keyword => lowerText.includes(keyword))) {
              await sendAudioResponse(ws, callContext, "Alright, please suggest another time or staff member.", audioChunks);
              callContext.awaitingConfirmation = false;
              callContext.schedulingAlternative = null;
              callContext.pendingScheduling = null;
              console.log("[Scheduling] User declined alternative");
            } else {
              await sendAudioResponse(ws, callContext, "I didn’t understand. Please say yes or no.", audioChunks);
              console.log("[Scheduling] Unclear response to alternative");
            }
          } else {
            const aiDecision = await callGPTForRouting(text, callContext);
            console.log("[GPT] Decision received:", aiDecision);

            callContext.currentState = aiDecision.nextState || callContext.currentState;
            callContext.collectedDetails = aiDecision.collectedDetails || callContext.collectedDetails;
            console.log("[State] Updated to:", callContext.currentState);

            callContext.previousQuestions.push({
              question: text,
              response: aiDecision.response_text
            });
            callContext.userIntention = callContext.userIntention || aiDecision.route;
            callContext.lastInteractionTime = now;
            console.log("[Call Context] Updated:", callContext);

            await sendAudioResponse(ws, callContext, aiDecision.response_text, audioChunks);
            if (aiDecision.route === 'schedule' && aiDecision.check_availability) {
              callContext.pendingScheduling = aiDecision.appointment_details;
            }
          }
        } else if (text === lastTranscription) {
          console.log("[WebSocket] Skipping duplicate transcription:", text);
          failedTranscriptionCount = 0;
        } else {
          console.log("[Whisper] No transcription result found.");
          failedTranscriptionCount++;
          console.log(`[WebSocket] Failed transcription attempt ${failedTranscriptionCount}`);
          if (failedTranscriptionCount >= 3) {
            console.log("[WebSocket] Triggering fallback response");
            const fallbackText = businessData.fallback_responses[0];
            await sendAudioResponse(ws, callContext, fallbackText, audioChunks);
            failedTranscriptionCount = 0;
          }
        }
      } catch (err) {
        console.error("[Error] Processing failed:", err);
      } finally {
        processing = false;
        console.log('[WebSocket] Processing cycle completed.');
      }
    }, 1000);

    ws.on('close', () => {
      clearInterval(interval);
      callContext.currentState = "Initial Greeting";
      console.log('[WebSocket] Client disconnected explicitly.');
    });

    ws.on('error', (err) => {
      console.error('[WebSocket Error]:', err);
    });
  });
}

async function sendAudioResponse(ws, callContext, responseText, audioChunks) {
  const mp3Path = path.join(__dirname, '../audio/response.mp3');
  await generateSpeech(responseText, mp3Path);
  const mulawPath = path.join(__dirname, '../audio/response.mulaw');
  await convertToMulaw(mp3Path, mulawPath);
  const mulawData = fs.readFileSync(mulawPath);
  const base64Mulaw = mulawData.toString('base64');

  const fileSize = mulawData.length;
  const durationSeconds = fileSize / 8000;
  const durationMs = Math.ceil(durationSeconds * 1000);

  if (ws.readyState === ws.OPEN) {
    ws.isAiSpeaking = true;
    console.log("[WebSocket] AI playback started for response");
    ws.send(JSON.stringify({
      event: 'media',
      streamSid: callContext.streamSid,
      media: { payload: base64Mulaw }
    }));
    console.log("[WebSocket] Sent mulaw audio payload");

    setTimeout(() => {
      ws.isAiSpeaking = false;
      audioChunks.length = 0;
      console.log("[WebSocket] AI playback ended for response, duration:", durationMs, "ms, audio buffer cleared");
    }, durationMs);
  } else {
    console.error("[WebSocket] Connection closed, cannot send audio");
  }
}

async function convertToPCM(mulawData) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-f', 'mulaw', '-ar', '8000', '-ac', '1', '-i', 'pipe:0',
      '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1'
    ]);

    let pcmData = Buffer.from([]);
    ffmpeg.stdout.on('data', (data) => {
      pcmData = Buffer.concat([pcmData, data]);
    });

    ffmpeg.stderr.on('data', (data) => {
      console.error("[ffmpeg PCM] stderr:", data.toString());
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log("[ffmpeg] Converted to PCM successfully");
        resolve(pcmData);
      } else {
        console.error("[ffmpeg] PCM conversion failed with code:", code);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.stdin.write(mulawData);
    ffmpeg.stdin.end();
  });
}

async function convertToMulaw(mp3Path, mulawPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', mp3Path, '-f', 'mulaw', '-ar', '8000', '-ac', '1', mulawPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log("[ffmpeg] Converted to mulaw successfully");
        resolve();
      } else {
        console.error("[ffmpeg] Mulaw conversion failed with code:", code);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}