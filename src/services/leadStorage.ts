import { api } from "./api";
import type { Lead, LeadInput } from "../types/lead";

export async function getLeads(): Promise<Lead[]> {
  const response = await api.get<{ data: { leads: Lead[] } }>("/leads");
  return response.data.data.leads;
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const response = await api.post<{ data: { lead: Lead } }>("/leads", input);
  return response.data.data.lead;
}

export async function updateLead(id: string, input: LeadInput): Promise<Lead> {
  const response = await api.put<{ data: { lead: Lead } }>(`/leads/${id}`, input);
  return response.data.data.lead;
}

export async function removeLead(id: string): Promise<void> {
  await api.delete(`/leads/${id}`);
}
