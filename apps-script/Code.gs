const SPREADSHEET_ID = '여기에_구글시트_ID';
const TIMEZONE = 'Asia/Seoul';
const SHEETS = { STUDENTS: 'students', APPLICATIONS: 'applications', SETTINGS: 'settings' };
const STUDENT_HEADERS = ['student_id', 'name', 'pin', 'active'];
const APPLICATION_HEADERS = ['application_id', 'student_id', 'company', 'position', 'site', 'job_url', 'applied_date', 'status', 'created_at', 'updated_at'];
const SETTINGS_HEADERS = ['key', 'value'];
const ALLOWED_SITES = ['사람인', '잡코리아', '원티드', '고용24', '기업 채용사이트', '기타'];

function doGet(e) {
  return handleRequest_(e, 'GET');
}

function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    const params = (e && e.parameter) || {};
    const action = String(params.action || 'dashboard');
    let data;
    if (method === 'GET' && action === 'dashboard') data = getDashboard_();
    else if (method === 'GET' && action === 'students') data = getPublicStudents_();
    else if (method === 'POST' && action === 'create') data = createApplication_(params);
    else if (method === 'POST' && action === 'delete') data = deleteApplication_(params);
    else throw new Error('지원하지 않는 요청입니다.');
    return json_({ success: true, data: data });
  } catch (error) {
    console.error(error.stack || error);
    return json_({ success: false, message: safeMessage_(error) });
  }
}

function setupSheets() {
  const ss = spreadsheet_();
  const students = ensureSheet_(ss, SHEETS.STUDENTS, STUDENT_HEADERS);
  const applications = ensureSheet_(ss, SHEETS.APPLICATIONS, APPLICATION_HEADERS);
  const settings = ensureSheet_(ss, SHEETS.SETTINGS, SETTINGS_HEADERS);
  if (students.getLastRow() === 1) {
    const rows = [
      ['2320110198', '신동준', '', true], ['2520110177', '김동휘', '', true],
      ['2520110180', '김예가', '', true], ['2520110181', '김현규', '', true],
      ['2520110184', '박준영', '', true], ['2520110185', '박혜란', '', true],
      ['2520110187', '배준수', '', true], ['2520110189', '양준모', '', true],
      ['2520110192', '유호민', '', true], ['2520110194', '윤현섭', '', true],
      ['2520110195', '이민서', '', true], ['2520110199', '정대현', '', true],
      ['2520110202', '최준영', '', true]
    ];
    students.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  if (settings.getLastRow() === 1) settings.getRange(2, 1, 2, 2).setValues([['weekly_goal', 5], ['semester', '2026-2']]);
  [students, applications, settings].forEach(function(sheet) {
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#3157d5').setFontColor('#ffffff');
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });
}

function getDashboard_() {
  const students = getStudents_().filter(function(student) { return student.active; });
  const settings = getSettings_();
  const weeklyGoal = positiveInteger_(settings.weekly_goal, 5);
  const range = weekRange_(new Date());
  const applications = getApplications_().filter(function(app) { return app.status === 'ACTIVE'; });
  const weeklyApps = applications.filter(function(app) {
    const date = dateOnly_(app.applied_date);
    return date >= range.start && date <= range.end;
  });
  const counts = {};
  weeklyApps.forEach(function(app) { counts[app.student_id] = (counts[app.student_id] || 0) + 1; });
  const studentRows = students.map(function(student) {
    return { studentId: student.student_id, name: student.name, weeklyCount: counts[student.student_id] || 0, weeklyGoal: weeklyGoal };
  }).sort(function(a, b) { return b.weeklyCount - a.weeklyCount || a.name.localeCompare(b.name, 'ko'); });
  const names = {};
  students.forEach(function(student) { names[student.student_id] = student.name; });
  const recent = applications.slice().sort(function(a, b) {
    return timestamp_(b.created_at) - timestamp_(a.created_at);
  }).slice(0, 20).map(function(app) { return publicApplication_(app, names[app.student_id] || '알 수 없음'); });
  return {
    summary: { weeklyCount: weeklyApps.length, weeklyGoal: students.length * weeklyGoal, activeStudentCount: students.length, perStudentGoal: weeklyGoal, weekStart: formatDate_(range.start), weekEnd: formatDate_(range.end) },
    students: studentRows,
    recent: recent
  };
}

function getPublicStudents_() {
  return getStudents_().filter(function(student) { return student.active; }).map(function(student) {
    return { studentId: student.student_id, name: student.name };
  });
}

function createApplication_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const studentId = required_(params.student_id, '학생을 선택해 주세요.');
    const company = limited_(params.company, '기업명', 100);
    const position = limited_(params.position, '지원직무', 100);
    const site = required_(params.site, '지원사이트를 선택해 주세요.');
    const jobUrl = normalizeUrl_(params.job_url);
    const appliedDate = parseDate_(params.applied_date);
    if (ALLOWED_SITES.indexOf(site) === -1) throw new Error('올바른 지원사이트를 선택해 주세요.');
    const student = getStudents_().find(function(row) { return row.student_id === studentId && row.active; });
    if (!student) throw new Error('활성 학생을 찾을 수 없습니다.');
    const applications = getApplications_();
    const duplicate = applications.some(function(app) { return app.student_id === studentId && app.status === 'ACTIVE' && normalizeComparableUrl_(app.job_url) === normalizeComparableUrl_(jobUrl); });
    if (duplicate) throw new Error('이미 등록한 채용공고입니다.');
    const weeklyGoal = positiveInteger_(getSettings_().weekly_goal, 5);
    const range = weekRange_(new Date());
    const previousWeeklyCount = applications.filter(function(app) {
      const date = dateOnly_(app.applied_date);
      return app.student_id === studentId && app.status === 'ACTIVE' && date >= range.start && date <= range.end;
    }).length;
    const now = new Date();
    const row = [Utilities.getUuid(), studentId, company, position, site, jobUrl, formatDate_(appliedDate), 'ACTIVE', now, now];
    const sheet = sheet_(SHEETS.APPLICATIONS, APPLICATION_HEADERS);
    sheet.appendRow(row);
    return { applicationId: row[0], studentName: student.name, previousWeeklyCount: previousWeeklyCount, currentWeeklyCount: previousWeeklyCount + (appliedDate >= range.start && appliedDate <= range.end ? 1 : 0), weeklyGoal: weeklyGoal, goalAchievedNow: previousWeeklyCount < weeklyGoal && previousWeeklyCount + (appliedDate >= range.start && appliedDate <= range.end ? 1 : 0) >= weeklyGoal };
  } finally {
    lock.releaseLock();
  }
}

function deleteApplication_(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const applicationId = required_(params.application_id, '지원내역 정보가 없습니다.');
    const studentId = required_(params.student_id, '학생 정보가 없습니다.');
    const pin = String(params.pin || '').trim();
    if (!/^\d{4}$/.test(pin)) throw new Error('4자리 본인 확인번호를 입력해 주세요.');
    const students = getStudents_();
    const student = students.find(function(row) { return row.student_id === studentId && row.active; });
    if (!student || String(student.pin).trim() !== pin) throw new Error('본인 확인번호가 올바르지 않습니다.');
    const sheet = sheet_(SHEETS.APPLICATIONS, APPLICATION_HEADERS);
    const values = sheet.getDataRange().getValues();
    const headers = values[0];
    const idIndex = headers.indexOf('application_id');
    const studentIndex = headers.indexOf('student_id');
    const statusIndex = headers.indexOf('status');
    const updatedIndex = headers.indexOf('updated_at');
    let rowNumber = -1;
    for (let i = 1; i < values.length; i += 1) if (String(values[i][idIndex]) === applicationId) { rowNumber = i + 1; break; }
    if (rowNumber === -1) throw new Error('지원내역을 찾을 수 없습니다.');
    const row = values[rowNumber - 1];
    if (String(row[studentIndex]) !== studentId) throw new Error('해당 지원내역을 삭제할 권한이 없습니다.');
    if (String(row[statusIndex]).toUpperCase() !== 'ACTIVE') throw new Error('이미 삭제된 지원내역입니다.');
    sheet.getRange(rowNumber, statusIndex + 1).setValue('DELETED');
    sheet.getRange(rowNumber, updatedIndex + 1).setValue(new Date());
    return { applicationId: applicationId, status: 'DELETED' };
  } finally {
    lock.releaseLock();
  }
}

function getStudents_() {
  return records_(sheet_(SHEETS.STUDENTS, STUDENT_HEADERS)).map(function(row) {
    return { student_id: String(row.student_id).trim(), name: String(row.name).trim(), pin: String(row.pin).trim(), active: boolean_(row.active) };
  });
}

function getApplications_() {
  return records_(sheet_(SHEETS.APPLICATIONS, APPLICATION_HEADERS)).map(function(row) {
    return { application_id: String(row.application_id), student_id: String(row.student_id), company: String(row.company), position: String(row.position), site: String(row.site), job_url: String(row.job_url), applied_date: row.applied_date, status: String(row.status || '').toUpperCase(), created_at: row.created_at, updated_at: row.updated_at };
  });
}

function getSettings_() {
  const output = {};
  records_(sheet_(SHEETS.SETTINGS, SETTINGS_HEADERS)).forEach(function(row) { output[String(row.key)] = row.value; });
  return output;
}

function publicApplication_(app, studentName) {
  return { applicationId: app.application_id, studentId: app.student_id, studentName: studentName, company: app.company, position: app.position, site: app.site, jobUrl: normalizeUrl_(app.job_url), appliedDate: formatDate_(dateOnly_(app.applied_date)) };
}

function spreadsheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === '여기에_구글시트_ID') throw new Error('관리자가 Google Sheet ID를 설정해야 합니다.');
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(name, expectedHeaders) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error(name + ' 시트를 찾을 수 없습니다. setupSheets를 먼저 실행해 주세요.');
  const actual = sheet.getRange(1, 1, 1, expectedHeaders.length).getDisplayValues()[0];
  if (actual.join('|') !== expectedHeaders.join('|')) throw new Error(name + ' 시트의 헤더를 확인해 주세요.');
  return sheet;
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

function records_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(function(row) { return row.some(function(value) { return value !== ''; }); }).map(function(row) {
    const object = {}; headers.forEach(function(header, index) { object[header] = row[index]; }); return object;
  });
}

function weekRange_(now) {
  const today = dateOnly_(now);
  const day = today.getDay();
  const start = new Date(today); start.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: start, end: end };
}

function dateOnly_(value) {
  if (value instanceof Date && !isNaN(value)) return new Date(Number(Utilities.formatDate(value, TIMEZONE, 'yyyy')), Number(Utilities.formatDate(value, TIMEZONE, 'MM')) - 1, Number(Utilities.formatDate(value, TIMEZONE, 'dd')));
  return parseDate_(String(value));
}

function parseDate_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('지원일을 올바르게 입력해 주세요.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) throw new Error('지원일을 올바르게 입력해 주세요.');
  return date;
}

function formatDate_(date) { return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd'); }
function timestamp_(value) { const time = value instanceof Date ? value.getTime() : new Date(value).getTime(); return isNaN(time) ? 0 : time; }
function required_(value, message) { const text = String(value || '').trim(); if (!text) throw new Error(message); return text; }
function limited_(value, label, max) { const text = required_(value, label + '을(를) 입력해 주세요.'); if (text.length > max) throw new Error(label + '은(는) ' + max + '자 이내로 입력해 주세요.'); return text; }
function normalizeUrl_(value) { const url = required_(value, '채용공고 URL을 입력해 주세요.'); if (!/^https?:\/\/[^\s]+$/i.test(url)) throw new Error('URL은 http:// 또는 https://로 시작해야 합니다.'); return url; }
function normalizeComparableUrl_(value) { return String(value).trim().replace(/\/$/, '').toLowerCase(); }
function positiveInteger_(value, fallback) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : fallback; }
function boolean_(value) { return value === true || String(value).toUpperCase() === 'TRUE' || String(value) === '1'; }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
function safeMessage_(error) { const message = error && error.message ? error.message : '요청을 처리하지 못했습니다.'; return message.indexOf('Exception:') === 0 ? '서버 설정을 확인해 주세요.' : message; }
