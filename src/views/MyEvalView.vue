<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  db, currentUser, teamName, tasksFor, getEvaluation, evalStatus, stagesFor, evaluatorsFor, stageStatus, membersOf,
  sortUsers,
} from '../store'
import { t, dt, stageName, roleName, statusName } from '../i18n'

// 사원·팀장·임원 공통 '내 평가' 화면. 역할에 따라 보이는 영역이 다르다.
const router = useRouter()
const me = computed(() => currentUser())
const role = computed(() => me.value.role)

const myTasks = computed(() => tasksFor(me.value.id).map((t) => ({ ...t, status: evalStatus(getEvaluation(t.stage, t.target.id, me.value.id)) })))
const selfTask = computed(() => myTasks.value.find((t) => t.stage === 'self'))
const otherTasks = computed(() => myTasks.value.filter((t) => t.stage !== 'self'))
const taskGroups = computed(() => {
  const groups = []
  // id는 화면 언어와 상관없이 같은 값(한국어 제목)으로 둔다
  const add = (id, key, list) => { if (list.length) groups.push({ id, title: t(key), desc: t(`${key}.desc`), list: sortUsers(list.map((x) => x.target)).map((u) => list.find((x) => x.target.id === u.id)) }) }
  if (role.value === 'leader') {
    add('팀원 평가', 'grp.leader', otherTasks.value.filter((x) => x.stage === 'leader'))
    add('담당 임원 평가', 'grp.upward', otherTasks.value.filter((x) => x.stage === 'upward'))
  }
  if (role.value === 'member') add('팀장 평가', 'grp.members', otherTasks.value.filter((x) => x.stage === 'members'))
  if (role.value === 'exec') {
    add('배정된 사원 평가', 'grp.execMember', otherTasks.value.filter((x) => x.stage === 'exec' && x.target.role === 'member'))
    add('배정된 팀장 평가', 'grp.execLeader', otherTasks.value.filter((x) => x.stage === 'exec' && x.target.role === 'leader'))
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

const actionLabel = (status) => t(`act.${status}`)
const go = (t) => router.push(`/me/evaluate/${t.stage}/${t.target.id}`)
const statusCls = (s) => ({ todo: 'stage-self', progress: 'stage-exec', done: 'stage-done', unassigned: 'stage-warn', off: 'stage-self' }[s])
</script>

<template>
  <!-- 로그아웃 직후 화면이 바뀌기 전 한 번 더 그려질 때를 대비 -->
  <div v-if="me">
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('me.hello', { name: me.name }) }}</h1>
        <div class="text-muted small mt-1">{{ dt(teamName(me.teamId)) }} · {{ dt(me.position) }} · {{ t('me.screen', { role: roleName(role) }) }}</div>
      </div>
      <div class="period">
        <div class="small text-muted">{{ dt(db.period.name) }}</div>
        <div><strong>{{ t('me.deadline', { date: db.period.deadline }) }}</strong> <span class="small text-muted">({{ db.period.start }} ~ {{ db.period.end }})</span></div>
      </div>
    </div>

    <div class="row g-3 mb-3">
      <div class="col-lg-5">
        <div class="panel h-100" data-testid="self-card">
          <h2 class="panel-title mb-2">{{ stageName('self') }}</h2>
          <template v-if="selfTask">
            <p class="small text-muted">{{ t('me.selfDesc') }}</p>
            <div class="d-flex align-items-center gap-2">
              <span class="stage-badge" :class="statusCls(selfTask.status)">{{ statusName(selfTask.status) }}</span>
              <button class="btn btn-primary btn-sm ms-auto" @click="go(selfTask)">{{ selfTask.status === 'todo' ? t('me.selfWrite') : actionLabel(selfTask.status) }}</button>
            </div>
          </template>
          <p v-else-if="role === 'exec' && !db.settings.execSelfEnabled" class="text-muted mb-0">
            {{ t('me.execSelfOff') }}
          </p>
          <p v-else class="text-muted mb-0">{{ t('me.noSelf') }}</p>
        </div>
      </div>

      <div class="col-lg-7">
        <div class="panel h-100">
          <h2 class="panel-title mb-2">{{ t('me.received') }}</h2>
          <table v-if="myStages.length" class="table table-clean table-sm mb-2">
            <thead><tr><th>{{ t('me.colStage') }}</th><th>{{ t('me.colStatus') }}</th><th>{{ t('me.colSubmitted') }}</th></tr></thead>
            <tbody>
              <tr v-for="s in myStages" :key="s.stage">
                <td>{{ stageName(s.stage) }}</td>
                <td><span class="stage-badge" :class="statusCls(s.status)">{{ statusName(s.status) }}</span></td>
                <td>{{ s.total ? `${s.done} / ${s.total}` : '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-muted">{{ t('me.noReceived') }}</p>
          <p class="small text-muted mb-0">
            {{ t('me.scoreHidden') }}
            <template v-if="role === 'leader'">{{ t('me.membersAnon') }}</template>
          </p>
        </div>
      </div>
    </div>

    <section v-for="g in taskGroups" :key="g.id" class="panel mb-3" :data-group="g.id">
      <div class="panel-head">
        <h2 class="panel-title">{{ g.title }} <span class="panel-sub">{{ t('me.nSubmitted', { done: doneCount(g.list), total: g.list.length }) }}</span></h2>
        <span class="panel-sub">{{ g.desc }}</span>
      </div>
      <div class="table-responsive">
        <table class="table table-clean">
          <thead><tr><th>{{ t('col.name') }}</th><th>{{ t('col.team') }}</th><th>{{ t('col.position') }}</th><th>{{ t('me.colStatus') }}</th><th></th></tr></thead>
          <tbody>
            <tr v-for="task in g.list" :key="task.target.id">
              <td class="fw-semibold">{{ task.target.name }}</td>
              <td>{{ dt(teamName(task.target.teamId)) }}</td>
              <td>{{ dt(task.target.position) }}</td>
              <td><span class="stage-badge" :class="statusCls(task.status)">{{ statusName(task.status) }}</span></td>
              <td class="text-end"><button class="btn btn-sm" :class="task.status === 'done' ? 'btn-outline-secondary' : 'btn-primary'" @click="go(task)">{{ actionLabel(task.status) }}</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <div v-if="!taskGroups.length && role !== 'exec'" class="panel empty-hint">{{ t('me.noTasks') }}</div>
    <div v-if="!taskGroups.length && role === 'exec'" class="panel empty-hint">{{ t('me.execNoTasks') }}</div>

    <section v-if="role === 'leader'" class="panel mt-3">
      <h2 class="panel-title mb-2">{{ t('me.teamProgress') }}</h2>
      <div class="table-responsive">
        <table class="table table-clean table-sm">
          <thead><tr><th>{{ t('me.colMember') }}</th><th>{{ t('col.position') }}</th><th>{{ t('me.colMemberSelf') }}</th><th>{{ t('me.colMine') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in teamRows" :key="r.user.id">
              <td>{{ r.user.name }}</td><td>{{ dt(r.user.position) }}</td>
              <td><span class="stage-badge" :class="statusCls(r.self)">{{ statusName(r.self) }}</span></td>
              <td><span class="stage-badge" :class="statusCls(r.mine)">{{ statusName(r.mine) }}</span></td>
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
