import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive, BarChart3, Bell, CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign,
  Copy, Download, Filter, LayoutDashboard, LogOut, MessageCircle, MoreHorizontal, Pause,
  Phone, Plus, RefreshCw, Save, Search, Send, Settings, Sparkles, Target, Trash2,
  Upload, Users, WalletCards, X, Zap,
} from 'lucide-react';
import { statusLabels, type Lead, type LeadStatus } from './data/leads';
import { emptyClient, type Client, type ClientStatus, type Payment } from './data/clients';
import { bulkCreateLeads, createLead, deleteLead, loadLeads, repairImportedLeads, updateLead } from './lib/leadsRepository';
import { loadClients, loadPayments, recordPayment, saveClient } from './lib/clientsRepository';
import { exportLeadsCsv, parseLeadsCsv } from './lib/csv';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const statuses: LeadStatus[] = ['new','call','message','strategy','presented','decision','later','launchPrep','paid','active','completed','lost'];
const lostReasons = ['Не зацікавлений','Не відповідає','Не вдалося зв’язатися','Дорого','Обрав іншого спеціаліста','Немає бюджету','Не готовий до запуску','Не підійшла послуга','Неякісний лід','Дублікат','Інше'];
const emptyLead: Lead = { id:'', name:'', phone:'', service:'Meta Ads', source:'Facebook Lead Ads', campaign:'', status:'new', value:0, createdAt:'Сьогодні' };

type Page = 'dashboard' | 'leads' | 'clients' | 'payments';
const nav: { icon:any; label:string; page:Page }[] = [
  { icon: LayoutDashboard, label:'Огляд', page:'dashboard' },
  { icon: Users, label:'Ліди', page:'leads' },
  { icon: WalletCards, label:'Клієнти', page:'clients' },
  { icon: CircleDollarSign, label:'Оплати', page:'payments' },
];

const today = () => new Date().toISOString().slice(0,10);
const daysDiff = (date:string) => Math.ceil((new Date(`${date}T12:00:00`).getTime() - new Date(`${today()}T12:00:00`).getTime()) / 86400000);
const money = (n:number, currency:string) => `${Number(n || 0).toLocaleString('uk-UA',{maximumFractionDigits:2})} ${currency}`;
const clientStatusLabel: Record<ClientStatus,string> = { active:'Активний', paused:'Пауза', archived:'Архів' };

function contactHref(type:'whatsapp'|'instagram'|'telegram', value?:string){
  const raw=(value||'').trim();
  if(!raw)return '';
  if(/^https?:\/\//i.test(raw))return raw;
  if(type==='whatsapp'){const digits=raw.replace(/\D/g,'');return digits?`https://wa.me/${digits}`:'';}
  const handle=raw.replace(/^@/,'').replace(/^\/+|\/+$/g,'');
  return type==='instagram'?`https://instagram.com/${handle}`:`https://t.me/${handle}`;
}

function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [view, setView] = useState<'table'|'kanban'>('kanban');
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [editingLead, setEditingLead] = useState<Lead|null>(null);
  const [editingClient, setEditingClient] = useState<Client|null>(null);
  const [payingClient, setPayingClient] = useState<Client|null>(null);
  const [pendingLost, setPendingLost] = useState<{leadId:string;from:LeadStatus}|null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const [clientFilter, setClientFilter] = useState<'active'|'paused'|'archived'|'all'>('active');
  const importInput = useRef<HTMLInputElement>(null);

  async function refreshAll() {
    const [freshLeads, freshClients, freshPayments] = await Promise.all([loadLeads(), loadClients(), loadPayments()]);
    setLeads(freshLeads); setClients(freshClients); setPayments(freshPayments);
  }

  useEffect(() => { refreshAll().catch((e:any)=>setError(e.message||'Не вдалося завантажити дані')).finally(()=>setLoading(false)); }, []);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client=supabase;
    const channel=client.channel('norov-crm-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'leads'},()=>void loadLeads().then(setLeads))
      .on('postgres_changes',{event:'*',schema:'public',table:'clients'},()=>void loadClients().then(setClients).catch(()=>{}))
      .on('postgres_changes',{event:'*',schema:'public',table:'payments'},()=>void loadPayments().then(setPayments).catch(()=>{}))
      .subscribe();
    return ()=>{ void client.removeChannel(channel); };
  },[]);

  const filteredLeads = useMemo(()=>leads.filter(l=>[l.name,l.phone,l.service,l.campaign,l.source].join(' ').toLowerCase().includes(query.toLowerCase())),[query,leads]);
  const filteredClients = useMemo(()=>clients.filter(c=>(clientFilter==='all'||c.status===clientFilter) && [c.name,c.service,c.source,c.contact,c.whatsapp,c.instagram,c.telegram].join(' ').toLowerCase().includes(query.toLowerCase())),[clients,clientFilter,query]);
  const paymentRows = useMemo(()=>payments.map(p=>({ ...p, client: clients.find(c=>c.id===p.clientId) })).filter(p=>[p.client?.name,p.client?.service,p.note].join(' ').toLowerCase().includes(query.toLowerCase())),[payments,clients,query]);

  async function saveLeadItem(lead:Lead){ setSyncing(true); setError(''); try { if(lead.id){const saved=await updateLead(lead,leads);setLeads(prev=>prev.map(l=>l.id===saved.id?saved:l));} else {const created=await createLead(lead,leads);setLeads(prev=>[created,...prev]);} setEditingLead(null);} catch(e:any){setError(e.message||'Не вдалося зберегти ліда');} finally{setSyncing(false);} }
  async function removeLead(id:string){ if(!confirm('Видалити цього ліда?'))return; setSyncing(true); try{await deleteLead(id,leads);setLeads(prev=>prev.filter(l=>l.id!==id));setEditingLead(null);}catch(e:any){setError(e.message||'Не вдалося видалити ліда');}finally{setSyncing(false);} }
  async function persistMove(lead:Lead){setLeads(prev=>prev.map(l=>l.id===lead.id?lead:l));setSyncing(true);try{const saved=await updateLead(lead,leads);setLeads(prev=>prev.map(l=>l.id===saved.id?saved:l));}catch(e:any){setError(e.message||'Не вдалося змінити статус');setLeads(await loadLeads());}finally{setSyncing(false);}}
  function moveLead(id:string,status:LeadStatus){const current=leads.find(l=>l.id===id);if(!current)return;if(status==='lost'){setPendingLost({leadId:id,from:current.status});return;}void persistMove({...current,status,lostReason:undefined});}
  function closeAsLost(reason:string){if(!pendingLost)return;const current=leads.find(l=>l.id===pendingLost.leadId);if(current)void persistMove({...current,status:'lost',lostReason:reason,nextAction:undefined});setPendingLost(null);}

  function convertLeadToClient(lead:Lead){
    const existing=clients.find(c=>c.sourceLeadId===lead.id);
    if(existing){
      setEditingLead(null);
      setPage('clients');
      setEditingClient(existing);
      setNotice(`${lead.name}: цей лід уже переведений у клієнти.`);
      return;
    }
    const notes=[
      lead.campaign?`Кампанія: ${lead.campaign}`:'',
      lead.formAnswers?`Відповіді з лід-форми:\n${lead.formAnswers}`:'',
      lead.note?`Примітка з ліда:\n${lead.note}`:'',
    ].filter(Boolean).join('\n\n');
    setEditingLead(null);
    setPage('clients');
    setEditingClient({
      ...emptyClient,
      name:lead.name||'',
      service:lead.service||'Meta Ads',
      contact:lead.phone||'',
      whatsapp:lead.whatsapp||lead.phone||'',
      source:lead.source||'',
      amount:Number(lead.value||0),
      notes,
      sourceLeadId:lead.id,
    });
  }

  async function saveClientItem(client:Client){setSyncing(true);setError('');try{const saved=await saveClient(client,clients);setClients(prev=>client.id?prev.map(c=>c.id===saved.id?saved:c):[saved,...prev]);setEditingClient(null);setNotice(`${saved.name}: дані збережено.`);}catch(e:any){setError(e.message||'Не вдалося зберегти клієнта');}finally{setSyncing(false);}}
  async function setClientStatus(client:Client,status:ClientStatus){
    const patch:Client={...client,status, archivedAt:status==='archived'?today():undefined, archiveReason:status==='archived'?(prompt('Причина завершення співпраці (необов’язково):')||''):undefined};
    await saveClientItem(patch);
  }
  async function confirmPayment(client:Client, amount:number, paidAt:string, note:string){
    setSyncing(true);setError('');try{const result=await recordPayment(client,{clientId:client.id,dueDate:client.nextPaymentDate,paidAt,amount,currency:client.currency,note},clients,payments);setPayments(prev=>[result.payment,...prev]);setClients(prev=>prev.map(c=>c.id===client.id?result.client:c));setPayingClient(null);setNotice(`${client.name}: оплату ${money(amount,client.currency)} зараховано. Наступна дата — ${formatDate(result.client.nextPaymentDate)}.`);}catch(e:any){setError(e.message||'Не вдалося зберегти оплату');}finally{setSyncing(false);}
  }

  async function importCsv(file:File|undefined){if(!file)return;setSyncing(true);setError('');try{const parsed=parseLeadsCsv(await file.text());if(!parsed.length)throw new Error('У файлі не знайдено лідів.');const result=await bulkCreateLeads(parsed,leads);setLeads(prev=>[...result.created,...prev]);setNotice(`Імпортовано: ${result.created.length}. Пропущено: ${result.skipped}.`);}catch(e:any){setError(e.message||'Не вдалося імпортувати CSV');}finally{setSyncing(false);if(importInput.current)importInput.current.value='';}}
  async function repairImport(){setSyncing(true);try{const result=await repairImportedLeads(leads);setLeads(result.leads);setNotice(result.repaired?`Виправлено ${result.repaired} карток.`:'Все вже має правильну структуру.');}catch(e:any){setError(e.message||'Помилка');}finally{setSyncing(false);}}
  function exportCsv(){const csv=exportLeadsCsv(filteredLeads);const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`norov-crm-leads-${today()}.csv`;a.click();URL.revokeObjectURL(url);}

  const activeClients=clients.filter(c=>c.status==='active');
  const overdue=activeClients.filter(c=>daysDiff(c.nextPaymentDate)<0);
  const dueToday=activeClients.filter(c=>daysDiff(c.nextPaymentDate)===0);
  const due7=activeClients.filter(c=>daysDiff(c.nextPaymentDate)>=0&&daysDiff(c.nextPaymentDate)<=7);
  const currentMonth=today().slice(0,7);
  const monthPayments=payments.filter(p=>p.paidAt.startsWith(currentMonth));
  const pageTitle={dashboard:'Огляд',leads:'Ліди',clients:'Клієнти',payments:'Оплати'}[page];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">N</div><div><strong>NOROV</strong><span>CRM</span></div></div>
      <div className="workspace"><div className="avatar small">NA</div><div><strong>Norov Agency</strong><span>Основний простір</span></div><ChevronDown size={16}/></div>
      <nav>{nav.map(item=><button key={item.page} onClick={()=>{setPage(item.page);setQuery('')}} className={page===item.page?'active':''}><item.icon size={19}/><span>{item.label}</span>{item.page==='leads'&&<em>{leads.length}</em>}{item.page==='clients'&&<em>{activeClients.length}</em>}{item.page==='payments'&&overdue.length>0&&<em className="danger-count">{overdue.length}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><button onClick={()=>setIntegrationOpen(true)}><Zap size={19}/><span>Інтеграції</span></button><button><Settings size={19}/><span>Налаштування</span></button></div>
    </aside>
    <main>
      <header className="topbar"><div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`Пошук: ${pageTitle.toLowerCase()}...`}/><kbd>⌘ K</kbd></div><div className="top-actions"><span className={`sync-badge ${syncing?'syncing':''}`}>{syncing?'Збереження…':isSupabaseConfigured?'База підключена':'Локальний режим'}</span><button className="icon-btn"><Bell size={19}/>{overdue.length>0&&<i/>}</button><div className="avatar">SN</div><div className="user"><strong>Serhii Norov</strong><span>Administrator</span></div><button className="signout" title="Вийти" onClick={()=>supabase?.auth.signOut()}><LogOut size={17}/></button></div></header>
      <section className="content">
        {notice&&<div className="notice-banner">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
        {error&&<div className="error-banner">{error}<button onClick={()=>setError('')}>×</button></div>}
        {loading?<div className="loading-state">Завантажуємо CRM…</div>:
          page==='dashboard'?<Dashboard clients={clients} payments={payments} overdue={overdue} dueToday={dueToday} due7={due7} onPay={setPayingClient} onOpenClients={()=>setPage('clients')}/>:page==='leads'?<>
            <div className="heading-row"><div><p className="eyebrow">Продажі / Ліди</p><h1>Ліди</h1><p>Контролюйте заявки, комунікацію та наступні кроки.</p></div></div>
            <div className="stats"><Stat title="Нові ліди" value={String(filteredLeads.filter(l=>l.status==='new').length)} meta="потребують першого контакту" icon={Users}/><Stat title="Потрібен контакт" value={String(filteredLeads.filter(l=>['call','message','decision','later'].includes(l.status)).length)} meta="дзвінки та follow-up" icon={Bell}/><Stat title="Клієнти в роботі" value={String(filteredLeads.filter(l=>['paid','active'].includes(l.status)).length)} meta="оплачені та активні" icon={Target}/><Stat title="Сума угод" value={`${filteredLeads.filter(l=>['paid','active','completed'].includes(l.status)).reduce((s,l)=>s+l.value,0).toLocaleString('uk-UA')} zł`} meta="у воронці продажів" icon={CircleDollarSign}/></div>
            <div className="toolbar"><div className="toolbar-left"><button className="primary add-lead-main" onClick={()=>setEditingLead({...emptyLead})}><Plus size={18}/>Додати лід</button><input ref={importInput} hidden type="file" accept=".csv,text/csv" onChange={e=>void importCsv(e.target.files?.[0])}/><button className="secondary compact" onClick={()=>importInput.current?.click()}><Upload size={17}/>Імпорт CSV</button><button className="secondary compact" onClick={exportCsv}><Download size={17}/>Експорт</button><button className="secondary compact" onClick={()=>void repairImport()}>Виправити імпорт</button><button className="secondary compact" onClick={()=>void loadLeads().then(setLeads)}><RefreshCw size={17}/>Оновити</button><div className="view-switch"><button onClick={()=>setView('kanban')} className={view==='kanban'?'active':''}>Воронка</button><button onClick={()=>setView('table')} className={view==='table'?'active':''}>Таблиця</button></div></div></div>
            {view==='kanban'?<Kanban leads={filteredLeads} clients={clients} onEdit={setEditingLead} onMove={moveLead} onAdd={status=>setEditingLead({...emptyLead,status})}/>:<LeadTable leads={filteredLeads} clients={clients} onEdit={setEditingLead}/>} </>:page==='clients'?<ClientsPage clients={filteredClients} allClients={clients} payments={payments} filter={clientFilter} setFilter={setClientFilter} onAdd={()=>setEditingClient({...emptyClient})} onEdit={setEditingClient} onPay={setPayingClient} onStatus={setClientStatus}/>:<PaymentsPage rows={paymentRows} clients={clients}/>
        }
      </section>
    </main>
    {editingLead&&<LeadModal lead={editingLead} isClient={!!editingLead.id&&clients.some(c=>c.sourceLeadId===editingLead.id)} onConvert={editingLead.id?()=>convertLeadToClient(editingLead):undefined} onClose={()=>setEditingLead(null)} onSave={saveLeadItem} onDelete={editingLead.id?()=>removeLead(editingLead.id):undefined}/>} 
    {editingClient&&<ClientModal client={editingClient} payments={payments.filter(p=>p.clientId===editingClient.id)} onClose={()=>setEditingClient(null)} onSave={saveClientItem}/>} 
    {payingClient&&<PaymentModal client={payingClient} onClose={()=>setPayingClient(null)} onConfirm={confirmPayment}/>} 
    {pendingLost&&<LostReasonModal onClose={()=>setPendingLost(null)} onSelect={closeAsLost}/>} 
    {integrationOpen&&<IntegrationModal onClose={()=>setIntegrationOpen(false)}/>} 
  </div>;
}

function formatDate(date:string){if(!date)return'—';return new Intl.DateTimeFormat('uk-UA',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(`${date}T12:00:00`));}
function paymentBadge(client:Client){if(client.status==='paused')return <span className="pill muted">Пауза</span>;if(client.status==='archived')return <span className="pill muted">Архів</span>;const d=daysDiff(client.nextPaymentDate);if(d<0)return <span className="pill danger">Прострочено {Math.abs(d)} дн.</span>;if(d===0)return <span className="pill warning">Сьогодні</span>;if(d<=3)return <span className="pill soon">Через {d} дн.</span>;return <span className="pill ok">{formatDate(client.nextPaymentDate)}</span>}

function Dashboard({clients,payments,overdue,dueToday,due7,onPay,onOpenClients}:{clients:Client[];payments:Payment[];overdue:Client[];dueToday:Client[];due7:Client[];onPay:(c:Client)=>void;onOpenClients:()=>void}){
  const active=clients.filter(c=>c.status==='active'); const month=today().slice(0,7); const paidMonth=payments.filter(p=>p.paidAt.startsWith(month));
  const byCurrency=(items:{amount:number;currency:string}[])=>['PLN','EUR','USD','GBP'].map(cur=>({cur,total:items.filter(i=>i.currency===cur).reduce((s,i)=>s+i.amount,0)})).filter(x=>x.total>0).map(x=>money(x.total,x.cur)).join(' · ')||'0';
  const attention=[...overdue,...dueToday,...due7.filter(c=>!overdue.some(o=>o.id===c.id)&&!dueToday.some(o=>o.id===c.id))].slice(0,8);
  return <><div className="heading-row"><div><p className="eyebrow">Norov Agency</p><h1>Огляд</h1><p>Головне на сьогодні: клієнти, оплати та прострочення.</p></div></div>
  <div className="stats finance-stats"><Stat title="Активні клієнти" value={String(active.length)} meta={`${clients.filter(c=>c.status==='paused').length} на паузі · ${clients.filter(c=>c.status==='archived').length} в архіві`} icon={Users}/><Stat title="Прострочено" value={String(overdue.length)} meta={byCurrency(overdue)} icon={Bell}/><Stat title="До оплати 7 днів" value={String(due7.length)} meta={byCurrency(due7)} icon={CalendarDays}/><Stat title="Отримано цього місяця" value={String(paidMonth.length)} meta={byCurrency(paidMonth)} icon={CircleDollarSign}/></div>
  <div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Потребують уваги</h2><p>Найближчі та прострочені оплати</p></div><button className="secondary compact" onClick={onOpenClients}>Усі клієнти</button></div>{attention.length?<div className="attention-list">{attention.map(c=><div className="attention-row" key={c.id}><div><strong>{c.name}</strong><span>{c.service}</span></div><div className="attention-amount"><strong>{money(c.amount,c.currency)}</strong>{paymentBadge(c)}</div><button className="primary small-btn" onClick={()=>onPay(c)}><CheckCircle2 size={16}/>Оплачено</button></div>)}</div>:<div className="empty-state"><CheckCircle2 size={34}/><strong>На сьогодні все чисто</strong><span>Прострочених і найближчих оплат немає.</span></div>}</section>
  <section className="panel"><div className="panel-head"><div><h2>Останні оплати</h2><p>Останні зараховані платежі</p></div></div><div className="recent-payments">{payments.slice(0,7).map(p=>{const c=clients.find(x=>x.id===p.clientId);return <div key={p.id}><span><strong>{c?.name||'Клієнт'}</strong><small>{formatDate(p.paidAt)}</small></span><b>{money(p.amount,p.currency)}</b></div>})}{!payments.length&&<div className="empty-mini">Ще немає зарахованих оплат.</div>}</div></section></div></>;
}

function ClientsPage({clients,allClients,payments,filter,setFilter,onAdd,onEdit,onPay,onStatus}:{clients:Client[];allClients:Client[];payments:Payment[];filter:any;setFilter:(v:any)=>void;onAdd:()=>void;onEdit:(c:Client)=>void;onPay:(c:Client)=>void;onStatus:(c:Client,s:ClientStatus)=>void}){
  const total=(c:Client)=>payments.filter(p=>p.clientId===c.id).reduce((s,p)=>s+p.amount,0); const count=(c:Client)=>payments.filter(p=>p.clientId===c.id).length;
  return <><div className="heading-row"><div><p className="eyebrow">Робота / Клієнти</p><h1>Клієнти</h1><p>Один клієнт — одна картка. Продовження зберігаються як оплати.</p></div><button className="primary" onClick={onAdd}><Plus size={18}/>Додати клієнта</button></div>
  <div className="client-tabs">{(['active','paused','archived','all'] as const).map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f==='active'?'Активні':f==='paused'?'Пауза':f==='archived'?'Архів':'Усі'} <em>{f==='all'?allClients.length:allClients.filter(c=>c.status===f).length}</em></button>)}</div>
  <div className="client-table-wrap"><table className="client-table"><thead><tr><th>Клієнт</th><th>Наступна оплата</th><th>Сума</th><th>З нами</th><th>Оплат</th><th>LTV</th><th>Статус</th><th></th></tr></thead><tbody>{clients.map(c=>{const days=Math.max(1,Math.floor((Date.now()-new Date(`${c.startDate}T12:00:00`).getTime())/86400000));return <tr key={c.id}><td onClick={()=>onEdit(c)} className="clickable"><strong>{c.name}</strong><span>{c.service}</span></td><td>{paymentBadge(c)}</td><td><strong>{money(c.amount,c.currency)}</strong><span>{c.billingType==='monthly'?'щомісяця':`кожні ${c.intervalDays} дн.`}</span></td><td>{days<31?`${days} дн.`:`${(days/30.44).toFixed(1)} міс.`}</td><td>{count(c)}</td><td><strong>{money(total(c),c.currency)}</strong></td><td><span className={`status-dot ${c.status}`}/>{clientStatusLabel[c.status]}</td><td><div className="row-actions">{c.status==='active'&&<button title="Оплачено" onClick={()=>onPay(c)}><CheckCircle2 size={17}/></button>}{c.status==='active'&&<button title="Пауза" onClick={()=>void onStatus(c,'paused')}><Pause size={17}/></button>}{c.status==='paused'&&<button title="Повернути" onClick={()=>void onStatus(c,'active')}><RefreshCw size={17}/></button>}{c.status!=='archived'&&<button title="Архів" onClick={()=>void onStatus(c,'archived')}><Archive size={17}/></button>}{c.status==='archived'&&<button title="Повернути в активні" onClick={()=>void onStatus(c,'active')}><RefreshCw size={17}/></button>}</div></td></tr>})}{!clients.length&&<tr><td colSpan={8}><div className="empty-table">Тут поки немає клієнтів.</div></td></tr>}</tbody></table></div></>;
}

function PaymentsPage({rows,clients}:{rows:(Payment&{client?:Client})[];clients:Client[]}){
  const month=today().slice(0,7); const thisMonth=rows.filter(p=>p.paidAt.startsWith(month));
  return <><div className="heading-row"><div><p className="eyebrow">Фінанси / Оплати</p><h1>Оплати</h1><p>Історія платежів зберігається окремо від картки клієнта.</p></div></div><div className="stats"><Stat title="Оплат цього місяця" value={String(thisMonth.length)} meta="фактично зараховано" icon={CheckCircle2}/><Stat title="Активні клієнти" value={String(clients.filter(c=>c.status==='active').length)} meta="очікуємо наступні платежі" icon={Users}/><Stat title="Прострочених" value={String(clients.filter(c=>c.status==='active'&&daysDiff(c.nextPaymentDate)<0).length)} meta="потребують уваги" icon={Bell}/></div><div className="client-table-wrap"><table className="client-table"><thead><tr><th>Клієнт</th><th>Планова дата</th><th>Дата оплати</th><th>Сума</th><th>Примітка</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><strong>{p.client?.name||'Клієнт'}</strong><span>{p.client?.service||''}</span></td><td>{formatDate(p.dueDate)}</td><td>{formatDate(p.paidAt)}</td><td><strong>{money(p.amount,p.currency)}</strong></td><td>{p.note||'—'}</td></tr>)}{!rows.length&&<tr><td colSpan={5}><div className="empty-table">Історія оплат ще порожня.</div></td></tr>}</tbody></table></div></>;
}

function ClientModal({client,payments,onClose,onSave}:{client:Client;payments:Payment[];onClose:()=>void;onSave:(c:Client)=>void}){const [draft,setDraft]=useState(client);const ltv=payments.reduce((s,p)=>s+p.amount,0);return <div className="modal-backdrop"><div className="modal client-modal"><div className="modal-head"><div><span>Картка клієнта</span><h2>{client.id?client.name:client.sourceLeadId?'Новий клієнт з ліда':'Новий клієнт'}</h2></div><button onClick={onClose}><X size={20}/></button></div>{!client.id&&client.sourceLeadId&&<div className="lead-import-note"><CheckCircle2 size={17}/><span>Дані з ліда вже перенесені. Перевірте та дозаповніть суму, дати й цикл оплати.</span></div>}{client.id&&<div className="client-kpis"><div><span>LTV</span><strong>{money(ltv,client.currency)}</strong></div><div><span>Оплат</span><strong>{payments.length}</strong></div><div><span>Старт</span><strong>{formatDate(client.startDate)}</strong></div></div>}<div className="form-grid"><label>Клієнт / компанія<input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Ніша / послуга<input value={draft.service} onChange={e=>setDraft({...draft,service:e.target.value})}/></label><label>Дата старту<input type="date" value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></label><label>Наступна оплата<input type="date" value={draft.nextPaymentDate} onChange={e=>setDraft({...draft,nextPaymentDate:e.target.value})}/></label><label>Сума<input type="number" step="0.01" value={draft.amount} onChange={e=>setDraft({...draft,amount:Number(e.target.value)})}/></label><label>Валюта<select value={draft.currency} onChange={e=>setDraft({...draft,currency:e.target.value as any})}><option>PLN</option><option>EUR</option><option>USD</option><option>GBP</option></select></label><label>Тип оплати<select value={draft.billingType} onChange={e=>setDraft({...draft,billingType:e.target.value as any})}><option value="days">Кожні N днів</option><option value="monthly">Раз на місяць</option><option value="custom">Свій цикл у днях</option></select></label><label>Цикл, днів<input type="number" min="1" disabled={draft.billingType==='monthly'} value={draft.intervalDays} onChange={e=>setDraft({...draft,intervalDays:Number(e.target.value)})}/></label><label>Інший контакт<input value={draft.contact||''} onChange={e=>setDraft({...draft,contact:e.target.value})} placeholder="Телефон, email або інше"/></label><label>Джерело клієнта<input value={draft.source||''} onChange={e=>setDraft({...draft,source:e.target.value})}/></label><div className="client-contact-section full"><div className="contact-section-title"><div><strong>Зв’язок з клієнтом</strong><span>Можна вказати номер або username. Після збереження з’являться швидкі кнопки переходу.</span></div></div><div className="contact-grid"><label>WhatsApp<input value={draft.whatsapp||''} onChange={e=>setDraft({...draft,whatsapp:e.target.value})} placeholder="+48 600 000 000"/></label><label>Instagram<input value={draft.instagram||''} onChange={e=>setDraft({...draft,instagram:e.target.value})} placeholder="@username"/></label><label>Telegram<input value={draft.telegram||''} onChange={e=>setDraft({...draft,telegram:e.target.value})} placeholder="@username"/></label></div>{client.id&&(draft.whatsapp||draft.instagram||draft.telegram)&&<div className="contact-quick-links">{draft.whatsapp&&<a href={contactHref('whatsapp',draft.whatsapp)} target="_blank" rel="noreferrer"><MessageCircle size={16}/>WhatsApp</a>}{draft.instagram&&<a href={contactHref('instagram',draft.instagram)} target="_blank" rel="noreferrer"><Send size={16}/>Instagram</a>}{draft.telegram&&<a href={contactHref('telegram',draft.telegram)} target="_blank" rel="noreferrer"><Send size={16}/>Telegram</a>}</div>}</div><label className="full">Коментар<textarea rows={3} value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label></div>{client.id&&payments.length>0&&<div className="payment-history-mini"><h3>Останні оплати</h3>{payments.slice(0,5).map(p=><div key={p.id}><span>{formatDate(p.paidAt)}</span><strong>{money(p.amount,p.currency)}</strong></div>)}</div>}<div className="client-modal-actions"><button className="secondary" onClick={onClose}>Скасувати</button><button className="primary" disabled={!draft.name||!draft.nextPaymentDate} onClick={()=>onSave(draft)}><Save size={17}/>Зберегти</button></div></div></div>}

function PaymentModal({client,onClose,onConfirm}:{client:Client;onClose:()=>void;onConfirm:(c:Client,a:number,d:string,n:string)=>void}){const [amount,setAmount]=useState(client.amount);const [paidAt,setPaidAt]=useState(today());const [note,setNote]=useState('');return <div className="modal-backdrop"><div className="modal payment-modal"><div className="modal-head"><div><span>Зарахувати оплату</span><h2>{client.name}</h2></div><button onClick={onClose}><X size={20}/></button></div><div className="payment-summary"><span>Планова дата<strong>{formatDate(client.nextPaymentDate)}</strong></span><span>Сума за договором<strong>{money(client.amount,client.currency)}</strong></span></div><div className="form-grid one"><label>Фактична сума<input type="number" step="0.01" value={amount} onChange={e=>setAmount(Number(e.target.value))}/></label><label>Дата отримання<input type="date" value={paidAt} onChange={e=>setPaidAt(e.target.value)}/></label><label>Коментар<textarea rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Наприклад: оплата за другу половину місяця"/></label></div><div className="modal-actions"><button className="secondary" onClick={onClose}>Скасувати</button><button className="primary" onClick={()=>onConfirm(client,amount,paidAt,note)}><CheckCircle2 size={17}/>Підтвердити оплату</button></div></div></div>}

function Stat({
  title,
  value,
  meta,
  icon: Icon,
}: {
  title: string;
  value: string;
  meta: string;
  icon: any;
}) {
  return (
    <article className="stat-card">
      <div className="stat-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  );
}

function Kanban({
  leads,
  clients,
  onEdit,
  onMove,
  onAdd,
}: {
  leads: Lead[];
  clients: Client[];
  onEdit: (l: Lead) => void;
  onMove: (id: string, s: LeadStatus) => void;
  onAdd: (s: LeadStatus) => void;
}) {
  return (
    <div className="kanban">
      {statuses.map((status) => {
        const items = leads.filter((l) => l.status === status);
        const total = items.reduce((s, l) => s + l.value, 0);
        return (
          <section
            className="column"
            key={status}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onMove(e.dataTransfer.getData('leadId'), status)}>
            <div className="column-head">
              <div>
                <span className={`dot ${status}`} />
                <strong>{statusLabels[status]}</strong>
                <em>{items.length}</em>
              </div>
              <button>
                <MoreHorizontal size={18} />
              </button>
            </div>
            <p className="column-total">{total.toLocaleString('uk-UA')} zł</p>
            <div className="cards">
              {items.map((lead) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  isClient={clients.some(c=>c.sourceLeadId===lead.id)}
                  onEdit={() => onEdit(lead)}
                />
              ))}
            </div>
            <button
              className="add-card"
              onClick={() => onAdd(status)}>
              <Plus size={16} />
              Додати лід
            </button>
          </section>
        );
      })}
    </div>
  );
}

function LeadCard({ lead, isClient, onEdit }: { lead: Lead; isClient: boolean; onEdit: () => void }) {
  return (
    <article
      className="lead-card"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('leadId', String(lead.id))}
      onClick={onEdit}>
      <div className="lead-top">
        <span className="source-badge">
          {lead.source.includes('Facebook')
            ? 'FB'
            : lead.source.includes('Instagram')
              ? 'IG'
              : lead.source.includes('Messenger')
                ? 'MSG'
                : 'REF'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}>
          <MoreHorizontal size={17} />
        </button>
      </div>
      <div className="lead-name-row"><h3>{lead.name}</h3>{isClient&&<span className="client-badge">Клієнт</span>}</div>
      <p className="phone">{lead.phone}</p>
      <div className="service">{lead.service}</div>
      <p className="campaign">{lead.campaign}</p>
      {lead.nextAction && (
        <div className="next">
          <CalendarDays size={15} />
          {lead.nextAction}
        </div>
      )}
      {lead.note && <p className="note">{lead.note}</p>}
      {lead.lostReason && <p className="lost-reason">Причина: {lead.lostReason}</p>}
      <footer>
        <span>{lead.createdAt}</span>
        <strong>{lead.value ? `${lead.value.toLocaleString('uk-UA')} zł` : '—'}</strong>
      </footer>
    </article>
  );
}

function LeadTable({ leads, clients, onEdit }: { leads: Lead[]; clients: Client[]; onEdit: (l: Lead) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Лід</th>
            <th>Послуга</th>
            <th>Джерело</th>
            <th>Статус</th>
            <th>Наступний крок</th>
            <th>Сума</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr
              key={l.id}
              onClick={() => onEdit(l)}>
              <td>
                <div className="lead-table-name"><strong>{l.name}</strong>{clients.some(c=>c.sourceLeadId===l.id)&&<span className="client-badge">Клієнт</span>}</div>
                <span>{l.phone}</span>
              </td>
              <td>{l.service}</td>
              <td>{l.source}</td>
              <td>
                <span className={`status-pill ${l.status}`}>{statusLabels[l.status]}</span>
              </td>
              <td>{l.nextAction || '—'}</td>
              <td>
                <strong>{l.value ? `${l.value.toLocaleString('uk-UA')} zł` : '—'}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadModal({
  lead,
  onClose,
  onSave,
  onDelete,
  onConvert,
  isClient,
}: {
  lead: Lead;
  onClose: () => void;
  onSave: (l: Lead) => void;
  onDelete?: () => void;
  onConvert?: () => void;
  isClient?: boolean;
}) {
  const [form, setForm] = useState<Lead>({ ...lead });
  const [aiOpen, setAiOpen] = useState(false);
  const set = (key: keyof Lead, value: any) => setForm((prev) => ({ ...prev, [key]: value }));
  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}>
      <div
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Картка ліда</p>
            <h2>{form.id ? 'Редагування ліда' : 'Новий лід'}</h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="quick-actions">
          <a href={`tel:${form.phone}`}>
            <Phone size={17} />
            Подзвонити
          </a>
          <a
            target="_blank"
            href={`https://wa.me/${(form.whatsapp || form.phone).replace(/\D/g, '')}`}>
            <Send size={17} />
            WhatsApp
          </a>
          <button
            className="ai-action"
            onClick={() => setAiOpen((v) => !v)}>
            <Sparkles size={17} />
            AI: перше повідомлення
          </button>
        </div>
        {aiOpen && (
          <AiFirstMessage
            lead={form}
            onUse={(text) => {
              set('note', [form.note, `Перше повідомлення:\n${text}`].filter(Boolean).join('\n\n'));
              setAiOpen(false);
            }}
          />
        )}
        <div className="form-grid">
          <label>
            Ім’я
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Ім’я або назва компанії"
            />
          </label>
          <label>
            Телефон
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="+48..."
            />
          </label>
          <label>
            WhatsApp
            <input
              value={form.whatsapp || ''}
              onChange={(e) => set('whatsapp', e.target.value)}
              placeholder="Якщо відрізняється від телефону"
            />
          </label>
          <label>
            Послуга
            <input
              value={form.service}
              onChange={(e) => set('service', e.target.value)}
            />
          </label>
          <label>
            Джерело
            <select
              value={form.source}
              onChange={(e) => set('source', e.target.value)}>
              <option>Facebook Lead Ads</option>
              <option>Instagram</option>
              <option>Messenger</option>
              <option>Referral</option>
              <option>Website</option>
              <option>Інше</option>
            </select>
          </label>
          <label className="wide">
            Кампанія
            <input
              value={form.campaign}
              onChange={(e) => set('campaign', e.target.value)}
              placeholder="Назва кампанії або лід-форми"
            />
          </label>
          <label>
            Статус
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as LeadStatus)}>
              {statuses.map((s) => (
                <option
                  key={s}
                  value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сума, zł
            <input
              type="number"
              value={form.value}
              onChange={(e) => set('value', Number(e.target.value))}
            />
          </label>
          <label className="wide">
            Наступний крок
            <input
              value={form.nextAction || ''}
              onChange={(e) => set('nextAction', e.target.value)}
              placeholder="Наприклад: зателефонувати 03.08 о 12:00"
            />
          </label>
          <label className="wide">
            Відповіді з лід-форми
            <textarea
              rows={4}
              value={form.formAnswers || ''}
              onChange={(e) => set('formAnswers', e.target.value)}
              placeholder="Відповіді, які клієнт залишив у рекламі"
            />
          </label>
          <label className="wide">
            Робоча примітка
            <textarea
              rows={5}
              value={form.note || ''}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Результат розмови, заперечення, домовленості..."
            />
          </label>
          {form.status === 'lost' && (
            <label className="wide">
              Причина закриття
              <select
                value={form.lostReason || ''}
                onChange={(e) => set('lostReason', e.target.value)}>
                <option value="">Оберіть причину</option>
                {lostReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="modal-footer">
          <div className="lead-footer-left">
            {onDelete&&<button className="danger" onClick={onDelete}><Trash2 size={17}/>Видалити</button>}
            {onConvert&&<button className={isClient?'secondary converted':'convert-client-btn'} onClick={onConvert}>{isClient?<><CheckCircle2 size={17}/>Відкрити клієнта</>:<><WalletCards size={17}/>Перевести в клієнти</>}</button>}
          </div>
          <div>
            <button
              className="secondary"
              onClick={onClose}>
              Скасувати
            </button>
            <button
              className="primary"
              disabled={
                !form.name.trim() ||
                !form.phone.trim() ||
                (form.status === 'lost' && !form.lostReason)
              }
              onClick={() => onSave(form)}>
              <Save size={17} />
              Зберегти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AiFirstMessage({ lead, onUse }: { lead: Lead; onUse: (text: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    recommended: string;
    alternative: string;
    rationale: string;
    language: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  async function generate() {
    if (!supabase) {
      setError('Supabase не підключено.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Сесію не знайдено. Вийдіть із CRM та увійдіть повторно.');
      const { data, error } = await supabase.functions.invoke('ai-first-message', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: {
          name: lead.name,
          service: lead.service,
          source: lead.source,
          campaign: lead.campaign,
          formAnswers: lead.formAnswers || '',
          note: lead.note || '',
        },
      });
      if (error) {
        let message = error.message || 'Edge Function повернула помилку';
        try {
          const details = await error.context?.json?.();
          if (details?.error) message = details.error;
        } catch {}
        throw new Error(message);
      }
      if (!data?.recommended) throw new Error('AI не повернув повідомлення');
      setResult(data);
      setMessage(data.recommended);
    } catch (err: any) {
      setError(err.message || 'Не вдалося створити повідомлення');
    } finally {
      setLoading(false);
    }
  }
  async function copy() {
    await navigator.clipboard.writeText(message);
  }
  const number = (lead.whatsapp || lead.phone).replace(/\D/g, '');
  return (
    <div className="ai-panel">
      <div className="ai-panel-head">
        <div>
          <strong>
            <Sparkles size={17} />
            AI-рекомендація
          </strong>
          <span>На основі відповідей із форми та послуги</span>
        </div>
        <button
          onClick={generate}
          disabled={loading}>
          {loading ? (
            <RefreshCw
              className="spin"
              size={16}
            />
          ) : (
            <Sparkles size={16} />
          )}{' '}
          {result ? 'Створити ще' : 'Створити повідомлення'}
        </button>
      </div>
      {error && <p className="ai-error">{error}</p>}
      {!result && !loading && (
        <p className="ai-hint">
          AI запропонує коротке людяне перше повідомлення без шаблонного «Вас вітає компанія…», з
          прив’язкою до заявки клієнта.
        </p>
      )}
      {result && (
        <>
          <label>
            Рекомендований текст
            <textarea
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div className="ai-rationale">
            <strong>Чому так:</strong> {result.rationale}
          </div>
          <details>
            <summary>Альтернативний варіант</summary>
            <p>{result.alternative}</p>
            <button
              className="secondary compact"
              onClick={() => setMessage(result.alternative)}>
              Використати цей
            </button>
          </details>
          <div className="ai-buttons">
            <button
              className="secondary"
              onClick={copy}>
              <Copy size={16} />
              Копіювати
            </button>
            <a
              className="secondary"
              target="_blank"
              href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}>
              <Send size={16} />
              Відкрити WhatsApp
            </a>
            <button
              className="primary"
              onClick={() => onUse(message)}>
              Додати в примітку
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function IntegrationModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const webhookUrl = base
    ? `${base}/functions/v1/facebook-lead`
    : 'Спочатку додайте VITE_SUPABASE_URL у .env.local';
  async function copyUrl() {
    if (!base) return;
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={onClose}>
      <div
        className="integration-modal"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Автоматизація</p>
            <h2>Facebook Lead Ads → Make → CRM</h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <p className="integration-intro">
          Після розгортання Edge Function вставте цю адресу в модуль HTTP у Make. Нові заявки
          автоматично з’являтимуться в колонці «Новий лід» без перезавантаження сторінки.
        </p>
        <label className="webhook-field">
          Webhook URL
          <div>
            <code>{webhookUrl}</code>
            <button
              onClick={copyUrl}
              disabled={!base}>
              {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}{' '}
              {copied ? 'Скопійовано' : 'Копіювати'}
            </button>
          </div>
        </label>
        <div className="integration-steps">
          <article>
            <strong>1</strong>
            <div>
              <h3>Розгорніть функцію</h3>
              <p>У Terminal виконайте команди з README у папці v9.</p>
            </div>
          </article>
          <article>
            <strong>2</strong>
            <div>
              <h3>Додайте секрет у Make</h3>
              <p>
                У заголовку HTTP-запиту передавайте <code>x-webhook-secret</code>.
              </p>
            </div>
          </article>
          <article>
            <strong>3</strong>
            <div>
              <h3>Передайте поля ліда</h3>
              <p>lead_id, name, phone, form_name, campaign_name та answers.</p>
            </div>
          </article>
        </div>
        <div className="payload-example">
          <span>Приклад JSON для Make</span>
          <pre>{`{
  "lead_id": "{{Lead ID}}",
  "name": "{{Full name}}",
  "phone": "{{Phone number}}",
  "form_name": "{{Form name}}",
  "campaign_name": "{{Campaign name}}",
  "answers": {
    "Чи запускали рекламу раніше?": "ні",
    "Які послуги ви рекламуєте?": "детейлінг послуги"
  }
}`}</pre>
        </div>
        <div className="modal-footer">
          <span />
          <button
            className="primary"
            onClick={onClose}>
            Готово
          </button>
        </div>
      </div>
    </div>
  );
}

function LostReasonModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (r: string) => void;
}) {
  return (
    <div className="modal-backdrop">
      <div className="reason-modal">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Закриття ліда</p>
            <h2>Оберіть причину</h2>
          </div>
          <button onClick={onClose}>
            <X />
          </button>
        </div>
        <p>Причина потрібна для аналітики та розуміння, чому ми втрачаємо заявки.</p>
        <div className="reason-grid">
          {lostReasons.map((r) => (
            <button
              key={r}
              onClick={() => onSelect(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
