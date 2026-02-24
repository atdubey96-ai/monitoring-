export type BurnerState = 'B' | 'N' | 'O' | 'C';

export interface BurnerData {
  id?: string;
  wall: 'A' | 'B' | 'C' | 'D';
  row: number;
  burner_num: number;
  state: BurnerState;
  updated_at?: string;
}

export interface TempReading {
  id?: string;
  timestamp: string;
  shift: 'Morning' | 'Evening' | 'Night';
  ab_cot: number | null;
  cd_cot: number | null;
  flue_gas: number | null;
  excess_o2: number | null;
  prereformer_max: number | null;
  prereformer_min: number | null;
  peep_holes: Record<string, (number | string)[]>;
  created_at?: string;
}

export interface CleaningEvent {
  id?: string;
  wall: string;
  row: number;
  burner_num: number;
  cleaning_date: string;
  created_at?: string;
}

export interface TipDamageRecord {
  id?: string;
  wall: string;
  row: number;
  burner_num: number;
  damaged: 'Yes' | 'No';
  damage_date: string | null;
  replaced: 'Yes' | 'No';
  replace_date: string | null;
  remarks: string;
  updated_at?: string;
}

export interface UserProfile {
  employee_id: string;
  password_hash: string;
}
