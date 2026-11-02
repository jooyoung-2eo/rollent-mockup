<script setup>
import { computed, nextTick, ref } from 'vue'
import { db, isEvalTarget, stagesFor, stageStatus, targetStatus } from '../store'

// 부서별 평가 진행: 평가 대상자 수 기준 가로 누적 막대.
// 핵심 정보는 'n명 중 m명 완료'이고, 진행률(%)과 단계별 완료 인원은 보조로 보여준다.
// 구간(완료·진행 중·시작 전)에 마우스를 올리면 그 구간 대상자 이름만 보여준다.
// 상태 판정은 진행현황 표와 같은 store.targetStatus를 그대로 쓴다.
const byName = (a, b) => a.name.localeCompare(b.name, 'ko')
const rows = computed(() => db.teams.map((t) => {
  const targets = db.users.filter((u) => u.teamId === t.id && isEvalTarget(u) && stagesFor(u).length)
  const withStatus = targets.map((u) => ({ user: u, status: targetStatus(u) }))
  const pick = (fn) => withStatus.filter((x) => fn(x.status)).map((x) => x.user).sort(byName)
  const people = {
    done: pick((s) => s === '완료' || s === '최종 확정'),
    progress: pick((s) => s === '진행 중'),
    todo: pick((s) => s === '시작 전'),
  }
  const stageCount = (pickStage) => {
    const has = targets.filter((u) => pickStage(u))
    return { done: has.filter((u) => stageStatus(u, pickStage(u)) === 'done').length, total: has.length }
  }
  return {
    team: t,
    total: targets.length,
    people,
    done: people.done.length,
    progress: people.progress.length,
    todo: people.todo.length,
    stages: [
      { label: '자기', ...stageCount((u) => (stagesFor(u).includes('self') ? 'self' : null)) },
      { label: '2차', ...stageCount((u) => stagesFor(u).find((s) => s === 'leader' || s === 'members') ?? null) },
      { label: '3차', ...stageCount((u) => (stagesFor(u).includes('exec') ? 'exec' : null)) },
    ].filter((s) => s.total > 0),
  }
}).filter((r) => r.total > 0))

const SEGS = [
  { key: 'done', label: '완료', cls: 'seg-done' },
  { key: 'progress', label: '진행 중', cls: 'seg-progress' },
  { key: 'todo', label: '시작 전', cls: 'seg-todo' },
]
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0)

// ---- 구간 툴팁 ----
const host = ref(null)
const tipEl = ref(null)
const tip = ref(null) // { r, seg, left, top }
async function showSeg(r, seg, e) {
  const target = e.currentTarget
  tip.value = { r, seg, left: 0, top: 0, hidden: true }
  await nextTick()
  const h = host.value.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const w = tipEl.value.offsetWidth
  const th = tipEl.value.offsetHeight
  // 가로: 구간 가운데에 맞추되 영역 밖으로 나가지 않게
  const left = Math.min(Math.max(b.left + b.width / 2 - h.left - w / 2, 0), Math.max(h.width - w, 0))
  // 세로: 기본은 막대 아래, 화면 아래 공간이 모자라면 막대 위
  const below = b.bottom - h.top + 6
  const above = b.top - h.top - th - 6
  const top = b.bottom + th + 12 > window.innerHeight && above > -h.top ? above : below
  tip.value = { r, seg, left, top, hidden: false }
}
const hideTip = () => { tip.value = null }
const segInfo = computed(() => (tip.value ? SEGS.find((s) => s.key === tip.value.seg) : null))
</script>

<template>
  <div ref="host" class="dept-progress" @mouseleave="hideTip">
    <div class="legend small mb-2">
      <span v-for="s in SEGS" :key="s.key" class="me-3"><span class="swatch" :class="s.cls"></span>{{ s.label }}</span>
      <span class="text-muted">· 평가 대상자 수 기준 (모든 단계를 마쳐야 완료) · 구간에 마우스를 올리면 이름이 보입니다</span>
    </div>
    <div v-if="!rows.length" class="empty-hint">평가 대상자가 있는 부서가 없습니다.</div>
    <div v-for="r in rows" :key="r.team.id" class="row-line" :data-dept="r.team.name">
      <div class="name">{{ r.team.name }}<span v-if="r.team.kind === 'exec'" class="text-muted small"> (임원)</span></div>
      <div class="bar" role="group" :aria-label="`${r.team.name} ${r.total}명 중 ${r.done}명 완료, 진행 중 ${r.progress}명, 시작 전 ${r.todo}명`">
        <div
          v-for="s in SEGS" v-show="r[s.key] > 0" :key="s.key" class="seg" :class="s.cls" :data-seg="s.key"
          :style="{ width: (r[s.key] / r.total) * 100 + '%' }" tabindex="0" :aria-label="`${r.team.name} ${s.label} ${r[s.key]}명`"
          @mouseenter="showSeg(r, s.key, $event)" @focus="showSeg(r, s.key, $event)" @blur="hideTip"
        >
          <span v-if="r[s.key] / r.total >= 0.12" class="seg-n">{{ r[s.key] }}</span>
        </div>
      </div>
      <div class="count" data-testid="dept-count"><strong>{{ r.total }}명 중 {{ r.done }}명 완료</strong> <span class="text-muted">({{ pct(r.done, r.total) }}%)</span></div>
      <div class="stages small text-muted">
        <span v-for="s in r.stages" :key="s.label" class="me-2">{{ s.label }} {{ s.done }}/{{ s.total }}</span>
      </div>
    </div>

    <!-- 마우스를 올린 구간의 대상자만. 이름이 많으면 툴팁 안에서 스크롤된다 -->
    <div
      v-if="tip" ref="tipEl" class="tip" :style="{ left: tip.left + 'px', top: tip.top + 'px', visibility: tip.hidden ? 'hidden' : 'visible' }"
      data-testid="dept-tip" role="tooltip"
    >
      <div class="tip-head">
        <span class="swatch" :class="segInfo.cls"></span>
        <strong>{{ tip.r.team.name }} · {{ segInfo.label }} {{ tip.r[tip.seg] }}명</strong>
        <span class="tip-sub">({{ tip.r.total }}명 중)</span>
      </div>
      <ul class="tip-names" data-testid="dept-tip-names">
        <li v-for="u in tip.r.people[tip.seg]" :key="u.id" :data-name="u.name">{{ u.name }}<small class="pos">{{ u.position }}</small></li>
      </ul>
      <div class="tip-foot">{{ tip.r.total }}명 중 {{ tip.r.done }}명 완료 ({{ pct(tip.r.done, tip.r.total) }}%) · 진행 중 {{ tip.r.progress }} · 시작 전 {{ tip.r.todo }}</div>
    </div>
  </div>
</template>

<style scoped>
.dept-progress { position: relative; }
.row-line { display: grid; grid-template-columns: 130px 1fr 190px; grid-template-areas: 'name bar count' '. stages stages'; gap: 2px 14px; align-items: center; padding: 8px 0; border-bottom: 1px solid #eef0f4; }
.row-line:last-child { border-bottom: 0; }
.name { grid-area: name; font-weight: 600; }
.bar { grid-area: bar; display: flex; height: 26px; border-radius: 6px; overflow: hidden; background: #f1f2f5; gap: 2px; }
.count { grid-area: count; font-variant-numeric: tabular-nums; }
.stages { grid-area: stages; }
.seg { display: flex; align-items: center; justify-content: center; min-width: 4px; cursor: default; outline: none; }
.seg:hover, .seg:focus-visible { filter: brightness(0.92); box-shadow: inset 0 0 0 2px rgba(30, 32, 84, 0.45); }
.seg-n { font-size: 0.78rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.seg-done { background: #2a78d6; color: #fff; }
.seg-progress { background: #9cc3ee; color: #1d3f6b; }
.seg-todo { background: #dfe2ea; color: #4a4f63; }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.tip {
  position: absolute; z-index: 6; width: max-content; max-width: min(440px, 100%);
  background: #23263a; color: #fff; font-size: 0.8rem; padding: 8px 10px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}
.tip-head { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; flex-wrap: wrap; }
.tip-sub { color: #b9bde0; }
.tip-names { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; max-height: 180px; overflow-y: auto; }
.tip-names li { background: rgba(255, 255, 255, 0.1); border-radius: 4px; padding: 1px 6px; white-space: nowrap; }
.tip-names .pos { color: #b9bde0; margin-left: 4px; }
.tip-foot { margin-top: 6px; color: #b9bde0; font-size: 0.74rem; }
@media (max-width: 700px) { .row-line { grid-template-columns: 90px 1fr; grid-template-areas: 'name bar' 'count count' 'stages stages'; } }
</style>
