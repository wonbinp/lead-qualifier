import 'dotenv/config';
import { App } from '@slack/bolt';
import { searchCompany } from './search.js';
import { extractCompanyName, evaluateLead } from './evaluator.js';
import { ScoreItem } from './types.js';

const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID!;
const SALES_GROUP_ID = 'S01HAMKMUKE';

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

  for (const score of (evaluation.scores as ScoreItem[])) {
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

  console.log(`[${new Date().toISOString()}] New message detected`);

  // Step 1: Extract company name using Claude
  console.log('Extracting company name...');
  const companyName = await extractCompanyName(text);
  if (!companyName) {
    console.log('Could not extract company name, skipping.');
    return;
  }
  console.log(`Company: ${companyName}`);

  // Step 2: Search for company info
  console.log(`Searching for: ${companyName}`);
  const searchResults = await searchCompany(companyName);
  console.log(`Found ${searchResults.length} search results`);

  // Step 3: Evaluate with Claude
  console.log('Evaluating prospect with Claude...');
  const evaluation = await evaluateLead(text, searchResults);
  console.log(`Result: ${evaluation.recommendation} (${evaluation.totalScore}/5.0)`);

  // Step 4: Post result as thread reply
  let replyText = formatEvaluation(evaluation);

  if (evaluation.recommendation === 'RECOMMENDED') {
    replyText += `\n\n<!subteam^${SALES_GROUP_ID}> 아웃바운드 검토 부탁드립니다.`;
  }

  const ts = ('ts' in message ? message.ts : undefined) as string | undefined;
  if (!ts) return;

  await say({
    text: replyText,
    thread_ts: ts,
  });

  console.log(`Posted evaluation to thread for ${companyName}`);
});

(async () => {
  await app.start();
  console.log('Prospect Evaluator bot is running!');
})();
