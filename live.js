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
    S.lvls=["Alle","Begynder","Let øvet","Øvet","Pro"];S.sf={l:"",r:"",b:"",lv:""};S.placeOk=false;S.ski=[];S.pending=[];
  }
  emptyState();
  demoBar=function(){return ""};

  const errm=e=>(e&&e.message)||"Noget gik galt. Prøv igen.";
  const okMail=e=>/^\S+@\S+\.\S+$/.test(e);
  const fail=m=>{S.serr=m;render()};

  // Fjern prototype-hjælp fra login og kode-skærm
  const VER="v16 · 16. nov.";const _av=authView;authView=function(){return _av().replace(/<p class="mut" style="margin-top:14px">Prototype[\s\S]*?<\/p>/,"")+`<div class="mut" style="font-size:12px;margin-top:10px">Version ${VER}</div>`};
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
      handleDeepLink();
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
  const nn=v=>(v===""||v==null||v=="–"||isNaN(+v))?null:+v;
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
      rows:()=>S.skilist.filter(x=>!x.gone&&x.id&&(!isShop()||x.sh==S.shop)).map(x=>{const sid=shopIdByName(x.sh);return sid?{id:idOf(x),camp_id:CID(),code:x.id,shop_id:sid,brand:x.br,model:x.m,length_cm:nn(x.l),radius_m:nn(x.r),width_mm:nn(x.b),level:x.lv||null,kind:x.k||"Ski",size:x.sz||null}:null}).filter(Boolean)},
    {n:"skiSt",tbl:"skis",key:"id",can:()=>isOrg()||isShop(),updateOnly:()=>true,noDelete:true,fresh:r=>r.status!="inde"||!!r.note,
      rows:()=>S.skilist.filter(x=>!x.gone&&x.id&&(!isShop()||x.sh==S.shop)&&shopIdByName(x.sh)).map(x=>({id:idOf(x),status:skiStatus(x),note:x.badNote||null}))}
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
        let ch=cur.filter(r=>prev.get(r[sp.key])!==next.get(r[sp.key]));
        if(sp.fresh)ch=ch.filter(r=>prev.has(r[sp.key])||sp.fresh(r));
        const gone=sp.noDelete?[]:[...prev.keys()].filter(k=>!next.has(k));
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
  const _r2=render;render=function(){_r2();scheduleSync();if(typeof pushRatings==='function')pushRatings();if(typeof pushChanges==='function')pushChanges()};

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
    const [camp,lv,sh,pr,nw,ws,sk,inv,bor,mln,mrt,wcn,wen,wfv,ros]=await Promise.all([
      sb.from("camps").select("name,code,contact,info,start_date,tz").eq("id",cid).maybeSingle(),
      sb.from("levels").select("name,sort").eq("camp_id",cid).order("sort"),
      sb.from("shops").select("id,name,brands,return_time").eq("camp_id",cid).order("name"),
      sb.from("program_items").select("*").eq("camp_id",cid),
      sb.from("news").select("*").eq("camp_id",cid).order("created_at",{ascending:false}),
      sb.from("workshops").select("*").eq("camp_id",cid).eq("deleted",false),
      sb.from("skis").select("*").eq("camp_id",cid).order("code"),
      isOrg()?sb.from("invites").select("email,role,name,shop_id").eq("camp_id",cid):Promise.resolve({data:[]}),
      (isOrg()||isShop())?sb.rpc("ski_borrowers"):Promise.resolve({data:[]}),
      S.role=="Deltager"?sb.from("loans").select("ski_id,out_at,back_at").eq("user_id",S.liveUid).order("out_at",{ascending:false}):Promise.resolve({data:[]}),
      S.role=="Deltager"?sb.from("ratings").select("ski_id,stars").eq("user_id",S.liveUid):Promise.resolve({data:[]}),
      sb.rpc("ws_counts"),
      S.role=="Deltager"?sb.from("enrollments").select("workshop_id,group_code,extra_names").eq("user_id",S.liveUid):Promise.resolve({data:[]}),
      S.role=="Deltager"?sb.from("ws_favorites").select("workshop_id").eq("user_id",S.liveUid):Promise.resolve({data:[]}),
      (S.role=="Instruktør"||isOrg())?sb.from("roster").select("workshop_id,user_id,name,checked_in,no_show,extra_names"):Promise.resolve({data:[]})
    ]);
    const bad=[camp,lv,sh,pr,nw,ws,sk,inv,bor,mln,mrt,wcn,wen,wfv,ros].find(x=>x.error);
    if(bad){if(!quiet)S.toast="Campens indhold kunne ikke hentes: "+errm(bad.error);return}
    if(camp.data){S.campStart=camp.data.start_date||null;S.tz=camp.data.tz||"Europe/Vienna";applyDN();S.contact=Object.assign({n:"",p:"",e:"",t:""},camp.data.contact||{});S.sted=Object.assign({pl:"",lift:"",mp:""},camp.data.info||{});S.placeOk=!!(S.sted.pl||S.sted.lift||S.sted.mp)}
    const DEF=["Begynder","Let øvet","Øvet","Pro"];
    S.lvls=["Alle",...((lv.data&&lv.data.length)?lv.data.map(x=>x.name):DEF)];
    S.shops=(sh.data||[]).map(x=>({_id:x.id,n:x.name,c:"",e:((inv.data||[]).find(i=>i.shop_id==x.id)||{}).email||"",brands:(x.brands&&x.brands.length)?x.brands:undefined}));
    S.ret={};(sh.data||[]).forEach(x=>{if(x.return_time)S.ret[x.name]=hhmm(x.return_time)});
    S.instr=(inv.data||[]).filter(i=>i.role=="Instruktør").map(i=>({n:i.name||i.email,c:"",e:i.email}));
    S.prog=(pr.data||[]).map(x=>({_id:x.id,d:x.day,tm:hhmm(x.time),to:x.time_to?hhmm(x.time_to):undefined,t:x.title,pl:x.place||""}));
    S.news=(nw.data||[]).map(x=>({_id:x.id,t:x.title,x:x.body||"",d:x.label||""}));
    const cnt=new Map((wcn.data||[]).map(x=>[x.workshop_id,x.taken])),mine=new Map((wen.data||[]).map(x=>[x.workshop_id,x])),fav=new Set((wfv.data||[]).map(x=>x.workshop_id));
    const wl=(ws.data||[]).filter(x=>x.kind!="Event"&&x.day);
    S.ws=wl.map((x,i)=>{const m=mine.get(x.id),ex=(m&&m.extra_names)||[];
      const pax=(ros.data||[]).filter(p=>p.workshop_id==x.id).map(p=>{const st=p.no_show?"no":p.checked_in?"in":"";return {n:p.name+((p.extra_names||[]).length?" + "+p.extra_names.join(", "):""),x:(p.extra_names||[]).length,st,_uid:p.user_id,_sst:st}});
      return {id:i+1,_id:x.id,t:x.title,lv:x.level||"",tm:x.day+" "+hhmm(x.start_time),ts:x.starts_at?Date.parse(x.starts_at):null,dur:x.duration_min,max:x.max_seats,ins:x.instructor_name||"",sk:x.recommended_ski||"",code:(m&&m.group_code)||x.group_code||undefined,mp:x.meeting_point||"Se programmet",n:cnt.get(x.id)||0,en:m?1:0,gs:m?1+ex.length:0,gn:ex,fav:fav.has(x.id)?1:0,_fsent:fav.has(x.id)?1:0,pax,wait:[],ro:[]}});
    S.ev=(ws.data||[]).filter(x=>x.kind=="Event"&&x.day).map(x=>({_id:x.id,t:x.title,tm:x.day+" "+hhmm(x.start_time)}));
    const shopName=id=>{const z=S.shops.find(q=>q._id==id);return z?z.n:""};
    const _prevOut=S._seen?new Set((S.skilist||[]).filter(x=>x.st=="ude").map(x=>x.id)):null;
    S.skilist=(sk.data||[]).map(x=>({_id:x.id,id:x.code,sh:shopName(x.shop_id),br:x.brand,m:x.model,k:x.kind||"Ski",sz:x.size||"",l:x.length_cm==null?"–":String(x.length_cm),r:x.radius_m==null?"–":String(x.radius_m),b:x.width_mm==null?"–":String(x.width_mm),lv:x.level||"",st:x.status=="ude"?"ude":"inde",bad:x.status=="skadet"?"Skadet":x.status=="mistet"?"Mistet":null,badNote:x.note||"",by:((bor.data||[]).find(b=>b.ski_id==x.id)||{}).name||"",la:x.lent_at||"",bo:((bor.data||[]).find(b=>b.ski_id==x.id)||{}).boot_mm||"",zv:((bor.data||[]).find(b=>b.ski_id==x.id)||{}).z_value||"",_hand:!!x.handed_in_at,_lent:x.lent_to}));
    if(_prevOut&&isShop()){S.skilist.filter(x=>x.st=="ude"&&x.sh==S.shop&&!_prevOut.has(x.id)).slice(0,3).forEach(x=>{if(x.k&&x.k!="Ski")return;toast("Nyt udlån: "+(x.by||"en deltager")+" – "+x.br+" "+x.m+". "+setupTxt(x,1))})}
    S._seen=true;
    S.pending=S.skilist.filter(x=>x._hand&&(isOrg()||(isShop()&&x.sh==S.shop)||(S.role=="Deltager"&&x._lent==S.liveUid))).map(x=>x.id);
    if(S.role=="Deltager"){const rt=new Map((mrt.data||[]).map(q=>[q.ski_id,q.stars]));S.ski=(mln.data||[]).map(l=>{const k=S.skilist.find(z=>z._id==l.ski_id);if(!k)return null;const st=rt.get(l.ski_id)||0;return {id:k.id,_sid:k._id,k:k.k,sz:k.sz,b:k.br,m:k.m,l:k.l,rad:k.r,w:k.b,st:l.back_at?"ind":"ude",r:st,rsent:st}}).filter(Boolean)}
    baseline();
    if(isOrg()&&!(lv.data&&lv.data.length))LAST.levels=new Map();
    saveSnap();tickNow();
  }



  // ───── Butikkens overblik (kun egne ski) ─────
  const SST={key:"",d:null,err:"",busy:false};
  async function loadStats(force){
    if(SST.busy||(!force&&SST.d&&SST.key==S.liveCampId+"|"+S.shop&&Date.now()-SST.t<20000))return;
    SST.busy=true;
    const r=await sb.rpc("shop_stats");SST.busy=false;
    if(r.error){SST.err=errm(r.error);SST.d=null}else{SST.err="";SST.d=r.data;SST.key=S.liveCampId+"|"+S.shop;SST.t=Date.now()}
    render();
  }
  window.statsRefresh=()=>{SST.d=null;loadStats(true)};
  const stars=a=>a==null?"–":String(a).replace(".",",")+" ★";
  function shopDash(){
    loadStats();
    const d=SST.d;
    const head=`<h2>${t("dash")}</h2><div class="mut">Kun jeres eget udstyr${S.shop?" ("+esc(S.shop)+")":""}.</div>`;
    if(SST.err)return head+`<div class="card" style="border-color:var(--acc)">Tallene kunne ikke hentes: ${esc(SST.err)}</div><button class="btn alt" onclick="statsRefresh()">Opdatér</button>`;
    if(!d)return head+`<div class="mut">Henter tal …</div>`;
    const tile=(big,txt)=>`<div class="card"><div class="big">${big}</div>${txt}</div>`;
    const rows=(d.models||[]).map(m=>`<div class="card"><b>${esc(m.brand)} ${esc(m.model)}</b><div class="mut">${m.skis} ski · ${m.loans} gange udlånt</div><div style="color:var(--acc);font-size:18px">${m.ratings?stars(m.avg)+' <span class="mut" style="font-size:14px">('+m.ratings+' stjerner givet)</span>':'<span class="mut" style="font-size:14px">Ingen stjerner endnu</span>'}</div></div>`).join("");
    return head+tile(d.total_loans,"udlån i alt")+tile(stars(d.avg_stars),d.rating_count?"gennemsnit af stjerner ("+d.rating_count+" givet)":"gennemsnit af stjerner (ingen endnu)")+tile(d.damaged,"stk. skadet under vejs")+(d.lost?tile(d.lost,"stk. mistet"):"")+`<h3>Modeller</h3>${rows||'<div class="mut">Intet udstyr oprettet endnu.</div>'}<button class="btn alt" onclick="statsRefresh()">Opdatér</button><button class="btn" onclick="shopExport()">Hent Excel</button>`;
  }
  const _vw2=view;view=function(){if(S.live&&S.role=="Skiforretning"&&S.tab=="top")return `<h2>🏆 Top 5</h2>`+lbCard();return S.live&&S.role=="Skiforretning"&&S.tab=="dash"?shopDash():_vw2()};



  // ───── Kamera: scan QR-koden på skien ─────
  // Ligger uden for appens visning, så den ikke bliver nulstillet, mens kameraet kører
  let CAM=null;
  function loadJsQr(){
    if(window.jsQR)return Promise.resolve();
    return new Promise((ok,no)=>{const e=document.createElement("script");e.src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";e.onload=ok;e.onerror=no;document.head.appendChild(e)});
  }
  function camClose(){
    if(!CAM)return;CAM.stop=true;
    try{CAM.stream&&CAM.stream.getTracks().forEach(x=>x.stop())}catch(e){}
    CAM.el&&CAM.el.remove();CAM=null;
  }
  window.camManual=function(){const m=CAM&&CAM.mode;camClose();S.ierr="";S.modal=m=="ret"?{ret:1}:{ski:1};render()};
  window.camClose=camClose;
  async function camOpen(mode){
    if(CAM)return;
    if(!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){toast(tr("Kameraet kan ikke bruges her. Skriv ID'et i stedet."));S.modal=mode=="ret"?{ret:1}:{ski:1};render();return}
    const el=document.createElement("div");
    el.style.cssText="position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column";
    el.innerHTML=`<video playsinline muted autoplay style="flex:1;min-height:0;width:100%;object-fit:cover"></video><div style="position:absolute;left:50%;top:38%;width:62vmin;height:62vmin;transform:translate(-50%,-50%);border:3px solid #fff;border-radius:18px;box-shadow:0 0 0 100vmax rgba(0,0,0,.45)"></div><div style="padding:14px 16px calc(14px + env(safe-area-inset-bottom));background:#111;color:#fff;text-align:center"><div id="cam_t" style="margin-bottom:10px">${esc(tr("Hold QR-koden på udstyret i rammen"))}</div><button class="btn" style="margin:0 0 8px" onclick="camManual()">${esc(tr("Skriv ID i stedet"))}</button><button class="btn alt" style="margin:0" onclick="camClose()">${esc(tr("Annuller"))}</button></div>`;
    document.body.appendChild(el);
    CAM={el,mode,stop:false};
    try{
      CAM.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
    }catch(e){
      camClose();toast(tr(e&&e.name=="NotAllowedError"?"Kameraet er ikke tilladt. Tillad det i browseren, eller skriv ID'et.":"Vi kunne ikke åbne kameraet. Skriv ID'et i stedet."));
      S.modal=mode=="ret"?{ret:1}:{ski:1};render();return;
    }
    if(!CAM||CAM.stop){return}
    const v=el.querySelector("video");v.srcObject=CAM.stream;try{await v.play()}catch(e){}
    let det=null;
    if(window.BarcodeDetector){try{det=new BarcodeDetector({formats:["qr_code"]})}catch(e){det=null}}
    if(!det){try{await loadJsQr()}catch(e){camClose();toast(tr("Scanneren kunne ikke hentes. Skriv ID'et i stedet."));S.modal=mode=="ret"?{ret:1}:{ski:1};render();return}}
    const cv=document.createElement("canvas"),cx=cv.getContext("2d",{willReadFrequently:true});
    const hit=async txt=>{
      const code=codeOf_(txt);if(!/^SK-[A-Z0-9]+$/.test(code))return false;
      const m=CAM.mode;camClose();if(navigator.vibrate)try{navigator.vibrate(60)}catch(e){}
      if(m=="ret")await retCode(code);else await lendCode(code);
      return true;
    };
    const tick=async()=>{
      if(!CAM||CAM.stop)return;
      try{
        if(v.readyState>=2&&v.videoWidth){
          let txt=null;
          if(det){const r=await det.detect(v);if(r&&r[0])txt=r[0].rawValue}
          else{const w=Math.min(640,v.videoWidth),h=Math.round(w*v.videoHeight/v.videoWidth);cv.width=w;cv.height=h;cx.drawImage(v,0,0,w,h);const im=cx.getImageData(0,0,w,h),q=window.jsQR(im.data,w,h,{inversionAttempts:"attemptBoth"});if(q)txt=q.data}
          if(txt&&await hit(txt))return;
        }
      }catch(e){}
      if(CAM&&!CAM.stop)setTimeout(tick,det?150:220);
    };
    tick();
  }

  // ───── Udlån, aflevering og stjerner i databasen ─────
  const skiByCode=c=>S.skilist.find(x=>String(x.id).toUpperCase()==String(c).toUpperCase()&&!x.gone);
  const codeOf_=t=>{const m=String(t||"").toUpperCase().match(/SK-[A-Z0-9]+/);return m?m[0]:String(t||"").trim().toUpperCase()};
  async function lendCode(v){
    if(!v){S.ierr="Skriv ID'et.";render();return false}
    let q;
    if(!navigator.onLine)q={error:{message:"Failed to fetch"}};else{try{q=await sb.rpc("lend_ski",{p_code:v})}catch(e){q={error:{message:"Failed to fetch"}}}}
    if(q.error&&isNet(q.error)){
      const k=skiByCode(v);
      if(k&&S.ski.some(z=>z.st=="ude"&&(z.k||"Ski")==(k.k||"Ski"))){S.ierr="Aflever først dit nuværende udstyr af samme type ("+(k.k||"Ski")+").";S.modal={ski:1};render();return false}
      if(!k||k.st!="inde"||k.bad){S.ierr="Du er offline, og vi kan ikke se, om udstyret er ledigt. Prøv igen med forbindelse.";S.modal={ski:1};render();return false}
      enqueue("lend_ski",{p_code:v});k.st="ude";S.ski.unshift({id:k.id,_sid:k._id,k:k.k,sz:k.sz,b:k.br,m:k.m,l:k.l,rad:k.r,w:k.b,st:"ude",r:0,pend:1});S.modal=null;S.ierr="";toast("Gemt. Sendes, når du har forbindelse.");render();return true;
    }
    if(q.error){S.ierr=errm(q.error);S.modal={ski:1};render();return false}
    S.modal=null;S.ierr="";await loadCampData(true);toast("Udstyret er tilføjet ✓");render();return true;
  }
  idGo=async function(){lendCode(codeOf_(($("#sid").value||"")))};
  scan=function(){S.ierr="";camOpen("lend")};
  handIn=async function(id){
    const k=skiByCode(id);if(!k)return;
    const q=await rpcQ("hand_in",{p_ski:k._id},"hi"+k._id);
    if(q.error){toast(errm(q.error));return}
    if(q.queued){S.pending.push(k.id);const m=S.ski.find(z=>z.id==k.id);if(m)m.pend=1;render();return}
    await loadCampData(true);render();
  };
  done=async function(id){
    const k=skiByCode(id);if(!k)return;
    const q=await rpcQ("return_ski",{p_ski:k._id},"rt"+k._id);
    if(q.error){toast("Kunne ikke bekræfte afleveringen: "+errm(q.error));return}
    if(q.queued){k.st="inde";k.by="";S.pending=S.pending.filter(x=>x!=k.id);render();return}
    await loadCampData(true);render();
  };
  // Butikken scanner/skriver ID ved aflevering
  scanReturn=function(){S.ierr="";camOpen("ret")};
  async function retCode(v){
    const k=skiByCode(v);
    if(!k||(isShop()&&k.sh!=S.shop)){S.ierr=isShop()?"Vi kan ikke finde noget af jeres udstyr med det ID.":"Vi kan ikke finde udstyr med det ID.";S.modal={ret:1};render();return}
    S.ierr="";S.modal={sc:S.skilist.indexOf(k)};render();
  }
  window.scDone=async function(i){const k=S.skilist[i],who=k.by;S.modal=null;await done(k.id);toast(k.br+" "+k.m+" er afleveret"+(who?" af "+who:"")+" ✓")};
  window.retGo=function(){retCode(codeOf_(($("#rid").value||"")))};
  const _md=modal;modal=function(){
    if(S.modal&&S.modal.ret)return `<div class="modal"><div class="card"><h3>Find udstyr</h3><div class="mut">Skriv ID'et under QR-koden, fx SK-102.</div><input id="rid" placeholder="SK-" autocapitalize="characters">${S.ierr?`<div class="mut" style="color:var(--acc)">${esc(S.ierr)}</div>`:""}<button class="btn" onclick="retGo()">Find udstyr</button><button class="btn alt" onclick="S.modal=null;render()">Annuller</button></div></div>`;
    return _md();
  };
  // Butikkens aflevering: rigtige udlån
  const _vw3=view;view=function(){
    if(S.live&&S.role=="Skiforretning"&&S.tab=="shop"){
      const out=S.skilist.filter(x=>!x.gone&&x.sh==S.shop&&x.st=="ude").sort((a,b)=>((S.pending.includes(b.id)?1:0)-(S.pending.includes(a.id)?1:0))||((outTxt(b)||{m:0}).m-(outTxt(a)||{m:0}).m));
      return `<h2>${t("shopTitle")}</h2>${scanRetCard()}<h3>Udlånt lige nu (${out.length})</h3>${out.length?out.map(x=>`<div class="card"><h3>${esc(x.br)} ${esc(x.m)}</h3><div class="mut">${esc(x.id)} · ${x.by?esc(x.by):"ukendt låner"}${S.pending.includes(x.id)?" · <b>melder afleveret</b>":""}</div>${setupBox(x)}<button class="btn ${S.pending.includes(x.id)?"ok":"alt"}" onclick="done('${esc(x.id)}')">${t("confirm")}</button></div>`).join(""):`<p class="mut">Intet af jeres udstyr er ude.</p>`}${shopRetCard()}`;
    }
    return _vw3();
  };
  // Stjerner gemmes, når deltageren har trykket
  window.rateGo=function(){const n=S.rt||0;if(!n){toast(tr("Vælg antal stjerner"));return}const k=S.ski[S.modal];k.r=n;k.rc=(document.getElementById("rc")||{}).value||S.rc||"";if(!S.online)k.pend=1;S.modal=null;S.rt=0;S.rc="";render()};
  let rateBusy=false;
  async function pushRatings(){
    if(rateBusy||S.role!="Deltager"||!S.liveUid)return;
    const k=S.ski.find(x=>x._sid&&x.r>0&&x.rsent!==x.r);if(!k)return;
    rateBusy=true;
    const q=await rpcQ("rate_ski",{p_ski:k._sid,p_stars:k.r,p_comment:(k.rc||"").trim()||null},"rate"+k._sid);
    rateBusy=false;
    if(q.error){toast("Stjernerne blev ikke gemt: "+errm(q.error));k.r=k.rsent||0}else k.rsent=k.r;
    render();
  }
  // Hold tallene friske: hent igen hvert 20. sekund, når intet er under redigering
  function dirty(){return SPEC.some(sp=>{if(!sp.can())return false;const prev=LAST[sp.n]||new Map();return sp.rows().some(r=>prev.get(r[sp.key])!==rowJson(r))})}
  const sig=()=>JSON.stringify([S.skilist.map(x=>[x.id,x.st,x.bad,x.by]),S.pending,S.ski.map(x=>[x.id,x.st,x.r]),S.ws.map(x=>x.t),S.news.length,S.prog.length]);
  setInterval(async()=>{
    if(document.visibilityState!="visible"||!S.liveUid||!S.liveCampId||S.sup&&false)return;
    if(S.modal||syncBusy||dirty())return;
    const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;
    await flushQ();
    const b=sig();await loadCampData(true);if(sig()!==b)render();saveSnap();
  },20000);


  // ───── Kø til handlinger uden dækning ─────
  const QK=()=>"snows_q_"+(S.liveUid||"x");
  const qLoad=()=>{try{return JSON.parse(localStorage.getItem(QK())||"[]")}catch(e){return[]}};
  const qSave=q=>{try{localStorage.setItem(QK(),JSON.stringify(q))}catch(e){}};
  const isNet=e=>!e||/fetch|network|load failed|timeout/i.test(e.message||"")||e.status===0;
  function enqueue(fn,args,key){
    const q=qLoad().filter(x=>!(key&&x.key==key));q.push({fn,args,key:key||null,t:Date.now()});qSave(q);
  }
  // Kør nu, eller læg i kø hvis nettet er væk. Forretningsfejl (fx "Holdet er fuldt") returneres.
  async function rpcQ(fn,args,key){
    if(!navigator.onLine){enqueue(fn,args,key);return{queued:1}}
    try{
      const r=await sb.rpc(fn,args);
      if(r.error){if(isNet(r.error)){enqueue(fn,args,key);return{queued:1}}return{error:r.error}}
      return{ok:1,data:r.data};
    }catch(e){enqueue(fn,args,key);return{queued:1}}
  }
  let flushing=false;
  async function flushQ(){
    if(flushing||!S.liveUid||!navigator.onLine)return;
    let q=qLoad();if(!q.length)return;
    flushing=true;S.syncing=true;render();
    const errs=[];
    try{
      while(q.length){
        const it=q[0];let r;
        try{r=await sb.rpc(it.fn,it.args)}catch(e){break}
        if(r.error&&isNet(r.error))break;
        if(r.error)errs.push(errm(r.error));
        q.shift();qSave(q);
      }
    }finally{flushing=false;S.syncing=false}
    if(errs.length)S.toast="Nogle handlinger kunne ikke gennemføres: "+errs[0];
    await loadCampData(true);render();
  }
  const setOnline=()=>{S.online=navigator.onLine;render();if(S.online)flushQ()};
  window.addEventListener("online",setOnline);window.addEventListener("offline",setOnline);
  S.online=navigator.onLine;

  // ───── Gem kopi til offline brug ─────
  const SNK=()=>"snows_snap_"+(S.liveUid||"x");
  const SNAP=["skilist","ws","prog","news","shops","instr","contact","sted","lvls","ski","pending","ret","prof"];
  function saveSnap(){
    if(!S.liveUid||S.sup)return;
    try{const o={role:S.role,camp:S.camp,who:S.who,shop:S.shop,campId:S.liveCampId,campStart:S.campStart,tz:S.tz,t:Date.now(),state:{}};SNAP.forEach(k=>o.state[k]=S[k]);localStorage.setItem(SNK(),JSON.stringify(o))}catch(e){}
  }
  function restoreSnap(uid){
    try{
      const o=JSON.parse(localStorage.getItem("snows_snap_"+uid)||"null");if(!o||!o.role)return false;
      S.liveUid=uid;S.liveCampId=o.campId;SNAP.forEach(k=>{if(o.state[k]!==undefined)S[k]=o.state[k]});S.campStart=o.campStart;S.tz=o.tz;applyDN();
      enter({role:o.role,camp:o.camp,who:o.who,shop:o.shop});S.setup=false;S.online=false;S.vf=null;S.auth="login";render();return true;
    }catch(e){return false}
  }

  // ───── Rigtige datoer og klokken i campens tidszone ─────
  const WD={Mon:"Man",Tue:"Tirs",Wed:"Ons",Thu:"Tors",Fri:"Fre",Sat:"Lør",Sun:"Søn"};
  const tzParts=(ms,tz)=>{const o={};new Intl.DateTimeFormat("en-GB",{timeZone:tz||"Europe/Vienna",weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(ms)).forEach(p=>o[p.type]=p.value);if(o.hour=="24")o.hour="00";return o};
  const tzOff=(ms,tz)=>{const p=tzParts(ms,tz);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(ms/60000)*60000};
  const tzMidnight=(ms,tz)=>{const p=tzParts(ms,tz),g=Date.UTC(+p.year,+p.month-1,+p.day);return g-tzOff(g,tz)};
  function tickNow(){
    const p=tzParts(Date.now(),S.tz),d=WD[p.weekday]||"Man",tm=p.hour+":"+p.minute;
    if(!S.now||S.now.d!=d||S.now.tm!=tm){S.now={d,tm};return true}return false;
  }
  const DNB={Man:"Mandag",Tirs:"Tirsdag",Ons:"Onsdag",Tors:"Torsdag",Fre:"Fredag",Lør:"Lørdag",Søn:"Søndag"},DOW={Man:1,Tirs:2,Ons:3,Tors:4,Fre:5,Lør:6,Søn:0};
  const MON=["jan.","feb.","mar.","apr.","maj","jun.","jul.","aug.","sep.","okt.","nov.","dec."];
  function dayDate(d){
    if(!S.campStart)return null;
    const b=new Date(S.campStart+"T12:00:00Z"),add=(DOW[d]-b.getUTCDay()+7)%7;b.setUTCDate(b.getUTCDate()+add);return b;
  }
  function applyDN(){
    Object.keys(DNB).forEach(d=>{const x=dayDate(d);DN[d]=DNB[d]});
  }
  applyDN();
  setInterval(()=>{if(S.liveUid&&tickNow()){const a=document.activeElement;if(!S.modal&&!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))render()}},20000);

  // Tilmelding: åbner 08:00 samme dag, lukker 10 min før start. Holdet er låst, når det er fuldt.
  enrBtn=function(w){
    if(!w.ts)return `<div class="mut" style="margin-top:8px">Dato er ikke lagt ind endnu</div>`;
    const now=Date.now();
    if(now>w.ts-600000)return `<div class="mut" style="margin-top:8px">Tilmelding er lukket</div>`;
    const open=tzMidnight(w.ts,S.tz)+8*3600000;
    if(now<open)return `<div class="mut" style="margin-top:8px">🔒 Tilmelding åbner ${DN[w.tm.split(" ")[0]].toLowerCase()} kl. 08:00</div>`;
    const c=clash(w);if(c)return `<div class="mut" style="margin-top:8px">Du er allerede tilmeldt "${esc(c.t)}" på samme tidspunkt.</div>`;
    if(w.n>=w.max)return `<div class="mut" style="margin-top:8px">🔒 Holdet er fuldt og låst</div>`;
    return `<button class="btn" onclick="openGrp(${w.id-1})">${t("enroll")}</button>`;
  };
  const _md2=modal;modal=function(){
    const h=_md2();
    return typeof h=="string"?h.replace(/<h3 style="margin-top:18px">Har du en gruppekode\?<\/h3><input id="gc"[^>]*>/,"").replace(/<button class="btn alt" onclick="joinCode\(\)">[^<]*<\/button>/,""):h;
  };

  // ───── Workshops: tilmelding, afmelding, favoritter, tjek ind ─────
  const _enr0=enr;
  enr=async function(i,v,sz){
    const w=S.ws[i];if(!w)return;
    if(v==1){
      const names=(w.gn||[]).slice(),grp=names.length?(w.code||("GRP-"+Math.floor(1000+Math.random()*9000))):null;w.code=grp||undefined;
      if(!navigator.onLine){_enr0(i,1,sz);w.pend=1;enqueue("enroll",{p_ws:w._id,p_group:grp,p_extra:names},"enr"+w._id);render();return}
      const q=await sb.rpc("enroll",{p_ws:w._id,p_group:grp,p_extra:names});
      if(q.error){if(isNet(q.error)){_enr0(i,1,sz);w.pend=1;enqueue("enroll",{p_ws:w._id,p_group:grp,p_extra:names},"enr"+w._id);render();return}toast(errm(q.error));await loadCampData(true);render();return}
      await loadCampData(true);render();toast("Du er tilmeldt ✓");
    }else{
      _enr0(i,0,sz);
      const q=await rpcQ("cancel_enrollment",{p_ws:w._id},"enr"+w._id);
      if(q.error){toast(errm(q.error))}
      await loadCampData(true);render();
    }
  };
  grpGo=function(){
    const i=S.modal.g,w=S.ws[i],names=S.grp.map(x=>x.trim()).filter(Boolean),sz=1+names.length;
    if(w.n+sz>w.max){S.gerr=w.n>=w.max?"Holdet er fuldt.":"Holdet har kun "+(w.max-w.n)+" ledige pladser. Fjern nogle fra gruppen.";render();return}
    w.gn=names;w.code=sz>1?"GRP-"+Math.floor(1000+Math.random()*9000):undefined;S.modal=null;enr(i,1,sz);
  };
  // Favoritter og tjek ind: ændringer i visningen sendes videre
  let pushBusy=false;
  async function pushChanges(){
    if(pushBusy||!S.liveUid||S.sup&&false)return;
    pushBusy=true;
    try{
      if(S.role=="Deltager"){
        for(const w of S.ws){if(w._id&&(w.fav?1:0)!==(w._fsent?1:0)){w._fsent=w.fav?1:0;await rpcQ("set_ws_fav",{p_ws:w._id,p_on:!!w.fav},"fav"+w._id)}}
      }
      if(S.role=="Instruktør"||isOrg()){
        for(const w of S.ws){for(const p of (w.pax||[])){
          if(!p._uid||p.st===p._sst)continue;
          const nx=p.st;p._sst=nx;
          const q=nx=="no"?await rpcQ("mark_no_show",{p_ws:w._id,p_user:p._uid,p_flag:true},"ci"+w._id+p._uid):await rpcQ("check_in",{p_ws:w._id,p_user:p._uid,p_in:nx=="in"},"ci"+w._id+p._uid);
          if(q.error)toast(errm(q.error));
        }}
      }
    }finally{pushBusy=false}
  }

  // Campens startdato (så hold og program får rigtige datoer)
  window.saveStart=async function(){
    const d=($("#cs_d")||{}).value||null;
    const q=await sb.from("camps").update({start_date:d}).eq("id",S.liveCampId);
    if(q.error){toast("Datoen kunne ikke gemmes: "+errm(q.error));return}
    S.campStart=d;applyDN();await loadCampData(true);toast("Startdato gemt ✓");render();
  };
  const _admc=ADM.camp;ADM.camp=function(){
    const miss=!S.campStart;
    return _admc()+`<div class="card" ${miss?'style="border-color:var(--acc)"':""}><h3>Campens første dag</h3><div class="mut">${miss?"Mangler. Uden den kan deltagerne ikke tilmelde sig hold.":"Bruges til datoer på hold og program."}</div><input id="cs_d" type="date" value="${esc(S.campStart||"")}"><button class="btn" onclick="saveStart()">Gem første dag</button></div>`;
  };


  // ───── App på hjemmeskærmen, offline-visning og push ─────
  const VAPID_PUBLIC="BONMAkItTzcbl-AAblpf9rDMw1xEDayJ88v4qIEM9_QOyLAv_U25qkN-DeFDcnQvAxDKyjpsPZs5kCvXaetBQsI";
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
  const isStandalone=()=>(window.matchMedia&&matchMedia("(display-mode: standalone)").matches)||navigator.standalone;
  const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const u8=b=>{const p="=".repeat((4-b.length%4)%4),r=atob((b+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(r,c=>c.charCodeAt(0))};
  const pushOk=()=>"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
  const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}},lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
  window.pushOn=async function(){
    try{
      const perm=await Notification.requestPermission();
      if(perm!="granted"){toast(tr("Beskeder er ikke tilladt. Du kan ændre det i browserens indstillinger."));return}
      const reg=await navigator.serviceWorker.ready;
      const sub=(await reg.pushManager.getSubscription())||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(VAPID_PUBLIC)});
      const j=sub.toJSON();
      const q=await sb.from("push_subs").upsert({user_id:S.liveUid,camp_id:S.liveCampId,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth},{onConflict:"endpoint"});
      if(q.error){toast(errm(q.error));return}
      lsSet("snows_push_"+S.liveUid,"1");toast(tr("Beskeder er slået til ✓"));render();
    }catch(e){toast(tr("Beskeder kunne ikke slås til på denne enhed."))}
  };
  window.pushLater=()=>{lsSet("snows_push_"+S.liveUid,"later");render()};
  function pushCard(){
    if(S.role!="Deltager"||S.sup||lsGet("snows_push_"+S.liveUid))return "";
    if(!pushOk()){
      if(isIOS()&&!isStandalone())return `<div class="card"><h3>${esc(tr("Få beskeder"))}</h3><div class="mut">${esc(tr("På iPhone: tryk på Del-knappen og vælg Føj til hjemmeskærm. Åbn så appen derfra for at få beskeder."))}</div><button class="btn alt" onclick="pushLater()">${esc(tr("Ikke nu"))}</button></div>`;
      return "";
    }
    return `<div class="card" style="border-color:var(--acc)"><h3>${esc(tr("Få beskeder"))}</h3><div class="mut">${esc(tr("Få besked om dine hold og når udstyret skal afleveres."))}</div><button class="btn" onclick="pushOn()">${esc(tr("Slå beskeder til"))}</button><button class="btn alt" onclick="pushLater()">${esc(tr("Ikke nu"))}</button></div>`;
  }
  // Arrangørens nyhed sendes også som push
  const _mgAdd=mgAdd;mgAdd=function(k){
    const n=S.news.length;_mgAdd(k);
    if(k=="nw"&&S.news.length>n&&sb.functions){const x=S.news[0];sb.functions.invoke("send-push",{body:{title:x.t,body:x.x||""}}).then(async r=>{
      if(r.error){let m=errm(r.error);try{if(r.error.context&&r.error.context.json){const j=await r.error.context.json();if(j&&j.error)m=j.error}}catch(e){}toast(tr("Beskeden kunne ikke sendes som push")+": "+m);return}
      const n=r.data&&typeof r.data.sent=="number"?r.data.sent:null;
      toast(n===0?tr("Nyheden er udgivet, men ingen telefoner er tilmeldt beskeder endnu."):n>0?tr("Push-besked sendt til")+" "+n+" "+tr("enheder")+" ✓":tr("Nyheden er udgivet."));
    }).catch(e=>toast(tr("Beskeden kunne ikke sendes som push")+": "+errm(e)))}
  };

  // ───── Juridisk: privatlivspolitik og vilkår (udkast – skal gennemlæses og udfyldes) ─────
  const LEGAL=window.LEGAL,LT=window.LT;
  window.openLegal=k=>{S.modal={legal:k};render()};
  const _md3=modal;modal=function(){
    if(S.modal&&S.modal.legal){
      const L=LT[S.lang]||LT.da,k=S.modal.legal,list=k=="priv"?L.p:L.t;
      return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>${esc(k=="priv"?L.priv:L.terms)}</h3>${list.map(x=>`<b>${esc(x[0])}</b><p class="mut" style="margin:4px 0 14px">${esc(x[1])}</p>`).join("")}<button class="btn" onclick="S.modal=null;render()">${esc(L.close)}</button></div></div>`;
    }
    return _md3();
  };
  const legalLinks=()=>{const L=LT[S.lang]||LT.da;return `<div class="mut" style="margin-top:12px"><a style="color:var(--acc)" onclick="openLegal('priv')">${esc(L.priv)}</a> · <a style="color:var(--acc)" onclick="openLegal('terms')">${esc(L.terms)}</a></div>`};
  const _av2=authView;authView=function(){return _av2()+legalLinks()};
  // Min data: hent som fil
  window.myData=async function(){
    const q=await sb.rpc("export_my_data");if(q.error){toast(errm(q.error));return}
    saveFile("mine-data.json",JSON.stringify(q.data,null,2),"application/json");
  };
  const _vw4=view;view=function(){
    let h=_vw4();
    if(!S.live||typeof h!="string")return h;
    if(S.role=="Deltager"&&S.tab=="home")h=pushCard()+msgCard()+h;
    if(S.role=="Deltager"&&S.tab=="info")h+=`<div class="card"><h3>${esc(tr("Dine oplysninger"))}</h3>${legalLinks()}</div>`;
    if(/delAcc\(\)">Slet min konto<\/button>/.test(h))h=h.replace(/(<button[^>]*delAcc\(\)">Slet min konto<\/button>)/,`<button class="btn alt" onclick="myData()">${esc(tr("Hent mine data"))}</button>$1`).replace(/(<\/div>`?)$/,"$1");
    return h;
  };

  // ───── Filer og Excel ─────
  async function saveFile(name,data,type){
    try{
      const d=window.claude&&claude.use?await claude.use("downloads"):null;
      if(d){await d.save({filename:name,data});return}
    }catch(e){}
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([data],{type:type||"application/octet-stream"}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  }
  const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=t[(c^b[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0}})();
  function zipStore(files){
    const enc=new TextEncoder(),parts=[],cd=[];let off=0;
    const u16=n=>[n&255,(n>>8)&255],u32=n=>[n&255,(n>>8)&255,(n>>16)&255,(n>>>24)&255];
    for(const f of files){
      const nm=enc.encode(f.name),d=enc.encode(f.data),c=CRC(d);
      const lh=new Uint8Array([0x50,0x4b,3,4,20,0,0,8,0,0,0,0,0x21,0,...u32(c),...u32(d.length),...u32(d.length),...u16(nm.length),0,0]);
      parts.push(lh,nm,d);
      cd.push(new Uint8Array([0x50,0x4b,1,2,20,0,20,0,0,8,0,0,0,0,0x21,0,...u32(c),...u32(d.length),...u32(d.length),...u16(nm.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(off)]),nm);
      off+=lh.length+nm.length+d.length;
    }
    const cdSize=cd.reduce((a,b)=>a+b.length,0);
    const end=new Uint8Array([0x50,0x4b,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(cdSize),...u32(off),0,0]);
    return new Blob([...parts,...cd,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  }
  const xe=v=>String(v==null?"":v).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,"");
  const colName=i=>{let s="";i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
  function xlsxBlob(sheets){
    const files=[
      {name:"[Content_Types].xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+sheets.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+'</Types>'},
      {name:"_rels/.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:"xl/workbook.xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map((s,i)=>'<sheet name="'+xe(s.name.replace(/[\[\]:*?\/\\]/g," ").slice(0,31)||"Ark"+(i+1))+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets></workbook>'},
      {name:"xl/_rels/workbook.xml.rels",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+'</Relationships>'}
    ];
    sheets.forEach((sh,i)=>{
      const rows=sh.rows.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{const ref=colName(ci)+(ri+1);return typeof v=="number"&&isFinite(v)?'<c r="'+ref+'"><v>'+v+'</v></c>':'<c r="'+ref+'" t="inlineStr"><is><t xml:space="preserve">'+xe(v)+'</t></is></c>'}).join("")+'</row>').join("");
      files.push({name:"xl/worksheets/sheet"+(i+1)+".xml",data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+rows+'</sheetData></worksheet>'});
    });
    return zipStore(files);
  }
  const fdt=x=>x?new Date(x).toLocaleString({da:"da-DK",en:"en-GB",de:"de-DE"}[S.lang]||"da-DK",{timeZone:S.tz||"Europe/Vienna",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  async function rq(fn){const q=await sb.rpc(fn);if(q.error)throw q.error;return q.data||[]}
  EXPS.Deltagere=async()=>[["Navn","E-mail","Støvlelængde (mm)","Z-værdi"],...(await rq("export_participants")).map(p=>[p.name,p.email,p.boot_mm==null?"":+p.boot_mm,p.z_value==null?"":+p.z_value])];
  EXPS.Tilmeldinger=async()=>[["Hold","Dag","Start","Deltager","Medbragte","Tjekket ind","Mødte ikke op"],...(await rq("export_enrollments")).map(e=>[e.workshop,e.day,String(e.start_time||"").slice(0,5),e.participant,e.extra_names||"",e.checked_in?"Ja":"",e.no_show?"Ja":""])];
  EXPS.Udlån=async()=>[["Ski-ID","Mærke","Model","Butik","Låner","Udlånt","Afleveret","Stjerner","Kommentar"],...(await rq("export_loans")).map(l=>[l.ski_code,l.brand,l.model,l.shop,l.borrower||"",fdt(l.out_at),fdt(l.back_at),l.stars==null?"":l.stars,l.comment||""])];
  EXPS.Stjerner=async()=>{
    const m=new Map();(await rq("export_loans")).forEach(l=>{const k=l.brand+" "+l.model,o=m.get(k)||{loans:0,n:0,sum:0};o.loans++;if(l.stars){o.n++;o.sum+=l.stars}m.set(k,o)});
    return [["Model","Udlån","Bedømmelser","Gennemsnit af stjerner"],...[...m].sort((a,b)=>b[1].loans-a[1].loans).map(([k,o])=>[k,o.loans,o.n,o.n?Math.round(o.sum/o.n*10)/10:""])];
  };
  delete EXPS.Ratings;
  async function exportSheets(keys,fname){
    try{
      const sheets=[];
      for(const n of keys){const rows=await EXPS[n]();sheets.push({name:tr(n),rows:rows.map((r,i)=>i==0?r.map(c=>tr(String(c))):r)})}
      const b=xlsxBlob(sheets);
      const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=fname;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast(tr("Eksport klar")+" ✓");
    }catch(e){toast(tr("Eksporten mislykkedes")+": "+errm(e))}
  }
  doExp=function(k){const keys=k=="Alt"?Object.keys(EXPS):[k];return exportSheets(keys,"snows-"+(k=="Alt"?"alt":k.toLowerCase())+".xlsx")};
  window.shopExport=()=>exportSheets(["Ski","Udlån","Stjerner"],"snows-"+(S.shop||"butik").toLowerCase().replace(/[^a-z0-9]+/g,"-")+".xlsx");

  // QR-link: /s/SK-102 åbner appen og låner/afleverer skien
  let DL=null;
  try{const u=new URL(location.href);if(u.searchParams.get("s")){DL=u.searchParams.get("s");u.searchParams.delete("s");history.replaceState(null,"",u.pathname+(u.search||"")+u.hash)}}catch(e){}
  async function handleDeepLink(){
    if(!DL)return;const code=codeOf_(DL);DL=null;
    if(!/^SK-[A-Z0-9]+$/.test(code))return;
    if(S.role=="Deltager"){if(S.ski.some(k=>k.st=="ude")){toast(t("blocked"));return}await lendCode(code)}
    else if(S.role=="Skiforretning")await retCode(code);
  }

  // ───── Vejr for campens sted (Open-Meteo, ingen nøgle) ─────
  const WXT={da:{0:"klart",1:"mest sol",2:"let skyet",3:"overskyet",45:"tåge",51:"støvregn",61:"regn",71:"sne",80:"byger",85:"snebyger",95:"torden",wind:"vind",in:"Vejr i",nf:"Vejret kunne ikke findes for stedet. Tjek byen i Sted og praktisk info.",ld:"Henter vejr …",tm:"Næste dage"},
    en:{0:"clear",1:"mostly sunny",2:"partly cloudy",3:"overcast",45:"fog",51:"drizzle",61:"rain",71:"snow",80:"showers",85:"snow showers",95:"thunderstorm",wind:"wind",in:"Weather in",nf:"Weather not found for this place. Check the town under Place and info.",ld:"Loading weather …",tm:"Next days"},
    de:{0:"klar",1:"überwiegend sonnig",2:"leicht bewölkt",3:"bedeckt",45:"Nebel",51:"Nieselregen",61:"Regen",71:"Schnee",80:"Schauer",85:"Schneeschauer",95:"Gewitter",wind:"Wind",in:"Wetter in",nf:"Wetter für den Ort nicht gefunden. Prüfe den Ort unter Ort und Info.",ld:"Wetter wird geladen …",tm:"Nächste Tage"}};
  const wcls=c=>c===0?0:c<=2?1:c==3?3:c<=48?45:c<=57?51:c<=67?61:c<=77?71:c<=82?80:c<=86?85:95;
  const wico=c=>({0:"☀️",1:"🌤️",3:"☁️",45:"🌫️",51:"🌦️",61:"🌧️",71:"🌨️",80:"🌦️",85:"🌨️",95:"⛈️"}[wcls(c)]||"⛅");
  const WX={key:"",st:"",d:null,t:0};
  async function jget(u){const r=await fetch(u);if(!r.ok)throw new Error("http");return r.json()}
  async function geo(pl){
    const parts=pl.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
    const cand=[pl,...parts.slice().reverse(),...parts.join(" ").split(/\s+/).filter(w=>w.length>2).reverse()];
    for(const q of cand){
      const g=await jget("https://geocoding-api.open-meteo.com/v1/search?count=1&language=da&name="+encodeURIComponent(q.replace(/\d+/g,"").trim()||q));
      if(g.results&&g.results[0])return g.results[0];
    }
    return null;
  }
  async function loadWx(){
    const pl=((S.sted||{}).pl||"").trim();
    if(!pl){WX.key="";WX.d=null;WX.st="";return}
    if(WX.key==pl&&Date.now()-WX.t<1800000)return;
    WX.key=pl;WX.t=Date.now();WX.st="ld";
    try{
      const g=await geo(pl);
      if(WX.key!=pl)return;
      if(!g){WX.st="nf";WX.d=null;render();return}
      const f=await jget("https://api.open-meteo.com/v1/forecast?latitude="+g.latitude+"&longitude="+g.longitude+"&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&wind_speed_unit=ms&forecast_days=4");
      if(WX.key!=pl)return;
      WX.d={name:g.name,f};WX.st="ok";
    }catch(e){WX.st="nf";WX.d=null;WX.t=Date.now()-1500000}
    render();
  }
  const _stc=stedCards;
  stedCards=function(){
    const a=_stc();
    if(!S.live)return a;
    loadWx();
    const T=WXT[S.lang]||WXT.da;
    if(!((S.sted||{}).pl||"").trim())return a;
    if(WX.st=="ld")a.unshift(["⛅",T.ld]);
    else if(WX.st=="nf")a.unshift(["⛅",T.nf]);
    else if(WX.st=="ok"&&WX.d){
      const c=WX.d.f.current,d=WX.d.f.daily,loc={da:"da-DK",en:"en-GB",de:"de-DE"}[S.lang]||"da-DK";
      const days=d.time.slice(1).map((x,i)=>new Date(x).toLocaleDateString(loc,{weekday:"short"})+" "+wico(d.weather_code[i+1])+" "+Math.round(d.temperature_2m_min[i+1])+"/"+Math.round(d.temperature_2m_max[i+1])+"°").join(" · ");
      a.unshift(["⛅",T.in+" "+WX.d.name+": "+Math.round(c.temperature_2m)+"°, "+T[wcls(c.weather_code)]+", "+T.wind+" "+Math.round(c.wind_speed_10m)+" m/s"],[wico(c.weather_code),T.tm+": "+days]);
    }
    return a;
  };
  // Nyt sted gemt: hent vejret igen med det samme
  const _sst=saveSted;saveSted=function(){_sst();WX.key="";render()};

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

  const nz=v=>String(v).replace(".",",");
  window.setupTxt=function(x,short){if(x.k&&x.k!="Ski")return "";const parts=[];
    if(x.zv)parts.push((short?"":tr("Indstil bindingen til")+" ")+"Z "+nz(x.zv));
    if(x.bo)parts.push((short?"":tr("Støvlestørrelse")+" ")+(short?"støvle ":"")+x.bo+" mm");
    return parts.length?parts.join(" · "):tr("Støvlestørrelse og Z-værdi er ikke udfyldt endnu.")};
  const LONG_H=8;
  window.outTxt=function(x){if(x.st!="ude"||!x.la)return null;const m=Math.max(0,Math.floor((Date.now()-Date.parse(x.la))/60000)),h=Math.floor(m/60),mm=m%60;return {m,txt:(h?h+" t ":"")+mm+" min",long:m>=LONG_H*60}};
  window.setupBox=function(x){const o=outTxt(x),t=x.by?setupTxt(x):"";if(!t&&!o)return "";const ok=x.zv||x.bo;
    return (o?`<div class="mut" style="margin:6px 0">⏱ ${tr("Ude i")} <b>${o.txt}</b>${o.long?` <span class="tag w">${tr("usædvanligt længe")}</span>`:""}</div>`:"")+(t?`<div style="margin:8px 0;padding:10px 12px;border-radius:14px;background:color-mix(in srgb,${ok?"var(--acc)":"var(--mut)"} 14%,transparent)"><b>${ok?"🔧 ":""}${esc(t)}</b></div>`:"")};
  // ───── Fejllog: telefonerne melder uventede fejl til platformen ─────
  (function(){
    const seen=new Set();let n=0;
    function rep(msg,place,stack){
      try{if(!S.live||!sb||!S.liveUid||n>=5)return;msg=String(msg||"").slice(0,300);const k=msg+place;if(seen.has(k))return;seen.add(k);n++;
        sb.rpc("log_client_error",{p_msg:msg,p_place:String(place||"").slice(0,200),p_stack:String(stack||"").slice(0,1500),p_ua:navigator.userAgent.slice(0,180),p_ver:VER.slice(0,30)}).then(()=>{},()=>{})}catch(e){}
    }
    window.addEventListener("error",e=>rep(e.message,(e.filename||"")+":"+e.lineno,e.error&&e.error.stack));
    window.addEventListener("unhandledrejection",e=>{const r=e.reason;rep(r&&r.message||r,"promise",r&&r.stack)});
  })();
  window.errLoad=async function(){S.perrs=null;S.perrMsg="Henter …";render();const r=await sb.rpc("platform_errors",{p_limit:100});if(r.error){S.perrMsg=errm(r.error);S.perrs=[]}else{S.perrs=r.data||[];S.perrMsg=""}render()};
  window.errClear=async function(){const r=await sb.rpc("platform_clear_errors");if(r.error){toast(errm(r.error));return}S.perrs=[];render()};
  const _pv=platView;platView=function(){
    const h=_pv();
    const card=`<div class="card"><h3>Fejllog</h3><div class="mut">Uventede fejl fra deltagernes og butikkernes telefoner (de seneste 30 dage).</div>${S.perrMsg?`<div class="mut">${esc(S.perrMsg)}</div>`:""}${(S.perrs||[]).length?`<div style="max-height:320px;overflow:auto">${S.perrs.map(e=>`<div class="mut" style="border-top:1px solid var(--line,#ddd);padding:6px 0"><b>${esc(e.msg)}</b><br>${new Date(e.created_at).toLocaleString("da-DK")} · ${esc(e.camp||"–")} · ${esc(e.role||"–")} · ${esc(e.ver||"")}<br>${esc(e.place||"")}</div>`).join("")}</div><button class="btn alt" onclick="errClear()">Ryd loggen</button>`:(S.perrs?`<div class="mut">Ingen fejl 🎉</div>`:"")}<button class="btn alt" onclick="errLoad()">Vis fejllog</button></div>`;
    const i=h.lastIndexOf('<button class="btn alt" onclick="platRefresh()">');
    return i<0?h+card:h.slice(0,i)+card+h.slice(i);
  };
  // ───── Historik pr. ski og kommentarer ─────
  const _sr=skiRow;skiRow=function(s,i){
    let h=_sr(s,i);
    if(S.live&&(S.role=="Skiforretning"||S.role=="Arrangør")){h=h.replace(/(Ude hos [^<]*<\/div>)/,"$1"+setupBox(s));h=h.replace('<button class="chip" onclick="S.modal={q1:',`<button class="chip" onclick="skiHist(${i})">🕘 Historik</button><button class="chip" onclick="lendOpen(${i})">Udlån til…</button><button class="chip" onclick="S.modal={q1:`)}
    return h;
  };
  window.skiHist=async function(i){const x=S.skilist[i];S.modal={hist:i,rows:null,err:""};render();const r=await sb.rpc("ski_history",{p_ski:idOf(x)});if(!S.modal||S.modal.hist!==i)return;if(r.error)S.modal.err=errm(r.error);S.modal.rows=r.data||[];render()};
  const dt=v=>v?new Date(v).toLocaleString("da-DK",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  window.cmOpen=async function(){S.modal={cm:1,rows:null,err:""};render();const r=await sb.rpc("ski_comments");if(!S.modal||!S.modal.cm)return;if(r.error)S.modal.err=errm(r.error);S.modal.rows=r.data||[];render()};
  // ───── Manuel tilmelding og udlån ─────
  let FQ=0;
  window.findGo=function(q){S.modal.q=q;const my=++FQ;if((q||"").trim().length<2){S.modal.res=[];render();return}
    sb.rpc("find_participants",{p_q:q}).then(r=>{if(my!==FQ||!S.modal)return;S.modal.res=r.data||[];S.modal.ferr=r.error?errm(r.error):"";render();const e=document.getElementById("fq");if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length)}})};
  window.lendOpen=function(i){S.modal={lend:i,q:"",res:[]};render()};
  window.lendDo=async function(i,uid){const x=S.skilist[i];const r=await sb.rpc("org_lend",{p_ski:idOf(x),p_user:uid});if(r.error){toast(errm(r.error));return}S.modal={sc:i};await loadCampData(true);toast("Skien er udlånt ✓")};
  window.euOpen=function(i){S.modal={eu:i,q:"",res:[]};render()};
  window.euAdd=async function(i,uid){const w=S.ws[i];const r=await sb.rpc("org_enroll",{p_ws:w._id,p_user:uid,p_extra:[],p_force:false});if(r.error){toast(errm(r.error));return}S.modal={eu:i,q:"",res:[]};await loadCampData(true);S.modal={eu:i,q:"",res:[]};render();toast("Deltageren er tilmeldt ✓")};
  window.euDel=async function(i,uid){if(!confirm(tr("Fjern deltageren fra holdet?")))return;const w=S.ws[i];const r=await sb.rpc("org_unenroll",{p_ws:w._id,p_user:uid});if(r.error){toast(errm(r.error));return}await loadCampData(true);S.modal={eu:i,q:"",res:[]};render();toast("Deltageren er fjernet ✓")};
  const srch=(go)=>`<input id="fq" placeholder="${tr("Søg på navn")}" value="${esc(S.modal.q||"")}" oninput="findGo(this.value)" autocomplete="off">${S.modal.ferr?`<div class="mut" style="color:var(--acc)">${esc(S.modal.ferr)}</div>`:""}`;
  const _md4=modal;modal=function(){
    const m=S.modal;
    if(m&&m.hist!=null){const x=S.skilist[m.hist];
      return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>${esc(x.br+" "+x.m)} · ${esc(x.id||"")}</h3><div class="mut">${tr("Historik")}</div>${m.err?`<div class="mut" style="color:var(--acc)">${esc(m.err)}</div>`:""}${m.rows==null?`<div class="mut">${tr("Henter …")}</div>`:(m.rows.length?m.rows.map(r=>`<div style="border-top:1px solid var(--line,#ddd);padding:8px 0"><b>${esc(r.borrower||"–")}</b><div class="mut">${tr("Ud")} ${dt(r.out_at)} · ${r.back_at?tr("Tilbage")+" "+dt(r.back_at):tr("Stadig ude")}</div>${r.stars?`<div style="color:var(--acc)">${"★".repeat(r.stars)}${"☆".repeat(5-r.stars)}</div>`:""}${r.comment?`<div class="mut">“${esc(r.comment)}”</div>`:""}</div>`).join(""):`<div class="mut">${tr("Ingen udlån endnu.")}</div>`)}<button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.sc!=null){const k=S.skilist[m.sc];if(!k){S.modal=null;return _md4()}
      const out=k.st=="ude";
      return `<div class="modal"><div class="card" style="max-height:90vh;overflow:auto"><h3>${esc(k.br+" "+k.m)}</h3><div class="mut">${esc(k.id||"")} · ${esc(k.sh||"")}</div><div class="mut">${k.l} cm · radius ${k.r} m · ${k.b} mm · ${esc(k.lv||"")}</div><div style="margin:10px 0"><span class="tag ${out?"w":""}">${out?tr("Ude"):tr("Inde")}</span> ${k.bad?`<span class="tag w">${esc(k.bad)}</span>`:""}</div>${out&&k.by?`<div class="mut">${tr("Ude hos")} <b>${esc(k.by)}</b></div>${setupBox(k)}`:""}${k.bad&&k.badNote?`<div class="mut">${esc(k.badNote)}</div>`:""}${out?`<button class="btn" onclick="scDone(${m.sc})">${tr("Markér som afleveret")}</button>`:(k.bad?"":`<button class="btn" onclick="lendOpen(${m.sc})">${tr("Lån ud til en deltager")}</button>`)}<button class="btn alt" onclick="S.modal={bd:${m.sc}};render()">${k.bad?tr("Udstyret er klar igen"):tr("Markér som skadet eller mistet")}</button><button class="btn alt" onclick="skiHist(${m.sc})">🕘 ${tr("Historik")}</button><button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.lbm){return `<div class="modal"><div class="card" style="max-height:90vh;overflow:auto;padding:12px">${lbCard()}<button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.cm){return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>${tr("Kommentarer til udstyret")}</h3>${m.err?`<div class="mut" style="color:var(--acc)">${esc(m.err)}</div>`:""}${m.rows==null?`<div class="mut">${tr("Henter …")}</div>`:(m.rows.length?m.rows.map(r=>`<div style="border-top:1px solid var(--line,#ddd);padding:8px 0"><b>${esc(r.brand+" "+r.model)}</b> <span style="color:var(--acc)">${"★".repeat(r.stars)}</span><div class="mut">“${esc(r.comment)}”</div></div>`).join(""):`<div class="mut">${tr("Ingen kommentarer endnu.")}</div>`)}<button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.lend!=null){const x=S.skilist[m.lend];
      return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>${tr("Udlån")} ${esc(x.br+" "+x.m)}</h3><div class="mut">${esc(x.id||"")} · ${tr("Find deltageren")}</div>${srch()}${(m.res||[]).map(p=>`<div class="row" style="align-items:center;padding:6px 0"><span>${esc(p.name)}${p.email?`<div class="mut">${esc(p.email)}</div>`:""}</span><button class="chip" onclick="lendDo(${m.lend},'${p.id}')">${tr("Udlån")}</button></div>`).join("")}<button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.eu!=null){const w=S.ws[m.eu];
      return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>${esc(w.t)}</h3><div class="mut">${w.tm} · ${w.n}/${w.max} ${tr("pladser")}</div>${(w.pax||[]).map(p=>`<div class="row" style="align-items:center;padding:4px 0"><span>${esc(p.n)}</span><button class="chip" onclick="euDel(${m.eu},'${p._uid}')">${tr("Fjern")}</button></div>`).join("")||`<div class="mut">${tr("Ingen tilmeldte")}</div>`}<h3 style="margin-top:14px">${tr("Tilmeld en deltager")}</h3>${srch()}${(m.res||[]).map(p=>`<div class="row" style="align-items:center;padding:6px 0"><span>${esc(p.name)}${p.email?`<div class="mut">${esc(p.email)}</div>`:""}</span><button class="chip" onclick="euAdd(${m.eu},'${p.id}')">${tr("Tilmeld")}</button></div>`).join("")}<div class="mut">${tr("Arrangøren kan tilmelde uanset tidspunkt, men holdet må ikke være fuldt.")}</div><button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    return _md4();
  };
  // ───── Top 5 pr. kategori på tværs af butikker ─────
  window.lbLoad=async function(){S.lbBusy=true;const r=await sb.rpc("leaderboard",{p_min:3});S.lbBusy=false;if(r.error){S.lbErr=errm(r.error);S.lb=null}else{S.lbErr="";S.lb=r.data}if(!S.modal||S.modal.lbm)render();else render()};
  const lbRows=(arr,mine,mode)=>arr.length?arr.map((r,i)=>`<div class="row" style="padding:7px 0;border-top:1px solid var(--line);align-items:center${r.shop==mine?";background:color-mix(in srgb,var(--acc) 10%,transparent);margin:0 -8px;padding-left:8px;padding-right:8px;border-radius:10px":""}"><span><b>${["🥇","🥈","🥉","4.","5."][i]}</b> ${esc(r.brand+" "+r.model)}<div class="mut" style="font-size:13px">${esc(r.shop)}${r.shop==mine?" · jer":""}</div></span><span style="text-align:right">${mode=="loans"?`<b>${r.loans}</b> ${tr("udlån")}`:`<b style="color:var(--acc)">★ ${Number(r.avg).toFixed(1)}</b><div class="mut" style="font-size:13px">${r.ratings} ${tr("bedømmelser")}</div>`}</span></div>`).join(""):`<div class="mut" style="padding:6px 0">${mode=="loans"?tr("Ingen udlån endnu."):tr("Endnu ikke nok bedømmelser (mindst 3 pr. model).")}</div>`;
  window.lbCard=function(){
    if(S.lb===undefined&&!S.lbBusy)setTimeout(lbLoad,0);
    const d=S.lb,ks=d&&d.kinds||[];if(!S.lbk||!ks.some(k=>k.kind==S.lbk))S.lbk=(ks.find(k=>k.kind=="Ski")||ks[0]||{}).kind;
    const k=ks.find(x=>x.kind==S.lbk);
    return `<div class="card"><h3>🏆 ${tr("Top 5 på tværs af butikker")}</h3><div class="mut">${tr("Hvem har de mest lånte og de bedst bedømte modeller? En model skal have mindst 3 bedømmelser for at komme med på listen over bedst bedømte.")}</div>${S.lbErr?`<div class="mut" style="color:var(--acc)">${esc(S.lbErr)}</div>`:""}${!d&&!S.lbErr?`<div class="mut">${tr("Henter …")}</div>`:""}${d?`<div class="chips" style="margin-top:10px">${ks.map(x=>`<button class="chip ${x.kind==S.lbk?"on":""}" onclick="S.lbk='${x.kind}';render()">${kIc(x.kind)} ${x.kind}</button>`).join("")}</div>${k?`<h3 style="margin-top:6px">${tr("Mest lånte")}</h3>${lbRows(k.loans,d.mine,"loans")}<h3 style="margin-top:14px">${tr("Højest bedømte")}</h3>${lbRows(k.rated,d.mine,"rated")}`:`<div class="mut">${tr("Ingen data endnu.")}</div>`}<button class="btn alt" onclick="S.lb=undefined;render()">${tr("Opdater")}</button>`:""}</div>`};
  window.lbOpen=function(){S.lb=undefined;S.modal={lbm:1};render()};
  // ───── Små detaljer: lyd, vibration, træk for at opdatere, minut-opdatering ─────
  let AC=null;
  window.fx=function(kind){try{if(navigator.vibrate)navigator.vibrate(kind=="err"?[60,70,60]:30)}catch(e){}
    try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();if(AC.state=="suspended")AC.resume();
      const t0=AC.currentTime+.01,notes=kind=="err"?[[392,0],[330,.14]]:kind=="ok2"?[[659,0]]:[[784,0],[1047,.11]];
      const master=AC.createGain();master.gain.value=.5;master.connect(AC.destination);
      notes.forEach(([f,d])=>{[[1,1],[2,.12]].forEach(([m,a])=>{const o=AC.createOscillator(),g=AC.createGain();o.type="sine";o.frequency.value=f*m;
        const t=t0+d,pk=.16*a;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(pk,t+.012);g.gain.exponentialRampToValueAtTime(0.0001,t+(kind=="err"?.42:.34));
        o.connect(g);g.connect(master);o.start(t);o.stop(t+.45)})})}catch(e){}};
  const _toast=toast;toast=function(m){try{const s=String(m||"");if(/✓\s*$/.test(s))fx("ok");else if(/kunne ikke|fejl|ikke ledig|allerede/i.test(s))fx("err")}catch(e){}return _toast(m)};
  (function(){let y0=null,dy=0,ind=null;
    const mainEl=e=>{const m=e.target&&e.target.closest&&e.target.closest("main");return m&&m.scrollTop<=0&&S.live&&S.liveUid&&!S.modal?m:null};
    document.addEventListener("touchstart",e=>{y0=mainEl(e)?e.touches[0].clientY:null;dy=0},{passive:true});
    document.addEventListener("touchmove",e=>{if(y0==null)return;dy=e.touches[0].clientY-y0;if(dy>10){if(!ind){ind=document.createElement("div");ind.style.cssText="position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:8;background:var(--card);box-shadow:var(--sh);border-radius:30px;padding:8px 16px;font:600 14px system-ui;color:var(--mut)";document.body.appendChild(ind)}ind.textContent=dy>80?"↻ "+tr("Slip for at opdatere"):"↓ "+tr("Træk for at opdatere");ind.style.opacity=Math.min(1,dy/60)}},{passive:true});
    document.addEventListener("touchend",async()=>{const go=y0!=null&&dy>80;y0=null;if(ind){ind.remove();ind=null}if(go){try{await loadCampData(true);render();toast(tr("Opdateret")+" ✓")}catch(e){}}});
  })();
  setInterval(()=>{if(S.live&&S.liveUid&&!S.modal&&(S.role=="Skiforretning"||S.role=="Arrangør")&&(S.tab=="shop"||S.tab=="myski")){const a=document.activeElement;if(!(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)))render()}},60000);
  // ───── Besked til en gruppe ─────
  window.gmOpen=async function(){S.modal={gm:1,aud:"all",ref:"",t:"",x:"",sent:null};render();const r=await sb.rpc("sent_messages");if(S.modal&&S.modal.gm){S.modal.sent=r.data||[];render()}};
  function gmKeep(){const m=S.modal;if(!m||!m.gm)return;const g=id=>{const e=document.getElementById(id);return e?e.value:null};const a=g("gm_a"),r=g("gm_r"),t=g("gm_t"),x=g("gm_x");if(a!=null)m.aud=a;if(r!=null)m.ref=r;if(t!=null)m.t=t;if(x!=null)m.x=x}
  window.gmAud=function(){gmKeep();S.modal.ref="";render()};
  window.gmSend=async function(){gmKeep();const m=S.modal;if(m.busy)return;
    if(!(m.t||"").trim()){toast(tr("Skriv en overskrift."));return}
    if((m.aud=="ws"||m.aud=="shop")&&!m.ref){toast(tr("Vælg et hold eller en butik."));return}
    m.busy=true;render();
    const r=await sb.rpc("send_group_message",{p_title:m.t,p_body:m.x||null,p_audience:m.aud,p_ref:m.ref||null});
    if(r.error){m.busy=false;toast(errm(r.error));render();return}
    const d=r.data||{};S.modal=null;render();
    let pushTxt="";
    try{const q=await sb.functions.invoke("send-push",{body:{title:m.t,body:m.x||"",user_ids:d.user_ids||[]}});
      if(q.error){pushTxt=" ("+tr("push kunne ikke sendes")+")"}else{const n=q.data&&typeof q.data.sent=="number"?q.data.sent:null;pushTxt=n>0?" · "+tr("Push-besked sendt til")+" "+n+" "+tr("enheder"):" · "+tr("ingen telefoner har slået push til")}}catch(e){pushTxt=" ("+tr("push kunne ikke sendes")+")"}
    toast(tr("Sendt til")+" "+d.count+" "+tr("deltagere")+pushTxt+" ✓")};
  async function msgLoad(){if(S.role!="Deltager"||!S.liveUid)return;const r=await sb.rpc("my_messages");if(!r.error){S.msgs=r.data||[]}}
  const _lcd=loadCampData;loadCampData=async function(q){const x=await _lcd(q);try{await msgLoad()}catch(e){}return x};
  const seenKey=()=>"snows_msgseen_"+S.liveUid;
  const seenAt=()=>{try{return localStorage.getItem(seenKey())||""}catch(e){return ""}};
  const fmtD=v=>new Date(v).toLocaleString("da-DK",{weekday:"short",hour:"2-digit",minute:"2-digit"});
  window.msgCard=function(){const ms=S.msgs||[];if(!ms.length)return "";const sa=seenAt(),nw=ms.filter(m=>m.created_at>sa).length;
    return `<div class="card"><div class="row"><h3>📩 ${tr("Beskeder")}</h3>${nw?`<span class="tag w">${nw} ${tr("nye")}</span>`:""}</div>${ms.slice(0,2).map(m=>`<div style="border-top:1px solid var(--line);padding:8px 0"><b>${esc(m.title)}</b>${m.body?`<div class="mut">${esc(m.body)}</div>`:""}<div class="mut" style="font-size:12px">${fmtD(m.created_at)}</div></div>`).join("")}${ms.length>2?`<button class="btn alt" onclick="msgAll()">${tr("Se alle beskeder")} (${ms.length})</button>`:`<button class="chip" onclick="msgSeen()">${tr("Markér som læst")}</button>`}</div>`};
  window.msgSeen=function(){try{localStorage.setItem(seenKey(),new Date().toISOString())}catch(e){}render()};
  window.msgAll=function(){S.modal={msgs:1};msgSeen()};
  const _md5=modal;modal=function(){const m=S.modal;
    if(m&&m.msgs){return `<div class="modal"><div class="card" style="max-height:88vh;overflow:auto"><h3>📩 ${tr("Beskeder")}</h3>${(S.msgs||[]).map(x=>`<div style="border-top:1px solid var(--line);padding:8px 0"><b>${esc(x.title)}</b>${x.body?`<div class="mut">${esc(x.body)}</div>`:""}<div class="mut" style="font-size:12px">${fmtD(x.created_at)}</div></div>`).join("")}<button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button></div></div>`}
    if(m&&m.gm){const aud=m.aud,wsOpts=(S.ws||[]).filter(w=>w._id).map(w=>`<option value="${w._id}" ${m.ref==w._id?"selected":""}>${esc(w.t)} · ${esc(w.tm)}</option>`).join(""),shOpts=(S.shops||[]).filter(s=>s._id).map(s=>`<option value="${s._id}" ${m.ref==s._id?"selected":""}>${esc(s.n)}</option>`).join("");
      return `<div class="modal"><div class="card" style="max-height:90vh;overflow:auto"><h3>${tr("Besked til en gruppe")}</h3><div class="mut">${tr("Beskeden vises i deltagernes app og sendes som push til dem, der har slået beskeder til.")}</div>
      <select id="gm_a" onchange="gmAud()"><option value="all" ${aud=="all"?"selected":""}>${tr("Alle deltagere")}</option><option value="ws" ${aud=="ws"?"selected":""}>${tr("Et bestemt hold")}</option><option value="out" ${aud=="out"?"selected":""}>${tr("Alle med udstyr ude")}</option><option value="shop" ${aud=="shop"?"selected":""}>${tr("Lånere hos en butik")}</option></select>
      ${aud=="ws"?`<select id="gm_r"><option value="">${tr("Vælg hold")}</option>${wsOpts}</select>`:""}${aud=="shop"?`<select id="gm_r"><option value="">${tr("Vælg butik")}</option>${shOpts}</select>`:""}
      <input id="gm_t" maxlength="120" placeholder="${tr("Overskrift")}" value="${esc(m.t||"")}"><textarea id="gm_x" rows="4" maxlength="1000" placeholder="${tr("Besked")}">${esc(m.x||"")}</textarea>
      <button class="btn" onclick="gmSend()" ${m.busy?"disabled":""}>${m.busy?tr("Sender …"):tr("Send besked")}</button><button class="btn alt" onclick="S.modal=null;render()">${tr("Luk")}</button>
      ${(m.sent||[]).length?`<h3 style="margin-top:16px">${tr("Sendt før")}</h3>${m.sent.slice(0,6).map(s=>`<div class="mut" style="border-top:1px solid var(--line);padding:6px 0"><b>${esc(s.title)}</b><br>${esc(s.label||"")} · ${s.recipients} ${tr("modtagere")} · ${fmtD(s.created_at)}</div>`).join("")}`:""}</div></div>`}
    return _md5()};
  // Kommentarer på butikkens overblik og et felt hos arrangøren
  const _sd=shopDash;shopDash=function(){const h=_sd();return h+`<button class="btn alt" onclick="cmOpen()">💬 ${tr("Se kommentarer")}</button>`};

  // Genskab login ved genindlæsning
  sb.auth.getSession().then(r=>{if(r.data&&r.data.session){if(!navigator.onLine&&restoreSnap(r.data.session.user.id))return;afterLogin({mode:"restore"}).then(()=>flushQ())}else render()});
  render();
})();
