export type TaskStatus = 'planned' | 'in_progress' | 'waiting_client' | 'completed';
export type TaskPriority = 'normal' | 'important' | 'urgent';

export type ClientTask = {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  dueTime?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const emptyTask = (clientId=''): ClientTask => ({
  id:'', clientId, title:'', description:'', status:'planned', priority:'normal',
  dueDate:new Date().toISOString().slice(0,10), dueTime:''
});
