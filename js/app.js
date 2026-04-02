// =====================================================
// app.js  —  대시보드 메인 로직
// =====================================================

// ── 전역 상태 ──────────────────────────────────────
let aggData = [];      // 집계 쿼리 결과 (트랙/회차/챕터별)
let indData = [];      // 개인별 쿼리 결과 (수강생별 챕터별)

let chartNps  = null;
let chartDonut = null;
let chartSat  = null;

// ── 데이터 로드 ────────────────────────────────────
async function loadData() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading');
  btn.textContent = '로딩 중...';

  try {
    [aggData, indData] = await Promise.all([
      Redash.fetchRows(CONFIG.QUERY_AGGREGATE),
      Redash.fetchRows(CONFIG.QUERY_INDIVIDUAL),
    ]);

    populateFilters();
    renderAll();

    document.getElementById('lastUpdated').textContent =
      '업데이트: ' + new Date().toLocaleString('ko-KR');

  } catch (err) {
    console.error(err);
    document.getElementById('lastUpdated').textContent =
      '⚠ 로드 실패: ' + err.message;
  } finally {
    btn.classList.remove('loading');
    btn.textContent = '↻ 새로고침';
  }
}

// ── 필터 드롭다운 생성 ─────────────────────────────
function populateFilters() {
  const tracks = [...new Set(aggData.map(r => r['트랙']))].filter(Boolean).sort();
  const rounds = [...new Set(aggData.map(r => r['회차']))].filter(Boolean).sort();

  const tSel = document.getElementById('filterTrack');
  const rSel = document.getElementById('filterRound');

  const tVal = tSel.value;
  const rVal = rSel.value;

  tSel.innerHTML = '<option value="">트랙 전체</option>' +
    tracks.map(t => `<option value="${t}" ${t === tVal ? 'selected' : ''}>${t}</option>`).join('');

  rSel.innerHTML = '<option value="">회차 전체</option>' +
    rounds.map(r => `<option value="${r}" ${r === rVal ? 'selected' : ''}>${r}</option>`).join('');
}

// ── 필터 적용 ──────────────────────────────────────
function getFiltered() {
  const track = document.getElementById('filterTrack').value;
  const round = document.getElementById('filterRound').value;

  return {
    agg: aggData.filter(r =>
      (!track || r['트랙'] === track) &&
      (!round || r['회차'] === round)
    ),
    ind: indData.filter(r =>
      (!track || r['트랙'] === track) &&
      (!round || r['회차'] === round)
    ),
  };
}

function onFilterChange() { renderAll(); }

// ── 전체 렌더 ──────────────────────────────────────
function renderAll() {
  const { agg, ind } = getFiltered();
  renderKPIs(agg, ind);
  renderNpsChart(agg);
  renderDonutChart(agg);
  renderSatChart(agg);
  renderRiskTables(ind);
  renderHeatmap(ind);
}

// ── KPI 카드 ───────────────────────────────────────
function renderKPIs(agg, ind) {
  // NPS 가중 평균
  const totalP = agg.reduce((s, r) => s + (r['만족']   || 0), 0);
  const totalD = agg.reduce((s, r) => s + (r['불만족'] || 0), 0);
  const totalN = agg.reduce((s, r) => s + (r['중간']   || 0), 0);
  const responded = totalP + totalD + totalN;
  const nps = responded > 0 ? Math.round(((totalP - totalD) / responded) * 100) : null;

  // 제출율
  const totalAll = agg.reduce((s, r) => s + (r['총인원'] || 0), 0);
  const submitRate = totalAll > 0 ? Math.round((responded / totalAll) * 100) : null;

  // 위험 감지
  const { urgent, risk } = detectRisk(ind);

  // NPS 표시
  const npsEl = document.getElementById('kpiNps');
  npsEl.textContent = nps !== null ? nps : '—';
  npsEl.style.color = npsColor(nps);

  document.getElementById('kpiNpsGrade').textContent = npsGrade(nps);
  document.getElementById('kpiUrgent').textContent = `${urgent.length}명`;
  document.getElementById('kpiRisk').textContent   = `${risk.length}명`;
  document.getElementById('kpiSubmit').textContent =
    submitRate !== null ? `${submitRate}%` : '—';
  document.getElementById('kpiSubmitDetail').textContent =
    responded > 0 ? `${responded} / ${totalAll}명 제출` : '';
}

function npsColor(v) {
  if (v === null) return '';
  if (v >= 50) return '#15803d';
  if (v >= 20) return '#1d4ed8';
  if (v >= 0)  return '#92400e';
  return '#b91c1c';
}

function npsGrade(v) {
  if (v === null) return '';
  if (v >= 80) return '세계적 수준 🌟';
  if (v >= 50) return '훌륭한 수준 👍';
  if (v >= 20) return '좋은 수준';
  if (v >= 0)  return '보통 수준';
  return '개선 필요 ⚠';
}

// ── 위험 수강생 감지 ───────────────────────────────
function detectRisk(ind) {
  // 수강생별로 챕터 묶기
  const byStudent = {};
  ind.forEach(r => {
    const key = `${r['트랙']}__${r['회차']}__${r['이름']}`;
    if (!byStudent[key]) {
      byStudent[key] = {
        name: r['이름'], track: r['트랙'], round: r['회차'],
        chapters: [],
      };
    }
    byStudent[key].chapters.push({
      ch:          Number(r['CH']),
      chapterName: r['챕터명'],
      nps:         r['nps'] !== undefined ? Number(r['nps']) : null,
      satisfaction: r['만족도'],
      difficulty:   r['난이도'],
      group:        r['그룹'],
    });
  });

  const urgent = [];
  const risk   = [];

  Object.values(byStudent).forEach(({ name, track, round, chapters }) => {
    const sorted = chapters
      .filter(c => c.nps !== null)
      .sort((a, b) => a.ch - b.ch);

    if (sorted.length === 0) return;

    const latest = sorted[sorted.length - 1];
    const prev   = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

    // 즉각대응: 최신 챕터 NPS ≤ 기준값
    if (latest.nps <= CONFIG.RISK.DETRACTOR_MAX) {
      urgent.push({ name, track, round, ...latest });
    }
    // 이탈위험: 직전 대비 DROP_THRESHOLD 이상 하락 (Detractor 아닌 경우)
    else if (prev && (latest.nps - prev.nps) <= -CONFIG.RISK.DROP_THRESHOLD) {
      risk.push({ name, track, round, ...latest, prevNps: prev.nps });
    }
  });

  // NPS 낮은 순 정렬
  urgent.sort((a, b) => a.nps - b.nps);
  risk.sort((a, b) => (a.nps - a.prevNps) - (b.nps - b.prevNps));

  return { urgent, risk };
}

// ── 챕터별 NPS 추이 차트 ───────────────────────────
function renderNpsChart(agg) {
  // CH 별로 집계
  const byChapter = {};
  agg.forEach(r => {
    const ch = Number(r['CH']);
    if (!byChapter[ch]) byChapter[ch] = { p: 0, n: 0, d: 0 };
    byChapter[ch].p += r['만족']   || 0;
    byChapter[ch].n += r['중간']   || 0;
    byChapter[ch].d += r['불만족'] || 0;
  });

  const chs    = Object.keys(byChapter).map(Number).sort((a, b) => a - b);
  const labels = chs.map(ch => `Ch ${ch}`);

  const npsVals = chs.map(ch => {
    const { p, n, d } = byChapter[ch];
    const total = p + n + d;
    return total > 0 ? Math.round(((p - d) / total) * 100) : null;
  });

  const pointColors = npsVals.map(v =>
    v === null ? '#9ca3af' : v >= 50 ? '#22c55e' : v >= 20 ? '#3b82f6' : v >= 0 ? '#f97316' : '#ef4444'
  );

  if (chartNps) chartNps.destroy();
  chartNps = new Chart(document.getElementById('chartNps'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'NPS',
        data: npsVals,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.07)',
        borderWidth: 3,
        pointRadius: 7,
        pointHoverRadius: 9,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        tension: 0.35,
        fill: true,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const ch = chs[ctx.dataIndex];
              const { p, n, d } = byChapter[ch];
              return [
                ` NPS: ${ctx.parsed.y}`,
                ` Promoter: ${p}명  Passive: ${n}명  Detractor: ${d}명`,
              ];
            },
          },
        },
        annotation: {
          annotations: {
            zero: {
              type: 'line', yMin: 0, yMax: 0,
              borderColor: 'rgba(0,0,0,.15)', borderWidth: 1, borderDash: [4, 4],
            },
          },
        },
      },
      scales: {
        y: {
          min: -100, max: 100,
          grid: { color: '#f3f4f6' },
          ticks: { callback: v => v },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

// ── 도넛 차트 (최신 챕터 분포) ─────────────────────
function renderDonutChart(agg) {
  const maxCh   = Math.max(...agg.map(r => Number(r['CH']) || 0), 0);
  const latest  = agg.filter(r => Number(r['CH']) === maxCh);

  const p = latest.reduce((s, r) => s + (r['만족']   || 0), 0);
  const n = latest.reduce((s, r) => s + (r['중간']   || 0), 0);
  const d = latest.reduce((s, r) => s + (r['불만족'] || 0), 0);
  const total = p + n + d;

  if (chartDonut) chartDonut.destroy();
  chartDonut = new Chart(document.getElementById('chartDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Promoter (9-10)', 'Passive (7-8)', 'Detractor (0-6)'],
      datasets: [{
        data: [p, n, d],
        backgroundColor: ['#22c55e', '#eab308', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 12 }, padding: 16 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? Math.round((ctx.parsed / total) * 100) : 0;
              return ` ${ctx.label}: ${ctx.parsed}명 (${pct}%)`;
            },
          },
        },
      },
    },
  });

  // 하단 수치 요약
  const pct = v => total > 0 ? Math.round((v / total) * 100) : 0;
  document.getElementById('donutStats').innerHTML = `
    <div><span style="color:#22c55e">${p}명</span>${pct(p)}%</div>
    <div><span style="color:#eab308">${n}명</span>${pct(n)}%</div>
    <div><span style="color:#ef4444">${d}명</span>${pct(d)}%</div>
  `;
}

// ── 만족도·난이도 추이 차트 ────────────────────────
function renderSatChart(agg) {
  const byChapter = {};
  agg.forEach(r => {
    const ch = Number(r['CH']);
    if (!byChapter[ch]) byChapter[ch] = { sat: [], diff: [] };
    if (r['만족도'] != null) byChapter[ch].sat.push(Number(r['만족도']));
    if (r['난이도'] != null) byChapter[ch].diff.push(Number(r['난이도']));
  });

  const chs    = Object.keys(byChapter).map(Number).sort((a, b) => a - b);
  const labels = chs.map(ch => `Ch ${ch}`);
  const avg    = arr => arr.length ? Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 : null;

  if (chartSat) chartSat.destroy();
  chartSat = new Chart(document.getElementById('chartSat'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '만족도',
          data: chs.map(ch => avg(byChapter[ch].sat)),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,.06)',
          borderWidth: 2.5,
          pointRadius: 5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
        {
          label: '난이도',
          data: chs.map(ch => avg(byChapter[ch].diff)),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,.06)',
          borderWidth: 2.5,
          pointRadius: 5,
          tension: 0.35,
          fill: false,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: { min: 1, max: 10, grid: { color: '#f3f4f6' } },
        x: { grid: { display: false } },
      },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 13 } } },
      },
    },
  });
}

// ── 위험 테이블 렌더 ───────────────────────────────
function renderRiskTables(ind) {
  const { urgent, risk } = detectRisk(ind);

  document.getElementById('urgentCount').textContent = `${urgent.length}명`;
  document.getElementById('riskCount').textContent   = `${risk.length}명`;

  const urgentTbody = document.querySelector('#tableUrgent tbody');
  urgentTbody.innerHTML = urgent.length === 0
    ? `<tr><td colspan="6" class="empty-msg">해당 인원 없음</td></tr>`
    : urgent.map(s => `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.track} ${s.round}</td>
          <td>${s.chapterName ?? ''}</td>
          <td>${npsChip(s.nps)}</td>
          <td>${s.satisfaction ?? '—'}</td>
          <td>${s.difficulty ?? '—'}</td>
        </tr>`).join('');

  const riskTbody = document.querySelector('#tableRisk tbody');
  riskTbody.innerHTML = risk.length === 0
    ? `<tr><td colspan="6" class="empty-msg">해당 인원 없음</td></tr>`
    : risk.map(s => {
        const delta = s.nps - s.prevNps;
        return `
          <tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.track} ${s.round}</td>
            <td>${s.chapterName ?? ''}</td>
            <td>${npsChip(s.nps)}</td>
            <td>${npsChip(s.prevNps)}</td>
            <td class="delta-neg">${delta}</td>
          </tr>`;
      }).join('');
}

function npsChip(v) {
  if (v === null || v === undefined) return '—';
  const cls = v >= 9 ? 'chip-green' : v >= 7 ? 'chip-yellow' : 'chip-red';
  return `<span class="nps-chip ${cls}">${v}</span>`;
}

// ── 히트맵 렌더 ────────────────────────────────────
function renderHeatmap(ind) {
  const wrap = document.getElementById('heatmapWrap');

  if (ind.length === 0) {
    wrap.innerHTML = '<p class="empty-msg">데이터가 없습니다.</p>';
    return;
  }

  // 수강생 목록 (이름 가나다순)
  const students = [...new Set(ind.map(r => r['이름']))].filter(Boolean).sort();
  // 챕터 번호 목록
  const chs      = [...new Set(ind.map(r => Number(r['CH'])))].sort((a, b) => a - b);

  // 챕터 번호 → 챕터명 매핑
  const chapterName = {};
  ind.forEach(r => { chapterName[Number(r['CH'])] = r['챕터명']; });

  // lookup: "이름__CH" → nps
  const lookup = {};
  ind.forEach(r => {
    const key = `${r['이름']}__${Number(r['CH'])}`;
    lookup[key] = r['nps'] !== undefined ? Number(r['nps']) : null;
  });

  const header = `
    <tr>
      <th class="name-th">이름</th>
      ${chs.map(ch => `
        <th title="${chapterName[ch] ?? ''}">
          Ch${ch}<br>
          <small style="font-weight:400;color:#9ca3af">
            ${(chapterName[ch] ?? '').slice(0, 6)}
          </small>
        </th>`).join('')}
    </tr>`;

  const rows = students.map(name => {
    const cells = chs.map(ch => {
      const nps = lookup[`${name}__${ch}`];
      if (nps === null || nps === undefined) {
        return `<td class="cell-empty">—</td>`;
      }
      const cls = nps >= 9 ? 'cell-promoter' : nps >= 7 ? 'cell-passive' : 'cell-detractor';
      return `<td class="${cls}">${nps}</td>`;
    }).join('');

    return `<tr><td class="name-cell">${name}</td>${cells}</tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="heatmap-table">
      <thead>${header}</thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ── 자동 새로고침 & 초기 실행 ──────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadData();

  if (CONFIG.AUTO_REFRESH_MS > 0) {
    setInterval(loadData, CONFIG.AUTO_REFRESH_MS);
  }
});
