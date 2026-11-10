<script setup>
import { computed } from 'vue'
import { db } from '../store'
import { t, dt, answerTypeName } from '../i18n'

// 평가 문항과 응답 입력/보기. 답변 유형에 맞는 입력 UI를 보여준다.
const props = defineProps({
  stage: { type: String, required: true },
  answers: { type: Object, required: true }, // 편집 모드에서는 이 객체를 직접 고친다
  readonly: { type: Boolean, default: false },
  problemIds: { type: Array, default: () => [] },
  idPrefix: { type: String, default: 'a' },
})

const groups = computed(() => db.items.filter((it) => it.stages.includes(props.stage)).map((it) => ({ item: it, questions: it.questions })))
const activeChoices = (q) => q.choices.filter((c) => !c.deleted)
const choiceLabel = (q, id) => {
  const c = q.choices.find((x) => x.id === id)
  if (!c) return t('as.unknownChoice')
  return c.deleted ? t('as.deletedChoice', { label: dt(c.label) }) : dt(c.label)
}
const empty = (v) => v === undefined || v === null || String(v).trim() === ''
</script>

<template>
  <div class="answer-sheet">
    <div v-if="!groups.length" class="empty-hint">{{ t('as.empty') }}</div>
    <section v-for="g in groups" :key="g.item.id" class="item-block">
      <h3 class="item-title">{{ dt(g.item.name) }} <span v-if="typeof g.item.points === 'number'" class="text-muted small">{{ t('as.points', { n: g.item.points }) }}</span></h3>
      <div v-for="(q, qi) in g.questions" :key="q.id" class="q" :class="{ problem: problemIds.includes(q.id) }" :data-question="q.id">
        <div class="q-text">
          {{ qi + 1 }}. {{ dt(q.text) }}
          <span v-if="q.required" class="text-danger" :title="t('as.required')">*</span>
          <span class="badge text-bg-light border ms-1">{{ answerTypeName(q.type) }}</span>
        </div>

        <template v-if="readonly">
          <div class="answer-view">
            <span v-if="empty(answers[q.id])" class="text-muted">{{ t('as.unanswered') }}</span>
            <template v-else-if="q.type === 'choice'">{{ choiceLabel(q, answers[q.id]) }}</template>
            <span v-else class="pre">{{ answers[q.id] }}</span>
          </div>
        </template>

        <template v-else>
          <div v-if="q.type === 'choice'" class="choices" role="radiogroup" :aria-label="dt(q.text)">
            <label v-for="c in activeChoices(q)" :key="c.id" class="choice" :class="{ on: answers[q.id] === c.id }">
              <input v-model="answers[q.id]" type="radio" :name="`${idPrefix}-${q.id}`" :value="c.id" class="form-check-input" />
              {{ dt(c.label) }}
            </label>
            <div v-if="answers[q.id] && !activeChoices(q).some((c) => c.id === answers[q.id])" class="small text-danger w-100">
              {{ t('as.choiceGone', { label: choiceLabel(q, answers[q.id]) }) }}
            </div>
          </div>
          <template v-else-if="q.type === 'short'">
            <input v-model="answers[q.id]" class="form-control" :maxlength="q.maxLength || null" :placeholder="t('as.shortPh')" :aria-label="dt(q.text)" />
          </template>
          <template v-else>
            <textarea v-model="answers[q.id]" class="form-control" rows="4" :maxlength="q.maxLength || null" :placeholder="t('as.longPh')" :aria-label="dt(q.text)"></textarea>
          </template>
          <div v-if="q.type !== 'choice' && q.maxLength" class="small text-muted text-end">{{ t('as.chars', { n: (answers[q.id] || '').length, max: q.maxLength }) }}</div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.item-block { padding: 6px 0 10px; border-top: 1px solid var(--card-border); }
.item-block:first-child { border-top: 0; }
.item-title { font-size: 1rem; font-weight: 700; margin: 10px 0 6px; }
.q { padding: 10px 12px; border-radius: 8px; margin-bottom: 6px; }
.q.problem { background: #fdf0f0; outline: 1px solid #f1b9b9; }
.q-text { margin-bottom: 8px; }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #ccd3e0; border-radius: 8px; padding: 6px 12px; cursor: pointer; background: #fff; }
.choice.on { border-color: var(--brand); background: #e8f1fc; font-weight: 600; }
.answer-view { padding: 6px 10px; background: #f6f7fa; border-radius: 6px; }
.pre { white-space: pre-wrap; }
</style>
