import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function askGemini(prompt, modelName = "gemini-1.5-pro") {
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return response.text();
}

export async function askGeminiStructured(prompt, schema, modelName = "gemini-1.5-pro") {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });
  const result = await model.generateContent(prompt);
  const response = await result.response;
  return JSON.parse(response.text());
}
