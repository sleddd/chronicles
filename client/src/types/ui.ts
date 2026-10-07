export type ViewMode = 'date' | 'all' | 'tasks' | 'favorites' | 'search';

export interface IconOption {
  name: string;
  icon: import('@fortawesome/fontawesome-svg-core').IconDefinition;
}

export interface DetailEntry {
  id: number;
  preview: string;
  topicName?: string;
  topicIcon?: import('@fortawesome/fontawesome-svg-core').IconDefinition;
}

export interface SessionData {
  id: number;
  deviceInfo: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface MilestoneOption {
  id: number;
  title: string;
}

export interface GoalOption {
  id: number;
  title: string;
}

export interface LinkedTask {
  id: number;
  title: string;
  isCompleted: boolean;
}
