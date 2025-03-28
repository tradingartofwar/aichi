from fastapi import FastAPI, Request
import whisper
import numpy as np
import torch
import logging
import math

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
model = whisper.load_model("large-v3", device="cuda:0")
model.eval()
torch.set_float32_matmul_precision('highest')

@app.post("/transcribe")
async def transcribe(request: Request):
    audio_data = await request.body()
    logger.info(f"Received audio chunk of size: {len(audio_data)} bytes")
    
    audio_np = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
    result = model.transcribe(audio_np, fp16=False)
    
    # Log all segments at DEBUG level
    if result["segments"]:
        for segment in result["segments"]:
            text = segment.get("text", "").strip()
            avg_logprob = segment.get("avg_logprob", -float('inf'))
            no_speech_prob = segment.get("no_speech_prob", 1.0)
            confidence = math.exp(avg_logprob)
            logger.debug(f"Transcribed segment: '{text}' with confidence: {confidence:.3f}, avg_logprob: {avg_logprob:.3f}, no_speech_prob: {no_speech_prob:.3f}")
    
    text = ""
    if result["segments"]:
        avg_logprob = result["segments"][0].get("avg_logprob", -float('inf'))
        no_speech_prob = result["segments"][0].get("no_speech_prob", 1.0)
        confidence = math.exp(avg_logprob)
        if confidence > 0.7 and no_speech_prob < 0.4:
            text = result["text"].strip()
            logger.info(f"Accepted transcription: '{text}' with confidence: {confidence:.3f}")
        else:
            logger.debug(f"Transcription below threshold: '{result['text'].strip()}' (confidence: {confidence:.3f}, no_speech_prob: {no_speech_prob:.3f})")
    else:
        logger.debug("No segments found in transcription")

    return {"text": text}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
