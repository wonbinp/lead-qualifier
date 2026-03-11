# Lead Qualifier

영업 리드(인바운드 문의)가 슬랙 채널에 올라오면 자동으로 리드를 평가하는 슬랙 봇입니다.

## 동작 흐름

1. 지정된 슬랙 채널에 새 메시지가 올라오면 Claude(Bedrock)로 회사명을 추출
2. Google Custom Search API로 회사 정보(매장 수, 기업 규모 등)를 검색
3. 슬랙 내 과거 문의 이력을 동시 검색
4. Claude가 6개 항목으로 리드를 평가하여 스레드에 결과 답글
5. 종합 3점 이상이면 세일즈 그룹을 멘션하여 아웃바운드 검토 요청

## 평가 항목

| 항목 | 가중치 |
|------|--------|
| 매장 수 | 35% |
| 업종 적합성 | 25% |
| 대기업 여부 | 20% |
| 브랜드 인지도 | 10% |
| 업무 메일 여부 | 5% |
| 의사결정권 | 5% |

종합 점수에 따라 추천(3.5+) / 검토 필요(2.0~3.4) / 비추천(2.0 미만)으로 분류됩니다.

## 기술 스택

- TypeScript + Node.js
- [@slack/bolt](https://www.npmjs.com/package/@slack/bolt) — 슬랙 봇 (Socket Mode)
- [@anthropic-ai/bedrock-sdk](https://www.npmjs.com/package/@anthropic-ai/bedrock-sdk) — Claude via AWS Bedrock
- Google Custom Search API — 기업 정보 검색

## 설정

### 환경 변수

`.env.example`을 참고하여 `.env` 파일을 생성하세요.

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
GOOGLE_API_KEY=...
GOOGLE_CSE_ID=...
SLACK_CHANNEL_ID=C...
SALES_GROUP_ID=S...
```

- **SLACK_BOT_TOKEN** / **SLACK_APP_TOKEN** — 슬랙 앱 토큰 (Socket Mode 활성화 필요)
- **GOOGLE_API_KEY** / **GOOGLE_CSE_ID** — Google Custom Search 설정
- **SLACK_CHANNEL_ID** — 리드가 올라오는 슬랙 채널 ID
- **SALES_GROUP_ID** — 멘션할 세일즈 유저 그룹 ID

AWS Bedrock 인증은 기본 AWS 자격 증명 체인(환경 변수, ~/.aws/credentials 등)을 사용합니다.

## 실행

```bash
npm install

# 개발
npm run dev

# 프로덕션
npm run build
npm start
```
