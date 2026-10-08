// Retry only rejected JWT requests. Never replay successful mutations or general network errors.
export function createAuthFetch(base:string, nativeFetch:typeof fetch, refresh:()=>Promise<string|null>) : typeof fetch {
 return async(input:RequestInfo | URL,init?:RequestInit)=>{
  const request=new Request(input,init);const retry=request.clone();
  const response=await nativeFetch(request);
  const path=new URL(request.url);
  if(path.origin!==new URL(base).origin || !['/rest/v1/','/functions/v1/'].some(p=>path.pathname.startsWith(p)))return response;
  if(response.status!==401)return response;
  let payload:any;try{payload=await response.clone().json();}catch{return response;}
  const reason=String(payload.message || payload.error || '');
  if(!/jwt|token.*expir|invalid.*token/i.test(reason) && !['PGRST301','PGRST303'].includes(payload.code))return response;
  const token=await refresh();if(!token)return response;
  const headers=new Headers(retry.headers);headers.set('Authorization',`Bearer ${token}`);
  return nativeFetch(new Request(retry,{headers}));
 };
}
