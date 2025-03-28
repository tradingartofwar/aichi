// mod.calls/o3mini.js (Implementation for OpenAI o3-mini model)
import 'dotenv/config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function runO3Mini(userPrompt) {
  try {
    const response = await openai.chat.completions.create({
      model: 'o3-mini', // Correct model ID as per OpenAI docs
      messages: [
        { role: 'system', content: 'You are a concise AI assistant.' },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.5 // Consistent with gpt-4o-mini
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error('[O3Mini Error]:', err);
    return 'Could not complete o3-mini request.';
  }
}