// piper-tts-alan.js — inline mount (robust)
console.log("[Skelly TTS] Alan inline — robust start");

const RH_MANIFEST = "https://huggingface.co/rhasspy/piper-voices/raw/v1.0.0/voices.json";
const RH_MODELS   = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0";
const VOICE_ID    = "en_GB-alan-medium";

let wavBlob = null, ui = {}, mountedInline = false, observer = null;

function log(...a){ console.log("[Skelly TTS]", ...a); }
function setStatus(m){ if (ui.status) ui.status.textContent = m; log(m); }
function setBusy(b){ if(!ui.speak) return; ui.speak.disabled=b; ui.download.disabled=b||!wavBlob; ui.attach.disabled=b||!wavBlob; }

async function ensurePiper(){
  if (window.__SkellyPiper?.ready) return;
  const s=document.createElement("script");
  s.type="module"; s.id="skelly-piper-module";
  s.textContent = "import * as tts from \\'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm\\';" +
                  "window.__SkellyPiper={tts,ready:true};" +
                  "window.dispatchEvent(new CustomEvent(\\'skelly-piper-ready\\'))";
  document.documentElement.appendChild(s);
  await new Promise(r=>setTimeout(r,900));
}
async function configureCdn(tts){
  if (typeof tts.configure === "function"){
    await tts.configure({
      voicesManifestUrl: RH_MANIFEST,
      modelsBaseUrl: RH_MODELS,
      ortConfig: { numThreads: 1 }
    });
  }
}

// ---------- find anchor & mount inline ----------
function findAnchor(){
  const patterns = [
    /Upcoming:\s*Text\s*To\s*Speech/i,
    /Text\s*To\s*Speech/i,
    /Misc\s*Speech\s*Addons/i
  ];
  const nodes = document.querySelectorAll("h1,h2,h3,h4,h5,h6,legend,label,div,span,p,th,td");
  for (const n of nodes){
    const t = (n.innerText||"").trim();
    for (const re of patterns){
      if (re.test(t)){
        log("anchor matched:", t.slice(0,120));
        return n;
      }
    }
  }
  return null;
}

function createCard(){
  const w=document.createElement("div");
  w.innerHTML = `
  <div class="skelly-tts-card" style="border:1px solid #1e293b;border-radius:14px;padding:14px;background:#0b1220;color:#e6eefc;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial">
    <h3 style="margin:0 0 10px 0;font-weight:700;font-size:18px">?? Skelly Piper TTS — Alan</h3>
    <div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Voice</div>
        <select id="skelly-tts-voice" style="width:100%;background:#0b1220;color:#e6eefc;border:1px solid #1e293b;border-radius:10px;padding:8px">
          <option value="en_GB-alan-medium">en_GB-alan-medium</option>
        </select>
      </div>
      <div style="flex:1;min-width:160px">
        <div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Rate</div>
        <input id="skelly-tts-rate" type="range" min="0.6" max="1.6" step="0.05" value="1" style="width:100%" />
      </div>
    </div>
    <div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">What should Skelly say?</div>
    <textarea id="skelly-tts-text" placeholder="Oi! I’m Alan the talking skeleton…" style="width:100%;min-height:96px;background:#0b1220;color:#e6eefc;border:1px solid #1e293b;border-radius:10px;padding:8px;margin-bottom:10px"></textarea>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <button id="skelly-tts-speak" style="border:1px solid #0e4bba;background:linear-gradient(180deg,#1b6fff,#0e4bba);color:#fff;padding:10px;border-radius:10px">?? Speak</button>
      <button id="skelly-tts-download" disabled style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:10px;border-radius:10px">?? Download WAV</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <button id="skelly-tts-attach" disabled style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:10px;border-radius:10px">?? Send to Upload</button>
      <button id="skelly-tts-clear" style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:10px;border-radius:10px">?? Clear</button>
    </div>
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
      <div style="flex:1">
        <div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Model download</div>
        <div style="height:8px;background:#0b1220;border:1px solid #1e293b;border-radius:999px;overflow:hidden">
          <div id="skelly-tts-dlbar" style="height:8px;width:0;background:#6ee7ff"></div>
        </div>
      </div>
      <div style="width:120px;text-align:right;font-size:12px;color:#9fb3d1" id="skelly-tts-dlstat">idle</div>
    </div>
    <div id="skelly-tts-status" style="font-size:12px;color:#9fb3d1">Loading Piper…</div>
  </div>`;
  return w.firstElementChild;
}

function hideNearbyTextInput(anchor){
  // hide the next textarea / text input near the heading
  let n = anchor.nextElementSibling, hops=0;
  while (n && hops<8){
    if (n.tagName==="TEXTAREA" || (n.tagName==="INPUT" && (n.type||"").toLowerCase()==="text") || n.querySelector?.("textarea,input[type=text]")){
      n.style.display="none"; log("hid nearby text input");
      break;
    }
    n = n.nextElementSibling; hops++;
  }
}

function mountInline(){
  const anchor = findAnchor();
  if (!anchor) return false;
  const card = createCard();
  anchor.insertAdjacentElement("afterend", card);
  hideNearbyTextInput(anchor);
  wireUI();
  mountedInline = true;
  log("mounted inline after anchor");
  return true;
}

function mountFloating(){
  if (document.getElementById("skelly-tts-panel")) return;
  const wrap=document.createElement("div");
  wrap.innerHTML = `<div id="skelly-tts-panel" style="position:fixed;right:16px;bottom:16px;width:360px;max-width:calc(100vw - 24px);z-index:2147483647;background:#0f1624;color:#e6eefc;border:1px solid #1f2a44;border-radius:14px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;box-shadow:0 8px 30px rgba(0,0,0,.35);padding:10px">${createCard().outerHTML}</div>`;
  document.documentElement.appendChild(wrap.firstElementChild);
  wireUI();
  mountedInline = false;
  log("mounted floating (fallback)");
}

function wireUI(){
  ui.voice    = document.getElementById("skelly-tts-voice");
  ui.rate     = document.getElementById("skelly-tts-rate");
  ui.text     = document.getElementById("skelly-tts-text");
  ui.speak    = document.getElementById("skelly-tts-speak");
  ui.download = document.getElementById("skelly-tts-download");
  ui.attach   = document.getElementById("skelly-tts-attach");
  ui.clear    = document.getElementById("skelly-tts-clear");
  ui.dlbar    = document.getElementById("skelly-tts-dlbar");
  ui.dlstat   = document.getElementById("skelly-tts-dlstat");
  ui.status   = document.getElementById("skelly-tts-status");

  if (ui.voice){ ui.voice.value = VOICE_ID; ui.voice.addEventListener("change",(e)=>{ e.target.value=VOICE_ID; }); }
  ui.speak?.addEventListener("click", synthesize);
  ui.download?.addEventListener("click", downloadWav);
  ui.attach?.addEventListener("click", attachToUpload);
  ui.clear?.addEventListener("click", ()=>{ ui.text.value=""; wavBlob=null; ui.download.disabled=true; ui.attach.disabled=true; setStatus("Cleared. Ready."); });
}

// ---------- page wiring ----------
function guessUploadInput(){
  const files=document.querySelectorAll('input[type="file"]');
  for (const f of files){
    const r=f.getBoundingClientRect(), cs=getComputedStyle(f);
    if (r.width>0 && r.height>0 && cs.display!=="none" && cs.visibility!=="hidden") return f;
  }
  return files[0]||null;
}
function guessConvertCheckbox(){
  const boxes=document.querySelectorAll('input[type="checkbox"]');
  for (const b of boxes){
    const id=b.id, lbl=id?document.querySelector('label[for="'+id+'"]'):null;
    const txt=(lbl&&lbl.innerText?lbl.innerText.toLowerCase():"");
    if (txt.includes("convert")||txt.includes("mp3")||txt.includes("8k")) return b;
  }
  const up=guessUploadInput();
  if (up){
    const sibs=up.closest("div")?up.closest("div").querySelectorAll('input[type="checkbox"]'):[];
    if (sibs[0]) return sibs[0];
  }
  return null;
}

// ---------- TTS core ----------
async function ensureVoice(){
  await ensurePiper();
  await new Promise(r=>{ if (window.__SkellyPiper?.ready) r(); else window.addEventListener("skelly-piper-ready", r, {once:true}); });
  const tts=window.__SkellyPiper.tts;
  await configureCdn(tts);

  const stored=await tts.stored();
  if (!stored.includes(VOICE_ID)){
    ui.dlstat.textContent="downloading…";
    await tts.download(VOICE_ID, p=>{ if (p&&p.total) ui.dlbar.style.width = Math.round(p.loaded*100/p.total)+"%"; });
    ui.dlbar.style.width="100%"; ui.dlstat.textContent="cached";
  } else {
    ui.dlbar.style.width="100%"; ui.dlstat.textContent="cached";
  }
  return tts;
}

async function synthesize(){
  const txt=(ui.text.value||"").trim();
  if (!txt){ alert("Type something for Skelly to say."); return; }
  setBusy(true); setStatus("Preparing model…");
  try{
    const tts=await ensureVoice();
    setStatus("Generating audio…");
    await configureCdn(tts);
    wavBlob=await tts.predict({ text: txt, voiceId: VOICE_ID, rate: parseFloat(ui.rate.value||"1") },
                              p=>{ if (p&&p.total) ui.dlbar.style.width = Math.round(p.loaded*100/p.total)+"%"; });
    setStatus("Audio ready ?"); ui.download.disabled=false; ui.attach.disabled=false;
    const audio=new Audio(); audio.src=URL.createObjectURL(wavBlob);
    audio.play().catch(()=> setStatus("Audio blocked — click Speak again."));
  }catch(err){
    console.error(err); setStatus("Error: "+(err.message||err));
    wavBlob=null; ui.download.disabled=true; ui.attach.disabled=true;
  }finally{ setBusy(false); }
}

function downloadWav(){
  if(!wavBlob){ alert("Synthesize something first."); return; }
  const url=URL.createObjectURL(wavBlob);
  const a=document.createElement("a"); a.href=url; a.download="skelly_"+Date.now()+".wav";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 4000);
}
function attachToUpload(){
  if(!wavBlob){ alert("Synthesize something first."); return; }
  const input=guessUploadInput(); if(!input){ alert("Upload field not found — use Download WAV."); return; }
  const convert=guessConvertCheckbox(); if(convert && !convert.checked){ convert.click(); }
  const file=new File([wavBlob], "skelly_"+Date.now()+".wav", { type:"audio/wav", lastModified: Date.now() });
  const dt=new DataTransfer(); dt.items.add(file);
  try{ input.files=dt.files; input.dispatchEvent(new Event("change",{bubbles:true})); setStatus("Attached generated WAV ?"); }
  catch(e){ console.warn(e); alert("Browser blocked auto-attach. Use Download WAV instead."); }
}

// ---------- boot + observe ----------
function tryMount(){
  if (mountedInline) return true;
  const ok = mountInline();
  if (!ok) mountFloating();
  setStatus(mountedInline ? "Alan panel inline and ready." : "Alan panel (floating) ready.");
  return ok;
}

function boot(){
  tryMount();
  // Watch for late-rendered content; mount once and stop
  observer = new MutationObserver(()=> {
    if (!mountedInline){
      if (tryMount()){
        observer.disconnect();
      }
    }
  });
  observer.observe(document.body, { childList:true, subtree:true, characterData:true });
}

if (document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot, {once:true});
else boot();