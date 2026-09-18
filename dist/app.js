import { GROUPS, GUIDES, initialData, upgradeCatalog } from './catalog.js';
import { loadData, saveData, validateData, validDate, parseNumber } from './storage.js?v=20260918-1';
import { DEFAULT_ENERGY, ENERGY_SOURCE, energyProfile, exerciseMET, entryEnergy, workoutEnergy, periodEnergy } from './energy.js?v=20260918-1';
import { validSet, recordedEntries, weekRange } from './workout.js?v=20260918-1';
import { EXERCISE_MEDIA } from './exercise-media.js';

const main=document.querySelector('#main');
const sheet=document.querySelector('#sheet');
const sheetContent=document.querySelector('#sheet-content');
const status=document.querySelector('#save-state');
const errorBanner=document.querySelector('#storage-error');
let data;
let toastTimer;
let saving=0;
let latestSave=0;
const view={page:['dashboard','workout','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'dashboard',period:'month',month:today().slice(0,7),day:today(),exerciseId:'',open:new Set(['legs']),templateDraft:null};

function today(){const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function uid(){return crypto.randomUUID?.()||`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function n(value){return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(value);}
function formatDate(value,month='long'){return new Date(`${value}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month});}
function exById(id){return data.exercises.find(ex=>ex.id===id);}
function exerciseName(ex){return ex.machine?`${ex.name} · ${ex.machine}`:ex.name;}
function groupName(id){return GROUPS.find(group=>group[0]===id)?.[1]||id;}
function calorieLabel(value){return value===null?'Укажи вес тела':`≈ ${n(Math.round(value))} ккал`;}
function quantity(value,words){const mod=value%100;return `${n(value)} ${mod>=11&&mod<=14?words[2]:value%10===1?words[0]:value%10>=2&&value%10<=4?words[1]:words[2]}`;}
function setLabel(set,ex){return ex.loadType==='bodyweight'?`${n(parseNumber(set.reps))} повт.`:`${n(parseNumber(set.weight))} кг × ${n(parseNumber(set.reps))}`;}
function el(tag,className='',text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function action(text,className,handler){const node=el('button',className,text);node.type='button';node.addEventListener('click',()=>{Promise.resolve().then(handler).catch(error=>notify(error.message||'Не удалось выполнить действие.'));});return node;}
function field(label,node,hint){const wrapper=el('label','field');wrapper.append(el('span','',label),node);if(hint)wrapper.append(el('small','',hint));return wrapper;}
function input(value='',type='text'){const node=el('input');node.type=type;node.value=value;return node;}
function select(options,value){const node=el('select');for(const [id,label] of options){const option=el('option','',label);option.value=id;node.append(option);}node.value=value;return node;}
function row(...children){const node=el('div','row');node.append(...children);return node;}
function empty(title,message,button){const node=el('div','empty-state');node.append(el('div','empty-mark','↗'),el('h2','',title),el('p','',message));if(button)node.append(button);return node;}
function notify(message){const node=document.querySelector('#toast');clearTimeout(toastTimer);node.textContent=message;node.hidden=false;toastTimer=setTimeout(()=>node.hidden=true,4300);}
function stopMedia(){sheetContent.querySelectorAll('video').forEach(video=>video.pause());}
let sheetBack=null;
function backSheet(){if(sheetBack)sheetBack();else closeSheet();}
function showSheet(title,content){const previous=sheet.open?{title:document.querySelector('#sheet-title').textContent,nodes:[...sheetContent.childNodes],scroll:sheet.scrollTop,back:sheetBack}:null;if(previous&&previous.title!==title)sheetBack=()=>{stopMedia();document.querySelector('#sheet-title').textContent=previous.title;sheetContent.replaceChildren(...previous.nodes);sheetBack=previous.back;previous.nodes.forEach(node=>node.dispatchEvent(new Event('resume')));sheet.scrollTop=previous.scroll;};stopMedia();document.querySelector('#sheet-title').textContent=title;sheetContent.replaceChildren(content);if(!sheet.open)sheet.showModal();sheet.scrollTop=0;}
function closeSheet(){stopMedia();sheetBack=null;sheet.close();}
sheet.addEventListener('cancel',event=>{event.preventDefault();backSheet();});
sheet.addEventListener('close',stopMedia);
document.querySelector('#close-sheet').addEventListener('click',backSheet);
sheet.addEventListener('click',event=>{if(event.target===sheet){const rect=sheet.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)backSheet();}});
function confirmAction(title,message,onConfirm,label='Подтвердить',danger=false){const body=el('div','stack');body.append(el('p','',message));const buttons=el('div','button-row');buttons.append(action('Отмена','outline',backSheet),action(label,danger?'danger':'primary',async()=>{await onConfirm();}));body.append(buttons);showSheet(title,body);}
function storageFailure(error){status.textContent='Не сохранено';status.classList.add('error');errorBanner.hidden=false;errorBanner.replaceChildren(el('p','',error.message||'Не удалось сохранить данные.'));errorBanner.append(action('Скачать копию','',()=>exportBackup(false)),action('Повторить сохранение','',persist),action('Перезагрузить','',()=>confirmAction('Перезагрузить дневник?','Несохранённый ввод будет потерян. Сначала скачай копию, если хочешь его сохранить.',()=>location.reload(),'Перезагрузить')));}
async function persist(){const ticket=++latestSave;saving++;status.textContent='Сохраняю…';status.classList.remove('error');try{await saveData(data);if(ticket===latestSave){status.textContent='Сохранено';errorBanner.hidden=true;}return true;}catch(error){storageFailure(error);return false;}finally{saving--;}}
async function commit(candidate){main.inert=true;sheetContent.inert=true;try{status.textContent='Сохраняю…';await saveData(candidate);data=candidate;status.textContent='Сохранено';status.classList.remove('error');errorBanner.hidden=true;return true;}catch(error){storageFailure(error);return false;}finally{main.inert=false;sheetContent.inert=false;}}
window.addEventListener('beforeunload',event=>{if(saving||!errorBanner.hidden){event.preventDefault();event.returnValue='';}});
function applyTheme(){document.documentElement.style.colorScheme=data.settings.theme==='system'?'light dark':data.settings.theme;}
function navigate(page){view.page=page;history.replaceState(null,'',`#${page}`);render();window.scrollTo({top:0});}
document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{if(data)navigate(button.dataset.page);}));
window.addEventListener('hashchange',()=>{const page=location.hash.slice(1);if(data&&['dashboard','workout','settings'].includes(page)){view.page=page;render();}});
function render(){
  if(!data)return;applyTheme();
  const labels={dashboard:['Твой прогресс','Дашборд'],workout:[data.draft?.editingId?'Редактирование тренировки':'Твоя тренировка',data.draft?.name||'Full body'],settings:['Под тебя','Настройки']};
  document.querySelector('#eyebrow').textContent=labels[view.page][0];document.querySelector('#page-title').textContent=labels[view.page][1];
  document.querySelectorAll('[data-page]').forEach(button=>{if(button.dataset.page===view.page)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  main.replaceChildren();if(view.page==='workout')renderWorkout();else if(view.page==='settings')renderSettings();else renderDashboard();
}
function newSet(ex,previous){return {id:uid(),weight:ex.loadType==='bodyweight'?'0':previous?.weight||'',reps:'',done:false,failure:false};}
function newEntry(exerciseId,count=data.settings.defaultSets,source){const ex=exById(exerciseId);return {id:uid(),exerciseId,note:'',sets:Array.from({length:count},(_,index)=>newSet(ex,source?.sets[index]))};}
function beginWorkout(template,source,date=today(),name){
  if(data.draft){navigate('workout');notify('Сначала заверши текущую тренировку или сохрани редактирование.');return;}
  data.draft={id:uid(),name:name?.trim()||source?.name||template?.name||'Тренировка',date,startedAt:new Date().toISOString(),endedAt:null,notes:'',editingId:null,energy:structuredClone(data.settings.energy),entries:source?source.entries.map(entry=>newEntry(entry.exerciseId,entry.sets.length,entry)):template?template.entries.map(entry=>newEntry(entry.exerciseId,entry.sets)):[]};
  view.open=new Set([exById(data.draft.entries[0]?.exerciseId)?.group||'legs']);persist();navigate('workout');
}
function previousResult(exerciseId){
  const workouts=data.workouts.filter(workout=>workout.id!==data.draft?.editingId&&workout.date<=(data.draft?.date||today())).sort((a,b)=>b.date.localeCompare(a.date)||(b.endedAt||'').localeCompare(a.endedAt||''));
  for(const workout of workouts){const sets=workout.entries.filter(entry=>entry.exerciseId===exerciseId).flatMap(entry=>entry.sets);if(sets.length)return {date:workout.date,sets};}return null;
}
function draftEntries(group){return data.draft.entries.filter(entry=>exById(entry.exerciseId).group===group);}
function completedCount(entries){return entries.reduce((sum,entry)=>sum+entry.sets.filter(validSet).length,0);}
function updateWorkoutCounts(){
  if(!data.draft)return;const entries=data.draft.entries,total=entries.reduce((sum,entry)=>sum+entry.sets.length,0),done=completedCount(entries);
  const count=main.querySelector('[data-workout-count]');if(count)count.textContent=`${done} / ${total} подходов`;
  const progress=main.querySelector('[data-progress]');if(progress){progress.style.width=`${total?done/total*100:0}%`;progress.parentElement.setAttribute('aria-valuenow',String(done));progress.parentElement.setAttribute('aria-valuemax',String(total));}
  for(const [id] of GROUPS){const label=main.querySelector(`[data-summary="${id}"]`);if(!label)continue;const groupEntries=draftEntries(id);label.textContent=groupEntries.length?`${groupEntries.length===1?exerciseName(exById(groupEntries[0].exerciseId)):quantity(groupEntries.length,['упражнение','упражнения','упражнений'])} · ${completedCount(groupEntries)} / ${groupEntries.reduce((sum,entry)=>sum+entry.sets.length,0)}`:'Добавь упражнение';}
  const finish=main.querySelector('[data-finish]');if(finish)finish.disabled=done===0;
  const energy=main.querySelector('[data-workout-energy]');if(energy)energy.textContent=calorieLabel(workoutEnergy(data.draft,data.exercises,data.settings));
  main.querySelectorAll('[data-entry-energy]').forEach(node=>{const entry=entries.find(item=>item.id===node.dataset.entryEnergy);node.textContent=calorieLabel(entryEnergy(entry,exById(entry.exerciseId),energyProfile(data.draft,data.settings),data.draft));});
}
function renderWorkout(){
  if(!data.draft){
    const card=el('section','card');card.append(el('h2','','Новая тренировка'));
    const template=select([['','Пустая тренировка'],...data.templates.map(item=>[item.id,item.name])],data.templates[0]?.id||'');
    const date=input(today(),'date');date.max=today();const name=input('Full body');name.maxLength=140;
    template.addEventListener('change',()=>name.value=data.templates.find(item=>item.id===template.value)?.name||'Тренировка');
    const start=()=>{if(!validDate(date.value)||date.value>today()){notify('Выбери дату не позже сегодняшней.');return;}beginWorkout(data.templates.find(item=>item.id===template.value),null,date.value,name.value);};
    card.append(field('Основа тренировки',template),field('Название',name),field('Дата',date),action('Начать тренировку','primary full',start));
    const latest=data.workouts.slice().sort((a,b)=>b.date.localeCompare(a.date)||(b.endedAt||'').localeCompare(a.endedAt||''))[0];
    if(latest)card.append(action('Повторить последнюю','quiet full',()=>beginWorkout(null,latest)));
    main.append(card);const catalogCard=el('div','card');catalogCard.append(el('h3','','Упражнения и техника'),el('p','small','Выбери тренажёр, сохрани его настройки или добавь своё упражнение.'),action('Открыть каталог','secondary full spaced',()=>openCatalog()));main.append(catalogCard);return;
  }
  const workout=data.draft;
  const header=el('div','workout-head');const date=input(workout.date,'date');date.max=today();date.setAttribute('aria-label','Дата тренировки');date.addEventListener('change',()=>{if(!validDate(date.value)||date.value>today()){date.value=workout.date;notify('Выбери корректную дату.');return;}workout.date=date.value;persist();render();});
  const count=el('span','small');count.dataset.workoutCount='';header.append(row(date,count));const track=el('div','progress-track');track.setAttribute('role','progressbar');track.setAttribute('aria-label','Выполненные подходы');track.setAttribute('aria-valuemin','0');const fill=el('span');fill.dataset.progress='';track.append(fill);header.append(track);main.append(header);
  const energyButton=action('','energy-inline',()=>configureCalories(workout));energyButton.dataset.workoutEnergy='';energyButton.setAttribute('aria-label','Примерный расход калорий и параметры расчёта');header.append(energyButton);
  if(workout.editingId)main.append(el('p','notice','Изменения попадут в историю после нажатия «Сохранить изменения».'));
  GROUPS.forEach(([id,name],index)=>{
    const details=el('details','group');details.open=view.open.has(id);details.dataset.group=id;const summary=el('summary');summary.setAttribute('aria-label',name);
    const words=el('span');words.append(el('span','group-title',name));const sub=el('span','group-sub');sub.dataset.summary=id;words.append(sub);summary.append(el('span','group-number',String(index+1).padStart(2,'0')),words,el('span','group-arrow','›'));
    summary.addEventListener('click',event=>{event.preventDefault();const opening=!details.open;if(opening&&data.settings.singleOpen){main.querySelectorAll('.group').forEach(other=>other.open=false);view.open.clear();}details.open=opening;if(opening)view.open.add(id);else view.open.delete(id);});
    details.append(summary);draftEntries(id).forEach(entry=>details.append(renderExercise(entry)));
    const add=action('+ Добавить упражнение','quiet full',()=>openCatalog({group:id,onPick:exerciseId=>addExercise(exerciseId)}));details.append(add);main.append(details);
  });
  const info=el('details','card note-details');info.append(el('summary','','Название и заметки'));const name=input(workout.name);name.maxLength=140;name.addEventListener('input',()=>{workout.name=name.value;persist();});const notes=el('textarea');notes.value=workout.notes;notes.maxLength=5000;notes.placeholder='Самочувствие, что получилось, что изменить…';notes.addEventListener('input',()=>{workout.notes=notes.value;persist();});info.append(field('Название',name),field('Заметка о тренировке',notes));main.append(info);
  const actions=el('div','workout-actions');const finish=action(workout.editingId?'Сохранить изменения':'Завершить тренировку','primary full',finishWorkout);finish.dataset.finish='';
  actions.append(finish,action('Сохранить состав как шаблон','outline full',()=>saveAsTemplate(workout)),action(workout.editingId?'Отменить редактирование':'Удалить черновик','quiet full',()=>confirmAction(workout.editingId?'Отменить изменения?':'Удалить черновик?',workout.editingId?'Сохранённая тренировка останется в истории без изменений.':'Введённые в этой тренировке подходы будут удалены.',async()=>{const next=structuredClone(data);next.draft=null;if(await commit(next)){closeSheet();render();}},'Удалить',true)));main.append(actions);updateWorkoutCounts();
}
function renderExercise(entry){
  const ex=exById(entry.exerciseId),container=el('section','exercise');container.dataset.entry=entry.id;
  const title=el('div');title.append(el('h3','',exerciseName(ex)),el('small','',`${ex.equipment}${ex.loadType==='each'?' · вес одной гантели':ex.loadType==='bodyweight'?' · без внешнего веса':' · общий вес, кг'}`));
  container.append(row(title,action('⋯','icon-button',()=>entryOptions(entry))));
  const toolbar=el('div','exercise-toolbar');toolbar.append(action('Техника','',()=>openTechnique(ex)),action('Тренажёр и настройки','',()=>exerciseSettings(ex)),action('Заменить','',()=>openCatalog({group:ex.group,onPick:id=>replaceExercise(entry,id)})));container.append(toolbar);
  const energy=el('p','small exercise-energy');energy.dataset.entryEnergy=entry.id;container.append(energy);
  const previous=previousResult(ex.id),past=el('div','previous');past.append(el('small','',previous?`В прошлый раз · ${formatDate(previous.date)}`:'В прошлый раз'));
  if(previous){past.append(el('strong','',previous.sets.map(set=>setLabel(set,ex)).join(' / ')));past.append(action('Подставить в пустые поля','quiet full',()=>{entry.sets.forEach((set,index)=>{if(validSet(set))return;const old=previous.sets[index]||previous.sets.at(-1);if(set.weight==='')set.weight=old.weight;if(set.reps==='')set.reps=old.reps;set.done=validSet(set);});persist();render();}));}else past.append(el('span','small','Первая запись. Здесь появится твой прошлый результат.'));container.append(past);
  if(ex.setup)container.append(el('p','small preserve-lines',ex.setup));
  const heads=el('div','set-grid set-labels');heads.setAttribute('aria-hidden','true');['№','Вес, кг','Повторы'].forEach(text=>heads.append(el('span','',text)));container.append(heads);
  const error=el('p','form-error');error.setAttribute('role','status');
  entry.sets.forEach((set,index)=>{
    const line=el('div','set-grid set-row');line.append(el('span','',String(index+1)));
    const weightInput=input(ex.loadType==='bodyweight'?'—':set.weight);weightInput.inputMode='decimal';weightInput.maxLength=16;weightInput.placeholder='0';weightInput.disabled=ex.loadType==='bodyweight';weightInput.setAttribute('aria-label',`${ex.name}: вес, подход ${index+1}`);
    const repsInput=input(set.reps);repsInput.inputMode='numeric';repsInput.maxLength=8;repsInput.placeholder='8–12';repsInput.setAttribute('aria-label',`${ex.name}: повторы, подход ${index+1}`);
    for(const [node,key] of [[weightInput,'weight'],[repsInput,'reps']])node.addEventListener('input',()=>{set[key]=node.value;set.done=validSet(set);node.removeAttribute('aria-invalid');error.textContent='';persist();updateWorkoutCounts();});
    for(const node of [weightInput,repsInput])node.addEventListener('blur',()=>{const invalid=!!set.reps.trim()&&!validSet(set);line.querySelectorAll('input').forEach(item=>item.setAttribute('aria-invalid',String(invalid)));error.textContent=invalid?'Укажи вес от 0 до 100 000 кг и целое число повторов от 1 до 10 000.':'';});
    line.append(weightInput,repsInput);container.append(line);
    const options=el('div','set-options');const failure=action('До отказа','',()=>{set.failure=!set.failure;failure.setAttribute('aria-pressed',String(set.failure));persist();});failure.setAttribute('aria-pressed',String(set.failure));
    const remove=action('Убрать','',()=>{const execute=()=>{entry.sets=entry.sets.filter(item=>item.id!==set.id);persist();closeSheet();render();};if(validSet(set)||set.reps||set.weight&&ex.loadType!=='bodyweight')confirmAction('Убрать подход?','Запись этого подхода будет удалена.',execute,'Убрать',true);else execute();});remove.setAttribute('aria-label',`Удалить подход ${index+1}`);options.append(failure,remove);container.append(options);
  });
  const add=action('+ Добавить подход','quiet full',()=>{if(entry.sets.length>=100){notify('В одном упражнении можно записать до 100 подходов.');return;}entry.sets.push(newSet(ex,entry.sets.at(-1)));persist();render();});container.append(add,error);
  const noteDetails=el('details','note-details');noteDetails.append(el('summary','','Заметка к упражнению'));const note=el('textarea');note.value=entry.note;note.maxLength=5000;note.setAttribute('aria-label',`Заметка: ${ex.name}`);note.addEventListener('input',()=>{entry.note=note.value;persist();});noteDetails.append(note);container.append(noteDetails);return container;
}
function addExercise(id){if(data.draft.entries.some(entry=>entry.exerciseId===id)){notify('Это упражнение уже есть в тренировке.');return;}data.draft.entries.push(newEntry(id));view.open=new Set([exById(id).group]);persist();closeSheet();render();}
function replaceExercise(entry,id){entry=data.draft?.entries.find(item=>item.id===entry.id);if(!entry)return;if(id===entry.exerciseId){closeSheet();return;}if(data.draft.entries.some(other=>other.exerciseId===id)){notify('Это упражнение уже есть в тренировке.');return;}if(entry.sets.some(validSet)){data.draft.entries.push(newEntry(id));notify('Выполненные подходы сохранены. Новое упражнение добавлено ниже.');}else{const fresh=newEntry(id);Object.assign(entry,fresh);}view.open=new Set([exById(id).group]);persist();closeSheet();render();}
function entryOptions(entry){const body=el('div','stack');const move=direction=>{const entries=data.draft.entries,index=entries.indexOf(entry);let next=index+direction;while(next>=0&&next<entries.length&&exById(entries[next].exerciseId).group!==exById(entry.exerciseId).group)next+=direction;if(next<0||next>=entries.length)return;[entries[index],entries[next]]=[entries[next],entries[index]];persist();closeSheet();render();};body.append(action('Выше в группе','outline',()=>move(-1)),action('Ниже в группе','outline',()=>move(1)),action('Убрать из тренировки','danger',()=>confirmAction('Убрать упражнение?','Его подходы в текущей тренировке будут удалены. Прошлая история сохранится.',()=>{data.draft.entries=data.draft.entries.filter(item=>item.id!==entry.id);persist();closeSheet();render();},'Убрать',true)));showSheet(exerciseName(exById(entry.exerciseId)),body);}
async function finishWorkout(){
  const draft=data.draft;if(!draft||!completedCount(draft.entries)){notify('Заполни вес и повторы хотя бы одного подхода.');return;}
  const finish=async()=>{const next=structuredClone(data);const workout=structuredClone(next.draft);workout.name=workout.name.trim()||'Тренировка';workout.entries=recordedEntries(workout.entries);workout.endedAt=new Date().toISOString();workout.energy=structuredClone(energyProfile(workout,next.settings));if(workout.editingId)workout.id=workout.editingId;delete workout.editingId;const index=next.workouts.findIndex(item=>item.id===workout.id);if(index>=0)next.workouts[index]=workout;else next.workouts.push(workout);next.draft=null;if(await commit(next)){closeSheet();view.day=workout.date;view.month=workout.date.slice(0,7);view.period='day';navigate('dashboard');notify('Тренировка сохранена.');}};
  const unfinished=draft.entries.some(entry=>entry.sets.some(set=>!validSet(set)&&set.reps.trim()));
  if(unfinished)confirmAction('Завершить тренировку?','Есть подходы с некорректным весом или числом повторов. Сохранить только корректно заполненные? Пустые подходы и упражнения будут пропущены.',finish,'Сохранить выполненное');else await finish();
}

function renderDashboard(){
  const periods=el('div','segmented');periods.setAttribute('role','group');periods.setAttribute('aria-label','Период статистики');
  for(const [id,label] of [['month','Месяц'],['week','Неделя'],['day','День']]){const button=action(label,'',()=>{const previousPeriod=view.period;view.period=id;if(id==='month')view.month=view.day.slice(0,7);else if(previousPeriod==='month'&&!view.day.startsWith(view.month))view.day=`${view.month}-01`;render();});button.setAttribute('aria-pressed',String(view.period===id));periods.append(button);}main.append(periods);
  const dayMode=view.period==='day',weekMode=view.period==='week',dateMode=dayMode||weekMode;const date=input(dateMode?view.day:view.month,dateMode?'date':'month');date.setAttribute('aria-label','Период дашборда');date.addEventListener('change',()=>{if(dateMode&&validDate(date.value))view.day=date.value;else if(!dateMode&&/^\d{4}-\d{2}$/.test(date.value))view.month=date.value;render();});const dateRow=row(el('span','small',weekMode?'Любой день недели':dayMode?'Выбрать день':'Выбрать месяц'),date);dateRow.classList.add('date-row');main.append(dateRow);if(weekMode){const [start,end]=weekRange(view.day);main.append(el('p','small',`${formatDate(start)} — ${formatDate(end)} · пн–вс`));}
  if(data.draft){const resume=el('div','card');resume.append(row(el('div','',data.draft.editingId?'Есть несохранённое редактирование':`Продолжить ${data.draft.name||'тренировку'}`),action('Открыть','secondary',()=>navigate('workout'))));main.append(resume);}
  const workouts=data.workouts.filter(inViewPeriod).sort((a,b)=>a.date.localeCompare(b.date)||(a.endedAt||'').localeCompare(b.endedAt||''));
  const entries=workouts.flatMap(workout=>workout.entries),sets=entries.flatMap(entry=>entry.sets);const metrics=el('div','metrics');
  for(const [value,label] of [[dayMode?entries.length:workouts.length,dayMode?'упражнений':'тренировок'],[sets.length,'подходов'],[sets.reduce((sum,set)=>sum+parseNumber(set.reps),0),'повторов']]){const metric=el('div');metric.append(el('strong','',n(value)),el('span','',label));metrics.append(metric);}main.append(metrics);
  main.append(energySummary(workouts,weekMode?'За неделю':dayMode?'За день':'За месяц'));
  if(!data.workouts.length){main.append(empty('Здесь будет твой прогресс','Запиши первую тренировку — появятся график рабочих весов и история подходов.',action(data.draft?'Продолжить тренировку':'Начать тренировку','primary full',()=>navigate('workout'))));return;}
  if(dayMode){renderDay(workouts);return;}
  const chartCard=el('section','card');const availableIds=[...new Set(data.workouts.flatMap(workout=>workout.entries.map(entry=>entry.exerciseId)))];if(!availableIds.includes(view.exerciseId))view.exerciseId=availableIds[0];
  const ex=exById(view.exerciseId);chartCard.append(el('h2','',ex.loadType==='bodyweight'?'Прогресс повторов':'Рабочий вес'));
  const picker=select(availableIds.map(id=>[id,exerciseName(exById(id))]),view.exerciseId);picker.className='chart-select';picker.setAttribute('aria-label','Упражнение на графике');picker.addEventListener('change',()=>{view.exerciseId=picker.value;render();});chartCard.append(picker);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('chart');svg.setAttribute('role','img');svg.dataset.chart='';chartCard.append(svg);const detail=el('p','chart-detail');detail.dataset.chartDetail='';chartCard.append(detail,el('p','footnote',ex.loadType==='bodyweight'?'Наибольшее число повторов в подходе за тренировку.':'Наибольший вес подхода за тренировку. Повторы указаны в деталях точки.'));
  main.append(chartCard);requestAnimationFrame(()=>drawChart(svg,detail));
  main.append(el('h2','section-title',weekMode?'Тренировки недели':'Тренировки месяца'));
  if(!workouts.length)main.append(empty(weekMode?'На этой неделе пока пусто':'В этом месяце пока пусто','Можно выбрать другой период или добавить тренировку задним числом.',action('Записать тренировку','secondary full',()=>navigate('workout'))));
  workouts.slice().reverse().forEach(workout=>{const button=action('','history-item',()=>{view.period='day';view.day=workout.date;render();window.scrollTo({top:0});});const title=el('span');title.append(el('strong','',`${formatDate(workout.date)} · ${workout.name}`),el('small','',`${quantity(workout.entries.length,['упражнение','упражнения','упражнений'])} · ${quantity(workout.entries.flatMap(entry=>entry.sets).length,['подход','подхода','подходов'])}`));title.append(el('small','',calorieLabel(workoutEnergy(workout,data.exercises,data.settings))));button.append(title,el('span','chevron','›'));main.append(button);});
}
function inViewPeriod(workout){if(view.period==='day')return workout.date===view.day;if(view.period==='week'){const [start,end]=weekRange(view.day);return workout.date>=start&&workout.date<=end;}return workout.date.startsWith(view.month);}
function chartPoints(){
  const ex=exById(view.exerciseId);return data.workouts.filter(inViewPeriod).sort((a,b)=>a.date.localeCompare(b.date)||(a.endedAt||'').localeCompare(b.endedAt||'')).flatMap(workout=>{
    const sets=workout.entries.filter(entry=>entry.exerciseId===ex.id).flatMap(entry=>entry.sets);if(!sets.length)return [];
    const best=sets.reduce((a,b)=>ex.loadType==='bodyweight'?(parseNumber(b.reps)>parseNumber(a.reps)?b:a):(parseNumber(b.weight)>parseNumber(a.weight)||parseNumber(b.weight)===parseNumber(a.weight)&&parseNumber(b.reps)>parseNumber(a.reps)?b:a));
    return [{date:workout.date,value:parseNumber(ex.loadType==='bodyweight'?best.reps:best.weight),best}];
  });
}
function drawChart(svg,detail){
  if(!svg.isConnected)return;const ex=exById(view.exerciseId),points=chartPoints(),width=svg.clientWidth,height=svg.clientHeight;if(!width)return;
  svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-label',`${ex.name}: ${ex.loadType==='bodyweight'?'повторы':'рабочий вес'} по тренировкам`);
  const add=(tag,attrs={},text)=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;svg.append(node);return node;};
  add('title',{},exerciseName(ex));add('desc',{},points.map(point=>`${formatDate(point.date)}: ${setLabel(point.best,ex)}`).join('; '));
  if(!points.length){add('text',{x:width/2,y:height/2,'text-anchor':'middle'},'Пока нет результатов за период');detail.textContent='Выбери другое упражнение или период.';return;}
  const values=points.map(point=>point.value),spread=Math.max(...values)-Math.min(...values),padding=Math.max(ex.loadType==='bodyweight'?2:5,spread*.15),min=Math.max(0,Math.floor(Math.min(...values)-padding)),max=Math.ceil(Math.max(...values)+padding),left=43,right=width-16,top=31,bottom=height-40;
  const x=index=>points.length===1?(left+right)/2:left+index/(points.length-1)*(right-left);const y=value=>bottom-(value-min)/(max-min)*(bottom-top);
  [min,(min+max)/2,max].forEach(value=>{add('line',{x1:left,x2:right,y1:y(value),y2:y(value),stroke:'var(--line)','stroke-width':1});add('text',{x:left-8,y:y(value)+4,'text-anchor':'end'},n(value));});add('text',{x:3,y:14},ex.loadType==='bodyweight'?'повт.':'кг');
  if(points.length>1){const path=points.map((point,index)=>`${index?'L':'M'}${x(index)},${y(point.value)}`).join(' ');add('path',{d:`${path} L${x(points.length-1)},${bottom} L${x(0)},${bottom} Z`,fill:'var(--accent)',opacity:.08});add('path',{d:path,fill:'none',stroke:'var(--accent)','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'});}
  const ticks=new Set(points.length<=4?points.map((_,index)=>index):[0,Math.round((points.length-1)/3),Math.round((points.length-1)*2/3),points.length-1]);
  points.forEach((point,index)=>{
    const dot=add('circle',{cx:x(index),cy:y(point.value),r:4,fill:'var(--accent)'});const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=`${formatDate(point.date)}: ${setLabel(point.best,ex)}`;dot.append(title);
    const hit=add('circle',{cx:x(index),cy:y(point.value),r:17,fill:'transparent',tabindex:0,role:'button','aria-label':title.textContent});const show=()=>detail.textContent=title.textContent;hit.addEventListener('click',show);hit.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});
    if(ticks.has(index))add('text',{x:x(index),y:bottom+24,'text-anchor':index===0?'start':index===points.length-1?'end':'middle'},point.date.slice(-2));
  });
  add('text',{x:right,y:height-1,'text-anchor':'end'},'даты тренировок');
  [0,...(points.length>1?[points.length-1]:[])].forEach(index=>add('text',{class:'chart-strong',x:x(index),y:y(points[index].value)-12,'text-anchor':index===0?'start':'end'},n(points[index].value)));
  detail.textContent=points.length>1?`${setLabel(points[0].best,ex)} → ${setLabel(points.at(-1).best,ex)}`:`${formatDate(points[0].date)}: ${setLabel(points[0].best,ex)}`;
}
window.addEventListener('resize',()=>{const svg=main.querySelector('[data-chart]');if(svg)drawChart(svg,main.querySelector('[data-chart-detail]'));});
function renderDay(workouts){
  if(!workouts.length){main.append(empty('День без записей','Выбери другую дату или добавь тренировку за этот день.',action('Добавить тренировку','secondary full',()=>{if(view.day>today()){notify('Будущие тренировки пока нельзя записывать.');return;}beginWorkout(null,null,view.day);})));return;}
  const distribution=el('section','card');distribution.append(el('h2','','Подходы по группам'));const counts=GROUPS.map(([id,label])=>({label,count:workouts.flatMap(workout=>workout.entries).filter(entry=>exById(entry.exerciseId).group===id).reduce((sum,entry)=>sum+entry.sets.length,0)}));const maximum=Math.max(1,...counts.map(group=>group.count));
  counts.forEach(group=>{const line=el('div','muscle-row');line.append(el('span','',group.label));const track=el('div','muscle-track'),fill=el('span');fill.style.width=`${group.count/maximum*100}%`;track.append(fill);line.append(track,el('strong','',n(group.count)));distribution.append(line);});main.append(distribution);
  workouts.forEach(workout=>{
    const card=el('section','card');card.append(row(el('h2','',workout.name),action('Изменить','quiet',()=>editWorkout(workout))));card.append(el('p','small',`${formatDate(workout.date)} · ${calorieLabel(workoutEnergy(workout,data.exercises,data.settings))}`));
    workout.entries.forEach(entry=>{const ex=exById(entry.exerciseId),result=el('div','result-entry');result.append(el('h3','',exerciseName(ex)));if(ex.loadType==='each')result.append(el('p','','Вес одной гантели'));const sets=el('div','result-sets');entry.sets.forEach(set=>sets.append(el('span','',`${setLabel(set,ex)}${set.failure?' · отказ':''}`)));result.append(sets,el('p','exercise-energy',calorieLabel(entryEnergy(entry,ex,energyProfile(workout,data.settings),workout))));if(entry.note)result.append(el('p','preserve-lines',entry.note));card.append(result);});
    if(workout.notes)card.append(el('p','footnote preserve-lines',workout.notes));const buttons=el('div','button-row spaced');buttons.append(action('Повторить','secondary',()=>beginWorkout(null,workout)),action('В шаблон','outline',()=>saveAsTemplate(workout)));card.append(buttons,action('Удалить тренировку','quiet full',()=>confirmAction('Удалить тренировку?',`${workout.name}, ${formatDate(workout.date)}: запись и её подходы будут удалены из истории.`,async()=>{const next=structuredClone(data);next.workouts=next.workouts.filter(item=>item.id!==workout.id);if(next.draft?.editingId===workout.id)next.draft=null;if(await commit(next)){closeSheet();render();}},'Удалить',true)));main.append(card);
  });
}
function editWorkout(workout){if(data.draft){notify('Сначала заверши текущую тренировку или редактирование.');navigate('workout');return;}data.draft={...structuredClone(workout),editingId:workout.id};view.open=new Set([exById(workout.entries[0]?.exerciseId)?.group||'legs']);persist();navigate('workout');}

function renderSettings(){
  const calories=el('section','card');calories.append(el('h2','','Расход калорий'),el('p','small',data.settings.energy.bodyWeight?`Масса тела ${n(data.settings.energy.bodyWeight)} кг · ${n(data.settings.energy.secondsPerRep)} с на повтор · отдых ${n(data.settings.energy.restSeconds)} с`:'Укажи массу тела, чтобы видеть примерный расход по упражнениям, дням, неделям и месяцам.'),action('Настроить расчёт','secondary full spaced',()=>configureCalories()));main.append(calories);
  const workout=el('section','card');workout.append(el('h2','','Тренировка'));
  const sets=select(Array.from({length:10},(_,index)=>[String(index+1),String(index+1)]),String(data.settings.defaultSets));sets.setAttribute('aria-label','Подходов по умолчанию');sets.addEventListener('change',()=>{data.settings.defaultSets=Number(sets.value);persist();});const setsLabel=el('div','', 'Подходов по умолчанию');setsLabel.append(el('small','','Для новых упражнений'));const setsRow=row(setsLabel,sets);setsRow.classList.add('setting-row');workout.append(setsRow);
  const single=el('div','setting-row');const toggle=input('','checkbox');toggle.checked=data.settings.singleOpen;toggle.id='single-open';toggle.addEventListener('change',()=>{data.settings.singleOpen=toggle.checked;if(toggle.checked&&view.open.size>1)view.open=new Set([view.open.values().next().value]);persist();});const toggleLabel=el('label','','Один раскрытый блок за раз');toggleLabel.htmlFor=toggle.id;single.append(toggleLabel,toggle);workout.append(single);
  const units=row(el('span','','Единицы веса'),el('span','small','Килограммы'));units.classList.add('setting-row');workout.append(units);main.append(workout);
  const templates=el('section','card');templates.append(row(el('h2','','Мои шаблоны'),action('+ Создать','quiet',()=>templateEditor())));data.templates.forEach(template=>{const item=el('div','template-item');const text=el('div');text.append(el('strong','',template.name),el('small','',quantity(template.entries.length,['упражнение','упражнения','упражнений'])));item.append(text,action('Изменить','quiet',()=>templateEditor(template)));templates.append(item);});if(!data.templates.length)templates.append(el('p','small','Сохрани состав тренировки или создай новый шаблон.'));main.append(templates);
  const catalog=el('section','card');catalog.append(el('h2','','Упражнения и тренажёры'),el('p','small',`${quantity(data.exercises.length,['упражнение','упражнения','упражнений'])} в каталоге`),action('Открыть каталог','secondary full spaced',()=>openCatalog()));main.append(catalog);
  const appearance=el('section','card');appearance.append(el('h2','','Оформление'));const theme=select([['system','Как на телефоне'],['light','Светлая'],['dark','Тёмная']],data.settings.theme);theme.setAttribute('aria-label','Тема оформления');theme.addEventListener('change',()=>{data.settings.theme=theme.value;applyTheme();persist();});const themeRow=row(el('span','','Тема'),theme);themeRow.classList.add('setting-row');appearance.append(themeRow);main.append(appearance);
  const backup=el('section','card');backup.append(el('h2','','Данные и копии'),el('p','small','История хранится в этом браузере. Сохрани копию перед очисткой данных или сменой телефона.'));
  const last=row(el('span','','Копия подготовлена'),el('span','small',data.settings.lastBackup?new Date(data.settings.lastBackup).toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}):'Ещё не создавалась'));last.classList.add('setting-row');backup.append(last);
  const file=input('','file');file.accept='.json,application/json';file.hidden=true;file.addEventListener('change',()=>{const selected=file.files[0];file.value='';if(selected)importBackup(selected);});
  const backupButtons=el('div','button-row spaced');backupButtons.append(action('Экспорт истории','secondary',()=>exportBackup()),action('Восстановить','outline',()=>file.click()));backup.append(backupButtons,file);main.append(backup);
  const install=el('section','card');install.append(el('h2','','На главный экран iPhone'),el('p','install-help','Открой приложение в Safari, нажми «Поделиться», затем «На экран Домой». Запускай дневник одним и тем же способом, чтобы открывать своё хранилище.'));main.append(install);
}
function energySummary(workouts,label){
  const summary=periodEnergy(workouts,data.exercises,data.settings),card=el('section','card energy-card');
  const title=el('div');title.append(el('span','small',`${label} · активные калории`),el('strong','energy-total',summary.missing?`${n(Math.round(summary.total))} ккал + ?`:`≈ ${n(Math.round(summary.total))} ккал`));
  card.append(row(title,action('Расчёт','outline',()=>configureCalories())));
  card.append(el('p','footnote',summary.missing?`Для ${quantity(summary.missing,['тренировки','тренировок','тренировок'])} не задан вес тела. Укажи его для полного итога.`:data.settings.energy.bodyWeight?'Примерная оценка: по указанной длительности или по повторам и паузам. Интенсивность можно выбрать в параметрах тренировки.':'Для расчёта после первой тренировки укажи свой вес в настройках.'));
  return card;
}
function configureCalories(workout=null){
  const current=energyProfile(workout,data.settings)||DEFAULT_ENERGY,body=el('div','stack');
  body.append(el('p','small',workout?'Параметры этой тренировки. При сохранении её оценка закрепится в истории.':'Параметры новых тренировок и старых записей без сохранённого веса тела. Уже сохранённые оценки не изменятся.'));
  const weight=input(current.bodyWeight??'');weight.inputMode='decimal';weight.maxLength=6;weight.placeholder='Например, 80';
  const tempo=select([['2','2 секунды'],['3','3 секунды'],['4','4 секунды'],['5','5 секунд'],['6','6 секунд']],String(current.secondsPerRep));
  if(!tempo.value){const option=el('option','',`${n(current.secondsPerRep)} с`);option.value=String(current.secondsPerRep);tempo.append(option);tempo.value=option.value;}
  const rest=input(String(current.restSeconds),'number');rest.min='0';rest.max='300';rest.step='1';
  body.append(field('Масса тела, кг',weight,'Вес тела, а не вес снаряда. От 25 до 350 кг.'),field('Время одного повтора',tempo,'Полное движение туда и обратно. Это допущение для оценки длительности.'),field('Отдых между подходами, секунды',rest));
  const intensity=select([['standard','Обычная'],['vigorous','Высокая / тяжёлая силовая']],current.intensity||'standard');body.append(field('Интенсивность тренировки',intensity));
  const duration=input(current.durationMinutes??'','number');duration.min='1';duration.max='600';duration.step='any';if(workout)body.append(field('Длительность тренировки, минуты',duration,'Время силовой части вместе с паузами. Оставь пустым для оценки по повторам; разминку и кардио сюда не включай.'));
  body.append(action('Сохранить параметры','primary',async()=>{
    const bodyWeight=weight.value.trim()?parseNumber(weight.value):null,restSeconds=Number(rest.value);
    if(bodyWeight!==null&&(!Number.isFinite(bodyWeight)||bodyWeight<25||bodyWeight>350)){notify('Укажи массу тела от 25 до 350 кг.');return;}
    if(rest.value===''||!Number.isInteger(restSeconds)||restSeconds<0||restSeconds>300){notify('Укажи отдых от 0 до 300 секунд.');return;}
    const durationMinutes=workout&&duration.value.trim()?parseNumber(duration.value):null;
    if(durationMinutes!==null&&(!Number.isFinite(durationMinutes)||durationMinutes<1||durationMinutes>600)){notify('Укажи длительность от 1 до 600 минут.');return;}
    const profile={bodyWeight,secondsPerRep:Number(tempo.value),restSeconds,intensity:intensity.value,durationMinutes},next=structuredClone(data);
    if(workout){if(next.draft?.id!==workout.id){notify('Тренировка уже изменена. Открой её заново.');return;}next.draft.energy=profile;}else next.settings.energy=profile;
    if(await commit(next)){closeSheet();render();notify('Параметры расчёта сохранены.');}
  }));
  const explanation=el('details','calorie-method');explanation.append(el('summary','','Как считается оценка'));
  explanation.append(el('p','','Для каждого упражнения считаем время: выполненные повторы × секунды на повтор + паузы между выполненными подходами. Пустые и некорректные подходы не учитываются. Если задана длительность, используем её и распределяем между упражнениями пропорционально оценке их времени.'),el('p','','Активные ккал = (MET − 1) × 3,5 × масса тела / 200 × минуты. Из общей энергии вычитается расход в покое.'),el('p','','Берём категории из Compendium 2024: обычная силовая тренировка — 3,5 MET, приседания и становая тяга с весом — 5, упражнения с собственным весом — 3, лёгкие скручивания — 2,8. Для высокой интенсивности: силовая — 6 MET, собственный вес — 6,5. Это средние категории, а не измерение конкретного подхода.'),el('p','','Паузы учитываются внутри каждого упражнения, без паузы после последнего подхода. Без указанной длительности переходы не учитываются. Разминка и эффект после тренировки отдельно не добавляются. Вес снаряда и отметка «до отказа» не дают надёжного коэффициента калорий.'),el('p','','Оценка грубая: реальные темп, паузы и интенсивность могут заметно отличаться. Для односторонних движений записывай суммарные повторы обеих сторон. Для старых записей без параметров используются текущие настройки; сохрани запись через редактирование, чтобы закрепить их.'));
  const link=el('a','','Источник MET: Compendium of Physical Activities');link.href=ENERGY_SOURCE;link.target='_blank';link.rel='noopener noreferrer';explanation.append(link);body.append(explanation);showSheet('Примерный расход калорий',body);
}
function techniqueMedia(ex,media){
  const figure=el('figure','technique-media');
  if(media.video){
    const video=el('video');video.src=media.video;video.controls=true;video.loop=true;video.muted=true;video.playsInline=true;video.preload='none';video.setAttribute('aria-label',`Демонстрация: ${ex.name}`);if(media.poster)video.poster=media.poster;
    const play=action('▶ Показать движение','secondary full',async()=>{try{await video.play();play.hidden=true;}catch{notify('Нажми кнопку воспроизведения на видео.');}});
    video.addEventListener('error',()=>{play.hidden=true;video.hidden=true;figure.prepend(el('p','notice','Не удалось загрузить демонстрацию. Открой оригинал по ссылке ниже.'));});
    figure.append(video,play,el('figcaption','small','Видео повторяется по кругу, без звука. Можно остановить и рассмотреть движение.'));
  }else if(media.images?.length){
    const positions=el('div','exercise-positions');media.images.forEach((src,index)=>{const frame=el('div');const image=el('img');image.src=src;image.alt=`${ex.name}: ${index===0?'начальное положение':'вторая фаза движения'}`;image.loading='lazy';image.width=320;image.height=320;image.addEventListener('error',()=>{image.hidden=true;frame.append(el('p','small','Фото недоступно — открой источник.'));});frame.append(image,el('span','small',index===0?'Начало':'Вторая фаза'));positions.append(frame);});figure.append(positions,el('figcaption','small','Два положения упражнения. Для этого варианта пока доступны фото, а не видео.'));
  }
  const credits=el('div','media-credits');const source=el('a','',media.author?`Демонстрация: ${media.author} · ${media.sourceName}`:media.sourceName);source.href=media.source;source.target='_blank';source.rel='noopener noreferrer';credits.append(source);
  if(media.licenseUrl){const license=el('a','',media.license);license.href=media.licenseUrl;license.target='_blank';license.rel='noopener noreferrer';credits.append(license);}if(media.video)credits.append(el('span','','Видео уменьшено и перекодировано; звук удалён.'));figure.append(credits);return figure;
}
function saveAsTemplate(workout){const template={id:uid(),name:workout.name||'Моя тренировка',entries:workout.entries.map(entry=>({exerciseId:entry.exerciseId,sets:Math.max(1,entry.sets.length)}))};templateEditor(template,true);}
function templateEditor(template,isNew=false){view.templateDraft=template?structuredClone(template):{id:uid(),name:'Новый шаблон',entries:[]};view.templateIsNew=isNew||!data.templates.some(item=>item.id===view.templateDraft.id);renderTemplateEditor();}
function renderTemplateEditor(){
  const draft=view.templateDraft,body=el('div','stack');const name=input(draft.name);name.maxLength=140;name.addEventListener('input',()=>draft.name=name.value);body.append(field('Название шаблона',name));
  draft.entries.forEach((entry,index)=>{const item=el('div','template-item');const text=el('div');text.append(el('strong','',exerciseName(exById(entry.exerciseId))));const count=input(String(entry.sets),'number');count.min='1';count.max='100';count.setAttribute('aria-label','Число подходов');count.style.maxWidth='76px';count.addEventListener('change',()=>{const value=Number(count.value);if(Number.isInteger(value)&&value>=1&&value<=100)entry.sets=value;else count.value=String(entry.sets);});text.append(el('small','',groupName(exById(entry.exerciseId).group)));item.append(text,count);const actions=el('div','stack');const up=action('↑','icon-button',()=>{if(index===0)return;[draft.entries[index-1],draft.entries[index]]=[draft.entries[index],draft.entries[index-1]];renderTemplateEditor();});up.disabled=index===0;up.setAttribute('aria-label','Переместить выше');const remove=action('×','icon-button',()=>{draft.entries.splice(index,1);renderTemplateEditor();});remove.setAttribute('aria-label','Убрать упражнение');actions.append(up,remove);item.append(actions);body.append(item);});
  body.append(action('+ Добавить упражнение','secondary',()=>openCatalog({onPick:id=>{if(draft.entries.some(entry=>entry.exerciseId===id)){notify('Это упражнение уже есть в шаблоне.');return;}draft.entries.push({exerciseId:id,sets:data.settings.defaultSets});backSheet();renderTemplateEditor();},onBack:renderTemplateEditor})),action('Сохранить шаблон','primary',async()=>{if(!draft.name.trim()){notify('Укажи название шаблона.');return;}if(!draft.entries.length){notify('Добавь хотя бы одно упражнение.');return;}const next=structuredClone(data),copy=structuredClone(draft);copy.name=copy.name.trim();const index=next.templates.findIndex(item=>item.id===copy.id);if(index>=0)next.templates[index]=copy;else next.templates.push(copy);if(await commit(next)){closeSheet();render();notify('Шаблон сохранён.');}}));
  if(!view.templateIsNew)body.append(action('Удалить шаблон','quiet',()=>confirmAction('Удалить шаблон?','Записанные тренировки останутся в истории.',async()=>{const next=structuredClone(data);next.templates=next.templates.filter(item=>item.id!==draft.id);if(await commit(next)){closeSheet();render();}},'Удалить',true)));showSheet('Шаблон тренировки',body);
}

function openCatalog(options={}){
  const body=el('div');const search=input();search.type='search';search.placeholder='Упражнение или тренажёр';search.setAttribute('aria-label','Поиск упражнений');body.append(search);
  const filters=el('div','catalog-filters');const group=select([['','Все группы'],...GROUPS],options.group||'');group.setAttribute('aria-label','Группа мышц');const favorites=select([['all','Все упражнения'],['favorites','Избранное']],'all');favorites.setAttribute('aria-label','Избранное');filters.append(group,favorites);body.append(filters);
  const results=el('div');body.append(results);
  const renderResults=()=>{
    results.replaceChildren();const term=search.value.toLocaleLowerCase('ru-RU').trim();
    const exercises=data.exercises.filter(ex=>(!group.value||ex.group===group.value)&&(favorites.value!=='favorites'||ex.favorite)&&`${ex.name} ${ex.machine} ${ex.equipment}`.toLocaleLowerCase('ru-RU').includes(term)).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'ru'));
    for(const ex of exercises){
      const card=el('div','catalog-item');const favorite=action(ex.favorite?'★':'☆','favorite',()=>{ex.favorite=!ex.favorite;persist();renderResults();});favorite.setAttribute('aria-label',ex.favorite?'Убрать из избранного':'В избранное');favorite.setAttribute('aria-pressed',String(ex.favorite));card.append(favorite);
      const info=el('div','catalog-info');info.append(el('h3','',exerciseName(ex)),el('small','',`${groupName(ex.group)} · ${ex.equipment||'Своё упражнение'}`));const actions=el('div','button-row');if(options.onPick)actions.append(action('Выбрать','secondary',()=>options.onPick(ex.id)));actions.append(action(EXERCISE_MEDIA[ex.baseId]?.video?'▶ Техника · видео':EXERCISE_MEDIA[ex.baseId]?'Техника · фото':'Техника','outline',()=>openTechnique(ex,()=>openCatalog(options))),action('Настроить','quiet',()=>exerciseSettings(ex,()=>openCatalog(options))));info.append(actions);card.append(info);results.append(card);
    }
    if(!exercises.length)results.append(el('p','group-empty','Ничего не найдено. Можно добавить своё упражнение.'));
    else results.prepend(el('p','small catalog-count',quantity(exercises.length,['упражнение','упражнения','упражнений'])));
  };
  body.addEventListener('resume',renderResults);search.addEventListener('input',renderResults);group.addEventListener('change',renderResults);favorites.addEventListener('change',renderResults);renderResults();
  body.append(action('+ Своё упражнение','primary full spaced',()=>exerciseForm(null,options)),action('Назад','quiet full',backSheet));showSheet('Упражнения',body);
}
function openTechnique(ex,onBack){
  const body=el('div');body.addEventListener('resume',()=>openTechnique(exById(ex.id),onBack));body.append(el('p','small',`${groupName(ex.group)} · ${ex.equipment}`));const guide=Object.hasOwn(GUIDES,ex.baseId)?GUIDES[ex.baseId]:null;
  const media=EXERCISE_MEDIA[ex.baseId];if(media)body.append(techniqueMedia(ex,media));
  if(ex.baseId==='squat')body.append(el('p','notice','Показан базовый присед без отягощения. У приседаний со штангой, в Смите и других вариантов есть отдельные карточки в каталоге.'));
  body.append(el('p','footnote',`Оценка нагрузки: ${n(exerciseMET(ex))} MET. Расход зависит от массы тела, повторов и принятых пауз.`));
  if(guide){for(const [key,label] of [['setup','Настройка'],['movement','Выполнение'],['avoid','На что обратить внимание']]){const section=el('section','technique-section');section.append(el('h3','',label));const list=el('ul');guide[key].forEach(text=>list.append(el('li','',text)));section.append(list);body.append(section);}const links=el('div','source-links');for(const [label,url] of guide.sources){const link=el('a','',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}body.append(links);}
  else body.append(el('p','notice spaced','Для этого упражнения пока нет готовой инструкции. Добавь свою заметку или ссылку на разбор техники.'));
  if(ex.setup){const section=el('section','technique-section');section.append(el('h3','','Мои настройки'),el('p','preserve-lines',ex.setup));body.append(section);}
  if(ex.notes){const section=el('section','technique-section');section.append(el('h3','','Моя заметка'),el('p','preserve-lines',ex.notes));body.append(section);}
  if(ex.sourceUrl){const link=el('a','', 'Моя ссылка на технику');link.href=ex.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';body.append(link);}
  body.append(el('p','footnote','Настройка зависит от модели тренажёра. Если движение вызывает боль, остановись и уточни технику у тренера.'));
  body.append(action('Мои заметки и настройки','secondary full spaced',()=>exerciseSettings(ex,onBack)));if(onBack)body.append(action('Назад','quiet full',backSheet));showSheet(exerciseName(ex),body);
}
function exerciseSettings(ex,onBack){
  const body=el('div','stack');body.append(el('p','small',ex.equipment));const machine=input(ex.machine);machine.maxLength=140;machine.placeholder='Например, тренажёр у окна';
  const setup=el('textarea');setup.value=ex.setup;setup.maxLength=2000;setup.placeholder='Высота сиденья, рукоятка, положение упоров';
  const notes=el('textarea');notes.value=ex.notes;notes.maxLength=5000;notes.placeholder='Личные подсказки по технике';const source=input(ex.sourceUrl,'url');source.placeholder='https://…';source.maxLength=2000;
  body.append(field('Название этого тренажёра',machine),field('Настройки тренажёра',setup),field('Мои заметки',notes),field('Ссылка на технику',source));
  body.append(action('Сохранить','primary',async()=>{if(!validUrl(source.value)){notify('Ссылка должна начинаться с https://');return;}const next=structuredClone(data),updated=next.exercises.find(item=>item.id===ex.id);updated.machine=machine.value.trim();updated.setup=setup.value.trim();updated.notes=notes.value.trim();updated.sourceUrl=source.value.trim();if(await commit(next)){backSheet();render();notify('Настройки сохранены.');}}),action('+ Другой тренажёр для этого упражнения','outline',()=>exerciseForm(ex,{onBack:onBack||closeSheet})),el('p','footnote','Другой тренажёр создаётся отдельной записью: его веса и история не смешиваются с этим.'));
  if(onBack)body.append(action('Назад','quiet',backSheet));showSheet('Тренажёр и заметки',body);
}
function validUrl(value){if(!value.trim())return true;try{return new URL(value.trim()).protocol==='https:';}catch{return false;}}
function exerciseForm(base,options={}){
  const form=el('form','stack');const name=input(base?.name||'');name.required=true;name.maxLength=140;const group=select(GROUPS,base?.group||options.group||'legs');const equipment=input(base?.equipment||'');equipment.maxLength=180;
  const load=select([['total','Общий вес'],['each','Вес одной гантели'],['bodyweight','Без внешнего веса']],base?.loadType||'total');
  const machine=input();machine.maxLength=140;machine.placeholder=base?'Например, второй жим ногами':'';if(base)machine.required=true;
  const notes=el('textarea');notes.maxLength=5000;const url=input('','url');url.maxLength=2000;
  form.append(field('Название упражнения',name),field('Группа мышц',group),field('Оборудование',equipment),field('Как записывать нагрузку',load),field('Название тренажёра в зале',machine),field('Моя подсказка по технике',notes),field('Ссылка на разбор техники',url));
  if(base){name.readOnly=true;group.disabled=true;load.disabled=true;}
  const submit=el('button','primary full',base?'Добавить тренажёр':'Добавить упражнение');submit.type='submit';form.append(submit,action('Назад','quiet',backSheet));
  form.addEventListener('submit',async event=>{event.preventDefault();if(!name.value.trim())return;if(!validUrl(url.value)){notify('Ссылка должна начинаться с https://');return;}const id=uid(),ex={id,name:name.value.trim(),group:group.value,equipment:equipment.value.trim(),loadType:load.value,baseId:base?.baseId||id,machine:machine.value.trim(),setup:'',notes:notes.value.trim(),sourceUrl:url.value.trim(),favorite:true};const next=structuredClone(data);next.exercises.push(ex);if(await commit(next)){backSheet();if(options.onPick)options.onPick(id);else notify('Добавлено в каталог.');}});showSheet(base?'Другой тренажёр':'Своё упражнение',form);
}
async function exportBackup(updateTimestamp=true){
  if(!data)return;const exportedAt=new Date().toISOString();const snapshot=structuredClone(data);if(updateTimestamp)snapshot.settings.lastBackup=exportedAt;
  const payload={app:'full-body-journal',exportedAt,data:snapshot};const content=JSON.stringify(payload,null,2);const fileName=`full-body-${today()}-${Date.now()}.json`;const file=new File([content],fileName,{type:'application/json'});
  try{
    if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Копия дневника Full Body'});}
    else{const url=URL.createObjectURL(file);const link=el('a');link.href=url;link.download=fileName;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
    if(updateTimestamp){data.settings.lastBackup=exportedAt;await persist();if(view.page==='settings')render();}notify('Копия подготовлена. Сохрани файл в надёжном месте.');
  }catch(error){if(error.name!=='AbortError')notify('Не удалось подготовить копию. Попробуй ещё раз.');}
}
async function importBackup(file){
  if(file.size>15*1024*1024){notify('Файл слишком большой. Максимальный размер — 15 МБ.');return;}
  let restored;try{const envelope=JSON.parse(await file.text());if(envelope.app!=='full-body-journal')throw new Error('Выбери файл резервной копии Full Body.');restored=validateData(envelope.data);upgradeCatalog(restored);}catch(error){notify(error instanceof SyntaxError?'Не удалось прочитать JSON-файл. Текущая история не изменена.':error.message);return;}
  const body=el('div','stack');body.append(el('p','',`В копии: ${quantity(restored.workouts.length,['тренировка','тренировки','тренировок'])}, ${quantity(restored.exercises.length,['упражнение','упражнения','упражнений'])}${restored.draft?' и незавершённая тренировка':''}.`),el('p','','Восстановление заменит текущую историю, шаблоны, настройки и черновик на этом устройстве.'),action('Сначала скачать текущую копию','outline',()=>exportBackup(false)),action('Заменить данные копией','primary',async()=>{if(await commit(restored)){closeSheet();view.exerciseId='';view.open=new Set(['legs']);render();notify('История восстановлена.');}}),action('Отмена','quiet',closeSheet));showSheet('Восстановить историю?',body);
}
function registerAgentTools(){
  if(!document.modelContext?.registerTool)return;
  const definitions=[
    {name:'get_training_summary',title:'Сводка тренировок',description:'Read completed workout totals for a calendar month. Does not modify the journal.',inputSchema:{type:'object',properties:{month:{type:'string',pattern:'^\\d{4}-\\d{2}$'}},required:['month'],additionalProperties:false},annotations:{readOnlyHint:true},execute:({month})=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Expected YYYY-MM');const workouts=data.workouts.filter(workout=>workout.date.startsWith(month)),sets=workouts.flatMap(workout=>workout.entries.flatMap(entry=>entry.sets));const energy=periodEnergy(workouts,data.exercises,data.settings);return {month,workouts:workouts.length,sets:sets.length,reps:sets.reduce((sum,set)=>sum+parseNumber(set.reps),0),estimatedActiveKcal:Math.round(energy.total),workoutsWithoutCalorieEstimate:energy.missing};}},
    {name:'show_training_screen',title:'Открыть экран дневника',description:'Navigate to dashboard, workout or settings. Does not create or complete a workout.',inputSchema:{type:'object',properties:{page:{type:'string',enum:['dashboard','workout','settings']}},required:['page'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({page})=>{if(!['dashboard','workout','settings'].includes(page))throw new Error('Unknown screen');navigate(page);return {page};}}
  ];
  for(const definition of definitions){try{Promise.resolve(document.modelContext.registerTool(definition)).catch(()=>{});}catch{}}
}
async function boot(){
  try{const saved=await loadData();data=saved?validateData(saved):initialData();const changed=upgradeCatalog(data);if(!saved||changed||!saved.settings.energy)await persist();else status.textContent='Сохранено';if(data.draft)view.open=new Set([exById(data.draft.entries[0]?.exerciseId)?.group||'legs']);render();registerAgentTools();}
  catch(error){status.textContent='Недоступно';main.replaceChildren(empty('Не удалось открыть дневник','Данные не перезаписаны. Попробуй закрыть другие вкладки и открыть приложение снова.',action('Повторить','primary full',()=>location.reload())));const message=el('p','form-error',error.message||'Хранилище браузера недоступно.');main.append(message);}
}
boot();

