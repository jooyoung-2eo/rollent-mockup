<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  store, EVAL_TYPES, itemsOfType, answerTypeLabel, teamName, userById, typeScore, currentStage, stageLabel,
  progressStatus, getAnswers, saveAnswers, isTypeComplete, toast, confirmDialog,
} from '../store'

const route = useRoute()
const group = ref('member') // leader | member
const teamFilter = ref('all')
const selectedId = ref(null)
const evalType = ref('exec')
const draft = ref({})

const rows = computed(() =>
  store.users
    .filter((u) => u.role === group.value && (teamFilter.value === 'all' || u.teamId === teamFilter.value))
    .map((u) => ({
      ...u,
      team: teamName(u.teamId),
      scores: EVAL_TYPES.map((t) => typeScore(u.id, t.key)),
      stage: currentStage(u.id),
      stageText: stageLabel(u.id),
      status: progressStatus(u.id),
    })),
)
const selected = computed(() => userById(selectedId.value))
const evalItems = computed(() => itemsOfType(evalType.value))
const readOnly = computed(() => evalType.value !== 'exec')
const dirty = computed(() => !readOnly.value && selected.value && JSON.stringify(draft.value) !== JSON.stringify(getAnswers(selected.value.id, evalType.value)))

// 입력 중인 점수를 100점 만점으로 미리 계산
const draftScore = computed(() => {
  const scored = evalItems.value.filter((it) => it.answerType === 'yn' || it.answerType === 'scale')
  const vals = scored.filter((it) => draft.value[it.id] !== undefined).map((it) =>
    it.answerType === 'yn' ? (draft.value[it.id] === 'Y' ? 100 : 0) : draft.value[it.id] * 20,
  )
  return { answered: vals.length, total: scored.length, score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null }
})

const statusClass = { '시작 전': 'text-bg-light border', '진행 중': 'text-bg-warning', 완료: 'text-bg-success' }

function loadDraft() {
  draft.value = selected.value ? getAnswers(selected.value.id, evalType.value) : {}
}
watch([selectedId, evalType], loadDraft)

async function select(userId, type) {
  if (dirty.value && (userId !== selectedId.value || type !== evalType.value)) {
    const ok = await confirmDialog({ title: '저장하지 않은 변경', message: '입력한 점수가 저장되지 않았습니다. 이동하시겠습니까?', okText: '이동' })
    if (!ok) return
  }
  selectedId.value = userId
  if (type) evalType.value = type
}

function startEval(u) {
  select(u.id, 'exec')
}

function save() {
  saveAnswers(selected.value.id, evalType.value, draft.value)
  const done = isTypeComplete(selected.value.id, evalType.value)
  const label = EVAL_TYPES.find((t) => t.key === evalType.value).label
  toast(done ? `${selected.value.name}님의 ${label}를 저장했습니다.` : `${label}를 임시 저장했습니다. 남은 항목을 입력하면 완료됩니다.`)
}

// 홈 화면 등에서 ?user=id 로 들어오면 해당 대상자를 바로 선택
const initial = userById(Number(route.query.user))
if (initial) {
  group.value = initial.role
  selectedId.value = initial.id
  const stage = currentStage(initial.id)
  evalType.value = stage === 'self' || stage === 'leader' ? stage : 'exec'
  loadDraft()
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">관리자 평가</h1>
      <div class="d-flex gap-2 align-items-center small flex-wrap">
        <span class="stage-badge stage-self">자기평가</span>→
        <span class="stage-badge stage-leader">팀장평가</span>→
        <span class="stage-badge stage-exec">평가하기</span>→
        <span class="stage-badge stage-done">평가완료</span>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-xl-7">
        <div class="panel">
          <div class="panel-head">
            <div class="btn-group btn-group-sm" role="group" aria-label="평가 그룹">
              <button class="btn" :class="group === 'leader' ? 'btn-primary' : 'btn-outline-primary'" @click="group = 'leader'">팀장 평가</button>
              <button class="btn" :class="group === 'member' ? 'btn-primary' : 'btn-outline-primary'" @click="group = 'member'">사원 평가</button>
            </div>
            <select v-model="teamFilter" class="form-select form-select-sm w-auto" aria-label="팀 선택">
              <option value="all">전체 팀</option>
              <option v-for="t in store.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <h2 class="panel-title mb-2">평가 원점수</h2>
          <div class="table-responsive">
            <table class="table table-clean table-hover">
              <thead>
                <tr><th>이름</th><th>소속</th><th v-for="t in EVAL_TYPES" :key="t.key" class="text-center">{{ t.label }}</th><th>상태</th><th>진행 현황</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in rows" :key="r.id" class="clickable" :class="{ active: r.id === selectedId }" @click="select(r.id)">
                  <td class="fw-semibold">{{ r.name }}</td>
                  <td>{{ r.team }}</td>
                  <td v-for="(s, i) in r.scores" :key="i" class="text-center">{{ s ?? '-' }}</td>
                  <td><span class="badge" :class="statusClass[r.status]">{{ r.status }}</span></td>
                  <td>
                    <button v-if="r.stage === 'exec'" class="stage-badge stage-exec" @click.stop="startEval(r)">평가하기</button>
                    <span v-else class="stage-badge" :class="'stage-' + r.stage">{{ r.stageText }}</span>
                  </td>
                </tr>
                <tr v-if="!rows.length"><td colspan="7" class="text-muted">해당하는 평가 대상자가 없습니다.</td></tr>
              </tbody>
            </table>
          </div>
          <p class="panel-sub mt-2 mb-0">점수는 100점 만점 기준입니다. '평가하기'는 자기평가와 팀장평가가 끝난 대상자에게 표시됩니다.</p>
        </div>
      </div>

      <div class="col-xl-5">
        <div class="panel eval-panel">
          <template v-if="selected">
            <div class="panel-head">
              <div>
                <h2 class="panel-title">{{ selected.name }}</h2>
                <div class="panel-sub">{{ teamName(selected.teamId) }} · {{ selected.role === 'leader' ? '팀장' : '사원' }} · 사번 {{ selected.empNo }}</div>
              </div>
              <span class="badge" :class="statusClass[progressStatus(selected.id)]">{{ progressStatus(selected.id) }}</span>
            </div>

            <div class="btn-group w-100 mb-3" role="group" aria-label="평가 유형">
              <button
                v-for="t in EVAL_TYPES" :key="t.key" class="btn btn-sm"
                :class="evalType === t.key ? 'btn-primary' : 'btn-outline-primary'" @click="select(selected.id, t.key)"
              >
                {{ t.label }} <span v-if="isTypeComplete(selected.id, t.key)">✓</span>
              </button>
            </div>

            <div v-if="!evalItems.length" class="empty-hint">이 평가 유형에 등록된 항목이 없습니다. 평가항목 화면에서 추가하세요.</div>
            <div v-for="(it, idx) in evalItems" :key="it.id" class="eval-item">
              <div class="d-flex justify-content-between gap-2">
                <div class="fw-semibold">{{ idx + 1 }}. {{ it.name }}</div>
                <span class="badge text-bg-light border align-self-start">{{ answerTypeLabel(it.answerType) }}</span>
              </div>
              <div class="small text-muted mb-2">{{ it.content }}</div>

              <!-- 자기평가·팀장평가는 응답을 보기만 한다 -->
              <div v-if="readOnly" class="answer-view">
                <template v-if="draft[it.id] === undefined || draft[it.id] === ''"><span class="text-muted">미응답</span></template>
                <template v-else-if="it.answerType === 'scale'"><strong>{{ draft[it.id] }}</strong> / 5점</template>
                <template v-else-if="it.answerType === 'yn'"><strong>{{ draft[it.id] === 'Y' ? '예' : '아니오' }}</strong></template>
                <template v-else>{{ draft[it.id] }}</template>
              </div>
              <div v-else-if="it.answerType === 'scale'" class="btn-group btn-group-sm" role="group">
                <template v-for="n in 5" :key="n">
                  <input :id="`s-${it.id}-${n}`" v-model.number="draft[it.id]" type="radio" class="btn-check" :value="n" />
                  <label class="btn btn-outline-primary score-btn" :for="`s-${it.id}-${n}`">{{ n }}</label>
                </template>
              </div>
              <div v-else-if="it.answerType === 'yn'" class="btn-group btn-group-sm" role="group">
                <template v-for="v in ['Y', 'N']" :key="v">
                  <input :id="`s-${it.id}-${v}`" v-model="draft[it.id]" type="radio" class="btn-check" :value="v" />
                  <label class="btn btn-outline-primary score-btn" :for="`s-${it.id}-${v}`">{{ v === 'Y' ? '예' : '아니오' }}</label>
                </template>
              </div>
              <input v-else-if="it.answerType === 'short'" v-model="draft[it.id]" class="form-control form-control-sm" placeholder="답변을 입력하세요" />
              <textarea v-else v-model="draft[it.id]" class="form-control form-control-sm" rows="2" placeholder="의견을 입력하세요"></textarea>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
              <div>
                {{ readOnly ? '점수' : '현재 점수' }} <strong>{{ draftScore.score ?? '-' }}</strong>
                <span class="panel-sub">(점수 항목 {{ draftScore.answered }}/{{ draftScore.total }} 응답)</span>
              </div>
              <div v-if="!readOnly" class="d-flex gap-2">
                <button class="btn btn-light btn-sm" :disabled="!dirty" @click="loadDraft">취소</button>
                <button class="btn btn-primary btn-sm" :disabled="!evalItems.length" @click="save">저장</button>
              </div>
            </div>
            <p class="panel-sub mt-2 mb-0">
              {{ readOnly ? '자기평가와 팀장평가는 결과 확인만 할 수 있습니다.' : '관리자는 임원평가 점수만 입력할 수 있습니다. 목업이라 서버에는 저장되지 않습니다.' }}
            </p>
          </template>
          <div v-else class="empty-hint">왼쪽 표에서 평가 대상자를 선택하세요.</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.eval-panel { position: sticky; top: 20px; }
.eval-item { padding: 12px 0; border-top: 1px solid var(--card-border); }
.score-btn { min-width: 44px; }
.answer-view { padding: 6px 10px; background: #f6f7fa; border-radius: 6px; font-size: 0.92rem; }
</style>
