<script setup>
import { computed } from 'vue'
import { db, userById } from '../store'
import { stageLabel, roleLabel, localDate, localDateTime } from '../constants'
import { questionScores, teamName, fmt } from '../reports'

// 개인별 최종 평가 보고서. 최종 확정 시 저장한 값만 쓴다(미확정 결과는 출력하지 않는다).
const props = defineProps({ userId: { type: Number, required: true } })
const user = computed(() => userById(props.userId))
const fin = computed(() => db.finalized[props.userId])
const v = computed(() => fin.value?.values)
const printedAt = localDate(new Date())
const n = (x, suffix = '') => (x === null || x === undefined ? '미확정' : fmt(x) + suffix)
const signed = (x) => (x === null || x === undefined ? '미입력' : `${x > 0 ? '+' : ''}${x}점`)
const KIND = { dept: '부서별 보정', person: '개인별 보정', override: '최종 점수 직접 수정', legacy: '이전 방식 조정' }
const histVal = (h, x) => (h.kind === 'override' ? (x === null ? '없음' : `${x}점`) : h.kind === 'legacy' ? (x ?? '-') : signed(x))
const adjText = (a) => (!a ? '조정 없음' : a.type === 'reset' ? '조정 해제' : a.type === 'set' ? `점수 지정 (${a.value}점)` : `${a.value >= 0 ? '+' : ''}${a.value}점`)
</script>

<template>
  <article class="report" :data-report-user="user?.name">
    <template v-if="user && fin">
      <header class="r-head">
        <div>
          <div class="r-kicker">Rollent · {{ db.period.name }}</div>
          <h1>개인별 최종 평가 보고서</h1>
        </div>
        <div class="r-meta">출력일 {{ printedAt }}<br />최종 확정 {{ localDate(fin.at) }}</div>
      </header>

      <h2>1. 기본 정보</h2>
      <table class="kv">
        <tr><th>이름</th><td>{{ user.name }}</td><th>소속팀</th><td>{{ teamName(user.teamId) }}</td></tr>
        <tr><th>직급</th><td>{{ user.position }} ({{ roleLabel(user.role) }})</td><th>평가 기간</th><td>{{ db.period.start }} ~ {{ db.period.end }}</td></tr>
      </table>

      <h2>2. 평가 개요</h2>
      <table class="kv">
        <tr><th>완료 상태</th><td>최종 확정</td><th>적용 평가 단계</th><td>{{ v.stages.map((s) => stageLabel(s.stage)).join(' → ') }}</td></tr>
      </table>

      <h2>3. 평가 결과</h2>
      <h3>항목별 점수</h3>
      <table class="grid">
        <thead><tr><th>평가 단계</th><th>평가 항목</th><th class="r">배점</th><th class="r">획득 점수</th></tr></thead>
        <tbody>
          <template v-for="s in v.stages" :key="s.stage">
            <tr v-for="(i, idx) in s.items" :key="s.stage + i.itemId">
              <td v-if="idx === 0" :rowspan="s.items.length">{{ stageLabel(s.stage) }}</td>
              <td>{{ i.name }}</td><td class="r">{{ i.points }}</td><td class="r">{{ n(i.score) }}</td>
            </tr>
          </template>
        </tbody>
      </table>

      <h3>문항별 점수 (선택지 점수 평균)</h3>
      <table class="grid small">
        <thead><tr><th>단계</th><th>항목</th><th>문항</th><th class="r">점수 / 최고</th></tr></thead>
        <tbody>
          <template v-for="s in v.stages" :key="'q' + s.stage">
            <tr v-for="(q, qi) in questionScores(user, s.stage)" :key="s.stage + qi">
              <td>{{ stageLabel(s.stage) }}</td><td>{{ q.item }}</td><td>{{ q.text }}</td>
              <td class="r">{{ n(q.score) }} / {{ q.max ?? '-' }}<span v-if="q.count > 1"> ({{ q.count }}명 평균)</span></td>
            </tr>
          </template>
        </tbody>
      </table>

      <h3>단계별 점수와 가중치</h3>
      <table class="grid">
        <thead><tr><th>평가 단계</th><th class="r">원점수 / 배점 합</th><th class="r">단계 점수 (100점 기준)</th><th class="r">가중치</th><th class="r">반영 점수</th></tr></thead>
        <tbody>
          <tr v-for="s in v.stages" :key="'w' + s.stage">
            <td>{{ stageLabel(s.stage) }}</td>
            <td class="r">{{ n(s.raw) }} / {{ s.max }}</td>
            <td class="r">{{ n(s.score100) }}</td>
            <td class="r">{{ n(v.weights.find((w) => w.stage === s.stage)?.weight, '%') }}</td>
            <td class="r">{{ n(s.score100 !== null ? (s.score100 * (v.weights.find((w) => w.stage === s.stage)?.weight ?? 0)) / 100 : null) }}</td>
          </tr>
          <tr class="total"><td colspan="4">개인평가 점수 (가중치 적용)</td><td class="r">{{ n(v.weighted) }}</td></tr>
        </tbody>
      </table>

      <h2>4. 백분위 · KPI · 보정 · 직접 수정</h2>
      <table class="grid">
        <thead><tr><th>단계</th><th class="r">값</th><th>적용 기준</th></tr></thead>
        <tbody>
          <tr><td>백분위</td><td class="r">{{ n(v.percentile) }}</td><td>{{ v.percentileRule }}</td></tr>
          <tr><td>부서 KPI 적용 전 점수</td><td class="r">{{ n(v.kpiBefore) }}</td><td rowspan="3">{{ v.kpiRule }}</td></tr>
          <tr><td>부서 KPI 점수</td><td class="r">{{ v.kpiScore ?? '반영 안 함' }}</td></tr>
          <tr><td>부서 KPI 적용 후 점수</td><td class="r">{{ n(v.kpiAfter) }}</td></tr>
          <template v-if="'corrected' in v">
            <tr><td>부서별 보정값</td><td class="r">{{ signed(v.deptCorrection?.value) }}</td><td>{{ v.deptCorrection?.reason || '-' }}</td></tr>
            <tr><td>개인별 보정값</td><td class="r">{{ signed(v.personCorrection?.value) }}</td><td>{{ v.personCorrection?.reason ? `사유: ${v.personCorrection.reason}` : '-' }}</td></tr>
            <tr><td>보정 적용 후 점수</td><td class="r">{{ n(v.corrected) }}</td><td>보정 적용 규칙: {{ v.correctionRule }}</td></tr>
            <tr><td>최종 점수 직접 수정</td><td class="r">{{ v.override ? fmt(v.override.score) : '없음' }}</td><td>{{ v.override ? `수정 전 ${v.override.before === null ? '계산 보류' : fmt(v.override.before)} → 수정 후 ${fmt(v.override.score)} · 사유: ${v.override.reason} · ${v.override.by} · ${localDateTime(v.override.at)}` : '-' }}</td></tr>
          </template>
          <template v-else>
            <!-- 2차 작업 전에 확정된 결과(이전 방식 개인 조정) -->
            <tr><td>개인 조정 전 점수</td><td class="r">{{ n(v.adjBefore) }}</td><td rowspan="2">{{ adjText(v.adjustment) }}<template v-if="v.adjustment"> · 사유: {{ v.adjustment.reason }}</template></td></tr>
            <tr><td>개인 조정 후 점수</td><td class="r">{{ n(v.adjAfter) }}</td></tr>
          </template>
          <tr class="total"><td>최종 확정 점수 (등급 산출 기준)</td><td class="r">{{ n(v.final) }}</td><td></td></tr>
        </tbody>
      </table>

      <template v-if="v.history?.length">
        <h3>보정·점수 변경 이력 (확정 시점까지)</h3>
        <table class="grid small">
          <thead><tr><th>시각</th><th>유형</th><th class="r">변경 전 → 후 값</th><th>사유</th><th>변경자</th></tr></thead>
          <tbody>
            <tr v-for="h in v.history" :key="h.id">
              <td>{{ localDateTime(h.at) }}</td><td>{{ KIND[h.kind] }}</td>
              <td class="r">{{ histVal(h, h.beforeValue) }} → {{ histVal(h, h.afterValue) }}</td><td>{{ h.reason || '-' }}</td><td>{{ h.by }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <h2>5. 최종 등급</h2>
      <div class="grade-box">
        <div class="grade">{{ v.grade ?? '미확정' }}</div>
        <div class="small">등급 산정 기준: {{ v.gradeRule }}</div>
      </div>

      <p class="legend">
        원점수는 평가 항목 배점 기준 점수, 단계 점수는 이를 100점 기준으로 바꾼 값입니다. 개인평가 점수(가중치 적용)와 백분위는 서로 다른 값이며,
        KPI 반영 결과, 부서별·개인별 보정값, 최종 점수 직접 수정은 각각 따로 기록되어 서로 덮어쓰지 않습니다. 이 보고서는 최종 확정 당시 값으로 작성되었습니다.
      </p>
    </template>
    <p v-else>최종 확정된 결과가 없어 보고서를 만들 수 없습니다.</p>
  </article>
</template>
