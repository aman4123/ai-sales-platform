export type AiProvider = "MOCK" | "DEEPSEEK";
export type Theme = "DARK" | "LIGHT" | "SYSTEM";

export interface UserSettings {
  company: string;
  signature: string;
  aiProvider: AiProvider;
  theme: Theme;
  notifications: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  role: "ADMIN" | "MEMBER";
  settings: UserSettings;
}

export interface AuthPayload {
  user: AuthUser;
  accessToken: string;
}

export interface RegistrationPayload {
  email: string;
  verificationRequired: true;
  developmentVerificationToken?: string;
}

export interface VerificationPayload extends AuthPayload {
  recoveryCodes: string[];
}

export interface SettingsPayload extends UserSettings {
  userId: string;
  name: string;
  email: string;
}

export interface ReportData {
  summary: {
    revenue: number;
    leads: number;
    meetings: number;
    closedDeals: number;
  };
  monthly: Array<{ month: string; leads: number }>;
  status: Array<{ name: string; value: number }>;
}
