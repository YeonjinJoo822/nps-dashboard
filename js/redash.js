// =====================================================
// redash.js  —  Redash REST API 헬퍼
// =====================================================

const Redash = (() => {

  /**
   * 쿼리 최신 결과를 rows 배열로 반환
   * Redash가 쿼리를 스케줄 실행하도록 설정돼 있으면
   * 이 호출만으로 최신 캐시 결과를 즉시 받을 수 있음
   */
  async function fetchRows(queryId) {
    // 로컬 서버(server.py)를 통해 Redash 데이터 가져오기 (CORS 우회)
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const url = isLocal
      ? `http://localhost:8765/api/query/${queryId}`
      : `${CONFIG.REDASH_URL}/api/queries/${queryId}/results.json?api_key=${CONFIG.API_KEY}`;

    const res = await fetch(url);

    if (res.status === 403) {
      throw new Error('Redash API Key가 잘못됐거나 권한이 없습니다.');
    }
    if (!res.ok) {
      throw new Error(`Redash 응답 오류 (HTTP ${res.status})`);
    }

    const json = await res.json();

    // 쿼리가 아직 한 번도 실행되지 않은 경우
    if (!json.query_result) {
      throw new Error(`쿼리 ${queryId}의 결과가 없습니다. Redash에서 먼저 실행해 주세요.`);
    }

    return json.query_result.data.rows;   // [{컬럼명: 값, ...}, ...]
  }

  /**
   * 쿼리 강제 재실행 후 결과 반환
   * 다면평가 제출 직후 즉시 최신 데이터가 필요할 때 사용
   * (Redash 버전에 따라 job polling 필요할 수 있음)
   */
  async function refreshAndFetch(queryId) {
    const refreshUrl =
      `${CONFIG.REDASH_URL}/api/queries/${queryId}/refresh` +
      `?api_key=${CONFIG.API_KEY}`;

    await fetch(refreshUrl, { method: 'POST' }).catch(() => {
      // refresh 실패해도 캐시 결과로 대체
      console.warn(`쿼리 ${queryId} refresh 실패. 캐시 결과를 사용합니다.`);
    });

    return fetchRows(queryId);
  }

  return { fetchRows, refreshAndFetch };
})();
