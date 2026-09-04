import dotenv from 'dotenv';
dotenv.config();

async function getModels() {
  const url = `https://api.groq.com/openai/v1/models`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` } });
  const data = await res.json() as any;
  const models = data.data.map((m: any) => m.id);
  console.log('Available models:');
  models.forEach((m: string) => console.log(m));
}
getModels().catch(console.error);
