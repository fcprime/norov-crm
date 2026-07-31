import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Filter,
  LayoutDashboard,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  Sparkles,
  Target,
  Users,
  X,
  Save,
  Phone,
  Send,
  Trash2,
  Zap,
  LogOut,
  Upload,
  Download,
  RefreshCw,
  Copy,
  CheckCircle2,
} from 'lucide-react';
import { statusLabels, type Lead, type LeadStatus } from './data/leads';
import {
  bulkCreateLeads,
  createLead,
  deleteLead,
  loadLeads,
  repairImportedLeads,
  updateLead,
} from './lib/leadsRepository';
import { exportLeadsCsv, parseLeadsCsv } from './lib/csv';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const nav = [
  { icon: LayoutDashboard, label: 'Огляд' },
  { icon: Users, label: 'Ліди', active: true },
  { icon: Target, label: 'Воронка' },
  { icon: CalendarDays, label: 'Завдання' },
  { icon: BarChart3, label: 'Аналітика' },
  { icon: MessageCircle, label: 'Шаблони' },
];

const statuses: LeadStatus[] = [
  'new',
  'call',
  'message',
  'strategy',
  'presented',
  'decision',
  'later',
  'launchPrep',
  'paid',
  'active',
  'completed',
  'lost',
];
const lostReasons = [
  'Не зацікавлений',
  'Не відповідає',
  'Не вдалося зв’язатися',
  'Дорого',
  'Обрав іншого спеціаліста',
  'Немає бюджету',
  'Не готовий до запуску',
  'Не підійшла послуга',
  'Неякісний лід',
  'Дублікат',
  'Інше',
];
const emptyLead: Lead = {
  id: '',
  name: '',
  phone: '',
  service: 'Meta Ads',
  source: 'Facebook Lead Ads',
  campaign: '',
  status: 'new',
  value: 0,
  createdAt: 'Сьогодні',
};

function App() {
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [pendingLost, setPendingLost] = useState<{ leadId: string; from: LeadStatus } | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [integrationOpen, setIntegrationOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLeads()
      .then(setLeads)
      .catch((err) => setError(err.message || 'Не вдалося завантажити ліди'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const client = supabase;

    const channel = client
      .channel('norov-crm-leads-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, async () => {
        try {
          const fresh = await loadLeads();
          setLeads(fresh);
          setNotice('Дані оновлено автоматично. Новий лід уже у воронці.');
        } catch (err: any) {
          setError(err.message || 'Не вдалося оновити ліди в реальному часі');
        }
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(
    () =>
      leads.filter((l) =>
        [l.name, l.phone, l.service, l.campaign, l.source]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query, leads],
  );

  async function saveLead(lead: Lead) {
    setSyncing(true);
    setError('');
    try {
      if (lead.id) {
        const saved = await updateLead(lead, leads);
        setLeads((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
      } else {
        const created = await createLead(lead, leads);
        setLeads((prev) => [created, ...prev]);
      }
      setEditingLead(null);
    } catch (err: any) {
      setError(err.message || 'Не вдалося зберегти ліда');
    } finally {
      setSyncing(false);
    }
  }

  async function removeLead(id: string) {
    if (!confirm('Видалити цього ліда?')) return;
    setSyncing(true);
    setError('');
    try {
      await deleteLead(id, leads);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      setEditingLead(null);
    } catch (err: any) {
      setError(err.message || 'Не вдалося видалити ліда');
    } finally {
      setSyncing(false);
    }
  }

  async function persistMove(lead: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? lead : l)));
    setSyncing(true);
    setError('');
    try {
      const saved = await updateLead(lead, leads);
      setLeads((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
    } catch (err: any) {
      setError(err.message || 'Не вдалося змінити статус');
      await loadLeads().then(setLeads);
    } finally {
      setSyncing(false);
    }
  }

  function moveLead(id: string, status: LeadStatus) {
    const current = leads.find((l) => l.id === id);
    if (!current) return;
    if (status === 'lost') {
      setPendingLost({ leadId: id, from: current.status });
      return;
    }
    void persistMove({ ...current, status, lostReason: undefined });
  }

  async function importCsv(file: File | undefined) {
    if (!file) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const parsed = parseLeadsCsv(text);
      if (!parsed.length)
        throw new Error('У файлі не знайдено лідів. Перевірте заголовки колонок.');
      const result = await bulkCreateLeads(parsed, leads);
      setLeads((prev) => [...result.created, ...prev]);
      setNotice(
        `Імпортовано: ${result.created.length}. Пропущено дублів або рядків без телефону: ${result.skipped}.`,
      );
    } catch (err: any) {
      setError(err.message || 'Не вдалося імпортувати CSV');
    } finally {
      setSyncing(false);
      if (importInput.current) importInput.current.value = '';
    }
  }

  async function repairImport() {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const result = await repairImportedLeads(leads);
      setLeads(result.leads);
      setNotice(
        result.repaired
          ? `Виправлено ${result.repaired} імпортованих карток: послуги та відповіді форми розділено.`
          : 'Картки вже мають правильну структуру.',
      );
    } catch (err: any) {
      setError(err.message || 'Не вдалося виправити імпортовані дані');
    } finally {
      setSyncing(false);
    }
  }

  function exportCsv() {
    const csv = exportLeadsCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `norov-crm-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`Експортовано ${filtered.length} лідів.`);
  }

  function closeAsLost(reason: string) {
    if (!pendingLost) return;
    const current = leads.find((l) => l.id === pendingLost.leadId);
    if (current)
      void persistMove({ ...current, status: 'lost', lostReason: reason, nextAction: undefined });
    setPendingLost(null);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NOROV</strong>
            <span>CRM</span>
          </div>
        </div>
        <div className="workspace">
          <div className="avatar small">NA</div>
          <div>
            <strong>Norov Agency</strong>
            <span>Основний простір</span>
          </div>
          <ChevronDown size={16} />
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.label}
              className={item.active ? 'active' : ''}>
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.label === 'Ліди' && <em>{leads.length}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={() => setIntegrationOpen(true)}>
            <Zap size={19} />
            <span>Інтеграції</span>
          </button>
          <button>
            <Settings size={19} />
            <span>Налаштування</span>
          </button>
          <div className="upgrade">
            <Sparkles size={19} />
            <strong>Norov CRM Pro</strong>
            <span>Автоматизуйте обробку лідів</span>
            <button>Дізнатись більше</button>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук лідів, кампаній, номерів..."
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <span className={`sync-badge ${syncing ? 'syncing' : ''}`}>
              {syncing
                ? 'Збереження…'
                : isSupabaseConfigured
                  ? 'База підключена'
                  : 'Локальний режим'}
            </span>
            <button className="icon-btn">
              <Bell size={19} />
              <i />
            </button>
            <div className="avatar">SN</div>
            <div className="user">
              <strong>Serhii Norov</strong>
              <span>Administrator</span>
            </div>
            <button
              className="signout"
              title="Вийти"
              onClick={() => supabase?.auth.signOut()}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <section className="content">
          {notice && (
            <div className="notice-banner">
              {notice}
              <button onClick={() => setNotice('')}>×</button>
            </div>
          )}
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError('')}>×</button>
            </div>
          )}
          <div className="heading-row">
            <div>
              <p className="eyebrow">Продажі / Ліди</p>
              <h1>Ліди</h1>
              <p>Контролюйте заявки, комунікацію та наступні кроки.</p>
            </div>
          </div>
          <div className="stats">
            <Stat
              title="Нові ліди"
              value={String(filtered.filter((l) => l.status === 'new').length)}
              meta="потребують першого контакту"
              icon={Users}
            />
            <Stat
              title="Потрібен контакт"
              value={String(
                filtered.filter((l) => ['call', 'message', 'decision', 'later'].includes(l.status))
                  .length,
              )}
              meta="дзвінки, повідомлення та follow-up"
              icon={Bell}
            />
            <Stat
              title="Клієнти в роботі"
              value={String(filtered.filter((l) => ['paid', 'active'].includes(l.status)).length)}
              meta="оплачені та активні"
              icon={Target}
            />
            <Stat
              title="Сума угод"
              value={`${filtered
                .filter((l) => ['paid', 'active', 'completed'].includes(l.status))
                .reduce((s, l) => s + l.value, 0)
                .toLocaleString('uk-UA')} zł`}
              meta="оплачено, у роботі та завершено"
              icon={CircleDollarSign}
            />
          </div>
          <div className="toolbar">
            <div className="toolbar-left">
              <button
                className="primary add-lead-main"
                onClick={() => setEditingLead({ ...emptyLead })}>
                <Plus size={18} />
                Додати лід
              </button>
              <input
                ref={importInput}
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => void importCsv(e.target.files?.[0])}
              />
              <button
                className="secondary compact"
                onClick={() => importInput.current?.click()}>
                <Upload size={17} />
                Імпорт CSV
              </button>
              <button
                className="secondary compact"
                onClick={exportCsv}>
                <Download size={17} />
                Експорт
              </button>
              <button
                className="secondary compact"
                onClick={() => void repairImport()}>
                Виправити імпорт
              </button>
              <button
                className="secondary compact"
                onClick={async () => {
                  setSyncing(true);
                  try {
                    setLeads(await loadLeads());
                    setNotice('Ліди оновлено.');
                  } catch (err: any) {
                    setError(err.message || 'Не вдалося оновити ліди');
                  } finally {
                    setSyncing(false);
                  }
                }}>
                <RefreshCw size={17} />
                Оновити
              </button>
              <div className="view-switch">
                <button
                  onClick={() => setView('kanban')}
                  className={view === 'kanban' ? 'active' : ''}>
                  Воронка
                </button>
                <button
                  onClick={() => setView('table')}
                  className={view === 'table' ? 'active' : ''}>
                  Таблиця
                </button>
              </div>
            </div>
            <div className="toolbar-actions">
              <button>
                <Filter size={17} />
                Фільтри
              </button>
              <button>
                Усі джерела
                <ChevronDown size={15} />
              </button>
              <button>
                Останні 30 днів
                <ChevronDown size={15} />
              </button>
            </div>
          </div>
          {loading ? (
            <div className="loading-state">Завантажуємо ліди…</div>
          ) : view === 'kanban' ? (
            <Kanban
              leads={filtered}
              onEdit={setEditingLead}
              onMove={moveLead}
              onAdd={(status) => setEditingLead({ ...emptyLead, status })}
            />
          ) : (
            <LeadTable
              leads={filtered}
              onEdit={setEditingLead}
            />
          )}
        </section>
      </main>
      {editingLead && (
        <LeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={saveLead}
          onDelete={editingLead.id ? () => removeLead(editingLead.id) : undefined}
        />
      )}
      {pendingLost && (
        <LostReasonModal
          onClose={() => setPendingLost(null)}
          onSelect={closeAsLost}
        />
      )}
      {integrationOpen && <IntegrationModal onClose={() => setIntegrationOpen(false)} />}
    </div>
  );
}

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
  onEdit,
  onMove,
  onAdd,
}: {
  leads: Lead[];
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

function LeadCard({ lead, onEdit }: { lead: Lead; onEdit: () => void }) {
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
      <h3>{lead.name}</h3>
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

function LeadTable({ leads, onEdit }: { leads: Lead[]; onEdit: (l: Lead) => void }) {
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
                <strong>{l.name}</strong>
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
}: {
  lead: Lead;
  onClose: () => void;
  onSave: (l: Lead) => void;
  onDelete?: () => void;
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
          {onDelete ? (
            <button
              className="danger"
              onClick={onDelete}>
              <Trash2 size={17} />
              Видалити
            </button>
          ) : (
            <span />
          )}
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
