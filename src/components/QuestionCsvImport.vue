<script setup>
import { computed, ref } from 'vue'
import { STAGES, STAGE_BY_LABEL, DEFAULT_CHOICE_LABELS } from '../constants'
import { parseCsv, decodeCsv } from '../csv'
import AppModal from './AppModal.vue'

// 평가 문항 CSV 불러오기. 열: 평가항목, 항목배점, 적용단계, 문항, 답변유형, 필수, 선택지
// 같은 평가항목 이름의 줄은 한 항목으로 묶는다. 결과는 평가 관리 화면의 '저장 전 초안'에 들어가고,
// 저장할 때 평가표별 배점(100점) 검사를 그대로 받는다.
const emit = defineEmits(['close', 'import'])
const HEADER = ['평가항목', '항목배점', '적용단계', '문항', '답변유형', '필수', '선택지']
const TYPES = { 객관식: 'choice', 주관식: 'short', 서술형: 'long' }
const sampleUrl = import.meta.env.BASE_URL + 'samples/questions-sample.csv'

const input = ref(null)
const fileName = ref('')
const items = ref([])
const errors = ref([])
const warnings = ref([])

let seq = 0
const uid = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

async function onFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  fileName.value = file.name
  items.value = []
  errors.value = []
  warnings.value = []
  if (!/\.csv$/i.test(file.name)) { errors.value = ['CSV 파일(.csv)만 올릴 수 있습니다.']; return }
  parse(parseCsv(decodeCsv(await file.arrayBuffer())))
}

function parse(table) {
  if (!table.length) { errors.value = ['파일에 데이터가 없습니다.']; return }
  const head = table[0].map((c) => c.trim())
  if (head.slice(0, 7).join(',') !== HEADER.join(',')) {
    errors.value = [`첫 줄(머리글)은 '${HEADER.join(', ')}' 이어야 합니다. (현재: ${head.join(', ')})`]
    return
  }
  const errs = []
  const warns = []
  const map = new Map()
  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const [name, points, stagesText, text, typeText, reqText, choicesText] = [...cells, '', '', '', '', '', '', ''].slice(0, 7).map((c) => c.trim())
    if (!name) return errs.push(`${line}번째 줄: 평가항목이 비어 있습니다.`)
    if (!text) return errs.push(`${line}번째 줄: 문항 내용이 비어 있습니다.`)
    const type = TYPES[typeText]
    if (!type) return errs.push(`${line}번째 줄: 답변유형 '${typeText}'은(는) 객관식·주관식·서술형 중 하나여야 합니다.`)

    if (!map.has(name)) map.set(name, { id: uid('i'), name, points: null, stages: [], questions: [], _pointsSet: false, _stagesSet: false })
    const it = map.get(name)
    if (points !== '') {
      const p = Number(points)
      if (!Number.isFinite(p) || p < 0) errs.push(`${line}번째 줄: 항목배점 '${points}'이(가) 숫자가 아닙니다.`)
      else if (it._pointsSet && it.points !== p) errs.push(`${line}번째 줄: '${name}' 항목배점이 앞 줄(${it.points})과 다릅니다.`)
      else { it.points = p; it._pointsSet = true }
    }
    if (stagesText !== '') {
      const keys = stagesText.split('/').map((x) => x.trim()).filter(Boolean)
      const bad = keys.filter((k) => !STAGE_BY_LABEL[k])
      if (bad.length) errs.push(`${line}번째 줄: 적용단계 '${bad.join(', ')}'을(를) 알 수 없습니다. (${Object.values(STAGES).map((x) => x.label).join('/')})`)
      else {
        const st = Object.keys(STAGES).filter((k) => keys.map((x) => STAGE_BY_LABEL[x]).includes(k))
        if (it._stagesSet && st.join() !== it.stages.join()) errs.push(`${line}번째 줄: '${name}' 적용단계가 앞 줄과 다릅니다.`)
        else { it.stages = st; it._stagesSet = true }
      }
    }
    const qid = uid('q')
    let choices = []
    if (type === 'choice') {
      if (!choicesText) {
        choices = DEFAULT_CHOICE_LABELS.map((label, ci) => ({ id: `${qid}-c${ci + 1}`, label, score: null, deleted: false }))
        warns.push(`${line}번째 줄: 선택지가 없어 기본 선택지를 넣었습니다(점수 미설정).`)
      } else {
        choices = choicesText.split(';').map((x) => x.trim()).filter(Boolean).map((part, ci) => {
          const [label, score] = part.split('=').map((x) => x.trim())
          const sc = score === undefined || score === '' ? null : Number(score)
          if (sc !== null && !Number.isFinite(sc)) errs.push(`${line}번째 줄: 선택지 '${label}'의 점수 '${score}'이(가) 숫자가 아닙니다.`)
          return { id: `${qid}-c${ci + 1}`, label, score: Number.isFinite(sc) ? sc : null, deleted: false }
        })
        if (!choices.length) errs.push(`${line}번째 줄: 객관식 선택지가 없습니다.`)
      }
    }
    const required = reqText === '' ? type === 'choice' : ['Y', 'y', '예', '필수'].includes(reqText)
    it.questions.push({ id: qid, text, type, required, maxLength: type === 'short' ? 100 : type === 'long' ? 1000 : null, shareInInterview: false, choices })
  })
  map.forEach((it) => { if (!it.stages.length) errs.push(`'${it.name}' 항목에 적용단계가 없습니다.`) })
  errors.value = errs
  warnings.value = warns
  items.value = [...map.values()].map(({ _pointsSet, _stagesSet, ...rest }) => rest)
}

const qCount = computed(() => items.value.reduce((a, it) => a + it.questions.length, 0))
function apply(mode) {
  emit('import', { mode, items: JSON.parse(JSON.stringify(items.value)) })
}
</script>

<template>
  <AppModal title="평가 문항 CSV 불러오기" size="lg" @close="emit('close')">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <button type="button" class="btn btn-csv btn-sm" @click="input.click()">CSV 파일 선택</button>
      <input ref="input" type="file" accept=".csv,text/csv" class="d-none" data-testid="q-csv-input" @change="onFile" />
      <span class="small text-muted">{{ fileName || '선택한 파일 없음' }}</span>
      <a :href="sampleUrl" download class="small ms-auto">샘플 내려받기</a>
    </div>
    <p class="small text-muted mb-2">
      열 순서: <strong>평가항목, 항목배점, 적용단계, 문항, 답변유형, 필수, 선택지</strong>.
      같은 평가항목 이름의 줄은 한 항목으로 묶습니다. 적용단계는 '자기평가/팀장평가'처럼 / 로 구분하고,
      선택지는 '매우 그렇다=5;그렇다=4'처럼 ; 로 구분합니다(=점수는 생략 가능).
    </p>

    <div v-if="errors.length" class="alert alert-danger small py-2" role="alert">
      <div v-for="e in errors" :key="e">{{ e }}</div>
    </div>
    <div v-if="warnings.length" class="alert alert-warning small py-2">
      <div v-for="w in warnings" :key="w">{{ w }}</div>
    </div>

    <div v-if="items.length" class="table-responsive" style="max-height: 320px">
      <table class="table table-sm table-clean small" data-testid="q-csv-preview">
        <thead><tr><th>평가항목</th><th class="text-end">배점</th><th>적용단계</th><th>문항</th></tr></thead>
        <tbody>
          <tr v-for="it in items" :key="it.id">
            <td class="fw-semibold">{{ it.name }}</td>
            <td class="text-end">{{ it.points ?? '없음' }}</td>
            <td>{{ it.stages.map((s) => STAGES[s].label).join(', ') }}</td>
            <td>
              <div v-for="q in it.questions" :key="q.id">{{ q.text }} <span class="text-muted">· {{ { choice: '객관식', short: '주관식', long: '서술형' }[q.type] }}{{ q.type === 'choice' ? ` ${q.choices.length}개` : '' }}</span></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="items.length" class="small text-muted mb-0">
      항목 {{ items.length }}개 · 문항 {{ qCount }}개. 불러온 뒤 평가 관리 화면에서 '저장'을 눌러야 반영되며, 평가표별 배점 합계가 100점이어야 저장됩니다.
    </p>

    <template #footer>
      <button class="btn btn-light" @click="emit('close')">취소</button>
      <button class="btn btn-outline-primary" :disabled="!items.length || errors.length > 0" @click="apply('append')">기존 문항 뒤에 추가</button>
      <button class="btn btn-primary" :disabled="!items.length || errors.length > 0" @click="apply('replace')">기존 문항 모두 바꾸기</button>
    </template>
  </AppModal>
</template>
