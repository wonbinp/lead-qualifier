import AnthropicBedrock from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { EvaluationResult, SearchResult, PastLead } from './types.js';

const client = new AnthropicBedrock({
  awsRegion: process.env.AWS_REGION ?? 'ap-northeast-2',
});

const model = process.env.ANTHROPIC_SMALL_FAST_MODEL ?? 'anthropic.claude-sonnet-4-5-v2-20250929';

export async function extractCompanyName(messageText: string): Promise<string | null> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: `주어진 메시지가 영업 리드(제품/서비스 문의, 도입 상담 요청 등)인지 판단하세요.
Typeform, Zapier, 리캐치 등 외부 폼/자동화 도구에서 전달된 알림 메시지는 영업 리드로 판단하세요.
영업 리드가 맞다면 회사명(Company name)만 한 줄로 응답하세요.
영업 리드가 아니라 일반 대화, 잡담, 공지, 단순 회사 언급 등이면 "없음"이라고 응답하세요.
회사명을 찾을 수 없는 경우에도 "없음"이라고 응답하세요.`,
      messages: [{ role: 'user', content: messageText }],
    });

    const text = response.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const companyName = text?.text?.trim() ?? '';

    if (!companyName || companyName === '없음') return null;
    return companyName;
  } catch (error) {
    console.error('Failed to extract company name:', error);
    return null;
  }
}

const SYSTEM_PROMPT = `당신은 메이아이(MayI)의 세일즈 프로스펙트 평가 전문가입니다.

메이아이는 AI 영상 분석 솔루션을 제공하는 회사로, 오프라인 공간의 방문객 행동을 분석하여 비즈니스 인사이트를 제공합니다.

## 당신의 역할
주어진 리드 메시지 원문과 웹 검색 결과를 바탕으로 프로스펙트를 평가합니다.
리드 메시지는 Zapier, Typeform, 리캐치 등 다양한 소스에서 올 수 있으며, 형식이 다를 수 있습니다.
메시지에서 필요한 정보(회사명, 직책, 매장 수, 이메일, 전화 상담 희망 여부 등)를 직접 파악하세요.

## 평가 항목 (6개)

아래 항목별로 1~5점(별점)을 매기세요.

### 1. 매장 수 (가중치 35%)
- 리드가 기입한 매장 수가 있을 경우, 웹 검색 결과와 비교하여 팩트 체크하세요.
- 검색 결과와 크게 다르면 검색 결과를 우선하세요.
- 매장 수 정보가 없으면 웹 검색 결과만으로 판단하세요.
- 5점: 60개 이상
- 4점: 40~59개
- 3점: 20~39개
- 2점: 5~19개
- 1점: 0~4개 또는 정보 없음

### 2. 대기업 여부 (가중치 20%)
- 5점: 대기업 또는 대기업 계열사
- 4점: 중견기업
- 3점: 중소기업이나 성장세 뚜렷
- 2점: 소기업
- 1점: 개인/1인 기업 또는 정보 없음

### 3. 브랜드 인지도 (가중치 10%)
- 5점: 전국적으로 널리 알려진 브랜드
- 4점: 업계에서 잘 알려진 브랜드
- 3점: 일부 지역/업계에서 인지도 있음
- 2점: 인지도 낮음
- 1점: 알려지지 않음 또는 정보 없음

### 4. 업종 적합성 (가중치 25%)
높은 적합성 (4~5점):
- 리테일 (백화점, 마트, 편의점, 쇼핑몰)
- 패션/뷰티 (의류, 화장품 매장)
- 가전/전자 (전자제품 매장, 통신사 대리점)
- 생활용품 (다이소, 올리브영 등)
- 문화/엔터 (영화관, 공연장, 전시관)

중간 적합성 (2~3점):
- 광고대행사/마케팅 에이전시 (오프라인 클라이언트 대행, 파트너 채널 가치)
- F&B (카페, 레스토랑, 프랜차이즈)
- 금융 (은행 지점, 보험사 영업점)
- 부동산/건설 (모델하우스, 분양사무소)
- 제조업 (공장 중심)

낮은 적합성 (1점):
- 교육 (학원, 교육센터)
- 헬스/뷰티 (피트니스, 병원)
- 온라인 전용 사업
- B2B SaaS
- 물류/운송

위 목록에 없는 업종은 메이아이 솔루션(오프라인 방문객 영상 분석)과의 연관성을 종합적으로 판단하여 적절한 점수를 매기세요.

### 5. 업무 메일 여부 (가중치 5%)
- 5점: 회사 도메인 메일 사용 (예: @company.co.kr)
- 3점: 메일 정보 없음
- 1점: 무료 메일 사용 (gmail, naver, hanmail 등)

### 6. 의사결정권 (가중치 5%)
- 5점: C레벨 (CEO, CTO, CMO 등) 또는 임원
- 4점: 팀장/부서장급
- 3점: 매니저/과장급
- 2점: 담당자/사원급
- 1점: 직책 불명 또는 정보 없음

## 추가 고려사항
- 전화 상담을 희망하는 경우 구매 의향이 높은 신호이므로 종합 의견에 긍정적으로 반영하세요.
- 메시지에서 파악할 수 있는 기타 정보(분석 희망 데이터, 유입 경로 등)도 종합 의견에 참고하세요.

## 종합 점수 계산
각 항목의 별점에 가중치를 곱하여 합산하세요.
종합 = (매장수 × 0.35) + (대기업 × 0.20) + (브랜드 × 0.10) + (업종 × 0.25) + (메일 × 0.05) + (의사결정권 × 0.05)
결과는 소수점 첫째자리까지 표시 (예: 4.2)

## 추천 기준
- 종합 3.5 이상: RECOMMENDED
- 종합 2.0~3.4: NEEDS_REVIEW
- 종합 2.0 미만: NOT_RECOMMENDED

## 응답 형식
반드시 다음 JSON 형식으로만 응답하세요:
{
  "recommendation": "RECOMMENDED" | "NOT_RECOMMENDED" | "NEEDS_REVIEW",
  "totalScore": 4.2,
  "scores": [
    {"label": "매장 수", "stars": 5, "reason": "전국 1,900개 매장 운영"},
    {"label": "대기업 여부", "stars": 5, "reason": "글로벌 기업 스타벅스의 한국 법인"},
    {"label": "브랜드 인지도", "stars": 5, "reason": "국내 최고 수준 인지도"},
    {"label": "업종 적합성", "stars": 5, "reason": "리테일/F&B, 오프라인 매장 중심 사업"},
    {"label": "업무 메일 여부", "stars": 5, "reason": "회사 도메인(starbucks.co.kr) 사용"},
    {"label": "의사결정권", "stars": 4, "reason": "마케팅팀장급, 의사결정 영향력 있음"}
  ],
  "opinion": "종합 의견을 2~3문장으로 작성"
}`;

export async function evaluateLead(
  messageText: string,
  searchResults: SearchResult[],
): Promise<EvaluationResult> {
  const searchContext = searchResults.length > 0
    ? searchResults.map(r => `- ${r.title}: ${r.snippet}`).join('\n')
    : '검색 결과 없음';

  const userMessage = `다음 리드 메시지를 평가해주세요.

## 리드 메시지 원문
${messageText}

## 웹 검색 결과
${searchContext}`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const responseText = text?.text ?? '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        recommendation: 'NEEDS_REVIEW',
        totalScore: 0,
        scores: [],
        opinion: `AI 응답 파싱 실패: ${responseText.slice(0, 200)}`,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return {
        recommendation: 'NEEDS_REVIEW',
        totalScore: 0,
        scores: [],
        opinion: `AI 응답 JSON 파싱 실패: ${responseText.slice(0, 200)}`,
      };
    }

    const validRecommendations = ['RECOMMENDED', 'NOT_RECOMMENDED', 'NEEDS_REVIEW'] as const;

    if (!validRecommendations.includes(parsed.recommendation)) {
      return {
        recommendation: 'NEEDS_REVIEW',
        totalScore: parsed.totalScore ?? 0,
        scores: parsed.scores ?? [],
        opinion: parsed.opinion ?? 'AI 응답에서 유효한 추천 결과를 찾을 수 없습니다.',
      };
    }

    return {
      recommendation: parsed.recommendation,
      totalScore: parsed.totalScore ?? 0,
      scores: parsed.scores ?? [],
      opinion: parsed.opinion ?? '',
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error('Claude API rate limited - will retry later');
      return { recommendation: 'NEEDS_REVIEW', totalScore: 0, scores: [], opinion: 'API 호출 제한으로 평가를 완료하지 못했습니다.' };
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error ${error.status}:`, error.message);
      return { recommendation: 'NEEDS_REVIEW', totalScore: 0, scores: [], opinion: `API 오류 (${error.status}): ${error.message}` };
    }
    throw error;
  }
}

export async function summarizePastLeads(pastLeads: PastLead[]): Promise<string[]> {
  const leadsText = pastLeads
    .map((lead, i) => `[${i + 1}] ${lead.text.slice(0, 300)}`)
    .join('\n\n');

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: `주어진 Slack 메시지들을 각각 한 줄로 요약하세요.
각 메시지가 어떤 성격인지(리드 문의, 봇 평가 결과, 미팅 후기, 일반 대화 등) 알 수 있도록 요약하세요.
세일즈와 무관한 메시지(일반 대화, 잡담, 공지 등)는 "SKIP"이라고 응답하세요.
반드시 JSON 배열 형식으로만 응답하세요. 예: ["요약1", "SKIP", "요약3"]`,
      messages: [{ role: 'user', content: leadsText }],
    });

    const text = response.content.find((b: { type: string }) => b.type === 'text') as { type: 'text'; text: string } | undefined;
    const responseText = text?.text ?? '';

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return pastLeads.map(() => '요약 실패');

    const parsed = JSON.parse(jsonMatch[0]) as string[];
    return pastLeads.map((_, i) => parsed[i] ?? '요약 없음');
  } catch (error) {
    console.error('Failed to summarize past leads:', error);
    return pastLeads.map(() => '요약 실패');
  }
}
