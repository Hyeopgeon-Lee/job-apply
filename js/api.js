const API_URL = 'https://script.google.com/macros/s/AKfycbzOm0CkN59LybvwRtMXRu0BmOxsPJloLwlPLHL5s_6NCSBeFxVvsH6Q6ObHmgwTrSuDLA/exec';

function isApiConfigured() {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(API_URL);
}

async function request(action, params = {}) {
  if (!isApiConfigured()) throw new Error('Apps Script 웹앱 URL이 아직 설정되지 않았습니다.');
  const body = new URLSearchParams({ action, ...params });
  const response = await fetch(API_URL, { method: 'POST', body });
  if (!response.ok) throw new Error('서버에 연결할 수 없습니다.');
  const result = await response.json();
  if (!result.success) throw new Error(result.message || '요청을 처리하지 못했습니다.');
  return result.data;
}

export const api = {
  configured: isApiConfigured,
  getDashboard: () => request('dashboard'),
  createApplication: (payload) => request('create', payload),
  deleteApplication: (applicationId, studentId, pin) => request('delete', { application_id: applicationId, student_id: studentId, pin }),
};
