import { type ClientTask } from '../data/tasks';
import { isSupabaseConfigured, supabase } from './supabase';

const KEY='norov-crm-tasks-v1';
const unavailable=(e:any)=>['42P01','PGRST205','PGRST204'].includes(e?.code)||String(e?.message||'').includes('schema cache');
const local=():ClientTask[]=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch{return[];}};
const store=(items:ClientTask[])=>localStorage.setItem(KEY,JSON.stringify(items));
const map=(r:any):ClientTask=>({id:r.id,clientId:r.client_id,title:r.title,description:r.description||'',status:r.status,priority:r.priority,dueDate:r.due_date||'',dueTime:r.due_time?String(r.due_time).slice(0,5):'',completedAt:r.completed_at||undefined,createdAt:r.created_at,updatedAt:r.updated_at});

export async function loadTasks():Promise<ClientTask[]>{
 if(!isSupabaseConfigured||!supabase)return local();
 const {data,error}=await supabase.from('tasks').select('*').order('due_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});
 if(error){if(unavailable(error))return local();throw error;} return (data||[]).map(map);
}

export async function saveTask(task:ClientTask,current:ClientTask[]):Promise<ClientTask>{
 const created=task.id?task:{...task,id:crypto.randomUUID(),createdAt:new Date().toISOString()};
 if(!isSupabaseConfigured||!supabase){store(task.id?current.map(t=>t.id===task.id?created:t):[created,...current]);return created;}
 const {data:auth}=await supabase.auth.getUser(); if(!auth.user)throw new Error('Потрібна авторизація');
 const payload={owner_id:auth.user.id,client_id:created.clientId,title:created.title.trim(),description:created.description?.trim()||null,status:created.status,priority:created.priority,due_date:created.dueDate||null,due_time:created.dueTime||null,completed_at:created.status==='completed'?(created.completedAt||new Date().toISOString()):null,updated_at:new Date().toISOString()};
 const q=task.id?supabase.from('tasks').update(payload).eq('id',task.id):supabase.from('tasks').insert(payload);
 const {data,error}=await q.select('*').single();
 if(error){if(unavailable(error)){store(task.id?current.map(t=>t.id===task.id?created:t):[created,...current]);return created;}throw error;} return map(data);
}

export async function deleteTask(taskId:string,current:ClientTask[]):Promise<void>{
 if(!isSupabaseConfigured||!supabase){store(current.filter(t=>t.id!==taskId));return;}
 const {error}=await supabase.from('tasks').delete().eq('id',taskId); if(error){if(unavailable(error)){store(current.filter(t=>t.id!==taskId));return;}throw error;}
}
