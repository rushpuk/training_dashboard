const DB_NAME='full-body-journal';
let db;
let revision=0;
let queue=Promise.resolve();
export async function loadData(){
  db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('journal');
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Закрой другие вкладки дневника и открой его снова.'));
  });
  const record=await new Promise((resolve,reject)=>{
    const transaction=db.transaction('journal','readonly');
    const request=transaction.objectStore('journal').get('main');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
  revision=record?.revision||0;
  return record?.data||null;
}
export function saveData(data){
  const snapshot=structuredClone(data);
  const write=()=>new Promise((resolve,reject)=>{
    if(!db){reject(new Error('Хранилище недоступно. Экспортируй историю и открой приложение снова.'));return;}
    let conflict=false;
    const transaction=db.transaction('journal','readwrite');
    const store=transaction.objectStore('journal');
    const read=store.get('main');
    read.onsuccess=()=>{
      if((read.result?.revision||0)!==revision){conflict=true;transaction.abort();return;}
      store.put({revision:revision+1,data:snapshot},'main');
    };
    transaction.oncomplete=()=>{revision+=1;resolve();};
    transaction.onerror=()=>{};
    transaction.onabort=()=>reject(new Error(conflict?'Дневник изменён в другой вкладке. Сохрани копию текущего ввода и перезагрузи страницу.':transaction.error?.name==='QuotaExceededError'?'В памяти браузера недостаточно места. Экспортируй историю, прежде чем освобождать место.':'Не удалось сохранить данные на устройстве. Текущий ввод остаётся на экране.'));
  });
  queue=queue.catch(()=>{}).then(write);
  return queue;
}
export function parseNumber(value){
  const text=String(value).trim().replace(',','.');
  return /^\d+(?:\.\d+)?$/.test(text)?Number(text):NaN;
}
export function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function validateData(raw){
  const fail=()=>{throw new Error('Файл не похож на совместимую резервную копию Full Body. Текущая история не изменена.');};
  const obj=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const string=(value,max=1000)=>{if(typeof value!=='string'||value.length>max)fail();return value;};
  const list=(value,max)=>{if(!Array.isArray(value)||value.length>max)fail();return value;};
  const id=value=>{string(value,100);if(!/^[a-zA-Z0-9_-]+$/.test(value))fail();return value;};
  const unique=items=>{if(new Set(items.map(item=>item.id)).size!==items.length)fail();return items;};
  const url=value=>{const text=string(value,2000);if(text){try{if(new URL(text).protocol!=='https:')fail();}catch{fail();}}return text;};
  const date=value=>{if(!validDate(value))fail();return value;};
  const timestamp=value=>{if(value===null)return null;if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))fail();return value;};
  if(!obj(raw)||raw.version!==1||!obj(raw.settings))fail();
  if(!['system','light','dark'].includes(raw.settings.theme)||!Number.isInteger(raw.settings.defaultSets)||raw.settings.defaultSets<1||raw.settings.defaultSets>20||typeof raw.settings.singleOpen!=='boolean')fail();
  const settings={theme:raw.settings.theme,defaultSets:raw.settings.defaultSets,singleOpen:raw.settings.singleOpen,lastBackup:timestamp(raw.settings.lastBackup)};
  const exercises=unique(list(raw.exercises,2000).map(ex=>{
    if(!obj(ex)||!['legs','chest','back','shoulders','triceps','biceps','abs'].includes(ex.group)||!['total','each','bodyweight'].includes(ex.loadType)||typeof ex.favorite!=='boolean')fail();
    const name=string(ex.name,140);if(!name.trim())fail();
    return {id:id(ex.id),name,group:ex.group,equipment:string(ex.equipment,180),loadType:ex.loadType,baseId:id(ex.baseId),machine:string(ex.machine,140),setup:string(ex.setup,2000),notes:string(ex.notes,5000),sourceUrl:url(ex.sourceUrl),favorite:ex.favorite};
  }));
  const exerciseIds=new Set(exercises.map(ex=>ex.id));
  const exerciseId=value=>{if(!exerciseIds.has(value))fail();return value;};
  const templates=unique(list(raw.templates,500).map(template=>({id:id(template.id),name:string(template.name,140),entries:list(template.entries,200).map(entry=>{if(!Number.isInteger(entry.sets)||entry.sets<1||entry.sets>100)fail();return {exerciseId:exerciseId(entry.exerciseId),sets:entry.sets};})})));
  const workout=(value,isDraft)=>{
    if(!obj(value))fail();
    const entries=unique(list(value.entries,200).map(entry=>({id:id(entry.id),exerciseId:exerciseId(entry.exerciseId),note:string(entry.note,5000),sets:unique(list(entry.sets,100).map(set=>{
      const weight=string(set.weight,16),reps=string(set.reps,8);
      if(typeof set.done!=='boolean'||typeof set.failure!=='boolean')fail();
      if((set.done||!isDraft)&&(!Number.isFinite(parseNumber(weight))||parseNumber(weight)<0||parseNumber(weight)>100000||!Number.isInteger(parseNumber(reps))||parseNumber(reps)<1||parseNumber(reps)>10000||!set.done))fail();
      return {id:id(set.id),weight,reps,done:set.done,failure:set.failure};
    }))})));
    const result={id:id(value.id),name:string(value.name,140),date:date(value.date),startedAt:timestamp(value.startedAt),endedAt:timestamp(value.endedAt),notes:string(value.notes,5000),entries};
    if(!isDraft&&!entries.some(entry=>entry.sets.length))fail();
    if(isDraft)result.editingId=value.editingId===null?null:id(value.editingId);
    return result;
  };
  const workouts=unique(list(raw.workouts,20000).map(value=>workout(value,false)));
  const draft=raw.draft===null?null:workout(raw.draft,true);
  if(draft?.editingId&&!workouts.some(value=>value.id===draft.editingId))fail();
  return {version:1,settings,exercises,templates,workouts,draft};
}
