import Groq from 'groq-sdk';

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

const MODELO_DEFAULT = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

export async function chatCompletion(messages, model = MODELO_DEFAULT, { temperature = 0.2 } = {}) {
  if (!groq) throw new Error('GROQ_API_KEY no configurada');
  const completion = await groq.chat.completions.create({
    messages,
    model,
    temperature,
  });
  return completion.choices[0]?.message?.content ?? '';
}

export default groq;
