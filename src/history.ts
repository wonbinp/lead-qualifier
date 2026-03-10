import { WebClient } from '@slack/web-api';
import { PastLead } from './types.js';

const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

export async function searchPastLeads(companyName: string, currentTs: string): Promise<PastLead[]> {
  try {
    const result = await userClient.search.messages({
      query: companyName,
      sort: 'score',
      sort_dir: 'desc',
      count: 20,
    });

    const matches = result.messages?.matches ?? [];
    console.log(`[History] Search for "${companyName}": ${matches.length} matches found`);

    const seen = new Set<string>();
    return matches
      .filter((m) => m.ts !== currentTs && (m.text ?? '').trim().length > 0)
      .map((m) => ({
        text: m.text ?? '',
        channel: m.channel?.name ?? '',
        timestamp: m.ts ?? '',
        permalink: m.permalink ?? '',
      }))
      .filter((lead) => {
        const key = lead.text.slice(0, 200);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch (error) {
    console.error('Failed to search past leads:', error);
    return [];
  }
}
