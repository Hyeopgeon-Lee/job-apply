import { api } from './api.js?v=20261005-public-1';

const $ = (selector) => document.querySelector(selector);

document.addEventListener('DOMContentLoaded', () => {
  $('#applied-date').value = todayInSeoul();
  initRecruitmentPicker();
  $('#application-form').addEventListener('submit', submitApplication);
});

function initRecruitmentPicker() {
  const select = $('#recruitment');
  if (!select) return;

  const jobs = (window.K_BIGDATA_RECRUITMENTS || [])
    .filter((job) => job && job.active !== false)
    .sort((a, b) => String(a.company).localeCompare(String(b.company), 'ko'));

  if (!jobs.length) {
    $('#recruitment-help').textContent = '추천 공고 목록을 불러오지 못했습니다. 아래 항목을 직접 입력해 주세요.';
    return;
  }

  jobs.forEach((job) => {
    const option = document.createElement('option');
    option.value = job.id;
    option.textContent = `${job.company} · ${job.site}`;
    select.append(option);
  });

  select.addEventListener('change', () => applyRecruitment(select.value, jobs));

  const requestedJobId = new URLSearchParams(window.location.search).get('job');
  if (requestedJobId && jobs.some((job) => job.id === requestedJobId)) {
    select.value = requestedJobId;
    applyRecruitment(requestedJobId, jobs);
  }
}

function applyRecruitment(jobId, jobs) {
  const company = $('#company');
  const site = $('#site');
  const jobUrl = $('#job-url');
  const hiddenId = $('#job-id');
  const help = $('#recruitment-help');

  if (!jobId) {
    hiddenId.value = '';
    if (company.dataset.recruitmentFilled === 'true') company.value = '';
    if (site.dataset.recruitmentFilled === 'true') site.value = '';
    if (jobUrl.dataset.recruitmentFilled === 'true') jobUrl.value = '';
    [company, site, jobUrl].forEach((field) => {
      delete field.dataset.recruitmentFilled;
      field.classList.remove('auto-filled');
    });
    help.textContent = '목록에 없는 공고는 기업명·지원사이트·채용공고 URL을 직접 입력해 주세요.';
    return;
  }

  const job = jobs.find((item) => item.id === jobId);
  if (!job) return;

  hiddenId.value = job.id;
  company.value = job.company || '';
  site.value = job.site || '';
  jobUrl.value = job.url || '';
  [company, site, jobUrl].forEach((field) => {
    field.dataset.recruitmentFilled = 'true';
    field.classList.add('auto-filled');
  });
  help.textContent = '기업명·지원사이트·채용공고 URL을 자동 입력했습니다. 실제 공고를 확인한 뒤 지원직무를 정확히 입력해 주세요.';
}

async function submitApplication(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('#submit-button');
  $('#form-error').textContent = '';
  if (!form.reportValidity()) return;
  button.disabled = true;
  button.textContent = '등록 중...';
  try {
    const payload = Object.fromEntries(new FormData(form));
    const result = await api.createApplication(payload);
    form.pin.value = '';
    $('#form-card').hidden = true;
    $('#success-name').textContent = result.studentName;
    $('#before-count').textContent = `${result.previousWeeklyCount}건`;
    $('#after-count').textContent = `${result.currentWeeklyCount}건`;
    const message = $('#goal-message');
    message.textContent = !result.isCurrentWeek
      ? '등록한 지원일이 이번 주가 아니어서 이번 주 통계에는 포함되지 않습니다.'
      : result.goalAchievedNow
        ? '이번 주 목표를 달성했습니다.'
        : `이번 주 목표까지 ${Math.max(0, result.weeklyGoal - result.currentWeeklyCount)}건 남았습니다.`;
    $('#success-card').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    showFormError(error.message);
    button.disabled = false;
    button.textContent = '지원현황 등록하기';
  }
}

function showFormError(message) {
  $('#form-error').textContent = message;
}

function todayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
