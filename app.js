"use strict";
(function () {
  const ROOT_NAME = "شواهد برامج التوجيه الطلابي";
  const CONFIG_NAME = "guidance-evidence-settings.json";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
  const PALETTE = ["#225C78","#794A87","#A86627","#287354","#AF4057","#3E5B9A","#7C5830","#3B767F","#75549F","#9C4E37","#396B45","#315F94","#865160","#526A35","#8C4A65","#326F73"];
  const store = {token:"", root:"", programs:[], files:[], chosen:[], config:{colors:{},logo:""}, configId:"", qrLarge:null, selectedCode:null, pendingEdit:null, saving:false, rootPublic:false, account:""};
  const $ = id => document.getElementById(id);
  const msg = text => {const el=$("toast"); el.textContent=text; el.classList.add("show"); clearTimeout(msg.timer); msg.timer=setTimeout(()=>el.classList.remove("show"),4200);};
  const esc = s => String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const arabic = n => Number(n||0).toLocaleString("ar-SA");
  const folderUrl = id => "https://drive.google.com/drive/folders/" + encodeURIComponent(id);
  const customIcon = () => store.config.logo || new URL("./icon.svg",location.href).href;
  const on = (id,event,fn) => $(id).addEventListener(event,fn);
  const button = (text,fn,cls) => {const b=document.createElement("button");b.type="button";b.textContent=text;b.className=cls||"";b.addEventListener("click",fn);return b;};
  function page(name){document.querySelectorAll(".page").forEach(e=>e.classList.toggle("active",e.id===name));document.querySelectorAll(".nav-item").forEach(e=>e.classList.toggle("active",e.dataset.page===name));scrollTo({top:0,behavior:"smooth"});if(name==="codes")renderCodes();}
  document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>page(b.dataset.page)));
  document.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>page(b.dataset.jump)));
  function busy(buttonEl,value){buttonEl.disabled=!!value;buttonEl.dataset.original=buttonEl.dataset.original||buttonEl.textContent;buttonEl.textContent=value?"جارٍ التنفيذ...":buttonEl.dataset.original;}
  function showError(err){const t=String(err && err.message || err ||"حدث خطأ غير معروف");msg(t);console.error(err);return t;}
  function clientId(){return localStorage.getItem("sge_google_client_id") || "";}
  const queryId = new URLSearchParams(location.search).get("client_id");
  if(queryId && /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(queryId))localStorage.setItem("sge_google_client_id",queryId);
  $("clientId").value=clientId();
  function linkConfig(){const id=clientId();if(!id){msg("احفظي Client ID أولًا");return;}const u=new URL(location.href);u.search="";u.hash="";u.searchParams.set("client_id",id);shareLink(u.toString(),"رابط تطبيق الشواهد مع إعداد الاتصال");}
  const shareSetup=button("مشاركة رابط الإعداد مع الزوجة",linkConfig,"outline");
  $("saveClientId").parentNode.appendChild(shareSetup);
  async function shareLink(url,title){
    if(!url){msg("لم يُنشأ رابط بعد");return;}
    try{if(navigator.share){await navigator.share({title:title||"شواهد التوجيه الطلابي",url});return;}
      await navigator.clipboard.writeText(url);msg("تم نسخ الرابط");}
    catch(e){if(e.name!=="AbortError"){try{await navigator.clipboard.writeText(url);msg("تم نسخ الرابط");}catch(_){prompt("انسخي الرابط:",url);}}}
  }
  function updateState(){
    $("accountButton").textContent=store.token?"Google متصل":"ربط Google";
    $("connectedAs").textContent=store.token?"تم الربط بالحساب: "+(store.account||"Google"):"غير متصل";
    $("rootState").textContent=store.root?(store.rootPublic?"متاح للعرض":"تحققي من المشاركة"):"غير منشأ";
    $("rootInfo").textContent=store.root?"معرّف المجلد: "+store.root+(store.rootPublic?" — المشاركة العامة مفعلة":" — المشاركة العامة غير مؤكدة"):"يُنشأ في حساب Google الذي سجلتِ الدخول به، وليس في حساب مالك مستودع GitHub.";
    $("countPrograms").textContent=arabic(store.programs.length);
    $("statusBanner").style.display=store.token && store.root && store.rootPublic?"none":"flex";
    const status=$("statusBanner");
    if(!store.token){status.querySelector("b").textContent="الخطوة الأولى: تسجيل الدخول بحساب الموجهة";status.querySelector("p").textContent="اضغطي بدء الربط واختاري حساب Google الصحيح."; $("startButton").textContent="ربط Google";}
    else if(!store.root){status.querySelector("b").textContent="الخطوة الثانية: إنشاء مجلد الشواهد";status.querySelector("p").textContent="سيُنشأ مجلد جديد في حسابك ويُشارك للعرض فقط."; $("startButton").textContent="إنشاء المجلد";}
    else {status.querySelector("b").textContent="تحتاج صلاحية المشاهدة العامة إلى التحقق";status.querySelector("p").textContent="يمكن إصلاح المشاركة من الإعدادات، وفق سياسات حساب Google."; $("startButton").textContent="إصلاح المشاركة";}
    $("uploadButton").disabled=!store.token||!store.root||!store.rootPublic||!$("programSelect").value||!store.chosen.length||store.saving;
    $("printButton").disabled=!store.root||!store.rootPublic;
    $("shareAllButton").disabled=!store.root||!store.rootPublic;
  }
  function login(){
    const id=clientId().trim();
    if(!/^[0-9]+-[\w-]+\.apps\.googleusercontent\.com$/.test(id)){page("settings");msg("أدخلي Google OAuth Client ID صالحًا أولًا من إعدادات Google Cloud");return;}
    if(!window.google||!google.accounts||!google.accounts.oauth2){msg("خدمة Google لم تكتمل. افتحي الموقع في Chrome وتحققي من الإنترنت.");return;}
    try{
      const client=google.accounts.oauth2.initTokenClient({
        client_id:id, scope:SCOPE,
        callback:async result=>{
          if(result.error){showError("تعذر تفويض Google: "+result.error);return;}
          store.token=result.access_token;
          try{await loadAccount();await bootstrap();msg("تم الاتصال بحساب Google");}
          catch(e){showError(e);}updateState();
        }
      });
      client.requestAccessToken({prompt:"select_account"});
    }catch(e){showError(e);}
  }
  async function loadAccount(){
    try{const r=await drive("/about?fields=user(displayName,emailAddress)");store.account=r.user&& (r.user.emailAddress||r.user.displayName) ||"Google";}catch(e){store.account="Google";}
  }
  async function drive(path,opts){
    if(!store.token)throw Error("يلزم تسجيل الدخول إلى حساب Google");
    const o=opts||{}, h=new Headers(o.headers||{});h.set("Authorization","Bearer "+store.token);
    const res=await fetch((path.startsWith("http")?path:API+path),{...o,headers:h});
    if(!res.ok){
      let reason="HTTP "+res.status;
      try{const data=await res.json();reason=data.error&&data.error.message||reason;}catch(_){}
      if(res.status===401){store.token="";updateState();reason="انتهت صلاحية تسجيل الدخول. أعيدي ربط Google ثم المحاولة. "+reason;}
      if(res.status===403)reason="رفض Google العملية. تحققي من الصلاحيات وسياسات الحساب: "+reason;
      throw Error(reason);
    }
    if(res.status===204)return {};
    const txt=await res.text();try{return JSON.parse(txt);}catch(_){return txt;}
  }
  function qp(obj){return "?"+new URLSearchParams(obj).toString();}
  async function listDrive(q,fields){
    let token="",out=[];
    do {
      const p={q,fields:"nextPageToken,files("+(fields||"id,name,mimeType,webViewLink,createdTime")+ ")",pageSize:1000,orderBy:"name"};
      if(token)p.pageToken=token;
      const r=await drive("/files"+qp(p));out=out.concat(r.files||[]);token=r.nextPageToken||"";
    }while(token);
    return out;
  }
  const rootQuery = "name = '"+ROOT_NAME+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  async function searchRoot(){
    const found=await listDrive(rootQuery,"id,name,mimeType,webViewLink");
    if(found.length)return found[0].id;
    return "";
  }
  async function createFolder(name,parent){
    const m={name,mimeType:"application/vnd.google-apps.folder",description:"Created by student-guidance-evidence"};
    if(parent)m.parents=[parent];
    return drive("/files?fields=id,name,webViewLink",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(m)});
  }
  async function setPublic(id){
    try{
      const r=await drive("/files/"+encodeURIComponent(id)+"/permissions?fields=permissions(id,type,role)");
      if((r.permissions||[]).some(p=>p.type==="anyone" && (p.role==="reader"||p.role==="writer"))){store.rootPublic=true;return;}
      await drive("/files/"+encodeURIComponent(id)+"/permissions?fields=id",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"anyone",role:"reader",allowFileDiscovery:false})});
      store.rootPublic=true;
    }catch(e){store.rootPublic=false;throw e;}
  }
  async function verifyPublic(){
    try {const r=await drive("/files/"+encodeURIComponent(store.root)+"/permissions?fields=permissions(id,type,role)");
      store.rootPublic=(r.permissions||[]).some(x=>x.type==="anyone" && ["reader","writer"].includes(x.role));
    }catch(e){store.rootPublic=false;}
  }
  async function bootstrap(){
    store.root=await searchRoot();store.programs=[];store.configId="";store.config={colors:{},logo:""};
    if(store.root){await verifyPublic();await loadConfig();await fetchPrograms();}
    else{store.rootPublic=false;renderPrograms();renderCodes();}
    updateState();
  }
  async function setupRoot(){
    if(!store.token){login();return;}
    busy($("setupRootBtn"),true);
    try{
      store.root=await searchRoot();
      if(!store.root){const agree=confirm("سيُنشأ مجلد الشواهد الجديد في حساب Google التالي:\n"+(store.account||"الحساب المتصل حاليًا")+"\n\nتأكدي أنه حساب الموجهة الطلابية فايزة النصيري، وليس حساب الزوج. هل تريدين المتابعة؟");if(!agree)return;const f=await createFolder(ROOT_NAME);store.root=f.id;}
      await setPublic(store.root);
      await loadConfig();await fetchPrograms();
      msg("المجلد جاهز للعرض العام. الملفات القديمة لم تُعدّل.");
    }catch(e){showError(e);}
    finally{busy($("setupRootBtn"),false);updateState();}
  }
  async function fetchPrograms(){
    if(!store.root)return;
    const q="'"+store.root+"' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    store.programs=(await listDrive(q)).sort((a,b)=>a.name.localeCompare(b.name,"ar"));
    renderPrograms();renderCodes();updateState();
  }
  async function loadConfig(){
    const q="'"+store.root+"' in parents and name = '"+CONFIG_NAME+"' and trashed = false";
    const files=await listDrive(q);
    if(!files.length){store.configId="";store.config={colors:{},logo:""};return;}
    store.configId=files[0].id;
    try{const c=await drive("/files/"+store.configId+"?alt=media");store.config={colors:c.colors||{},logo:c.logo||""};}
    catch(e){store.config={colors:{},logo:""};msg("تعذر تحميل إعدادات الشعار والألوان");}
    $("logoPreview").src=customIcon();
  }
  async function multipartCreate(metadata,file,progressCb){
    const boundary="sge_"+Math.random().toString(16).slice(2);
    const type=file.type||"application/octet-stream";
    const before="--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n"+JSON.stringify(metadata)+"\r\n--"+boundary+"\r\nContent-Type: "+type+"\r\n\r\n";
    const after="\r\n--"+boundary+"--";
    const body=new Blob([before,file,after],{type:"multipart/related; boundary="+boundary});
    if(progressCb)progressCb();
    return drive(UPLOAD+"/files?uploadType=multipart&fields=id,name,webViewLink",{method:"POST",headers:{"Content-Type":"multipart/related; boundary="+boundary},body});
  }
  async function saveConfig(){
    if(!store.root)return;
    const text=JSON.stringify({colors:store.config.colors,logo:store.config.logo});
    if(store.configId){
      await drive(UPLOAD+"/files/"+encodeURIComponent(store.configId)+"?uploadType=media&fields=id",{method:"PATCH",headers:{"Content-Type":"application/json"},body:text});
    }else{
      const f=new File([text],CONFIG_NAME,{type:"application/json"});
      const created=await multipartCreate({name:CONFIG_NAME,mimeType:"application/json",parents:[store.root]},f);
      store.configId=created.id;
    }
  }
  function pickColor(i){if(i<PALETTE.length)return PALETTE[i];return "hsl("+Math.round(i*137.50776405%360)+" 53% 32%)";}
  function nextColor(){const used=new Set(Object.values(store.config.colors));for(let i=0;i<1000;i++){const color=pickColor(i);if(!used.has(color))return color;}return "#245b71";}
  function programColor(p){return store.config.colors[p.id]||pickColor(store.programs.findIndex(x=>x.id===p.id));}
  function renderPrograms(){
    const root=$("programList");root.innerHTML="";
    const select=$("programSelect");const previous=select.value;select.innerHTML='<option value="">اختاري البرنامج...</option>';
    if(!store.programs.length){root.innerHTML='<div class="empty">لا توجد برامج بعد. اضغطي «＋ برنامج» لإنشاء أول برنامج في درايف.</div>';updateState();return;}
    for(const [i,p] of store.programs.entries()){
      const o=document.createElement("option");o.value=p.id;o.textContent=p.name;select.appendChild(o);
      const el=document.createElement("div");el.className="program-card";
      el.innerHTML='<div class="program-icon" style="background:'+esc(programColor(p))+'">▧</div><div class="card-content"><b>'+esc(p.name)+'</b><small>مجلد مستقل في Google Drive</small></div>';
      const actions=document.createElement("div");actions.className="card-buttons";
      actions.append(button("رفع شاهد",()=>{select.value=p.id;page("upload");updateState();loadFiles();}));
      actions.append(button("عرض",()=>window.open(folderUrl(p.id),"_blank","noopener")));
      actions.append(button("QR",()=>openCode(p)));
      actions.append(button("تعديل",()=>openProgramDialog(p)));
      actions.append(button("حذف",()=>deleteProgram(p),"danger"));
      el.appendChild(actions);root.appendChild(el);
    }
    if(store.programs.some(p=>p.id===previous))select.value=previous;
    updateState();
  }
  function openProgramDialog(p){
    if(!store.token||!store.root){msg("يجب ربط Google وإنشاء المجلد أولًا");return;}
    store.pendingEdit=p||null;$("dialogTitle").textContent=p?"تعديل اسم البرنامج":"إضافة برنامج جديد";$("programName").value=p?p.name:"";
    $("programDialog").showModal();$("programName").focus();
  }
  async function saveProgram(){
    const name=$("programName").value.trim();
    if(!name){msg("اكتبي اسم البرنامج");return;}
    busy($("saveProgramBtn"),true);
    try {
      if(store.pendingEdit){
        await drive("/files/"+store.pendingEdit.id+"?fields=id,name",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
        msg("تم تعديل الاسم دون تغيير رمز QR");
      }else{
        if(store.programs.some(p=>p.name===name)){msg("هذا البرنامج موجود بالفعل");return;}
        const f=await createFolder(name,store.root);
        store.config.colors[f.id]=nextColor();
        try{await saveConfig();}catch(e){showError("أُنشئ المجلد ولكن تعذر حفظ لونه: "+e.message);}
        msg("تم إنشاء البرنامج داخل Google Drive");
      }
      $("programDialog").close();await fetchPrograms();
    }catch(e){showError(e);}finally{busy($("saveProgramBtn"),false);}
  }
  async function deleteProgram(p){
    const ok=confirm("حذف برنامج «"+p.name+"»؟\nسيُنقل مجلده وكل الشواهد داخله إلى مهملات Google Drive ويمكن استعادته منها قبل الحذف النهائي.\nلن يتأثر أي مجلد آخر.");
    if(!ok)return;
    const again=prompt("لتأكيد حذف البرنامج اكتبي كلمة: حذف","");
    if(again!=="حذف"){msg("لم يُحذف البرنامج");return;}
    try{
      await drive("/files/"+p.id+"?fields=id,trashed",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({trashed:true})});
      delete store.config.colors[p.id];
      try{await saveConfig();}catch(e){console.warn(e);}
      if($("programSelect").value===p.id){$("programSelect").value="";$("fileList").innerHTML='<div class="empty">اختاري برنامجًا لعرض ملفاته.</div>';}
      await fetchPrograms();msg("تم نقل البرنامج إلى مهملات Drive");
    }catch(e){showError(e);}
  }
  function chooseFiles(list){
    store.chosen=Array.from(list||[]);
    $("chosenFiles").hidden=!store.chosen.length;
    $("chosenFiles").textContent=store.chosen.length?store.chosen.map(f=>f.name+" · "+(f.size/1024/1024).toFixed(2)+" MB").join("\n"):"";
    $("uploadMessage").textContent="";updateState();
  }
  async function uploadChosen(){
    if(!store.rootPublic){msg("يجب تفعيل مشاركة المجلد الرئيسي أولًا");return;}
    const parent=$("programSelect").value;
    if(!parent||!store.programs.some(p=>p.id===parent)){msg("اختاري برنامجًا صحيحًا");return;}
    if(!store.chosen.length){msg("اختاري الملفات");return;}
    const tooBig=store.chosen.find(f=>f.size>35*1024*1024);
    if(tooBig){msg("الملف "+tooBig.name+" أكبر من 35MB. ارفعيه إلى المجلد مباشرة من Google Drive.");return;}
    const accepted=confirm("ستُنشر "+arabic(store.chosen.length)+" ملفات في مجلد متاح لمن يملك الرابط.\nتأكدي من عدم احتواء الملفات على بيانات سرية للطالبات.\nهل تريدين الرفع؟");
    if(!accepted)return;
    store.saving=true;updateState();$("uploadProgress").hidden=false;
    const note=$("evidenceNote").value.trim();
    let successes=0;const errors=[];
    const files=store.chosen.slice();
    try{
      for(let i=0;i<files.length;i++){
        const f=files[i];$("uploadMessage").textContent="جارٍ رفع "+(i+1)+" / "+files.length+" : "+f.name;
        try{
          const safeNote=note.replace(/[\/\\:*?"<>|]/g,"-").slice(0,80);
          const name=safeNote?safeNote+" - "+f.name:f.name;
          await multipartCreate({name,parents:[parent],mimeType:f.type||"application/octet-stream"},f);
          successes++;
        }catch(e){errors.push(f.name+": "+e.message);}
        $("uploadProgressBar").style.width=Math.round((i+1)/files.length*100)+"%";
      }
      if(successes){msg("تم حفظ "+arabic(successes)+" ملفات في Google Drive");
        chooseFiles([]);$("cameraInput").value="";$("filesInput").value="";$("evidenceNote").value="";await loadFiles();}
      if(errors.length){$("uploadMessage").textContent="نجح "+successes+"، وفشل "+errors.length+": "+errors.join(" | ");showError("فشل رفع بعض الملفات، راجعي التفاصيل");}
      else $("uploadMessage").textContent="اكتمل حفظ "+arabic(successes)+" ملفات وتأكدنا من استجابة Google Drive.";
    }catch(e){showError(e);}
    finally{store.saving=false;updateState();setTimeout(()=>{$("uploadProgress").hidden=true;$("uploadProgressBar").style.width="0%";},1700);}
  }
  async function loadFiles(){
    const id=$("programSelect").value;
    const el=$("fileList");
    if(!id||!store.token){el.innerHTML='<div class="empty">اختاري برنامجًا لعرض ملفاته.</div>';return;}
    el.innerHTML='<div class="empty">جارٍ جلب الشواهد من Drive...</div>';
    try{
      const q="'"+id+"' in parents and trashed = false";
      store.files=(await listDrive(q,"id,name,mimeType,webViewLink,createdTime")).sort((a,b)=>String(b.createdTime).localeCompare(String(a.createdTime)));
      el.innerHTML="";
      if(!store.files.length){el.innerHTML='<div class="empty">هذا البرنامج لا يحتوي على شواهد بعد.</div>';return;}
      for(const f of store.files){
        const div=document.createElement("div");div.className="file-card";
        div.innerHTML='<div class="program-icon" style="background:#eef2f6;color:#173653">▤</div><div class="card-content"><b>'+esc(f.name)+'</b><small>'+esc(f.mimeType||"ملف")+'</small></div>';
        const actions=document.createElement("div");actions.className="card-buttons";
        const url=f.webViewLink||"https://drive.google.com/file/d/"+encodeURIComponent(f.id)+"/view";
        actions.append(button("فتح",()=>window.open(url,"_blank","noopener")));
        actions.append(button("مشاركة",()=>shareLink(url,f.name)));
        div.appendChild(actions);el.appendChild(div);
      }
    }catch(e){el.innerHTML='<div class="empty">تعذر تحميل الملفات. تحققي من اتصال Google.</div>';showError(e);}
  }
  function qrAvailable(){if(typeof QRCodeStyling==="undefined"){msg("تعذر تحميل مكتبة QR. تحققي من اتصال الإنترنت ثم حدّثي الصفحة.");return false;}return true;}
  function newQr(url,color,size){
    return new QRCodeStyling({
      width:size,height:size,type:"canvas",data:url,margin:12,
      qrOptions:{errorCorrectionLevel:"H"},
      dotsOptions:{color:color,type:"rounded"},
      cornersSquareOptions:{color:color,type:"extra-rounded"},
      cornersDotOptions:{color:color,type:"dot"},
      backgroundOptions:{color:"#ffffff"},
      image:customIcon(),
      imageOptions:{hideBackgroundDots:true,margin:4,imageSize:.16,crossOrigin:"anonymous"}
    });
  }
  function allCodes(){return store.rootPublic && store.root?[{id:store.root,name:"جميع برامج التوجيه الطلابي",main:true,color:"#111111"}].concat(store.programs.map(p=>({id:p.id,name:p.name,main:false,color:programColor(p)}))):[];}
  function renderCodes(){
    const e=$("codesGrid");e.innerHTML="";
    if(!store.rootPublic||!store.root){e.innerHTML='<div class="empty">اربطي حساب Google وأعدّي المجلد الرئيسي لعرض الأكواد الفعلية.</div>';return;}
    if(!qrAvailable()){e.innerHTML='<div class="empty">مكتبة QR غير متاحة حاليًا.</div>';return;}
    for(const item of allCodes()){
      const card=document.createElement("div");card.className="qr-card"+(item.main?" main":"");
      const qrSlot=document.createElement("div");qrSlot.className="qr";
      const title=document.createElement("b");title.textContent=item.name;
      const hint=document.createElement("small");hint.className="muted";hint.textContent=item.main?"الملف الرئيسي — رمز أسود":"اضغطي لتكبير الرمز";
      const share=button("مشاركة الرابط",ev=>{ev.stopPropagation();shareLink(folderUrl(item.id),item.name);});
      card.append(title,qrSlot,hint,share);
      const size=item.main?235:174;
      try{newQr(folderUrl(item.id),item.color,size).append(qrSlot);}catch(err){showError(err);}
      card.addEventListener("click",()=>openCode(item));
      e.appendChild(card);
    }
    buildPrintSheet();
  }
  function buildPrintSheet(){
    const el=$("printArea");el.innerHTML="";
    if(!store.rootPublic||!store.root||!qrAvailable())return;
    const codes=allCodes(), main=codes.shift();
    let pageNum=0;
    while(pageNum===0||codes.length){
      const pageEl=document.createElement("section");pageEl.className="print-page";
      const heading=document.createElement("h1");heading.className="print-title";heading.textContent="شواهد برامج التوجيه الطلابي — فايزة النصيري";pageEl.appendChild(heading);
      if(pageNum===0){
        const mainEl=document.createElement("div");mainEl.className="print-main";
        const qr=document.createElement("div");newQr(folderUrl(main.id),main.color,165).append(qr);
        const title=document.createElement("b");title.textContent="الملف الرئيسي — جميع البرامج";
        mainEl.append(qr,title);pageEl.appendChild(mainEl);
      }
      const grid=document.createElement("div");grid.className="print-grid";
      const current=codes.splice(0,pageNum===0?9:12);
      for(const c of current){
        const cell=document.createElement("div");cell.className="print-cell";
        const box=document.createElement("div");newQr(folderUrl(c.id),c.color,140).append(box);
        const text=document.createElement("b");text.textContent=c.name;
        cell.append(box,text);grid.appendChild(cell);
      }
      pageEl.appendChild(grid);
      const note=document.createElement("div");note.className="print-note";note.textContent="يمكن مسح أي رمز لفتح مجلد الشواهد على Google Drive — للمشاهدة فقط";
      pageEl.appendChild(note);el.appendChild(pageEl);pageNum++;
    }
  }
  function openCode(p){
    if(!p)return;
    const code={id:p.id,name:p.name||"الملف الرئيسي",color:p.color||(p.id===store.root?"#111111":programColor(p))};
    store.selectedCode=code;
    if(!qrAvailable())return;
    $("qrModalTitle").textContent=code.name;
    $("qrLarge").innerHTML="";
    store.qrLarge=newQr(folderUrl(code.id),code.color,310);
    store.qrLarge.append($("qrLarge"));
    $("qrDialog").showModal();
  }
  async function shareQr(){
    if(!store.qrLarge||!store.selectedCode)return;
    try{
      const blob=await store.qrLarge.getRawData("png");
      if(!blob)throw Error("تعذّر تجهيز صورة الرمز");
      const file=new File([blob],"QR-"+store.selectedCode.name.replace(/[\/\\:*?"<>|]/g,"")+".png",{type:"image/png"});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:store.selectedCode.name,text:"رمز شواهد برنامج التوجيه الطلابي"});
      }else{
        const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);msg("تم تجهيز صورة الرمز للتحميل");
      }
    }catch(e){if(e.name!=="AbortError")showError(e);}
  }
  async function processLogo(f){
    if(!f)return;
    if(!f.type.startsWith("image/"))throw Error("يُسمح بملف صورة للشعار فقط");
    if(f.size>8*1024*1024)throw Error("اختاري صورة شعار أصغر من 8MB");
    const data=await new Promise((ok,bad)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=()=>bad(Error("تعذر قراءة الصورة"));reader.readAsDataURL(f);});
    const pic=new Image();pic.src=data;await pic.decode();
    const canvas=document.createElement("canvas");canvas.width=192;canvas.height=192;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#10243c";ctx.fillRect(0,0,192,192);
    const scale=Math.min(176/pic.width,176/pic.height);
    ctx.drawImage(pic,(192-pic.width*scale)/2,(192-pic.height*scale)/2,pic.width*scale,pic.height*scale);
    store.config.logo=canvas.toDataURL("image/png");
    await saveConfig();$("logoPreview").src=customIcon();renderCodes();msg("تم تغيير الشعار ومزامنته في Google Drive");
  }
  on("startButton","click",()=>{if(!store.token)login();else setupRoot();});
  on("accountButton","click",()=>store.token?page("settings"):login());
  on("saveClientId","click",()=>{
    const id=$("clientId").value.trim();
    if(!/^[0-9]+-[\w-]+\.apps\.googleusercontent\.com$/.test(id)){msg("صيغة Google Client ID غير صحيحة");return;}
    localStorage.setItem("sge_google_client_id",id);msg("حُفظ Client ID على هذا الجهاز. شاركي رابط الإعداد مع زوجتك.");updateState();
  });
  on("connectBtn","click",login);
  on("disconnectBtn","click",()=>{
    if(store.token && window.google && google.accounts && google.accounts.oauth2)google.accounts.oauth2.revoke(store.token,()=>{});
    store.token="";store.root="";store.programs=[];store.rootPublic=false;store.configId="";store.config={colors:{},logo:""};store.account="";
    $("logoPreview").src=customIcon();renderPrograms();renderCodes();updateState();msg("تم فصل الحساب على هذا الجهاز");
  });
  on("setupRootBtn","click",setupRoot);
  on("openRootBtn","click",()=>{if(!store.root){msg("أنشئي المجلد أولًا");return;}window.open(folderUrl(store.root),"_blank","noopener");});
  on("newProgramBtn","click",()=>openProgramDialog());
  on("saveProgramBtn","click",saveProgram);
  on("programName","keydown",e=>{if(e.key==="Enter"){e.preventDefault();saveProgram();}});
  on("cameraButton","click",()=>{if(!$("programSelect").value){msg("اختاري البرنامج أولًا");return;}$("cameraInput").click();});
  on("filesButton","click",()=>{if(!$("programSelect").value){msg("اختاري البرنامج أولًا");return;}$("filesInput").click();});
  on("cameraInput","change",e=>chooseFiles(e.target.files));
  on("filesInput","change",e=>chooseFiles(e.target.files));
  on("programSelect","change",()=>{updateState();loadFiles();});
  on("uploadButton","click",uploadChosen);
  on("reloadFilesBtn","click",loadFiles);
  on("printButton","click",()=>{if(!store.rootPublic)return;if(!qrAvailable())return;buildPrintSheet();setTimeout(()=>window.print(),700);});
  on("shareAllButton","click",()=>shareLink(folderUrl(store.root),"جميع شواهد برامج التوجيه الطلابي"));
  on("shareQrImage","click",shareQr);
  on("shareQrLink","click",()=>{if(store.selectedCode)shareLink(folderUrl(store.selectedCode.id),store.selectedCode.name);});
  on("closeQrDialog","click",()=>$("qrDialog").close());
  on("changeLogoBtn","click",()=>{if(!store.root){msg("أعدي مجلد Google Drive أولًا");return;}$("logoFileInput").click();});
  on("logoFileInput","change",async e=>{try{await processLogo(e.target.files[0]);}catch(err){showError(err);}e.target.value="";});
  on("resetLogoBtn","click",async()=>{if(!store.root){msg("أعدي المجلد أولًا");return;}try{store.config.logo="";await saveConfig();$("logoPreview").src=customIcon();renderCodes();msg("تمت استعادة الشعار الافتراضي");}catch(e){showError(e);}});
  updateState();
})();