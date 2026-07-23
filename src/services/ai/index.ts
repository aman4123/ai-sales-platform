import { api } from "../api";

export async function askDemoAI(prompt: string): Promise<string> {
  const response = await api.post<{ data: { result: string } }>("/ai/demo", { prompt });
  return response.data.data.result;
}

export async function researchWithAI(prompt: string): Promise<string> {
  const response = await api.post<{ data: { result: string } }>("/ai/research", { prompt });
  return response.data.data.result;
}

export async function generateEmailWithAI(input: {
  company: string;
  contact: string;
  industry: string;
  tone: "Professional" | "Friendly" | "Sales" | "Formal";
}): Promise<string> {
  const response = await api.post<{ data: { result: string } }>("/ai/email", input);
  return response.data.data.result;
}
