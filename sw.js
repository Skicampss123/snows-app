/* Snow's – offline-visning og push-beskeder */
const CACHE="snows-v1";
self.addEventListener("install",e=>{self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k!=CACHE).map(k=>caches.delete(k)));await self.clients.claim()})())});
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!="GET")return;
  const u=new URL(r.url);
  const ok=u.origin==location.origin||u.hostname=="cdn.jsdelivr.net";
  if(!ok)return;                       // databasen (Supabase) går altid direkte
  e.respondWith((async()=>{
    try{const n=await fetch(r);if(n&&n.ok){const c=await caches.open(CACHE);c.put(r,n.clone())}return n}
    catch(err){const c=await caches.match(r,{ignoreSearch:r.mode=="navigate"});if(c)return c;if(r.mode=="navigate"){const i=await caches.match("./")||await caches.match("index.html");if(i)return i}throw err}
  })());
});
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(x){d={title:"Snow's",body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"Snow's",{body:d.body||"",icon:"icons/icon-192.png",badge:"icons/icon-192.png",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil((async()=>{const cs=await self.clients.matchAll({type:"window",includeUninstalled:false});
    for(const c of cs){if("focus" in c)return c.focus()}
    return self.clients.openWindow(e.notification.data&&e.notification.data.url||"./")})());
});
