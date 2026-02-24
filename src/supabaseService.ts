import { supabase } from './supabase';
import { BurnerData, TempReading, CleaningEvent, TipDamageRecord } from './types';

export const supabaseService = {
  // Burner Data
  async getBurners() {
    const { data, error } = await supabase
      .from('burners')
      .select('*')
      .order('wall', { ascending: true })
      .order('row', { ascending: true })
      .order('burner_num', { ascending: true });
    
    if (error) throw error;
    return data as BurnerData[];
  },

  async updateBurner(wall: string, row: number, burner_num: number, state: string) {
    const { error } = await supabase
      .from('burners')
      .upsert({ wall, row, burner_num, state, updated_at: new Date().toISOString() }, { onConflict: 'wall,row,burner_num' });
    
    if (error) throw error;
  },

  // Temperature Readings
  async getTempReadings() {
    const { data, error } = await supabase
      .from('temp_readings')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    return data as TempReading[];
  },

  async saveTempReading(reading: Omit<TempReading, 'id' | 'created_at'>) {
    const { error } = await supabase
      .from('temp_readings')
      .insert(reading);
    
    if (error) throw error;
  },

  // Cleaning History
  async getCleaningHistory() {
    const { data, error } = await supabase
      .from('cleaning_history')
      .select('*')
      .order('cleaning_date', { ascending: false });
    
    if (error) throw error;
    return data as CleaningEvent[];
  },

  async saveCleaningEvent(event: Omit<CleaningEvent, 'id' | 'created_at'>) {
    const { error } = await supabase
      .from('cleaning_history')
      .insert(event);
    
    if (error) throw error;
  },

  // Tip Damage
  async getTipDamage() {
    const { data, error } = await supabase
      .from('tip_damage')
      .select('*')
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    return data as TipDamageRecord[];
  },

  async saveTipDamage(record: Omit<TipDamageRecord, 'id' | 'updated_at'>) {
    const { error } = await supabase
      .from('tip_damage')
      .upsert(record, { onConflict: 'wall,row,burner_num' });
    
    if (error) throw error;
  },

  // Auth (Simplified for this migration)
  async verifyUser(employeeId: string, passwordHash: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('password_hash', passwordHash)
      .single();
    
    if (error) return null;
    return data;
  }
};
