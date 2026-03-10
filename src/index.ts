import 'dotenv/config';
import { App } from '@slack/bolt';
import { searchCompany } from './search.js';
import { extractCompanyName, evaluateLead, summarizePastLeads } from './evaluator.js';
import { searchPastLeads } from './history.js';
import { ScoreItem, PastLead } from './types.js';

const REQUIRED_ENV_VARS = [
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'GOOGLE_API_KEY',
  'GOOGLE_CSE_ID',
  'SLACK_CHANNEL_ID',
  'SALES_GROUP_ID',
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID!;
const SALES_GROUP_ID = process.env.SALES_GROUP_ID!;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const RECOMMENDATION_EMOJI: Record<string, string> = {
  RECOMMENDED: ':large_green_circle:',
  NOT_RECOMMENDED: ':red_circle:',
  NEEDS_REVIEW: ':large_yellow_circle:',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  RECOMMENDED: '추천',
  NOT_RECOMMENDED: '비추천',
  NEEDS_REVIEW: '검토 필요',
};

function starsToEmoji(stars: number): string {
  const filled = '★'.repeat(Math.max(0, Math.min(5, stars)));
  const empty = '☆'.repeat(5 - filled.length);
  return filled + empty;
}

function formatEvaluation(evaluation: ReturnType<typeof Object>): string {
  const emoji = RECOMMENDATION_EMOJI[evaluation.recommendation as string] ?? ':question:';
  const label = RECOMMENDATION_LABEL[evaluation.recommendation as string] ?? evaluation.recommendation;

  const lines: string[] = [];
  const totalStars = starsToEmoji(Math.round(evaluation.totalScore as number));
  lines.push(`${emoji} *프로스펙트 평가 결과: ${label}* (종합 ${totalStars})`);
  lines.push('');
  lines.push('*[항목별 평가]*');

  const SCORE_ORDER = ['매장 수', '업종 적합성', '대기업 여부', '브랜드 인지도', '업무 메일 여부', '의사결정권'];
  const scores = (evaluation.scores as ScoreItem[]);
  const sorted = SCORE_ORDER
    .map((label) => scores.find((s) => s.label === label))
    .filter((s): s is ScoreItem => s != null);

  for (const score of sorted) {
    lines.push(`• ${score.label}: ${starsToEmoji(score.stars)} — ${score.reason}`);
  }

  lines.push('');
  lines.push(`*[종합 의견]*`);
  lines.push(evaluation.opinion as string);

  return lines.join('\n');
}

app.message(async ({ message, say }) => {
  if (!('channel' in message) || message.channel !== SLACK_CHANNEL_ID) return;
  if ('thread_ts' in message && message.thread_ts !== message.ts) return;

  const text = ('text' in message ? message.text : '') ?? '';
  if (!text.trim()) return;

  const ts = ('ts' in message ? message.ts : undefined) as string | undefined;
  if (!ts) return;

  console.log(`[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] New message detected`);

  try {
    // Step 1: Extract company name using Claude
    console.log('Extracting company name...');
    const companyName = await extractCompanyName(text);
    if (!companyName) {
      console.log('Could not extract company name, skipping.');
      return;
    }
    console.log(`Company: ${companyName}`);

    // Step 2: Search for company info + past leads
    console.log(`Searching for: ${companyName}`);
    const [searchResults, pastLeads] = await Promise.all([
      searchCompany(companyName),
      searchPastLeads(companyName, ts),
    ]);
    console.log(`Found ${searchResults.length} search results, ${pastLeads.length} past leads`);

    // Step 3: Evaluate with Claude
    console.log('Evaluating prospect with Claude...');
    const evaluation = await evaluateLead(text, searchResults);
    console.log(`Result: ${evaluation.recommendation} (${evaluation.totalScore}/5.0)`);

    // Step 4: Post result as thread reply
    let replyText = formatEvaluation(evaluation);

    if (Math.round(evaluation.totalScore) >= 3) {
      replyText += `\n\n<!subteam^${SALES_GROUP_ID}> 아웃바운드 검토 부탁드립니다.`;
    }

    if (pastLeads.length > 0) {
      const topLeads = pastLeads.slice(0, 10);
      const summaries = await summarizePastLeads(topLeads);
      const filtered: string[] = [];
      for (let i = 0; i < topLeads.length && filtered.length < 5; i++) {
        const summary = summaries[i] ?? '';
        if (summary === 'SKIP' || summary === '요약 실패' || !summary) continue;
        const lead = topLeads[i];
        const date = new Date(Number(lead.timestamp) * 1000).toLocaleDateString('ko-KR');
        filtered.push(`\n\n• ${date} #${lead.channel} (<${lead.permalink}|슬랙 링크>)\n  ${summary}`);
      }
      if (filtered.length > 0) {
        replyText += '\n\n---\n\n:mag: *이전 문의 이력*' + filtered.join('');
      } else {
        replyText += `\n\n---\n\n:mag: *이전 문의 이력*\n검색 ${pastLeads.length}건 중 세일즈 관련 이력이 없습니다.`;
      }
    } else {
      replyText += '\n\n---\n\n:mag: *이전 문의 이력*\n이전 문의 이력이 없습니다.';
    }

    await say({
      text: replyText,
      thread_ts: ts,
    });

    console.log(`Posted evaluation to thread for ${companyName}`);
  } catch (error) {
    console.error('Evaluation failed:', error);
    const isQuotaExceeded = error instanceof Error && error.message === 'GOOGLE_QUOTA_EXCEEDED';
    const errorMessage = isQuotaExceeded
      ? ':warning: Google 검색 API 일일 한도가 초과되었습니다. 검색 없이 평가할 수 없으므로 수동 확인이 필요합니다.'
      : ':warning: 프로스펙트 평가 중 오류가 발생했습니다. 수동 확인이 필요합니다.';
    await say({
      text: errorMessage,
      thread_ts: ts,
    });
  }
});

(async () => {
  await app.start();
  console.log('Lead Qualifier bot is running!');
})();
