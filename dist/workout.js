import { parseNumber } from './storage.js?v=20260918-1';

export function validSet(set){
  const weight=parseNumber(set.weight),reps=parseNumber(set.reps);
  return Number.isFinite(weight)&&weight>=0&&weight<=100000&&Number.isInteger(reps)&&reps>=1&&reps<=10000;
}
export function recordedEntries(entries){
  return entries.map(entry=>({...entry,sets:entry.sets.filter(validSet).map(set=>({...set,done:true}))})).filter(entry=>entry.sets.length);
}
export function weekRange(day){
  const date=new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
  const start=date.toISOString().slice(0,10);
  date.setUTCDate(date.getUTCDate()+6);
  return [start,date.toISOString().slice(0,10)];
}
