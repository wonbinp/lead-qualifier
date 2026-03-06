import { SearchResult } from './types.js';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

const SEARCH_QUERIES = [
  (name: string) => `"${name}"`,
  (name: string) => `"${name}" 매장수 OR 지점수 OR 점포수`,
  (name: string) => `"${name}" 기업규모 OR 매출 OR 직원수`,
];

async function fetchSearch(query: string): Promise<SearchResult[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=10`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Google Search API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      return [];
    }

    return data.items.map((item: { title?: string; snippet?: string; link?: string }) => ({
      title: item.title ?? '',
      snippet: item.snippet ?? '',
      link: item.link ?? '',
    }));
  } catch (error) {
    console.error(`Failed to search "${query}":`, error);
    return [];
  }
}

export async function searchCompany(companyName: string): Promise<SearchResult[]> {
  const queries = SEARCH_QUERIES.map((q) => q(companyName));
  const results = await Promise.all(queries.map(fetchSearch));
  const all = results.flat();

  // 링크 기준으로 중복 제거
  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}
