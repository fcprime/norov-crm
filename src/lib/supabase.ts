import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { createAuthFetch } from './authTransport';
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && key && !url.includes('YOUR_PROJECT'));
let refreshing:Promise<Session|null>|null=null;
export async function refreshAuthSession():Promise<Session|null> {
 if(!supabase)return null;
 if(!refreshing)refreshing=supabase.auth.refreshSession().then(({data,error})=>{
  if(error)throw error;return data.session;
 }).finally(()=>{refreshing=null;});
 return refreshing;
}
const nativeFetch=globalThis.fetch.bind(globalThis);
export const supabase = isSupabaseConfigured ? createClient(url!,key!,{
 auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true},
 global:{fetch:createAuthFetch(url!,nativeFetch,async()=>{try{return (await refreshAuthSession())?.access_token || null;}catch{return null;}})}
}) : null;
export async function validatedSession():Promise<Session|null> {
 if(!supabase)return null;
 const {data,error}=await supabase.auth.getSession();if(error)throw error;
 if(!data.session)return null;
 // The server validates expiry, so startup does not trust a computer's clock alone.
 const user=await supabase.auth.getUser(data.session.access_token);
 if(!user.error)return data.session;
 if(user.error.status===401 || /jwt|expired/i.test(user.error.message))return refreshAuthSession();
 throw user.error;
}
