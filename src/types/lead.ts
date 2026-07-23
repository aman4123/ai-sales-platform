export interface Lead {
  id: string;
  company: string;
  contact: string;
  email: string | null;
  phone: string | null;
  industry: string | null;
  status: LeadStatus;
  value: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "INTERESTED"
  | "MEETING"
  | "FOLLOW_UP"
  | "PROPOSAL_SENT"
  | "CLOSED"
  | "LOST";

export const leadStatusLabels: Record<LeadStatus, string> = {
  INTERESTED: "Interested",
  MEETING: "Meeting",
  FOLLOW_UP: "Follow Up",
  PROPOSAL_SENT: "Proposal Sent",
  CLOSED: "Closed",
  LOST: "Lost",
};

export const leadStatuses = Object.keys(leadStatusLabels) as LeadStatus[];

export interface LeadInput {
  company: string;
  contact: string;
  status: LeadStatus;
  value: number;
}
