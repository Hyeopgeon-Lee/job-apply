import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';

function server() {
  const cache = new Map(), writes = [], rows = [['application_id','student_id','status','updated_at'],['A-APP','A','ACTIVE',''],['B-APP','B','ACTIVE','']];
  const c = vm.createContext({console:{error(){}},PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'test-only-salt'})},
    CacheService:{getScriptCache:()=>({put:(k,v,ttl)=>cache.set(k,{v,ttl}),get:k=>cache.get(k)?.v,remove:k=>cache.delete(k)})},
    Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>Array.from(createHash('sha256').update(v).digest())},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}});
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8'),c);
  c.testRows=rows;c.writes=writes;
  vm.runInContext(`json_=p=>p; getStudents_=()=>[{student_id:'A',name:'Test A',pin:hashStudentPin_('1234'),active:true},{student_id:'B',name:'Test B',pin:hashStudentPin_('5678'),active:true}];
    getDashboard_=()=>({authenticated:true});
    sheet_=()=>({getDataRange:()=>({getValues:()=>testRows}),getRange:(r,col)=>({setValue:v=>{writes.push([r,col,v]);testRows[r-1][col-1]=v}})});`,c);
  return {c,cache,writes,rows};
}
test('public students and unauthenticated operations rejected',()=>{
  const {c}=server();
  for(const action of ['students','dashboard','create','delete']) {
    assert.equal(c.doGet({parameter:{action}}).success,false);
    assert.equal(c.doPost({parameter:{action}}).success,false);
    assert.equal(c.doPost({parameter:{action,token:'wrong'}}).success,false);
  }
  assert.equal(c.doGet({parameter:{action:'health'}}).success,true);
});
test('hashed PIN login, invalid credentials, six-hour session and logout',()=>{
  const {c,cache}=server();
  for(const [student_id,pin] of [['unknown','1234'],['A','0000']])assert.equal(c.doPost({parameter:{action:'login',student_id,pin}}).success,false);
  const login=c.doPost({parameter:{action:'login',student_id:'A',pin:'1234'}});
  assert.equal(login.success,true);assert.equal(login.data.expiresIn,21600);
  const token=login.data.token;assert.equal(cache.get('job-apply-session:'+token).ttl,21600);
  assert.equal(c.doPost({parameter:{action:'dashboard',token}}).success,true);
  c.doPost({parameter:{action:'logout',token}});
  assert.equal(c.doPost({parameter:{action:'dashboard',token}}).success,false);
});
test('router binds creation identity to authenticated student rather than supplied ID',()=>{
  const {c}=server();
  vm.runInContext('createApplication_=(params,student)=>({studentId:student.student_id})',c);
  const token=c.login_({student_id:'A',pin:'1234'}).token;
  assert.equal(c.doPost({parameter:{action:'create',token,student_id:'B'}}).data.studentId,'A');
});
test('student cannot delete another student application; own deletion is soft',()=>{
  const {c,writes,rows}=server();const token=c.login_({student_id:'A',pin:'1234'}).token;
  assert.equal(c.doPost({parameter:{action:'delete',token,application_id:'B-APP',student_id:'B'}}).success,false);
  assert.equal(writes.length,0);
  assert.equal(c.doPost({parameter:{action:'delete',token,application_id:'A-APP'}}).success,true);
  assert.equal(rows[1][2],'DELETED');assert.equal(rows[2][2],'ACTIVE');assert.equal(rows.length,3);
});
