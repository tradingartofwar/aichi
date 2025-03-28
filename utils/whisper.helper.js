// whisper.helper.js
import { exec } from 'child_process';
import path from 'path';

export function transcribeLocal(audioFilePath) {
  return new Promise((resolve, reject) => {
    const command = `python ${path.resolve('./websocket/whisper.transcribe.py')} ${audioPath}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('[Whisper Helper] Transcription Error:', stderr);
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}
