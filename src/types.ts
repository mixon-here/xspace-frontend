export interface TranscriptionItem {
  id: string;
  text: string;
  sender: 'user' | 'model'; // 'user' is the Twitter Space audio, 'model' is the translator
  timestamp: Date;
}

export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export interface Language {
  code: string;
  name: string;
  flag: string;
}