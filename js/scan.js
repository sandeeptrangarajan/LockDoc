/* =========================================================
   LockDoc — scan.js
   Drives scan.html: reads the device camera with jsQR and
   decodes a LockDoc QR payload, or accepts manual token entry.

   The scanned QR contains ONLY: { lockdocId, name, role }.
   Scanning creates a connection request — never reveals documents.
   ========================================================= */

LD.scan = {
  stream: null,
  video: null,
  canvas: null,
  ctx: null,
  rafId: null,
  active: false
};

LD.scan.start = function(videoEl, canvasEl, onResult, onError){
  LD.scan.video = videoEl;
  LD.scan.canvas = canvasEl;
  LD.scan.ctx = canvasEl.getContext('2d', { willReadFrequently: true });

  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    onError('Camera access is not supported on this browser.');
    return;
  }

  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(function(stream){
      LD.scan.stream = stream;
      videoEl.srcObject = stream;
      videoEl.setAttribute('playsinline', true);
      videoEl.play();
      LD.scan.active = true;
      requestAnimationFrame(() => LD.scan.tick(onResult));
    })
    .catch(function(err){
      onError('Camera permission denied or unavailable. You can paste the code manually below.');
    });
};

LD.scan.tick = function(onResult){
  if(!LD.scan.active) return;
  const video = LD.scan.video, canvas = LD.scan.canvas, ctx = LD.scan.ctx;

  if(video.readyState === video.HAVE_ENOUGH_DATA){
    canvas.height = video.videoHeight;
    canvas.width = video.videoWidth;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if(window.jsQR){
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
      if(code && code.data){
        LD.scan.stop();
        onResult(code.data);
        return;
      }
    }
  }
  LD.scan.rafId = requestAnimationFrame(() => LD.scan.tick(onResult));
};

LD.scan.stop = function(){
  LD.scan.active = false;
  if(LD.scan.rafId) cancelAnimationFrame(LD.scan.rafId);
  if(LD.scan.stream){
    LD.scan.stream.getTracks().forEach(t => t.stop());
    LD.scan.stream = null;
  }
};

/* ---------------------------------------------------------
   Parse scanned QR payload.
   Accepts: { lockdocId, name, role } JSON or raw text.
   Returns null if invalid.
   --------------------------------------------------------- */
LD.scan.parsePayload = function(raw){
  raw = (raw || '').trim();
  if (!raw) return null;

  // 1. JSON Payload
  try{
    const parsed = JSON.parse(raw);
    if(parsed) {
      const lockdocId = parsed.lockdocId || parsed.token || parsed.id || parsed.vaultId;
      if(lockdocId) {
        return {
          lockdocId: lockdocId,
          name: parsed.name || parsed.ownerName || parsed.categoryName || 'LockDoc Vault',
          role: parsed.role || 'holder'
        };
      }
    }
  }catch(e){ /* not JSON */ }

  // 2. URL Payload (e.g. http://localhost:5000/connect.html?lockdocId=... or viewer.html?doc=...)
  try{
    const url = new URL(raw);
    const docId = url.searchParams.get('doc');
    const lockdocId = url.searchParams.get('lockdocId') || url.searchParams.get('token');
    const name = url.searchParams.get('name') || 'LockDoc Vault';
    const role = url.searchParams.get('role') || 'holder';
    
    if(docId) {
      return { isDirectUrl: true, url: raw };
    }
    if(lockdocId) {
      return { lockdocId: lockdocId, name: name, role: role };
    }
    // If it's a link to any page on our domain, navigate directly
    if(url.origin === window.location.origin || raw.includes('ngrok-free.dev') || raw.includes('localhost')) {
      return { isDirectUrl: true, url: raw };
    }
  }catch(e){ /* not URL */ }

  // 3. Raw Token (e.g. LD-xxx or 24-character ObjectId string)
  if(raw.length >= 6) {
    return { lockdocId: raw, name: 'LockDoc Vault', role: 'holder' };
  }

  return null;
};
