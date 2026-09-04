import dotenv from 'dotenv';
dotenv.config();

async function getModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  const models = data.models.map((m: any) => m.name);
  console.log('Available models:');
  models.forEach((m: string) => console.log(m));
}
getModels().catch(console.error);
