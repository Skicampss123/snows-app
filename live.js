/* Snow's – rigtig login og platform via Supabase.
   Slås fra med ?demo i adressen (så virker den gamle prototype med demo-logins). */
(function(){
  if(/[?&]demo/.test(location.search)||!window.supabase||typeof S==="undefined")return;
  const URL_="https://ydodczdzuffydnmnxupi.supabase.co",KEY="sb_publishable_BmFLXIf0FV3AmHp_nWucLg_owNzIcpa";
  const sb=window.supabase.createClient(URL_,KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  window.sb=sb;S.live=true;

  // Ingen demo-session i live-tilstand
  try{localStorage.removeItem("snows_session")}catch(e){}
  S.user=null;S.camp=null;S.role="Deltager";S.auth="signup";S.vf=null;S.pc=[];
  saveSess=function(){};
  // Rigtige camps starter helt tomme
  const DKEYS=["instr","staff","skilist","shops","prog","ski","ws","ev","pending","badLog","news","parts","orgs","ret","log","grp","contact","ih","prof","sted","lvls","wf","sf"];
  const ADMIN_EMAIL="skicamppppp@voresapp.dk"; // rigtig admin-konto: kodeordet står kun i Supabase, aldrig her
  function emptyState(){
    S.instr=[];S.staff=[];S.skilist=[];S.shops=[];S.prog=[];S.ski=[];S.ws=[];S.ev=[];S.pending=[];S.badLog=[];S.news=[];S.parts=[];S.orgs=[];S.ret={};S.log=[];S.grp=[];
    S.contact={n:"",p:"",e:"",t:""};S.ih={mp:"",pax:[],wait:[]};S.prof={name:"",e:"",boot:"",z:"",camp:""};S.sted={pl:"",lift:"",mp:""};
    S.lvls=["Alle","Nybegynder","Let øvet","Øvet","Erfaren","Pro"];S.sf={l:"",r:"",b:"",lv:""};S.placeOk=false;
  }
  emptyState();
  demoBar=function(){return ""};

  const errm=e=>(e&&e.message)||"Noget gik galt. Prøv igen.";
  const okMail=e=>/^\S+@\S+\.\S+$/.test(e);
  const fail=m=>{S.serr=m;render()};

  // Fjern prototype-hjælp fra login og kode-skærm
  const VER="v8 · 15. nov. 23.30";const _av=authView;authView=function(){return _av().replace(/<p class="mut" style="margin-top:14px">Prototype[\s\S]*?<\/p>/,"")+`<div class="mut" style="font-size:12px;margin-top:10px">Version ${VER}</div>`};
  const _vv=verifyView;verifyView=function(){return _vv().replace(/Bekræft din e-mail/,S.vf&&S.vf.pw?'Skriv dit kodeord':'Bekræft din e-mail').replace(/Vi har sendt en kode til/,S.vf&&S.vf.pw?'Admin-login for':'Vi har sendt en kode til').replace(/maxlength="6"/,S.vf&&S.vf.pw?'maxlength="128" type="password" autocomplete="current-password"':'maxlength="8"').replace(/<div class="card" style="margin-top:14px">[\s\S]*$/,"")};

  async function sendOtp(e){
    const r=await sb.auth.signInWithOtp({email:e,options:{shouldCreateUser:true}});
    if(r.error){
      if(r.error.status==429||/rate|seconds/i.test(r.error.message||""))return "Vent lidt, før du sender en ny kode.";
      return "Koden kunne ikke sendes. Tjek e-mailen, og prøv igen om lidt.";
    }
    return "";
  }

  loginGo=async function(){
    const e=($("#li_e").value||"").trim().toLowerCase();
    if(!okMail(e)){fail("Skriv en gyldig e-mail.");return}
    if(e==ADMIN_EMAIL){S.vf={mode:"login",e,sent:Date.now(),tries:0,pw:1};S.auth="verify";S.serr="";render();return}
    const m=await sendOtp(e);if(m){fail(m);return}
    S.vf={mode:"login",e,sent:Date.now(),tries:0,live:1};S.auth="verify";S.serr="";render();
  };

  signUp=async function(){
    const n=$("#su_n").value.trim(),e=$("#su_e").value.trim().toLowerCase(),c=$("#su_c").value.trim().toUpperCase();
    if(n.length<2||!okMail(e)){fail("Skriv dit navn og en gyldig e-mail.");return}
    if(!/^[A-Z0-9]{4,12}$/.test(c)){fail("Koden passer ikke. Tjek campkoden.");return}
    const m=await sendOtp(e);if(m){fail(m);return}
    S.vf={mode:"signup",n,e,c,sent:Date.now(),tries:0,live:1};S.auth="verify";S.serr="";render();
  };

  vfResend=async function(){
    const v=S.vf,w=30-Math.floor((Date.now()-v.sent)/1000);
    if(w>0){fail("Vent "+w+" sekunder, før du kan sende en ny kode.");return}
    if(v.pw){toast("Skriv dit kodeord");return}
    const m=await sendOtp(v.e);if(m){fail(m);return}
    v.sent=Date.now();v.tries=0;S.serr="";toast("Ny kode sendt til "+v.e);
  };

  verifyGo=async function(){
    const v=S.vf,c=($("#vf_c").value||"").trim();
    if(v.tries>=5){fail("For mange forkerte forsøg. Send en ny kode.");return}
    if(v.pw){
      if(!c){fail("Skriv dit kodeord.");return}
      const r=await sb.auth.signInWithPassword({email:v.e,password:c});
      if(r.error||!r.data||!r.data.session){v.tries++;fail(v.tries>=5?"For mange forkerte forsøg. Vent lidt og prøv igen.":"Kodeordet er forkert. Du har "+(5-v.tries)+" forsøg tilbage.");return}
      await afterLogin(v);return;
    }
    if(!/^\d{6,8}$/.test(c)){fail("Skriv koden fra mailen.");return}
    const r=await sb.auth.verifyOtp({email:v.e,token:c,type:"email"});
    if(r.error||!r.data||!r.data.session){v.tries++;fail(v.tries>=5?"For mange forkerte forsøg. Send en ny kode.":"Koden er forkert eller udløbet. Du har "+(5-v.tries)+" forsøg tilbage.");return}
    await afterLogin(v);
  };

  async function getProfile(uid){
    const r=await sb.from("profiles").select("id,role,name,email,boot_mm,z_value,shop_id,camp_id,camps(name,code),shops(name)").eq("id",uid).maybeSingle();
    return r.data||null;
  }

  async function afterLogin(v){
    v=v||{};
    try{
      const u=(await sb.auth.getUser()).data.user;
      if(!u){S.user=null;S.auth="login";render();return}
      const pl=await sb.rpc("is_platform");
      if(pl.error){await sb.auth.signOut();S.user=null;S.vf=null;S.auth="login";fail("Databasen mangler Platform-funktionen ("+errm(pl.error)+"). Kør 002_platform.sql i Supabase.");return}
      if(pl.data===true){
        S.user=1;S.role="Platform";S.camp=null;S.tab="plat";S.vf=null;S.serr="";S.setup=false;
        await loadPlatform();return;
      }
      let pr=await getProfile(u.id);
      if(!pr){
        const j=await sb.rpc("join_camp",{p_name:v.n||null,p_code:v.c||null});
        if(j.error){
          await sb.auth.signOut();S.user=null;S.vf=null;
          if(v.mode=="signup"){S.auth="signup";S.serr=/Koden passer/.test(j.error.message)?"Koden passer ikke. Tjek campkoden.":errm(j.error)}
          else{S.auth="login";S.serr="Der er ingen konto med den e-mail. Opret dig med campkoden."}
          render();return;
        }
        pr=await getProfile(u.id);
      }
      if(!pr){await sb.auth.signOut();S.user=null;S.vf=null;S.auth="login";fail("Kontoen kunne ikke åbnes. Prøv igen.");return}
      S.prof={name:pr.name,e:pr.email,boot:pr.boot_mm?String(pr.boot_mm):"",z:pr.z_value?String(pr.z_value):"",camp:pr.camps&&pr.camps.name};
      S.liveUid=u.id;S.liveCampId=pr.camp_id;
      if(pr.camps&&pr.camps.code){CODES[pr.camps.code]=pr.camps.name;CAMPN=pr.camps.name}
      enter({role:pr.role,camp:(pr.camps&&pr.camps.name)||"Camp",who:pr.name,shop:pr.shops&&pr.shops.name});
      await loadCampData();
      if(isShop()||isOrg())allocSki(200);
      S.vf=null;S.auth="login";S.modal=null;render();
    }catch(e){S.user=null;S.vf=null;S.auth="login";fail(errm(e))}
  }

  const _lo=logout;
  logout=async function(){try{if(S.sup)await sb.rpc("platform_leave");await sb.auth.signOut()}catch(e){}S.pc=[];S.sup=false;S.liveUid=null;emptyState();S.liveCampId=null;_lo()};

  // Gem støvle og Z i databasen
  async function saveProfDb(){
    if(!S.liveUid)return;
    const b=S.prof.boot?+String(S.prof.boot).replace(",","."):null,z=S.prof.z?+String(S.prof.z).replace(",","."):null;
    const r=await sb.from("profiles").update({boot_mm:b,z_value:z}).eq("id",S.liveUid);
    if(r.error)toast("Kunne ikke gemme: "+errm(r.error));
  }
  const _sp=saveProf;saveProf=function(){_sp();saveProfDb()};
  const _ss=saveSetup;saveSetup=function(){_ss();saveProfDb()};

  // Slet min konto
  window.delAcc=async function(){
    if(!confirm("Slet din konto og alle dine data? Det kan ikke fortrydes."))return;
    const r=await sb.rpc("delete_my_account");
    if(r.error){toast("Kontoen kunne ikke slettes: "+errm(r.error));return}
    try{await sb.auth.signOut()}catch(e){}
    S.pc=[];_lo();
  };

  // ───── Platform ─────
  async function loadPlatform(){
    const r=await sb.rpc("platform_camps");
    S.pc=r.data||[];if(r.error)S.perr=errm(r.error);
    render();
  }
  const esc=x=>String(x==null?"":x).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function platView(){
    const err=S.perr?`<div class="mut" style="color:var(--acc)">${esc(S.perr)}</div>`:"",ok=S.pok?`<div class="mut" style="color:var(--ok)">${esc(S.pok)}</div>`:"";
    const pick=S.supPick?`<div class="card"><h3>Åbn som ${esc(S.supPick.role)}</h3><select id="sp_v">${S.supPick.opts.map(o=>`<option value="${esc(o.v)}">${esc(o.n)}</option>`).join("")}</select><button class="btn" onclick="platPick()">Åbn</button><button class="btn alt" onclick="S.supPick=null;render()">Annullér</button></div>`:"";
    return `<h2>Platform</h2>${pick}<div class="mut">Her opretter du camps og inviterer arrangører. Arrangøren logger ind med den e-mail, du skriver.</div>
<div class="card"><h3>Opret camp</h3><input id="pc_n" placeholder="Campens navn"><input id="pc_c" placeholder="Camp-kode (4-12 bogstaver/tal)" autocapitalize="characters"><div class="mut">Camp slutter</div><input id="pc_d" type="date"><input id="pc_e" type="email" placeholder="Arrangørens e-mail">${err}${ok}<button class="btn" onclick="platCreate()">Opret camp og inviter arrangør</button></div>
<h2>Camps (${S.pc.length})</h2>${S.pc.length?S.pc.map(c=>`<div class="card"><h3>${esc(c.name)}</h3><div class="mut">Kode: ${esc(c.code)} · ${c.participants} deltagere · slutter ${esc(c.end_date||"–")}</div><div class="mut">${c.organizer_joined?"Arrangøren er oprettet":"Arrangøren har ikke logget ind endnu"}</div>${c.organizer_joined?"":`<input id="po_${c.id}" type="email" placeholder="Ny arrangør-e-mail"><button class="btn alt" onclick="platOrg('${c.id}')">Skift arrangør</button>`}<div class="mut" style="margin-top:8px">Åbn campen og arbejd som:</div><div style="display:flex;gap:6px;flex-wrap:wrap">${["Arrangør","Skiforretning","Instruktør","Deltager"].map(r=>`<button class="chip" onclick="platOpen('${c.id}','${r}')">${r}</button>`).join("")}</div><button class="btn alt" onclick="platDel('${c.id}')">Slet camp</button></div>`).join(""):`<div class="mut">Ingen camps endnu.</div>`}
<button class="btn alt" onclick="platRefresh()">Opdatér</button><button class="btn alt" onclick="logout()">Log ud</button>`;
  }
  const _vw=view;view=function(){return S.live&&S.role=="Platform"&&S.tab=="plat"?platView():_vw()};
  // Åbn en rigtig camp i en rolle (platformens support-adgang, logges i databasen)
  async function supOpen(cid,role,shopId,email){
    const r=await sb.rpc("platform_enter",{p_camp:cid,p_role:role,p_shop:shopId||null,p_email:email||null});
    if(r.error){S.perr=errm(r.error);S.sup=false;S.role="Platform";S.tab="plat";render();return false}
    const c=S.pc.find(x=>x.id==cid)||{};
    emptyState();S.liveCampId=cid;S.liveUid=((await sb.auth.getUser()).data.user||{}).id||"admin";S.sup=true;S.supInfo={cid,role,shopId,email};
    S.camp=c.name||"Camp";S.role=role;S.tab="";S.who=email||"";S.prof.e=email||"";S.setup=false;
    await loadCampData();
    const sh=shopId&&S.shops.find(z=>z._id==shopId);if(sh)S.shop=sh.n;
    if(role=="Instruktør"){const i=S.instr.find(z=>(z.e||"").toLowerCase()==(email||"").toLowerCase());if(i)S.who=i.n}
    render();return true;
  }
  window.platOpen=async function(cid,role){
    S.perr="";S.pok="";
    if(role=="Skiforretning"||role=="Instruktør"){
      S.liveCampId=cid;emptyState();S.liveCampId=cid;S.role="Arrangør";
      const sup=await sb.rpc("platform_enter",{p_camp:cid,p_role:"Arrangør"});
      if(sup.error){S.perr=errm(sup.error);render();return}
      await loadCampData();
      const opts=role=="Skiforretning"?S.shops.map(z=>({v:z._id,n:z.n})):S.instr.filter(z=>z.e).map(z=>({v:z.e,n:z.n}));
      S.supPick={cid,role,opts};S.role="Platform";S.tab="plat";S.sup=false;
      if(!opts.length){S.supPick=null;S.perr=role=="Skiforretning"?"Campen har ingen butikker endnu.":"Campen har ingen instruktører med e-mail endnu."}
      await sb.rpc("platform_leave");emptyState();S.liveCampId=null;render();return;
    }
    await supOpen(cid,role);
  };
  window.platPick=async function(){
    const p=S.supPick,v=($("#sp_v")||{}).value;if(!p||!v)return;S.supPick=null;
    if(p.role=="Skiforretning")await supOpen(p.cid,p.role,v);else await supOpen(p.cid,p.role,null,v);
  };
  supBack=async function(){
    await sb.rpc("platform_leave");S.sup=false;S.supInfo=null;S.liveUid=null;emptyState();S.liveCampId=null;S.role="Platform";S.camp=null;S.tab="plat";await loadPlatform();
  };
  supBar=function(){
    const i=S.supInfo||{};
    return `<div class="sup"><span>Platform: ${esc(S.camp)} som ${esc(i.role)}${i.email?" ("+esc(S.who||i.email)+")":""}${i.shopId&&S.shop?" ("+esc(S.shop)+")":""}</span><button class="chip" onclick="supBack()">← Platform</button></div>`;
  };
  window.platRefresh=async function(){S.perr="";S.pok="";await loadPlatform()};
  window.platCreate=async function(){
    const n=$("#pc_n").value.trim(),c=$("#pc_c").value.trim().toUpperCase(),d=$("#pc_d").value||null,e=$("#pc_e").value.trim().toLowerCase();
    S.pok="";S.perr="";
    if(!n){S.perr="Skriv et navn til campen.";render();return}
    if(!/^[A-Z0-9]{4,12}$/.test(c)){S.perr="Koden skal være 4-12 bogstaver eller tal.";render();return}
    if(!okMail(e)){S.perr="Skriv en gyldig e-mail.";render();return}
    const r=await sb.rpc("platform_create_camp",{p_name:n,p_code:c,p_end:d,p_org_email:e});
    if(r.error){S.perr=/duplicate|unique/i.test(r.error.message)?"Der findes allerede en camp med den kode.":errm(r.error);render();return}
    S.pok="Campen er oprettet. "+e+" kan nu logge ind i appen med sin e-mail og får arrangør-adgang.";await loadPlatform();
  };
  window.platOrg=async function(id){
    const e=($("#po_"+id).value||"").trim().toLowerCase();S.pok="";S.perr="";
    if(!okMail(e)){S.perr="Skriv en gyldig e-mail.";render();return}
    const r=await sb.rpc("platform_set_organizer",{p_camp:id,p_org_email:e});
    if(r.error){S.perr=errm(r.error);render();return}
    S.pok="Arrangøren er skiftet til "+e+".";await loadPlatform();
  };
  window.platDel=async function(id){
    if(!confirm("Slet campen og alle dens data? Det kan ikke fortrydes."))return;
    const r=await sb.rpc("platform_delete_camp",{p_camp:id});
    S.pok="";S.perr=r.error?errm(r.error):"";await loadPlatform();
  };


  // ───── Data: gem det der indtastes, og hent det til alle i campen ─────
  const DAYSL=["Man","Tirs","Ons","Tors","Fre","Lør","Søn"];
  const uid_=()=>(crypto.randomUUID?crypto.randomUUID():"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c=="x"?r:(r&3|8)).toString(16)}));
  const idOf=x=>x._id||(x._id=uid_());
  const CID=()=>S.liveCampId;
  const hhmm=t=>t?String(t).slice(0,5):"";
  const shopIdByName=n=>{const x=S.shops.find(z=>z.n==n);return x?idOf(x):null};
  const emailOfIns=n=>{const i=S.instr.find(z=>z.n==n);if(i&&i.e)return i.e.toLowerCase();return(S.role=="Instruktør"&&n==S.who&&S.prof.e)?S.prof.e.toLowerCase():null};
  const isOrg=()=>S.role=="Arrangør",isShop=()=>S.role=="Skiforretning",isIns=()=>S.role=="Instruktør";
  const wsRow=(x,kind)=>{const p=(x.tm||"").split(" ");return {id:idOf(x),camp_id:CID(),title:x.t,kind,level:x.lv||null,day:p[0],start_time:p[1]||null,duration_min:x.dur||120,max_seats:x.max||10,instructor_name:x.ins||null,instructor_email:x.ins?emailOfIns(x.ins):null,recommended_ski:x.sk||null,group_code:x.code||null,meeting_point:x.mp||null,deleted:!!x.gone}};
  const skiStatus=x=>x.bad=="Skadet"?"skadet":x.bad=="Mistet"?"mistet":x.st=="ude"?"ude":"inde";
  // Hver samling: hvem må skrive, hvordan rækker bygges, og hvordan de læses tilbage
  const SPEC=[
    {n:"levels",tbl:"levels",key:"name",conflict:"camp_id,name",can:()=>isOrg(),
      rows:()=>S.lvls.slice(1).map((n,i)=>({camp_id:CID(),name:n,sort:i}))},
    {n:"shops",tbl:"shops",key:"id",can:()=>isOrg()||isShop(),updateOnly:()=>isShop(),
      rows:()=>S.shops.filter(x=>!isShop()||x.n==S.shop).map(x=>isShop()?{id:idOf(x),return_time:S.ret[x.n]||null}:{id:idOf(x),camp_id:CID(),name:x.n,brands:(x.brands&&x.brands.length)?x.brands:[x.n],return_time:S.ret[x.n]||null})},
    {n:"shopInv",tbl:"invites",key:"email",conflict:"camp_id,email",can:()=>isOrg(),
      rows:()=>S.shops.filter(x=>x.e).map(x=>({camp_id:CID(),email:x.e.toLowerCase(),role:"Skiforretning",name:x.n,shop_id:idOf(x)}))},
    {n:"insInv",tbl:"invites",key:"email",conflict:"camp_id,email",can:()=>isOrg(),
      rows:()=>S.instr.filter(x=>x.e).map(x=>({camp_id:CID(),email:x.e.toLowerCase(),role:"Instruktør",name:x.n,shop_id:null}))},
    {n:"prog",tbl:"program_items",key:"id",can:()=>isOrg(),
      rows:()=>S.prog.map(x=>({id:idOf(x),camp_id:CID(),day:x.d,time:x.tm,time_to:x.to||null,title:x.t,place:x.pl||null}))},
    {n:"news",tbl:"news",key:"id",can:()=>isOrg(),
      rows:()=>S.news.map(x=>({id:idOf(x),camp_id:CID(),title:x.t,body:x.x||null,label:x.d||null}))},
    {n:"ws",tbl:"workshops",key:"id",can:()=>isOrg()||isIns(),
      rows:()=>S.ws.filter(x=>x.tm&&(!isIns()||x.ins==S.who)).map(x=>wsRow(x,"Workshop"))},
    {n:"ev",tbl:"workshops",key:"id",can:()=>isOrg(),
      rows:()=>S.ev.map(x=>({...wsRow({t:x.t,tm:x.tm,max:500},"Event"),id:idOf(x)}))},
    {n:"skis",tbl:"skis",key:"id",can:()=>isOrg()||isShop(),
      rows:()=>S.skilist.filter(x=>!x.gone&&x.id&&(!isShop()||x.sh==S.shop)).map(x=>{const sid=shopIdByName(x.sh);return sid?{id:idOf(x),camp_id:CID(),code:x.id,shop_id:sid,brand:x.br,model:x.m,length_cm:+x.l,radius_m:+x.r,width_mm:+x.b,level:x.lv||null,status:skiStatus(x),note:x.badNote||null}:null}).filter(Boolean)}
  ];
  let LAST={},META_LAST="",syncT=null,syncBusy=false,errShown=0,backoff=0;
  const rowJson=r=>JSON.stringify(r);
  function baseline(){
    LAST={};SPEC.forEach(sp=>{if(!sp.can())return;const m=new Map();sp.rows().forEach(r=>m.set(r[sp.key],rowJson(r)));LAST[sp.n]=m});
    META_LAST=isOrg()?JSON.stringify([S.contact,S.sted]):"";
  }
  async function syncNow(){
    if(!S.liveUid||!S.liveCampId||syncBusy)return;
    if(Date.now()<backoff)return;
    syncBusy=true;
    try{
      for(const sp of SPEC){
        if(!sp.can())continue;
        const cur=sp.rows(),prev=LAST[sp.n]||new Map(),next=new Map();
        cur.forEach(r=>next.set(r[sp.key],rowJson(r)));
        const ch=cur.filter(r=>prev.get(r[sp.key])!==next.get(r[sp.key]));
        const gone=[...prev.keys()].filter(k=>!next.has(k));
        if(ch.length){
          if(sp.updateOnly&&sp.updateOnly()){
            for(const r of ch){const {id,...rest}=r;const q=await sb.from(sp.tbl).update(rest).eq("id",id);if(q.error)throw q.error}
          }else{
            const q=await sb.from(sp.tbl).upsert(ch,sp.conflict?{onConflict:sp.conflict}:undefined);if(q.error)throw q.error;
          }
        }
        if(gone.length){
          let q=sb.from(sp.tbl).delete().in(sp.key,gone);if(sp.tbl=="invites")q=q.eq("camp_id",CID());
          const d=await q;if(d.error)throw d.error;
        }
        LAST[sp.n]=next;
      }
      if(isOrg()){
        const mj=JSON.stringify([S.contact,S.sted]);
        if(mj!==META_LAST){const q=await sb.from("camps").update({contact:S.contact,info:S.sted}).eq("id",CID());if(q.error)throw q.error;META_LAST=mj}
      }
      backoff=0;
      if(S.skiPool&&S.skiPool.length<60&&(isShop()||isOrg()))allocSki(200);
    }catch(e){
      backoff=Date.now()+15000;
      if(Date.now()-errShown>60000){errShown=Date.now();S.toast="Det du har skrevet er ikke gemt endnu: "+errm(e)+" Vi prøver igen.";setTimeout(render,0)}
    }finally{syncBusy=false}
  }
  function scheduleSync(){
    if(!S.liveUid||!S.liveCampId)return;
    clearTimeout(syncT);syncT=setTimeout(syncNow,900);
  }
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState=="hidden"){clearTimeout(syncT);backoff=0;syncNow()}else if(S.liveUid&&!S.modal&&!isOrg())loadCampData(true)});
  window.addEventListener("pagehide",()=>{backoff=0;syncNow()});
  const _r2=render;render=function(){_r2();scheduleSync()};

  // Unikke ski-numre: reserver en blok fra databasen
  async function allocSki(n){
    if(S.allocBusy)return;S.allocBusy=true;
    try{const r=await sb.rpc("allocate_ski_codes",{p_n:n});if(!r.error&&typeof r.data=="number"){S.skiPool=(S.skiPool||[]).concat(Array.from({length:n},(_,i)=>r.data+i))}}finally{S.allocBusy=false}
  }
  nextSkiId=function(){
    if(S.skiPool&&S.skiPool.length)return "SK-"+String(S.skiPool.shift()).padStart(3,"0");
    return "SK-X"+Math.floor(10000+Math.random()*89999);
  };

  // Hent campens indhold
  async function loadCampData(quiet){
    const cid=S.liveCampId;if(!cid)return;
    const [camp,lv,sh,pr,nw,ws,sk,inv]=await Promise.all([
      sb.from("camps").select("name,code,contact,info").eq("id",cid).maybeSingle(),
      sb.from("levels").select("name,sort").eq("camp_id",cid).order("sort"),
      sb.from("shops").select("id,name,brands,return_time").eq("camp_id",cid).order("name"),
      sb.from("program_items").select("*").eq("camp_id",cid),
      sb.from("news").select("*").eq("camp_id",cid).order("created_at",{ascending:false}),
      sb.from("workshops").select("*").eq("camp_id",cid).eq("deleted",false),
      sb.from("skis").select("*").eq("camp_id",cid).order("code"),
      isOrg()?sb.from("invites").select("email,role,name,shop_id").eq("camp_id",cid):Promise.resolve({data:[]})
    ]);
    const bad=[camp,lv,sh,pr,nw,ws,sk,inv].find(x=>x.error);
    if(bad){if(!quiet)S.toast="Campens indhold kunne ikke hentes: "+errm(bad.error);return}
    if(camp.data){S.contact=Object.assign({n:"",p:"",e:"",t:""},camp.data.contact||{});S.sted=Object.assign({pl:"",lift:"",mp:""},camp.data.info||{});S.placeOk=!!(S.sted.pl||S.sted.lift||S.sted.mp)}
    const DEF=["Nybegynder","Let øvet","Øvet","Erfaren","Pro"];
    S.lvls=["Alle",...((lv.data&&lv.data.length)?lv.data.map(x=>x.name):DEF)];
    S.shops=(sh.data||[]).map(x=>({_id:x.id,n:x.name,c:"",e:((inv.data||[]).find(i=>i.shop_id==x.id)||{}).email||"",brands:(x.brands&&x.brands.length)?x.brands:undefined}));
    S.ret={};(sh.data||[]).forEach(x=>{if(x.return_time)S.ret[x.name]=hhmm(x.return_time)});
    S.instr=(inv.data||[]).filter(i=>i.role=="Instruktør").map(i=>({n:i.name||i.email,c:"",e:i.email}));
    S.prog=(pr.data||[]).map(x=>({_id:x.id,d:x.day,tm:hhmm(x.time),to:x.time_to?hhmm(x.time_to):undefined,t:x.title,pl:x.place||""}));
    S.news=(nw.data||[]).map(x=>({_id:x.id,t:x.title,x:x.body||"",d:x.label||""}));
    const old=new Map((S.ws||[]).map(w=>[w._id,w]));
    const wl=(ws.data||[]).filter(x=>x.kind!="Event"&&x.day);
    S.ws=wl.map((x,i)=>{const o=old.get(x.id)||{};return {...o,id:i+1,_id:x.id,t:x.title,lv:x.level||"",tm:x.day+" "+hhmm(x.start_time),dur:x.duration_min,max:x.max_seats,ins:x.instructor_name||"",sk:x.recommended_ski||"",code:x.group_code||undefined,mp:x.meeting_point||"Se programmet",n:o.n||0,en:o.en||0,fav:o.fav||0,pax:o.pax||[],wait:o.wait||[],ro:o.ro||[]}});
    S.ev=(ws.data||[]).filter(x=>x.kind=="Event"&&x.day).map(x=>({_id:x.id,t:x.title,tm:x.day+" "+hhmm(x.start_time)}));
    const shopName=id=>{const z=S.shops.find(q=>q._id==id);return z?z.n:""};
    S.skilist=(sk.data||[]).map(x=>({_id:x.id,id:x.code,sh:shopName(x.shop_id),br:x.brand,m:x.model,l:String(x.length_cm),r:String(x.radius_m),b:String(x.width_mm),lv:x.level||"",st:x.status=="ude"?"ude":"inde",bad:x.status=="skadet"?"Skadet":x.status=="mistet"?"Mistet":null,badNote:x.note||""}));
    baseline();
    if(isOrg()&&!(lv.data&&lv.data.length))LAST.levels=new Map();
  }

  // Campens navn og kode gemmes også i databasen
  const _sn=saveName;saveName=async function(){
    if(!S.live){_sn();return}
    const o=S.camp,oc=Object.assign({},CODES);_sn();
    if(S.camp!=o){const r=await sb.from("camps").update({name:S.camp}).eq("id",CID());if(r.error){S.camp=o;Object.keys(CODES).forEach(k=>delete CODES[k]);Object.assign(CODES,oc);CAMPN=o;toast("Navnet kunne ikke gemmes: "+errm(r.error))}}
  };
  const _sc=saveCode;saveCode=async function(){
    if(!S.live){_sc();return}
    const v=($("#cc2")||{value:""}).value.trim().toUpperCase(),oc=Object.assign({},CODES);_sc();
    if(CODES[v]===S.camp&&!oc[v]){const r=await sb.from("camps").update({code:v}).eq("id",CID());if(r.error){Object.keys(CODES).forEach(k=>delete CODES[k]);Object.assign(CODES,oc);toast(/duplicate|unique/i.test(r.error.message)?"Koden bruges af en anden camp. Vælg en anden.":"Koden kunne ikke gemmes: "+errm(r.error))}}
  };

  // Genskab login ved genindlæsning
  sb.auth.getSession().then(r=>{if(r.data&&r.data.session)afterLogin({mode:"restore"});else render()});
  render();
})();
