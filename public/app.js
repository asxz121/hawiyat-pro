/* ===== التهيئة ===== */
const T=localStorage.getItem('token');
if(!T)location.href='/';
const who=JSON.parse(localStorage.getItem('who')||'{}');
const uname = who.name||'المستخدم';
const uav = document.getElementById('userAv');
if(uav) uav.textContent = uname[0];
// تحديث اسم المستخدم في الشريط الجانبي
const unEl = document.getElementById('userName');
if(unEl) unEl.textContent = uname + ' · ' + (who.company||'');
document.getElementById('pageDate').textContent=new Date().toLocaleDateString('ar-SA',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
if(window.innerWidth<=768)document.getElementById('menuBtn').style.display='grid';

const api=(u,o={})=>fetch(u,{...o,headers:{'Content-Type':'application/json','Authorization':'Bearer '+T}})
  .then(async r=>{const d=await r.json();if(!r.ok){if(r.status===401){localStorage.clear();location.href='/'}showToast('⚠ '+(d.error||'خطأ'));throw d}return d});

const coApi=(u,o={})=>api('/api/co'+u,o);
const hrApi=(u,o={})=>api('/api/hr'+u,o);
const fmt=n=>(+n||0).toLocaleString('en-US');
const fd=s=>s?new Date(s).toLocaleDateString('ar-SA'):'—';

/* ===== التوست ===== */
function showToast(msg){
  const t=document.getElementById('toast');
  document.getElementById('toastTxt').textContent=msg;
  t.classList.add('show');clearTimeout(t._h);
  t._h=setTimeout(()=>t.classList.remove('show'),3000);
}

/* ===== التنقل ===== */
const titles={dash:'لوحة التحكم',alerts:'التنبيهات',orders:'الطلبات',containers:'الحاويات',employees:'الموظفون',shifts:'الشفتات',attendance:'الحضور والانصراف',payroll:'الرواتب',vehicles:'السيارات وعداد الزيت',maintenance:'الصيانة',reports:'التقارير والإحصائيات',accounting:'المحاسبة',daily:'التقارير اليومية',warehouses:'المستودعات',users:'المستخدمون'};
const addLabels={orders:'＋ طلب جديد',containers:'＋ حاوية جديدة',employees:'＋ موظف جديد',vehicles:'＋ سيارة جديدة',maintenance:'＋ عملية صيانة',users:'＋ مستخدم جديد'};
const loaders={dash:loadDash,alerts:loadAlerts,orders:loadOrders,containers:loadConts,employees:loadEmps,shifts:loadShifts,attendance:loadAtt,payroll:loadPayroll,vehicles:loadVehs,maintenance:loadMaint,reports:loadReports,accounting:loadAccounting,daily:loadDailyReport,warehouses:loadWarehouses,users:loadUsers};
let curPage='dash';

function go(p){
  const role = who.role || 'DRIVER';
  const allowed = PERMISSIONS[role] || ['dash'];
  if(!allowed.includes(p)){showToast('⚠ ليس لديك صلاحية للوصول لهذا القسم');return}
  curPage=p;
  document.querySelectorAll('.page').forEach(s=>s.classList.toggle('active',s.id==='page-'+p));
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===p));
  document.getElementById('pageTitle').textContent=titles[p]||p;
  const lbl=addLabels[p];
  const btn=document.getElementById('topBtn');
  btn.textContent=lbl||'＋ إضافة';
  btn.style.display=lbl?'flex':'none';
  closeSidebar();window.scrollTo({top:0,behavior:'smooth'});
  if(loaders[p])loaders[p]();
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));

function ctxAdd(){
  const forms={orders:'orderForm',containers:'contForm',employees:'empForm',vehicles:'vehForm',maintenance:'maintForm',users:'userForm'};
  const el=document.getElementById(forms[curPage]);
  if(el)el.scrollIntoView({behavior:'smooth'});
}
function refreshPage(){if(loaders[curPage])loaders[curPage]()}
function closeModal(id){
  document.getElementById(id).classList.remove('open');
}
function toggleSidebar(){document.getElementById('sidebar').classList.toggle('open');document.getElementById('sOverlay').classList.toggle('open')}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sOverlay').classList.remove('open')}
function logout(){localStorage.clear();location.href='/'}

/* ===== لوحة التحكم ===== */
let weekChart=null;
async function loadDash(){
  try{
    const [emps,att,vehs,orders,alerts]=await Promise.all([hrApi('/employees'),hrApi('/attendance'),hrApi('/vehicles'),coApi('/orders'),coApi('/alerts')]);
    // KPIs
    const active=emps.filter(e=>e.status==='ACTIVE');
    document.getElementById('dEmp').textContent=active.length;
    const present=att.filter(a=>a.attendance.status==='in'||a.attendance.status==='late'||a.attendance.status==='out').length;
    document.getElementById('dAtt').textContent=present;
    document.getElementById('dAttSub').textContent=`${present} من ${att.length} موظف`;
    const oilDue=vehs.filter(v=>(v.odometer-v.lastOilAt)>=v.oilInterval).length;
    document.getElementById('dOil').textContent=oilDue;
    const activeOrders=orders.filter(o=>o.status!=='DONE'&&o.status!=='CANCELLED').length;
    document.getElementById('dOrders').textContent=activeOrders;
    // شارة التنبيهات
    const badge=document.getElementById('alertBadge');
    const dot=document.getElementById('notifDot');
    if(alerts.length){badge.textContent=alerts.length;badge.style.display='inline';dot.style.display='block'}
    else{badge.style.display='none';dot.style.display='none'}
    // عداد الزيت
    document.getElementById('dashOil').innerHTML=vehs.length?vehs.map(v=>{
      const used=v.odometer-v.lastOilAt,rem=v.oilInterval-used,pct=Math.min(100,Math.round(used/v.oilInterval*100));
      const cls=rem<=0?'oil-due':rem<=800?'oil-warn':'oil-ok';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:3px"><b>${v.plate}</b><span class="num" style="color:var(--steel)">${rem>0?fmt(rem)+' كم':' مستحق!'}</span></div>
        <div class="oil-bar ${cls}"><i style="width:${pct}%"></i></div></div>`;
    }).join(''):'<div style="color:var(--muted);font-size:.8rem;text-align:center;padding:20px">لا توجد سيارات</div>';
    // آخر التنبيهات
    document.getElementById('dashAlerts').innerHTML=alerts.length?alerts.slice(0,3).map(a=>`
      <div class="alert-item" style="margin-bottom:8px">
        <div class="alert-ico">⏰</div>
        <div class="alert-body"><div class="t">${a.message}</div><div class="s">${new Date(a.createdAt).toLocaleString('ar-SA')}</div></div>
        <button class="ack-btn" onclick="ackAlert(${a.id})">✓ اطلعت</button>
      </div>`).join(''):'<div style="color:var(--muted);font-size:.8rem;text-align:center;padding:16px">لا توجد تنبيهات</div>';
    // آخر الطلبات
    const typeAr={DROP:'إنزال',PICKUP:'رفع',SWAP:'تبديل',MOVE:'نقل',PROJECT_CYCLE:'دورة'};
    const stAr={NEW:'bd-blue',ASSIGNED:'bd-amber',EN_ROUTE:'bd-amber',DONE:'bd-green',CANCELLED:'bd-red'};
    const stLbl={NEW:'جديد',ASSIGNED:'مسند',EN_ROUTE:'بالطريق',DONE:'منفذ',CANCELLED:'ملغي'};
    document.getElementById('dashOrders').innerHTML=orders.length?orders.slice(0,4).map(o=>`
      <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
        <span class="badge bd-blue">${typeAr[o.type]||o.type}</span>
        <div style="flex:1;font-size:.82rem;font-weight:600">${o.customerName}</div>
        <span class="badge ${stAr[o.status]||'bd-gray'}">${stLbl[o.status]||o.status}</span>
      </div>`).join(''):'<div style="color:var(--muted);font-size:.8rem;text-align:center;padding:16px">لا توجد طلبات</div>';
    // رسم بياني
    const days=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];
    const present7=att.filter(a=>a.attendance.status==='in'||a.attendance.status==='out').length;
    const late7=att.filter(a=>a.attendance.status==='late').length;
    const absent7=att.filter(a=>a.attendance.status==='absent').length;
    if(weekChart)weekChart.destroy();
    weekChart=new Chart(document.getElementById('chWeek'),{type:'bar',data:{labels:days,datasets:[
      {label:'حاضر',data:[present7,present7,present7,present7,present7,present7],backgroundColor:'#1B9E6E',borderRadius:4,stack:'a'},
      {label:'متأخر',data:[late7,late7,0,late7,0,late7],backgroundColor:'#F7A823',borderRadius:4,stack:'a'},
      {label:'غائب',data:[absent7,0,0,0,0,absent7],backgroundColor:'#D64545',borderRadius:4,stack:'a'},
    ]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',rtl:true,labels:{usePointStyle:true,padding:12,font:{size:11}}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'#E6ECF1'},ticks:{stepSize:2}}}}});
  }catch(e){console.error(e)}
}

/* ===== التنبيهات ===== */
async function loadAlerts(){
  try{
    const al=await coApi('/alerts');
    document.getElementById('alertList').innerHTML=al.length?al.map(a=>`
      <div class="alert-item">
        <div class="alert-ico">⏰</div>
        <div class="alert-body"><div class="t">${a.message}</div><div class="s">${new Date(a.createdAt).toLocaleString('ar-SA')}</div></div>
        <button class="ack-btn" onclick="ackAlert(${a.id})">✓ تم الاطلاع</button>
      </div>`).join(''):'<div style="text-align:center;padding:32px;color:var(--muted)">✅ لا توجد تنبيهات نشطة</div>';
    const badge=document.getElementById('alertBadge');
    if(al.length){badge.textContent=al.length;badge.style.display='inline'}else badge.style.display='none';
  }catch(e){console.error(e)}
}
async function ackAlert(id){await coApi('/alerts/'+id+'/ack',{method:'POST'});loadAlerts();showToast('تم إغلاق التنبيه ✓')}

/* ===== الطلبات ===== */
const typeAr={DROP:'إنزال',PICKUP:'رفع',SWAP:'تبديل',MOVE:'نقل',PROJECT_CYCLE:'دورة مشروع'};
const stBd={NEW:'bd-blue',ASSIGNED:'bd-amber',EN_ROUTE:'bd-amber',DONE:'bd-green',CANCELLED:'bd-red'};
const stLbl={NEW:'جديد',ASSIGNED:'مسند',EN_ROUTE:'بالطريق',DONE:'منفذ',CANCELLED:'ملغي'};
let loc={lat:null,lng:null};

function getLoc(){
  const msg=document.getElementById('locMsg');
  msg.innerHTML='<div class="loc-msg loc-load">⏳ جارٍ تحديد الموقع…</div>';
  navigator.geolocation.getCurrentPosition(
    p=>{loc={lat:p.coords.latitude,lng:p.coords.longitude};msg.innerHTML=`<div class="loc-msg loc-ok">✓ تم التقاط الموقع (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})</div>`},
    ()=>msg.innerHTML='<div class="loc-msg loc-err">✗ تعذر تحديد الموقع</div>',
    {enableHighAccuracy:true,timeout:10000}
  );
}
async function loadOrders(){
  try{
    const os=await coApi('/orders');
    // تحميل السائقين للإسناد
    let driversForAssign = [];
    try{ driversForAssign = await hrApi('/employees'); }catch(e){}
    const driversList = driversForAssign.filter(e=>e.role==='سائق'&&e.status==='ACTIVE');
    
    document.getElementById('orderRows').innerHTML=os.length?os.map(o=>`<tr>
      <td class="num" style="font-weight:700;color:var(--steel)">#${o.id}</td>
      <td><span class="badge bd-blue">${typeAr[o.type]||o.type}</span></td>
      <td style="font-weight:600;font-size:.8rem">${o.customerName}${o.container?`<br><span style="font-size:.62rem;color:var(--steel)">${o.container.code}</span>`:''}<br><span style="font-size:.62rem;color:var(--muted)">${new Date(o.createdAt).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'})}</span></td>
      <td style="font-size:.7rem;color:var(--steel)">${o.phone1}${o.phoneSite?'<br>'+o.phoneSite:''}</td>
      <td style="font-size:.72rem">${o.contractNo||'—'}</td>
      <td style="font-size:.72rem">${fd(o.dueDate)}</td>
      <td class="num" style="font-size:.76rem">
        ${o.price?`<span style="color:var(--steel)">${fmt(o.price)} ر.س</span>`:'—'}
        ${o.collectedAmount?`<br><span style="color:var(--green);font-weight:700">✓ ${fmt(o.collectedAmount)}</span>
        <br><span style="font-size:.6rem;color:var(--muted)">${o.paymentMethod==='transfer'?'تحويل':'نقدي'}</span>`:''}
      </td>
      <td><span class="badge ${stBd[o.status]||'bd-gray'}">${stLbl[o.status]||o.status}</span></td>
      <td>
        <select onchange="assignOrder(${o.id},this.value)" style="border:1px solid var(--line);border-radius:7px;padding:4px 7px;font:inherit;font-size:.68rem;max-width:110px">
          <option value="">— إسناد —</option>
          ${driversList.map(d=>`<option value="${d.id}" ${o.assignedTo===d.id?'selected':''}>${d.name.split(' ')[0]}</option>`).join('')}
        </select>
      </td>
      <td><button class="btn btn-ghost btn-sm" onclick="muteOrder(${o.id},${!o.alertMuted})">${o.alertMuted?'🔕':'🔔'}</button></td>
    </tr>`).join(''):'<tr><td colspan="9" style="text-align:center;padding:22px;color:var(--muted)">لا توجد طلبات</td></tr>';
  }catch(e){console.error(e)}
}
async function muteOrder(id,v){await coApi('/orders/'+id,{method:'PATCH',body:JSON.stringify({alertMuted:v})});loadOrders();showToast(v?'تم كتم التنبيه':'تم تفعيل التنبيه')}
async function addOrder(){
  if(!document.getElementById('oCust').value||!document.getElementById('oP1').value)return showToast('⚠ اسم العميل والجوال مطلوبان');
  try{
    await coApi('/orders',{method:'POST',body:JSON.stringify({
      customerName:document.getElementById('oCust').value,phone1:document.getElementById('oP1').value,
      phoneSite:document.getElementById('oPS').value,phone3:document.getElementById('oP3').value,
      type:document.getElementById('oType').value,size:document.getElementById('oSize').value,
      contractNo:document.getElementById('oContract').value,dueDate:document.getElementById('oDue').value||null,
      price:document.getElementById('oPrice').value,address:document.getElementById('oAddr').value,
      lat:loc.lat,lng:loc.lng
    })});
    ['oCust','oP1','oPS','oP3','oSize','oContract','oPrice','oAddr'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('oDue').value='';loc={lat:null,lng:null};
    document.getElementById('locMsg').innerHTML='';
    loadOrders();showToast('تم إنشاء الطلب ✓');
  }catch(x){console.error(x)}
}

/* ===== الحاويات ===== */
const cStLbl={IN_DEPOT:'بالمستودع',SCHEDULED:'مجدولة',ON_SITE:'بالموقع',AWAIT_PICKUP:'انتظار رفع',IN_TRANSIT:'بالطريق',MAINTENANCE:'صيانة'};
const cStBd={IN_DEPOT:'bd-green',SCHEDULED:'bd-blue',ON_SITE:'bd-amber',AWAIT_PICKUP:'bd-amber',IN_TRANSIT:'bd-blue',MAINTENANCE:'bd-red'};
async function loadConts(){
  try{
    const cs=await coApi('/containers');
    document.getElementById('contRows').innerHTML=cs.length?cs.map(c=>`<tr>
      <td style="font-weight:700">${c.code}</td><td>${c.size}</td>
      <td><span class="badge ${cStBd[c.status]||'bd-gray'}">${cStLbl[c.status]||c.status}</span></td>
    </tr>`).join(''):'<tr><td colspan="3" style="text-align:center;padding:22px;color:var(--muted)">لا توجد حاويات</td></tr>';
  }catch(e){console.error(e)}
}
async function addCont(){
  if(!document.getElementById('cCode').value||!document.getElementById('cSize').value)return showToast('⚠ الرقم والحجم مطلوبان');
  try{
    await coApi('/containers',{method:'POST',body:JSON.stringify({code:document.getElementById('cCode').value,size:document.getElementById('cSize').value})});
    document.getElementById('cCode').value='';document.getElementById('cSize').value='';
    loadConts();showToast('تمت إضافة الحاوية ✓');
  }catch(x){console.error(x)}
}

/* ===== الموظفون ===== */
const shiftLbl={MORNING:'صباحي',EVENING:'مسائي',NIGHT:'ليلي'};
const shiftBd={MORNING:'bd-amber',EVENING:'bd-blue',NIGHT:'bd-gray'};
async function loadEmps(){
  try{
    const emps=await hrApi('/employees');
    document.getElementById('empRows').innerHTML=emps.length?emps.map(e=>`<tr>
      <td><div class="cell-emp"><span class="emp-av">${e.name[0]}</span><div><div style="font-weight:600">${e.name}</div><div class="s">رقم ${String(e.id).padStart(3,'0')}</div></div></div></td>
      <td>${e.role}</td>
      <td class="num" style="color:var(--steel)">${e.phone||'—'}</td>
      <td><span class="badge ${shiftBd[e.shift]||'bd-gray'}">${shiftLbl[e.shift]||e.shift}</span></td>
      <td class="num" style="font-weight:700">${fmt(e.salary)} ر.س</td>
      <td class="num">${e.hiredAt||'—'}</td>
      <td><span class="badge ${e.status==='ACTIVE'?'bd-green':e.status==='INACTIVE'?'bd-red':e.status==='LEAVE'?'bd-blue':e.status==='SICK'?'bd-amber':'bd-gray'}">
        ${{ACTIVE:'نشط',INACTIVE:'منتهي العمل',LEAVE:'إجازة',SICK:'إجازة مرضية',SUSPENDED:'موقوف'}[e.status]||e.status}
      </span></td>
      <td>
        <div style="position:relative;display:inline-block">
          <button class="btn btn-ghost btn-sm" onclick="toggleEmpMenu(${e.id},event)" style="font-size:.72rem">إجراءات ▾</button>
          <div id="empMenu-${e.id}" style="display:none;position:absolute;left:0;top:100%;z-index:100;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);min-width:160px;padding:6px">
            <button onclick="empAction(${e.id},'ACTIVE')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--green)" onmouseover="this.style.background='var(--green-soft)'" onmouseout="this.style.background='none'">✓ نشط</button>
            <button onclick="empAction(${e.id},'LEAVE')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--blue)" onmouseover="this.style.background='var(--blue-soft)'" onmouseout="this.style.background='none'">🏖 إجازة</button>
            <button onclick="empAction(${e.id},'SICK')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--amber-d)" onmouseover="this.style.background='var(--amber-soft)'" onmouseout="this.style.background='none'">🏥 إجازة مرضية</button>
            <button onclick="empAction(${e.id},'SUSPENDED')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--red)" onmouseover="this.style.background='var(--red-soft)'" onmouseout="this.style.background='none'">⏸ موقوف</button>
            <div style="border-top:1px solid var(--line);margin:4px 0"></div>
            <button onclick="editEmpSalary(${e.id},${e.salary},${e.extra})" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'">﷼ تعديل الراتب</button>
            <button onclick="editEmpShift(${e.id})" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='none'">🕐 تغيير الشفت</button>
            <div style="border-top:1px solid var(--line);margin:4px 0"></div>
            <button onclick="openTransactions(${e.id},'${e.name}')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--violet)" onmouseover="this.style.background='var(--violet-soft)'" onmouseout="this.style.background='none'">💰 المعاملات المالية</button>
            <div style="border-top:1px solid var(--line);margin:4px 0"></div>
            <button onclick="empAction(${e.id},'INACTIVE')" style="display:block;width:100%;text-align:right;padding:8px 12px;font:inherit;font-size:.78rem;background:none;border:0;cursor:pointer;border-radius:7px;color:var(--red)" onmouseover="this.style.background='var(--red-soft)'" onmouseout="this.style.background='none'">✕ إنهاء العمل</button>
          </div>
        </div>
      </td>
    </tr>`).join(''):'<tr><td colspan="7" style="text-align:center;padding:22px;color:var(--muted)">لا يوجد موظفون</td></tr>';
  }catch(e){console.error(e)}
}
async function addEmp(){
  const n=document.getElementById('eName').value.trim();
  const s=document.getElementById('eSalary').value;
  if(!n||!s)return showToast('⚠ الاسم والراتب مطلوبان');
  try{
    await hrApi('/employees',{method:'POST',body:JSON.stringify({
      name:n,role:document.getElementById('eRole').value,shift:document.getElementById('eShift').value,
      phone:document.getElementById('ePhone').value,salary:s,extra:document.getElementById('eExtra').value||0,
      hiredAt:document.getElementById('eHired').value
    })});
    ['eName','ePhone','eSalary','eExtra','eHired'].forEach(i=>document.getElementById(i).value='');
    loadEmps();showToast('تمت إضافة الموظف ✓');
  }catch(x){console.error(x)}
}

/* ===== الشفتات ===== */
async function loadShifts(){
  try{
    const emps=await hrApi('/employees');
    const active=emps.filter(e=>e.status==='ACTIVE');
    const byShift={MORNING:active.filter(e=>e.shift==='MORNING'),EVENING:active.filter(e=>e.shift==='EVENING'),NIGHT:active.filter(e=>e.shift==='NIGHT')};
    document.getElementById('shiftCards').innerHTML=[
      {k:'MORNING',label:'شفت صباحي',time:'8:00 ص – 4:00 م',cls:'sh-m'},
      {k:'EVENING',label:'شفت مسائي',time:'4:00 م – 12:00 ص',cls:'sh-e'},
      {k:'NIGHT',label:'شفت ليلي',time:'12:00 ص – 8:00 ص',cls:'sh-n'},
    ].map(s=>`<div class="shift-card ${s.cls}">
      <div class="tt">${s.label}</div><div class="tm">${s.time}</div>
      <div class="cnt">${byShift[s.k].length}</div><div class="cl">موظف في هذا الشفت</div>
    </div>`).join('');
    document.getElementById('shiftRows').innerHTML=active.map(e=>`<tr>
      <td><div class="cell-emp"><span class="emp-av">${e.name[0]}</span><b>${e.name}</b></div></td>
      <td>${e.role}</td>
      <td><span class="badge ${shiftBd[e.shift]||'bd-gray'}">${shiftLbl[e.shift]||e.shift}</span></td>
      <td><select onchange="changeShift(${e.id},this.value)" style="border:1px solid var(--line);border-radius:8px;padding:5px 9px;font:inherit;font-size:.76rem">
        ${['MORNING','EVENING','NIGHT'].map(s=>`<option value="${s}" ${s===e.shift?'selected':''}>${shiftLbl[s]}</option>`).join('')}
      </select></td>
    </tr>`).join('');
  }catch(e){console.error(e)}
}
async function changeShift(id,shift){
  await hrApi('/employees/'+id,{method:'PATCH',body:JSON.stringify({shift})});
  showToast('تم تغيير الشفت ✓');loadShifts();
}

/* ===== الحضور ===== */
const attLbl={none:'لم يسجل',in:'حاضر',late:'حاضر — متأخر',out:'انصرف',absent:'غائب'};
const attBd={none:'bd-gray',in:'bd-green',late:'bd-amber',out:'bd-blue',absent:'bd-red'};
async function loadAtt(){
  try{
    const att=await hrApi('/attendance');
    let p=0,l=0,a=0,o=0;
    document.getElementById('attRows').innerHTML=att.map(e=>{
      const st=e.attendance.status||'none';
      if(st==='in')p++;else if(st==='late'){p++;l++}else if(st==='absent')a++;else if(st==='out')o++;
      const canIn=st==='none'||st==='absent';
      const canOut=st==='in'||st==='late';
      return `<tr>
        <td><div class="cell-emp"><span class="emp-av">${e.name[0]}</span><b>${e.name}</b></div></td>
        <td><span class="badge ${shiftBd[e.shift]||'bd-gray'}">${shiftLbl[e.shift]||e.shift}</span></td>
        <td class="num">${e.attendance.checkIn||'—'}</td>
        <td class="num">${e.attendance.checkOut||'—'}</td>
        <td><span class="badge ${attBd[st]}">${attLbl[st]}</span></td>
        <td><div class="att-btns">
          <button class="btn btn-sm ${canIn?'btn-amber':'btn-ghost'}" ${canIn?'':'disabled style="opacity:.4"'} onclick="checkIn(${e.id})">حضور</button>
          <button class="btn btn-sm ${canOut?'btn-dark':'btn-ghost'}" ${canOut?'':'disabled style="opacity:.4"'} onclick="checkOut(${e.id})">انصراف</button>
          <button class="btn btn-sm btn-red" onclick="markAbsent(${e.id})">غياب</button>
        </div></td>
      </tr>`;
    }).join('');
    document.getElementById('aP').textContent=p;
    document.getElementById('aL').textContent=l;
    document.getElementById('aA').textContent=a;
    document.getElementById('aO').textContent=o;
  }catch(e){console.error(e)}
}
async function checkIn(id){await hrApi('/attendance/checkin',{method:'POST',body:JSON.stringify({employeeId:id})});loadAtt();showToast('تم تسجيل الحضور ✓')}
async function checkOut(id){await hrApi('/attendance/checkout',{method:'POST',body:JSON.stringify({employeeId:id})});loadAtt();showToast('تم تسجيل الانصراف ✓')}
async function markAbsent(id){await hrApi('/attendance/absent',{method:'POST',body:JSON.stringify({employeeId:id})});loadAtt();showToast('تم تسجيل الغياب')}

/* ===== الرواتب ===== */
async function loadPayroll(){
  try{
    const month=new Date().toISOString().slice(0,7).replace('-','/');
    const data=await hrApi('/payroll?month='+month);
    let tot=0,extra=0,ded=0,paid=0;
    document.getElementById('payRows').innerHTML=data.map(e=>{
      tot+=e.netSalary;extra+=e.extra;ded+=e.deduction;if(e.paid)paid+=e.netSalary;
      return `<tr>
        <td><div class="cell-emp"><span class="emp-av">${e.name[0]}</span><div><b>${e.name}</b><div class="s">${e.role}</div></div></div></td>
        <td class="num">${fmt(e.salary)}</td>
        <td class="num" style="color:var(--green);font-weight:600">+${fmt(e.extra)}</td>
        <td class="num">${e.absentDays}</td>
        <td class="num" style="color:var(--red);font-weight:600">−${fmt(e.deduction)}</td>
        <td class="num" style="font-weight:700">${fmt(e.netSalary)} ر.س</td>
        <td><span class="badge ${e.paid?'bd-green':'bd-amber'}">${e.paid?'تم الصرف':'مستحق'}</span></td>
        <td>${e.paid?'<button class="btn btn-ghost btn-sm" onclick="showToast(\'تم الصرف مسبقاً\')">قسيمة</button>':`<button class="btn btn-amber btn-sm" onclick="payEmp(${e.id})">صرف</button>`}</td>
      </tr>`;
    }).join('');
    document.getElementById('pTot').innerHTML=fmt(tot)+' <small>ر.س</small>';
    document.getElementById('pPaid').innerHTML=fmt(paid)+' <small>ر.س</small>';
    document.getElementById('pDed').innerHTML=fmt(ded)+' <small>ر.س</small>';
    document.getElementById('pExtra').innerHTML=fmt(extra)+' <small>ر.س</small>';
  }catch(e){console.error(e)}
}
async function payEmp(id){
  const month=new Date().toISOString().slice(0,7).replace('-','/');
  await hrApi('/payroll/pay',{method:'POST',body:JSON.stringify({employeeId:id,month})});
  loadPayroll();showToast('تم صرف الراتب ✓');
}

/* ===== الأسطول ===== */
function oilState(v){
  const used=v.odometer-v.lastOilAt,rem=v.oilInterval-used,pct=Math.min(100,Math.round(used/v.oilInterval*100));
  const cls=rem<=0?'oil-due':rem<=800?'oil-warn':'oil-ok';
  return{used,rem,pct,cls};
}
async function loadVehs(){
  try{
    const vehs=await hrApi('/vehicles');
    let ok=0,warn=0,due=0;
    document.getElementById('vehRows').innerHTML=vehs.length?vehs.map(v=>{
      const o=oilState(v);
      if(o.cls==='oil-due')due++;else if(o.cls==='oil-warn')warn++;else ok++;
      const stBd=o.cls==='oil-due'?'bd-red':o.cls==='oil-warn'?'bd-amber':'bd-green';
      const stLbl=o.cls==='oil-due'?'زيت مستحق':o.cls==='oil-warn'?'قارب الاستحقاق':'جاهزة';
      return `<tr>
        <td style="font-weight:600">${v.type}</td>
        <td class="num" style="font-weight:700">${v.plate}</td>
        <td>${v.driver?.name||'—'}</td>
        <td class="num" style="font-weight:700">${fmt(v.odometer)} كم</td>
        <td><div class="oil-bar ${o.cls}"><i style="width:${o.pct}%"></i></div>
          <div class="oil-meta num">${o.rem>0?`متبقٍ ${fmt(o.rem)} كم`:`متجاوز ${fmt(-o.rem)} كم`}</div></td>
        <td><span class="badge ${stBd}">${stLbl}</span></td>
        <td><div style="display:flex;gap:5px">
          <button class="btn btn-ghost btn-sm" onclick="updateOdo(${v.id},${v.odometer})">تحديث العداد</button>
          <button class="btn btn-amber btn-sm" onclick="oilChange(${v.id})">تغيير زيت</button>
        </div></td>
      </tr>`;
    }).join(''):'<tr><td colspan="7" style="text-align:center;padding:22px;color:var(--muted)">لا توجد سيارات</td></tr>';
    document.getElementById('vTot').textContent=vehs.length;
    document.getElementById('vOk').textContent=ok;
    document.getElementById('vWarn').textContent=warn;
    document.getElementById('vDue').textContent=due;
    document.getElementById('oilBadge').textContent=due+warn;
    document.getElementById('oilBadge').style.display=due+warn>0?'inline':'none';
    // ملء قائمة السائقين
    const emps=await hrApi('/employees');
    document.getElementById('vDriver').innerHTML='<option value="">— بدون سائب —</option>'+emps.filter(e=>e.role==='سائق'&&e.status==='ACTIVE').map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
    document.getElementById('mnVeh').innerHTML=vehs.map(v=>`<option value="${v.id}">${v.type} — ${v.plate}</option>`).join('');
  }catch(e){console.error(e)}
}
async function updateOdo(id,cur){
  const val=prompt(`القراءة الحالية: ${fmt(cur)} كم\nأدخل القراءة الجديدة:`);
  if(!val)return;
  await hrApi('/vehicles/'+id+'/odometer',{method:'PATCH',body:JSON.stringify({odometer:+val})});
  loadVehs();showToast('تم تحديث العداد ✓');
}
async function oilChange(id){
  await hrApi('/vehicles/'+id+'/oilchange',{method:'POST',body:JSON.stringify({cost:420})});
  loadVehs();showToast('تم تسجيل تغيير الزيت وتصفير العداد ✓');
}
async function addVeh(){
  const plate=document.getElementById('vPlate').value.trim();
  const odo=document.getElementById('vOdo').value;
  if(!plate||!odo)return showToast('⚠ اللوحة والعداد مطلوبان');
  await hrApi('/vehicles',{method:'POST',body:JSON.stringify({type:document.getElementById('vType').value,plate,odometer:odo,driverId:document.getElementById('vDriver').value||null})});
  document.getElementById('vPlate').value='';document.getElementById('vOdo').value='';
  loadVehs();showToast('تمت إضافة السيارة ✓');
}

/* ===== الصيانة ===== */
async function loadMaint(){
  try{
    const data=await hrApi('/maintenance');
    const thisMonth=data.filter(m=>new Date(m.date).getMonth()===new Date().getMonth());
    const tot=thisMonth.reduce((s,m)=>s+m.cost,0);
    document.getElementById('mCost').innerHTML=fmt(tot)+' <small>ر.س</small>';
    document.getElementById('mCount').textContent=thisMonth.length;
    document.getElementById('mAvg').innerHTML=fmt(Math.round(tot/Math.max(1,thisMonth.length)))+' <small>ر.س</small>';
    document.getElementById('maintRows').innerHTML=data.length?data.map(m=>`<tr>
      <td>${new Date(m.date).toLocaleString('ar-SA',{dateStyle:'short',timeStyle:'short'})}</td>
      <td class="num" style="font-weight:600">${m.vehicle?.plate||'—'}</td>
      <td>${m.type}</td>
      <td style="color:var(--steel)">${m.details||'—'}</td>
      <td class="num" style="font-weight:700">${fmt(m.cost)} ر.س</td>
      <td><span class="badge bd-green">${m.status}</span></td>
    </tr>`).join(''):'<tr><td colspan="6" style="text-align:center;padding:22px;color:var(--muted)">لا توجد عمليات صيانة</td></tr>';
    // ملء قائمة السيارات
    const vehs=await hrApi('/vehicles');
    document.getElementById('mnVeh').innerHTML=vehs.map(v=>`<option value="${v.id}">${v.type} — ${v.plate}</option>`).join('');
  }catch(e){console.error(e)}
}
async function addMaint(){
  const cost=document.getElementById('mnCost').value;
  const vid=document.getElementById('mnVeh').value;
  if(!cost||!vid)return showToast('⚠ السيارة والتكلفة مطلوبان');
  await hrApi('/maintenance',{method:'POST',body:JSON.stringify({vehicleId:vid,type:document.getElementById('mnType').value,details:document.getElementById('mnNote').value,cost})});
  document.getElementById('mnCost').value='';document.getElementById('mnNote').value='';
  loadMaint();showToast('تم تسجيل عملية الصيانة ✓');
}

/* ===== المستخدمون ===== */
const langAr={ar:'العربية',en:'English',ur:'اردو',hi:'हिन्दी'};
const roleAr={OWNER:'مدير الشركة',BRANCH_MGR:'مدير فرع',TRAFFIC_MGR:'مدير حركة',DISPATCHER:'موزع',ACCOUNTANT:'محاسب',DRIVER:'سائق'};
async function loadUsers(){
  try{
    const us=await coApi('/users');
    document.getElementById('userRows').innerHTML=us.length?us.map(u=>`<tr>
      <td><div style="display:flex;align-items:center;gap:8px">
        <div style="width:32px;height:32px;border-radius:8px;background:var(--ink2);color:var(--amber);display:grid;place-items:center;font-family:'Changa';font-weight:700;font-size:.85rem;flex-shrink:0">${(u.name||'?')[0]}</div>
        <div><div style="font-weight:600;font-size:.84rem">${u.name}</div><div style="font-size:.68rem;color:var(--steel)">${u.phone}</div></div>
      </div></td>
      <td><span class="badge bd-blue">${roleAr[u.role]||u.role}</span></td>
      <td style="font-size:.72rem;color:var(--steel)">${u.createdAt?new Date(u.createdAt).toLocaleDateString('ar-SA'):'—'}</td>
      <td><span class="badge ${u.active!==false?'bd-green':'bd-red'}">${u.active!==false?'نشط':'معطل'}</span></td>
      <td>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="editUserName(${u.id},'${u.name}')" style="font-size:.7rem">تعديل الاسم</button>
          <button class="btn btn-ghost btn-sm" onclick="editUser(${u.id},'${u.name}','${u.role}')" style="font-size:.7rem">تعديل الدور</button>
          <button class="btn btn-sm" style="background:var(--amber-soft);color:var(--amber-d);padding:5px 10px;font-size:.7rem;border-radius:7px;border:0;cursor:pointer;font-family:inherit" onclick="resetUserPass(${u.id},'${u.name}')">كلمة المرور</button>
          ${u.role!=='OWNER'?`
            <button class="btn btn-sm" style="background:${u.active!==false?'var(--amber-soft)':'var(--green-soft)'};color:${u.active!==false?'var(--amber-d)':'var(--green)'};padding:5px 10px;font-size:.7rem;border-radius:7px;border:0;cursor:pointer;font-family:inherit" onclick="toggleUser(${u.id},'${u.name}',${u.active!==false})">
              ${u.active!==false?'تعطيل':'تفعيل'}
            </button>
            <button class="hawiyat-btn hawiyat-btn-del">حذف</button>
          `:''}
        </div>
      </td>
    </tr>`).join(''):'<tr><td colspan="5" style="text-align:center;padding:22px;color:var(--muted)">لا يوجد مستخدمون</td></tr>';
  }catch(e){console.error(e)}
}
async function addUser(){
  if(!document.getElementById('uName').value||!document.getElementById('uPhone').value||!document.getElementById('uPw').value)return showToast('⚠ الاسم والجوال وكلمة المرور مطلوبة');
  try{
    await coApi('/users',{method:'POST',body:JSON.stringify({name:document.getElementById('uName').value,phone:document.getElementById('uPhone').value,password:document.getElementById('uPw').value,role:document.getElementById('uRole').value,language:document.getElementById('uLang').value})});
    ['uName','uPhone','uPw'].forEach(i=>document.getElementById(i).value='');
    loadUsers();showToast('تمت إضافة المستخدم ✓');
  }catch(x){console.error(x)}
}


/* ===== التقارير ===== */
let chPayCat=null,chFleet=null,chAttReport=null,chOrders=null;
async function loadReports(){
  try{
    const [emps,vehs,maint,orders,att]=await Promise.all([
      hrApi('/employees'),hrApi('/vehicles'),hrApi('/maintenance'),
      coApi('/orders'),hrApi('/attendance')
    ]);
    const active=emps.filter(e=>e.status==='ACTIVE');
    const totalSalary=active.reduce((s,e)=>s+e.salary+e.extra,0);
    const thisMaint=maint.filter(m=>new Date(m.date).getMonth()===new Date().getMonth());
    const maintCost=thisMaint.reduce((s,m)=>s+m.cost,0);
    document.getElementById('rEmps').textContent=active.length;
    document.getElementById('rSalary').innerHTML=fmt(totalSalary)+' <small>ر.س</small>';
    document.getElementById('rMaint').innerHTML=fmt(maintCost)+' <small>ر.س</small>';
    document.getElementById('rOrders').textContent=orders.length;

    // ملخص تشغيلي
    const oilDue=vehs.filter(v=>(v.odometer-v.lastOilAt)>=v.oilInterval).length;
    const present=att.filter(a=>a.attendance.status==='in'||a.attendance.status==='late'||a.attendance.status==='out').length;
    const attRate=att.length?Math.round(present/att.length*100):0;
    document.getElementById('repSummary').innerHTML=[
      ['إجمالي الموظفين النشطين',active.length+' موظف'],
      ['إجمالي كتلة الرواتب الشهرية',fmt(totalSalary)+' ر.س'],
      ['تكاليف صيانة هذا الشهر',fmt(maintCost)+' ر.س'],
      ['نسبة الحضور اليوم',attRate+'%'],
      ['سيارات تحتاج تغيير زيت',oilDue+' سيارة'],
      ['إجمالي الطلبات',orders.length+' طلب'],
      ['طلبات منفذة',orders.filter(o=>o.status==='DONE').length+' طلب'],
      ['طلبات قيد التنفيذ',orders.filter(o=>o.status!=='DONE'&&o.status!=='CANCELLED').length+' طلب'],
    ].map(r=>`<div style="display:flex;align-items:center;padding:11px 0;border-bottom:1px solid var(--line)">
      <div style="flex:1;font-size:.84rem;color:var(--steel)">${r[0]}</div>
      <div style="font-family:'Changa';font-weight:700;font-size:1.05rem">${r[1]}</div>
    </div>`).join('');

    // رسم توزيع الرواتب
    const roleGroups={سائق:0,عامل:0,إداري:0,'فني صيانة':0,أخرى:0};
    active.forEach(e=>{
      const k=roleGroups.hasOwnProperty(e.role)?e.role:'أخرى';
      roleGroups[k]+=e.salary+e.extra;
    });
    const rgLabels=Object.keys(roleGroups).filter(k=>roleGroups[k]>0);
    const rgData=rgLabels.map(k=>roleGroups[k]);
    if(chPayCat)chPayCat.destroy();
    chPayCat=new Chart(document.getElementById('chPayCat'),{type:'doughnut',data:{
      labels:rgLabels,
      datasets:[{data:rgData,backgroundColor:['#F7A823','#2E7DD1','#1F3140','#7A5AF8','#1B9E6E'],borderWidth:3,borderColor:'#fff'}]
    },options:{maintainAspectRatio:false,cutout:'62%',plugins:{legend:{position:'bottom',rtl:true,labels:{usePointStyle:true,padding:12,font:{size:11}}},tooltip:{callbacks:{label:c=>c.label+': '+fmt(c.parsed)+' ر.س'}}}}});

    // رسم حالة الأسطول
    const vOk=vehs.filter(v=>(v.odometer-v.lastOilAt)<v.oilInterval*0.84).length;
    const vWarn=vehs.filter(v=>{const u=v.odometer-v.lastOilAt;return u>=v.oilInterval*0.84&&u<v.oilInterval}).length;
    const vDue=vehs.filter(v=>(v.odometer-v.lastOilAt)>=v.oilInterval).length;
    if(chFleet)chFleet.destroy();
    chFleet=new Chart(document.getElementById('chFleet'),{type:'doughnut',data:{
      labels:['جاهزة','قاربت الاستحقاق','مستحقة الآن'],
      datasets:[{data:[vOk,vWarn,vDue],backgroundColor:['#1B9E6E','#F7A823','#D64545'],borderWidth:3,borderColor:'#fff'}]
    },options:{maintainAspectRatio:false,cutout:'60%',plugins:{legend:{position:'bottom',rtl:true,labels:{usePointStyle:true,padding:12,font:{size:11}}}}}});

    // رسم الحضور
    const days=['السبت','الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس'];
    const p=att.filter(a=>a.attendance.status==='in'||a.attendance.status==='out').length;
    const l=att.filter(a=>a.attendance.status==='late').length;
    const ab=att.filter(a=>a.attendance.status==='absent').length;
    if(chAttReport)chAttReport.destroy();
    chAttReport=new Chart(document.getElementById('chAttReport'),{type:'bar',data:{labels:days,datasets:[
      {label:'حاضر',data:[p,p,p,p,p,p],backgroundColor:'#1B9E6E',borderRadius:4,stack:'a'},
      {label:'متأخر',data:[l,l,0,l,0,l],backgroundColor:'#F7A823',borderRadius:4,stack:'a'},
      {label:'غائب',data:[ab,0,0,0,0,ab],backgroundColor:'#D64545',borderRadius:4,stack:'a'},
    ]},options:{maintainAspectRatio:false,plugins:{legend:{position:'bottom',rtl:true,labels:{usePointStyle:true,padding:12,font:{size:11}}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,grid:{color:'#E6ECF1'}}}}});

    // رسم حالة الطلبات
    const stCounts={NEW:0,ASSIGNED:0,EN_ROUTE:0,DONE:0,CANCELLED:0};
    orders.forEach(o=>{if(stCounts.hasOwnProperty(o.status))stCounts[o.status]++});
    if(chOrders)chOrders.destroy();
    chOrders=new Chart(document.getElementById('chOrders'),{type:'bar',data:{
      labels:['جديد','مسند','بالطريق','منفذ','ملغي'],
      datasets:[{data:[stCounts.NEW,stCounts.ASSIGNED,stCounts.EN_ROUTE,stCounts.DONE,stCounts.CANCELLED],
        backgroundColor:['#2E7DD1','#F7A823','#F7A823','#1B9E6E','#D64545'],borderRadius:6}]
    },options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{grid:{color:'#E6ECF1'},ticks:{stepSize:1}},x:{grid:{display:false}}}}});
  }catch(e){console.error(e)}
}


/* ===== نظام الصلاحيات ===== */
const PERMISSIONS = {
  OWNER:       ['dash','alerts','orders','containers','employees','shifts','attendance','payroll','vehicles','maintenance','reports','accounting','daily','warehouses','users'],
  BRANCH_MGR:  ['dash','alerts','orders','containers','employees','shifts','attendance','vehicles','maintenance'],
  TRAFFIC_MGR: ['dash','alerts','orders','containers','attendance','vehicles','maintenance','reports','warehouses'],
  DISPATCHER:  ['dash','alerts','orders','containers'],
  ACCOUNTANT:  ['dash','payroll','accounting','daily'],
  DRIVER:      ['dash','orders'],
  SUPER_ADMIN: ['dash','alerts','orders','containers','employees','shifts','attendance','payroll','vehicles','maintenance','reports','users'],
};

const ROLE_LABELS = {
  OWNER:'مدير الشركة', BRANCH_MGR:'مدير فرع', TRAFFIC_MGR:'مدير حركة',
  DISPATCHER:'موزع عمليات', ACCOUNTANT:'محاسب', DRIVER:'سائق', SUPER_ADMIN:'مدير المنصة'
};

function applyPermissions(){
  const role = who.role || 'DRIVER';
  const allowed = PERMISSIONS[role] || ['dash'];
  // إخفاء عناصر القائمة غير المسموح بها
  document.querySelectorAll('[data-page]').forEach(el => {
    const page = el.dataset.page;
    if(!allowed.includes(page)){
      el.style.display = 'none';
    }
  });
  // إظهار الدور في معلومات المستخدم
  const roleEl = document.getElementById('userRole');
  if(roleEl) roleEl.textContent = ROLE_LABELS[role] || role;
  // إخفاء زر الإضافة لبعض الأدوار
  if(role === 'DRIVER' || role === 'ACCOUNTANT'){
    const topBtn = document.getElementById('topBtn');
    if(topBtn) topBtn.style.display = 'none';
  }
  // منع الوصول المباشر للصفحات غير المسموح بها
  return allowed;
}

/* ===== تعديل الراتب ===== */
async function editSalary(id, currentSalary, currentExtra){
  const newSalary = prompt('الراتب الأساسي الحالي: ' + fmt(currentSalary) + ' ر.س\nأدخل الراتب الجديد:');
  if(newSalary === null) return;
  const newExtra = prompt('البدلات والإضافي الحالية: ' + fmt(currentExtra) + ' ر.س\nأدخل القيمة الجديدة:');
  if(newExtra === null) return;
  try{
    await hrApi('/employees/'+id, {method:'PATCH', body:JSON.stringify({salary:+newSalary, extra:+newExtra||0})});
    loadPayroll();
    showToast('تم تحديث الراتب ✓');
  }catch(e){console.error(e)}
}


/* ===== المحاسبة ===== */
let extraExpenses = []; // مصروفات إضافية محلية

async function loadAccounting(){
  try{
    const [orders, payroll, maint] = await Promise.all([
      coApi('/orders'),
      hrApi('/payroll?month=' + new Date().toISOString().slice(0,7).replace('-','/')),
      hrApi('/maintenance'),
    ]);

    // الإيرادات من الطلبات
    const revenue = orders.filter(o=>o.price).reduce((s,o)=>s+(+o.price||0),0);
    
    // مصروفات الرواتب
    const salaryExp = payroll.reduce((s,e)=>s+e.netSalary,0);
    
    // مصروفات الصيانة هذا الشهر
    const thisMaint = maint.filter(m=>new Date(m.date).getMonth()===new Date().getMonth());
    const maintExp = thisMaint.reduce((s,m)=>s+m.cost,0);
    
    // مصروفات إضافية
    const extraExp = extraExpenses.reduce((s,e)=>s+(+e.amount||0),0);
    
    const totalExp = salaryExp + maintExp + extraExp;
    const profit = revenue - totalExp;
    const unpaid = payroll.filter(e=>!e.paid).reduce((s,e)=>s+e.netSalary,0);

    // KPIs
    document.getElementById('acRevenue').innerHTML = fmt(revenue) + ' <small>ر.س</small>';
    document.getElementById('acExpenses').innerHTML = fmt(totalExp) + ' <small>ر.س</small>';
    document.getElementById('acProfit').innerHTML = `<span style="color:${profit>=0?'var(--green)':'var(--red)'}">` + fmt(profit) + '</span> <small>ر.س</small>';
    document.getElementById('acUnpaid').innerHTML = fmt(unpaid) + ' <small>ر.س</small>';

    // جدول الإيرادات مع التحصيل
    document.getElementById('acOrderRows').innerHTML = orders.length ?
      orders.map(o=>`<tr>
        <td class="num" style="font-weight:700;color:var(--steel)">#${o.id}</td>
        <td style="font-weight:600;font-size:.8rem">${o.customerName}</td>
        <td><span class="badge bd-blue">${typeAr[o.type]||o.type}</span></td>
        <td class="num" style="font-size:.7rem">${fd(o.createdAt)}</td>
        <td class="num">${o.price?fmt(o.price)+' ر.س':'—'}</td>
        <td class="num" style="font-weight:700;color:${o.collectedAmount?'var(--green)':'var(--muted)'}">
          ${o.collectedAmount?fmt(o.collectedAmount)+' ر.س':'لم يُحصَّل'}
        </td>
        <td>${o.paymentMethod?`<span class="badge ${o.paymentMethod==='transfer'?'bd-blue':'bd-green'}">${o.paymentMethod==='transfer'?'تحويل':'نقدي'}</span>`:'—'}</td>
        <td style="font-size:.68rem;color:var(--steel)">${o.accountingAt?`<span style="color:var(--green)">✓ مؤكد</span>`:'—'}</td>
        <td>
          ${o.collectedAmount&&!o.accountingAt?`
          <div style="display:flex;gap:4px">
            <button class="btn btn-green btn-sm" onclick="confirmPayment(${o.id},'cash')">✓ نقدي</button>
            <button class="btn btn-sm" style="background:var(--blue-soft);color:var(--blue);padding:5px 8px;font-size:.66rem" onclick="confirmPayment(${o.id},'transfer')">✓ تحويل</button>
          </div>`:o.accountingAt?'<span style="color:var(--green);font-size:.72rem">✓ مؤكد</span>':'—'}
        </td>
      </tr>`).join('') :
      '<tr><td colspan="9" style="text-align:center;padding:20px;color:var(--muted)">لا توجد طلبات</td></tr>';

    // جدول الرواتب
    document.getElementById('acPayRows').innerHTML = payroll.map(e=>`<tr>
      <td style="font-weight:600">${e.name}</td>
      <td class="num">${fmt(e.salary)}</td>
      <td class="num" style="color:var(--green)">+${fmt(e.extra)}</td>
      <td class="num" style="color:var(--red)">-${fmt(e.deduction)}</td>
      <td class="num" style="font-weight:700">${fmt(e.netSalary)} ر.س</td>
      <td><span class="badge ${e.paid?'bd-green':'bd-amber'}">${e.paid?'مصروف':'مستحق'}</span></td>
      <td>${e.paid?'—':`<button class="btn btn-amber btn-sm" onclick="payEmpFromAc(${e.id})">صرف</button>`}</td>
    </tr>`).join('');

    // جدول الصيانة
    document.getElementById('acMaintRows').innerHTML = thisMaint.length ?
      thisMaint.map(m=>`<tr>
        <td class="num" style="font-size:.74rem">${new Date(m.date).toLocaleDateString('ar-SA')}</td>
        <td class="num">${m.vehicle?.plate||'—'}</td>
        <td>${m.type}</td>
        <td class="num" style="font-weight:700;color:var(--red)">${fmt(m.cost)} ر.س</td>
      </tr>`).join('') :
      '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--muted)">لا توجد صيانة هذا الشهر</td></tr>';

    // الملخص المالي
    const expTypeAr = {fuel:'وقود',tools:'أدوات',insurance:'تأمين',other:'أخرى'};
    document.getElementById('acSummary').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px">
        <div style="background:var(--green-soft);border-radius:12px;padding:14px;border:1px solid rgba(27,158,110,.2)">
          <div style="font-size:.72rem;color:var(--green);font-weight:700;margin-bottom:4px">💰 إجمالي الإيرادات</div>
          <div class="num" style="font-size:1.4rem;font-weight:700;color:var(--green)">${fmt(revenue)} ر.س</div>
        </div>
        <div style="background:var(--red-soft);border-radius:12px;padding:14px;border:1px solid rgba(214,69,69,.2)">
          <div style="font-size:.72rem;color:var(--red);font-weight:700;margin-bottom:4px">💸 إجمالي المصروفات</div>
          <div class="num" style="font-size:1.4rem;font-weight:700;color:var(--red)">${fmt(totalExp)} ر.س</div>
          <div style="font-size:.66rem;color:var(--muted);margin-top:4px">رواتب: ${fmt(salaryExp)} | صيانة: ${fmt(maintExp)} | أخرى: ${fmt(extraExp)}</div>
        </div>
        <div style="background:${profit>=0?'var(--blue-soft)':'var(--red-soft)'};border-radius:12px;padding:14px;border:1px solid ${profit>=0?'rgba(46,125,209,.2)':'rgba(214,69,69,.2)'}">
          <div style="font-size:.72rem;color:${profit>=0?'var(--blue)':'var(--red)'};font-weight:700;margin-bottom:4px">${profit>=0?'📈 صافي الربح':'📉 صافي الخسارة'}</div>
          <div class="num" style="font-size:1.4rem;font-weight:700;color:${profit>=0?'var(--blue)':'var(--red)'}">${fmt(Math.abs(profit))} ر.س</div>
        </div>
      </div>
      ${[
        ['الرواتب المصروفة', fmt(payroll.filter(e=>e.paid).reduce((s,e)=>s+e.netSalary,0))+' ر.س'],
        ['الرواتب المستحقة', fmt(unpaid)+' ر.س'],
        ['تكاليف الصيانة', fmt(maintExp)+' ر.س'],
        ['عدد الطلبات', orders.length+' طلب'],
        ['طلبات منفذة', orders.filter(o=>o.status==='DONE').length+' طلب'],
        ['متوسط قيمة الطلب', fmt(Math.round(revenue/Math.max(1,orders.filter(o=>o.price).length)))+' ر.س'],
      ].map(r=>`<div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)">
        <div style="flex:1;font-size:.82rem;color:var(--steel)">${r[0]}</div>
        <div class="num" style="font-weight:700;font-size:.95rem">${r[1]}</div>
      </div>`).join('')}
      ${extraExpenses.length ? `
        <div style="margin-top:14px">
          <div style="font-size:.78rem;font-weight:700;color:var(--ink2);margin-bottom:8px">المصروفات الإضافية:</div>
          ${extraExpenses.map(e=>`<div style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
            <div style="flex:1;font-size:.78rem">${expTypeAr[e.type]||e.type} — ${e.note||''}</div>
            <div style="font-size:.8rem;color:var(--muted);margin-inline-end:8px">${new Date(e.date).toLocaleDateString('ar-SA')}</div>
            <div class="num" style="font-weight:700;color:var(--red)">${fmt(e.amount)} ر.س</div>
          </div>`).join('')}
        </div>` : ''}`;

  }catch(e){console.error(e)}
}

async function payEmpFromAc(id){
  const month = new Date().toISOString().slice(0,7).replace('-','/');
  await hrApi('/payroll/pay',{method:'POST',body:JSON.stringify({employeeId:id,month})});
  loadAccounting();
  showToast('تم صرف الراتب ✓');
}

function addExpense(){
  const amount = document.getElementById('expAmount').value;
  const type = document.getElementById('expType').value;
  const date = document.getElementById('expDate').value || new Date().toISOString().split('T')[0];
  const note = document.getElementById('expNote').value;
  if(!amount) return showToast('⚠ المبلغ مطلوب');
  extraExpenses.push({type, amount:+amount, date, note});
  document.getElementById('expAmount').value='';
  document.getElementById('expNote').value='';
  loadAccounting();
  showToast('تمت إضافة المصروف ✓');
}


async function confirmPayment(orderId, method){
  await coApi('/orders/'+orderId+'/confirm-payment',{method:'POST',body:JSON.stringify({method})});
  loadAccounting();
  loadDailyReport();
  showToast('✓ تم تأكيد استلام المبلغ وإضافته للتقرير اليومي');
}

/* ===== التقارير اليومية ===== */
async function loadDailyReport(){
  try{
    const [summary, reports] = await Promise.all([
      coApi('/financial-summary'),
      coApi('/daily-reports?days=30'),
    ]);
    document.getElementById('drCash').innerHTML = fmt(summary.todayCash||0)+' <small>ر.س</small>';
    document.getElementById('drTransfer').innerHTML = fmt(summary.todayTransfer||0)+' <small>ر.س</small>';
    document.getElementById('drTotal').innerHTML = fmt(summary.todayTotal||0)+' <small>ر.س</small>';
    document.getElementById('drPending').innerHTML = fmt(summary.pendingCollection||0)+' <small>ر.س</small>';
    
    document.getElementById('dailyRows').innerHTML = reports.length ?
      reports.map(r=>`<tr>
        <td class="num" style="font-size:.76rem">${new Date(r.date).toLocaleDateString('ar-SA',{weekday:'short',month:'short',day:'numeric'})}</td>
        <td class="num" style="font-weight:600">${r.orders}</td>
        <td class="num" style="color:var(--green);font-weight:700">${fmt(r.cash)} ر.س</td>
        <td class="num" style="color:var(--blue);font-weight:700">${fmt(r.transfer)} ر.س</td>
        <td class="num" style="font-weight:700">${fmt(r.total)} ر.س</td>
        <td class="num" style="color:${r.confirmed>=r.total?'var(--green)':'var(--amber)'};font-weight:600">${fmt(r.confirmed)} ر.س</td>
      </tr>`).join('') :
      '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--muted)">لا توجد بيانات</td></tr>';
  }catch(e){console.error(e)}
}

/* ===== دوال الجوال ===== */
function toggleMobileMenu(){
  const menu = document.getElementById('moreMenu');
  const bg = document.getElementById('moreMenuBg');
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : 'block';
  bg.style.display = isOpen ? 'none' : 'block';
}
function closeMobileMenu(){
  document.getElementById('moreMenu').style.display = 'none';
  document.getElementById('moreMenuBg').style.display = 'none';
}


/* ===== المستودعات ===== */
let whLat = null, whLng = null;

async function loadWarehouses(){
  try{
    const ws = await coApi('/warehouses');
    document.getElementById('warehouseCards').innerHTML = ws.length ?
      ws.map(w => `
        <div style="background:#fff;border-radius:var(--radius);box-shadow:var(--shadow);padding:18px;border-top:4px solid var(--amber)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
            <div style="width:42px;height:42px;border-radius:10px;background:var(--amber-soft);display:grid;place-items:center;font-size:1.3rem;flex-shrink:0">🏭</div>
            <div>
              <div style="font-weight:700;font-size:.95rem">${w.name}</div>
              <div style="font-size:.72rem;color:var(--steel)">${w.address||'—'}</div>
            </div>
            ${w.lat?`<a href="https://maps.google.com/?q=${w.lat},${w.lng}" target="_blank" style="margin-inline-start:auto;color:var(--blue);font-size:.72rem">📍 خريطة</a>`:''}
          </div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
            <div style="background:var(--green-soft);border-radius:10px;padding:10px">
              <div class="num" style="font-size:1.4rem;font-weight:700;color:var(--green)">${w.available}</div>
              <div style="font-size:.65rem;color:var(--green);font-weight:600">متاحة</div>
            </div>
            <div style="background:var(--amber-soft);border-radius:10px;padding:10px">
              <div class="num" style="font-size:1.4rem;font-weight:700;color:var(--amber-d)">${w.rented}</div>
              <div style="font-size:.65rem;color:var(--amber-d);font-weight:600">مؤجرة</div>
            </div>
            <div style="background:var(--red-soft);border-radius:10px;padding:10px">
              <div class="num" style="font-size:1.4rem;font-weight:700;color:var(--red)">${w.maintenance}</div>
              <div style="font-size:.65rem;color:var(--red);font-weight:600">صيانة</div>
            </div>
          </div>
          <div style="margin-top:10px;padding:8px;background:var(--bg);border-radius:8px;text-align:center;font-size:.76rem;color:var(--steel)">
            الطاقة الاستيعابية: <b class="num">${w.capacity||'—'}</b> حاوية
            &nbsp;|&nbsp; الإجمالي: <b class="num">${w.totalContainers}</b>
          </div>
        </div>`).join('') :
      '<div style="text-align:center;padding:40px;color:var(--muted);grid-column:1/-1">لا توجد مستودعات — أضف مستودعاً جديداً</div>';
  }catch(e){console.error(e)}
}

async function extractWhLocation(){
  const url = document.getElementById('whUrl').value.trim();
  if(!url){showToast('⚠ الصق رابط الموقع أولاً');return}
  try{
    const res = await coApi('/extract-location',{method:'POST',body:JSON.stringify({url})});
    const msg = document.getElementById('whLocMsg');
    if(res.found){
      whLat = res.lat; whLng = res.lng;
      msg.innerHTML = `<span style="color:var(--green)">✓ تم استخراج الموقع: ${res.lat.toFixed(5)}, ${res.lng.toFixed(5)}</span>`;
    } else {
      msg.innerHTML = `<span style="color:var(--red)">✗ ${res.message}</span>`;
    }
  }catch(e){showToast('خطأ في استخراج الموقع')}
}

async function addWarehouse(){
  const name = document.getElementById('whName').value.trim();
  if(!name){showToast('⚠ اسم المستودع مطلوب');return}
  try{
    await coApi('/warehouses',{method:'POST',body:JSON.stringify({
      name,
      address: document.getElementById('whAddr').value,
      capacity: document.getElementById('whCap').value||0,
      lat: whLat, lng: whLng,
    })});
    ['whName','whAddr','whCap','whUrl'].forEach(i=>document.getElementById(i).value='');
    document.getElementById('whLocMsg').innerHTML='';
    whLat=null;whLng=null;
    loadWarehouses();
    showToast('تمت إضافة المستودع ✓');
  }catch(x){console.error(x)}
}

/* ===== استخراج موقع العميل في الطلب ===== */
async function extractOrderLocation(){
  const url = document.getElementById('oLocUrl').value.trim();
  if(!url){
    const input = prompt('الصق رابط الموقع من واتساب أو خرائط قوقل:');
    if(!input)return;
    document.getElementById('oLocUrl').value = input;
  }
  const urlVal = document.getElementById('oLocUrl').value.trim();
  try{
    const res = await coApi('/extract-location',{method:'POST',body:JSON.stringify({url:urlVal})});
    if(res.found){
      loc = {lat:res.lat, lng:res.lng};
      document.getElementById('locMsg').innerHTML = `<div class="loc-msg loc-ok">✓ تم استخراج موقع العميل (${res.lat.toFixed(5)}, ${res.lng.toFixed(5)})</div>`;
      showToast('✓ تم استخراج الموقع من الرابط');
    } else {
      document.getElementById('locMsg').innerHTML = `<div class="loc-msg loc-err">✗ ${res.message}</div>`;
    }
  }catch(e){showToast('خطأ في استخراج الموقع')}
}

/* ===== إشعار طلب جديد عند الإنشاء ===== */
const _origAddOrder = addOrder;
async function addOrder(){
  await _origAddOrder();
  // إرسال إشعار للمديرين
  if(appSocket && appSocket.connected){
    const cust = document.getElementById('oCust')?.value || '';
    const type = document.getElementById('oType')?.value || '';
    appSocket.emit('notify:new-order', { customerName: cust, type });
  }
}



/* ===== إدارة المستخدمين ===== */
async function editUserName(id, name){
  const newName = prompt(`الاسم الحالي: ${name}\nأدخل الاسم الجديد:`);
  if(!newName || newName===name) return;
  try{
    await coApi('/users/'+id,{method:'PATCH',body:JSON.stringify({name:newName})});
    loadUsers();
    showToast('تم تحديث الاسم ✓');
  }catch(e){showToast('⚠ خطأ في التحديث')}
}

async function editUser(id, name, role){
  const newRole = prompt(`تعديل دور ${name}\nالأدوار المتاحة:\nOWNER = مدير شركة\nBRANCH_MGR = مدير فرع\nTRAFFIC_MGR = مدير حركة\nDISPATCHER = موزع\nACCOUNTANT = محاسب\nDRIVER = سائق\n\nالدور الحالي: ${role}`, role);
  if(!newRole || newRole===role) return;
  const validRoles = ['OWNER','BRANCH_MGR','TRAFFIC_MGR','DISPATCHER','ACCOUNTANT','DRIVER'];
  if(!validRoles.includes(newRole)){showToast('⚠ دور غير صحيح');return}
  try{
    await coApi('/users/'+id,{method:'PATCH',body:JSON.stringify({role:newRole})});
    loadUsers();
    showToast('تم تحديث الدور ✓');
  }catch(e){showToast('⚠ خطأ في التحديث')}
}

async function resetUserPass(id, name){
  const newPass = prompt(`إعادة تعيين كلمة مرور ${name}\nأدخل كلمة المرور الجديدة (8 أحرف على الأقل):`);
  if(!newPass) return;
  if(newPass.length < 6){showToast('⚠ كلمة المرور قصيرة جداً');return}
  try{
    await coApi('/users/'+id,{method:'PATCH',body:JSON.stringify({password:newPass})});
    showToast('تم تغيير كلمة المرور ✓');
  }catch(e){showToast('⚠ خطأ في تغيير كلمة المرور')}
}

async function deleteUser(id, name){
  if(!confirm(`هل تريد حذف مستخدم "${name}"؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
  try{
    await coApi('/users/'+id,{method:'DELETE'});
    loadUsers();
    showToast('تم حذف المستخدم ✓');
  }catch(e){showToast('⚠ لا يمكن حذف هذا المستخدم')}
}

async function toggleUser(id, name, isActive){
  const action = isActive ? 'تعطيل' : 'تفعيل';
  if(!confirm(`هل تريد ${action} مستخدم "${name}"؟`)) return;
  try{
    await coApi('/users/'+id,{method:'PATCH',body:JSON.stringify({active:!isActive})});
    loadUsers();
    showToast(`تم ${action} المستخدم ✓`);
  }catch(e){showToast('⚠ خطأ في التحديث')}
}

/* ===== إجراءات الموظف ===== */
function toggleEmpMenu(id, e){
  e.stopPropagation();
  // إغلاق كل القوائم المفتوحة
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
  const menu = document.getElementById('empMenu-'+id);
  if(menu) menu.style.display = menu.style.display==='none'?'block':'none';
}
// إغلاق القوائم عند النقر خارجها
document.addEventListener('click', ()=>{
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
});

async function empAction(id, status){
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
  const labels = {ACTIVE:'تفعيل',INACTIVE:'إنهاء العمل',LEAVE:'إجازة',SICK:'إجازة مرضية',SUSPENDED:'إيقاف'};
  if(status==='INACTIVE' && !confirm(`هل تريد إنهاء عمل هذا الموظف؟`)) return;
  try{
    await hrApi('/employees/'+id,{method:'PATCH',body:JSON.stringify({status})});
    loadEmps();
    showToast(`تم تحديث حالة الموظف: ${labels[status]||status} ✓`);
  }catch(e){console.error(e)}
}

async function editEmpSalary(id, salary, extra){
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
  const newSalary = prompt(`الراتب الحالي: ${fmt(salary)} ر.س\nأدخل الراتب الجديد:`);
  if(!newSalary) return;
  const newExtra = prompt(`البدلات الحالية: ${fmt(extra)} ر.س\nأدخل البدلات الجديدة:`);
  if(newExtra===null) return;
  await hrApi('/employees/'+id,{method:'PATCH',body:JSON.stringify({salary:+newSalary,extra:+newExtra||0})});
  loadEmps();
  showToast('تم تحديث الراتب ✓');
}

async function editEmpShift(id){
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
  const shift = prompt('أدخل الشفت الجديد:\nMORNING = صباحي\nEVENING = مسائي\nNIGHT = ليلي');
  if(!shift) return;
  const shiftMap = {'صباحي':'MORNING','مسائي':'EVENING','ليلي':'NIGHT','MORNING':'MORNING','EVENING':'EVENING','NIGHT':'NIGHT'};
  const s = shiftMap[shift];
  if(!s){showToast('⚠ شفت غير صحيح');return}
  await hrApi('/employees/'+id,{method:'PATCH',body:JSON.stringify({shift:s})});
  loadEmps();loadShifts();
  showToast('تم تغيير الشفت ✓');
}


/* ===== المعاملات المالية ===== */
let currentTransEmpId = null;
const typeAr2 = {
  BONUS_AMOUNT:'زيادة قيمة', BONUS_DAYS:'زيادة أيام',
  OVERTIME:'أوفر تايم', ADVANCE:'سلفة',
  ADVANCE_REPAY:'سداد سلفة', DEDUCTION:'خصم', PENALTY:'جزاء'
};
const typeColor = {
  BONUS_AMOUNT:'var(--green)', BONUS_DAYS:'var(--green)',
  OVERTIME:'var(--blue)', ADVANCE:'var(--red)',
  ADVANCE_REPAY:'var(--green)', DEDUCTION:'var(--red)', PENALTY:'var(--red)'
};

// تحديث حقل الأيام عند تغيير النوع
document.getElementById('tType').addEventListener('change', function(){
  const isDays = this.value === 'BONUS_DAYS';
  document.getElementById('tDaysField').style.display = isDays ? 'block' : 'none';
  document.getElementById('tAmountLabel').textContent = isDays ? 'القيمة (تحسب تلقائياً)' : 'القيمة (ر.س) *';
  if(isDays) document.getElementById('tAmount').placeholder = 'اختياري';
  else document.getElementById('tAmount').placeholder = '0';
});

// تعيين الشهر الحالي
document.getElementById('tMonth').value = new Date().toISOString().slice(0,7);

async function openTransactions(empId, empName){
  document.querySelectorAll('[id^="empMenu-"]').forEach(m=>m.style.display='none');
  currentTransEmpId = empId;
  document.getElementById('mTransTitle').textContent = `💰 المعاملات المالية — ${empName}`;
  document.getElementById('mTrans').classList.add('open');
  await loadTransactions();
}

async function loadTransactions(){
  if(!currentTransEmpId) return;
  try{
    const data = await hrApi('/employees/'+currentTransEmpId+'/financial');
    // الملخص
    document.getElementById('mTransSummary').innerHTML = `
      <div style="background:var(--green-soft);border-radius:9px;padding:10px;text-align:center">
        <div class="num" style="font-size:1.2rem;font-weight:700;color:var(--green)">${fmt(data.netAdditions)} ر.س</div>
        <div style="font-size:.66rem;color:var(--green);margin-top:2px">إجمالي الزيادات</div>
      </div>
      <div style="background:var(--red-soft);border-radius:9px;padding:10px;text-align:center">
        <div class="num" style="font-size:1.2rem;font-weight:700;color:var(--red)">${fmt(data.netDeductions)} ر.س</div>
        <div style="font-size:.66rem;color:var(--red);margin-top:2px">إجمالي الخصومات</div>
      </div>
      <div style="background:var(--blue-soft);border-radius:9px;padding:10px;text-align:center">
        <div class="num" style="font-size:1.2rem;font-weight:700;color:var(--blue)">${fmt(data.netSalary)} ر.س</div>
        <div style="font-size:.66rem;color:var(--blue);margin-top:2px">الصافي المتوقع</div>
      </div>`;
    // السجل
    document.getElementById('mTransList').innerHTML = data.transactions.length ?
      data.transactions.map(t=>`
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
          <div style="width:32px;height:32px;border-radius:8px;background:var(--bg);display:grid;place-items:center;font-size:.8rem;flex-shrink:0">
            ${{BONUS_AMOUNT:'⬆️',BONUS_DAYS:'📅',OVERTIME:'⏰',ADVANCE:'💳',ADVANCE_REPAY:'✓',DEDUCTION:'⬇️',PENALTY:'⚠️'}[t.type]||'💰'}
          </div>
          <div style="flex:1">
            <div style="font-size:.8rem;font-weight:600">${typeAr2[t.type]||t.type}</div>
            <div style="font-size:.66rem;color:var(--steel)">${t.note||'—'} · ${t.month||''}</div>
          </div>
          <div class="num" style="font-weight:700;color:${typeColor[t.type]||'var(--ink)'}">
            ${['DEDUCTION','ADVANCE','PENALTY'].includes(t.type)?'−':'+'}${fmt(t.amount)} ر.س
            ${t.days?`<div style="font-size:.62rem;color:var(--muted)">${t.days} أيام</div>`:''}
          </div>
          <button onclick="deleteTransaction(${t.id})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:4px" title="حذف">✕</button>
        </div>`).join('') :
      '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem">لا توجد معاملات هذا الشهر</div>';
  }catch(e){console.error(e)}
}

async function addTransaction(){
  const type = document.getElementById('tType').value;
  const amount = document.getElementById('tAmount').value;
  const days = document.getElementById('tDays').value;
  const month = document.getElementById('tMonth').value?.replace('-','/');
  const note = document.getElementById('tNote').value;
  if(!amount && !days){showToast('⚠ أدخل القيمة أو عدد الأيام');return}
  try{
    await hrApi('/transactions',{method:'POST',body:JSON.stringify({
      employeeId:currentTransEmpId, type, amount:amount||0, days:days||null, month, note
    })});
    document.getElementById('tAmount').value='';
    document.getElementById('tDays').value='';
    document.getElementById('tNote').value='';
    await loadTransactions();
    showToast('تمت إضافة المعاملة ✓');
  }catch(e){console.error(e)}
}

async function deleteTransaction(id){
  if(!confirm('هل تريد حذف هذه المعاملة؟')) return;
  await hrApi('/transactions/'+id,{method:'DELETE'});
  await loadTransactions();
  showToast('تم حذف المعاملة ✓');
}

/* ===== التشغيل الأولي ===== */
// Socket.IO للإشعارات
let appSocket = null;
function initAppSocket(){
  if(typeof io === 'undefined') return;
  appSocket = io({ auth: { token: T } });
  appSocket.on('alert:new-order', (data) => {
    showToast('🔔 طلب جديد! ' + data.customerName + ' — ' + (data.type||''));
    // تحديث شارة التنبيهات
    loadAlerts();
    // إذا في صفحة الطلبات حدّثها
    if(curPage === 'orders') loadOrders();
    if(curPage === 'dash') loadDash();
  });
}
setTimeout(initAppSocket, 2000);

// تطبيق الصلاحيات
applyPermissions();
// تحميل الصفحة الافتراضية حسب الدور
const role = who.role || 'DRIVER';
const allowed = PERMISSIONS[role] || ['dash'];
const startPage = allowed[0] || 'dash';
go(startPage);
setInterval(()=>{if(curPage==='dash')loadDash();if(curPage==='alerts')loadAlerts()},60000);

// ==========================================
// دوال متابعة الطلب للسائق
// ==========================================

// دالة لتحديث حالة الطلب بواسطة السائق أو المدير
function updateOrderStatus(orderId, newStatus) {
  if(!confirm(`هل تريد تغيير حالة الطلب إلى "${newStatus}"؟`)) return;
  
  fetch(`/api/co/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + T },
    body: JSON.stringify({ status: newStatus })
  })
  .then(res => res.json())
  .then(data => {
    showToast('✅ تم تحديث الحالة بنجاح');
    loadOrders(); // إعادة تحميل جدول الطلبات
  })
  .catch(err => showToast('⚠ حدث خطأ في تحديث الحالة'));
}

// إضافة الأزرار الجديدة في جدول الطلبات (تنبيه: تحتاج لتعديل loadOrders لتشملها)

// ==========================================
// نظام خريطة الحاويات (متكامل مع قاعدة البيانات)
// ==========================================

let containerMap = null;
let containerMarkers = [];

function loadContainerMap() {
    // تهيئة الخريطة إذا لم تكن موجودة (مركز الرياض)
    if (!containerMap) {
        containerMap = L.map('containerMap').setView([24.7136, 46.6753], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(containerMap);
    }

    // جلب الحاويات من السيرفر
    fetch('/api/co/containers/map', {
        headers: { 'Authorization': 'Bearer ' + T }
    })
    .then(res => res.json())
    .then(containers => {
        // تنظيف العلامات القديمة
        containerMarkers.forEach(m => containerMap.removeLayer(m));
        containerMarkers = [];

        // إنشاء مصفوفة للحدود لتكبير الخريطة تلقائياً
        let bounds = [];

        containers.forEach(container => {
            // إذا لم يكن للحاوية موقع، نتخطاها
            if (!container.lat || !container.lng) return;

            // تحديد اللون بناءً على الحالة
            let color = '#2E7DD1'; // افتراضي أزرق
            let statusLabel = 'مستودع';
            
            if (container.status === 'IN_DEPOT') {
                color = '#1E9E6A'; // أخضر (متاحة)
                statusLabel = 'متاحة';
            } else if (container.status === 'ON_SITE') {
                color = '#F7A823'; // برتقالي (مؤجرة/بالموقع)
                statusLabel = 'مؤجرة';
            } else if (container.status === 'MAINTENANCE') {
                color = '#D64545'; // أحمر (صيانة)
                statusLabel = 'صيانة';
            }

            // إنشاء العلامة
            const marker = L.circleMarker([container.lat, container.lng], {
                radius: 8,
                fillColor: color,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9
            }).addTo(containerMap);

            // إضافة نافذة منبثقة عند الضغط
            marker.bindPopup(`
    <div style="font-family:'IBM Plex Sans Arabic'; text-align:center; min-width:140px">
        <div style="font-weight:700; font-size:1.1rem; color:#141F28">${container.code}</div>
        <div style="font-size:0.8rem; color:#5B7286">الحجم: ${container.size || '—'}</div>
        <div style="font-size:0.8rem; color:#5B7286">الموقع: ${container.warehouse?.name || 'غير محدد'}</div>
        <div style="margin-top:4px; background:${color}; color:#fff; border-radius:12px; padding:2px 8px; display:inline-block; font-size:0.75rem; font-weight:600">${statusLabel}</div>
        ${container.status === 'IN_DEPOT' ? `<button onclick="openOrderModal(${container.id}, '${container.code}', ${container.lat}, ${container.lng})" style="margin-top:12px; background:#F7A823; border:0; border-radius:8px; padding:6px 14px; font-family:inherit; font-weight:700; font-size:0.8rem; color:#141F28; cursor:pointer; width:100%">📦 طلب هذه الحاوية</button>` : ''}
    </div>
`);
            `);

            containerMarkers.push(marker);
            bounds.push([container.lat, container.lng]);
        });

        // إذا كان هناك حاويات، ضبط الخريطة لتشملها جميعاً
        if (bounds.length > 0) {
            containerMap.fitBounds(bounds, { padding: [30, 30] });
        }
    })
    .catch(err => console.error('خطأ في تحميل خريطة الحاويات', err));
}

// استدعاء الدالة عند فتح الصفحة (يجب ربطها بحدث التبويب)
// أضف هذا السطر داخل دالة go() في ملفك إذا لم يكن موجوداً
// if (p === 'map') loadContainerMap();

// ==========================================
// نظام الطلب المباشر من خريطة الحاويات
// ==========================================
let selectedContainerIdForOrder = null;

// فتح النافذة وتجهيز البيانات
window.openOrderModal = function(containerId, containerCode, containerLat, containerLng) {
    selectedContainerLat = containerLat;
    selectedContainerLng = containerLng;
    selectedContainerIdForOrder = containerId;
    document.getElementById('mMapContainerCode').textContent = containerCode;
    document.getElementById('mMapTitle').textContent = `طلب حاوية ${containerCode}`;
    document.getElementById('mMapDue').value = new Date().toISOString().split('T')[0]; // تعيين تاريخ اليوم افتراضياً

    // جلب السائقين النشطين لملء القائمة
    fetch('/api/hr/employees', {
        headers: { 'Authorization': 'Bearer ' + T }
    })
    .then(res => res.json())
    .then(employees => {
        const drivers = employees.filter(e => e.role === 'سائق' && e.status === 'ACTIVE');
        const select = document.getElementById('mMapDriver');
        select.innerHTML = '<option value="">-- اختر سائقاً --</option>' + 
            drivers.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        
        document.getElementById('mMapOrder').classList.add('open'); // فتح النافذة
    })
    .catch(err => {
        console.error(err);
        showToast('⚠ تعذر تحميل قائمة السائقين');
    });
};

// إنشاء الطلب وإسناده
window.createOrderFromMap = function() {
    const driverId = document.getElementById('mMapDriver').value;
    if (!driverId) return showToast('⚠ يجب اختيار سائق أولاً');

    const orderData = {
        lat: selectedContainerLat,
        lng: selectedContainerLng,
        containerId: selectedContainerIdForOrder,
        type: document.getElementById('mMapType').value,
        dueDate: document.getElementById('mMapDue').value || null,
        customerName: document.getElementById('mMapCustomer').value.trim() || 'طلب مباشر من الخريطة',
        price: 0, // يمكنك إضافة حقل سعر لاحقاً
        assignedTo: parseInt(driverId)
    };

    fetch('/api/co/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + T },
        body: JSON.stringify(orderData)
    })
    .then(res => res.json())
    .then(data => {
        closeModal('mMapOrder');
        showToast('✅ تم إنشاء الطلب وإسناده للسائق بنجاح!');
        
        // إعادة تحميل الخريطة لتحديث حالة الحاوية (لن تظهر كمتاحة بعد الآن)
        if(typeof loadContainerMap === 'function') loadContainerMap();
        
        // إعادة تحميل صفحة الطلبات إذا كانت مفتوحة
        if(curPage === 'orders' && typeof loadOrders === 'function') loadOrders();
    })
    .catch(err => {
        showToast('⚠ خطأ في إنشاء الطلب');
        console.error(err);
    });
};
