import Groq from 'groq-sdk';

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;

// TODO(Esteban): usar esto en agents/agente1_conversacional.js para reemplazar
// el heuristico por keywords con una interpretacion real del mensaje libre.
export async function chatCompletion(messages, model = 'llama-3.1-8b-instant') {
  if (!groq) throw new Error('GROQ_API_KEY no configurada');
  const completion = await groq.chat.completions.create({
    messages,
    model,
    temperature: 0.2,
  });
  return completion.choices[0]?.message?.content ?? '';
}

export default groq;
