<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  db, teamName, allAssignments, getEvaluation, evalStatus, stagesFor, evaluatorsFor, stageStatus, targetStatus,
  reopenEvaluation, toast, confirmDialog, sortUsers, isEvalTarget, EVAL_STATUS_LABEL, resetData,
} from '../store'
import { stageLabel, roleLabel, localDateTime } from '../constants'
import DeptProgress from '../components/DeptProgress.vue'
import AppModal from '../components/AppModal.vue'
import AnswerSheet from '../components/AnswerSheet.vue'
import InlineText from '../components/InlineText.vue'

const router = useRouter()

// 실제 배정과 응답 저장 상태로 계산한다
const assignments = computed(() => allAssignments().map((a) => ({ ...a, status: evalStatus(getEvaluation(a.stage, a.target.id, a.evaluator.id)) })))
const targets = computed(() => sortUsers(db.users.filter((u) => isEvalTarget(u) && stagesFor(u).length)))
const unassignedStages = computed(() => targets.value.flatMap((t) => stagesFor(t).filter((s) => !evaluatorsFor(t, s).length).map((s) => ({ t, s }))))

const stats = computed(() => {
  const total = assignments.value.length
  const done = assignments.value.filter((a) => a.status === 'done').length
  const st = targets.value.map(targetStatus)
  return {
    targets: targets.value.length,
    complete: st.filter((s) => s === '완료' || s === '최종 확정').length,
    finalized: st.filter((s) => s === '최종 확정').length,
    pending: total - done + unassignedStages.value.length, // 미완료 평가 건 + 평가자 미배정 건
    rate: total ? Math.round((done / total) * 100) : 0,
    total, done,
  }
})

// 대상자별 표
const q = ref('')
const teamF = ref('all')
const statusF = ref('all')
const STATUS_LIST = ['시작 전', '진행 중', '완료', '최종 확정']
const targetRows = computed(() => targets.value
  .filter((u) => (teamF.value === 'all' || u.teamId === teamF.value) && (!q.value.trim() || u.name.includes(q.value.trim())))
  .map((u) => ({
    user: u,
    status: targetStatus(u),
    self: stageStatus(u, 'self'),
    second: u.role === 'member' ? stageStatus(u, 'leader') : u.role === 'leader' ? stageStatus(u, 'members') : 'off',
    secondCount: u.role === 'leader' && stagesFor(u).includes('members') ? `${evaluatorsFor(u, 'members').filter((e) => evalStatus(getEvaluation('members', u.id, e.id)) === 'done').length}/${evaluatorsFor(u, 'members').length}` : '',
    exec: stageStatus(u, 'exec'),
  }))
  .filter((r) => statusF.value === 'all' || r.status === statusF.value))

// 평가자별 표
const evaluatorRows = computed(() => {
  const map = new Map()
  assignments.value.filter((a) => a.stage !== 'self').forEach((a) => {
    if (!map.has(a.evaluator.id)) map.set(a.evaluator.id, { user: a.evaluator, list: [] })
    map.get(a.evaluator.id).list.push(a)
  })
  return sortUsers([...map.values()].map((r) => r.user)).map((u) => {
    const r = map.get(u.id)
    return { ...r, done: r.list.filter((a) => a.status === 'done').length, pending: r.list.filter((a) => a.status !== 'done') }
  }).filter((r) => teamF.value === 'all' || r.user.teamId === teamF.value)
})
const onlyPending = ref(false)
const evaluatorFiltered = computed(() => evaluatorRows.value.filter((r) => !onlyPending.value || r.pending.length))

// 상세
const detail = ref(null) // user
const viewing = ref(null) // { stage, ev }
const detailStages = computed(() => detail.value ? stagesFor(detail.value).map((s) => ({
  stage: s,
  status: stageStatus(detail.value, s),
  rows: evaluatorsFor(detail.value, s).map((e) => ({ evaluator: e, ev: getEvaluation(s, detail.value.id, e.id) })),
  // 배정이 바뀌기 전 평가자의 응답(보존된 기록)
  past: Object.values(db.evaluations).filter((ev) => ev.stage === s && ev.targetId === detail.value.id && !evaluatorsFor(detail.value, s).some((e) => e.id === ev.evaluatorId)),
})) : [])

async function reopen(ev) {
  const ok = await confirmDialog({ title: '재작성 허용', message: '제출된 평가를 다시 작성할 수 있게 엽니다. 평가자가 다시 제출할 때까지 이 단계는 미완료가 됩니다.', okText: '재작성 허용' })
  if (!ok) return
  reopenEvaluation(ev.key)
  toast('재작성을 허용했습니다.')
}
async function onReset() {
  const ok = await confirmDialog({ title: '테스트 데이터로 되돌리기', message: '이 브라우저에 저장된 모든 변경(직원, 문항, 응답, 설정, 조정 이력)을 지우고 처음 테스트 데이터로 되돌립니다.\n되돌릴 수 없습니다.', okText: '되돌리기', danger: true })
  if (!ok) return
  resetData()
  toast('처음 테스트 데이터로 되돌렸습니다.')
}
const cls = (s) => ({ todo: 'stage-self', progress: 'stage-exec', done: 'stage-done', unassigned: 'stage-warn', off: 'stage-off' }[s])
const statusCls = (s) => ({ '시작 전': 'text-bg-light border', '진행 중': 'text-bg-warning', 완료: 'text-bg-success', '최종 확정': 'text-bg-primary' }[s])
const time = localDateTime
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">진행현황</h1>
      <button class="btn btn-outline-secondary btn-sm" @click="onReset">테스트 데이터로 되돌리기</button>
    </div>

    <section class="panel mb-3 period">
      <div><span class="label">평가 회차</span><InlineText v-model="db.period.name" label="평가 회차" /></div>
      <div><span class="label">평가 기간</span><InlineText v-model="db.period.start" label="시작일" /> ~ <InlineText v-model="db.period.end" label="종료일" /></div>
      <div><span class="label">마감일</span><InlineText v-model="db.period.deadline" label="마감일" /></div>
    </section>

    <div class="row g-3 mb-3">
      <div class="col-6 col-lg"><div class="panel stat"><div class="stat-label">평가 대상자</div><div class="stat-value" data-stat="targets">{{ stats.targets }}명</div></div></div>
      <div class="col-6 col-lg"><div class="panel stat"><div class="stat-label">평가 완료 대상자</div><div class="stat-value" data-stat="complete">{{ stats.complete }}명</div></div></div>
      <div class="col-6 col-lg"><div class="panel stat"><div class="stat-label">최종 확정</div><div class="stat-value">{{ stats.finalized }}명</div></div></div>
      <div class="col-6 col-lg"><div class="panel stat"><div class="stat-label">필수 미완료 평가</div><div class="stat-value" data-stat="pending">{{ stats.pending }}건</div></div></div>
      <div class="col-12 col-lg"><div class="panel stat"><div class="stat-label">평가 완료율</div><div class="stat-value" data-stat="rate">{{ stats.rate }}%</div><div class="small text-muted">{{ stats.done }} / {{ stats.total }}건 제출</div></div></div>
    </div>

    <div v-if="unassignedStages.length" class="alert alert-warning small py-2">
      평가자가 배정되지 않은 평가 {{ unassignedStages.length }}건이 있습니다(필수 미완료에 포함).
      <button class="btn btn-link btn-sm p-0 align-baseline" @click="router.push('/eval-settings')">평가 관리에서 배정하기</button>
    </div>

    <section class="panel mb-3">
      <div class="panel-head"><h2 class="panel-title">부서별 진행 상황</h2><span class="panel-sub">막대에 마우스를 올리면 인원을 자세히 볼 수 있습니다</span></div>
      <DeptProgress />
    </section>

    <div class="filters mb-2">
      <input v-model="q" class="form-control form-control-sm" placeholder="이름 검색" aria-label="이름 검색" />
      <select v-model="teamF" class="form-select form-select-sm" aria-label="부서 필터">
        <option value="all">전체 부서</option>
        <option v-for="t in db.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select v-model="statusF" class="form-select form-select-sm" aria-label="상태 필터">
        <option value="all">전체 상태</option>
        <option v-for="s in STATUS_LIST" :key="s" :value="s">{{ s }}</option>
      </select>
    </div>

    <section class="panel mb-3">
      <div class="panel-head"><h2 class="panel-title">평가 대상자별 진행 상태 <span class="panel-sub">{{ targetRows.length }}명</span></h2><span class="panel-sub">이름을 누르면 단계별 상세를 봅니다.</span></div>
      <div class="table-responsive scroll">
        <table class="table table-clean table-sm" data-testid="target-table">
          <thead><tr><th>부서</th><th>직급</th><th>이름</th><th>자기평가</th><th>팀장·팀원평가</th><th>임원평가</th><th>전체 상태</th></tr></thead>
          <tbody>
            <tr v-for="r in targetRows" :key="r.user.id" :data-user="r.user.name">
              <td>{{ teamName(r.user.teamId) }}</td>
              <td>{{ r.user.position }}<span v-if="r.user.position !== roleLabel(r.user.role)" class="small text-muted"> ({{ roleLabel(r.user.role) }})</span></td>
              <td><button class="edit-link" @click="detail = r.user">{{ r.user.name }}</button></td>
              <td><span class="stage-badge" :class="cls(r.self)">{{ EVAL_STATUS_LABEL[r.self] }}</span></td>
              <td><span class="stage-badge" :class="cls(r.second)">{{ EVAL_STATUS_LABEL[r.second] }}</span> <span class="small text-muted">{{ r.secondCount }}</span></td>
              <td><span class="stage-badge" :class="cls(r.exec)">{{ EVAL_STATUS_LABEL[r.exec] }}</span></td>
              <td><span class="badge" :class="statusCls(r.status)">{{ r.status }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2 class="panel-title">평가자별 진행 상태</h2>
        <label class="form-check-label small"><input v-model="onlyPending" type="checkbox" class="form-check-input me-1" />미완료가 있는 평가자만</label>
      </div>
      <div class="table-responsive scroll">
        <table class="table table-clean table-sm" data-testid="evaluator-table">
          <thead><tr><th>부서</th><th>역할</th><th>평가자</th><th>완료</th><th>미완료 대상</th></tr></thead>
          <tbody>
            <tr v-for="r in evaluatorFiltered" :key="r.user.id" :data-user="r.user.name">
              <td>{{ teamName(r.user.teamId) }}</td>
              <td>{{ roleLabel(r.user.role) }}</td>
              <td class="fw-semibold">{{ r.user.name }}</td>
              <td>{{ r.done }} / {{ r.list.length }}건</td>
              <td class="small">
                <span v-if="!r.pending.length" class="text-success">모두 완료</span>
                <span v-for="a in r.pending" :key="a.stage + a.target.id" class="me-2">{{ a.target.name }}<span class="text-muted">({{ stageLabel(a.stage) }}·{{ EVAL_STATUS_LABEL[a.status] }})</span></span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="panel-sub mt-2 mb-0">자기평가는 대상자 표에서 확인합니다. 꺼진 단계(예: 임원 자기평가 사용 안 함)는 미완료로 세지 않습니다.</p>
    </section>

    <AppModal v-if="detail" :title="`${detail.name} 평가 진행 상세`" size="lg" @close="detail = null; viewing = null">
      <p class="small text-muted">{{ teamName(detail.teamId) }} · {{ detail.position }} · {{ roleLabel(detail.role) }} · 전체 상태: {{ targetStatus(detail) }}</p>
      <div v-for="s in detailStages" :key="s.stage" class="mb-3">
        <h6 class="fw-bold">{{ stageLabel(s.stage) }} <span class="stage-badge ms-1" :class="cls(s.status)">{{ EVAL_STATUS_LABEL[s.status] }}</span></h6>
        <table v-if="s.rows.length" class="table table-sm table-clean small mb-1">
          <thead><tr><th>평가자</th><th>상태</th><th>마지막 저장</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in s.rows" :key="r.evaluator.id">
              <td>{{ r.evaluator.name }} <span class="text-muted">({{ roleLabel(r.evaluator.role) }})</span></td>
              <td>{{ EVAL_STATUS_LABEL[evalStatus(r.ev)] }}</td>
              <td>{{ time(r.ev?.updatedAt) }}</td>
              <td class="text-end text-nowrap">
                <button v-if="r.ev" class="btn btn-link btn-sm p-0 me-2" @click="viewing = { stage: s.stage, ev: r.ev, who: r.evaluator.name }">응답 보기</button>
                <button v-if="r.ev?.status === 'submitted'" class="btn btn-link btn-sm p-0" @click="reopen(r.ev)">재작성 허용</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="small text-danger">평가자가 배정되지 않았습니다.</div>
        <div v-if="s.past.length" class="small text-muted">배정 변경 전 평가자의 응답 {{ s.past.length }}건이 기록으로 보존되어 있습니다(결과 계산에는 현재 배정만 사용).</div>
      </div>
      <div v-if="viewing" class="border-top pt-3">
        <h6 class="fw-bold">{{ viewing.who }}님의 {{ stageLabel(viewing.stage) }} 응답 <button class="btn btn-link btn-sm" @click="viewing = null">닫기</button></h6>
        <AnswerSheet :stage="viewing.stage" :answers="viewing.ev.answers" readonly />
      </div>
    </AppModal>
  </div>
</template>

<style scoped>
.period { display: flex; flex-wrap: wrap; gap: 8px 32px; padding: 12px 20px; }
.period .label { color: var(--text-muted); font-size: 0.85rem; margin-right: 8px; }
.stat { padding: 14px 18px; height: 100%; }
.stat-label { color: var(--text-muted); font-size: 0.85rem; }
.stat-value { font-size: 1.5rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; max-width: 640px; }
.scroll { max-height: 460px; overflow-y: auto; }
.scroll td:not(:last-child), .scroll th { white-space: nowrap; }
</style>
