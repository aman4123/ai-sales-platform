export type SearchProviderName = "TAVILY" | "BRAVE" | "SERPER";

export interface SearchOptions {
  limit: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface SearchResponse {
  provider: SearchProviderName;
  query: string;
  results: SearchResult[];
  retrievedAt: string;
}

export interface RetrievedPage {
  url: string;
  content: string;
  contentType: string;
  retrievedAt: string;
  promptInjectionDetected: boolean;
}

export interface SearchProviderHealth {
  provider: SearchProviderName;
  configured: boolean;
  liveCheckPerformed: false;
}

export interface SearchProvider {
  readonly name: SearchProviderName;
  search(query: string, options: SearchOptions): Promise<SearchResponse>;
  getPage(url: string): Promise<RetrievedPage>;
  healthCheck(): Promise<SearchProviderHealth>;
}
