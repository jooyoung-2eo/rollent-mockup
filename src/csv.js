// CSV 읽기 도우미 (따옴표·쉼표·줄바꿈 처리)

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

// UTF-8로 읽고, 깨지면 엑셀 기본 저장 형식(EUC-KR)으로 다시 읽는다
export function decodeCsv(buffer) {
  let text = new TextDecoder('utf-8').decode(buffer)
  if (text.includes('�')) {
    try {
      text = new TextDecoder('euc-kr').decode(buffer)
    } catch {
      // EUC-KR을 지원하지 않는 브라우저는 UTF-8 결과를 그대로 쓴다
    }
  }
  return text.replace(/^﻿/, '')
}

export const toCsvLine = (cells) => cells.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
