import { WebClient } from '@slack/web-api';
import { PastLead } from './types.js';

const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

const EXCLUDED_CHANNELS = new Set(['tmp-bot-test', 'sales-monday-test']);

const WEIGHT_MAP: Record<number, number[]> = {
  1: [10],
  2: [6, 4],
  3: [5, 3, 2],
};

function toLeads(matches: { ts?: string; text?: string; channel?: { name?: string }; permalink?: string; bot_id?: string }[], currentTs: string): PastLead[] {
  return matches
    .filter((m) => m.ts !== currentTs && (m.text ?? '').trim().length > 0 && !EXCLUDED_CHANNELS.has(m.channel?.name ?? '') && !('bot_id' in m))
    .map((m) => ({
      text: m.text ?? '',
      channel: m.channel?.name ?? '',
      timestamp: m.ts ?? '',
      permalink: m.permalink ?? '',
    }));
}

export async function searchPastLeads(searchQueries: string[], currentTs: string): Promise<PastLead[]> {
  try {
    const perQueryResults = await Promise.all(
      searchQueries.map(async (query, idx) => {
        const result = await userClient.search.messages({
          query,
          sort: 'score',
          sort_dir: 'desc',
          count: 10,
        });
        const matches = result.messages?.matches ?? [];
        const leads = toLeads(matches, currentTs);
        console.log(`  [이력 검색] "${query}": 검색 ${matches.length}건 → 필터링 후 ${leads.length}건`);
        return { query, leads };
      }),
    );

    // 가중치 기반 선택
    const weights = WEIGHT_MAP[searchQueries.length] ?? WEIGHT_MAP[3];
    const seen = new Set<string>();
    const selected: { lead: PastLead; query: string }[] = [];
    let remaining = 0;

    for (let i = 0; i < perQueryResults.length; i++) {
      const { query, leads } = perQueryResults[i];
      const quota = weights[i] + remaining;
      let picked = 0;
      for (const lead of leads) {
        if (picked >= quota) break;
        const key = lead.text.slice(0, 200);
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push({ lead, query });
        picked++;
      }
      console.log(`  [이력 선택] "${query}": 할당 ${weights[i]}건(+보충 ${remaining}건) → 선택 ${picked}건`);
      remaining = quota - picked;
    }

    // 최신순 정렬
    selected.sort((a, b) => Number(b.lead.timestamp) - Number(a.lead.timestamp));

    for (let i = 0; i < selected.length; i++) {
      const { lead, query } = selected[i];
      const date = new Date(Number(lead.timestamp) * 1000).toLocaleDateString('ko-KR');
      console.log(`  [이력 결과] ${i + 1}/${selected.length} "${query}" → ${date} #${lead.channel}`);
    }

    return selected.map((s) => s.lead);
  } catch (error) {
    console.error('[오류] 이전 이력 검색 실패:', error);
    return [];
  }
}
