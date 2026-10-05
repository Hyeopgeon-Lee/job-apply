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
  assert.ok(register.includes('js/register.js?v='+version));
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
