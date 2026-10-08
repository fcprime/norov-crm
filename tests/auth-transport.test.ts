import assert from 'node:assert/strict';
import {createAuthFetch} from '../src/lib/authTransport.ts';
let calls=0,refreshes=0;const native:typeof fetch=async(req)=>{calls++;const r=new Request(req);if(calls===1)return Response.json({code:'PGRST301',message:'JWT expired'},{status:401});assert.equal(r.headers.get('authorization'),'Bearer fresh');assert.equal(await r.text(),'{"status":"active"}');return Response.json({ok:true});};
const f=createAuthFetch('https://example.supabase.co',native,async()=>{refreshes++;return 'fresh';});
await f('https://example.supabase.co/rest/v1/clients',{method:'PATCH',headers:{authorization:'Bearer old'},body:'{"status":"active"}'});assert.equal(calls,2);assert.equal(refreshes,1);
let retries=0;const failed=createAuthFetch('https://example.supabase.co',async()=>Response.json({error:'permission denied'},{status:403}),async()=>{retries++;return 'fresh';});await failed('https://example.supabase.co/rest/v1/clients');assert.equal(retries,0);
const token=createAuthFetch('https://example.supabase.co',async()=>Response.json({message:'JWT expired'},{status:401}),async()=>{retries++;return 'fresh';});await token('https://example.supabase.co/auth/v1/token');assert.equal(retries,0);
console.log('PASS: JWT refresh retry preserves body; permissions and auth refresh endpoint never replayed');
