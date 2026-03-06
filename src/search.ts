import { SearchResult } from './types.js';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID!;

export async function searchCompany(companyName: string): Promise<SearchResult[]> {
  const query = encodeURIComponent(companyName);
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${query}&num=5`;

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
    console.error('Failed to search company:', error);
    return [];
  }
}
