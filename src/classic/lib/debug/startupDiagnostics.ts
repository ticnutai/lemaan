export type StartupCheckpoint = { name: string; atMs: number; status: 'start' | 'ok' | 'timeout' | 'error'; detail?: string };
export type StartupSession = { id: string; startedAt: number; platform: 'android' | 'electron' | 'web'; complete: boolean; durationMs?: number; checkpoints: StartupCheckpoint[] };
const STORAGE_KEY='pashash:startup-diagnostics:v1', MAX_SESSIONS=10, startedAt=Date.now();
const listeners=new Set<()=>void>();
let current: StartupSession={id:`${startedAt.toString(36)}-${Math.random().toString(36).slice(2,7)}`,startedAt,
 platform:typeof window!=='undefined'&&window.location.protocol==='https:'&&window.location.hostname==='localhost'?'android':typeof window!=='undefined'&&!!(window as unknown as{desktop?:unknown}).desktop?'electron':'web',
 complete:false,checkpoints:[{name:'javascript:started',atMs:0,status:'ok'}]};
function readStored():StartupSession[]{try{const p=JSON.parse(localStorage.getItem(STORAGE_KEY)??'[]');return Array.isArray(p)?p.slice(0,MAX_SESSIONS):[]}catch{return[]}}
function persist(){try{const old=readStored().filter(x=>x?.id!==current.id);localStorage.setItem(STORAGE_KEY,JSON.stringify([current,...old].slice(0,MAX_SESSIONS)))}catch{/* diagnostics never block */}listeners.forEach(x=>x())}
function safe(detail?:string){return detail?.replace(/[\w.-]+@[\w.-]+/g,'[email]').replace(/eyJ[A-Za-z0-9._-]+/g,'[token]').slice(0,160)}
export function startupCheckpoint(name:string,status:StartupCheckpoint['status']='ok',detail?:string){const cp={name,atMs:Math.max(0,Date.now()-startedAt),status,detail:safe(detail)};const i=current.checkpoints.findIndex(x=>x.name===name&&x.status===status);if(i>=0)current.checkpoints[i]=cp;else current.checkpoints.push(cp);persist()}
export function finishStartupDiagnostics(){if(current.complete)return;startupCheckpoint('ui:ready');current={...current,complete:true,durationMs:Math.max(0,Date.now()-startedAt)};persist()}
export function getStartupSessions(){return readStored()}
export function subscribeStartupDiagnostics(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
export function clearStartupDiagnostics(){try{localStorage.removeItem(STORAGE_KEY)}catch{/* ignore */}persist()}
persist();
