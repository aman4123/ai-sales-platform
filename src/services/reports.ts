import { api } from "./api";
import type { ReportData } from "../types/api";

export async function getReports(signal?: AbortSignal): Promise<ReportData> {
  const response = await api.get<{ data: ReportData }>("/reports/summary", { signal });
  return response.data.data;
}
