import { api } from './api.js';

const $ = (selector) => document.querySelector(selector);
const state = { deleting: null };

document.addEventListener('DOMContentLoaded', () => {
  $('#retry-button').addEventListener('click', loadDashboard);
  $('#delete-cancel').addEventListener('click', closeDeleteDialog);
  $('#delete-form').addEventListener('submit', deleteApplication);
  $('#delete-dialog').addEventListener('click', (event) => {
    if (event.target === $('#delete-dialog')) closeDeleteDialog();
  });
  loadDashboard();
});

async function loadDashboard() {
  showState('loading');
  if (!api.configured()) {
    showError('서비스 연결 설정이 필요합니다. 관리자에게 문의해 주세요.');
    return;
  }
  try {
    const data = await api.getDashboard();
    renderSummary(data.summary);
    renderStudents(data.students);
    renderRecent(data.recent);
    showState('content');
  } catch (error) {
    showError(error.message);
  }
}

function renderSummary(summary) {
  $('#weekly-count').textContent = `${summary.weeklyCount}건`;
  $('#weekly-goal').textContent = `${summary.weeklyGoal}건`;
  $('#monthly-count').textContent = `${summary.monthlyCount || 0}건`;
  $('#cumulative-count').textContent = `${summary.cumulativeCount || 0}건`;
  const percent = summary.weeklyGoal ? Math.min(100, Math.round(summary.weeklyCount / summary.weeklyGoal * 100)) : 0;
  $('#goal-progress').style.width = `${percent}%`;
  $('#goal-progress-wrap').setAttribute('aria-valuenow', String(percent));
  $('#goal-percent').textContent = summary.weeklyCount >= summary.weeklyGoal && summary.weeklyGoal > 0
    ? '이번 주 학과 목표를 달성했어요!'
    : `목표까지 ${Math.max(0, summary.weeklyGoal - summary.weeklyCount)}건 남았어요`;
}

function renderStudents(students) {
  const list = $('#student-list');
  list.replaceChildren(...students.map((student) => {
    const item = document.createElement('li');
    item.className = 'student-row';
    const achieved = student.weeklyCount >= student.weeklyGoal;
    item.innerHTML = `<span class="student-name"></span><span class="student-count"><strong>${student.weeklyCount}건</strong><small>누적 ${student.cumulativeCount || 0}건</small></span><span class="goal-state ${achieved ? 'achieved' : ''}">${achieved ? '목표 달성' : `${student.weeklyGoal - student.weeklyCount}건 남음`}</span>`;
    item.querySelector('.student-name').textContent = student.name;
    return item;
  }));
}

function renderRecent(applications) {
  const list = $('#recent-list');
  $('#recent-empty').hidden = applications.length !== 0;
  list.replaceChildren(...applications.map((application) => {
    const article = document.createElement('article');
    article.className = 'application-card';
    article.innerHTML = `
      <div class="application-head"><strong class="application-student"></strong><span class="application-date"></span></div>
      <h3 class="application-company"></h3>
      <p class="application-position"></p>
      <p class="application-site"></p>
      <div class="application-actions"><a class="button button-secondary job-link" target="_blank" rel="noopener noreferrer">채용공고 보기</a><button class="text-button delete-button" type="button">삭제</button></div>`;
    article.querySelector('.application-student').textContent = application.studentName;
    article.querySelector('.application-date').textContent = application.appliedDate.replaceAll('-', '.');
    article.querySelector('.application-company').textContent = application.company;
    article.querySelector('.application-position').textContent = application.position;
    article.querySelector('.application-site').textContent = application.site;
    article.querySelector('.job-link').href = application.jobUrl;
    article.querySelector('.delete-button').addEventListener('click', () => openDeleteDialog(application));
    return article;
  }));
}

function openDeleteDialog(application) {
  state.deleting = application;
  $('#delete-student').textContent = application.studentName;
  $('#delete-pin').value = '';
  $('#delete-error').textContent = '';
  $('#delete-dialog').showModal();
  $('#delete-pin').focus();
}

function closeDeleteDialog() {
  $('#delete-dialog').close();
  state.deleting = null;
}

async function deleteApplication(event) {
  event.preventDefault();
  const button = $('#delete-submit');
  const pin = $('#delete-pin').value.trim();
  if (!/^\d{4}$/.test(pin)) {
    $('#delete-error').textContent = '4자리 숫자를 입력해 주세요.';
    return;
  }
  button.disabled = true;
  button.textContent = '삭제 중...';
  try {
    await api.deleteApplication({ application_id: state.deleting.applicationId, student_id: state.deleting.studentId, pin });
    closeDeleteDialog();
    await loadDashboard();
  } catch (error) {
    $('#delete-error').textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = '삭제하기';
  }
}

function showState(stateName) {
  $('#loading').hidden = stateName !== 'loading';
  $('#error-state').hidden = true;
  $('#dashboard').hidden = stateName !== 'content';
}

function showError(message) {
  $('#loading').hidden = true;
  $('#dashboard').hidden = true;
  $('#error-message').textContent = message;
  $('#error-state').hidden = false;
}
