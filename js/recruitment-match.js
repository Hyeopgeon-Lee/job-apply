/**
 * 현재/보존된 학과 추천 채용공고와 지원 기록을 읽기 전용으로 대조한다.
 * 추천공고 ID는 GAS에 저장되지 않으므로 공고 URL과 기업명을 함께 검사한다.
 * 마감/비활성 공고를 제외하지 않는다(과거 지원 기록 대응).
 */

export function normalizeCompanyName(value) {
  if (!value) return '';
  let name = String(value).normalize('NFKC').toLocaleLowerCase('ko-KR').trim();
  // '㈜회사', '(주)회사', '주식회사 회사', '회사(주)' 등 동일 기업 표기를 통합
  for (let i = 0; i < 2; i += 1) {
    name = name.replace(/^\s*(?:\(\s*주\s*\)|주식회사)\s*/u, '')
      .replace(/\s*(?:\(\s*주\s*\)|주식회사)\s*$/u, '');
  }
  return name.replace(/[^\p{L}\p{N}]/gu, '');
}

function usableUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function postingKey(value) {
  const url = usableUrl(value);
  if (!url) return '';
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  const inHost = domain => host === domain || host.endsWith('.' + domain);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // 변동되는 추적 파라미터·모바일 주소와 무관한 채용공고 고유번호를 우선 사용한다.
  if (inHost('saramin.co.kr')) {
    const id = url.searchParams.get('rec_idx');
    if (id && /^\d{5,}$/.test(id)) return 'saramin:' + id;
  }
  if (inHost('jobkorea.co.kr')) {
    const id = path.match(/\/Recruit\/GI_Read\/(\d+)/i)?.[1]
      || url.searchParams.get('Gno');
    if (id && /^\d{5,}$/.test(id)) return 'jobkorea:' + id;
  }
  if (inHost('work24.go.kr')) {
    const id = url.searchParams.get('wantedAuthNo');
    if (id && /^[a-z0-9-]{8,}$/i.test(id)) return 'work24:' + id.toUpperCase();
  }
  if (inHost('wanted.co.kr')) {
    const id = path.match(/\/wd\/(\d+)/i)?.[1];
    if (id) return 'wanted:' + id;
  }

  // 공용 채용 홈 URL은 동일 공고의 증거가 아니므로 일치 판정에 사용하지 않는다.
  const params = [...url.searchParams]
    .filter(([key]) => !/^(utm_.+|fbclid|gclid|_ga|ref|source)$/i.test(key))
    .sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  if (!params.length && /^\/(?:|jobs?|careers?|recruit(?:ment)?|positions?)\/?$/i.test(path)) return '';
  return host + path + (params.length ? '?' + new URLSearchParams(params).toString() : '');
}

const LABELS = Object.freeze({
  posting: { kind: 'posting', label: '학과 추천공고', description: '학과 추천 목록의 채용공고 URL과 기업명이 일치합니다.' },
  company: { kind: 'company', label: '추천기업 · 다른 공고', description: '학과 추천 목록에 있는 기업이나 추천한 채용공고와는 일치하지 않습니다.' },
  other: { kind: 'other', label: '목록 외 지원', description: '현재 보유한 학과 추천공고 목록과 일치하지 않습니다. 과거 추천 여부는 확정할 수 없습니다.' },
  review: { kind: 'review', label: '확인 필요', description: '기업명과 채용공고 URL이 충돌하거나 불완전하여 구분할 수 없습니다.' },
  unavailable: { kind: 'unavailable', label: '추천 정보 확인 불가', description: '학과 추천공고 데이터를 불러오지 못해 비교할 수 없습니다.' }
});

export function classifyApplication(application, catalog) {
  if (!Array.isArray(catalog) || !catalog.length) return LABELS.unavailable;
  const company = normalizeCompanyName(application?.company);
  const key = postingKey(application?.jobUrl);
  if (!company || !key) return LABELS.review;

  const jobs = catalog.filter(job => job && typeof job === 'object');
  const matchedPosting = jobs.filter(job => key === postingKey(job.url));
  if (matchedPosting.length) {
    return matchedPosting.some(job => normalizeCompanyName(job.company) === company)
      ? LABELS.posting : LABELS.review;
  }
  return jobs.some(job => normalizeCompanyName(job.company) === company)
    ? LABELS.company : LABELS.other;
}
