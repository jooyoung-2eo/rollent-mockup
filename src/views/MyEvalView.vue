<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  db, currentUser, teamName, tasksFor, getEvaluation, evalStatus, stagesFor, evaluatorsFor, stageStatus, membersOf,
  EVAL_STATUS_LABEL, sortUsers,
} from '../store'
import { stageLabel, roleLabel } from '../constants'

// 사원·팀장·임원 공통 '내 평가' 화면. 역할에 따라 보이는 영역이 다르다.
const router = useRouter()
const me = computed(() => currentUser())
const role = computed(() => me.value.role)

const myTasks = computed(() => tasksFor(me.value.id).map((t) => ({ ...t, status: evalStatus(getEvaluation(t.stage, t.target.id, me.value.id)) })))
const selfTask = computed(() => myTasks.value.find((t) => t.stage === 'self'))
const otherTasks = computed(() => myTasks.value.filter((t) => t.stage !== 'self'))
const taskGroups = computed(() => {
  const groups = []
  const add = (title, desc, list) => { if (list.length) groups.push({ title, desc, list: sortUsers(list.map((t) => t.target)).map((u) => list.find((t) => t.target.id === u.id)) }) }
  if (role.value === 'leader') add('팀원 평가', '소속 팀원의 업무 수행을 평가합니다(팀장평가).', otherTasks.value.filter((t) => t.stage === 'leader'))
  if (role.value === 'member') add('팀장 평가', '소속 팀장의 업무 수행을 평가합니다(팀원평가).', otherTasks.value.filter((t) => t.stage === 'members'))
  if (role.value === 'exec') {
    add('배정된 사원 평가', '나에게 배정된 사원을 평가합니다(필수).', otherTasks.value.filter((t) => t.stage === 'exec' && t.target.role === 'member'))
    add('배정된 팀장 평가', '나에게 배정된 팀장을 평가합니다(필수).', otherTasks.value.filter((t) => t.stage === 'exec' && t.target.role === 'leader'))
  }
  return groups
})
const doneCount = (list) => list.filter((t) => t.status === 'done').length

// 내가 받는 평가의 진행 상황 (평가자 이름은 보여주지 않는다)
const myStages = computed(() => stagesFor(me.value).map((s) => {
  const evaluators = evaluatorsFor(me.value, s)
  const done = evaluators.filter((e) => evalStatus(getEvaluation(s, me.value.id, e.id)) === 'done').length
  return { stage: s, status: stageStatus(me.value, s), done, total: evaluators.length }
}))

// 팀장: 팀원별 진행 상황
const teamRows = computed(() => (role.value === 'leader' ? membersOf(me.value.teamId).map((m) => ({
  user: m,
  self: stageStatus(m, 'self'),
  mine: evalStatus(getEvaluation('leader', m.id, me.value.id)),
})) : []))

const actionLabel = (status) => ({ todo: '평가하기', progress: '이어서 작성', done: '제출 내용 보기' }[status])
const go = (t) => router.push(`/me/evaluate/${t.stage}/${t.target.id}`)
const statusCls = (s) => ({ todo: 'stage-self', progress: 'stage-exec', done: 'stage-done', unassigned: 'stage-warn', off: 'stage-self' }[s])
</script>

<template>
  <!-- 로그아웃 직후 화면이 바뀌기 전 한 번 더 그려질 때를 대비 -->
  <div v-if="me">
    <div class="page-header">
      <div>
        <h1 class="page-title">안녕하세요, {{ me.name }}님</h1>
        <div class="text-muted small mt-1">{{ teamName(me.teamId) }} · {{ me.position }} · {{ roleLabel(role) }} 화면</div>
      </div>
      <div class="period">
        <div class="small text-muted">{{ db.period.name }}</div>
        <div><strong>마감 {{ db.period.deadline }}</strong> <span class="small text-muted">({{ db.period.start }} ~ {{ db.period.end }})</span></div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-5">
        <div class="panel h-100" data-testid="self-card">
          <h2 class="panel-title mb-2">자기평가</h2>
          <template v-if="selfTask">
            <p class="small text-muted">나의 업무 성과와 역량을 스스로 평가합니다.</p>
            <div class="d-flex align-items-center gap-2">
              <span class="stage-badge" :class="statusCls(selfTask.status)">{{ EVAL_STATUS_LABEL[selfTask.status] }}</span>
              <button class="btn btn-primary btn-sm ms-auto" @click="go(selfTask)">{{ selfTask.status === 'done' ? '제출 내용 보기' : selfTask.status === 'progress' ? '이어서 작성' : '자기평가 작성' }}</button>
            </div>
          </template>
          <p v-else-if="role === 'exec' && !db.settings.execSelfEnabled" class="text-muted mb-0">
            임원 자기평가를 진행하지 않도록 설정되어 있습니다. 배정된 사원·팀장 평가는 그대로 진행해 주세요.
          </p>
          <p v-else class="text-muted mb-0">자기평가 대상이 아닙니다.</p>
        </div>
      </div>

      <div class="col-lg-7">
        <div class="panel h-100">
          <h2 class="panel-title mb-2">내가 받는 평가 진행 상태</h2>
          <table v-if="myStages.length" class="table table-clean table-sm mb-2">
            <thead><tr><th>평가 단계</th><th>상태</th><th>제출</th></tr></thead>
            <tbody>
              <tr v-for="s in myStages" :key="s.stage">
                <td>{{ stageLabel(s.stage) }}</td>
                <td><span class="stage-badge" :class="statusCls(s.status)">{{ EVAL_STATUS_LABEL[s.status] }}</span></td>
                <td>{{ s.total ? `${s.done} / ${s.total}` : '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-muted">받는 평가가 없습니다.</p>
          <p class="small text-muted mb-0">
            평가 점수와 등급은 공개 정책이 정해지지 않아 이 화면에 표시하지 않습니다.
            <template v-if="role === 'leader'">팀원평가는 제출 수만 보이며 누가 평가했는지는 표시하지 않습니다.</template>
          </p>
        </div>
      </div>
    </div>

    <section v-for="g in taskGroups" :key="g.title" class="panel mb-3" :data-group="g.title">
      <div class="panel-head">
        <h2 class="panel-title">{{ g.title }} <span class="panel-sub">{{ doneCount(g.list) }} / {{ g.list.length }} 제출</span></h2>
        <span class="panel-sub">{{ g.desc }}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-clean">
          <thead><tr><th>이름</th><th>소속</th><th>직급</th><th>상태</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in g.list" :key="t.target.id">
              <td class="fw-semibold">{{ t.target.name }}</td>
              <td>{{ teamName(t.target.teamId) }}</td>
              <td>{{ t.target.position }}</td>
              <td><span class="stage-badge" :class="statusCls(t.status)">{{ EVAL_STATUS_LABEL[t.status] }}</span></td>
              <td class="text-end"><button class="btn btn-sm" :class="t.status === 'done' ? 'btn-outline-secondary' : 'btn-primary'" @click="go(t)">{{ actionLabel(t.status) }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div v-if="!taskGroups.length && role !== 'exec'" class="panel empty-hint">자기평가 외에 나에게 배정된 평가가 없습니다.</div>
    <div v-if="!taskGroups.length && role === 'exec'" class="panel empty-hint">아직 나에게 배정된 평가 대상자가 없습니다. 관리자가 배정하면 여기에 표시됩니다.</div>

    <section v-if="role === 'leader'" class="panel mt-3">
      <h2 class="panel-title mb-2">팀원별 평가 진행 상황</h2>
      <div class="table-responsive">
        <table class="table table-clean table-sm">
          <thead><tr><th>팀원</th><th>직급</th><th>팀원 자기평가</th><th>내가 하는 팀원 평가</th></tr></thead>
          <tbody>
            <tr v-for="r in teamRows" :key="r.user.id">
              <td>{{ r.user.name }}</td><td>{{ r.user.position }}</td>
              <td><span class="stage-badge" :class="statusCls(r.self)">{{ EVAL_STATUS_LABEL[r.self] }}</span></td>
              <td><span class="stage-badge" :class="statusCls(r.mine)">{{ EVAL_STATUS_LABEL[r.mine] }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.period { text-align: right; }
</style>
