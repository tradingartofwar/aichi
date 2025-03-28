// mod.calls/gpt4omini.js
import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runGPT4OMini(messages) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are Aichi, a multilingual AI assistant. Respond in the same language as the user\'s query. You can respond in Chinese if asked to respond in Chinese.' },
        ...messages
      ],
      temperature: 0.5
    });
    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('[GPT4OMini Error]:', err);
    return 'Could not complete GPT-4o-mini request.';
  }
}