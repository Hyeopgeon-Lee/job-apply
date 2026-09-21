import { api } from './api.js';

const $ = (selector) => document.querySelector(selector);

document.addEventListener('DOMContentLoaded', () => {
  $('#applied-date').value = todayInSeoul();
  $('#application-form').addEventListener('submit', submitApplication);
  loadStudents();
});

async function loadStudents() {
  if (!api.configured()) {
    showFormError('서비스 연결 설정이 필요합니다. 관리자에게 문의해 주세요.');
    return;
  }
  try {
    const students = await api.getStudents();
    const select = $('#student');
    students.forEach((student) => select.add(new Option(student.name, student.studentId)));
    select.disabled = false;
    $('#submit-button').disabled = false;
  } catch (error) {
    showFormError(error.message);
  }
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
    $('#form-card').hidden = true;
    $('#success-name').textContent = result.studentName;
    $('#before-count').textContent = `${result.previousWeeklyCount}건`;
    $('#after-count').textContent = `${result.currentWeeklyCount}건`;
    const message = $('#goal-message');
    message.textContent = result.goalAchievedNow ? '이번 주 목표를 달성했습니다.' : `이번 주 목표까지 ${Math.max(0, result.weeklyGoal - result.currentWeeklyCount)}건 남았습니다.`;
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
