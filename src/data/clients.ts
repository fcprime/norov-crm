export type ClientStatus = 'active' | 'paused' | 'archived';
export type BillingType = 'days' | 'monthly' | 'custom';
export type Currency = 'PLN' | 'EUR' | 'USD' | 'GBP';

export type Client = {
  id: string;
  name: string;
  service: string;
  status: ClientStatus;
  startDate: string;
  billingType: BillingType;
  intervalDays: number;
  amount: number;
  currency: Currency;
  nextPaymentDate: string;
  source?: string;
  contact?: string;
  whatsapp?: string;
  instagram?: string;
  telegram?: string;
  notes?: string;
  archivedAt?: string;
  archiveReason?: string;
  sourceLeadId?: string;
  createdAt?: string;
};

export type Payment = {
  id: string;
  clientId: string;
  dueDate: string;
  paidAt: string;
  amount: number;
  currency: Currency;
  note?: string;
  createdAt?: string;
};

export const emptyClient: Client = {
  id: '',
  name: '',
  service: 'Meta Ads',
  status: 'active',
  startDate: new Date().toISOString().slice(0, 10),
  billingType: 'days',
  intervalDays: 15,
  amount: 0,
  currency: 'PLN',
  nextPaymentDate: new Date().toISOString().slice(0, 10),
  source: '',
  contact: '',
  whatsapp: '',
  instagram: '',
  telegram: '',
  notes: '',
};
