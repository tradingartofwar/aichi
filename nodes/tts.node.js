// nodes/tts.node.js (Updated with Improved Logging, Error Handling, and Path Management)

import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

export async function generateSpeech(text, outputPath) {
  // Log the input parameters for debugging
  console.log("[TTS Node] Generating speech for text:", text);
  console.log("[TTS Node] Target output path:", outputPath);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

  // Make the API request to ElevenLabs
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({ text }),
  });

  // Check if the API request was successful
  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.statusText}`);
  }

  // Get the audio data
  const audioBuffer = await response.arrayBuffer();
  console.log("[TTS Node] Audio buffer received, size:", audioBuffer.byteLength, "bytes");

  // Write the audio file with error handling
  try {
    // Ensure the directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      console.log("[TTS Node] Creating directory:", dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
    console.log("[TTS Node] Audio saved successfully to:", outputPath);
  } catch (error) {
    console.error("[TTS Node] Error saving audio:", error);
    throw error;
  }
}