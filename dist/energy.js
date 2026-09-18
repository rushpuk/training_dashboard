import { parseNumber } from './storage.js';

export const DEFAULT_ENERGY = {bodyWeight:null,secondsPerRep:3,restSeconds:90};
export const ENERGY_SOURCE = 'https://pacompendium.com/conditioning-exercise/';
const heavy = new Set(['squat','Barbell_Squat','Front_Barbell_Squat','Goblet_Squat','Smith_Machine_Squat','Hack_Squat','Romanian_Deadlift','Barbell_Deadlift','Trap_Bar_Deadlift']);
export function energyProfile(workout,settings){return workout?.energy?.bodyWeight?workout.energy:settings.energy;}
export function exerciseMET(ex){return ex.loadType==='bodyweight'?(['crunch','Reverse_Crunch','Decline_Crunch'].includes(ex.baseId)?2.8:3):heavy.has(ex.baseId)?5:3.5;}
export function entryEnergy(entry,ex,profile){
  const sets=entry.sets.filter(set=>set.done);
  if(!sets.length)return 0;
  if(!profile?.bodyWeight)return null;
  // ponytail: reps approximate duration; measured active/rest time can replace this heuristic later.
  const seconds=sets.reduce((sum,set)=>sum+parseNumber(set.reps)*profile.secondsPerRep,0)+Math.max(0,sets.length-1)*profile.restSeconds;
  return (exerciseMET(ex)-1)*3.5*profile.bodyWeight/200*(seconds/60);
}
export function workoutEnergy(workout,exercises,settings){
  let total=0;
  for(const entry of workout.entries){const value=entryEnergy(entry,exercises.find(ex=>ex.id===entry.exerciseId),energyProfile(workout,settings));if(value===null)return null;total+=value;}
  return total;
}
export function periodEnergy(workouts,exercises,settings){
  const values=workouts.map(workout=>workoutEnergy(workout,exercises,settings));
  return {total:values.reduce((sum,value)=>sum+(value??0),0),missing:values.filter(value=>value===null).length};
}
