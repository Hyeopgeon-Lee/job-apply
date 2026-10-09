import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/recruitment-match.js', import.meta.url), 'utf8');
const { classifyApplication, normalizeCompanyName, postingKey } =
  await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const recommendations = [
  { id:'R-1', company:'㈜링네트', url:'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55077284&view_type=search', deadline:'2026-10-01', active:false },
  { id:'R-2', company:'그루젠 주식회사', url:'https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=KJ20922610010012&infoTypeCd=VALIDATION', active:true },
  { id:'R-3', company:'ABC소프트', url:'https://www.jobkorea.co.kr/Recruit/GI_Read/49997820', active:true }
];

function match(company,jobUrl,catalog=recommendations) {
  return classifyApplication({company,jobUrl},catalog).kind;
}

test('normalizes legal entity markers without treating different companies as the same', () => {
  assert.equal(normalizeCompanyName('㈜링네트'),normalizeCompanyName('(주) 링네트'));
  assert.equal(normalizeCompanyName('주식회사 링네트'),normalizeCompanyName('링네트'));
  assert.equal(normalizeCompanyName('링네트㈜'),normalizeCompanyName('링네트'));
  assert.notEqual(normalizeCompanyName('링네트'),normalizeCompanyName('링네트솔루션'));
});

test('matches expired or inactive recommended postings using stable site posting IDs', () => {
  assert.equal(match('링네트','https://m.saramin.co.kr/zf_user/jobs/view?view_type=mobile&rec_idx=55077284&utm_source=email'),'posting');
  assert.equal(match('(주) 그루젠','https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?infoTypeCd=DETAIL&wantedAuthNo=KJ20922610010012'),'posting');
  assert.equal(match('ABC소프트','https://www.jobkorea.co.kr/Recruit/GI_Read/49997820#seq=0'),'posting');
});

test('distinguishes other postings from the same recommended employer', () => {
  assert.equal(match('㈜링네트','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55077285'),'company');
});

test('marks incorrect company with matching posting URL as review needed', () => {
  assert.equal(match('전혀다른회사','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55077284'),'review');
});

test('does not label non-recommended companies as recommended', () => {
  assert.equal(match('기타 기업','https://www.jobkorea.co.kr/Recruit/GI_Read/99999999'),'other');
});

test('does not assume an empty, broken, or unavailable URL is a different posting', () => {
  assert.equal(match('링네트',''),'review');
  assert.equal(match('링네트','javascript:alert(1)'),'review');
  assert.equal(match('링네트','https://www.saramin.co.kr/jobs'),'review');
  assert.equal(match('링네트','https://www.saramin.co.kr/jobs',[]),'unavailable');
});

test('does not use shared recruiting homepages as unique posting URLs', () => {
  assert.equal(postingKey('https://example.com/careers'),'');
  assert.equal(postingKey('https://example.com/jobs?utm_source=abc'),'');
  assert.equal(postingKey('https://example.com/recruitment'),'');
});

test('no recommendations loaded yields unavailable rather than outside recommendation', () => {
  assert.equal(match('링네트','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55077284',undefined),'posting');
  assert.equal(match('링네트','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=55077284',[]),'unavailable');
  assert.equal(classifyApplication({company:'링네트',jobUrl:'https://example.com/1'},null).kind,'unavailable');
});

test('dashboard integration has independent read-only presentation and does not alter GAS storage', () => {
  const root = new URL('../',import.meta.url);
  const html = readFileSync(new URL('index.html',root),'utf8');
  const app = readFileSync(new URL('js/app.js',root),'utf8');
  const api = readFileSync(new URL('apps-script/Code.gs',root),'utf8');
  assert.match(html,/data\/recruitments\.js/);
  assert.match(html,/classification-note/);
  assert.match(app,/classifyApplication\(application, window\.K_BIGDATA_RECRUITMENTS\)/);
  assert.match(app,/badge\.textContent = recommendation\.label/);
  assert.doesNotMatch(api,/recommendation_status|recommendation_type/);
});
