import type { Lead } from "../types/lead";

const STORAGE_KEY = "crm_leads";

export function getLeads(): Lead[] {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) {
    return [
      {
        id: 1,
        company: "Tesla",
        contact: "Elon Musk",
        status: "Interested",
        value: "₹8,50,000",
      },
      {
        id: 2,
        company: "Microsoft",
        contact: "Satya Nadella",
        status: "Meeting",
        value: "₹15,00,000",
      },
      {
        id: 3,
        company: "Amazon",
        contact: "Andy Jassy",
        status: "Follow Up",
        value: "₹6,20,000",
      },
      {
        id: 4,
        company: "Google",
        contact: "Sundar Pichai",
        status: "Proposal Sent",
        value: "₹21,00,000",
      },
    ];
  }

  return JSON.parse(data);
}

export function saveLeads(leads: Lead[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
}