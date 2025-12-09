export interface TranscriptionItem {
  id: string;
  text: string;
  sender: 'user' | 'model';
  timestamp: Date;
}

// FIXED: Changed from enum to type union to fix Vercel export error
export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface Language {
  code: string;
  name: string;
  flag: string;
}