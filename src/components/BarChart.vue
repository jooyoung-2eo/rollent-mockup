<script setup>
import { ref, computed } from 'vue'

// 묶음 막대 차트. groups: [{ label, values: [n, n, n] }], series: [{ label, color }]
// 값은 0~100(%) 범위로 가정한다.
const props = defineProps({
  groups: { type: Array, required: true },
  series: { type: Array, required: true },
  height: { type: Number, default: 240 },
})

const W = 640
const pad = { l: 40, r: 8, t: 10, b: 28 }
const hover = ref(null)

function layout() {
  const innerW = W - pad.l - pad.r
  const innerH = props.height - pad.t - pad.b
  const groupW = innerW / props.groups.length
  const barW = Math.min(22, (groupW * 0.7) / props.series.length)
  const gap = 2
  const bars = []
  props.groups.forEach((g, gi) => {
    const totalW = props.series.length * barW + (props.series.length - 1) * gap
    const x0 = pad.l + gi * groupW + (groupW - totalW) / 2
    props.series.forEach((s, si) => {
      const v = g.values[si]
      const h = (v / 100) * innerH
      bars.push({
        key: `${gi}-${si}`, x: x0 + si * (barW + gap), y: pad.t + innerH - h, w: barW, h,
        color: s.color, text: `${g.label} · ${s.label}: ${v}%`, cx: x0 + si * (barW + gap) + barW / 2,
      })
    })
  })
  return { innerH, groupW, bars }
}

const L = computed(layout)

function barPath(b) {
  // 위쪽 모서리만 4px 둥글게, 아래는 기준선에 붙인다
  if (b.h <= 0) return ''
  const r = Math.min(4, b.w / 2, b.h)
  return `M${b.x},${b.y + b.h} V${b.y + r} Q${b.x},${b.y} ${b.x + r},${b.y} H${b.x + b.w - r} Q${b.x + b.w},${b.y} ${b.x + b.w},${b.y + r} V${b.y + b.h} Z`
}
</script>

<template>
  <div class="bar-chart">
    <div class="legend">
      <span v-for="s in series" :key="s.label" class="me-3"><span class="legend-swatch" :style="{ background: s.color }"></span>{{ s.label }}</span>
    </div>
    <div class="position-relative">
      <svg :viewBox="`0 0 ${W} ${height}`" width="100%" role="img" aria-label="팀별 평가 진행률 막대 차트" @mouseleave="hover = null">
        <g v-for="t in [0, 50, 100]" :key="t">
          <line :x1="pad.l" :x2="W - pad.r" :y1="pad.t + L.innerH * (1 - t / 100)" :y2="pad.t + L.innerH * (1 - t / 100)" stroke="#e6e8ee" />
          <text :x="pad.l - 6" :y="pad.t + L.innerH * (1 - t / 100) + 4" text-anchor="end" font-size="12" fill="#6b7080">{{ t }}%</text>
        </g>
        <path
          v-for="b in L.bars" :key="b.key" :d="barPath(b)" :fill="b.color"
          :opacity="hover && hover.key !== b.key ? 0.45 : 1"
        />
        <!-- 막대보다 넓은 마우스 감지 영역 -->
        <rect
          v-for="b in L.bars" :key="'hit' + b.key" :x="b.x - 1" :y="pad.t" :width="b.w + 2" :height="L.innerH"
          fill="transparent" @mouseenter="hover = b"
        />
        <text
          v-for="(g, gi) in groups" :key="g.label" :x="pad.l + gi * L.groupW + L.groupW / 2" :y="height - 8"
          text-anchor="middle" font-size="13" fill="#4a4f63"
        >{{ g.label }}</text>
      </svg>
      <div v-if="hover" class="chart-tip" :style="{ left: (hover.cx / W) * 100 + '%', top: (hover.y / height) * 100 + '%' }">
        {{ hover.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.legend { font-size: 0.8rem; color: #4a4f63; margin-bottom: 4px; }
.chart-tip {
  position: absolute; transform: translate(-50%, -120%); pointer-events: none;
  background: #23263a; color: #fff; font-size: 0.75rem; padding: 4px 8px; border-radius: 6px; white-space: nowrap;
}
</style>
