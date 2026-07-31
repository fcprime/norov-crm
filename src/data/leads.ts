export type LeadStatus = 'new'|'call'|'message'|'strategy'|'presented'|'decision'|'later'|'launchPrep'|'paid'|'active'|'completed'|'lost';

export type Lead = {
  id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  service: string;
  source: string;
  campaign: string;
  status: LeadStatus;
  value: number;
  createdAt: string;
  nextAction?: string;
  note?: string;
  formAnswers?: string;
  lostReason?: string;
  externalId?: string;
};

export const initialLeads: Lead[] = [
{id:'1',name:'Ірина Коваль',phone:'+48 690 631 668',service:'Meta Ads',source:'Facebook Lead Ads',campaign:'Аудит реклами — PL',status:'new',value:600,createdAt:'Сьогодні, 15:44'},
{id:'2',name:'Serhii M.',phone:'+38 097 618 0536',service:'Запуск реклами',source:'Instagram',campaign:'Таргет для бізнесу',status:'call',value:1755,createdAt:'Сьогодні, 14:18',nextAction:'Зателефонувати о 18:30'},
{id:'3',name:'Ольга Пономарьова',phone:'+48 539 757 651',service:'Реклама вакансій',source:'Messenger',campaign:'Підбір працівників',status:'message',value:1200,createdAt:'Сьогодні, 13:05',nextAction:'Написати у Messenger',note:'Не взяла слухавку.'},
{id:'4',name:'Valeria',phone:'+48 502 334 600',service:'Стратегія',source:'Facebook Lead Ads',campaign:'Безкоштовний розбір',status:'strategy',value:900,createdAt:'Учора, 19:07',nextAction:'Підготувати стратегію до 02.08'},
{id:'5',name:'Jarosław',phone:'+48 576 869 447',service:'Google + Meta',source:'Facebook Lead Ads',campaign:'Marketing lokalny',status:'presented',value:1400,createdAt:'29.07, 10:31',note:'Стратегію презентовано, клієнт попросив комерційну пропозицію.'},
{id:'6',name:'Anastasiia',phone:'+48 696 474 113',service:'Реклама вакансій',source:'Messenger',campaign:'Робота в Польщі',status:'decision',value:1200,createdAt:'28.07, 17:15',nextAction:'Отримати рішення 01.08'},
{id:'7',name:'Михайло',phone:'+48 720 115 309',service:'Meta Ads',source:'Facebook Lead Ads',campaign:'Просування послуг',status:'later',value:1755,createdAt:'27.07, 16:20',nextAction:'Зв’язатися 15.08',note:'Запуск після завершення сайту.'},
{id:'8',name:'Ірина',phone:'+48 690 631 668',service:'Meta Ads',source:'Facebook Lead Ads',campaign:'Аудит реклами',status:'launchPrep',value:1755,createdAt:'26.07, 12:10',nextAction:'Отримати доступи та матеріали'},
{id:'9',name:'Andrii',phone:'+48 510 220 145',service:'Комплексне ведення',source:'Instagram',campaign:'Таргет для бізнесу',status:'paid',value:1755,createdAt:'25.07, 11:45',note:'Оплату отримано.'},
{id:'10',name:'CleanPro',phone:'+48 509 333 761',service:'Meta Ads',source:'Referral',campaign:'Рекомендація',status:'active',value:2200,createdAt:'20.07, 09:30',nextAction:'Підготувати тижневий звіт'},
{id:'11',name:'Legal Expert',phone:'+48 577 812 440',service:'Meta Ads',source:'Referral',campaign:'Рекомендація',status:'completed',value:4800,createdAt:'01.06, 10:00',note:'Співпрацю завершено, відгук отримано.'},
{id:'12',name:'Volodymyr',phone:'+35 193 452 1984',service:'Просування майстра',source:'Facebook Lead Ads',campaign:'Майстри в Португалії',status:'lost',value:0,createdAt:'27.07, 12:02',note:'Не зійшлися по вартості.',lostReason:'Дорого'}
];

export const statusLabels:Record<LeadStatus,string>={new:'Новий лід',call:'Зателефонувати',message:'Написати в месенджер',strategy:'Готуємо стратегію',presented:'Стратегію презентовано',decision:'Очікуємо рішення',later:'Зв’язатися пізніше',launchPrep:'Підготовка до запуску',paid:'Оплачено',active:'У роботі',completed:'Співпрацю завершено',lost:'Неуспішно закрито'};
