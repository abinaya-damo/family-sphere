/* Family Sphere Supabase bridge.
   This file intentionally adds no UI. It keeps the existing website look/behavior
   and swaps persistence/authentication to Supabase when the backend is configured. */
(function(){
  'use strict';
  const SESSION_KEY='familySphereSupabaseSessionV1';
  const LAST_PAGE_KEY='familySphereLastPageV1';
  const TAB_RESUME_KEY='familySphereTabResumeV1';
  const RESUME_TARGET_KEY='familySphereResumeTargetV1';
  const RESUMABLE_PAGES=new Set(['home','tree','chat','vault','help','events','account']);
  let backendConfigured=false;
  let healthChecked=false;
  let session=null;
  let applyingRemote=false;
  let lastRemoteUpdatedAt='';
  let lastPushedSignature='';
  let syncTimer=null;
  let pollTimer=null;
  let joinPollTimer=null;
  let helpPollTimer=null;
  let documentPollTimer=null;
  let notificationPollTimer=null;
  let mutationWatchTimer=null;
  let lastObservedSignature='';
  let realtimeAbort=null;
  let realtimeReconnectTimer=null;
  let realtimePullTimer=null;
  let pendingRealtimeUpdatedAt='';
  let lastRemoteDocsSignature='';
  let remoteNotifications=[];
  let notificationsLoaded=false;
  let localDirty=false;
  let uploadBusy=false;
  let syncState='idle';
  let lastSyncError='';
  const helpMigrationDone=new Set();

  const originals={
    login:window.startupLoginSubmit,
    create:window.startupCreateFamily,
    join:window.startupJoinFamily,
    refreshAnchor:window.refreshStartupJoinAnchor,
    approve:window.approveJoinRequest,
    reject:window.rejectJoinRequest,
    viewDoc:window.viewStoredDocument,
    downloadDoc:window.downloadStoredDocument,
    addDoc:window.addDocument,
    deleteDoc:window.deleteStoredDocument,
    deleteDocCategory:window.deleteDocumentCategory,
    logout:window.logoutAccount,
    closeFamily:window.closeFamilySpace,
    addHelp:window.addHelp,
    deleteHelp:window.deleteHelpRequest,
    volunteerHelp:window.volunteerHelp,
    cancelHelp:window.cancelVolunteer
  };

  // v257: keep the Supabase browser session. Once a member signs in successfully,
  // refreshes and future opens on this browser auto-resume the same approved member.
  try{session=JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{session=null}

  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

  async function rawApi(action,payload={},withAuth=true,retry=true){
    const maxAttempts=retry?3:1;
    let lastError=null;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      try{
        const headers={'Content-Type':'application/json'};
        if(withAuth&&session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),15000);
        const res=await fetch('/api/family-sphere',{method:'POST',headers,body:JSON.stringify({action,...payload}),signal:controller.signal,cache:'no-store'}).finally(()=>clearTimeout(timeout));
        const json=await res.json().catch(()=>({ok:false,error:`Backend returned ${res.status}`}));
        if(res.status===401&&withAuth&&session?.refresh_token){
          const refreshed=await rawApi('refresh_auth',{refreshToken:session.refresh_token},false,false).catch(()=>null);
          if(refreshed?.session){saveSession(refreshed.session);return rawApi(action,payload,withAuth,false)}
        }
        if(!res.ok||json?.ok===false){
          const err=new Error(json?.error||`Backend request failed (${res.status})`);err.status=res.status;err.payload=json;
          if(res.status===409||res.status<500)throw err;
          lastError=err;
        }else return json;
      }catch(err){
        lastError=err;
        if(err?.status===409||err?.status===400||err?.status===401||err?.status===403||err?.status===404||err?.status===413||err?.status===415)throw err;
      }
      if(attempt<maxAttempts)await sleep(350*Math.pow(2,attempt-1));
    }
    if(lastError&&(/Failed to fetch|fetch failed|NetworkError|AbortError/i).test(String(lastError?.message||lastError)))throw new Error(apiRuntimeHint());
    throw lastError||new Error(apiRuntimeHint());
  }


  function apiRuntimeHint(){
    if(location.protocol==='file:')return 'Open Family Sphere through http://localhost:3000, not the HTML file directly.';
    return 'Family Sphere API is unavailable. Check that your hosting runs the Next.js server/API routes and that Supabase environment variables are configured.';
  }
  function ensureSyncIndicator(){
    let el=document.getElementById('familySphereSyncIndicator');
    if(el)return el;
    el=document.createElement('div');el.id='familySphereSyncIndicator';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    Object.assign(el.style,{position:'fixed',right:'14px',bottom:'14px',zIndex:'99999',padding:'7px 11px',borderRadius:'999px',font:'600 12px system-ui',boxShadow:'0 4px 18px rgba(0,0,0,.14)',background:'#fff',color:'#24324a',border:'1px solid rgba(0,0,0,.1)',display:'none'});
    document.body.appendChild(el);return el;
  }

  function setSyncStatus(next,message=''){
    syncState=next;lastSyncError=message||'';
    if(!document.body)return;
    const el=ensureSyncIndicator();
    const labels={offline:'Offline · changes kept locally',error:'Sync issue · retrying',conflict:'Newer family update detected · retrying'};
    // Normal background syncing is intentionally silent. Only actionable problems
    // are shown so document add/delete does not flash Saving… / Saved notifications.
    if(next==='saving'||next==='saved'||next==='idle'){
      el.style.display='none';
      return;
    }
    el.textContent=labels[next]||message||'';
    el.style.display='block';
  }

  window.familySphereSyncStatus=()=>({state:syncState,error:lastSyncError,online:navigator.onLine});

  function saveSession(next){
    session=next||null;
    if(session){
      localStorage.setItem(SESSION_KEY,JSON.stringify(session));
      try{sessionStorage.setItem(TAB_RESUME_KEY,'1')}catch{}
    }else{
      localStorage.removeItem(SESSION_KEY);
      try{sessionStorage.removeItem(TAB_RESUME_KEY);sessionStorage.removeItem(RESUME_TARGET_KEY)}catch{}
    }
  }

  async function changePasswordFromAnySignedInBrowser(){
    // V274: Account & Security must use the real Supabase auth session, not the
    // browser-local familyRegistry. That local registry can differ between browsers.
    if(!backendConfigured)await checkBackend().catch(()=>false);

    if(!session?.access_token && session?.refresh_token){
      try{
        const refreshed=await rawApi('refresh_auth',{refreshToken:session.refresh_token},false,false);
        if(refreshed?.session)saveSession(refreshed.session);
      }catch{}
    }

    if(!session?.access_token){
      showToast('Your sign-in session needs to be restored. Please refresh this page.');
      return;
    }

    // Confirm that this browser is still an approved family member before allowing
    // an account security change.
    try{
      const access=await rawApi('current_access',{},true,false);
      if(!access?.membership){
        showToast('This account no longer has access to the family.');
        return;
      }
      clearRemovedAccessWarning?.();
    }catch(e){
      if(e?.status===401){
        showToast('Your sign-in session expired. Please refresh this page.');
        return;
      }
      showToast('Could not verify the signed-in account. Please try again.');
      return;
    }

    const next=prompt('Enter a new password (minimum 6 characters):');
    if(next===null)return;
    if(next.length<6){showToast('Password must be at least 6 characters');return}
    const confirmPassword=prompt('Re-enter the new password:');
    if(confirmPassword===null)return;
    if(confirmPassword!==next){showToast('Passwords do not match');return}

    try{
      await rawApi('change_password',{password:next},true,false);

      // Keep the old local prototype registry in sync when it exists, but it is
      // no longer the authority for password changes.
      try{
        const hit=typeof currentFamilyAccount==='function'?currentFamilyAccount():null;
        if(hit?.account && typeof simplePasswordHash==='function'){
          hit.account.passwordHash=simplePasswordHash(next);
          if(typeof persistRegistry==='function')persistRegistry();
        }
      }catch{}

      showToast('Password changed successfully');
    }catch(e){
      if(e?.status===401){
        showToast('Your sign-in session expired. Please refresh and try again.');
      }else{
        showToast(e?.message||'Could not change password. Please try again.');
      }
    }
  }

  // Override the legacy browser-local password function for every browser/device.
  window.changeCurrentPassword=changePasswordFromAnySignedInBrowser;

  async function checkBackend(force=false){
    if(healthChecked&&!force&&backendConfigured)return true;
    healthChecked=true;
    try{const h=await rawApi('health',{},false,false);backendConfigured=!!h.configured}catch{backendConfigured=false}
    return backendConfigured;
  }

  function localPhotos(){try{return typeof treePhotos==='object'&&treePhotos?treePhotos:{}}catch{return{}}}
  function localRemovedMembers(){try{return Array.isArray(removedMembers)?removedMembers:[]}catch{return[]}}
  function currentFamilyId(){try{return String(activeFamilyId||accountState?.familyId||'')}catch{return''}}
  function rememberedPage(){try{const id=localStorage.getItem(LAST_PAGE_KEY)||'tree';return RESUMABLE_PAGES.has(id)?id:'tree'}catch{return'tree'}}
  function rememberPage(id){try{if(RESUMABLE_PAGES.has(String(id||'')))localStorage.setItem(LAST_PAGE_KEY,String(id))}catch{}}
  function resumeTargetPage(){
    try{
      const fixed=String(sessionStorage.getItem(RESUME_TARGET_KEY)||'');
      if(RESUMABLE_PAGES.has(fixed))return fixed;
      const sameTab=sessionStorage.getItem(TAB_RESUME_KEY)==='1';
      const nav=performance.getEntriesByType?.('navigation')?.[0];
      const kind=String(nav?.type||'navigate');
      const target=(sameTab||kind==='reload'||kind==='back_forward')?rememberedPage():'tree';
      sessionStorage.setItem(TAB_RESUME_KEY,'1');
      sessionStorage.setItem(RESUME_TARGET_KEY,target);
      return target;
    }catch{return rememberedPage()}
  }

  function refreshDocumentUI(category=''){
    // Render the cards first, then force their visible counts from the current
    // in-memory document array so Save/Delete is reflected immediately.
    try{
      const renderer=window.renderDocuments||(typeof renderDocuments==='function'?renderDocuments:null);
      renderer?.();
    }catch(e){console.warn('Document count refresh:',e)}
    try{
      const docs=Array.isArray(data?.docs)?data.docs:[];
      const totalByCategory=new Map();
      docs.forEach(doc=>{const cat=String(doc?.cat||'');if(cat)totalByCategory.set(cat,(totalByCategory.get(cat)||0)+1)});
      document.querySelectorAll('#docGrid .doc[data-doc-category]').forEach(card=>{
        const cat=String(card.getAttribute('data-doc-category')||'');
        const count=totalByCategory.get(cat)||0;
        const meta=card.querySelector('p.muted');
        if(meta){
          const access=(typeof categoryAccess==='function'?categoryAccess(cat):'Entire family');
          meta.textContent=`${count} document${count===1?'':'s'} · ${access}`;
        }
      });
      const totalEl=document.getElementById('documentCount');
      if(totalEl)totalEl.textContent=String(docs.length);
    }catch(e){console.warn('Direct document count refresh:',e)}
    try{
      const modal=document.getElementById('docCategoryModal');
      const opener=window.openDocumentCategory||(typeof openDocumentCategory==='function'?openDocumentCategory:null);
      if(category&&opener&&modal&&!modal.classList.contains('hidden'))opener(category);
    }catch(e){console.warn('Document category refresh:',e)}
  }
  function stateSignature(){
    try{return JSON.stringify({familyId:currentFamilyId(),data,photos:localPhotos(),removed:localRemovedMembers()})}catch{return''}
  }
  function documentsSignature(list){
    try{return JSON.stringify((Array.isArray(list)?list:[]).map(doc=>[
      String(doc?.id||''),String(doc?.dbId||''),String(doc?.name||''),String(doc?.cat||''),
      String(doc?.storagePath||''),Number(doc?.fileSize||0),String(doc?.uploadedAt||'')
    ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))}catch{return''}
  }
  function installRemoteDocuments(remoteDocs){
    const docs=Array.isArray(remoteDocs)?remoteDocs:[];
    const signature=documentsSignature(docs);
    if(signature===lastRemoteDocsSignature&&signature===documentsSignature(data?.docs))return false;
    applyingRemote=true;
    try{
      if(!data||typeof data!=='object')return false;
      data.docs=docs.map(doc=>({...doc}));
      lastRemoteDocsSignature=signature;
      try{save()}catch{}
      refreshDocumentUI(openVaultCategory||'');
    }finally{applyingRemote=false}
    return true;
  }

  async function refreshDocumentsRemote(){
    if(!backendConfigured||!session?.access_token)return false;
    const familyId=currentFamilyId();if(!familyId)return false;
    try{
      const result=await rawApi('list_documents',{familyId});
      installRemoteDocuments(Array.isArray(result?.documents)?result.documents:[]);
      return true;
    }catch(e){
      console.warn('Document live refresh:',e?.message||e);
      return false;
    }
  }
  window.familySphereRefreshDocuments=()=>refreshDocumentsRemote();

  function mapRemoteNotification(row){
    return {
      id:String(row?.id||''),
      type:String(row?.type||'activity'),
      title:String(row?.title||''),
      text:String(row?.message||''),
      page:String(row?.target_page||'home'),
      time:Date.parse(row?.created_at||'')||Date.now(),
      read:Boolean(row?.is_read),
      backend:true,
    };
  }

  async function refreshNotificationsRemote(){
    if(!backendConfigured||!session?.access_token)return false;
    const familyId=currentFamilyId();if(!familyId)return false;
    try{
      const result=await rawApi('list_notifications',{familyId});
      remoteNotifications=(result?.notifications||[]).map(mapRemoteNotification);
      notificationsLoaded=true;
      window.familySphereNotificationsBackendReady=true;
      window.familySphereRemoteNotifications=remoteNotifications;
      try{if(typeof renderNotifications==='function')renderNotifications()}catch(e){console.warn('Notification render:',e)}
      return true;
    }catch(e){
      // Keep the last successfully loaded notification list visible during a
      // temporary connection problem instead of replacing it with an empty list.
      console.warn('Notification refresh:',e?.message||e);
      if(notificationsLoaded){
        window.familySphereNotificationsBackendReady=true;
        window.familySphereRemoteNotifications=remoteNotifications;
        try{if(typeof renderNotifications==='function')renderNotifications()}catch{}
      }
      return false;
    }
  }
  window.familySphereRefreshNotifications=()=>refreshNotificationsRemote();
  window.familySphereCreateNotification=async function(payload={}){
    if(!backendConfigured||!session?.access_token)return null;
    const familyId=currentFamilyId();if(!familyId)return null;
    const result=await rawApi('create_notification',{
      familyId,
      type:String(payload.type||'activity'),
      title:String(payload.title||''),
      message:String(payload.text||payload.message||''),
      targetPage:String(payload.page||payload.targetPage||'home'),
      scope:String(payload.scope||'family'),
      recipientPersonId:String(payload.recipientPersonId||''),
      dedupeSeconds:Number(payload.dedupeSeconds||45),
      dedupeKey:String(payload.dedupeKey||''),
    });
    await refreshNotificationsRemote();
    return result;
  };
  window.familySphereMarkNotificationsRead=async function(ids=[]){
    if(!backendConfigured||!session?.access_token)return false;
    const familyId=currentFamilyId();if(!familyId)return false;
    const wanted=new Set((ids||[]).map(String));
    remoteNotifications.forEach(n=>{if(wanted.has(String(n.id)))n.read=true});
    window.familySphereRemoteNotifications=remoteNotifications;
    try{if(notificationsLoaded&&typeof renderNotifications==='function')renderNotifications()}catch{}
    await rawApi('mark_notifications_read',{familyId,ids:[...wanted]});
    return true;
  };
  window.familySphereMarkAllNotificationsRead=async function(){
    if(!backendConfigured||!session?.access_token)return false;
    const familyId=currentFamilyId();if(!familyId)return false;
    remoteNotifications.forEach(n=>{n.read=true});
    window.familySphereRemoteNotifications=remoteNotifications;
    try{if(typeof renderNotifications==='function')renderNotifications()}catch{}
    await rawApi('mark_all_notifications_read',{familyId});
    return true;
  };

  function renderAllAfterRemote(){
    const previousApplying=applyingRemote;
    applyingRemote=true;
    try{
      try{if(typeof renderGraphTree==='function')renderGraphTree()}catch(e){console.warn('Tree refresh:',e)}
      try{if(typeof renderDocuments==='function')renderDocuments()}catch{}
      try{if(typeof renderHelpBoard==='function')renderHelpBoard()}catch{}
      try{const fn=window.renderEvents||(typeof renderEvents==='function'?renderEvents:null);fn?.()}catch{}
      try{const fn=window.renderUpcomingEvents||(typeof renderUpcomingEvents==='function'?renderUpcomingEvents:null);fn?.()}catch{}
      try{if(typeof renderNotifications==='function')renderNotifications()}catch{}
      try{if(typeof renderAccountPage==='function')renderAccountPage()}catch{}
      try{if(typeof renderFamilyAccessBar==='function')renderFamilyAccessBar()}catch{}
      try{if(typeof refreshDashboardGreeting==='function')refreshDashboardGreeting()}catch{}
    }finally{
      applyingRemote=previousApplying;
      lastObservedSignature=stateSignature();
      localDirty=false;
    }
  }

  function normalizeFamilyForLocal(family,membership){
    if(!family)return null;
    return {
      ...(familyRegistry?.[family.id]||{}),
      id:family.id,
      code:family.code,
      name:family.name,
      email:family.owner_email||'',
      ownerEmail:family.owner_email||'',
      ownerPersonId:family.owner_person_id||membership?.person_id||familyRegistry?.[family.id]?.ownerPersonId||'',
      createdAt:family.created_at||new Date().toISOString(),
      accounts:Array.isArray(familyRegistry?.[family.id]?.accounts)?familyRegistry[family.id].accounts:[],
      joinRequests:Array.isArray(familyRegistry?.[family.id]?.joinRequests)?familyRegistry[family.id].joinRequests:[]
    };
  }

  function installRemoteState(family,membership,stateRow,email){
    if(!family)return false;
    applyingRemote=true;
    try{
      const localFamily=normalizeFamilyForLocal(family,membership);
      familyRegistry[family.id]=localFamily;
      localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry));
      activeFamilyId=family.id;
      localStorage.setItem(activeFamilyStorageKey,family.id);
      const remoteState=stateRow?.state&&typeof stateRow.state==='object'?stateRow.state:emptyFamilyData();
      localStorage.setItem(familyDataKey(family.id),JSON.stringify(remoteState));
      replaceData(remoteState);
      lastRemoteDocsSignature=documentsSignature(remoteState?.docs);
      if(stateRow?.photos&&typeof stateRow.photos==='object'){
        Object.keys(treePhotos).forEach(k=>delete treePhotos[k]);
        Object.assign(treePhotos,stateRow.photos);
        localStorage.setItem('familySphereTreePhotos',JSON.stringify(treePhotos));
      }
      if(Array.isArray(stateRow?.removed_members)){
        removedMembers.splice(0,removedMembers.length,...stateRow.removed_members);
        localStorage.setItem('familySphereRemovedMembers',JSON.stringify(removedMembers));
      }
      accountState.familyId=family.id;
      accountState.loggedIn=true;
      const remotePeople=Array.isArray(remoteState?.people)?remoteState.people:[];
      const membershipPersonId=String(membership?.person_id||'');
      const linkedPersonStillExists=!membershipPersonId||remotePeople.some(p=>String(p?.id||'')===membershipPersonId);
      accountState.treeProfile=linkedPersonStillExists?(membershipPersonId||accountState.treeProfile||''):'';
      accountState.identifier=email||membership?.display_name||accountState.identifier||'';
      accountState.role=membership?.role||'member';
      accountState.method=membership?.role==='owner'?'owner':'member';
      if(!accountState.joinedAt)accountState.joinedAt=new Date().toISOString();
      saveAccountState();
      lastRemoteUpdatedAt=stateRow?.updated_at||'';
      lastPushedSignature=stateSignature();
      lastObservedSignature=lastPushedSignature;
      localDirty=false;
      clearRemovedAccessWarning();
    }finally{applyingRemote=false}
    return true;
  }

  function mergeFamilyStates(remoteState,localState){
    const remote=remoteState&&typeof remoteState==='object'?remoteState:{};
    const local=localState&&typeof localState==='object'?localState:{};
    const out={...remote,...local};
    // Help Board is edited atomically in one browser action. Preserve the local
    // snapshot on a conflict instead of union-merging deleted/changed requests.
    if(Array.isArray(local.help))out.help=local.help;
    if(Array.isArray(local.removedHelp))out.removedHelp=local.removedHelp;
    if(local.helpVolunteers&&typeof local.helpVolunteers==='object')out.helpVolunteers=local.helpVolunteers;
    // Events & Reminders are also edited atomically by the current browser action.
    // Keep the local snapshot on conflict so deletes/edits cannot be resurrected by
    // array-union conflict merging before the live family update is pushed.
    if(Array.isArray(local.events))out.events=local.events;
    if(local.eventReminders&&typeof local.eventReminders==='object')out.eventReminders=local.eventReminders;
    if(local.eventsBackendInitialized!==undefined)out.eventsBackendInitialized=local.eventsBackendInitialized;
    if((remote.eventRemindersByMember&&typeof remote.eventRemindersByMember==='object')||(local.eventRemindersByMember&&typeof local.eventRemindersByMember==='object')){
      const mergedReminderBuckets={...(remote.eventRemindersByMember||{})};
      for(const [viewerKey,bucket] of Object.entries(local.eventRemindersByMember||{})){
        mergedReminderBuckets[viewerKey]={...(mergedReminderBuckets[viewerKey]||{}),...(bucket&&typeof bucket==='object'?bucket:{})};
      }
      out.eventRemindersByMember=mergedReminderBuckets;
    }
    // Notification read state is per family member. Merge each member receipt so
    // one browser cannot overwrite another member's read/seen history.
    if((remote.notificationReceipts&&typeof remote.notificationReceipts==='object')||(local.notificationReceipts&&typeof local.notificationReceipts==='object')){
      const mergedReceipts={...(remote.notificationReceipts||{})};
      for(const [viewerKey,localReceipt] of Object.entries(local.notificationReceipts||{})){
        const remoteReceipt=mergedReceipts[viewerKey]&&typeof mergedReceipts[viewerKey]==='object'?mergedReceipts[viewerKey]:{};
        const l=localReceipt&&typeof localReceipt==='object'?localReceipt:{};
        const readIds=[...new Set([...(Array.isArray(remoteReceipt.readIds)?remoteReceipt.readIds:[]),...(Array.isArray(l.readIds)?l.readIds:[])].map(String))].slice(-300);
        mergedReceipts[viewerKey]={...remoteReceipt,...l,readIds,lastViewedAt:Math.max(Number(remoteReceipt.lastViewedAt||0),Number(l.lastViewedAt||0))};
      }
      out.notificationReceipts=mergedReceipts;
    }
    for(const key of new Set([...Object.keys(remote),...Object.keys(local)])){
      if(key==='help'||key==='removedHelp'||key==='helpVolunteers'||key==='events'||key==='eventReminders'||key==='eventsBackendInitialized'||key==='eventRemindersByMember'||key==='notificationReceipts')continue;
      const r=remote[key],l=local[key];
      if(Array.isArray(r)&&Array.isArray(l)){
        const canKey=[...r,...l].filter(Boolean).every(x=>typeof x!=='object'||x.id!==undefined);
        if(canKey){
          const map=new Map();
          r.forEach(x=>{if(x&&typeof x==='object'&&x.id!==undefined)map.set(String(x.id),x)});
          l.forEach(x=>{if(x&&typeof x==='object'&&x.id!==undefined)map.set(String(x.id),x)});
          out[key]=map.size?[...map.values()]:l;
        }
      }
    }
    return out;
  }

  function clearRemovedAccessWarning(){
    try{
      const error=document.getElementById('startupLoginError');
      if(error && /access to this family has been removed|no longer linked to an approved family-tree profile/i.test(String(error.textContent||''))){
        error.textContent='';
      }
    }catch{}
  }

  async function verifyCurrentMembershipAfterForbidden(){
    // V273: never interpret a single 403 as "member removed".
    // First ask the backend for this authenticated user's CURRENT membership.
    // Only a confirmed null membership is allowed to trigger the red removal warning.
    try{
      const check=await rawApi('current_access',{},true,false);
      if(check?.membership && check?.family){
        const email=String(accountState?.identifier||session?.user?.email||'');
        installRemoteState(check.family,check.membership,check.state,email);
        accountState.loggedIn=true;
        accountState.familyId=check.family.id;
        accountState.role=check.membership.role||'member';
        accountState.method=check.membership.role==='owner'?'owner':'member';
        const personId=String(check.membership?.person_id||'');
        if(personId)accountState.treeProfile=personId;
        saveAccountState();
        clearRemovedAccessWarning();
        return {active:true,removed:false,result:check};
      }
      if(check && check.membership===null){
        return {active:false,removed:true,result:check};
      }
      return {active:false,removed:false,result:check||null};
    }catch(e){
      // Network/API/session hiccups must never create a false red removal warning.
      console.warn('Membership verification deferred:',e?.message||e);
      return {active:false,removed:false,error:e};
    }
  }

  function revokeLocalFamilyAccess(message='Your access to this family has been removed. Please request access again if needed.'){
    const revokedFamilyId=currentFamilyId();
    try{saveSession(null)}catch{}
    clearTimeout(syncTimer);clearInterval(pollTimer);clearInterval(joinPollTimer);clearInterval(helpPollTimer);clearInterval(documentPollTimer);clearInterval(notificationPollTimer);clearInterval(mutationWatchTimer);
    clearTimeout(realtimeReconnectTimer);clearTimeout(realtimePullTimer);
    try{realtimeAbort?.abort()}catch{};realtimeAbort=null;
    syncTimer=null;pollTimer=null;joinPollTimer=null;
    try{
      accountState.familyId='';
      accountState.treeProfile='';
      accountState.loggedIn=false;
      accountState.identifier='';
      accountState.role='';
      accountState.method='';
      saveAccountState();
    }catch{}
    try{
      activeFamilyId='';
      localStorage.removeItem(activeFamilyStorageKey);
      if(revokedFamilyId&&typeof familyDataKey==='function')localStorage.removeItem(familyDataKey(revokedFamilyId));
      localStorage.removeItem('familySphereTreePhotos');
      localStorage.removeItem('familySphereRemovedMembers');
    }catch{}
    try{
      if(typeof replaceData==='function')replaceData(typeof emptyFamilyData==='function'?emptyFamilyData():{});
      if(typeof treePhotos==='object'&&treePhotos)Object.keys(treePhotos).forEach(k=>delete treePhotos[k]);
      if(Array.isArray(removedMembers))removedMembers.splice(0,removedMembers.length);
    }catch{}
    // Access revocation is NOT a normal logout. Keep all private family content hidden
    // and return to the authenticated startup gate instead of rendering an anonymous tree.
    try{
      document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
      const overlay=document.getElementById('startupLogin');
      if(overlay)overlay.classList.remove('hidden');
      document.body.classList.add('startup-locked');
      document.body.classList.remove('landing-open');
      document.getElementById('landing')?.classList.add('hidden');
      if(typeof window.showStartupAuthTab==='function')window.showStartupAuthTab('login');
      const error=document.getElementById('startupLoginError');
      if(error)error.textContent=message;
      try{if(typeof renderAccountPage==='function')renderAccountPage()}catch{}
      try{if(typeof renderFamilyAccessBar==='function')renderFamilyAccessBar()}catch{}
    }catch(e){console.warn('Family access lock:',e)}
    try{showToast(message)}catch{}
  }
  window.familySphereRevokeLocalAccess=revokeLocalFamilyAccess;

  async function pushState(force=false){
    if(applyingRemote||!backendConfigured||!session?.access_token)return;
    const familyId=currentFamilyId();if(!familyId)return;
    const signature=stateSignature();
    if(!force&&signature===lastPushedSignature)return;
    setSyncStatus('saving');
    try{
      const result=await rawApi('save_state',{familyId,state:data,photos:localPhotos(),removedMembers:localRemovedMembers(),expectedUpdatedAt:lastRemoteUpdatedAt});
      lastPushedSignature=signature;
      lastObservedSignature=stateSignature();
      lastRemoteUpdatedAt=result?.state?.updated_at||lastRemoteUpdatedAt;
      localDirty=false;
      setSyncStatus('saved');
    }catch(e){
      if(e?.status===403){
        const access=await verifyCurrentMembershipAfterForbidden();
        if(access.removed)revokeLocalFamilyAccess();
        else if(access.active){
          renderAllAfterRemote();
          setSyncStatus('saved');
        }
        return;
      }
      if(e?.status===409&&e?.payload?.state){
        setSyncStatus('conflict',e.message);
        const latest=e.payload.state;
        const merged=mergeFamilyStates(latest?.state||{},data||{});
        applyingRemote=true;
        try{
          replaceData(merged);
          if(latest?.photos&&typeof latest.photos==='object'){
            Object.assign(treePhotos,latest.photos,localPhotos());
            localStorage.setItem('familySphereTreePhotos',JSON.stringify(treePhotos));
          }
          lastRemoteUpdatedAt=latest?.updated_at||lastRemoteUpdatedAt;
          try{save()}catch{}
        }finally{applyingRemote=false}
        lastPushedSignature='';
        localDirty=true;
        schedulePush(900);
      }else setSyncStatus(navigator.onLine?'error':'offline',e?.message||'Sync failed');
      throw e;
    }
  }

  function schedulePush(delay=500){
    if(applyingRemote||!backendConfigured||!session?.access_token)return;
    localDirty=true;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(async()=>{
      try{await uploadPendingDocuments()}catch(e){console.warn('Document upload sync:',e.message)}
      try{await pushState(false)}catch(e){console.warn('Supabase state sync:',e.message)}
    },delay);
  }
  window.familySphereBackendScheduleSync=schedulePush;
  window.familySphereBackendPushNow=async function(){
    if(applyingRemote||!backendConfigured||!session?.access_token)return false;
    clearTimeout(syncTimer);syncTimer=null;
    localDirty=true;lastPushedSignature='';
    await pushState(true);
    return true;
  };

  function watchForUnsyncedLocalMutation(){
    if(applyingRemote||!backendConfigured||!session?.access_token)return;
    const sig=stateSignature();
    if(!lastObservedSignature){lastObservedSignature=sig;return}
    if(sig===lastObservedSignature)return;
    if(userIsActivelyEditing())return;
    lastObservedSignature=sig;
    if(sig!==lastPushedSignature)schedulePush(20);
  }

  function userIsActivelyEditing(){
    const active=document.activeElement;
    if(active&&active.matches?.('input,textarea,select,[contenteditable="true"]'))return true;
    return !!document.querySelector('.modal:not(.hidden), .v158modal.open');
  }

  async function pullState(){
    if(applyingRemote||!backendConfigured||!session?.access_token)return;
    // Never replace the DOM/state while a family member is editing a form or modal.
    if(userIsActivelyEditing()){schedulePush(250);return}
    const familyId=currentFamilyId();if(!familyId)return;
    const localSig=stateSignature();
    let result;
    try{
      result=await rawApi('get_state',{familyId});
    }catch(e){
      if(e?.status===403){
        // V273: a stale family id or a transient forbidden response in another
        // browser must NOT log out a still-approved member.
        const access=await verifyCurrentMembershipAfterForbidden();
        if(access.removed){
          revokeLocalFamilyAccess();
        }else if(access.active){
          renderAllAfterRemote();
        }
        return;
      }
      throw e;
    }
    const remote=result?.state;if(!remote)return;
    const updated=remote.updated_at||'';
    const remoteDocsSignature=documentsSignature(remote?.state?.docs);
    const localDocsSignature=documentsSignature(data?.docs);
    const documentsChanged=remoteDocsSignature!==localDocsSignature;
    const familyStateChanged=!!updated&&updated!==lastRemoteUpdatedAt;
    if(!familyStateChanged&&!documentsChanged)return;
    // A document-table change is authoritative and must not wait for family_states.updated_at.
    // This keeps Vault counts/cards identical in every logged-in browser immediately.
    if(documentsChanged&&!familyStateChanged){
      installRemoteDocuments(remote?.state?.docs||[]);
      return;
    }
    // Only block a full remote refresh for a REAL user edit that is still queued.
    // Rendering/normalization must never make another browser look dirty.
    if(localDirty){schedulePush(50);return}
    installRemoteState(result.family,result.membership,remote,accountState?.identifier||'');
    renderAllAfterRemote();
  }

  function stopRealtimeStream(){
    clearTimeout(realtimeReconnectTimer);realtimeReconnectTimer=null;
    clearTimeout(realtimePullTimer);realtimePullTimer=null;
    try{realtimeAbort?.abort()}catch{}
    realtimeAbort=null;
  }

  function scheduleRealtimePull(delay=0){
    clearTimeout(realtimePullTimer);
    realtimePullTimer=setTimeout(async()=>{
      if(!pendingRealtimeUpdatedAt||!backendConfigured||!session?.access_token)return;
      if(userIsActivelyEditing()){
        scheduleRealtimePull(350);
        return;
      }
      const target=pendingRealtimeUpdatedAt;
      pendingRealtimeUpdatedAt='';
      try{await pullState()}catch(e){
        pendingRealtimeUpdatedAt=target;
        console.warn('Live family refresh:',e?.message||e);
        scheduleRealtimePull(900);
      }
    },delay);
  }

  async function startRealtimeStream(){
    stopRealtimeStream();
    if(!backendConfigured||!session?.access_token)return;
    const familyId=currentFamilyId();if(!familyId)return;
    const controller=new AbortController();
    realtimeAbort=controller;
    try{
      const res=await fetch(`/api/family-sphere?stream=1&familyId=${encodeURIComponent(familyId)}`,{
        method:'GET',
        headers:{Authorization:`Bearer ${session.access_token}`,'Cache-Control':'no-cache'},
        cache:'no-store',
        signal:controller.signal,
      });
      if(!res.ok||!res.body)throw new Error(`Live sync unavailable (${res.status})`);
      const reader=res.body.getReader(),decoder=new TextDecoder();
      let buffer='';
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        let split;
        while((split=buffer.indexOf('\n\n'))>=0){
          const packet=buffer.slice(0,split);buffer=buffer.slice(split+2);
          let event='message',dataText='';
          for(const line of packet.split(/\r?\n/)){
            if(line.startsWith('event:'))event=line.slice(6).trim();
            else if(line.startsWith('data:'))dataText+=line.slice(5).trim();
          }
          if(event==='family-state'&&dataText){
            let payload=null;try{payload=JSON.parse(dataText)}catch{}
            const updatedAt=String(payload?.updatedAt||'');
            if(updatedAt&&updatedAt!==lastRemoteUpdatedAt){
              pendingRealtimeUpdatedAt=updatedAt;
              scheduleRealtimePull(0);
            }
          }else if(event==='family-documents'&&dataText){
            // Refresh the authoritative documents table directly. This must not be
            // blocked by family-state editing/conflict guards or an open modal.
            refreshDocumentsRemote().catch(e=>console.warn('Live document refresh:',e?.message||e));
          }else if(event==='family-notifications'&&dataText){
            refreshNotificationsRemote().catch(e=>console.warn('Live notification refresh:',e?.message||e));
          }
        }
      }
    }catch(e){
      if(controller.signal.aborted)return;
      console.warn('Family live sync:',e?.message||e);
    }finally{
      if(realtimeAbort===controller)realtimeAbort=null;
      if(!controller.signal.aborted&&backendConfigured&&session?.access_token){
        clearTimeout(realtimeReconnectTimer);
        realtimeReconnectTimer=setTimeout(()=>startRealtimeStream().catch(()=>{}),1200);
      }
    }
  }

  async function refreshJoinRequests(){
    if(!backendConfigured||!session?.access_token)return;
    const familyId=currentFamilyId();if(!familyId)return;
    const family=familyRegistry?.[familyId];
    const isOwner=accountState?.role==='owner'||accountState?.method==='owner';
    if(!isOwner)return;
    try{
      const result=await rawApi('list_join_requests',{familyId});
      const mapped=(result.requests||[]).map(r=>({
        id:r.id,name:r.name,email:r.email,anchorPersonId:r.anchor_person_id,anchorName:r.anchor_name,
        relation:r.relation,status:r.status,personId:r.person_id||null,requestedAt:r.requested_at
      }));
      family.joinRequests=mapped;
      localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry));
      try{renderFamilyAccessBar()}catch{}
    }catch(e){console.warn('Join request refresh:',e.message)}
  }

  function currentViewerForHelp(){
    try{const person=(data?.people||[]).find(p=>String(p.id||'')===String(accountState?.treeProfile||''));return{id:String(person?.id||accountState?.treeProfile||''),name:String(person?.name||accountState?.identifier||'Family member')}}catch{return{id:'',name:'Family member'}}
  }

  // v244 Help Board: use the original, proven Help Board UI handlers as the
  // single source of truth, then sync the complete family state to Supabase.
  // This avoids duplicate Help APIs/IDs while keeping cross-browser persistence.
  function queueHelpStateSync(){
    lastPushedSignature='';
    if(backendConfigured&&session?.access_token){
      schedulePush(80);
      return;
    }
    // A backend can become available after the page loaded (for example after
    // starting `npm run dev`). Re-check once and sync without requiring reload.
    checkBackend(true).then(ok=>{if(ok&&session?.access_token)schedulePush(80)}).catch(()=>{});
  }

  window.addHelp=function(e){
    const out=originals.addHelp?.(e);
    queueHelpStateSync();
    return out;
  };
  window.deleteHelpRequest=function(kind,id){
    const out=originals.deleteHelp?.(kind,id);
    queueHelpStateSync();
    return out;
  };
  window.volunteerHelp=function(kind,id,btn){
    const out=originals.volunteerHelp?.(kind,id,btn);
    queueHelpStateSync();
    return out;
  };
  window.cancelVolunteer=function(kind,id,event){
    const out=originals.cancelHelp?.(kind,id,event);
    queueHelpStateSync();
    return out;
  };

  // Render Help directly from the shared family state. Dedicated v238-v243 Help
  // polling is intentionally disabled so it cannot overwrite newer local state.
  async function refreshHelpBoardRemote(){
    try{if(typeof renderHelpBoard==='function')renderHelpBoard()}catch{}
    return true;
  }
  function installHelpActionDelegation(){
    // Inline handlers in FAMILY_SPHERE.html call the four wrappers above. Keeping
    // one action path prevents duplicate events and stale request-id lookups.
    return true;
  }

  async function uploadPendingDocuments(){
    if(uploadBusy||!backendConfigured||!session?.access_token)return;
    const familyId=currentFamilyId();if(!familyId)return;
    const docs=(data?.docs||[]).filter(d=>!d.storagePath&&typeof d.fileData==='string'&&d.fileData.startsWith('data:'));
    if(!docs.length)return;
    uploadBusy=true;
    try{
      for(const doc of docs){
        const result=await rawApi('upload_file',{
          familyId,bucket:'family-documents',recordId:doc.id,fileName:doc.fileName||`${doc.name||'document'}.file`,
          contentType:doc.fileType||'application/octet-stream',dataUrl:doc.fileData
        });
        doc.storagePath=result.path;doc.storageBucket=result.bucket;delete doc.fileData;
      }
      try{save()}catch{}
      await pushState(true);
      try{renderDocuments()}catch{}
    }catch(e){console.warn('Document Storage upload:',e.message)}finally{uploadBusy=false}
  }

  async function signedFileUrl(doc){
    const familyId=currentFamilyId();
    const result=await rawApi('sign_file',{familyId,bucket:doc.storageBucket||'family-documents',path:doc.storagePath});
    return result.url;
  }

  window.viewStoredDocument=async function(id){
    const doc=(data?.docs||[]).find(x=>x.id===id);
    if(!doc?.storagePath)return originals.viewDoc?.(id);
    try{
      const url=await signedFileUrl(doc);const type=doc.fileType||'',name=doc.fileName||doc.name;
      document.getElementById('previewTitle').textContent=doc.name;
      document.getElementById('previewMeta').textContent=`${name} · ${typeof formatFileSize==='function'?formatFileSize(doc.fileSize||0):''}`;
      const stage=document.getElementById('previewStage');previewZoom=1;
      if(type.startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(name)){stage.innerHTML=`<img id="previewImage" src="${url}" alt="${escapeHtml(doc.name)}">`;document.getElementById('imageZoomControls').style.display='flex'}
      else if(type==='application/pdf'||/\.pdf$/i.test(name)){stage.innerHTML=`<iframe title="${escapeHtml(doc.name)}" src="${url}"></iframe>`;document.getElementById('imageZoomControls').style.display='none'}
      else{stage.innerHTML='<div class="vault-empty">Preview is available for PDF and image files. Use Download for this document type.</div>';document.getElementById('imageZoomControls').style.display='none'}
      openModal('docPreviewModal');
    }catch(e){showToast('Could not open this secure document')}
  };

  async function fetchDocumentDownload(doc,retried=false){
    const familyId=currentFamilyId();
    const headers={'Content-Type':'application/json'};
    if(session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
    const res=await fetch('/api/family-sphere',{
      method:'POST',headers,cache:'no-store',
      body:JSON.stringify({
        action:'download_file',familyId,
        bucket:doc.storageBucket||'family-documents',path:doc.storagePath,
        fileName:doc.fileName||`${doc.name||'document'}.file`,
        contentType:doc.fileType||'application/octet-stream'
      })
    });
    if(res.status===401&&!retried&&session?.refresh_token){
      const refreshed=await rawApi('refresh_auth',{refreshToken:session.refresh_token},false,false).catch(()=>null);
      if(refreshed?.session){saveSession(refreshed.session);return fetchDocumentDownload(doc,true)}
    }
    if(!res.ok){
      let message=`Download failed (${res.status})`;
      try{const payload=await res.json();message=payload?.error||message}catch{}
      throw new Error(message);
    }
    return res.blob();
  }

  window.downloadStoredDocument=async function(id){
    const doc=(data?.docs||[]).find(x=>x.id===id);
    if(!doc?.storagePath)return originals.downloadDoc?.(id);
    try{
      const blob=await fetchDocumentDownload(doc);
      await window.FamilySpherePdf.download(doc,blob);
    }catch(e){console.warn('Document download:',e);showToast(e?.message||'Could not download this secure document')}
  };

  function fileAsDataUrl(file){
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Could not read this file'));reader.readAsDataURL(file)});
  }

  window.addDocument=async function(e){
    if(!(await checkBackend()))return originals.addDoc?.(e);
    e.preventDefault();
    const form=e.currentTarget||e.target;
    const file=document.getElementById('docFile')?.files?.[0];
    const title=document.getElementById('docName')?.value.trim()||'';
    const category=document.getElementById('docCategory')?.value||'';
    const accessLevel=document.getElementById('docAccess')?.value||'Entire family';
    if(!file){showToast('Choose a file first');return}
    if(!title){showToast('Enter a document name');return}
    if(file.size>12*1024*1024){showToast('File is too large. Maximum size is 12 MB.');return}
    const button=document.getElementById('docSaveRecordButton')||form?.querySelector('button[type="submit"]');
    let saveSucceeded=false;
    if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='Saving…'}
    try{
      const dataUrl=await fileAsDataUrl(file);
      const familyId=currentFamilyId();
      const recordId=`doc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const result=await rawApi('save_document',{familyId,recordId,title,category,accessLevel,fileName:file.name,contentType:file.type||'application/octet-stream',dataUrl});
      const doc=result.document;
      if(!Array.isArray(data.docs))data.docs=[];
      data.docs=data.docs.filter(x=>String(x.id)!==String(doc.id));
      data.docs.push(doc);
      try{save()}catch{}
      refreshDocumentUI(category);
      try{
        await window.familySphereCreateNotification?.({
          type:'document',
          title:`New document: ${title}`,
          text:`${category||'Document'} was added to the Family Document Vault.`,
          page:'vault',
          scope:'family',
          dedupeSeconds:60,
          dedupeKey:`document-added:${String(doc?.dbId||doc?.id||recordId)}`
        });
      }catch(notificationError){console.warn('Document notification:',notificationError?.message||notificationError)}
      saveSucceeded=true;
      // Success is shown exactly where the user clicked, not as a bottom-right toast.
      if(button){button.textContent='✓ Record saved';button.disabled=true}
      lastPushedSignature='';
      schedulePush(250);
      setTimeout(()=>{
        try{form.reset()}catch{}
        try{closeModal('docModal')}catch{}
        if(button){button.disabled=false;button.textContent=button.dataset.originalText||'Save record'}
      },1800);
    }catch(err){
      console.error('Save document:',err);
      showToast(err?.message||'Could not save this record');
    }finally{
      if(!saveSucceeded&&button){button.disabled=false;button.textContent=button.dataset.originalText||'Save record'}
    }
  };

  window.deleteStoredDocument=async function(id){
    const doc=(data?.docs||[]).find(x=>String(x.id)===String(id));
    if(!doc)return;
    if(!confirm(`Delete “${doc.name}”?`))return;
    if(!(await checkBackend()))return originals.deleteDoc?.(id);
    try{
      await rawApi('delete_document',{familyId:currentFamilyId(),recordId:id});
      const category=doc.cat;
      data.docs=(data.docs||[]).filter(x=>String(x.id)!==String(id));
      try{save()}catch{}
      refreshDocumentUI(category)
      showToast('Record deleted');
      lastPushedSignature='';schedulePush(250);
    }catch(err){showToast(err?.message||'Could not delete this record')}
  };

  window.deleteDocumentCategory=async function(category,cardId){
    const docs=(data?.docs||[]).filter(x=>x.cat===category);
    if(!confirm(`Delete ${typeof categoryName==='function'?categoryName(category):category} and ${docs.length} document${docs.length===1?'':'s'} inside it?`))return;
    if(!(await checkBackend()))return originals.deleteDocCategory?.(category,cardId);
    try{
      await rawApi('delete_document_category',{familyId:currentFamilyId(),category});
      data.docs=(data.docs||[]).filter(x=>x.cat!==category);
      try{if(Array.isArray(data.removedDocs)&&cardId&&!data.removedDocs.includes(cardId))data.removedDocs.push(cardId)}catch{}
      try{save()}catch{}
      refreshDocumentUI('');
      showToast('Document category deleted');
      lastPushedSignature='';schedulePush(250);
    }catch(err){showToast(err?.message||'Could not delete this category')}
  };

  function showBackendError(targetId,error){const el=document.getElementById(targetId);if(el)el.textContent=error?.message||'Backend request failed'}
  function backendRequired(targetId){
    const message='Shared family login is temporarily unavailable. The website must run with its Next.js API and Supabase configuration; a static HTML-only host cannot support accounts or family joining.';
    showBackendError(targetId,new Error(message));
    return false;
  }


  // V282: Recovery works for accounts with non-deliverable login-email identifiers.
  // No email message, user enumeration, or reset-link redirect is involved.
  function presentRecoveryCode(code){
    if(!code)return;
    const existing=document.getElementById('fsRecoveryCodeDialog');existing?.remove();
    const overlay=document.createElement('div');overlay.id='fsRecoveryCodeDialog';
    Object.assign(overlay.style,{position:'fixed',inset:'0',background:'rgba(8,19,35,.73)',zIndex:'2147483647',display:'grid',placeItems:'center',padding:'20px'});
    const panel=document.createElement('div');Object.assign(panel.style,{background:'#fff',color:'#14243b',borderRadius:'18px',padding:'25px',maxWidth:'460px',width:'100%',boxShadow:'0 20px 60px #0004',fontFamily:'system-ui,sans-serif'});
    const heading=document.createElement('h2');heading.textContent='Save your personal recovery code';heading.style.margin='0 0 10px';
    const description=document.createElement('p');description.textContent='This code is shown only once. Save it somewhere private. It is unique to your account and replaces email-based password recovery.';
    const output=document.createElement('code');output.textContent=code;Object.assign(output.style,{display:'block',overflowWrap:'anywhere',padding:'12px',borderRadius:'8px',background:'#eef4f8',fontSize:'15px',fontWeight:'700',margin:'15px 0'});
    const warning=document.createElement('p');warning.textContent='Anyone with this code and your login email can reset your password. Do not share it with the family owner or other members.';
    warning.style.fontSize='12px';
    const copy=document.createElement('button');copy.type='button';copy.textContent='Copy recovery code';Object.assign(copy.style,{padding:'12px',border:0,borderRadius:'8px',background:'#176c56',color:'white',cursor:'pointer',marginRight:'8px'});
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code);copy.textContent='Copied'}catch{output.focus();getSelection()?.selectAllChildren(output)}});
    const done=document.createElement('button');done.type='button';done.textContent='I saved my code';Object.assign(done.style,{padding:'12px',borderRadius:'8px',cursor:'pointer'});
    done.addEventListener('click',()=>{overlay.remove()});
    panel.append(heading,description,output,warning,copy,done);overlay.append(panel);document.body.append(overlay);
  }
  async function enrollRecoveryAfterAuth(){
    try{const result=await rawApi('enroll_recovery_code',{},true,false);if(result?.recoveryCode)presentRecoveryCode(result.recoveryCode)}
    catch(err){console.warn('Recovery enrollment:',err);showToast('Recovery code setup is unavailable. Ask the site administrator to apply the V282 recovery SQL.');}
  }
  window.startupForgotPassword=function(e){
    e?.preventDefault?.();
    const confirmForm=document.getElementById('startupResetConfirmForm');if(confirmForm){confirmForm.hidden=false;confirmForm.style.display='grid'};
    const message=document.getElementById('startupResetError');if(message){message.style.color='#176c56';message.textContent='Enter the recovery code you saved when you registered or signed in.'}
  };
  window.startupConfirmPasswordReset=async function(e){
    e?.preventDefault?.();
    const email=document.getElementById('startupResetEmail')?.value.trim().toLowerCase()||'';
    const code=document.getElementById('startupResetCode')?.value.trim()||'';
    const password=document.getElementById('startupResetPassword')?.value||'';
    const confirm=document.getElementById('startupResetConfirm')?.value||'';
    const error=document.getElementById('startupResetConfirmError');
    const button=document.getElementById('startupResetConfirmButton');
    if(error){error.style.color='#c92e47';error.textContent=''}
    if(!email||!code){if(error)error.textContent='Enter your account identifier and saved recovery code.';return}
    if(password.length<8||password.length>128){if(error)error.textContent='Use a password of 8–128 characters.';return}
    if(password!==confirm){if(error)error.textContent='Passwords do not match.';return}
    if(!(await checkBackend()))return backendRequired('startupResetConfirmError');
    if(button){button.disabled=true;button.textContent='Verifying…'}
    try{
      const result=await rawApi('recover_with_saved_code',{email,code,password},false,false);
      document.getElementById('startupResetCode').value='';
      document.getElementById('startupResetPassword').value='';
      document.getElementById('startupResetConfirm').value='';
      if(error){error.style.color='#176c56';error.textContent='Password updated. Save your NEW recovery code shown now, then return to login.'}
      presentRecoveryCode(result.recoveryCode);
    }catch(err){if(error)error.textContent=err?.message||'Recovery failed. Verify your saved code.'}
    finally{if(button){button.disabled=false;button.textContent='Reset password with recovery code'}}
  };

  window.startupCreateFamily=async function(e){
    e?.preventDefault?.();
    if(!(await checkBackend()))return backendRequired('startupCreateError');
    const name=document.getElementById('startupCreateName').value.trim(),email=document.getElementById('startupCreateEmail').value.trim().toLowerCase(),password=document.getElementById('startupCreatePassword').value,familyName=document.getElementById('startupCreateFamilyName').value.trim();
    const error=document.getElementById('startupCreateError');error.textContent='';
    try{
      const result=await rawApi('create_family',{ownerName:name,email,password,familyName},false);
      saveSession(result.session);
      familyRegistry[result.family.id]=normalizeFamilyForLocal(result.family,result.membership);localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry));
      localStorage.setItem(familyDataKey(result.family.id),JSON.stringify(emptyFamilyData()));
      activateFamily(result.family.id);
      const owner=seedDefaultSevenTree(name,true);
      familyRegistry[result.family.id].ownerPersonId=owner.id;localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry));
      result.membership.person_id=owner.id;
      rememberPage('tree');window.finishByPersonId(owner.id,'owner',email);
      await rawApi('link_person',{familyId:result.family.id,personId:owner.id,ownerPersonId:owner.id});
      await pushState(true);startLoops();await refreshHelpBoardRemote();installHelpActionDelegation();renderFamilyAccessBar();showToast(`${familyName} created · Family ID ${result.family.code}`);await enrollRecoveryAfterAuth();
    }catch(err){showBackendError('startupCreateError',err)}
  };

  window.startupLoginSubmit=async function(e){
    e?.preventDefault?.();
    if(!(await checkBackend()))return backendRequired('startupLoginError');const email=document.getElementById('startupFamilyEmail').value.trim().toLowerCase(),password=document.getElementById('startupFamilyPassword').value;document.getElementById('startupLoginError').textContent='';
    // Hosted logins always use Supabase; demo/local sign-in is not a real shared account.
    try{
      const result=await rawApi('login',{email,password},false);saveSession(result.session);
      installRemoteState(result.family,result.membership,result.state,email);
      let personId=result.membership?.person_id;
      if(!personId&&result.membership?.role==='owner'){
        const owner=seedDefaultSevenTree(result.membership.display_name||'Abi',true);personId=owner.id;familyRegistry[result.family.id].ownerPersonId=owner.id;result.membership.person_id=owner.id;
        await rawApi('link_person',{familyId:result.family.id,personId,ownerPersonId:owner.id});await pushState(true);
      }
      if(!personId||(data.people||[]).every(p=>p.id!==personId))throw new Error('This account is not linked to an approved family-tree profile.');
      rememberPage('tree');window.finishByPersonId(personId,result.membership.role||'member',email);startLoops();await refreshJoinRequests();await refreshHelpBoardRemote();installHelpActionDelegation();await uploadPendingDocuments();await enrollRecoveryAfterAuth();
    }catch(err){showBackendError('startupLoginError',err)}
  };

  let joinInfoCache=null;
  let joinLookupSequence=0;
  let joinLoadedCode='';
  window.refreshStartupJoinAnchor=async function(){
    // A complete Family ID is looked up on the first entry. Do not query while
    // typing a partial ID or make a second request merely because the field blurs.
    const input=document.getElementById('startupJoinCode');
    const select=document.getElementById('startupJoinAnchor');
    const error=document.getElementById('startupJoinError');
    if(!input||!select)return;
    const code=input.value.trim().toUpperCase();
    if(code===joinLoadedCode&&joinInfoCache&& !select.disabled)return;
    const sequence=++joinLookupSequence;
    const isLatest=()=>sequence===joinLookupSequence&&input.value.trim().toUpperCase()===code;
    joinInfoCache=null;
    joinLoadedCode='';
    select.disabled=true;
    if(error)error.textContent='';
    if(!code){select.innerHTML='<option value="">Enter a valid Family ID first</option>';return;}
    // Family Sphere IDs follow FAM-XXXXXX; don't show a false invalid-ID state
    // while the user is still entering the final character.
    if(!/^FAM-[A-Z0-9]{6}$/.test(code)){
      select.innerHTML='<option value="">Enter the complete Family ID first</option>';
      return;
    }
    select.innerHTML='<option value="">Checking Family ID…</option>';
    try{
      // join_info is a public, read-only lookup. Call it directly rather than
      // waiting for a separate health request that can race with initial typing.
      const result=await rawApi('join_info',{code},false);
      if(!isLatest())return;
      const people=Array.isArray(result.people)?result.people:[];
      if(!people.length){
        select.innerHTML='<option value="">This family does not have an approved profile yet</option>';
        return;
      }
      joinInfoCache=result;
      joinLoadedCode=code;
      select.innerHTML='<option value="">Select the person you are directly related to</option>'+
        people.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
          .map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
      select.disabled=false;
      if(error)error.textContent='';
    }catch(err){
      if(!isLatest())return;
      joinInfoCache=null;
      joinLoadedCode='';
      select.disabled=true;
      select.innerHTML='<option value="">Unable to load family members</option>';
      if(error)error.textContent=err?.message||'Could not look up the Family ID. Please try again.';
    }
  };
  // Handle pasted/auto-filled IDs on the first visit as well as manual entry.
  if(document.getElementById('startupJoinCode')?.value.trim())window.refreshStartupJoinAnchor();

  window.startupJoinFamily=async function(e){
    e?.preventDefault?.();
    if(!(await checkBackend()))return backendRequired('startupJoinError');
    const code=document.getElementById('startupJoinCode').value.trim().toUpperCase(),name=document.getElementById('startupJoinName').value.trim(),email=document.getElementById('startupJoinEmail').value.trim().toLowerCase(),password=document.getElementById('startupJoinPassword').value,anchor=document.getElementById('startupJoinAnchor'),anchorPersonId=anchor.value,anchorName=anchor.options[anchor.selectedIndex]?.text||'',relation=document.getElementById('startupJoinRelation').value,error=document.getElementById('startupJoinError');error.textContent='';
    try{
      const result=await rawApi('join_request',{code,name,email,password,anchorPersonId,anchorName,relation},false);saveSession(result.session);
      document.getElementById('startupJoinForm').classList.add('hidden');document.getElementById('startupJoinSuccess').classList.remove('hidden');showToast('Join request sent to the family owner');await enrollRecoveryAfterAuth();
    }catch(err){showBackendError('startupJoinError',err)}
  };

  window.approveJoinRequest=async function(id){
    if(await checkBackend()){
      try{
        const familyId=currentFamilyId();
        const localHit=typeof findPendingRequestForActiveFamily==='function'?findPendingRequestForActiveFamily(id):{request:null,family:null};
        const result=await rawApi('approve_join',{familyId,requestId:id});
        if(localHit?.request){localHit.request.status='approved';localHit.request.personId=result?.person?.person_id||result?.person?.id||localHit.request.personId||null;localHit.request.approvedAt=new Date().toISOString()}
        try{if(localHit?.family){localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry))}}catch{}
        if(result?.family&&result?.viewerMembership&&result?.state){
          installRemoteState(result.family,result.viewerMembership,result.state,accountState?.identifier||'');
          renderAllAfterRemote();
          if(result.viewerMembership.person_id&&typeof window.finishByPersonId==='function'){
            window.finishByPersonId(result.viewerMembership.person_id,result.viewerMembership.role||'owner',accountState?.identifier||'');
          }
        }
        await refreshJoinRequests();
        try{if(!document.getElementById('joinRequestsModal')?.classList.contains('hidden')&&typeof openJoinRequests==='function')openJoinRequests()}catch{}
        showToast(`${result?.person?.name||localHit?.request?.name||'Family member'} approved and connected to the shared family tree`);
        return true;
      }catch(e){
        console.error('Backend approval:',e);
        showToast(e?.message||'Could not approve this join request');
        return false;
      }
    }
    return originals.approve?.(id);
  };

  window.rejectJoinRequest=async function(id){
    if(await checkBackend()){
      try{
        const familyId=currentFamilyId();
        await rawApi('reject_join',{familyId,requestId:id});
        const hit=typeof findPendingRequestForActiveFamily==='function'?findPendingRequestForActiveFamily(id):{request:null};
        if(hit?.request){hit.request.status='rejected';hit.request.rejectedAt=new Date().toISOString()}
        try{localStorage.setItem(familyRegistryKey,JSON.stringify(familyRegistry))}catch{}
        await refreshJoinRequests();
        try{if(!document.getElementById('joinRequestsModal')?.classList.contains('hidden')&&typeof openJoinRequests==='function')openJoinRequests()}catch{}
        showToast('Join request rejected');
        return true;
      }catch(e){console.warn('Backend reject sync:',e.message);showToast(e?.message||'Could not reject this request');return false}
    }
    return originals.reject?.(id);
  };


  window.logoutAccount=function(){
    try{originals.logout?.()}finally{saveSession(null);stopRealtimeStream();clearInterval(pollTimer);clearInterval(joinPollTimer);clearInterval(helpPollTimer);clearInterval(documentPollTimer);clearInterval(notificationPollTimer);clearInterval(mutationWatchTimer)}
  };
  window.closeFamilySpace=function(){
    try{originals.closeFamily?.()}finally{saveSession(null);stopRealtimeStream();clearInterval(pollTimer);clearInterval(joinPollTimer);clearInterval(helpPollTimer);clearInterval(documentPollTimer);clearInterval(notificationPollTimer);clearInterval(mutationWatchTimer)}
  };

  // Persist the current Family Sphere section. A normal browser refresh should
  // return to the same section instead of forcing a fresh login/tree page.
  function installNavigationMemory(){
    try{
      const existing=window.go;
      if(typeof existing!=='function'||existing.__familySpherePageMemory)return;
      const wrapped=function(id){const out=existing.apply(this,arguments);rememberPage(id);return out};
      wrapped.__familySpherePageMemory=true;
      window.go=wrapped;
    }catch(e){console.warn('Navigation memory:',e)}
  }

  function clearPrepaintResume(){
    try{
      [...document.documentElement.classList].filter(c=>c==='fs-resume-pending'||c.startsWith('fs-resume-')).forEach(c=>document.documentElement.classList.remove(c));
      window.__fsAppReady=true;
      window.__fsTryHideIntro?.();
    }catch{}
  }

  function unlockResumedSession(pageId){
    const target=RESUMABLE_PAGES.has(pageId)?pageId:'tree';
    const previousApplying=applyingRemote;
    applyingRemote=true;
    try{
      document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
      document.getElementById('startupLogin')?.classList.add('hidden');
      document.body.classList.remove('startup-locked','landing-open');
      document.getElementById('landing')?.classList.add('hidden');
      if(typeof window.go==='function')window.go(target);
      else if(typeof go==='function')go(target);
      if(target==='vault')refreshDocumentUI('');
      try{if(typeof renderGraphTree==='function')renderGraphTree()}catch{}
      try{if(typeof renderFamilyAccessBar==='function')renderFamilyAccessBar()}catch{}
    }catch(e){console.warn('Resume UI:',e)}
    finally{
      applyingRemote=previousApplying;
      lastObservedSignature=stateSignature();
      try{sessionStorage.removeItem(RESUME_TARGET_KEY)}catch{}
      clearPrepaintResume();
    }
  }

  async function resumeStoredSession(){
    if(!session?.access_token&&!session?.refresh_token){clearPrepaintResume();return false;}
    let familyId=currentFamilyId();
    if(!familyId){
      try{familyId=String(accountState?.familyId||localStorage.getItem(activeFamilyStorageKey)||'')}catch{}
    }
    if(!familyId){clearPrepaintResume();return false;}
    try{
      const result=await rawApi('get_state',{familyId});
      if(!result?.family||!result?.membership)return false;
      const email=String(accountState?.identifier||session?.user?.email||'');
      installRemoteState(result.family,result.membership,result.state,email);
      const personId=String(result.membership?.person_id||'');
      // V273: membership itself is authoritative. A temporarily delayed/mismatched
      // graph profile must never create the red "access removed" warning.
      accountState.loggedIn=true;
      if(personId)accountState.treeProfile=personId;
      accountState.familyId=result.family.id;
      accountState.role=result.membership.role||'member';
      accountState.method=result.membership.role==='owner'?'owner':'member';
      saveAccountState();
      clearRemovedAccessWarning();
      // Same-tab refresh/history restore returns to the exact current section.
      // A genuinely fresh tab/navigation still starts at Family Tree.
      unlockResumedSession(resumeTargetPage());
      renderAllAfterRemote();
      startLoops();
      await refreshJoinRequests();
      await refreshHelpBoardRemote();
      installHelpActionDelegation();
      return true;
    }catch(e){
      clearPrepaintResume();
      if(e?.status===401){saveSession(null);return false}
      if(e?.status===403){
        const access=await verifyCurrentMembershipAfterForbidden();
        if(access.removed){
          revokeLocalFamilyAccess();
          return false;
        }
        if(access.active){
          const m=access.result.membership;
          const personId=String(m?.person_id||'');
          accountState.loggedIn=true;
          accountState.familyId=access.result.family.id;
          accountState.role=m?.role||'member';
          accountState.method=m?.role==='owner'?'owner':'member';
          if(personId)accountState.treeProfile=personId;
          saveAccountState();
          clearRemovedAccessWarning();
          unlockResumedSession(resumeTargetPage());
          renderAllAfterRemote();
          startLoops();
          await refreshJoinRequests().catch(()=>{});
          await refreshHelpBoardRemote().catch(()=>{});
          installHelpActionDelegation();
          return true;
        }
        // Unknown/transient error: preserve the stored login and do not show removal warning.
        console.warn('Stored session access verification postponed.');
        return false;
      }
      console.warn('Stored session resume:',e?.message||e);
      return false;
    }
  }

  function startLoops(){
    clearInterval(pollTimer);clearInterval(joinPollTimer);clearInterval(helpPollTimer);clearInterval(documentPollTimer);clearInterval(notificationPollTimer);clearInterval(mutationWatchTimer);clearInterval(documentPollTimer);clearInterval(notificationPollTimer);clearInterval(mutationWatchTimer);
    startRealtimeStream().catch(()=>{});
    refreshDocumentsRemote().catch(()=>{});
    refreshNotificationsRemote().catch(()=>{});
    lastObservedSignature=stateSignature();
    pollTimer=setInterval(()=>{if(navigator.onLine&&!userIsActivelyEditing())pullState().catch(()=>{})},700);
    mutationWatchTimer=setInterval(watchForUnsyncedLocalMutation,250);
    documentPollTimer=setInterval(()=>{if(navigator.onLine)refreshDocumentsRemote().catch(()=>{})},800);
    notificationPollTimer=setInterval(()=>{if(navigator.onLine)refreshNotificationsRemote().catch(()=>{})},1000);
    joinPollTimer=setInterval(()=>refreshJoinRequests().catch(()=>{}),3000);
    helpPollTimer=null;
  }

  async function init(){
    installNavigationMemory();
    installHelpActionDelegation();
    if(!(await checkBackend())){
      try{if(typeof showStartupLogin==='function')showStartupLogin()}catch{}
      clearPrepaintResume();
      backendRequired('startupLoginError');console.warn('Family Sphere shared login backend is unavailable.');
      return
    }
    // v257: resume the stored Supabase session first. rawApi automatically refreshes
    // an expired access token when a valid refresh token is still available.
    if(await resumeStoredSession()){
      console.info('Family Sphere v257: saved login resumed; live sync active.');
      return;
    }
    clearPrepaintResume();
    console.info('Family Sphere v257: no valid saved login; showing login.');
  }

  window.addEventListener('focus',()=>{if(backendConfigured&&session?.access_token){if(!userIsActivelyEditing())pullState().catch(()=>{});refreshDocumentsRemote().catch(()=>{});refreshNotificationsRemote().catch(()=>{})}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&backendConfigured&&session?.access_token){if(!userIsActivelyEditing())pullState().catch(()=>{});refreshDocumentsRemote().catch(()=>{});refreshNotificationsRemote().catch(()=>{})}});

  document.addEventListener('focusout',()=>{
    if(!backendConfigured||!session?.access_token)return;
    setTimeout(()=>{watchForUnsyncedLocalMutation();pullState().catch(()=>{})},40);
  },true);

  window.addEventListener('online',()=>{setSyncStatus('saving');if(backendConfigured&&session?.access_token){pushState(true).catch(()=>{});pullState().catch(()=>{})}});
  window.addEventListener('offline',()=>setSyncStatus('offline'));
  window.addEventListener('error',e=>{console.error('Family Sphere runtime error:',e.error||e.message)});
  window.addEventListener('unhandledrejection',e=>{console.error('Family Sphere async error:',e.reason)});

  setTimeout(init,80);
})();
