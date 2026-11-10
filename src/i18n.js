import { reactive, watchEffect } from 'vue'

// 사원·팀장·임원 화면과 로그인 화면의 언어(한국어·영어·러시아어).
// 로그인 화면에서 고른 언어를 이 브라우저에 기억한다. 관리자 화면은 한국어로만 보여준다.

export const LANGS = [
  { key: 'ko', label: '한국어' },
  { key: 'en', label: 'English' },
  { key: 'ru', label: 'Русский' },
]
const LANG_KEY = 'rollent.lang'

function loadLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return LANGS.some((l) => l.key === v) ? v : 'ko'
  } catch {
    return 'ko'
  }
}

// pref: 고른 언어, adminView: 관리자로 로그인 중이면 true (store가 세션에 맞춰 바꾼다)
export const i18n = reactive({ pref: loadLang(), adminView: false })
export const curLang = () => (i18n.adminView ? 'ko' : i18n.pref)

export function setLang(key) {
  i18n.pref = key
  try {
    localStorage.setItem(LANG_KEY, key)
  } catch {
    // 무시
  }
}

if (typeof document !== 'undefined') watchEffect(() => { document.documentElement.lang = curLang() })

// [한국어, 영어, 러시아어]
const MESSAGES = {
  'common.ok': ['확인', 'OK', 'ОК'],
  'common.cancel': ['취소', 'Cancel', 'Отмена'],
  'common.close': ['닫기', 'Close', 'Закрыть'],

  // 로그인
  'login.id': ['아이디 (이름)', 'ID (name)', 'ID (имя)'],
  'login.idPh': ['이름을 입력하세요', 'Enter your name', 'Введите имя'],
  'login.pw': ['비밀번호 (사번)', 'Password (employee ID)', 'Пароль (табельный номер)'],
  'login.pwPh': ['사번을 입력하세요', 'Enter your employee ID', 'Введите табельный номер'],
  'login.show': ['표시', 'Show', 'Показать'],
  'login.hide': ['숨기기', 'Hide', 'Скрыть'],
  'login.submit': ['로그인', 'Log in', 'Войти'],
  'login.findPw': ['비밀번호 찾기', 'Forgot password', 'Забыли пароль?'],
  'login.needBoth': ['아이디(이름)와 비밀번호(사번)를 모두 입력해 주세요.', 'Please enter both your ID (name) and password (employee ID).', 'Введите ID (имя) и пароль (табельный номер).'],
  'login.bad': ['이름 또는 사번이 맞지 않습니다.', 'The name or employee ID is incorrect.', 'Неверное имя или табельный номер.'],
  'login.inactive': ['비활성화된 계정입니다. 관리자에게 문의하세요.', 'This account has been deactivated. Please contact your administrator.', 'Учётная запись деактивирована. Обратитесь к администратору.'],
  'login.accountsShow': ['테스트 계정 보기', 'Show test accounts', 'Показать тестовые учётные записи'],
  'login.accountsHide': ['테스트 계정 닫기', 'Hide test accounts', 'Скрыть тестовые учётные записи'],
  'login.accountsNote': ['테스트용 가상 계정입니다. 누르면 입력란이 채워집니다.', 'These are fictional test accounts. Click one to fill in the fields.', 'Это вымышленные тестовые учётные записи. Нажмите, чтобы заполнить поля.'],
  'login.adminAccount': ['관리자 (인사 · 최종 점수 직접 수정 권한)', 'Administrator (HR · can edit final scores)', 'Администратор (HR · может изменять итоговые баллы)'],
  'login.pwIs': ['비밀번호는 본인의 사번입니다.', 'Your password is your employee ID.', 'Ваш пароль — это ваш табельный номер.'],
  'login.pwHelp': ['사번을 모르거나 로그인이 되지 않으면 인사 관리자에게 문의해 주세요.', "If you don't know your employee ID or can't log in, please contact HR.", 'Если вы не знаете табельный номер или не можете войти, обратитесь в отдел кадров.'],

  // 메뉴
  'nav.myEval': ['내 평가', 'My Evaluations', 'Мои оценки'],
  'nav.logout': ['로그아웃', 'Log out', 'Выйти'],
  'nav.logoutAsk': ['로그아웃하시겠습니까?', 'Do you want to log out?', 'Выйти из системы?'],
  'nav.adminOnly': ['관리자만 사용할 수 있는 화면입니다.', 'This page is for administrators only.', 'Эта страница доступна только администраторам.'],

  // 내 평가
  'me.hello': ['안녕하세요, {name}님', 'Hello, {name}', 'Здравствуйте, {name}'],
  'me.screen': ['{role} 화면', '{role} view', 'Режим: {role}'],
  'me.deadline': ['마감 {date}', 'Deadline {date}', 'Срок: {date}'],
  'me.selfDesc': ['나의 업무 성과와 역량을 스스로 평가합니다.', 'Evaluate your own work performance and competencies.', 'Оцените свои результаты работы и компетенции.'],
  'me.selfWrite': ['자기평가 작성', 'Start self-evaluation', 'Заполнить самооценку'],
  'me.execSelfOff': ['임원 자기평가를 진행하지 않도록 설정되어 있습니다. 배정된 사원·팀장 평가는 그대로 진행해 주세요.', 'Executive self-evaluation is turned off. Please continue with the evaluations of your assigned employees and team leaders.', 'Самооценка руководителей высшего звена отключена. Продолжайте оценку назначенных вам сотрудников и руководителей команд.'],
  'me.noSelf': ['자기평가 대상이 아닙니다.', 'You are not subject to self-evaluation.', 'Самооценка для вас не предусмотрена.'],
  'me.received': ['내가 받는 평가 진행 상태', 'Status of evaluations about me', 'Статус оценок в отношении меня'],
  'me.colStage': ['평가 단계', 'Stage', 'Этап'],
  'me.colStatus': ['상태', 'Status', 'Статус'],
  'me.colSubmitted': ['제출', 'Submitted', 'Отправлено'],
  'me.noReceived': ['받는 평가가 없습니다.', 'There are no evaluations about you.', 'Оценок в отношении вас нет.'],
  'me.scoreHidden': ['평가 점수와 등급은 공개 정책이 정해지지 않아 이 화면에 표시하지 않습니다.', 'Scores and grades are not shown here because the disclosure policy has not been decided.', 'Баллы и оценки здесь не отображаются, так как правила их раскрытия ещё не определены.'],
  'me.membersAnon': ['팀원평가는 제출 수만 보이며 누가 평가했는지는 표시하지 않습니다.', 'For team member evaluations, only the number of submissions is shown, not who submitted them.', 'Для оценки членами команды показывается только количество отправленных оценок, без указания оценивающих.'],
  'me.nSubmitted': ['{done} / {total} 제출', '{done} / {total} submitted', 'Отправлено: {done} / {total}'],
  'me.noTasks': ['자기평가 외에 나에게 배정된 평가가 없습니다.', 'You have no assigned evaluations other than your self-evaluation.', 'Кроме самооценки, у вас нет назначенных оценок.'],
  'me.execNoTasks': ['아직 나에게 배정된 평가 대상자가 없습니다. 관리자가 배정하면 여기에 표시됩니다.', 'No one has been assigned to you yet. They will appear here once the administrator assigns them.', 'Вам пока никто не назначен. Сотрудники появятся здесь после назначения администратором.'],
  'me.teamProgress': ['팀원별 평가 진행 상황', 'Progress by team member', 'Ход оценки по членам команды'],
  'me.colMember': ['팀원', 'Team member', 'Член команды'],
  'me.colMemberSelf': ['팀원 자기평가', 'Member self-evaluation', 'Самооценка члена команды'],
  'me.colMine': ['내가 하는 팀원 평가', 'My evaluation', 'Моя оценка'],
  'col.name': ['이름', 'Name', 'Имя'],
  'col.team': ['소속', 'Team', 'Подразделение'],
  'col.position': ['직급', 'Position', 'Должность'],
  'col.role': ['역할', 'Role', 'Роль'],
  'act.todo': ['평가하기', 'Evaluate', 'Оценить'],
  'act.progress': ['이어서 작성', 'Continue', 'Продолжить'],
  'act.done': ['제출 내용 보기', 'View submission', 'Просмотреть ответ'],
  'grp.leader': ['팀원 평가', 'Evaluate team members', 'Оценка членов команды'],
  'grp.leader.desc': ['소속 팀원의 업무 수행을 평가합니다(팀장평가).', 'Evaluate the work of your team members (leader evaluation).', 'Оцените работу членов вашей команды (оценка руководителем команды).'],
  'grp.upward': ['담당 임원 평가', 'Evaluate your executive', 'Оценка руководителя высшего звена'],
  'grp.upward.desc': ['담당 임원의 리더십을 평가합니다(상향평가).', 'Evaluate the leadership of your assigned executive (upward evaluation).', 'Оцените лидерские качества закреплённого за вами руководителя (оценка снизу вверх).'],
  'grp.members': ['팀장 평가', 'Evaluate your team leader', 'Оценка руководителя команды'],
  'grp.members.desc': ['소속 팀장의 업무 수행을 평가합니다(팀원평가).', 'Evaluate the work of your team leader (team member evaluation).', 'Оцените работу руководителя вашей команды (оценка членами команды).'],
  'grp.execMember': ['배정된 사원 평가', 'Evaluate assigned employees', 'Оценка назначенных сотрудников'],
  'grp.execMember.desc': ['나에게 배정된 사원을 평가합니다(필수).', 'Evaluate the employees assigned to you (required).', 'Оцените назначенных вам сотрудников (обязательно).'],
  'grp.execLeader': ['배정된 팀장 평가', 'Evaluate assigned team leaders', 'Оценка назначенных руководителей команд'],
  'grp.execLeader.desc': ['나에게 배정된 팀장을 평가합니다(필수).', 'Evaluate the team leaders assigned to you (required).', 'Оцените назначенных вам руководителей команд (обязательно).'],

  // 평가 작성
  'ev.notAssigned': ['나에게 배정되지 않은 평가입니다.', 'This evaluation is not assigned to you.', 'Эта оценка вам не назначена.'],
  'ev.back': ['내 평가로 돌아가기', 'Back to My Evaluations', 'Вернуться к моим оценкам'],
  'ev.titleOther': ['{name}님 {stage}', '{stage}: {name}', '{stage}: {name}'],
  'ev.submitted': ['제출 완료', 'Submitted', 'Отправлено'],
  'ev.writing': ['작성 중', 'In progress', 'Заполняется'],
  'ev.target': ['평가 대상자', 'Person being evaluated', 'Оцениваемый сотрудник'],
  'ev.period': ['평가 기간', 'Evaluation period', 'Период оценки'],
  'ev.deadline': ['마감일', 'Deadline', 'Срок'],
  'ev.membersNote': ['팀원평가는 팀장의 업무 수행을 평가합니다. 평가자 이름은 팀장에게 공개되지 않습니다.', "Team member evaluation assesses the team leader's work. Your name will not be shown to the team leader.", 'Оценка членами команды касается работы руководителя команды. Ваше имя руководителю не показывается.'],
  'ev.submittedAt': ['{date}에 제출했습니다. 제출한 평가는 고칠 수 없습니다.', 'Submitted on {date}. A submitted evaluation cannot be changed.', 'Отправлено {date}. Отправленную оценку нельзя изменить.'],
  'ev.dirty': ['저장하지 않은 변경이 있습니다.', 'You have unsaved changes.', 'Есть несохранённые изменения.'],
  'ev.clean': ['저장된 상태입니다.', 'All changes are saved.', 'Все изменения сохранены.'],
  'ev.draft': ['임시 저장', 'Save draft', 'Сохранить черновик'],
  'ev.submit': ['제출', 'Submit', 'Отправить'],
  'ev.draftSaved': ['임시 저장했습니다. 제출 전까지 계속 고칠 수 있습니다.', 'Draft saved. You can keep editing until you submit.', 'Черновик сохранён. Его можно изменять до отправки.'],
  'ev.saveFail': ['저장하지 못했습니다: {msg}', 'Could not save: {msg}', 'Не удалось сохранить: {msg}'],
  'ev.problems': ['미응답 또는 확인이 필요한 문항이 {n}개 있습니다.', '{n} question(s) are unanswered or need checking.', 'Вопросов без ответа или требующих проверки: {n}.'],
  'ev.confirmTitle': ['평가 제출', 'Submit evaluation', 'Отправка оценки'],
  'ev.confirmMsg': ['제출하면 더 이상 고칠 수 없습니다. 제출하시겠습니까?\n(수정이 필요하면 관리자에게 제출 삭제를 요청한 뒤 처음부터 다시 응답해야 합니다)', 'Once submitted, it can no longer be changed. Submit now?\n(To make changes, ask the administrator to delete the submission, then answer again from the beginning.)', 'После отправки оценку нельзя будет изменить. Отправить?\n(Чтобы внести изменения, попросите администратора удалить отправленную оценку и заполните её заново.)'],
  'ev.sent': ['평가를 제출했습니다.', 'Evaluation submitted.', 'Оценка отправлена.'],
  'ev.submitFail': ['제출하지 못했습니다: {msg}', 'Could not submit: {msg}', 'Не удалось отправить: {msg}'],
  'ev.leaveTitle': ['저장하지 않은 내용', 'Unsaved changes', 'Несохранённые изменения'],
  'ev.leaveMsg': ['저장하지 않은 응답이 있습니다. 나가면 사라집니다.', 'You have unsaved answers. They will be lost if you leave.', 'Есть несохранённые ответы. При выходе они будут потеряны.'],
  'ev.leave': ['나가기', 'Leave', 'Выйти'],
  'ev.errNotAssigned': ['배정되지 않은 평가입니다.', 'This evaluation is not assigned to you.', 'Эта оценка вам не назначена.'],
  'ev.errSubmitted': ['이미 제출한 평가입니다.', 'This evaluation has already been submitted.', 'Эта оценка уже отправлена.'],
  'v.required': ["'{q}' 문항에 응답해 주세요.", "Please answer '{q}'.", 'Ответьте на вопрос «{q}».'],
  'v.choiceChanged': ["'{q}' 문항의 선택지가 바뀌었습니다. 다시 선택해 주세요.", "The options for '{q}' have changed. Please choose again.", 'Варианты ответа на вопрос «{q}» изменились. Выберите снова.'],
  'v.tooLong': ["'{q}' 문항은 {n}자까지 입력할 수 있습니다.", "The answer to '{q}' can be up to {n} characters.", 'Ответ на вопрос «{q}» может содержать не более {n} символов.'],

  // 문항 응답
  'as.empty': ['이 평가 단계에 등록된 문항이 없습니다.', 'No questions are registered for this stage.', 'Для этого этапа нет вопросов.'],
  'as.points': ['배점 {n}점', '{n} points', 'Баллы: {n}'],
  'as.required': ['필수', 'Required', 'Обязательно'],
  'as.unanswered': ['미응답', 'No answer', 'Нет ответа'],
  'as.unknownChoice': ['(알 수 없는 선택지)', '(unknown option)', '(неизвестный вариант)'],
  'as.deletedChoice': ['{label} (삭제된 선택지)', '{label} (deleted option)', '{label} (удалённый вариант)'],
  'as.choiceGone': ["전에 고른 '{label}'은(는) 더 이상 쓸 수 없습니다. 다시 선택해 주세요.", "The option you chose earlier, '{label}', is no longer available. Please choose again.", 'Ранее выбранный вариант «{label}» больше недоступен. Выберите снова.'],
  'as.shortPh': ['짧게 입력하세요', 'Enter a short answer', 'Введите краткий ответ'],
  'as.longPh': ['자세히 입력하세요', 'Enter a detailed answer', 'Введите развёрнутый ответ'],
  'as.chars': ['{n} / {max}자', '{n} / {max} characters', 'Символов: {n} / {max}'],

  // 평가 단계·역할·상태·답변 유형
  'stage.self': ['자기평가', 'Self-evaluation', 'Самооценка'],
  'stage.leader': ['팀장평가', 'Leader evaluation', 'Оценка руководителем команды'],
  'stage.members': ['팀원평가', 'Team member evaluation', 'Оценка членами команды'],
  'stage.exec': ['임원평가', 'Executive evaluation', 'Оценка руководителем высшего звена'],
  'stage.upward': ['상향평가', 'Upward evaluation', 'Оценка снизу вверх'],
  'evaluator.self': ['본인', 'Yourself', 'Сам сотрудник'],
  'evaluator.leader': ['소속 팀장', 'Team leader', 'Руководитель команды'],
  'evaluator.members': ['소속 팀원', 'Team members', 'Члены команды'],
  'evaluator.exec': ['배정된 임원', 'Assigned executive', 'Назначенный руководитель'],
  'evaluator.upward': ['담당 임원이 배정된 팀장', 'Team leaders assigned to the executive', 'Руководители команд, закреплённые за руководителем'],
  'role.member': ['사원', 'Employee', 'Сотрудник'],
  'role.leader': ['팀장', 'Team leader', 'Руководитель команды'],
  'role.exec': ['임원', 'Executive', 'Руководитель высшего звена'],
  'status.todo': ['시작 전', 'Not started', 'Не начато'],
  'status.progress': ['진행 중', 'In progress', 'В процессе'],
  'status.done': ['완료', 'Completed', 'Завершено'],
  'status.unassigned': ['배정 필요', 'Needs assignment', 'Требуется назначение'],
  'status.off': ['해당 없음', 'N/A', 'Не применяется'],
  'type.short': ['주관식', 'Short answer', 'Краткий ответ'],
  'type.long': ['서술형', 'Long answer', 'Развёрнутый ответ'],
  'type.choice': ['객관식', 'Multiple choice', 'Выбор варианта'],
}
const IDX = { ko: 0, en: 1, ru: 2 }

export function t(key, params = {}) {
  const e = MESSAGES[key]
  const s = e ? (e[IDX[curLang()]] ?? e[0]) : key
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}
export const stageName = (k) => (MESSAGES[`stage.${k}`] ? t(`stage.${k}`) : k)
export const evaluatorName = (k) => (MESSAGES[`evaluator.${k}`] ? t(`evaluator.${k}`) : k)
export const roleName = (k) => (MESSAGES[`role.${k}`] ? t(`role.${k}`) : k)
export const statusName = (k) => (MESSAGES[`status.${k}`] ? t(`status.${k}`) : k)
export const answerTypeName = (k) => (MESSAGES[`type.${k}`] ? t(`type.${k}`) : k)

// 관리자가 입력한 데이터(평가 항목·문항·선택지·부서·직급) 번역.
// 지금 등록된 문항과 샘플 CSV 문항을 담았다. 없는 문구는 입력한 그대로(한국어) 보여준다.
const DATA = {
  // 평가 항목
  '업무 성과': ['Work Performance', 'Результаты работы'],
  '협업과 소통': ['Collaboration & Communication', 'Сотрудничество и коммуникация'],
  '역량 개발': ['Competency Development', 'Развитие компетенций'],
  '리더십': ['Leadership', 'Лидерство'],
  '경영 리더십': ['Executive Leadership', 'Управленческое лидерство'],
  '종합 의견': ['Overall Comments', 'Общий отзыв'],
  // 문항
  '목표한 업무를 기한 안에 달성했다.': ['Achieved the planned work within the deadline.', 'Выполнил(а) запланированные задачи в срок.'],
  '업무 결과물의 품질이 기대 수준을 충족했다.': ['The quality of work output met expectations.', 'Качество результатов работы соответствовало ожиданиям.'],
  '동료와 원활하게 소통한다.': ['Communicates smoothly with colleagues.', 'Эффективно общается с коллегами.'],
  '팀 목표 달성을 위해 적극적으로 협력한다.': ['Actively cooperates to achieve team goals.', 'Активно сотрудничает для достижения целей команды.'],
  '직무 역량을 높이기 위해 꾸준히 노력했다.': ['Made consistent efforts to improve job skills.', 'Постоянно работал(а) над повышением профессиональных компетенций.'],
  '올해 가장 큰 성과를 한 줄로 적어 주세요.': ['Describe your biggest achievement this year in one line.', 'Опишите в одной строке главное достижение этого года.'],
  '팀원에게 업무 방향을 명확하게 제시한다.': ['Gives team members clear direction for their work.', 'Чётко задаёт направление работы членам команды.'],
  '팀원의 의견을 경청하고 성장을 지원한다.': ["Listens to team members' opinions and supports their growth.", 'Прислушивается к мнению членов команды и поддерживает их развитие.'],
  '조직의 방향과 목표를 분명하게 제시한다.': ["Clearly sets the organization's direction and goals.", 'Чётко определяет направление и цели организации.'],
  '팀장의 의견을 듣고 필요한 지원을 한다.': ['Listens to team leaders and provides the support they need.', 'Прислушивается к руководителям команд и оказывает необходимую поддержку.'],
  '강점과 보완할 점을 자유롭게 적어 주세요.': ['Feel free to describe strengths and areas for improvement.', 'Опишите сильные стороны и то, что стоит улучшить.'],
  // 선택지
  '매우 그렇다': ['Strongly agree', 'Полностью согласен(на)'],
  '그렇다': ['Agree', 'Согласен(на)'],
  '보통이다': ['Neutral', 'Нейтрально'],
  '그렇지 않다': ['Disagree', 'Не согласен(на)'],
  '전혀 그렇지 않다': ['Strongly disagree', 'Совершенно не согласен(на)'],
  // 부서
  '생산팀': ['Production Team', 'Производственный отдел'],
  '관리팀': ['Administration Team', 'Административный отдел'],
  '경영진': ['Executives', 'Руководство'],
  '경영기획팀': ['Corporate Planning Team', 'Отдел стратегического планирования'],
  '설계팀': ['Design Team', 'Конструкторский отдел'],
  '현장팀': ['Field Operations Team', 'Отдел полевых работ'],
  // 직급
  '사원': ['Staff', 'Специалист'],
  '주임': ['Associate', 'Старший специалист'],
  '대리': ['Assistant Manager', 'Ведущий специалист'],
  '과장': ['Manager', 'Менеджер'],
  '차장': ['Deputy General Manager', 'Заместитель начальника отдела'],
  '팀장': ['Team Leader', 'Руководитель команды'],
  '이사': ['Director', 'Директор'],
  '상무': ['Managing Director', 'Управляющий директор'],
  '전무': ['Senior Managing Director', 'Старший управляющий директор'],
  '임원': ['Executive', 'Руководитель высшего звена'],
}

// 회차 이름 예: '2026년 하반기 정기평가'
function periodText(s, lang) {
  const m = /^(\d{4})년 (상|하)반기 (정기|수시)평가(.*)$/.exec(s)
  if (!m) return null
  const [, y, half, kind, rest] = m
  const h = half === '상' ? 1 : 2
  if (lang === 'en') return `${y} H${h} ${kind === '정기' ? 'Regular' : 'Ad-hoc'} Review${rest}`
  return `${kind === '정기' ? 'Плановая' : 'Внеплановая'} оценка, ${h}-е полугодие ${y} г.${rest}`
}

export function dt(text) {
  const lang = curLang()
  if (lang === 'ko' || text === null || text === undefined) return text
  const s = String(text)
  return DATA[s.trim()]?.[IDX[lang] - 1] ?? periodText(s, lang) ?? s
}
