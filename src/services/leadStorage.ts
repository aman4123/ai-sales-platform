import { api } from "./api";
import type { Lead, LeadInput, LeadStatus } from "../types/lead";

export interface LeadPage {
  leads: Lead[];
  total: number;
  nextCursor: string | null;
}

interface LeadQuery {
  search?: string;
  status?: LeadStatus;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export async function getLeadPage(query: LeadQuery = {}): Promise<LeadPage> {
  const { signal, ...params } = query;
  const response = await api.get<{ data: LeadPage }>("/leads", { params, signal });
  return response.data.data;
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
