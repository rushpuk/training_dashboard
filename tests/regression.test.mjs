import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialData } from '../dist/catalog.js';
import { validateData } from '../dist/storage.js';
import { validSet, recordedEntries, weekRange } from '../dist/workout.js';
import { entryEnergy, workoutEnergy, periodEnergy, energyProfile } from '../dist/energy.js';

const set=(weight='80',reps='10')=>({id:crypto.randomUUID(),weight,reps,done:false,failure:false});
test('filled sets count without confirmation; empty categories and invalid rows are skipped',()=>{
  const entries=[{id:'filled',sets:[set('80,5'),set('','10'),set('50','0'),set('50','1.5'),set('50','')]},{id:'empty',sets:[]},{id:'skipped',sets:[set('','')]}];
  const result=recordedEntries(entries);
  assert.equal(result.length,1);assert.equal(result[0].sets.length,1);assert.equal(result[0].sets[0].done,true);
  assert.equal(entries[0].sets[0].done,false);assert.equal(validSet(set('0','12')),true);
});
test('Monday–Sunday weeks include month and year boundaries',()=>{
  assert.deepEqual(weekRange('2026-01-01'),['2025-12-29','2026-01-04']);
  assert.deepEqual(weekRange('2026-09-20'),['2026-09-14','2026-09-20']);
  assert.deepEqual(weekRange('2026-09-21'),['2026-09-21','2026-09-27']);
});
test('calories use duration and intensity, and exercise values sum to workout and period totals',()=>{
  const exercises=[{id:'bench',baseId:'bench',loadType:'total'},{id:'squat',baseId:'Barbell_Squat',loadType:'total'}];
  const energy={bodyWeight:80,secondsPerRep:3,restSeconds:90,intensity:'vigorous',durationMinutes:60};
  const workout={energy,entries:exercises.map(ex=>({exerciseId:ex.id,sets:[set(),set(),set()]}))};
  const settings={energy};
  assert.equal(workoutEnergy(workout,exercises,settings),420);
  assert.equal(workout.entries.reduce((sum,entry,i)=>sum+entryEnergy(entry,exercises[i],energy,workout),0),420);
  assert.deepEqual(periodEnergy([workout,workout],exercises,settings),{total:840,missing:0});
  const legacy={bodyWeight:80,secondsPerRep:3,restSeconds:90};
  assert.equal(entryEnergy(workout.entries[0],exercises[0],legacy),15.75);
  assert.equal(entryEnergy({sets:[set('','')]},exercises[0],legacy),0);
  assert.equal(entryEnergy(workout.entries[0],exercises[0],{...legacy,bodyWeight:null}),null);
  assert.equal(energyProfile({energy:{...energy,bodyWeight:null}},{energy:legacy}).durationMinutes,60);
});
test('old backups and new calorie settings survive validation; invalid new fields are rejected',()=>{
  const data=initialData();assert.doesNotThrow(()=>validateData(data));
  data.settings.energy={bodyWeight:80,secondsPerRep:3,restSeconds:90,intensity:'vigorous',durationMinutes:null};
  const workout={id:'history',name:'Test',date:'2026-09-18',startedAt:null,endedAt:null,notes:'',energy:{...data.settings.energy,durationMinutes:60},entries:recordedEntries([{id:'entry',exerciseId:data.exercises[0].id,note:'',sets:[set()]}])};
  data.workouts.push(workout);
  assert.equal(validateData(data).workouts[0].energy.durationMinutes,60);
  workout.energy.durationMinutes=-1;assert.throws(()=>validateData(data));
  workout.energy.durationMinutes=60;workout.energy.intensity='unknown';assert.throws(()=>validateData(data));
});
