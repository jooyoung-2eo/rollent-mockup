<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  db, currentUser, userById, teamName, getEvaluation, saveEvaluation, validateAnswers, canEvaluate, toast, confirmDialog,
} from '../store'
import { localDate } from '../constants'
import { t, dt, stageName, evaluatorName, roleName } from '../i18n'
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
    toast(t('ev.draftSaved'))
  } catch (e) {
    toast(t('ev.saveFail', { msg: e.message }), 'warning')
  }
}

async function submit() {
  problems.value = validateAnswers(stage, answers.value)
  if (problems.value.length) {
    toast(t('ev.problems', { n: problems.value.length }), 'warning')
    return
  }
  const ok = await confirmDialog({ title: t('ev.confirmTitle'), message: t('ev.confirmMsg'), okText: t('ev.submit') })
  if (!ok) return
  try {
    saveEvaluation(stage, target, me, answers.value, true)
    saved.value = JSON.stringify(answers.value)
    toast(t('ev.sent'))
    router.push('/me')
  } catch (e) {
    toast(t('ev.submitFail', { msg: e.message }), 'warning')
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true
  return confirmDialog({ title: t('ev.leaveTitle'), message: t('ev.leaveMsg'), okText: t('ev.leave'), danger: true })
})
</script>

<template>
  <div v-if="!allowed" class="panel empty-hint">
    {{ t('ev.notAssigned') }} <RouterLink to="/me">{{ t('ev.back') }}</RouterLink>
  </div>
  <div v-else>
    <div class="page-header">
      <div>
        <RouterLink to="/me" class="small">← {{ t('nav.myEval') }}</RouterLink>
        <h1 class="page-title mt-1">{{ isSelf ? stageName('self') : t('ev.titleOther', { name: target.name, stage: stageName(stage) }) }}</h1>
      </div>
      <span class="stage-badge" :class="submitted ? 'stage-done' : 'stage-self'">{{ submitted ? t('ev.submitted') : getEvaluation(stage, target.id, me.id) ? t('ev.writing') : t('status.todo') }}</span>
    </div>

    <div class="row g-3">
      <div class="col-lg-4 order-lg-2">
        <div class="panel info">
          <h2 class="panel-title mb-2">{{ t('ev.target') }}</h2>
          <dl class="row mb-0 small">
            <dt class="col-4">{{ t('col.name') }}</dt><dd class="col-8">{{ target.name }}</dd>
            <dt class="col-4">{{ t('col.team') }}</dt><dd class="col-8">{{ dt(teamName(target.teamId)) }}</dd>
            <dt class="col-4">{{ t('col.position') }}</dt><dd class="col-8">{{ dt(target.position) }}</dd>
            <dt class="col-4">{{ t('col.role') }}</dt><dd class="col-8">{{ roleName(target.role) }}</dd>
            <dt class="col-4">{{ t('me.colStage') }}</dt><dd class="col-8">{{ stageName(stage) }} ({{ evaluatorName(stage) }})</dd>
            <dt class="col-4">{{ t('ev.period') }}</dt><dd class="col-8">{{ db.period.start }} ~ {{ db.period.end }}</dd>
            <dt class="col-4">{{ t('ev.deadline') }}</dt><dd class="col-8">{{ db.period.deadline }}</dd>
          </dl>
          <p v-if="stage === 'members'" class="small text-muted mt-2 mb-0">{{ t('ev.membersNote') }}</p>
        </div>
      </div>

      <div class="col-lg-8 order-lg-1">
        <div class="panel">
          <div v-if="submitted" class="alert alert-success small py-2">
            {{ t('ev.submittedAt', { date: localDate(getEvaluation(stage, target.id, me.id).submittedAt) }) }}
          </div>
          <div v-if="problems.length" class="alert alert-danger small py-2" role="alert">
            <div v-for="p in problems" :key="p.questionId">{{ p.message }}</div>
          </div>
          <AnswerSheet :stage="stage" :answers="answers" :readonly="submitted" :problem-ids="problems.map((p) => p.questionId)" />
          <div v-if="!submitted" class="actions">
            <span class="small" :class="dirty ? 'text-warning-emphasis' : 'text-muted'">{{ dirty ? t('ev.dirty') : t('ev.clean') }}</span>
            <button class="btn btn-light border" @click="saveDraft">{{ t('ev.draft') }}</button>
            <button class="btn btn-primary" @click="submit">{{ t('ev.submit') }}</button>
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
