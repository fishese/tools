/* ---------- storage (IndexedDB + localStorage backup + persist()) ---------- */
const LS_KEY='ck_state_v2';
const OLD_DB_KEY='ck_coupons_v1', OLD_SET_KEY='ck_settings_v1', OLD_NOTE_KEY='ck_notified_v1';
const IDB_NAME='coupon-keeper', IDB_STORE='kv', IDB_KEY='state', IDB_PHOTOS='photos';
const DEFAULT_SETTINGS={reminderDays:[7,1],langs:['eng','chi_tra','chi_sim','jpn'],badgeHours:48};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const lsParse=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};

let coupons=[], settings={...DEFAULT_SETTINGS}, notified={};
let storeReady=false, persistStatus='checking';
let pendingPhoto=null, thumbUrls=[];

function stripQrImg(list){
  if(!Array.isArray(list))return [];
  return list.filter(c=>c&&typeof c==='object').map(c=>{
    const copy={...c};
    delete copy.qrImg;
    if(!copy.kind)copy.kind='coupon';
    if(!copy.barcodeFormat)copy.barcodeFormat='auto';
    if(copy.balance==null)copy.balance='';
    copy.hasPhoto=!!copy.hasPhoto;
    return copy;
  });
}
function normalizeSettings(s){
  const out={...DEFAULT_SETTINGS,...(s||{})};
  if(!out.langs||!out.langs.length)out.langs=['eng','chi_tra','chi_sim','jpn'];
  if(!Array.isArray(out.reminderDays))out.reminderDays=[7,1];
  if(out.badgeHours==null||isNaN(+out.badgeHours))out.badgeHours=48;
  return out;
}
function stateFromParts(c,s,n,savedAt){
  return {v:2,savedAt:savedAt||Date.now(),coupons:stripQrImg(c||[]),settings:normalizeSettings(s),notified:(n&&typeof n==='object')?n:{}};
}
function applyState(st){
  if(!st||typeof st!=='object')return false;
  coupons=stripQrImg(st.coupons||[]);
  settings=normalizeSettings(st.settings);
  notified=(st.notified&&typeof st.notified==='object')?st.notified:{};
  return true;
}
function idbOpen(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB'in window)){reject(new Error('no IndexedDB'));return;}
    const req=indexedDB.open(IDB_NAME,2);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(IDB_STORE))db.createObjectStore(IDB_STORE);
      if(!db.objectStoreNames.contains(IDB_PHOTOS))db.createObjectStore(IDB_PHOTOS);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
function idbGet(){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readonly');
    const r=tx.objectStore(IDB_STORE).get(IDB_KEY);
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
    tx.oncomplete=()=>{try{db.close();}catch(_){}};
  }));
}
function idbPut(state){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(state,IDB_KEY);
    tx.oncomplete=()=>{try{db.close();}catch(_){} resolve();};
    tx.onerror=()=>{try{db.close();}catch(_){} reject(tx.error);};
  }));
}
function photoPut(id, blob){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,'readwrite');
    tx.objectStore(IDB_PHOTOS).put(blob,id);
    tx.oncomplete=()=>{try{db.close();}catch(_){} resolve();};
    tx.onerror=()=>{try{db.close();}catch(_){} reject(tx.error);};
  }));
}
function photoGet(id){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,'readonly');
    const r=tx.objectStore(IDB_PHOTOS).get(id);
    r.onsuccess=()=>resolve(r.result||null);
    r.onerror=()=>reject(r.error);
    tx.oncomplete=()=>{try{db.close();}catch(_){}};
  }));
}
function photoDel(id){
  return idbOpen().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(IDB_PHOTOS,'readwrite');
    tx.objectStore(IDB_PHOTOS).delete(id);
    tx.oncomplete=()=>{try{db.close();}catch(_){} resolve();};
    tx.onerror=()=>{try{db.close();}catch(_){} reject(tx.error);};
  }));
}
function pruneNotified(obj){
  const keep={}, cutoff=Date.now()-14*864e5;
  Object.keys(obj||{}).forEach(k=>{
    const d=new Date((k.split('|')[1]||''));
    if(!isNaN(d)&&d.getTime()>=cutoff)keep[k]=obj[k];
  });
  return keep;
}
function updateStorageUI(){
  const el=document.getElementById('storageStatus');
  if(!el)return;
  const n=coupons.length;
  const map={
    granted:'Protected from automatic cleanup on this device.',
    prompt:'Not fully protected yet — tap Protect storage (and Add to Home Screen on iPhone).',
    denied:'This browser may still clear site data. Export a backup regularly.',
    checking:'Checking storage…',
    unsupported:'Export backups, and on iPhone use Add to Home Screen so Safari does not wipe unused data after 7 days.'
  };
  el.textContent=`${n} item${n===1?'':'s'} saved on this device. ${map[persistStatus]||''}`;
}
async function saveAll(quiet){
  notified=pruneNotified(notified);
  coupons=stripQrImg(coupons);
  const state=stateFromParts(coupons,settings,notified,Date.now());
  let idbOk=false, lsOk=false;
  try{await idbPut(state);idbOk=true;}catch(e){console.error('IndexedDB write failed',e);}
  try{localStorage.setItem(LS_KEY,JSON.stringify(state));lsOk=true;}
  catch(e){
    console.error('localStorage write failed',e);
    try{localStorage.setItem(LS_KEY,JSON.stringify({...state,notified:{}}));lsOk=true;}catch(_){}
  }
  updateStorageUI();
  if(!idbOk&&!lsOk){
    if(!quiet)toast('Could not save — storage is blocked or full');
    throw new Error('save failed');
  }
}
function persist(){
  if(!storeReady)return;
  saveAll(false).then(()=>updateAppBadge()).catch(()=>{});
}
async function loadAll(){
  let idbState=null, lsState=null;
  try{idbState=await idbGet();}catch(e){console.warn('IndexedDB read failed',e);}
  try{
    const raw=lsParse(LS_KEY,null);
    if(raw&&typeof raw==='object'&&Array.isArray(raw.coupons))lsState=raw;
  }catch(_){}
  const legacyCoupons=lsParse(OLD_DB_KEY,null);
  const candidates=[];
  if(idbState&&Array.isArray(idbState.coupons))candidates.push({src:'idb',st:idbState,t:idbState.savedAt||0});
  if(lsState)candidates.push({src:'ls',st:lsState,t:lsState.savedAt||0});
  if(Array.isArray(legacyCoupons)){
    candidates.push({src:'legacy',st:stateFromParts(legacyCoupons,lsParse(OLD_SET_KEY,null),lsParse(OLD_NOTE_KEY,null),0),t:0});
  }
  if(!candidates.length){
    coupons=[];settings=normalizeSettings(null);notified={};
    return;
  }
  const rank={idb:2,ls:1,legacy:0};
  candidates.sort((a,b)=> (b.t-a.t) || ((b.st.coupons||[]).length-(a.st.coupons||[]).length) || (rank[b.src]-rank[a.src]));
  applyState(candidates[0].st);
  try{await saveAll(true);}catch(_){}
}
async function requestPersistentStorage(){
  if(!navigator.storage||!navigator.storage.persist){
    persistStatus='unsupported';updateStorageUI();return false;
  }
  try{
    if(await navigator.storage.persisted()){persistStatus='granted';updateStorageUI();return true;}
    const ok=await navigator.storage.persist();
    persistStatus=ok?'granted':'prompt';
    updateStorageUI();
    return ok;
  }catch(_){
    persistStatus='unsupported';updateStorageUI();return false;
  }
}

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const today=()=>{const d=new Date();d.setHours(0,0,0,0);return d;};
const parseDate=s=>{const d=new Date((s||'')+'T00:00:00');d.setHours(0,0,0,0);return d;};
const daysLeft=s=>{const d=parseDate(s);if(isNaN(d))return null;return Math.round((d-today())/864e5);};
function hasExp(c){return !!(c&&c.exp)&&!isNaN(parseDate(c.exp));}
function kindLabel(k){return k==='gift'?'Gift card':k==='loyalty'?'Loyalty':'Coupon';}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200);}
function fallbackCopy(text){const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');toast('Code copied');}catch(e){toast('Tap & hold to copy');}ta.remove();}
function fmtDate(s){const d=parseDate(s);if(isNaN(d))return s||'—';return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}

function updateAppBadge() {
  if ('setAppBadge' in navigator) {
    const hrs = settings.badgeHours !== undefined ? settings.badgeHours : 48;
    if (hrs === 0) {
      navigator.clearAppBadge().catch(()=>{});
      return;
    }
    
    let count = 0;
    const now = Date.now();
    
    coupons.forEach(c => {
      if (c.used || !hasExp(c)) return;
      const expTime = parseDate(c.exp).setHours(23, 59, 59, 999);
      const hoursLeft = (expTime - now) / 3600000;
      if (hoursLeft >= 0 && hoursLeft <= hrs) count++;
    });
    
    if (count > 0) {
      navigator.setAppBadge(count).catch(()=>{});
    } else {
      navigator.clearAppBadge().catch(()=>{});
    }
  }
}

/* ---------- navigation ---------- */
function show(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('#view-'+view).classList.add('active');
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  $('#nav-'+view).classList.add('active');
  window.scrollTo(0,0);
}
$('#nav-list').onclick=()=>{renderList();show('list');};
$('#nav-add').onclick=()=>{resetForm();show('add');};
$('#nav-settings').onclick=()=>{renderSettings();show('settings');};

/* ---------- list rendering ---------- */
function statusOf(c){
  if(c.used) return {key:'used'};
  if(!hasExp(c)) return {key:'active',pill:'ok',label:c.kind==='coupon'?'No date':'No expiry',color:'var(--ok)'};
  const d=daysLeft(c.exp);
  if(d<0) return {key:'expired',pill:'exp',label:'Expired',color:'#64748b'};
  if(d===0) return {key:'active',pill:'crit',label:'Today!',color:'var(--warn)'};
  if(d<=1) return {key:'active',pill:'crit',label:'1 day left',color:'var(--warn)'};
  if(d<=7) return {key:'active',pill:'soon',label:d+' days left',color:'var(--soon)'};
  return {key:'active',pill:'ok',label:d+' days left',color:'var(--ok)'};
}
function renderList(){
  const q=$('#search').value.toLowerCase().trim();
  const cat=$('#filterCat').value;
  const fs=$('#filterStatus').value;
  const kind=$('#filterKind')?$('#filterKind').value:'';
  refreshCats();
  thumbUrls.forEach(u=>URL.revokeObjectURL(u));
  thumbUrls=[];
  let items=coupons.slice().sort((a,b)=>{
    const au=a.used?1:0,bu=b.used?1:0;if(au!==bu)return au-bu;
    const ae=(hasExp(a)&&daysLeft(a.exp)<0)?1:0,be=(hasExp(b)&&daysLeft(b.exp)<0)?1:0;if(ae!==be)return ae-be;
    if(!hasExp(a)&&!hasExp(b))return 0;if(!hasExp(a))return 1;if(!hasExp(b))return -1;
    return parseDate(a.exp)-parseDate(b.exp);
  });
  items=items.filter(c=>{
    if(fs==='active'&&(c.used||(hasExp(c)&&daysLeft(c.exp)<0)))return false;
    if(fs==='used'&&!c.used)return false;
    if(fs==='expired'&&(c.used||!hasExp(c)||daysLeft(c.exp)>=0))return false;
    if(cat&&c.cat!==cat)return false;
    if(kind&&(c.kind||'coupon')!==kind)return false;
    if(q){const hay=(c.store+' '+c.value+' '+c.code+' '+c.cat+' '+c.notes+' '+(c.balance||'')+' '+(c.kind||'')).toLowerCase();if(!hay.includes(q))return false;}
    return true;
  });
  const list=$('#list');
  if(!items.length){
    list.innerHTML=`<div class="empty"><div class="big">🎟️</div>
      <div>${coupons.length?'No items match.':'No coupons yet.'}</div>
      <div style="margin-top:14px"><button class="btn primary" onclick="document.getElementById('nav-add').click()">➕ Add your first</button></div></div>`;
    return;
  }
  list.innerHTML=items.map(c=>{
    const st=statusOf(c);
    const used=c.used?' used':'';
    const tags=[];
    if(c.kind&&c.kind!=='coupon')tags.push(kindLabel(c.kind));
    if(c.min)tags.push('min '+c.min);
    if(c.cat)tags.push(c.cat);
    const expLine=hasExp(c)?`Expires ${fmtDate(c.exp)}`:(c.kind==='coupon'?'No expiration date':'No expiration');
    return `<div class="card${used}">
      <div class="stripe" style="background:${st.color||'#475569'}"></div>
      <div class="card-top">
        ${c.hasPhoto?`<img class="thumb" data-photo="${c.id}" alt="">`:''}
        <div style="flex:1;min-width:0">
          <h3>${esc(c.store)} ${c.value?`<span class="val">${esc(c.value)}</span>`:''}
            <span style="flex:1"></span>
            ${st.pill?`<span class="pill ${st.pill}">${st.label}</span>`:c.used?'<span class="pill ok">Used</span>':''}
          </h3>
          <div class="meta">${expLine}</div>
          ${c.balance?`<div class="balance">${esc(c.balance)}</div>`:''}
          ${c.code?`<div class="code" data-copy="${esc(c.code)}">${esc(c.code)} ⧉</div>`:''}
          ${c.link?`<div class="meta">📍 ${linkify(c.link)}</div>`:''}
          ${c.notes?`<div class="meta">📝 ${esc(c.notes)}</div>`:''}
          ${tags.length?`<div class="tags">${tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`:''}
        </div>
      </div>
      ${c.kind==='gift'?`<div class="balrow">
        <button class="btn ghost" data-bal="${c.id}" data-dir="-">−</button>
        <button class="btn ghost" data-bal="${c.id}" data-dir="+">+</button>
        <span class="hint">Adjust balance</span>
      </div>`:''}
      <div class="actions">
        ${c.qr?`<button class="btn primary" data-qr="${c.id}">📱 Show code</button>`:''}
        ${hasExp(c)?`<button class="btn ghost" data-cal="${c.id}">📅 Calendar</button>`:''}
        <button class="btn ghost" data-edit="${c.id}">✏️ Edit</button>
        <button class="btn ghost" data-use="${c.id}">${c.used?'↩️ Unmark':'✅ Used'}</button>
        <button class="btn danger" data-del="${c.id}">🗑️</button>
      </div>
    </div>`;
  }).join('');
  items.filter(c=>c.hasPhoto).forEach(c=>{
    photoGet(c.id).then(blob=>{
      if(!blob)return;
      const img=document.querySelector(`[data-photo="${c.id}"]`);
      if(!img)return;
      const url=URL.createObjectURL(blob);
      thumbUrls.push(url);
      img.src=url;
    }).catch(()=>{});
  });
}
function esc(s){return (s||'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function linkify(s){if(/^https?:\/\//i.test(s))return `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a>`;return esc(s);}

/* delegate clicks on list */
$('#list').addEventListener('click',e=>{
  const photo=e.target.closest('[data-photo]');
  if(photo){showPhoto(photo.dataset.photo);return;}
  const bal=e.target.closest('[data-bal]');
  if(bal){adjustBalance(bal.dataset.bal, bal.dataset.dir);return;}
  const t=e.target.closest('[data-edit],[data-del],[data-use],[data-cal],[data-qr],[data-copy]');
  if(!t)return;
  if(t.dataset.copy!==undefined){const txt=t.dataset.copy;if(navigator.clipboard){navigator.clipboard.writeText(txt).then(()=>toast('Code copied')).catch(()=>fallbackCopy(txt));}else fallbackCopy(txt);return;}
  const id=t.dataset.edit||t.dataset.del||t.dataset.use||t.dataset.cal||t.dataset.qr;
  const c=coupons.find(x=>x.id===id);if(!c)return;
  if(t.dataset.qr!==undefined){showCode(c);}
  else if(t.dataset.edit){editCoupon(c);}
  else if(t.dataset.del){if(confirm('Delete this item?')){coupons=coupons.filter(x=>x.id!==id);photoDel(id).catch(()=>{});persist();renderList();toast('Deleted');}}
  else if(t.dataset.use){c.used=!c.used;persist();renderList();toast(c.used?'Marked used':'Reactivated');}
  else if(t.dataset.cal){downloadICS(c);}
});
['search','filterCat','filterStatus','filterKind'].forEach(id=>{const el=$('#'+id);if(el){el.addEventListener('input',renderList);el.addEventListener('change',renderList);}});

function refreshCats(){
  const cats=[...new Set(coupons.map(c=>c.cat).filter(Boolean))].sort();
  const sel=$('#filterCat');const cur=sel.value;
  sel.innerHTML='<option value="">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  sel.value=cur;
  $('#catlist').innerHTML=cats.map(c=>`<option value="${esc(c)}">`).join('');
}

/* ---------- form ---------- */
let previewUrl='';
function clearPreview(){
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
  $('#preview').removeAttribute('src');$('#formImgPreview').removeAttribute('src');
}
function resetForm(){
  $('#form').reset();$('#f-id').value='';
  $('#confirmNote').style.display='none';$('#qrDetected').style.display='none';$('#ocrRawWrap').style.display='none';
  $('#imgPreviewWrap').style.display='none';$('#imgPreviewWrap').removeAttribute('open');
  $('#preview').style.display='none';$('#ocrStatus').classList.remove('show');
  $('#keepPhotoRow').classList.remove('show');$('#f-keepPhoto').checked=true;
  pendingPhoto=null;
  clearPreview();
  const file=$('#file');if(file)file.value='';
  $('#f-kind').value='coupon';
  $('#f-barcodeFmt').value='auto';
  syncKindFields();
  setMode('scan');
}
function editCoupon(c){
  $('#f-id').value=c.id;$('#f-store').value=c.store;$('#f-value').value=c.value;
  $('#f-code').value=c.code;$('#f-exp').value=c.exp||'';$('#f-min').value=c.min;
  $('#f-cat').value=c.cat;$('#f-link').value=c.link;$('#f-qr').value=c.qr||'';$('#f-notes').value=c.notes;
  $('#f-kind').value=c.kind||'coupon';$('#f-balance').value=c.balance||'';
  $('#f-barcodeFmt').value=c.barcodeFormat||'auto';
  if(c.barcodeFormat) setBarcodeFormatSelect(c.barcodeFormat);
  $('#confirmNote').style.display='none';$('#qrDetected').style.display='none';$('#ocrRawWrap').style.display='none';
  pendingPhoto=null;
  $('#keepPhotoRow').classList.remove('show');
  if(c.hasPhoto){
    photoGet(c.id).then(blob=>{
      if(!blob)return;
      pendingPhoto=blob;
      const url=URL.createObjectURL(blob);
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=url;
      $('#formImgPreview').src=url;
      $('#imgPreviewWrap').style.display='block';
      $('#keepPhotoRow').classList.add('show');
      $('#f-keepPhoto').checked=true;
    }).catch(()=>{});
  }else{
    $('#imgPreviewWrap').style.display='none';$('#formImgPreview').removeAttribute('src');
  }
  syncKindFields();
  setMode('manual');show('add');
}
function syncKindFields(){
  const kind=$('#f-kind').value;
  const coupon=kind==='coupon';
  $('#balanceRow').style.display=kind==='gift'?'flex':'none';
  $('#expLabel').textContent=coupon?'Expiration date *':'Expiration date';
  $('#f-exp').required=coupon;
}
$('#f-kind').addEventListener('change',syncKindFields);
$('#cancelEdit').onclick=()=>{const wasEdit=!!$('#f-id').value;resetForm();if(wasEdit){renderList();show('list');}};
$('#form').addEventListener('submit',async e=>{
  e.preventDefault();
  const exp=$('#f-exp').value;
  const kind=$('#f-kind').value||'coupon';
  if(!$('#f-store').value.trim()){toast('Add a store name');return;}
  if(kind==='coupon'&&!exp){toast('Add an expiration date');return;}
  const id=$('#f-id').value||uid();
  const existing=coupons.find(c=>c.id===id);
  const qr=$('#f-qr').value.trim();
  const keepPhoto=$('#f-keepPhoto').checked&&!!pendingPhoto;
  const c={id,kind,store:$('#f-store').value.trim(),value:$('#f-value').value.trim(),
    code:$('#f-code').value.trim(),exp,min:$('#f-min').value.trim(),
    cat:$('#f-cat').value.trim(),link:$('#f-link').value.trim(),qr,
    barcodeFormat:$('#f-barcodeFmt').value||'auto',
    balance:kind==='gift'?$('#f-balance').value.trim():'',
    notes:$('#f-notes').value.trim(),used:existing?existing.used:false,
    hasPhoto:keepPhoto||(existing&&existing.hasPhoto&&$('#f-keepPhoto').checked&&!pendingPhoto),
    created:existing?existing.created:Date.now()};
  if(!keepPhoto && existing && existing.hasPhoto && !$('#f-keepPhoto').checked){
    c.hasPhoto=false;
    photoDel(id).catch(()=>{});
  }
  if(existing)Object.assign(existing,c);else coupons.push(c);
  if(keepPhoto&&pendingPhoto){
    try{await photoPut(id, pendingPhoto);c.hasPhoto=true;if(existing)existing.hasPhoto=true;}
    catch(err){console.error(err);toast('Saved details, but the photo could not be stored');}
  }
  persist();resetForm();renderList();show('list');toast('Saved ✓');
});

/* ---------- mode toggle ---------- */
function setMode(m){
  const scan=m==='scan';
  $('#modeScan').classList.toggle('active',scan);
  $('#modeManual').classList.toggle('active',!scan);
  $('#scanBox').style.display=scan?'block':'none';
}
$('#modeScan').onclick=()=>setMode('scan');
$('#modeManual').onclick=()=>setMode('manual');

/* ---------- OCR ---------- */
$('#drop').onclick=()=>$('#file').click();

async function compressImage(file, max=1100, quality=0.72){
  return new Promise(resolve=>{
    const img=new Image();
    const src=URL.createObjectURL(file);
    img.onload=()=>{
      const scale=Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
      const w=Math.max(1, Math.round(img.naturalWidth*scale));
      const h=Math.max(1, Math.round(img.naturalHeight*scale));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(src);
      cv.toBlob(b=>resolve(b||file),'image/jpeg',quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(src);resolve(file);};
    img.src=src;
  });
}
async function scaleImageForOcr(file, max=2000){
  return new Promise(resolve=>{
    const img=new Image();const src=URL.createObjectURL(file);
    img.onload=()=>{
      const scale=Math.min(max/Math.max(img.naturalWidth,img.naturalHeight),2);
      const w=Math.max(1,Math.round(img.naturalWidth*scale));
      const h=Math.max(1,Math.round(img.naturalHeight*scale));
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(src);
      cv.toBlob(b=>resolve(b||file),'image/png');
    };
    img.onerror=()=>{URL.revokeObjectURL(src);resolve(file);};
    img.src=src;
  });
}
async function preprocessImage(file){
  return new Promise(resolve=>{
    const img=new Image();const src=URL.createObjectURL(file);
    img.onload=()=>{
      const MAX=2400;
      const scale=img.naturalWidth<MAX?Math.min(MAX/img.naturalWidth,3):1;
      const w=Math.round(img.naturalWidth*scale),h=Math.round(img.naturalHeight*scale);
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      const ctx=cv.getContext('2d');ctx.drawImage(img,0,0,w,h);
      const id=ctx.getImageData(0,0,w,h);const px=id.data;
      for(let i=0;i<px.length;i+=4){
        const g=0.299*px[i]+0.587*px[i+1]+0.114*px[i+2];
        const v=Math.min(255,Math.max(0,(g-128)*1.5+128));
        px[i]=px[i+1]=px[i+2]=v;
      }
      ctx.putImageData(id,0,0);
      URL.revokeObjectURL(src);
      cv.toBlob(b=>resolve(b||file),'image/png');
    };
    img.onerror=()=>{URL.revokeObjectURL(src);resolve(file);};
    img.src=src;
  });
}
function ocrScore(text){
  const t=text||'';
  const cjk=(t.match(/[\u4e00-\u9fff]/g)||[]).length;
  const letters=(t.match(/[A-Za-z]/g)||[]).length;
  return cjk*2+letters+Math.min(t.length,400)/10;
}
function ocrLooksWeak(text){return ocrScore(text)<20;}
function ocrLogger(m){
  if(m.status==='recognizing text'){$('#progbar').style.width=Math.round(m.progress*100)+'%';
    $('#ocrStatus').textContent='Reading text… '+Math.round(m.progress*100)+'%';}
  else if(m.status&&m.status.indexOf('language')>=0){$('#ocrStatus').textContent='Downloading language data (one time)…';}
  else if(m.status)$('#ocrStatus').textContent=m.status.charAt(0).toUpperCase()+m.status.slice(1)+'…';
}
async function ocrBest(file, langs){
  if(typeof Tesseract.createWorker==='function'){
    const worker=await Tesseract.createWorker(langs,1,{logger:ocrLogger});
    try{
      await worker.setParameters({tessedit_pageseg_mode:'6'});
      const mild=await scaleImageForOcr(file);
      const r1=await worker.recognize(mild);
      let text=(r1.data&&r1.data.text)||'';
      if(ocrLooksWeak(text)){
        $('#ocrStatus').textContent='Trying a clearer scan…';
        const processed=await preprocessImage(file);
        const r2=await worker.recognize(processed);
        const t2=(r2.data&&r2.data.text)||'';
        if(ocrScore(t2)>ocrScore(text)) text=t2;
      }
      return text;
    }finally{
      try{await worker.terminate();}catch(_){}
    }
  }
  const mild=await scaleImageForOcr(file);
  const r1=await Tesseract.recognize(mild,langs,{logger:ocrLogger});
  return (r1.data&&r1.data.text)||'';
}
$('#file').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  clearPreview();
  previewUrl=URL.createObjectURL(f);
  const url=previewUrl;
  $('#preview').src=url;$('#preview').style.display='block';
  
  // Set the temporary image preview for the confirmation form
  $('#formImgPreview').src=url;
  $('#imgPreviewWrap').style.display='block';
  $('#imgPreviewWrap').removeAttribute('open'); // Ensure it is collapsed initially
  
  $('#progwrap').classList.add('show');$('#ocrStatus').classList.add('show');
  $('#ocrStatus').textContent='Reading text…';
  
  // Explicitly sort languages so Traditional Chinese takes priority over Simplified Chinese for the OCR engine
  const PRIORITY=['eng','chi_tra','chi_sim','jpn'];
  const userLangs=(settings.langs&&settings.langs.length)?settings.langs:['eng'];
  const langs=userLangs.slice().sort((a,b)=>PRIORITY.indexOf(a)-PRIORITY.indexOf(b)).join('+');
  
  try{
    const text=await ocrBest(f, langs);
    fillFromText(text);
    try{
      const decoded=await decodeBarcode(f, url);
      if(decoded&&decoded.text){
        $('#f-qr').value=decoded.text;
        if(decoded.format){
          setBarcodeFormatSelect(decoded.format);
          $('#qrDetected').textContent='✓ '+formatLabel(decoded.format)+' detected — the app will show the same format at the register.';
        }else{
          $('#qrDetected').textContent='✓ Code detected in your screenshot.';
        }
        $('#qrDetected').style.display='block';
      }
    }catch(_){}
    try{pendingPhoto=await compressImage(f);}catch(_){pendingPhoto=f;}
    $('#keepPhotoRow').classList.add('show');$('#f-keepPhoto').checked=true;
    $('#ocrStatus').textContent='Done — check the details below.';
  }catch(err){
    console.error(err);
    $('#ocrStatus').textContent='Could not read that image — enter details manually below.';
    setMode('manual');
  }finally{$('#progwrap').classList.remove('show');e.target.value='';}
});

function inferCategory(text){
  const t=text.toLowerCase();
  const rules=[
    [/\b(groceries|grocery|supermarket|mart|fresh\s+food|food\s+market)|(超市|食料品|生鮮|スーパー|コンビニ|食材|食品)/,'Groceries'],
    [/\b(restaurant|dining|cafe|café|coffee|eatery|takeaway|takeout|food\s+delivery|pizza|burger|sushi|boba|milk\s+tea)|(餐廳|飲食|咖啡|外食|居酒屋|定食|弁当|ランチ|料理|食堂|レストラン|カフェ|デリバリー)/,'Dining'],
    [/\b(fashion|clothing|clothes|apparel|outfit|shoes|footwear|sneakers|handbag)|(衣服|時裝|服飾|衣料|鞋|包包|ファッション|洋服|アパレル|ブランド)/,'Fashion'],
    [/\b(pharmacy|drugstore|medicine|vitamin|supplement|wellness|health\s+product)|(藥房|藥局|保健品|健康食品|醫藥品|薬局|薬|医薬品)/,'Health'],
    [/\b(electronics|gadget|computer|laptop|smartphone|mobile\s+phone|tablet|camera)|(電器|電腦|手機|家電|電子機器|スマホ|パソコン|テクノロジー)/,'Electronics'],
    [/\b(beauty|cosmetic|makeup|skincare|moistur|serum|lipstick|salon|spa)|(美妆|美妝|美容|護膚|彩妝|美髮|護髮|化粧品|スキンケア|コスメ)/,'Beauty'],
    [/\b(hotel|flight|airline|travel|tour|booking|accommodation|airport\s*express)|(旅行|旅遊|酒店|航空|民宿|宿泊|旅館|ホテル|機場|空港)/,'Travel'],
    [/\b(cinema|movie|theatre|theater|concert|ticket|gym|fitness|sport)|(娛樂|映画|スポーツ|ゲーム|フィットネス|健身|映画館)/,'Entertainment'],
    [/\b(book|stationery|office\s+supply|school\s+supply)|(文具|書籍|教材|本|雑誌|辦公)/,'Books & Office'],
    [/\b(furniture|home\s+d[eé]cor|kitchenware|appliance|household)|(家具|家居|家電|廚具|生活用品|インテリア|家庭用品)/,'Home'],
    [/\b(baby|infant|toddler|kids|children|toy)|(兒童|童裝|玩具|育兒|子供|キッズ|おもちゃ)/,'Kids'],
    [/\b(pet|dog|cat|puppy|kitten)|(寵物|ペット|愛犬|愛猫|猫|犬)/,'Pets'],
  ];
  for(const [re,cat] of rules)if(re.test(t))return cat;
  return '';
}

function detectAmount(t){
  let m;
  m=t.match(/\b(HK|US|NT|SG|AU|CA|NZ|RM)\s?[S$＄]\s?(\d{1,5}(?:\.\d{2})?)/i);
  if(m)return m[1].toUpperCase()+'$'+m[2];
  m=t.match(/[¥￥]\s?(\d{1,6})/);if(m)return '¥'+m[1];
  m=t.match(/(\d{1,6})\s*円/);if(m)return m[1]+'円';
  m=t.match(/(\d{1,6})\s*[元圓]/);if(m)return m[1]+'元';
  m=t.match(/£\s?(\d{1,5}(?:\.\d{2})?)/);if(m)return '£'+m[1];
  m=t.match(/€\s?(\d{1,5}(?:\.\d{2})?)/);if(m)return '€'+m[1];
  m=t.match(/₩\s?(\d{1,7})/);if(m)return '₩'+m[1];
  m=t.match(/฿\s?(\d{1,5}(?:\.\d{2})?)/);if(m)return '฿'+m[1];
  m=t.match(/₹\s?(\d{1,6}(?:\.\d{2})?)/);if(m)return '₹'+m[1];
  m=t.match(/(?<![A-Za-z0-9])[$＄]\s?(\d{1,5}(?:\.\d{2})?)/);if(m)return '$'+m[1];
  return '';
}

function detectVoucherAmount(t){
  let m = t.match(/\b(HK|US|NT|SG|AU|CA|NZ|RM)\s?[S$＄]\s?(\d{1,5}(?:\.\d{2})?)(?=\s*(?:eVoucher|Voucher|電子|现金|現金|礼券|禮券|折扣|coupon|扣減))/i);
  if(m) return m[1].toUpperCase()+'$'+m[2];
  m = t.match(/(?:eVoucher|Voucher|電子|现金|現金|礼券|禮券|折扣|coupon|扣減)\s*(HK|US|NT|SG|AU|CA|NZ|RM)\s?[S$＄]\s?(\d{1,5}(?:\.\d{2})?)/i);
  if(m) return m[1].toUpperCase()+'$'+m[2];
  m = t.match(/(\d{1,5}(?:\.\d{2})?)\s*(HK|US|NT|SG|AU|CA|NZ|RM)\s?[S$＄](?=\s*(?:eVoucher|Voucher|電子|现金|現金|礼券|禮券|折扣|coupon|扣減))/i);
  if(m) return m[2].toUpperCase()+'$'+m[1];
  m = t.match(/(HK|US|NT|SG|AU|CA|NZ|RM)\s?[S$＄]\s?(\d{1,5}(?:\.\d{2})?)\s*(?:電子|现金|現金|礼券|禮券)/i);
  if(m) return m[1].toUpperCase()+'$'+m[2];
  return '';
}

const KNOWN_STORES=[
  [/機場快[綫線]|airport\s*express/i,'機場快綫 Airport Express'],
  [/\b港鐵\b|\bmtr\b/i,'MTR 港鐵'],
  [/百佳|parknshop/i,'ParknShop 百佳'],
  [/惠康|wellcome/i,'Wellcome 惠康'],
  [/萬寧|mannings/i,'Mannings 萬寧'],
  [/屈臣|watsons/i,'Watsons 屈臣氏'],
  [/7-?eleven|seven\s*eleven|七.?十一/i,'7-Eleven'],
  [/city'?s?uper/i,"city'super"],
  [/\baeon\b|永旺/i,'AEON'],
  [/\byata\b|一田/i,'YATA 一田'],
  [/starbucks|星巴克/i,'Starbucks'],
  [/mcdonald|麥當勞|麦当劳/i,"McDonald's"],
  [/\bkfc\b|肯德基/i,'KFC'],
  [/uniqlo|優衣庫|优衣库/i,'UNIQLO'],
  [/\bikea\b|宜家/i,'IKEA']
];
function pickStore(lines, text){
  for(const [re,name] of KNOWN_STORES){
    if(re.test(text)) return name;
  }
  const skip=/客戶|客户|親愛|亲爱|多謝|多谢|折|円|年|月|日|有效|有効|期限|[满滿]|[减減]|扫|掃|码|碼|獎賞|奖赏|詳情|详情|領取|领取|前往|請按|请按|二維|二维|禮券|礼券|現金券|现金券|電子券|电子券|優惠券|优惠券|eVoucher|Voucher|valid\s+until|ticket\s*no/i;
  const amtLine=lines.find(l=>(/(?:HK|US|NT)?\s?[S$＄¥￥]\s?\d/i.test(l)||/\d\s*[円元圓]/.test(l))&&/[぀-ヿ一-鿿]/.test(l)&&l.length<60);
  if(amtLine){
    const s=amtLine.split(/(?:HK|US|NT)?\s?[S$＄¥￥]\s?\d|\d+\s*[円元圓]|[\[\(【]/i)[0].replace(/[^\p{L}\p{N} &'.\-]/gu,'').trim();
    if(s.length>=2) return s;
  }
  const scored=[];
  for(const l of lines){
    const cl=l.replace(/[^\p{L}\p{N} &'.\-—–()（）]/gu,'').trim();
    if(cl.length<4||cl.length>52) continue;
    if(/^\d/.test(cl)) continue;
    if(/^[A-Z0-9#\-_]{8,}$/i.test(cl)) continue;
    if(/%|\$|http|code|expir|valid|until|ticket\s*no/i.test(cl)) continue;
    if(skip.test(l)) continue;
    let s=0;
    if(/[票券]|ticket|voucher|coupon/i.test(cl)) s+=8;
    if(/[\u4e00-\u9fff]/.test(cl)&&/[A-Za-z]/.test(cl)) s+=6;
    if(cl.length>=8&&cl.length<=40) s+=4;
    if(cl.length<=4) s-=10;
    if(/^[\u4e00-\u9fff]{2,4}$/.test(cl)) s-=8;
    if(/成人|兒童|單程|來回|airport|express|station/i.test(cl)) s+=5;
    scored.push({cl,s});
  }
  scored.sort((a,b)=>b.s-a.s);
  return (scored[0]&&scored[0].s>0)?scored[0].cl:'';
}

function fillFromText(text){
  const t=text.normalize('NFKC').replace(/ /g,' ');
  const lines=t.split('\n').map(l=>l.trim()).filter(Boolean);
  let m,mm;
  
  // value
  let value = detectVoucherAmount(t);
  
  if(!value){ m=t.match(/(?:up\s+to\s+|extra\s+|additional\s+)?\b(\d{1,3})\s*(?:%|％)\s*(?:off|discount)/i); if(m)value=m[1]+'% off'; }
  // Block random bare percentages like "2%" from being interpreted as discounts
  if(!value){ m=t.match(/(?<!\d)(1[05]|2[05]|3[05]|4[05]|5[05]|6[05]|7[05]|8[05]|9[05])\s*(?:%|％)(?!\s*(?:done|complete|full|left|remaining|charge|battery|vol|more|increase))/i); if(m)value=m[1]+'% off'; }
  if(!value){ m=t.match(/([£€$＄₩฿₹])\s?(\d{1,5}(?:\.\d{2})?)\s*(?:off|back)/i); if(m)value=m[1]+m[2]+' off'; }
  if(!value){ m=t.match(/save\s+([£€$＄¥₩฿₹])\s?(\d{1,5}(?:\.\d{2})?)/i); if(m)value=m[1]+m[2]+' off'; }
  if(!value){ m=t.match(/[满滿]\s*(\d{1,5})\s*[减減]\s*(\d{1,5})/); if(m){value='-¥'+m[2]+' (满'+m[1]+')';} }
  if(!value){ m=t.match(/([0-9](?:\.[0-9])?)\s*折/); if(m){const n=parseFloat(m[1]);value=m[1]+'折 ('+Math.round((1-n/10)*100)+'% off)';} }
  if(!value){ m=t.match(/(\d{1,5})\s*円\s*(?:off|オフ|引)/i); if(m)value='¥'+m[1]+' off'; }
  if(!value){ m=t.match(/(\d{1,3})\s*(?:%|％)\s*(?:off|オフ|引|引き|割引)/i); if(m)value=m[1]+'% off'; }
  if(!value){ m=t.match(/(\d{1,2})\s*割(?:引)?/); if(m)value=m[1]+'割 ('+(parseInt(m[1],10)*10)+'% off)'; }
  if(!value&&/\bBOGO\b|buy one get one|买一[送赠]一|買一[送贈]一|1\s*つ買うと/i.test(t)) value='BOGO';
  if(!value&&/free shipping|免运费|免運費|免費運費|包邮|包郵|送料無料|宅配無料/i.test(t)) value='Free shipping';
  if(!value){ m=t.match(/立[减減]\s*(\d{1,5})/); if(m)value='-¥'+m[1]+' (立减)'; }
  if(!value){ m=t.match(/每[满滿]\s*(\d{1,5})\s*[减減]\s*(\d{1,5})/); if(m)value='-¥'+m[2]+' (每满'+m[1]+')'; }
  if(!value && /單程票/.test(t)) value = /成人/.test(t) ? '單程票 (成人)' : '單程票';
  if(!value && /single\s+journey/i.test(t)) value = 'Single journey';
  if(!value) value=detectAmount(t);
  
  // code — ticket numbers first so a labelled "Ticket No." beats the long QR payload
  let code='';
  m=t.match(/(?:ticket\s*(?:no\.?|number|#)|車票編號|車票號碼|票號|票号)[:\s]*([A-Z][A-Z0-9\-]{6,36})/i);
  if(m)code=m[1].toUpperCase();
  if(!code){
    m=t.match(/(?:code|promo(?:tion)?|coupon|voucher|discount\s+code|offer\s+code|redeem|enter\s+code|apply|use\s+code|优惠码|優惠碼|折扣码|折扣碼|促销码|促銷碼|兑换码|兌換碼|代码|代碼|序号|序號|号码|號碼|券码|券碼|番号|券号|クーポンコード|クーポン番号|コード|引換コード|バウチャー)[^a-zA-Z0-9]{0,6}([A-Z0-9#\-_]{5,20})(?=$|[^a-zA-Z0-9#\-_])/i);
    if(m)code=m[1].toUpperCase();
  }

  if(!code){
    const NOISE=/^(https?|www|the|and|for|off|use|get|buy|save|you|your|valid|until|after|from|with|this|only|new|free|see|more|shop|here|our|all|any|now|per|app|day|time|item|date|order|amount|total)$/i;
    const re=/(?:^|[^a-zA-Z0-9#\-_])([A-Z0-9#\-_]{5,20})(?=$|[^a-zA-Z0-9#\-_])/gi;
    let best=null, bscore=-1, firstValid=null;
    
    while((mm=re.exec(t))!==null){
      const s=mm[1];
      if(!/[A-Z]/i.test(s) || !/\d/.test(s)) continue; 
      if(NOISE.test(s)) continue;
      
      if(/^(?:HK|US|NT|SG|RM|AU|CA|NZ)[S$]?\d+(?:\.\d+)?$/i.test(s)) continue;
      if(/^[£€$＄¥￥₩฿₹]\d+/i.test(s)) continue;

      if(!firstValid) firstValid = s;

      const before=t.slice(Math.max(0,mm.index-80),mm.index).toLowerCase();
      const score=/code|promo|coupon|voucher|discount|offer|redeem|enter|apply|use|优惠|優惠|折扣|促销|促銷|兑换|兌換|代码|代碼|序号|序號|号码|號碼|券码|券碼|番号|券号|编号|編號|クーポン|コード|引換|バウチャー/.test(before)?2:s.includes('-')?1:0;
      
      if(score>bscore){best=s;bscore=score;}
    }
    
    if(best && bscore > 0) code=best.toUpperCase();
    else if(firstValid) code=firstValid.toUpperCase();
  }

  // min spend
  let min='';
  m=t.match(/(?:orders?\s+(?:over|of)|minimum(?:\s+purchase)?(?:\s+of)?|spend(?:\s+over)?|min\.?)\s*[£€$＄¥₩฿₹]?\s?(\d{1,5}(?:\.\d{2})?)/i);
  if(m)min='$'+m[1];
  if(!min){m=t.match(/[满滿満]\s*(\d{1,5})/);if(m)min='¥'+m[1];} 
  if(!min){m=t.match(/(\d{1,5})\s*円\s*以上/);if(m)min='¥'+m[1];}
  if(!min){m=t.match(/(\d{1,5})\s*元\s*以上/);if(m)min='¥'+m[1];}  
  if(!min){m=t.match(/[満滿満]\s*(\d{1,5})\s*円/);if(m)min='¥'+m[1];} 
  
  // link
  let link='';
  m=t.match(/https?:\/\/[^\s<>"'，。、　]+/i);
  if(m)link=m[0].replace(/[.,;:!?)]+$/,'');
  
  // expiration
  let exp=findDate(t);
  
  // store
  const store=pickStore(lines, t);
  
  // fill
  if(store)$('#f-store').value=store;
  if(value)$('#f-value').value=value;
  if(code)$('#f-code').value=code;
  if(min)$('#f-min').value=min;
  if(link)$('#f-link').value=link;
  if(exp)$('#f-exp').value=exp;
  const cat=inferCategory(t);if(cat)$('#f-cat').value=cat;
  $('#ocrRaw').textContent=text.trim();
  $('#ocrRawWrap').style.display=text.trim()?'block':'none';
  $('#confirmNote').style.display='block';
  if(/gift\s*card|禮品卡|礼品卡|ギフトカード|現金券|现金券/i.test(t)){$('#f-kind').value='gift';syncKindFields();}
  else if(/loyalty|membership|會員|会员|メンバー/i.test(t)){$('#f-kind').value='loyalty';syncKindFields();}
  setMode('manual');
}

const MONTHS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function toISO(y,mo,d){if(y<100)y+=2000;const dt=new Date(y,mo,d);if(isNaN(dt))return'';return dt.getFullYear()+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function findDate(t){
  const exKw=/(expir\w*|valid\s+(?:thru|through|until|to)|ends?|use\s+by|redeem\s+by|good\s+(?:thru|through|until)|有效期至|有效期限|有效期|截止|到期|期限|使用截止|活[動动]截止|有効期限|使用期限|ご利用期限|終了日|期間終了|まで|迄|利用期限)/i;
  const patterns=[
    /(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g,             // 2025-12-31
    /(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?!\d)/g,          // 12/31/2025
    /(?<!\d)(\d{1,2})-(\d{1,2})-(\d{2,4})(?!\d)/g,            // 12-31-2025
    /([A-Za-z]{3,9})\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?,?\s*(\d{2,4})?/g, // Dec 31, 2025
    /(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s*,?\s*(\d{2,4})?/g // 31 Dec 2025
  ];
  const cands=[];
  let mm;
  while((mm=patterns[0].exec(t))){cands.push({i:mm.index,iso:toISO(+mm[1],+mm[2]-1,+mm[3])});}
  [patterns[1],patterns[2]].forEach(p=>{while((mm=p.exec(t))){let a=+mm[1],b=+mm[2],y=+mm[3];let mo=a,d=b;if(a>12&&b<=12){mo=b;d=a;}cands.push({i:mm.index,iso:toISO(y,mo-1,d)});}});
  function nextYearIf(iso){if(!iso)return iso;const d=parseDate(iso);return d<today()?toISO(d.getFullYear()+1,d.getMonth(),d.getDate()):iso;}
  while((mm=patterns[3].exec(t))){const mo=MONTHS[mm[1].slice(0,3).toLowerCase()];if(mo===undefined)continue;const hasY=!!mm[3];const iso=toISO(hasY?+mm[3]:new Date().getFullYear(),mo,+mm[2]);cands.push({i:mm.index,iso:hasY?iso:nextYearIf(iso)});}
  while((mm=patterns[4].exec(t))){const mo=MONTHS[mm[2].slice(0,3).toLowerCase()];if(mo===undefined)continue;const hasY=!!mm[3];const iso=toISO(hasY?+mm[3]:new Date().getFullYear(),mo,+mm[1]);cands.push({i:mm.index,iso:hasY?iso:nextYearIf(iso)});}
  let cjk=/(?:(\d{4})\s*年)?\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
  while((mm=cjk.exec(t))){const hasY=!!mm[1];const iso=toISO(hasY?+mm[1]:new Date().getFullYear(),+mm[2]-1,+mm[3]);cands.push({i:mm.index,iso:hasY?iso:nextYearIf(iso),cjk:hasY});}
  let ymd=/(?<!\d)(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})(?!\d)/g;
  while((mm=ymd.exec(t))){cands.push({i:mm.index,iso:toISO(+mm[1],+mm[2]-1,+mm[3]),cjk:true});}
  const valid=cands.filter(c=>c.iso);
  if(!valid.length)return'';
  const lower=t.toLowerCase();
  const fut=valid.filter(c=>(parseDate(c.iso)-today())>=0);
  const pool=fut.length?fut:valid;
  pool.forEach(c=>{
    let score=0;
    const around=lower.slice(Math.max(0,c.i-30),c.i);
    if(exKw.test(around))score+=100;
    if(c.cjk)score+=15; 
    c.score=score;
  });
  pool.sort((a,b)=>b.score-a.score || (parseDate(b.iso)-parseDate(a.iso)));
  return pool[0].iso;
}

/* ---------- ICS / calendar ---------- */
function icsDate(d){return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');}
function downloadICS(c){
  if(!hasExp(c)){toast('Add an expiration date first');return;}
  const exp=parseDate(c.exp);
  if(isNaN(exp)){toast('That expiration date is not valid');return;}
  const dtEnd=new Date(exp);dtEnd.setDate(dtEnd.getDate()+1); 
  const stamp=new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
  const title=`Coupon expires: ${c.store}${c.value?' ('+c.value+')':''}`;
  const desc=[c.value?'Value: '+c.value:'',c.code?'Code: '+c.code:'',c.min?'Min spend: '+c.min:'',c.link?'Where: '+c.link:'',c.notes?'Notes: '+c.notes:'']
    .filter(Boolean).join('\\n');
  const alarms=(settings.reminderDays||[7,1]).map(d=>
`BEGIN:VALARM
TRIGGER:-P${d}D
ACTION:DISPLAY
DESCRIPTION:${esc2(c.store)} coupon expires in ${d} day${d===1?'':'s'}
END:VALARM`).join('\n');
  const ics=`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Coupon Keeper//EN
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:${c.id}@couponkeeper
DTSTAMP:${stamp}
DTSTART;VALUE=DATE:${icsDate(exp)}
DTEND;VALUE=DATE:${icsDate(dtEnd)}
SUMMARY:${esc2(title)}
DESCRIPTION:${desc}
${alarms}
END:VEVENT
END:VCALENDAR`;
  const blob=new Blob([ics],{type:'text/calendar'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;
  a.download=`coupon-${c.store.replace(/\W+/g,'_')||'reminder'}.ics`;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Opening calendar reminder…');
}
function esc2(s){return (s||'').replace(/([,;\\])/g,'\\$1').replace(/\n/g,'\\n');}

/* ---------- barcodes ---------- */
const BCID={
  QR:'qrcode', DATAMATRIX:'datamatrix', AZTEC:'azteccode', PDF417:'pdf417',
  CODE128:'code128', CODE39:'code39', CODE93:'code93',
  EAN13:'ean13', EAN8:'ean8', UPC:'upca', UPCE:'upce',
  CODABAR:'rationalizedCodabar', ITF:'interleaved2of5'
};
const FORMAT_LABEL={
  QR:'QR code', DATAMATRIX:'Data Matrix', AZTEC:'Aztec', PDF417:'PDF417',
  CODE128:'Code 128', CODE39:'Code 39', CODE93:'Code 93',
  EAN13:'EAN-13', EAN8:'EAN-8', UPC:'UPC-A', UPCE:'UPC-E',
  CODABAR:'Codabar', ITF:'ITF'
};
function formatLabel(f){return FORMAT_LABEL[f]||f||'barcode';}
function mapScannerFormat(name){
  const n=String(name||'').toUpperCase().replace(/[\s-]+/g,'_');
  const map={
    QR_CODE:'QR', QR:'QR',
    DATA_MATRIX:'DATAMATRIX', DATAMATRIX:'DATAMATRIX',
    AZTEC:'AZTEC', AZTEC_CODE:'AZTEC',
    PDF_417:'PDF417', PDF417:'PDF417',
    CODE_128:'CODE128', CODE128:'CODE128',
    CODE_39:'CODE39', CODE39:'CODE39',
    CODE_93:'CODE93', CODE93:'CODE93',
    CODABAR:'CODABAR',
    ITF:'ITF', INTERLEAVED_2_OF_5:'ITF',
    EAN_13:'EAN13', EAN13:'EAN13',
    EAN_8:'EAN8', EAN8:'EAN8',
    UPC_A:'UPC', UPCA:'UPC', UPC:'UPC',
    UPC_E:'UPCE', UPCE:'UPCE'
  };
  return map[n]||'';
}
function extractScannerFormat(result){
  if(!result||typeof result!=='object')return '';
  const fmt=result.result&&result.result.format;
  const name=(fmt&&(fmt.formatName||fmt.format))
    || (result.result&&result.result.debugData&&result.result.debugData.decoderName)
    || result.decoderName
    || result.format
    || '';
  return mapScannerFormat(name);
}
function setBarcodeFormatSelect(format){
  const sel=$('#f-barcodeFmt');
  if(!sel||!format||format==='auto'){if(sel&&format)sel.value=format;return;}
  if(![...sel.options].some(o=>o.value===format)){
    const opt=document.createElement('option');
    opt.value=format;opt.textContent=formatLabel(format);
    sel.appendChild(opt);
  }
  sel.value=format;
}
function guessFormat(text){
  const t=(text||'').trim();
  if(/^https?:\/\//i.test(t)) return 'QR';
  if(/^\d{13}$/.test(t)) return 'EAN13';
  if(/^\d{12}$/.test(t)) return 'UPC';
  if(/^\d{8}$/.test(t)) return 'EAN8';
  return '';
}
function resolveFormat(c){
  const f=(c.barcodeFormat||'auto');
  if(f&&f!=='auto') return f;
  return guessFormat(c.qr)||'QR';
}
function genQR(text){
  try{
    if(typeof qrcode==='undefined')return'';
    const qr=qrcode(0,'M');qr.addData(text);qr.make();
    return qr.createDataURL(8,16);
  }catch(e){return'';}
}
function genWithBwip(text, format){
  const api=(typeof bwipjs!=='undefined')?bwipjs:null;
  if(!api||typeof api.toCanvas!=='function')return '';
  const bcid=BCID[format];
  if(!bcid)return '';
  const canvas=document.createElement('canvas');
  const is2d=['QR','DATAMATRIX','AZTEC','PDF417'].includes(format);
  const opts={
    bcid,
    text:String(text),
    scale:is2d?6:3,
    includetext:!is2d,
    textxalign:'center',
    backgroundcolor:'FFFFFF',
    barcolor:'000000'
  };
  if(!is2d) opts.height=16;
  if(format==='QR') opts.eclevel='M';
  api.toCanvas(canvas, opts);
  return canvas.toDataURL('image/png');
}
function genBarcodeDataUrl(text, format){
  if(!text)return '';
  const fmt=format&&format!=='auto'?format:guessFormat(text)||'QR';
  try{
    const bw=genWithBwip(text, fmt);
    if(bw)return bw;
  }catch(e){console.warn('bwip-js could not draw', fmt, e);}
  if(fmt==='QR'||!BCID[fmt]||['DATAMATRIX','AZTEC','PDF417'].includes(fmt)){
    return genQR(text);
  }
  if(typeof JsBarcode==='undefined') return genQR(text);
  try{
    const cv=document.createElement('canvas');
    JsBarcode(cv, text, {format:fmt, displayValue:true, fontSize:16, margin:12, width:2, height:80, lineColor:'#0f172a', background:'#ffffff'});
    return cv.toDataURL('image/png');
  }catch(e){
    return genQR(text);
  }
}
function decodeQR(src){
  return new Promise(resolve=>{
    if(typeof jsQR==='undefined'){resolve(null);return;}
    const img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1200/img.naturalWidth,1)||1;
        const cv=document.createElement('canvas');
        cv.width=Math.round(img.naturalWidth*scale);cv.height=Math.round(img.naturalHeight*scale);
        const ctx=cv.getContext('2d');ctx.drawImage(img,0,0,cv.width,cv.height);
        const d=ctx.getImageData(0,0,cv.width,cv.height);
        const code=jsQR(d.data,cv.width,cv.height);
        if(code&&code.data) resolve({text:code.data, format:'QR', version:code.version});
        else resolve(null);
      }catch(e){resolve(null);}
    };
    img.onerror=()=>resolve(null);
    img.src=src;
  });
}
async function decodeBarcode(file, url){
  if(typeof Html5Qrcode==='function'){
    try{
      const reader=new Html5Qrcode('barcodeScanHost', {verbose:false});
      let text='', format='';
      if(typeof reader.scanFileV2==='function'){
        const result=await reader.scanFileV2(file, false);
        text=(result&&(result.decodedText|| (result.result&&result.result.text)))||'';
        format=extractScannerFormat(result);
      }else{
        text=await reader.scanFile(file, false);
      }
      try{await reader.clear();}catch(_){}
      if(text){
        if(!format) format=guessFormat(text);
        return {text:String(text), format:format||'QR'};
      }
    }catch(_){}
  }
  const qr=await decodeQR(url);
  if(qr) return qr;
  return null;
}
async function detectFormatFromPhoto(c){
  if(!c||!c.hasPhoto)return '';
  try{
    const blob=await photoGet(c.id);
    if(!blob)return '';
    const file=new File([blob],'saved.jpg',{type:blob.type||'image/jpeg'});
    const url=URL.createObjectURL(file);
    try{
      const decoded=await decodeBarcode(file, url);
      return (decoded&&decoded.format&&decoded.format!=='auto')?decoded.format:'';
    }finally{URL.revokeObjectURL(url);}
  }catch(_){return '';}
}
function cropQrFromUrl(src){
  return new Promise(resolve=>{
    if(typeof jsQR==='undefined'){resolve('');return;}
    const img=new Image();
    img.onload=()=>{
      try{
        const scale=Math.min(1600/Math.max(img.naturalWidth,img.naturalHeight),1)||1;
        const cv=document.createElement('canvas');
        cv.width=Math.round(img.naturalWidth*scale);cv.height=Math.round(img.naturalHeight*scale);
        const ctx=cv.getContext('2d');ctx.drawImage(img,0,0,cv.width,cv.height);
        const d=ctx.getImageData(0,0,cv.width,cv.height);
        const code=jsQR(d.data,cv.width,cv.height,{inversionAttempts:'attemptBoth'});
        if(!code||!code.location){resolve('');return;}
        const loc=code.location;
        const pts=[loc.topLeftCorner,loc.topRightCorner,loc.bottomRightCorner,loc.bottomLeftCorner];
        const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
        const qrW=Math.max(...xs)-Math.min(...xs);
        const pad=Math.max(8, qrW*0.08);
        const x=Math.max(0, Math.min(...xs)-pad);
        const y=Math.max(0, Math.min(...ys)-pad);
        const w=Math.min(cv.width-x, Math.max(...xs)-x+pad);
        const h=Math.min(cv.height-y, Math.max(...ys)-y+pad);
        if(w<24||h<24){resolve('');return;}
        const out=document.createElement('canvas');
        const size=Math.max(w,h);
        out.width=out.height=Math.round(size);
        const octx=out.getContext('2d');
        octx.fillStyle='#fff';
        octx.fillRect(0,0,out.width,out.height);
        octx.drawImage(cv,x,y,w,h,(out.width-w)/2,(out.height-h)/2,w,h);
        resolve(out.toDataURL('image/png'));
      }catch(e){resolve('');}
    };
    img.onerror=()=>resolve('');
    img.src=src;
  });
}
async function cropCodeFromPhoto(c){
  if(!c||!c.hasPhoto) return '';
  const format=resolveFormat(c);
  if(format&&format!=='QR'&&format!=='auto') return '';
  try{
    const blob=await photoGet(c.id);
    if(!blob) return '';
    const url=URL.createObjectURL(blob);
    try{return await cropQrFromUrl(url);}
    finally{URL.revokeObjectURL(url);}
  }catch(_){return '';}
}
let _wakeLock=null;
async function showCode(c){
  const text=c.qr||'';
  let format=resolveFormat(c);
  if(text && (!c.barcodeFormat || c.barcodeFormat==='auto') && c.hasPhoto){
    const detected=await detectFormatFromPhoto(c);
    if(detected){
      format=detected;
      c.barcodeFormat=detected;
      persist();
    }
  }
  $('#qrStore').textContent=c.store+(c.value?' · '+c.value:'');
  $('#qrVal').textContent=text+(format?' · '+formatLabel(format):'');
  const el=$('#qrImg'),canvas=$('#barcodeCanvas'),err=$('#qrErr');
  el.style.display='none';if(canvas)canvas.style.display='none';err.textContent='';
  let img='';
  let fromPhoto=false;
  if(format==='QR'||format==='auto'||!format){
    img=await cropCodeFromPhoto(c);
    fromPhoto=!!img;
  }
  if(!img) img=text?genBarcodeDataUrl(text, format):'';
  if(img){
    el.style.imageRendering='pixelated';
    el.src=img;el.style.display='block';
  }
  else err.textContent=text?'Could not render that barcode.':'No barcode value saved.';
  $('#qrHint').textContent=fromPhoto
    ?'Original code from your photo. Hold the screen up to the scanner and turn brightness up if needed.'
    :'Showing '+formatLabel(format)+'. Hold the screen up to the scanner and turn brightness up if needed.';
  $('#qrModal').classList.add('show');
  try{if('wakeLock'in navigator)_wakeLock=await navigator.wakeLock.request('screen');}catch(_){}
}
async function showPhoto(id){
  try{
    const blob=await photoGet(id);
    if(!blob){toast('Photo not found');return;}
    const url=URL.createObjectURL(blob);
    $('#qrStore').textContent='Saved photo';
    $('#qrVal').textContent='';
    $('#qrErr').textContent='';
    $('#barcodeCanvas').style.display='none';
    const el=$('#qrImg');el.style.imageRendering='auto';el.src=url;el.style.display='block';
    $('#qrHint').textContent='Saved on this device only.';
    $('#qrModal').classList.add('show');
    el.onload=()=>URL.revokeObjectURL(url);
  }catch(_){toast('Could not open photo');}
}
function adjustBalance(id, dir){
  const c=coupons.find(x=>x.id===id);if(!c)return;
  const raw=prompt(dir==='+'?'Amount to add:':'Amount to subtract:', '');
  if(raw==null)return;
  const n=parseFloat(String(raw).replace(/[^0-9.-]/g,''));
  if(isNaN(n)){toast('Enter a number');return;}
  const cur=parseFloat(String(c.balance||'0').replace(/[^0-9.-]/g,''))||0;
  const next=dir==='+'?cur+n:cur-n;
  const prefix=(c.balance||'').replace(/[0-9.,\s-]+/g,'').trim();
  c.balance=(prefix?prefix+' ':'')+(Math.round(next*100)/100).toFixed(2);
  persist();renderList();
}
function closeQR(){$('#qrModal').classList.remove('show');if(_wakeLock){_wakeLock.release().catch(()=>{});_wakeLock=null;}}
document.addEventListener('visibilitychange',async()=>{
  if(document.visibilityState==='visible'&&$('#qrModal').classList.contains('show')&&'wakeLock'in navigator){
    try{_wakeLock=await navigator.wakeLock.request('screen');}catch(_){}
  }
});
$('#qrClose').onclick=closeQR;
$('#qrBoxClose').onclick=closeQR;
$('#qrModal').addEventListener('click',e=>{if(e.target.id==='qrModal')closeQR();});

/* ---------- settings ---------- */
function renderSettings(){
  const wrap=$('#daychips');
  const days=(settings.reminderDays||[]).slice().sort((a,b)=>b-a);
  wrap.innerHTML=days.length?days.map(d=>
    `<span class="daychip">${d} day${d===1?'':'s'} before <button data-rmday="${d}">✕</button></span>`).join('')
    :'<span class="hint">No reminders set.</span>';
  wrap.querySelectorAll('[data-rmday]').forEach(b=>b.onclick=()=>{
    settings.reminderDays=settings.reminderDays.filter(x=>x!==+b.dataset.rmday);persist();renderSettings();
  });
  renderLangs();
  updateNotifState();
  $('#badgeHours').value = settings.badgeHours !== undefined ? settings.badgeHours : 48;
}

$('#badgeHours').addEventListener('change', async e => {
  const v = parseInt(e.target.value, 10);
  if (!isNaN(v) && v >= 0) {
    settings.badgeHours = v;
    persist();
    if (v > 0 && 'Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
      updateNotifState();
      await requestPersistentStorage();
    }
    updateAppBadge();
    toast('Badge settings saved');
  }
});

function renderLangs(){
  // Reordered to list Traditional before Simplified
  const opts=[['eng','English'],['chi_tra','中文 · Chinese (Traditional)'],['chi_sim','中文 · Chinese (Simplified)'],['jpn','日本語 · Japanese']];
  const sel=settings.langs||['eng'];
  $('#langOpts').innerHTML=opts.map(([code,label])=>
    `<label style="display:flex;align-items:center;gap:10px;margin:10px 0;font-size:15px;color:var(--text)">
      <input type="checkbox" data-lang="${code}" ${sel.includes(code)?'checked':''} style="width:auto;flex:none;transform:scale(1.3)"> ${label}</label>`).join('');
  $('#langOpts').querySelectorAll('[data-lang]').forEach(cb=>cb.onchange=()=>{
    const s=new Set(settings.langs||[]);
    cb.checked?s.add(cb.dataset.lang):s.delete(cb.dataset.lang);
    if(s.size===0){s.add('eng');toast('At least one language is required');}
    settings.langs=[...s];persist();renderLangs();
  });
}
$('#addDay').onclick=()=>{
  const v=parseInt($('#newDay').value,10);
  if(isNaN(v)||v<0){toast('Enter a number of days');return;}
  settings.reminderDays=[...new Set([...(settings.reminderDays||[]),v])];
  persist();$('#newDay').value='';renderSettings();toast('Reminder added');
};
function updateNotifState(){
  const s=$('#notifState');
  if(!('Notification'in window)){s.textContent='This browser does not support pop-up notifications. Calendar reminders still work.';return;}
  let extra='';
  if(isStandalone()) extra=' Installed as an app.';
  s.textContent='Status: '+Notification.permission+'.'+extra;
}
$('#notifBtn').onclick=async()=>{
  if(!('Notification'in window)){toast('Not supported here');return;}
  const p=await Notification.requestPermission();updateNotifState();
  if(p==='granted'){await requestPersistentStorage();await registerBackgroundSync();toast('Notifications on');checkReminders(true);}
};

/* export / import */
$('#persistBtn').onclick=async()=>{
  if('Notification'in window&&Notification.permission==='default'){
    await Notification.requestPermission();
    updateNotifState();
  }
  const ok=await requestPersistentStorage();
  await registerBackgroundSync();
  toast(ok?'Storage protected ✓':(persistStatus==='unsupported'?'This browser cannot lock storage — export a backup':'Not locked yet — Install the app, then try again'));
};
$('#exportBtn').onclick=()=>{
  const blob=new Blob([JSON.stringify({coupons:stripQrImg(coupons),settings,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;
  a.download=`coupon-keeper-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Backup downloaded');
};
$('#importBtn').onclick=()=>$('#importFile').click();
$('#importFile').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  if(coupons.length&&!confirm(`Replace all ${coupons.length} coupon${coupons.length!==1?'s':''} and settings with this backup?`)){e.target.value='';return;}
  const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);
    if(Array.isArray(d.coupons))coupons=stripQrImg(d.coupons);
    if(d.settings)settings=normalizeSettings(d.settings);
    persist();renderSettings();renderList();toast('Backup imported ✓');
  }catch(err){toast('Invalid backup file');}
  e.target.value='';};
  r.readAsText(f);
});
$('#mergeBtn').onclick=()=>$('#mergeFile').click();
$('#mergeFile').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);
    if(!Array.isArray(d.coupons)){toast('No coupons found in file');e.target.value='';return;}
    let added=0,updated=0;
    stripQrImg(d.coupons).forEach(imp=>{const idx=coupons.findIndex(c=>c.id===imp.id);if(idx>=0){coupons[idx]=imp;updated++;}else{coupons.push(imp);added++;}});
    persist();renderList();toast(`Merged: +${added} new, ${updated} updated`);
  }catch(err){toast('Invalid backup file');}
  e.target.value='';};
  r.readAsText(f);
});

/* ---------- reminders (in-app) ---------- */
function checkReminders(force){
  const days=settings.reminderDays||[];
  const due=[];
  coupons.forEach(c=>{
    if(c.used)return;
    const dl=daysLeft(c.exp);
    if(dl==null||dl<0)return;
    if(dl===0||days.includes(dl)){due.push({c,dl});}
  });
  // banner
  const b=$('#banner');
  if(due.length){
    b.classList.add('show');
    const top=due.slice().sort((a,b)=>a.dl-b.dl).slice(0,3)
      .map(x=>`<b>${esc(x.c.store)}</b> ${x.c.value?'('+esc(x.c.value)+') ':''}${x.dl===0?'expires today':'in '+x.dl+'d'}`).join(' · ');
    b.innerHTML=`⏰ ${due.length} coupon${due.length>1?'s':''} need attention: ${top}`;
  }else b.classList.remove('show');
  // notifications (once per coupon+day)
  if('Notification'in window&&Notification.permission==='granted'){
    const key=new Date().toDateString();
    let dirty=false;
    due.forEach(({c,dl})=>{
      const nk=c.id+'|'+key+'|'+dl;
      if(notified[nk]&&!force)return;
      notified[nk]=true;dirty=true;
      try{
        if(navigator.serviceWorker&&navigator.serviceWorker.controller){
          navigator.serviceWorker.ready.then(reg=>reg.showNotification('🎟️ Coupon expiring',{body:`${c.store}${c.value?' — '+c.value:''} ${dl===0?'expires today':'expires in '+dl+' days'}`,icon:'./icon-192.png',tag:nk}));
        }else{
          new Notification('🎟️ Coupon expiring',{body:`${c.store}${c.value?' — '+c.value:''} ${dl===0?'expires today':'expires in '+dl+' days'}`});
        }
      }catch(e){}
    });
    if(dirty)persist();
  }
}

/* ---------- PWA install ---------- */
function isStandalone(){
  return (window.matchMedia&&(
      window.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: fullscreen)').matches
      || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches
    )) || navigator.standalone===true;
}
function setInstallVisible(on){
  const btn=$('#installBtn');
  if(btn) btn.style.display=on?'inline-block':'none';
}
function syncAppChrome(){
  document.documentElement.classList.toggle('app-shell', isStandalone());
}
let deferredPrompt;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  deferredPrompt=e;
  setInstallVisible(true);
});
$('#installBtn').onclick=async()=>{
  if(deferredPrompt){
    deferredPrompt.prompt();
    const choice=await deferredPrompt.userChoice;
    deferredPrompt=null;
    setInstallVisible(false);
    if(choice&&choice.outcome==='accepted') toast('Installing…');
  }
};
window.addEventListener('appinstalled',()=>{
  setInstallVisible(false);
  deferredPrompt=null;
  toast('App installed ✓');
  requestPersistentStorage();
  registerBackgroundSync();
});
try{
  ['standalone','minimal-ui','fullscreen'].forEach(mode=>{
    const mq=window.matchMedia('(display-mode: '+mode+')');
    if(mq.addEventListener) mq.addEventListener('change', syncAppChrome);
    else if(mq.addListener) mq.addListener(syncAppChrome);
  });
}catch(_){}
syncAppChrome();

async function registerSW(){
  if(!('serviceWorker' in navigator)) return null;
  try{
    const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./', updateViaCache:'none'});
    return reg;
  }catch(err){
    console.log('SW registration failed:', err);
    return null;
  }
}
async function registerBackgroundSync(){
  try{
    const reg=await navigator.serviceWorker.ready;
    if(reg && 'periodicSync' in reg && Notification.permission==='granted'){
      await reg.periodicSync.register('ck-expiry', {minInterval: 12*60*60*1000});
    }
  }catch(_){}
}

/* ---------- init ---------- */
(async function boot(){
  await registerSW();
  await loadAll();
  storeReady=true;
  await requestPersistentStorage();
  syncKindFields();
  const params=new URLSearchParams(location.search);
  if(params.get('view')==='add'){resetForm();show('add');}
  else renderList();
  checkReminders(false);
  updateAppBadge();
  updateStorageUI();
  if(Notification.permission==='granted') registerBackgroundSync();
})();
