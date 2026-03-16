import 'dotenv/config';
import { App } from '@slack/bolt';
import { extractCompanyInfo, evaluateLead, summarizePastLeads } from './evaluator.js';
import { searchPastLeads } from './history.js';
import { ScoreItem, EvaluationResult } from './types.js';

const REQUIRED_ENV_VARS = [
  'SLACK_BOT_TOKEN',
  'SLACK_APP_TOKEN',
  'SLACK_USER_TOKEN',
  'SLACK_CHANNEL_ID',
  'SALES_GROUP_ID',
] as const;

const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[오류] 필수 환경 변수 누락: ${missing.join(', ')}`);
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}초`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = (seconds % 60).toFixed(0);
  return `${minutes}분 ${remainSeconds}초`;
}

function starsToEmoji(stars: number): string {
  const filled = '★'.repeat(Math.max(0, Math.min(5, stars)));
  const empty = '☆'.repeat(5 - filled.length);
  return filled + empty;
}

function formatEvaluation(evaluation: EvaluationResult): string {
  const emoji = RECOMMENDATION_EMOJI[evaluation.recommendation] ?? ':question:';
  const label = RECOMMENDATION_LABEL[evaluation.recommendation] ?? evaluation.recommendation;

  const lines: string[] = [];
  const totalStars = starsToEmoji(Math.round(evaluation.totalScore));
  lines.push(`${emoji} *리드 평가 결과: ${label}* (종합 ${totalStars})`);
  lines.push('');
  lines.push('*[항목별 평가]*');

  const SCORE_ORDER = ['매장 수', '업종 적합성', '대기업 여부', '브랜드 인지도', '업무 메일 여부', '의사결정권'];
  const sorted = SCORE_ORDER
    .map((label) => evaluation.scores.find((s) => s.label === label))
    .filter((s): s is ScoreItem => s != null);

  for (const score of sorted) {
    lines.push(`• ${score.label}: ${starsToEmoji(score.stars)} — ${score.reason}`);
  }

  lines.push('');
  lines.push(`*[종합 의견]*`);
  lines.push(evaluation.opinion);

  return lines.join('\n');
}

async function processLead(
  messageText: string,
  channel: string,
  threadTs: string,
  replyFn: (text: string) => Promise<void>,
) {
  const startTime = Date.now();
  console.log(`\n[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ━━━ 새 메시지 감지 ━━━`);

  try {
    // 1단계: 회사 정보 추출
    console.log('[1/4] 회사 정보 추출 중...');
    await app.client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: threadTs,
      status: '메시지 분석 중...',
      loading_messages: ['메시지 분석 중...'],
    });
    let stepStart = Date.now();
    const companyInfo = await extractCompanyInfo(messageText);
    if (!companyInfo) {
      console.log('[1/4] 회사명을 추출할 수 없어 건너뜁니다.');
      return;
    }
    const { name: companyName, searchQueries } = companyInfo;
    console.log(`[1/4] 회사명: ${companyName}, 검색어: [${searchQueries.join(', ')}] (${formatDuration(Date.now() - stepStart)})`);

    const setStatus = (status: string) =>
      app.client.assistant.threads.setStatus({
        channel_id: channel,
        thread_ts: threadTs,
        status,
        loading_messages: [status],
      });

    await setStatus('이전 문의 이력 확인 중...');

    // 2단계: 이전 이력 검색
    console.log(`[2/4] 이전 이력 검색 중: ${companyName}`);
    stepStart = Date.now();
    const pastLeads = await searchPastLeads(searchQueries, threadTs);
    console.log(`[2/4] 이전 이력 ${pastLeads.length}건 (${formatDuration(Date.now() - stepStart)})`);

    await setStatus('리드 평가 중...');

    // 3단계: 리드 평가
    console.log('[3/4] 리드 평가 중...');
    stepStart = Date.now();
    const evaluation = await evaluateLead(messageText);
    console.log(`[3/4] 평가 결과: ${evaluation.recommendation} (${evaluation.totalScore}/5.0) (${formatDuration(Date.now() - stepStart)})`);

    await setStatus('평가 결과 정리 중...');

    // 4단계: 결과 스레드에 게시
    console.log('[4/4] 결과 정리 및 게시 중...');
    stepStart = Date.now();
    let replyText = formatEvaluation(evaluation);

    if (Math.round(evaluation.totalScore) >= 3) {
      replyText += `\n\n<!subteam^${SALES_GROUP_ID}> 아웃바운드 검토 부탁드립니다.`;
    }

    if (pastLeads.length > 0) {
      const topLeads = pastLeads.slice(0, 10);
      const summaries = await summarizePastLeads(topLeads);
      const lines: string[] = [];
      for (let i = 0; i < topLeads.length && lines.length < 5; i++) {
        const lead = topLeads[i];
        const summary = summaries[i] ?? '요약 없음';
        const date = new Date(Number(lead.timestamp) * 1000).toLocaleDateString('ko-KR');
        lines.push(`\n\n• ${date} #${lead.channel} (<${lead.permalink}|슬랙 링크>)\n  ${summary}`);
      }
      replyText += '\n\n---\n\n:mag: *이전 문의 이력*' + lines.join('');
    } else {
      replyText += '\n\n---\n\n:mag: *이전 문의 이력*\n이전 문의 이력이 없습니다.';
    }

    await replyFn(replyText);

    console.log(`[4/4] ${companyName} 평가 결과 게시 완료 (${formatDuration(Date.now() - stepStart)})`);
    console.log(`━━━ 전체 소요 시간: ${formatDuration(Date.now() - startTime)} ━━━\n`);
  } catch (error) {
    console.error('[오류] 평가 실패:', error);
    await replyFn(':warning: 리드 평가 중 오류가 발생했습니다. 수동 확인이 필요합니다.');
  }
}

// 채널에 새 메시지가 올 때 자동 평가
app.message(async ({ message, say }) => {
  if (!('channel' in message) || message.channel !== SLACK_CHANNEL_ID) return;
  if ('thread_ts' in message && message.thread_ts !== message.ts) return;

  const text = ('text' in message ? message.text : '') ?? '';
  if (!text.trim()) return;

  const ts = ('ts' in message ? message.ts : undefined) as string | undefined;
  if (!ts) return;

  await processLead(text, message.channel, ts, (replyText) =>
    say({ text: replyText, thread_ts: ts }).then(() => {}),
  );
});

// 메시지에 🔍 이모지를 달면 해당 메시지를 평가
app.event('reaction_added', async ({ event }) => {
  if (event.reaction !== 'mag') return;

  try {
    const result = await app.client.conversations.history({
      channel: event.item.channel,
      latest: event.item.ts,
      inclusive: true,
      limit: 1,
    });

    const message = result.messages?.[0];
    const messageText = message?.text?.trim();
    if (!messageText) {
      await app.client.chat.postMessage({
        channel: event.item.channel,
        text: '메시지의 텍스트를 가져올 수 없습니다.',
        thread_ts: event.item.ts,
      });
      return;
    }

    console.log(`\n[이모지] #${event.item.channel} 에서 평가 요청`);
    await processLead(messageText, event.item.channel, event.item.ts, (replyText) =>
      app.client.chat.postMessage({
        channel: event.item.channel,
        text: replyText,
        thread_ts: event.item.ts,
      }).then(() => {}),
    );
  } catch (error) {
    console.error('[오류] 이모지 평가 실패:', error);
    await app.client.chat.postMessage({
      channel: event.item.channel,
      text: ':warning: 리드 평가 중 오류가 발생했습니다.',
      thread_ts: event.item.ts,
    });
  }
});

(async () => {
  await app.start();
  try {
    const channelInfo = await app.client.conversations.info({ channel: SLACK_CHANNEL_ID });
    const channelName = channelInfo.channel?.name ?? SLACK_CHANNEL_ID;
    console.log(`[시작] 리드 평가 봇이 실행되었습니다! (채널: #${channelName})`);
  } catch {
    console.log(`[시작] 리드 평가 봇이 실행되었습니다! (채널 ID: ${SLACK_CHANNEL_ID})`);
  }
})();
