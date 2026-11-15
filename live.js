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
  demoBar=function(){return ""};

  const errm=e=>(e&&e.message)||"Noget gik galt. Prøv igen.";
  const okMail=e=>/^\S+@\S+\.\S+$/.test(e);
  const fail=m=>{S.serr=m;render()};

  // Fjern prototype-hjælp fra login og kode-skærm
  const _av=authView;authView=function(){return _av().replace(/<p class="mut" style="margin-top:14px">Prototype[\s\S]*?<\/p>/,"")};
  const _vv=verifyView;verifyView=function(){return _vv().replace(/<div class="card" style="margin-top:14px">[\s\S]*$/,"")};

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
    const m=await sendOtp(v.e);if(m){fail(m);return}
    v.sent=Date.now();v.tries=0;S.serr="";toast("Ny kode sendt til "+v.e);
  };

  verifyGo=async function(){
    const v=S.vf,c=($("#vf_c").value||"").trim();
    if(v.tries>=5){fail("For mange forkerte forsøg. Send en ny kode.");return}
    if(!/^\d{6}$/.test(c)){fail("Skriv de 6 cifre fra mailen.");return}
    const r=await sb.auth.verifyOtp({email:v.e,token:c,type:"email"});
    if(r.error||!r.data||!r.data.session){v.tries++;fail(v.tries>=5?"For mange forkerte forsøg. Send en ny kode.":"Koden er forkert eller udløbet. Du har "+(5-v.tries)+" forsøg tilbage.");return}
    await afterLogin(v);
  };

  async function getProfile(uid){
    const r=await sb.from("profiles").select("id,role,name,email,boot_mm,z_value,shop_id,camp_id,camps(name),shops(name)").eq("id",uid).maybeSingle();
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
      enter({role:pr.role,camp:(pr.camps&&pr.camps.name)||"Camp",who:pr.name,shop:pr.shops&&pr.shops.name});
      S.vf=null;S.auth="login";S.modal=null;render();
    }catch(e){S.user=null;S.vf=null;S.auth="login";fail(errm(e))}
  }

  const _lo=logout;
  logout=async function(){try{await sb.auth.signOut()}catch(e){}S.pc=[];_lo()};

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
    return `<h2>Platform</h2><div class="mut">Her opretter du camps og inviterer arrangører. Arrangøren logger ind med den e-mail, du skriver.</div>
<div class="card"><h3>Opret camp</h3><input id="pc_n" placeholder="Campens navn"><input id="pc_c" placeholder="Camp-kode (4-12 bogstaver/tal)" autocapitalize="characters"><div class="mut">Camp slutter</div><input id="pc_d" type="date"><input id="pc_e" type="email" placeholder="Arrangørens e-mail">${err}${ok}<button class="btn" onclick="platCreate()">Opret camp og inviter arrangør</button></div>
<h2>Camps (${S.pc.length})</h2>${S.pc.length?S.pc.map(c=>`<div class="card"><h3>${esc(c.name)}</h3><div class="mut">Kode: ${esc(c.code)} · ${c.participants} deltagere · slutter ${esc(c.end_date||"–")}</div><div class="mut">${c.organizer_joined?"Arrangøren er oprettet":"Arrangøren har ikke logget ind endnu"}</div>${c.organizer_joined?"":`<input id="po_${c.id}" type="email" placeholder="Ny arrangør-e-mail"><button class="btn alt" onclick="platOrg('${c.id}')">Skift arrangør</button>`}<button class="btn alt" onclick="platDel('${c.id}')">Slet camp</button></div>`).join(""):`<div class="mut">Ingen camps endnu.</div>`}
<button class="btn alt" onclick="platRefresh()">Opdatér</button><button class="btn alt" onclick="logout()">Log ud</button>`;
  }
  const _vw=view;view=function(){return S.live&&S.role=="Platform"&&S.tab=="plat"?platView():_vw()};
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

  // Genskab login ved genindlæsning
  sb.auth.getSession().then(r=>{if(r.data&&r.data.session)afterLogin({mode:"restore"});else render()});
  render();
})();
