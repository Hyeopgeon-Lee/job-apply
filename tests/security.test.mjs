import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

function server() {
  const writes = [];
  const rows = [
    ['application_id','student_id','status','updated_at'],
    ['A-APP','A','ACTIVE',''],
    ['B-APP','B','ACTIVE','']
  ];
  const c = vm.createContext({
    console:{error(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-only-salt'})},
    Utilities:{
      DigestAlgorithm:{SHA_256:'sha256'},
      Charset:{UTF_8:'utf8'},
      computeDigest:(_,v)=>Array.from(createHash('sha256').update(v).digest())
    },
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),c);
  c.realDashboard=c.getDashboard_;
  c.testRows=rows;c.writes=writes;
  vm.runInContext(`json_=p=>p;
    getStudents_=()=>[
      {student_id:'A',name:'Test A',pin:hashStudentPin_('1234'),active:true},
      {student_id:'B',name:'Test B',pin:hashStudentPin_('5678'),active:true}
    ];
    getDashboard_=()=>({public:true});
    sheet_=()=>({
      getDataRange:()=>({getValues:()=>testRows}),
      getRange:(r,col)=>({setValue:v=>{writes.push([r,col,v]);testRows[r-1][col-1]=v}})
    });`,c);
  return {c,writes,rows};
}

test('dashboard is public but write operations require student verification',()=>{
  const {c}=server();
  assert.equal(c.doPost({parameter:{action:'dashboard'}}).success,true);
  assert.equal(c.doPost({parameter:{action:'create'}}).success,false);
  assert.equal(c.doPost({parameter:{action:'delete',application_id:'A-APP'}}).success,false);
  assert.equal(c.doGet({parameter:{action:'health'}}).success,true);
});

test('student PIN verification rejects invalid credentials and accepts valid credentials',()=>{
  const {c}=server();
  for(const params of [
    {student_id:'unknown',pin:'1234'},
    {student_id:'A',pin:'0000'},
    {student_id:'A',pin:'12'}
  ]) assert.throws(()=>c.authenticateStudent_(params));
  assert.equal(c.authenticateStudent_({student_id:'A',pin:'1234'}).student_id,'A');
});

test('creation identity is bound to verified student',()=>{
  const {c}=server();
  vm.runInContext('createApplication_=(params,student)=>({studentId:student.student_id})',c);
  const result=c.doPost({parameter:{action:'create',student_id:'A',pin:'1234'}});
  assert.equal(result.success,true);
  assert.equal(result.data.studentId,'A');
});

test('student cannot delete another student application; own deletion is soft',()=>{
  const {c,writes,rows}=server();
  assert.equal(c.doPost({parameter:{action:'delete',application_id:'B-APP',student_id:'A',pin:'1234'}}).success,false);
  assert.equal(writes.length,0);
  assert.equal(c.doPost({parameter:{action:'delete',application_id:'A-APP',student_id:'A',pin:'1234'}}).success,true);
  assert.equal(rows[1][2],'DELETED');
  assert.equal(rows[2][2],'ACTIVE');
  assert.equal(rows.length,3);
});

test('frontend has no login gate and keeps PIN verification on mutations',()=>{
  const root=new URL('../',import.meta.url);
  const index=readFileSync(new URL('index.html',root),'utf8');
  const register=readFileSync(new URL('register.html',root),'utf8');
  const app=readFileSync(new URL('js/app.js',root),'utf8');
  const registerJs=readFileSync(new URL('js/register.js',root),'utf8');
  const api=readFileSync(new URL('js/api.js',root),'utf8');
  assert.doesNotMatch(index,/id="login-card"|id="login-form"|logout-button/);
  assert.match(index,/id="delete-student-id"/);
  assert.match(index,/id="delete-pin"/);
  assert.match(register,/name="student_id"/);
  assert.match(register,/name="pin"/);
  assert.doesNotMatch(app,/sessionStorage|login\(|logout\(/);
  assert.doesNotMatch(registerJs,/sessionStorage|location\.replace\('index\.html'\)/);
  assert.match(api,/getDashboard:\s*\(\)\s*=>\s*request\('dashboard'\)/);
  assert.match(api,/deleteApplication:\s*\(applicationId, studentId, pin\)/);
});

test('public build versions and noindex remain aligned',()=>{
  const root=new URL('../',import.meta.url),version='20261005-public-1';
  const index=readFileSync(new URL('index.html',root),'utf8');
  const register=readFileSync(new URL('register.html',root),'utf8');
  assert.ok(index.includes('css/style.css?v='+version));
  assert.ok(index.includes('js/app.js?v='+version));
  assert.ok(register.includes('css/style.css?v='+version));
  assert.match(register,/js\/register\.js\?v=[A-Za-z0-9._-]+/);
  for(const file of ['index.html','register.html']){
    const html=readFileSync(new URL(file,root),'utf8');
    assert.match(html,/noindex,\s*nofollow,\s*noarchive/);
  }
  for(const file of ['js/app.js','js/register.js']){
    assert.ok(readFileSync(new URL(file,root),'utf8').includes('./api.js?v='+version));
  }
  const css=readFileSync(new URL('css/style.css',root),'utf8');
  assert.match(css,/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css,/\.text-button\s*\{[^}]*min-height:\s*44px/);
});

test('real dashboard projection excludes authentication identifiers',()=>{
  const {c}=server();
  vm.runInContext(`getStudents_=()=>[{student_id:'PRIVATE-ID',name:'Test',pin:'PRIVATE-HASH',active:true}];
    getSettings_=()=>({weekly_goal:5});getApplications_=()=>[];
    weekRange_=()=>({start:new Date(2026,9,5),end:new Date(2026,9,11)});
    formatDate_=()=> '2026-10-05';Utilities.formatDate=()=> '2026-10';`,c);
  const data=JSON.parse(JSON.stringify(c.realDashboard()));
  assert.deepEqual(Object.keys(data.students[0]).sort(),['name','weeklyCount','monthlyCount','cumulativeCount','weeklyGoal'].sort());
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE-ID|PRIVATE-HASH|studentId|student_id|pin/i);
});

test('removed session API, URL validation, locking and report dependencies remain safe',()=>{
  const {c}=server();
  for(const action of ['login','logout','students']) assert.equal(c.doPost({parameter:{action}}).success,false);
  for(const url of ['javascript:alert(1)','data:text/html,test','ftp://example.com']) assert.throws(()=>c.normalizeUrl_(url));
  assert.equal(c.normalizeUrl_('https://example.com/jobs'),'https://example.com/jobs');
  const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
  assert.doesNotMatch(code,/CacheService|SESSION_TTL_SECONDS|SESSION_PREFIX|requireSession_/);
  assert.match(code,/getScriptLock/);
  assert.match(code,/normalizeComparableUrl_\(app.job_url\)/);
  const report=readFileSync(new URL('../apps-script/DailyReport.gs',import.meta.url),'utf8');
  for(const fn of ['getStudents_','getApplications_','getSettings_','sheet_','weekRange_']) assert.ok(report.includes(fn));
});

test('actual create uses authenticated owner, rejects duplicate URL, and keeps applied-date counts',()=>{
  const {c}=server();
  vm.runInContext(`saved=[]; Utilities.getUuid=()=> 'QA-ID';
    getApplications_=()=>[];getSettings_=()=>({weekly_goal:5});
    weekRange_=()=>({start:new Date(2026,9,5),end:new Date(2026,9,11)});
    formatDate_=()=> '2026-10-05';sheet_=()=>({appendRow:row=>saved.push(row)});`,c);
  const params={student_id:'B',company:'Test',position:'Developer',site:'기타',job_url:'https://example.com/job',applied_date:'2026-10-05'};
  const result=c.createApplication_(params,{student_id:'A',name:'Test A'});
  assert.equal(c.saved[0][1],'A');
  assert.equal(c.saved[0][7],'ACTIVE');
  assert.equal(result.currentWeeklyCount,1);
  vm.runInContext(`getApplications_=()=>[{student_id:'A',status:'ACTIVE',job_url:'https://example.com/job/'}]`,c);
  assert.throws(()=>c.createApplication_(params,{student_id:'A',name:'Test A'}),/이미 등록/);
  assert.equal(c.saved.length,1);
});
