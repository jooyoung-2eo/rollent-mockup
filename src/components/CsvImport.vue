<script setup>
import { computed, ref } from 'vue'
import { db, newId, toast } from '../store'
import { POSITIONS, roleFromPosition, roleLabel } from '../constants'
import { parseCsv, decodeCsv } from '../csv'
import AppModal from './AppModal.vue'

// 직원 CSV 일괄 등록. 열 순서: 소속팀, 직급, 이름, 사번
const emit = defineEmits(['close'])
const fileName = ref('')
const rows = ref([]) // 미리보기 행
const parseError = ref('')
const result = ref(null)
const input = ref(null)
const sampleBase = import.meta.env.BASE_URL + 'samples/'

const STATUS = {
  new: { label: '신규 등록', cls: 'text-bg-primary' },
  same: { label: '이미 등록됨 (변경 없음)', cls: 'text-bg-light border' },
  conflict: { label: '충돌: 기존 정보와 다름', cls: 'text-bg-warning' },
  error: { label: '오류', cls: 'text-bg-danger' },
}

const counts = computed(() => {
  const c = { new: 0, same: 0, conflict: 0, error: 0 }
  rows.value.forEach((r) => c[r.status]++)
  return c
})

async function onFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  result.value = null
  fileName.value = file.name
  parseError.value = ''
  rows.value = []
  if (!/\.csv$/i.test(file.name)) {
    parseError.value = 'CSV 파일(.csv)만 올릴 수 있습니다.'
    return
  }
  const text = decodeCsv(await file.arrayBuffer())
  analyze(parseCsv(text))
}

function analyze(table) {
  if (!table.length) {
    parseError.value = '파일에 데이터가 없습니다.'
    return
  }
  // 첫 줄이 머리글이면 건너뛴다
  const first = table[0].map((c) => c.trim())
  const hasHeader = first.includes('이름') && first.includes('사번')
  if (hasHeader && first.join(',') !== '소속팀,직급,이름,사번') {
    parseError.value = `열 순서가 맞지 않습니다. '소속팀, 직급, 이름, 사번' 순서여야 합니다. (현재: ${first.join(', ')})`
    return
  }
  const body = hasHeader ? table.slice(1) : table
  const seen = new Map()
  rows.value = body.map((cells, i) => {
    const line = i + (hasHeader ? 2 : 1)
    const [team, position, name, empNo] = cells.map((c) => (c ?? '').trim())
    const r = { line, team, position, name, empNo, status: 'error', errors: [], diffs: [], notes: [], apply: false }
    if (cells.length !== 4) r.errors.push(`열이 ${cells.length}개입니다. 4개(소속팀, 직급, 이름, 사번)여야 합니다.`)
    if (!team) r.errors.push('소속팀이 비어 있습니다.')
    if (!position) r.errors.push('직급이 비어 있습니다.')
    else if (!POSITIONS.includes(position)) r.errors.push(`'${position}'은(는) 등록된 직급이 아닙니다. (${POSITIONS.join(', ')})`)
    if (!name) r.errors.push('이름이 비어 있습니다.')
    if (!empNo) r.errors.push('사번이 비어 있습니다.')
    else if (!/^[A-Za-z0-9-]{3,20}$/.test(empNo)) r.errors.push('사번은 영문·숫자·하이픈 3~20자여야 합니다.')
    if (empNo && seen.has(empNo)) r.errors.push(`같은 파일의 ${seen.get(empNo)}번째 줄과 사번이 같습니다.`)
    if (empNo && !seen.has(empNo)) seen.set(empNo, line)
    if (r.errors.length) return r

    const existing = db.users.find((u) => u.empNo === empNo)
    if (!existing) {
      r.status = 'new'
      if (!db.teams.some((t) => t.name === team)) r.notes.push(`'${team}' 부서가 새로 만들어집니다.`)
      if (db.users.some((u) => u.name === name)) r.notes.push('같은 이름의 직원이 이미 있습니다(동명이인인지 확인하세요).')
      return r
    }
    const oldTeam = db.teams.find((t) => t.id === existing.teamId)?.name ?? '미배정'
    if (existing.name !== name) r.diffs.push(['이름', existing.name, name])
    if (oldTeam !== team) r.diffs.push(['소속팀', oldTeam, team])
    if (existing.position !== position) r.diffs.push(['직급', existing.position, position])
    r.status = r.diffs.length ? 'conflict' : 'same'
    r.existingId = existing.id
    return r
  })
}

function teamIdFor(name) {
  let t = db.teams.find((x) => x.name === name)
  if (!t) {
    t = { id: newId(), name, kind: 'dept' }
    db.teams.push(t)
  }
  return t.id
}

function apply() {
  const res = { created: [], updated: [], skipped: [], kept: [], failed: [] }
  rows.value.forEach((r) => {
    if (r.status === 'error') res.failed.push(r)
    else if (r.status === 'same') res.skipped.push(r)
    else if (r.status === 'conflict' && !r.apply) res.kept.push(r)
    else if (r.status === 'conflict') {
      const u = db.users.find((x) => x.id === r.existingId)
      Object.assign(u, { name: r.name, teamId: teamIdFor(r.team), position: r.position, role: roleFromPosition(r.position) })
      res.updated.push(r)
    } else if (db.users.some((u) => u.empNo === r.empNo)) {
      r.errors = ['등록 직전에 같은 사번이 생겼습니다.']
      res.failed.push(r)
    } else {
      db.users.push({ id: newId(), empNo: r.empNo, name: r.name, teamId: teamIdFor(r.team), position: r.position, role: roleFromPosition(r.position), active: true })
      res.created.push(r)
    }
  })
  result.value = res
  toast(`CSV 처리 완료: 신규 ${res.created.length}명, 변경 ${res.updated.length}명, 건너뜀 ${res.skipped.length + res.kept.length}명, 실패 ${res.failed.length}건`)
}
</script>

<template>
  <AppModal title="직원 CSV 일괄 등록" size="lg" @close="emit('close')">
    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
      <button type="button" class="btn btn-csv btn-sm" @click="input.click()">CSV 파일 선택</button>
      <input ref="input" type="file" accept=".csv,text/csv" class="d-none" data-testid="csv-input" @change="onFile" />
      <span class="small text-muted">{{ fileName || '선택한 파일 없음' }}</span>
    </div>
    <p class="small text-muted mb-1">
      열 순서: <strong>소속팀, 직급, 이름, 사번</strong> (첫 줄 머리글은 있어도 되고 없어도 됩니다). UTF-8 또는 엑셀 CSV(EUC-KR)를 읽습니다.
    </p>
    <p class="small mb-3">
      샘플:
      <a :href="sampleBase + 'employees-34.csv'" download>초기 직원 34명</a> ·
      <a :href="sampleBase + 'employees-new-and-conflict.csv'" download>신규·충돌·오류 예시</a>
    </p>

    <div v-if="parseError" class="alert alert-danger py-2 small">{{ parseError }}</div>

    <template v-if="rows.length && !result">
      <div class="d-flex flex-wrap gap-2 mb-2 small">
        <span class="badge text-bg-primary">신규 {{ counts.new }}</span>
        <span class="badge text-bg-light border">이미 등록 {{ counts.same }}</span>
        <span class="badge text-bg-warning">충돌 {{ counts.conflict }}</span>
        <span class="badge text-bg-danger">오류 {{ counts.error }}</span>
      </div>
      <p v-if="counts.conflict" class="small text-muted mb-2">
        충돌 행은 기본적으로 <strong>기존 정보를 유지</strong>합니다. CSV 내용으로 바꾸려면 해당 행의 'CSV로 변경'을 체크하세요.
      </p>
      <div class="table-responsive preview">
        <table class="table table-sm table-clean small">
          <thead><tr><th>줄</th><th>소속팀</th><th>직급</th><th>이름</th><th>사번</th><th>처리</th><th>내용</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.line" :data-status="r.status">
              <td>{{ r.line }}</td><td>{{ r.team }}</td><td>{{ r.position }}</td><td>{{ r.name }}</td><td>{{ r.empNo }}</td>
              <td><span class="badge" :class="STATUS[r.status].cls">{{ STATUS[r.status].label }}</span></td>
              <td>
                <div v-for="e in r.errors" :key="e" class="text-danger">{{ e }}</div>
                <div v-for="d in r.diffs" :key="d[0]">{{ d[0] }}: {{ d[1] }} → <strong>{{ d[2] }}</strong></div>
                <div v-for="n in r.notes" :key="n" class="text-muted">{{ n }}</div>
                <label v-if="r.status === 'conflict'" class="form-check-label d-block mt-1">
                  <input v-model="r.apply" type="checkbox" class="form-check-input me-1" />CSV로 변경
                </label>
                <span v-if="r.status === 'new'" class="text-muted">역할: {{ roleLabel(roleFromPosition(r.position)) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div v-if="result" class="result">
      <h6 class="fw-bold">등록 결과</h6>
      <ul class="small mb-2">
        <li>신규 등록 {{ result.created.length }}명</li>
        <li>CSV 내용으로 변경 {{ result.updated.length }}명</li>
        <li>건너뜀 {{ result.skipped.length }}명 (이미 등록, 변경 없음)</li>
        <li>충돌 후 기존 정보 유지 {{ result.kept.length }}명</li>
        <li>실패 {{ result.failed.length }}건</li>
      </ul>
      <div v-if="result.failed.length" class="small">
        <strong>실패 원인</strong>
        <div v-for="r in result.failed" :key="r.line" class="text-danger">{{ r.line }}번째 줄: {{ r.errors.join(' ') }}</div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-light" @click="emit('close')">{{ result ? '닫기' : '취소' }}</button>
      <button v-if="!result" class="btn btn-primary" :disabled="!rows.length || counts.new + counts.conflict === 0" @click="apply">
        등록 실행 (신규 {{ counts.new }}명{{ counts.conflict ? `, 충돌 ${counts.conflict}건 확인` : '' }})
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.preview { max-height: 360px; overflow-y: auto; }
</style>
