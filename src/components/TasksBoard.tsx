import { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { type Client } from '../data/clients';
import { emptyTask, type ClientTask, type TaskPriority, type TaskStatus } from '../data/tasks';

const statusLabel:Record<TaskStatus,string>={planned:'Заплановано',in_progress:'В роботі',waiting_client:'Очікуємо клієнта',completed:'Виконано'};
const priorityLabel:Record<TaskPriority,string>={normal:'Звичайний',important:'Важливо',urgent:'Терміново'};
const today=()=>new Date().toISOString().slice(0,10);
const fmt=(d?:string)=>d?new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'2-digit'}).format(new Date(d+'T12:00:00')):'Без дати';

function TaskEditor({task,clients,onClose,onSave,onDelete}:{task:ClientTask;clients:Client[];onClose:()=>void;onSave:(t:ClientTask)=>void;onDelete?:(id:string)=>void}){
 const [draft,setDraft]=useState(task);
 return <div className="modal-backdrop task-modal-backdrop"><div className="modal task-modal">
  <div className="modal-head"><div><span>Задача</span><h2>{task.id?'Редагування':'Нова задача'}</h2></div><button onClick={onClose}><X size={20}/></button></div>
  <div className="form-grid one task-form">
   <label>Клієнт<select value={draft.clientId} onChange={e=>setDraft({...draft,clientId:e.target.value})}><option value="">Оберіть клієнта</option>{clients.filter(c=>c.status==='active').map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
   <label>Що потрібно зробити?<input autoFocus value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Напр. перезапустити креативи"/></label>
   <label>Опис / деталі<textarea rows={3} value={draft.description||''} onChange={e=>setDraft({...draft,description:e.target.value})} placeholder="Необов'язково"/></label>
   <div className="task-form-row"><label>Дата<input type="date" value={draft.dueDate||''} onChange={e=>setDraft({...draft,dueDate:e.target.value})}/></label><label>Час<input type="time" value={draft.dueTime||''} onChange={e=>setDraft({...draft,dueTime:e.target.value})}/></label></div>
   <div className="task-form-row"><label>Статус<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as TaskStatus})}>{(['planned','in_progress','completed'] as TaskStatus[]).map(s=><option value={s} key={s}>{statusLabel[s]}</option>)}</select></label><label>Пріоритет<select value={draft.priority} onChange={e=>setDraft({...draft,priority:e.target.value as TaskPriority})}>{(Object.keys(priorityLabel) as TaskPriority[]).map(p=><option value={p} key={p}>{priorityLabel[p]}</option>)}</select></label></div>
  </div>
  <div className="client-modal-actions">{task.id&&onDelete?<button className="danger delete-task-btn" onClick={()=>onDelete(task.id)}><Trash2 size={16}/>Видалити</button>:<span/>}<div className="task-editor-actions"><button className="secondary" onClick={onClose}>Скасувати</button><button className="primary" disabled={!draft.title.trim()||!draft.clientId} onClick={()=>onSave(draft)}>{task.id?'Зберегти':'Додати задачу'}</button></div></div>
 </div></div>;
}

function TaskLine({task,onEdit,onComplete,onDelete}:{task:ClientTask;onEdit:(t:ClientTask)=>void;onComplete:(t:ClientTask)=>void;onDelete:(id:string)=>void}){
 const overdue=!!task.dueDate&&task.dueDate<today()&&task.status!=='completed';
 return <div className={'client-task-line '+(overdue?'overdue ':'')+task.priority}>
  <button className="task-check" title="Виконано" onClick={()=>onComplete(task)}><CheckCircle2 size={17}/></button>
  <button className="task-line-main" onClick={()=>onEdit(task)}><strong>{task.title}</strong><span><CalendarDays size={12}/>{fmt(task.dueDate)}{task.dueTime&&<><Clock3 size={12}/>{task.dueTime}</>}</span></button>
  <button className="task-quick-delete" title="Видалити задачу" onClick={()=>onDelete(task.id)}><Trash2 size={14}/></button>
 </div>;
}

export function ClientTasksPanel({client,tasks,onSave,onComplete,onDelete}:{client:Client;tasks:ClientTask[];onSave:(t:ClientTask)=>void;onComplete:(t:ClientTask)=>void;onDelete:(id:string)=>void}){
 const [editing,setEditing]=useState<ClientTask|null>(null);
 const active=tasks.filter(t=>t.clientId===client.id&&t.status!=='completed').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
 const done=tasks.filter(t=>t.clientId===client.id&&t.status==='completed').sort((a,b)=>(b.completedAt||'').localeCompare(a.completedAt||''));
 return <section className="client-tasks-panel">
  <div className="client-tasks-head"><div><strong>Задачі</strong><span>{active.length?String(active.length)+' активних':'Активних задач немає'}</span></div><button className="secondary compact" type="button" onClick={()=>setEditing(emptyTask(client.id))}><Plus size={15}/>Додати</button></div>
  {active.length?<div className="client-task-list">{active.slice(0,6).map(t=><TaskLine key={t.id} task={t} onEdit={setEditing} onComplete={onComplete} onDelete={onDelete}/>)}</div>:<div className="task-empty-mini">На цьому клієнті зараз все виконано.</div>}
  {active.length>6&&<small className="task-more">Ще {active.length-6} задач — дивіться у «Робочій дошці».</small>}
  {done.length>0&&<details className="completed-tasks"><summary>Виконані ({done.length})</summary>{done.slice(0,12).map(t=><div key={t.id}><CheckCircle2 size={13}/><span>{t.title}</span><small>{t.completedAt?new Date(t.completedAt).toLocaleDateString('uk-UA'):''}</small></div>)}</details>}
  {editing&&<TaskEditor task={editing} clients={[client]} onClose={()=>setEditing(null)} onSave={t=>{onSave(t);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}}/>}
 </section>;
}

export default function TasksBoard({clients,tasks,query,onSave,onComplete,onDelete,onOpenClient}:{clients:Client[];tasks:ClientTask[];query:string;onSave:(t:ClientTask)=>void;onComplete:(t:ClientTask)=>void;onDelete:(id:string)=>void;onOpenClient:(c:Client)=>void}){
 const [editing,setEditing]=useState<ClientTask|null>(null);
 const [filter,setFilter]=useState<'all'|'today'|'overdue'|'week'>('all');
 const visibleClients=clients.filter(c=>c.status==='active'&&c.name.toLowerCase().includes(query.toLowerCase()));
 const filteredTasks=useMemo(()=>tasks.filter(t=>{
  if(t.status==='completed')return false;
  if(filter==='today')return t.dueDate===today();
  if(filter==='overdue')return !!t.dueDate&&t.dueDate<today();
  if(filter==='week'){const end=new Date();end.setDate(end.getDate()+7);const e=end.toISOString().slice(0,10);return !!t.dueDate&&t.dueDate>=today()&&t.dueDate<=e;}
  return true;
 }),[tasks,filter]);
 const renderCard=(c:Client)=>{
  const list=filteredTasks.filter(t=>t.clientId===c.id).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
  const overdue=list.filter(t=>!!t.dueDate&&t.dueDate<today()).length;
  return <article className="work-client-card" draggable onDragStart={e=>e.dataTransfer.setData('text/client-id',c.id)} key={c.id}>
   <div className="work-card-head"><button onClick={()=>onOpenClient(c)}><strong>{c.name}</strong><span>{c.service}</span></button><button className="work-card-menu" onClick={()=>onOpenClient(c)}><MoreHorizontal size={17}/></button></div>
   <div className="work-card-meta">{overdue>0&&<span className="work-overdue">{overdue} прострочено</span>}<span>{list.length} активних</span></div>
   <div className="work-card-tasks">{list.slice(0,4).map(t=><TaskLine key={t.id} task={t} onEdit={setEditing} onComplete={onComplete} onDelete={onDelete}/>)}</div>
   {list.length===0&&<div className="work-card-empty">Немає активних задач</div>}
   {list.length>4&&<div className="task-more">+{list.length-4} інших задач</div>}
   <button className="work-add-task" onClick={()=>setEditing(emptyTask(c.id))}><Plus size={15}/>Додати задачу</button>
  </article>;
 };
 return <><div className="heading-row"><div><p className="eyebrow">Робота / Дошка</p><h1>Робоча дошка</h1><p>Кожна картка — клієнт. Усередині — найближчі задачі.</p></div><button className="primary" onClick={()=>setEditing(emptyTask())}><Plus size={18}/>Нова задача</button></div>
 <div className="task-filter-tabs">{(['all','today','overdue','week'] as const).map(f=><button className={filter===f?'active':''} key={f} onClick={()=>setFilter(f)}>{f==='all'?'Усі':f==='today'?'Сьогодні':f==='overdue'?'Прострочені':'7 днів'}</button>)}</div>
 <div className="work-board work-board-active-only">
  <section className="work-column work-column-wide"><div className="work-column-head"><strong>Активні клієнти</strong><span>{visibleClients.length}</span></div><div className="work-active-grid">{visibleClients.map(renderCard)}</div>{!visibleClients.length&&<div className="work-column-empty">Немає активних клієнтів</div>}</section>
 </div>
 {editing&&<TaskEditor task={editing} clients={clients.filter(c=>c.status==='active')} onClose={()=>setEditing(null)} onSave={t=>{onSave(t);setEditing(null);}} onDelete={id=>{onDelete(id);setEditing(null);}}/>}
 </>;
}
