const DAILY_REPORT_HANDLER = 'sendDailyJobReport';
const LAST_DAILY_REPORT_DATE = 'LAST_DAILY_REPORT_DATE';
const SERVICE_URL = 'https://apply.k-bigdata.kr/';

function setupDailyReportSettings() {
  const sheet = sheet_(SHEETS.SETTINGS, SETTINGS_HEADERS);
  const existing = getSettings_();
  const defaults = [
    ['report_enabled', 'TRUE'],
    ['report_email', ''],
    ['report_subject_prefix', '취업지원현황']
  ].filter(function(row) { return typeof existing[row[0]] === 'undefined'; });
  if (defaults.length) sheet.getRange(sheet.getLastRow() + 1, 1, defaults.length, 2).setValues(defaults);
  return { added: defaults.map(function(row) { return row[0]; }) };
}

function getDailyReportData() {
  const now = new Date();
  const settings = getSettings_();
  const weeklyGoal = positiveInteger_(settings.weekly_goal, 5);
  const students = getStudents_().filter(function(student) { return student.active; });
  const studentNames = {};
  students.forEach(function(student) { studentNames[student.student_id] = student.name; });
  const applications = getApplications_().filter(function(app) {
    return app.status === 'ACTIVE' && Object.prototype.hasOwnProperty.call(studentNames, app.student_id);
  });
  const week = getWeeklyRange(now);
  const yesterday = getYesterdayRange(now);
  const weekly = applications.filter(function(app) {
    const date = dateOnly_(app.applied_date);
    return date >= week.start && date <= week.end;
  });
  const counts = {};
  weekly.forEach(function(app) { counts[app.student_id] = (counts[app.student_id] || 0) + 1; });
  const studentRows = students.map(function(student) {
    const count = counts[student.student_id] || 0;
    return {
      name: student.name,
      count: count,
      goal: weeklyGoal,
      shortage: Math.max(0, weeklyGoal - count),
      achieved: count >= weeklyGoal
    };
  });
  const yesterdayNew = applications.filter(function(app) {
    const created = timestamp_(app.created_at);
    return created >= yesterday.start.getTime() && created <= yesterday.end.getTime();
  }).sort(function(a, b) { return timestamp_(b.created_at) - timestamp_(a.created_at); }).map(function(app) {
    return {
      studentName: studentNames[app.student_id], company: app.company, position: app.position,
      site: app.site, jobUrl: app.job_url, appliedDate: formatDate_(dateOnly_(app.applied_date))
    };
  });
  const achieved = studentRows.filter(function(row) { return row.achieved; });
  const below = studentRows.filter(function(row) { return !row.achieved; });
  const zero = studentRows.filter(function(row) { return row.count === 0; });
  const companies = {};
  weekly.forEach(function(app) { if (String(app.company).trim()) companies[String(app.company).trim().toLowerCase()] = true; });
  return {
    now: now, settings: settings, weeklyGoal: weeklyGoal, departmentGoal: students.length * weeklyGoal,
    weeklyCount: weekly.length, activeStudentCount: students.length, achievedCount: achieved.length,
    belowCount: below.length, zeroCount: zero.length, participatedCount: students.length - zero.length,
    uniqueCompanyCount: Object.keys(companies).length,
    average: students.length ? (weekly.length / students.length).toFixed(1) : '0.0',
    students: studentRows, yesterdayNew: yesterdayNew
  };
}

function getWeeklyRange(now) {
  return weekRange_(now);
}

function getYesterdayRange(now) {
  const dateText = Utilities.formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000), TIMEZONE, 'yyyy-MM-dd');
  const day = parseDate_(dateText);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return { start: start, end: end };
}

function sendDailyJobReport() {
  const now = new Date();
  const day = Number(Utilities.formatDate(now, TIMEZONE, 'u'));
  if (day >= 6) { console.log('주말에는 일일 보고 메일을 발송하지 않습니다.'); return; }
  const settings = getSettings_();
  if (!boolean_(settings.report_enabled)) { console.log('report_enabled가 FALSE이므로 발송하지 않습니다.'); return; }
  const email = String(settings.report_email || '').trim();
  if (!email) { console.log('report_email이 비어 있어 발송하지 않습니다.'); return; }
  const today = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(LAST_DAILY_REPORT_DATE) === today) { console.log('오늘 보고 메일이 이미 발송되었습니다.'); return; }
  try {
    sendReport_(day === 5 ? 'friday' : 'weekday', false);
    properties.setProperty(LAST_DAILY_REPORT_DATE, today);
  } catch (error) {
    console.error('일일 보고 메일 발송 실패: ' + (error.stack || error));
    throw error;
  }
}

function sendDailyJobReportTest() {
  const day = Number(Utilities.formatDate(new Date(), TIMEZONE, 'u'));
  sendReport_(day === 5 ? 'friday' : 'weekday', true);
}

function sendWeekdayReportTest() { sendReport_('weekday', true); }
function sendFridayReportTest() { sendReport_('friday', true); }

function sendReport_(type, isTest) {
  const data = getDailyReportData();
  const email = String(data.settings.report_email || '').trim();
  if (!email) throw new Error('settings 시트의 report_email을 입력해 주세요.');
  const prefix = String(data.settings.report_subject_prefix || '취업지원현황').trim();
  const subject = (isTest ? '[TEST] ' : '') + buildReportSubject_(data, type, prefix);
  const html = type === 'friday' ? buildFridayReportHtml(data) : buildWeekdayReportHtml(data);
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, body: stripHtml_(html), name: 'BigData Job Apply' });
  console.log((isTest ? '테스트' : '자동') + ' 보고 메일 발송 완료: ' + email);
}

function buildReportSubject_(data, type, prefix) {
  if (type === 'friday') return '[금요일 최종점검] 목표미달 ' + data.belowCount + '명 · 지원0건 ' + data.zeroCount + '명 · 이번 주 ' + data.weeklyCount + '건';
  const date = Utilities.formatDate(data.now, TIMEZONE, 'M/d');
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const weekday = weekdays[Number(Utilities.formatDate(data.now, TIMEZONE, 'u')) % 7];
  return '[' + prefix + '] ' + date + '(' + weekday + ') 이번 주 ' + data.weeklyCount + '건 · 목표미달 ' + data.belowCount + '명 · 지원0건 ' + data.zeroCount + '명';
}

function buildWeekdayReportHtml(data) {
  return reportShell_(
    '<p style="margin:0 0 4px;color:#3157d5;font-size:13px;font-weight:700;">빅데이터소프트웨어공학과</p>' +
    '<h1 style="margin:0;font-size:25px;color:#18213a;">취업지원 현황</h1>' + reportTime_(data.now) +
    summaryCards_(data, true) +
    sectionTitle_('관리 필요 학생') + belowStudentsHtml_(data, false) +
    sectionTitle_('어제 새로 등록된 입사지원') + yesterdayHtml_(data) +
    sectionTitle_('학생별 이번 주 지원 현황') + allStudentsHtml_(data) +
    footerHtml_('학생들의 입사지원 진행상황을 꾸준히 확인해 주세요.')
  );
}

function buildFridayReportHtml(data) {
  const achieved = data.students.filter(function(row) { return row.achieved; }).sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ko'); });
  const achievedHtml = achieved.length ? achieved.map(function(row) {
    return '<span style="display:inline-block;margin:0 6px 8px 0;padding:8px 11px;background:#eaf7f0;border-radius:8px;color:#126b49;font-weight:700;">' + escapeHtml_(row.name) + ' ' + row.count + '건</span>';
  }).join('') : '<p style="color:#687087;">아직 목표를 달성한 학생이 없습니다.</p>';
  return reportShell_(
    '<p style="margin:0 0 4px;color:#b23845;font-size:13px;font-weight:700;">빅데이터소프트웨어공학과</p>' +
    '<h1 style="margin:0;font-size:25px;color:#18213a;">취업지원 주간 최종 점검</h1>' +
    '<p style="margin:10px 0;color:#687087;">오늘은 이번 주 취업지원 목표를 최종 확인하는 날입니다.</p>' + reportTime_(data.now) +
    summaryCards_(data, false) +
    sectionTitle_('면담·독려 우선 학생') + belowStudentsHtml_(data, true) +
    sectionTitle_('이번 주 목표 달성 학생') + '<div style="padding:16px;background:#fff;border-radius:14px;">' + achievedHtml + '</div>' +
    sectionTitle_('이번 주 지원 요약') + weeklySummaryHtml_(data) +
    footerHtml_('주간 목표를 달성하지 못한 학생은 입사지원 상황을 확인하고 필요 시 면담을 진행합니다.')
  );
}

function reportShell_(body) {
  return '<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,\'Noto Sans KR\',sans-serif;color:#18213a;">' +
    '<div style="max-width:660px;margin:0 auto;padding:24px 14px;">' + body + '</div></body></html>';
}

function reportTime_(now) { return '<p style="margin:8px 0 20px;color:#687087;font-size:13px;">' + Utilities.formatDate(now, TIMEZONE, 'yyyy.MM.dd') + ' 오전 8시 기준</p>'; }
function sectionTitle_(title) { return '<h2 style="margin:26px 0 12px;font-size:18px;color:#18213a;">' + title + '</h2>'; }

function summaryCards_(data, includeYesterday) {
  const cards = [
    ['이번 주 전체 지원', data.weeklyCount + '건 / 목표 ' + data.departmentGoal + '건'],
    ['목표 달성', data.achievedCount + '명'], ['목표 미달', data.belowCount + '명'], ['지원 0건', data.zeroCount + '명']
  ];
  if (includeYesterday) cards.push(['전일 신규 등록', data.yesterdayNew.length + '건']);
  return '<div style="font-size:0;margin:0 -4px;">' + cards.map(function(card) {
    return '<div style="display:inline-block;vertical-align:top;width:50%;box-sizing:border-box;padding:4px;">' +
      '<div style="background:#fff;border:1px solid #e5e8f0;border-radius:13px;padding:15px;">' +
      '<div style="font-size:12px;color:#687087;">' + card[0] + '</div><div style="margin-top:6px;font-size:20px;font-weight:700;color:#203a8f;">' + card[1] + '</div></div></div>';
  }).join('') + '</div>';
}

function belowStudentsHtml_(data, friday) {
  const rows = data.students.filter(function(row) { return !row.achieved; }).sort(function(a, b) {
    if ((a.count === 0) !== (b.count === 0)) return a.count === 0 ? -1 : 1;
    return b.shortage - a.shortage || a.name.localeCompare(b.name, 'ko');
  });
  if (!rows.length) return '<div style="padding:18px;background:#eaf7f0;border-radius:13px;color:#126b49;font-weight:700;">모든 학생이 이번 주 목표를 달성했습니다.</div>';
  return rows.map(function(row) {
    const urgent = row.count === 0;
    const status = friday ? (urgent ? '면담 우선' : row.shortage === 1 ? '오늘 추가 지원 권고' : '독려 필요') : (urgent ? '지원 필요' : row.shortage === 1 ? '목표 임박' : '진행 중');
    return '<div style="margin-bottom:8px;padding:14px 15px;background:' + (urgent ? '#fff0f1' : '#fff7e6') + ';border-left:4px solid ' + (urgent ? '#d94a59' : '#e3a22b') + ';border-radius:10px;">' +
      '<div style="font-size:16px;font-weight:700;">' + escapeHtml_(row.name) + '</div>' +
      '<div style="margin-top:5px;font-size:13px;color:#555f75;">이번 주 ' + row.count + ' / ' + row.goal + '건 · ' + row.shortage + '건 부족</div>' +
      '<div style="margin-top:5px;font-size:13px;font-weight:700;color:' + (urgent ? '#b23845' : '#9a6815') + ';">' + status + '</div></div>';
  }).join('');
}

function yesterdayHtml_(data) {
  if (!data.yesterdayNew.length) return '<div style="padding:18px;background:#fff;border-radius:13px;color:#687087;">어제 새롭게 등록된 입사지원이 없습니다.</div>';
  return data.yesterdayNew.map(function(app) {
    const link = /^https?:\/\/[^\s]+$/i.test(app.jobUrl) ? '<a href="' + escapeHtml_(app.jobUrl) + '" style="display:inline-block;margin-top:10px;padding:8px 12px;background:#3157d5;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;">채용공고 보기</a>' : '';
    return '<div style="margin-bottom:8px;padding:15px;background:#fff;border:1px solid #e5e8f0;border-radius:12px;">' +
      '<div style="font-size:13px;color:#3157d5;font-weight:700;">' + escapeHtml_(app.studentName) + '</div>' +
      '<div style="margin-top:7px;font-size:16px;font-weight:700;">' + escapeHtml_(app.company) + '</div>' +
      '<div style="margin-top:3px;font-size:13px;color:#687087;">' + escapeHtml_(app.position) + ' · ' + escapeHtml_(app.site) + ' · 지원일 ' + app.appliedDate + '</div>' + link + '</div>';
  }).join('');
}

function allStudentsHtml_(data) {
  return data.students.slice().sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ko'); }).map(function(row) {
    const color = row.achieved ? '#126b49' : row.count === 0 ? '#b23845' : '#9a6815';
    const background = row.achieved ? '#eaf7f0' : row.count === 0 ? '#fff0f1' : '#fff7e6';
    const text = row.achieved ? '목표 달성' : row.shortage + '건 남음';
    return '<div style="display:flex;align-items:center;margin-bottom:7px;padding:12px 14px;background:' + background + ';border-radius:10px;">' +
      '<strong style="flex:1;">' + escapeHtml_(row.name) + '</strong><span style="margin-right:12px;font-weight:700;">' + row.count + ' / ' + row.goal + '건</span><span style="font-size:12px;color:' + color + ';font-weight:700;">' + text + '</span></div>';
  }).join('');
}

function weeklySummaryHtml_(data) {
  const items = [['이번 주 전체 지원', data.weeklyCount + '건'], ['지원 참여 학생', data.participatedCount + '명'], ['지원 0건 학생', data.zeroCount + '명'], ['목표 달성 학생', data.achievedCount + '명'], ['목표 미달 학생', data.belowCount + '명'], ['서로 다른 기업', data.uniqueCompanyCount + '개'], ['학생 1인당 평균', data.average + '건']];
  return '<div style="padding:8px 16px;background:#fff;border-radius:13px;">' + items.map(function(item) {
    return '<div style="display:flex;padding:10px 0;border-bottom:1px solid #edf0f5;"><span style="flex:1;color:#687087;">' + item[0] + '</span><strong>' + item[1] + '</strong></div>';
  }).join('') + '</div>';
}

function footerHtml_(message) {
  return '<div style="margin-top:28px;text-align:center;"><a href="' + SERVICE_URL + '" style="display:block;padding:15px;background:#3157d5;color:#fff;text-decoration:none;border-radius:11px;font-weight:700;">취업지원 현황 확인하기</a>' +
    '<p style="margin:14px 8px;color:#687087;font-size:12px;line-height:1.6;">' + message + '</p></div>';
}

function createDailyReportTrigger() {
  deleteDailyReportTriggers();
  ScriptApp.newTrigger(DAILY_REPORT_HANDLER).timeBased().atHour(8).nearMinute(0).everyDays(1).inTimezone(TIMEZONE).create();
  console.log('평일 오전 8시 전후 일일 보고 트리거를 생성했습니다.');
}

function deleteDailyReportTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === DAILY_REPORT_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
}

function escapeHtml_(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stripHtml_(html) {
  return String(html).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
