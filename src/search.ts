import { SearchResult } from './types.js';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

const SEARCH_QUERIES = [
  (name: string) => `"${name}"`,
  (name: string) => `"${name}" 매장수 OR 지점수 OR 점포수`,
  (name: string) => `"${name}" 기업규모 OR 매출 OR 직원수`,
];

async function fetchSearch(query: string): Promise<{ results: SearchResult[]; quotaExceeded: boolean }> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=10`;

  try {
    const response = await fetch(url);
    if (response.status === 429 || response.status === 403) {
      return { results: [], quotaExceeded: true };
    }
    if (!response.ok) {
      console.error(`[웹 검색] API 오류: ${response.status} ${response.statusText}`);
      return { results: [], quotaExceeded: false };
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items)) {
      return { results: [], quotaExceeded: false };
    }

    return {
      results: data.items.map((item: { title?: string; snippet?: string; link?: string }) => ({
        title: item.title ?? '',
        snippet: item.snippet ?? '',
        link: item.link ?? '',
      })),
      quotaExceeded: false,
    };
  } catch (error) {
    console.error(`[웹 검색] "${query}" 검색 실패:`, error);
    return { results: [], quotaExceeded: false };
  }
}

export async function searchCompany(companyName: string): Promise<SearchResult[]> {
  const queries = SEARCH_QUERIES.map((q) => q(companyName));
  const responses = await Promise.all(queries.map(fetchSearch));

  if (responses.some((r) => r.quotaExceeded)) {
    console.error('[웹 검색] Google Search API 일일 한도 초과');
  }

  const all = responses.flatMap((r) => r.results);

  const seen = new Set<string>();
  return all.filter((item) => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}
