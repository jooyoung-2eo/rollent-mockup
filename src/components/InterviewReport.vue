<script setup>
import { computed } from 'vue'
import { db } from '../store'
import { stageLabel, roleLabel, localDate } from '../constants'
import { questionScores, shareableTexts, itemExtremes, leaderNameOf, valueText, teamName, fmt } from '../reports'

// 팀장 면담용 보고서. 근거가 있는 값만 넣고, 평가자 이름과 공개 설정되지 않은 서술형 응답은 넣지 않는다.
const props = defineProps({ row: { type: Object, required: true } })
const user = computed(() => props.row.user)
const notes = computed(() => db.interviewNotes[user.value.id] ?? {})
const ext = computed(() => itemExtremes(props.row))
const texts = computed(() => shareableTexts(user.value))
const printedAt = localDate(new Date())
const ratio = (x) => `${fmt(x.score)} / ${x.points}점`
</script>

<template>
  <article class="report" :data-report-user="user.name">
    <header class="r-head">
      <div>
        <div class="r-kicker">Rollent · {{ db.period.name }}</div>
        <h1>팀장 면담용 보고서</h1>
      </div>
      <div class="r-meta">출력일 {{ printedAt }}<br />평가 상태 {{ row.status }}</div>
    </header>

    <h2>1. 기본 정보</h2>
    <table class="kv">
      <tr><th>이름</th><td>{{ user.name }}</td><th>소속팀</th><td>{{ teamName(user.teamId) }}</td></tr>
      <tr><th>직급</th><td>{{ user.position }} ({{ roleLabel(user.role) }})</td><th>평가 기간</th><td>{{ db.period.start }} ~ {{ db.period.end }}</td></tr>
      <tr><th>면담 팀장</th><td colspan="3">{{ leaderNameOf(user) }}</td></tr>
    </table>

    <h2>2. 평가 결과</h2>
    <table class="grid">
      <thead><tr><th>평가 단계</th><th>상태</th><th class="r">단계 점수 (100점 기준)</th></tr></thead>
      <tbody>
        <tr v-for="s in row.stages" :key="s.stage">
          <td>{{ stageLabel(s.stage) }}</td><td>{{ { todo: '시작 전', progress: '진행 중', done: '완료', unassigned: '배정 필요' }[s.status] }}</td><td class="r">{{ valueText(s.score100) }}</td>
        </tr>
      </tbody>
    </table>
    <h3>항목별 점수</h3>
    <table class="grid">
      <thead><tr><th>평가 단계</th><th>평가 항목</th><th class="r">배점</th><th class="r">획득 점수</th></tr></thead>
      <tbody>
        <template v-for="s in row.stages" :key="'i' + s.stage">
          <tr v-for="(i, idx) in s.items" :key="s.stage + i.item.id">
            <td v-if="idx === 0" :rowspan="s.items.length">{{ stageLabel(s.stage) }}</td>
            <td>{{ i.item.name }}</td><td class="r">{{ i.item.points }}</td><td class="r">{{ valueText(i.score) }}</td>
          </tr>
        </template>
      </tbody>
    </table>
    <h3>문항별 응답 점수 (평균)</h3>
    <table class="grid small">
      <thead><tr><th>단계</th><th>문항</th><th class="r">점수 / 최고</th></tr></thead>
      <tbody>
        <template v-for="s in row.stages.filter((x) => x.status === 'done')" :key="'q' + s.stage">
          <tr v-for="(q, qi) in questionScores(user, s.stage)" :key="s.stage + qi">
            <td>{{ stageLabel(s.stage) }}</td><td>{{ q.text }}</td><td class="r">{{ q.score === null ? '-' : fmt(q.score) }} / {{ q.max ?? '-' }}</td>
          </tr>
        </template>
      </tbody>
    </table>

    <h2>3. 면담 참고 정보</h2>
    <table class="kv">
      <tr>
        <th>점수가 가장 높은 항목</th>
        <td>{{ ext.high.length ? ext.high.map((x) => `${x.name} ${ratio(x)}`).join(', ') : '근거 부족 (완료된 항목 점수가 2개 미만이거나 차이 없음)' }}</td>
      </tr>
      <tr>
        <th>점수가 가장 낮은 항목</th>
        <td>{{ ext.low.length ? ext.low.map((x) => `${x.name} ${ratio(x)}`).join(', ') : '근거 부족' }}</td>
      </tr>
      <tr><th>강점 (관리자 작성)</th><td class="pre">{{ notes.strengths || '작성된 내용 없음' }}</td></tr>
      <tr><th>개선이 필요한 부분 (관리자 작성)</th><td class="pre">{{ notes.improvements || '작성된 내용 없음' }}</td></tr>
      <tr><th>면담 시 확인할 사항</th><td class="pre">{{ notes.checkpoints || '작성된 내용 없음' }}</td></tr>
    </table>
    <h3>면담에 활용할 서술형 응답</h3>
    <ul v-if="texts.length" class="texts">
      <li v-for="(t, i) in texts" :key="i"><span class="muted">[{{ t.stage }}] {{ t.question }}</span><br />{{ t.text }}</li>
    </ul>
    <p v-else class="muted">면담 보고서 포함으로 설정된 서술형 응답이 없습니다.</p>
    <p class="legend">포함하지 않은 정보: 평가자 이름, '면담 보고서에 포함'이 꺼진 문항의 서술형·주관식 응답. 공개 범위 정책이 정해지면 문항 설정에서 바꿀 수 있습니다.</p>

    <h2>4. 면담 기록</h2>
    <table class="kv record">
      <tr><th>면담 일자</th><td class="line"></td><th>면담자</th><td class="line"></td></tr>
    </table>
    <div class="box"><div class="box-title">주요 논의 내용</div></div>
    <div class="box"><div class="box-title">향후 개선 목표 및 계획</div></div>
    <div class="box small-box"><div class="box-title">후속 조치</div></div>
  </article>
</template>
