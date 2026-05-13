export interface Ticket {
  id: string;
  text: string;
  status: 'free' | 'taken';
  studentName: string | null;
  studentGroup: string | null;
  takenAt: string | null; // Changed from Timestamp to string for local JSON
}

export interface Assignment {
  id?: string;
  studentName: string;
  ticketId: string;
}

export type AppMode = 'choice' | 'student-login' | 'student-view' | 'admin-login' | 'admin-panel';
