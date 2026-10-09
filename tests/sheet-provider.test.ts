import assert from 'node:assert/strict';
import { DEFAULT_COLUMNS } from '../supabase/functions/client-reports/sheet-target.ts';
import { writeSheet } from '../supabase/functions/client-reports/providers.ts';
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
const sa=JSON.stringify({client_email:'test@example.test',private_key:`-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`});
(globalThis as any).Deno={env:{get:()=>undefined}};
const calls:{url:string;body:any}[]=[];
let occupied=false;
globalThis.fetch=async(url:any,init:any)=>{
 const u=String(url);
 if(u.includes('oauth2.googleapis.com'))return Response.json({access_token:'fake',expires_in:3600});
 const body=init?.body?JSON.parse(init.body):undefined;calls.push({url:u,body});
 if(u.includes('?fields=sheets.properties'))return Response.json({sheets:[{properties:{sheetId:0,title:"Client's month",gridProperties:{rowCount:100,columnCount:12}}}]});
 if(u.includes('valueRenderOption=UNFORMATTED'))return Response.json({values:[['07.10'],['08.10']]});
 if(u.includes('valueRenderOption=FORMULA'))return Response.json({values:[['07.10','manual',26],occupied?['08.10','=SUM(1,2)']:['08.10']]});
 return Response.json({});
};
const t={sheet_id:0,since:'2026-09-24',until:'2026-10-23',first_row:2,last_row:31,columns:DEFAULT_COLUMNS};
const m={day:'2026-10-08',campaigns:['=untrusted campaign'],leads:26,spend:67.55,impressions:7125,clicks:84,messages:1};
await writeSheet('fake',[m],'PLN',sa,t,'2026-10-08',true);
assert.ok(!calls.some(c=>c.body)); // preview only reads
calls.length=0;
const result=await writeSheet('fake',[m],'PLN',sa,t,'2026-10-08');
assert.equal(result?.written,1);
const batch=calls.find(c=>c.url.endsWith('/values:batchUpdate'))!.body;
assert.equal(batch.valueInputOption,'RAW');assert.equal(batch.data.length,9);
assert.equal(batch.data[0].range,"'Client''s month'!B3");
assert.equal(batch.data[0].values[0][0],'=untrusted campaign');
assert.ok(batch.data.every((c:any)=>!c.range.endsWith('2')&&!/!A/.test(c.range)));
assert.ok(!calls.some(c=>c.url.endsWith(':batchUpdate')&&!c.url.includes('/values:'))); // no format writes, even if Meta currency differs from the cell format
assert.equal(batch.data.find((c:any)=>c.range.endsWith('!J3')).values[0][0],67.55); // actual amount remains numeric
occupied=true;calls.length=0;
assert.equal((await writeSheet('fake',[m],'PLN',sa,t,'2026-10-08'))?.skipped,1);
assert.ok(!calls.some(c=>c.body));
await assert.rejects(()=>writeSheet('fake',[m],'PLN',sa,{...t,sheet_id:99},'2026-10-08'),/недоступний/);
// Existing automatic tabs also keep their user-customized formats.
let newDefault=false;
globalThis.fetch=async(url:any,init:any)=>{
 const u=String(url);const body=init?.body?JSON.parse(init.body):undefined;calls.push({url:u,body});
 if(u.includes('?fields=sheets.properties'))return Response.json({sheets:newDefault?[]:[{properties:{sheetId:42,title:'Meta — щодня',gridProperties:{rowCount:100,columnCount:12}}}]});
 if(body?.requests?.[0]?.addSheet)return Response.json({replies:[{addSheet:{properties:{sheetId:42,title:'Meta — щодня',gridProperties:{rowCount:2000,columnCount:12}}}}]});
 if(u.includes('/values/')&&!body)return Response.json({values:newDefault?[]:[['Дата','Кампанії','Ліди Meta','CPL','CPM','Покази','CPC','Кліки на посилання','CTR','Витрати','Переписки з реклами','Валюта']]});
 return Response.json({});
};
calls.length=0;await writeSheet('fake',[m],'PLN',sa);
assert.ok(!calls.some(c=>c.body?.requests?.some((r:any)=>r.repeatCell)));
const automatic=calls.find(c=>c.url.endsWith('/values:batchUpdate'))!.body;
assert.equal(automatic.data[1].values[0][9],67.55);assert.equal(automatic.data[1].values[0][11],'PLN');
newDefault=true;calls.length=0;await writeSheet('fake',[m],'PLN',sa);
assert.ok(calls.some(c=>c.body?.requests?.some((r:any)=>r.addSheet)));
assert.ok(calls.some(c=>c.body?.requests?.some((r:any)=>r.repeatCell))); // format initialized only once, on new tab creation
console.log('PASS: Google preview read-only, selected tab/id zero, renamed/quoted title, RAW numeric values, no formatting mutations, occupied rows and formulas protected');
