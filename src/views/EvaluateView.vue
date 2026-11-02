<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  db, currentUser, userById, teamName, getEvaluation, saveEvaluation, validateAnswers, canEvaluate, toast, confirmDialog,
} from '../store'
import { stageLabel, roleLabel, STAGES, localDate } from '../constants'
import AnswerSheet from '../components/AnswerSheet.vue'

// 배정된 평가 하나를 작성한다. 라우터에서 권한을 확인하지만 화면에서도 다시 확인한다.
const route = useRoute()
const router = useRouter()
const me = currentUser()
const stage = route.params.stage
const target = userById(Number(route.params.targetId))
const allowed = !!(me && target && canEvaluate(me.id, stage, target.id))

const existing = allowed ? getEvaluation(stage, target.id, me.id) : null
const answers = ref(existing ? { ...existing.answers } : {})
const saved = ref(JSON.stringify(answers.value))
const problems = ref([])
const submitted = computed(() => getEvaluation(stage, target?.id, me?.id)?.status === 'submitted')
const dirty = computed(() => !submitted.value && JSON.stringify(answers.value) !== saved.value)
const isSelf = stage === 'self'

function saveDraft() {
  try {
    saveEvaluation(stage, target, me, answers.value, false)
    saved.value = JSON.stringify(answers.value)
    problems.value = []
    toast('임시 저장했습니다. 제출 전까지 계속 고칠 수 있습니다.')
  } catch (e) {
    toast(`저장하지 못했습니다: ${e.message}`, 'warning')
  }
}

async function submit() {
  problems.value = validateAnswers(stage, answers.value)
  if (problems.value.length) {
    toast(`미응답 또는 확인이 필요한 문항이 ${problems.value.length}개 있습니다.`, 'warning')
    return
  }
  const ok = await confirmDialog({ title: '평가 제출', message: '제출하면 더 이상 고칠 수 없습니다. 제출하시겠습니까?\n(수정이 필요하면 관리자에게 재작성 허용을 요청해야 합니다)', okText: '제출' })
  if (!ok) return
  try {
    saveEvaluation(stage, target, me, answers.value, true)
    saved.value = JSON.stringify(answers.value)
    toast('평가를 제출했습니다.')
    router.push('/me')
  } catch (e) {
    toast(`제출하지 못했습니다: ${e.message}`, 'warning')
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return confirmDialog({ title: '저장하지 않은 내용', message: '저장하지 않은 응답이 있습니다. 나가면 사라집니다.', okText: '나가기', danger: true })
})
</script>

<template>
  <div v-if="!allowed" class="panel empty-hint">
    나에게 배정되지 않은 평가입니다. <RouterLink to="/me">내 평가로 돌아가기</RouterLink>
  </div>
  <div v-else>
    <div class="page-header">
      <div>
        <RouterLink to="/me" class="small">← 내 평가</RouterLink>
        <h1 class="page-title mt-1">{{ isSelf ? '자기평가' : `${target.name}님 ${stageLabel(stage)}` }}</h1>
      </div>
      <span class="stage-badge" :class="submitted ? 'stage-done' : 'stage-self'">{{ submitted ? '제출 완료' : getEvaluation(stage, target.id, me.id) ? '작성 중' : '시작 전' }}</span>
    </div>

    <div class="row g-3">
      <div class="col-lg-4 order-lg-2">
        <div class="panel info">
          <h2 class="panel-title mb-2">평가 대상자</h2>
          <dl class="row mb-0 small">
            <dt class="col-4">이름</dt><dd class="col-8">{{ target.name }}</dd>
            <dt class="col-4">소속</dt><dd class="col-8">{{ teamName(target.teamId) }}</dd>
            <dt class="col-4">직급</dt><dd class="col-8">{{ target.position }}</dd>
            <dt class="col-4">역할</dt><dd class="col-8">{{ roleLabel(target.role) }}</dd>
            <dt class="col-4">평가 단계</dt><dd class="col-8">{{ stageLabel(stage) }} ({{ STAGES[stage].evaluator }})</dd>
            <dt class="col-4">평가 기간</dt><dd class="col-8">{{ db.period.start }} ~ {{ db.period.end }}</dd>
            <dt class="col-4">마감일</dt><dd class="col-8">{{ db.period.deadline }}</dd>
          </dl>
          <p v-if="stage === 'members'" class="small text-muted mt-2 mb-0">팀원평가는 팀장의 업무 수행을 평가합니다. 평가자 이름은 팀장에게 공개되지 않습니다.</p>
        </div>
      </div>

      <div class="col-lg-8 order-lg-1">
        <div class="panel">
          <div v-if="submitted" class="alert alert-success small py-2">
            {{ localDate(getEvaluation(stage, target.id, me.id).submittedAt) }}에 제출했습니다. 제출한 평가는 고칠 수 없습니다.
          </div>
          <div v-if="problems.length" class="alert alert-danger small py-2" role="alert">
            <div v-for="p in problems" :key="p.questionId">{{ p.message }}</div>
          </div>
          <AnswerSheet :stage="stage" :answers="answers" :readonly="submitted" :problem-ids="problems.map((p) => p.questionId)" />
          <div v-if="!submitted" class="actions">
            <span class="small" :class="dirty ? 'text-warning-emphasis' : 'text-muted'">{{ dirty ? '저장하지 않은 변경이 있습니다.' : '저장된 상태입니다.' }}</span>
            <button class="btn btn-light border" @click="saveDraft">임시 저장</button>
            <button class="btn btn-primary" @click="submit">제출</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.info { position: sticky; top: 20px; }
dt { color: var(--text-muted); font-weight: 600; }
.actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--card-border); flex-wrap: wrap; }
.actions span { margin-right: auto; }
</style>
