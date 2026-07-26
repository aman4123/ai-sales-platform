export type AiProvider = "MOCK" | "GROQ";
export type Theme = "DARK" | "LIGHT" | "SYSTEM";
export type AccessMode = "USER" | "TESTER" | "MASTER_ADMIN";
export type UserRole = "ADMIN" | "MEMBER" | "USER" | "SUPER_ADMIN";

export interface UserSettings {
  company: string;
  signature: string;
  aiProvider: AiProvider;
  theme: Theme;
  notifications: boolean;
  organization?: string;
  timezone?: string;
  language?: string;
  dataRetentionDays?: number;
  campaignDailyLimit?: number;
  unsubscribeFooter?: string;
  senderName?: string;
  senderEmail?: string;
  privacyMode?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  role: UserRole;
  accountRole: UserRole;
  accessMode: AccessMode;
  availableModes: AccessMode[];
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
