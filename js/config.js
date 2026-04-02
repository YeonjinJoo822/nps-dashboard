// =====================================================
// config.js  —  Redash 연결 설정
// =====================================================
// ⚠️  아래 값을 실제 환경에 맞게 채워주세요.
// =====================================================

const CONFIG = {
  // Redash 서버 주소 (끝에 슬래시 없이)
  // 예: 'https://redash.teamsparta.co'
  REDASH_URL: 'https://redash-v2.spartacodingclub.kr',

  // Redash → 프로필 → API Key
  API_KEY: 'CGPLcJRyb2kaUPtxVhX84YHPNcOV4u37QVKjlE09',

  // ── 쿼리 ID ──────────────────────────────────────
  // Redash에서 쿼리 URL: /queries/{ID}
  QUERY_AGGREGATE:  6867,   // 기존 트랙/회차/챕터 집계 쿼리 ID
  QUERY_INDIVIDUAL: 6868,   // 신규 개인별 원본 쿼리 ID  ← redash_query_individual.sql

  // ── 자동 새로고침 ─────────────────────────────────
  // 다면평가 제출 후 Redash 캐시 갱신 주기에 맞춰 설정
  // 0 으로 설정하면 자동 새로고침 비활성화
  AUTO_REFRESH_MS: 5 * 60 * 1000,   // 5분

  // ── 위험 감지 기준 ────────────────────────────────
  RISK: {
    DETRACTOR_MAX:     6,   // 이 점수 이하 → 즉각대응
    DROP_THRESHOLD:    3,   // 직전 대비 이 점 이상 하락 → 이탈위험
  },
};