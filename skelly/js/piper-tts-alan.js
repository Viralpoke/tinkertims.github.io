// piper-tts-alan.js
// Inline Piper TTS panel for Tim's Skelly page. Loads in-browser, locks to en_GB-alan-medium.

console.log('[Skelly TTS] ES module (Alan) starting');

const RH_MANIFEST = 'https://huggingface.co/rhasspy/piper-voices/raw/v1.0.0/voices.json';
const RH_MODELS   = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';
const VOICE_ID    = 'en_GB-alan-medium';

let wavBlob = null;
let ui = {};

function setStatus(msg){ if (ui.status) ui.status.textContent = msg; console.log('[Skelly TTS]', msg); }
function setBusy(b){
  if (!ui.speak) return;
  ui.speak.disabled = b;
  ui.download.disabled = b || !wavBlob;
  ui.attach.disabled   = b || !wavBlob;
}

// Load Piper as an ES module from CDN
async function ensurePiper() {
  if (window.__SkellyPiper?.ready) return;
  const s = document.createElement('script');
  s.type = 'module';
  s.id = 'skelly-piper-module';
  s.textContent = `
    import * as tts from 'https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm';
    window.__SkellyPiper = { tts, ready: true };
    window.dispatchEvent(new CustomEvent('skelly-piper-ready'));
  `;
  document.documentElement.appendChild(s);
  await new Promise(r => setTimeout(r, 1000));
}

// Force Rhasspy CDN before any tts.* call that depends on it
async function configureCdn(tts) {
  if (typeof tts.configure === 'function') {
    await tts.configure({
      voicesManifestUrl: RH_MANIFEST,
      modelsBaseUrl: RH_MODELS,
      ortConfig: { numThreads: 1 }
    });
  }
}

// Minimal floating UI
function injectUI(){
  if (document.getElementById('skelly-tts-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'skelly-tts-panel';
  panel.style.cssText = [
    'position:fixed','right:16px','bottom:16px','width:360px','max-width:calc(100vw - 24px)',
    'z-index:2147483647','background:#0f1624','color:#e6eefc','border:1px solid #1f2a44',
    'border-radius:14px','font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial',
    'box-shadow:0 8px 30px rgba(0,0,0,.35)','padding:10px'
  ].join(';');

  panel.innerHTML =
    '<div style="font-weight:600;margin-bottom:8px">💀 Skelly Piper TTS — Alan</div>' +
    '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      '<div style="flex:1">' +
        '<div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Voice</div>' +
        '<select id="skelly-tts-voice" style="width:100%;background:#0b1220;color:#e6eefc;border:1px solid #1e293b;border-radius:10px;padding:8px">' +
          '<option value="en_GB-alan-medium">en_GB-alan-medium</option>' +
        '</select>' +
      '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Rate</div>' +
        '<input id="skelly-tts-rate" type="range" min="0.6" max="1.6" step="0.05" value="1" style="width:100%" />' +
      '</div>' +
    '</div>' +
    '<div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">What should Skelly say?</div>' +
    '<textarea id="skelly-tts-text" placeholder="Oi! I’m Alan the talking skeleton…" ' +
      'style="width:100%;min-height:96px;background:#0b1220;color:#e6eefc;border:1px solid #1e293b;border-radius:10px;padding:8px;margin-bottom:8px"></textarea>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      '<button id="skelly-tts-speak" style="border:1px solid #0e4bba;background:linear-gradient(180deg,#1b6fff,#0e4bba);color:#fff;padding:8px;border-radius:10px">▶︎ Speak</button>' +
      '<button id="skelly-tts-download" disabled style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:8px;border-radius:10px">⬇︎ Download WAV</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">' +
      '<button id="skelly-tts-attach" disabled style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:8px;border-radius:10px">📎 Send to Upload</button>' +
      '<button id="skelly-tts-clear" style="border:1px solid #1e293b;background:#0b1220;color:#e6eefc;padding:8px;border-radius:10px">✖︎ Clear</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">' +
      '<div style="flex:1">' +
        '<div style="font-size:12px;color:#9fb3d1;margin-bottom:4px">Model download</div>' +
        '<div style="height:8px;background:#0b1220;border:1px solid #1e293b;border-radius:999px;overflow:hidden">' +
          '<div id="skelly-tts-dlbar" style="height:8px;width:0;background:#6ee7ff"></div>' +
        '</div>' +
      '</div>' +
      '<div style="width:120px;text-align:right;font-size:12px;color:#9fb3d1" id="skelly-tts-dlstat">idle</div>' +
    '</div>' +
    '<div id="skelly-tts-status" style="font-size:12px;color:#9fb3d1">Loading Piper…</div>';

  document.documentElement.appendChild(panel);

  ui.voice    = document.getElementById('skelly-tts-voice');
  ui.rate     = document.getElementById('skelly-tts-rate');
  ui.text     = document.getElementById('skelly-tts-text');
  ui.speak    = document.getElementById('skelly-tts-speak');
  ui.download = document.getElementById('skelly-tts-download');
  ui.attach   = document.getElementById('skelly-tts-attach');
  ui.clear    = document.getElementById('skelly-tts-clear');
  ui.dlbar    = document.getElementById('skelly-tts-dlbar');
  ui.dlstat   = document.getElementById('skelly-tts-dlstat');
  ui.status   = document.getElementById('skelly-tts-status');
}

function guessUploadInput(){
  const files = document.querySelectorAll('input[type="file"]');
  for (let i=0;i<files.length;i++){
    const f = files[i], r = f.getBoundingClientRect(), cs = getComputedStyle(f);
    if (r.width>0 && r.height>0 && cs.display!=='none' && cs.visibility!=='hidden') return f;
  }
  return files[0] || null;
}

function guessConvertCheckbox(){
  const boxes = document.querySelectorAll('input[type="checkbox"]');
  for (let i=0;i<boxes.length;i++){
    const b = boxes[i], id = b.id, lbl = id ? document.querySelector('label[for="'+id+'"]') : null;
    const txt = (lbl && lbl.innerText ? lbl.innerText.toLowerCase() : '');
    if (txt.includes('convert') || txt.includes('mp3') || txt.includes('8k')) return b;
  }
  const up = guessUploadInput();
  if (up){
    const sibs = up.closest('div') ? up.closest('div').querySelectorAll('input[type="checkbox"]') : [];
    if (sibs[0]) return sibs[0];
  }
  return null;
}

async function ensureVoice(){
  await ensurePiper();
  await new Promise((r)=>{ if (window.__SkellyPiper?.ready) r(); else window.addEventListener('skelly-piper-ready', r, {once:true}); });
  const tts = window.__SkellyPiper.tts;
  await configureCdn(tts);

  const stored = await tts.stored();
  if (!stored.includes(VOICE_ID)){
    ui.dlstat.textContent = 'downloading…';
    await tts.download(VOICE_ID, (p)=>{ if (p && p.total) ui.dlbar.style.width = Math.round(p.loaded*100/p.total)+'%'; });
    ui.dlbar.style.width='100%'; ui.dlstat.textContent='cached';
  } else {
    ui.dlbar.style.width='100%'; ui.dlstat.textContent='cached';
  }
  return tts;
}

async function synthesize(){
  const txt = (ui.text.value||'').trim();
  if (!txt){ alert('Type something for Skelly to say.'); return; }
  setBusy(true); setStatus('Preparing model…');
  try{
    const tts = await ensureVoice();
    setStatus('Generating audio…');
    await configureCdn(tts); // belt & suspenders

    wavBlob = await tts.predict(
      { text: txt, voiceId: VOICE_ID, rate: parseFloat(ui.rate.value||'1') },
      (p)=>{ if (p && p.total) ui.dlbar.style.width = Math.round(p.loaded*100/p.total)+'%'; }
    );
    setStatus('Audio ready ✔'); ui.download.disabled=false; ui.attach.disabled=false;

    const audio = new Audio(); audio.src = URL.createObjectURL(wavBlob);
    audio.play().catch(()=> setStatus('Audio blocked — click Speak again.'));
  }catch(err){
    console.error(err);
    setStatus('Error: '+(err.message||err));
    wavBlob=null; ui.download.disabled=true; ui.attach.disabled=true;
  }finally{
    setBusy(false);
  }
}

function downloadWav(){
  if(!wavBlob){ alert('Synthesize something first.'); return; }
  const url = URL.createObjectURL(wavBlob);
  const a = document.createElement('a'); a.href=url; a.download='skelly_'+Date.now()+'.wav';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 4000);
}

function attachToUpload(){
  if(!wavBlob){ alert('Synthesize something first.'); return; }
  const input = guessUploadInput(); if(!input){ alert('Upload field not found — use Download WAV.'); return; }
  const convert = guessConvertCheckbox(); if(convert && !convert.checked){ convert.click(); }
  const file = new File([wavBlob], 'skelly_'+Date.now()+'.wav', { type:'audio/wav', lastModified: Date.now() });
  const dt = new DataTransfer(); dt.items.add(file);
  try { input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles:true })); setStatus('Attached generated WAV ✔'); }
  catch(e){ console.warn(e); alert('Browser blocked auto-attach. Use Download WAV instead.'); }
}

function boot(){
  injectUI();
  ui.voice = document.getElementById('skelly-tts-voice');
  ui.speak = document.getElementById('skelly-tts-speak');
  ui.download = document.getElementById('skelly-tts-download');
  ui.attach = document.getElementById('skelly-tts-attach');
  ui.clear = document.getElementById('skelly-tts-clear');
  ui.rate = document.getElementById('skelly-tts-rate');
  ui.text = document.getElementById('skelly-tts-text');
  ui.dlbar = document.getElementById('skelly-tts-dlbar');
  ui.dlstat = document.getElementById('skelly-tts-dlstat');
  ui.status = document.getElementById('skelly-tts-status');

  ui.voice.addEventListener('change', (e)=>{ e.target.value = VOICE_ID; /* locked */ });
  ui.speak.addEventListener('click', synthesize);
  ui.download.addEventListener('click', downloadWav);
  ui.attach.addEventListener('click', attachToUpload);
  ui.clear.addEventListener('click', ()=>{ ui.text.value=''; wavBlob=null; ui.download.disabled=true; ui.attach.disabled=true; setStatus('Cleared. Ready.'); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
else boot();
