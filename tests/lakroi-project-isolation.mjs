import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';

// Run from only the new deployment root: no parent source or dependencies exist.
const isolated=mkdtempSync(join(tmpdir(),'lakroi-isolated-'));
try {
  cpSync(new URL('../lakroi-dashboard/',import.meta.url),isolated,{recursive:true});
  const {default:handler}=await import(pathToFileURL(join(isolated,'api/data.js')));
  process.env.LAKROI_DASHBOARD_PIN='isolation-test';
  process.env.BLOB_STORE_ID='store_test';
  globalThis.fetch=async()=>({ok:true,json:async()=>({bills:[],goal:15000})});
  const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
  await handler({method:'GET',headers:{'x-lakroi-pin':'isolation-test'}},res);
  assert.equal(res.code,200);
  assert.equal(res.data.bills.length,127);
  assert.equal(res.data.bills.reduce((s,b)=>s+b.cashAmount,0),19169);
  const html=readFileSync(join(isolated,'index.html'),'utf8');
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const routeLine=script.split('\n').find(line=>line.startsWith('const API_URL='));
  for(const [path,expected] of [['/','/api/data'],['/index.html','/api/data'],['/lakroi-dashboard/','/api/health?lakroi=1']]){
    const context=vm.createContext({location:{pathname:path}});
    assert.equal(vm.runInContext(routeLine+'\nAPI_URL',context),expected);
  }
  assert.ok(html.includes('href="./manifest.webmanifest"'));
  const manifest=JSON.parse(readFileSync(join(isolated,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.equal(manifest.icons[0].src,'./icon.svg');
  const legacy=readFileSync(new URL('../api/health.js',import.meta.url),'utf8');
  assert.ok(!legacy.includes('function lakroiReadState'),'Admin ID must not contain a duplicate Lakroi API');
  console.log('Lakroi standalone root loads without Admin ID files; API and PWA routes pass');
}finally{rmSync(isolated,{recursive:true,force:true})}
