/* =============================================================================
 *  VMS  ·  Recorder
 *
 *  Records a webm video from the user's camera with a live, burnt-in HUD
 *  overlay (date, time, marketplace, order id, etc.).
 *
 *  How it works:
 *    1. getUserMedia → MediaStream from the camera
 *    2. We pipe the stream into a hidden <video> element
 *    3. A requestAnimationFrame loop draws each video frame onto a <canvas>,
 *       then overlays the HUD text on top.
 *    4. canvas.captureStream() yields a new video track. We merge it with the
 *       original audio track and feed that combined stream to MediaRecorder.
 *    5. The original <video> is also shown to the user for live preview so
 *       they can see the same picture (with overlay) before pressing Stop.
 *
 *  Result: the saved .webm file has the overlay baked in.
 * ============================================================================= */

const Recorder = (() => {

  let stream = null;          // raw camera stream
  let combinedStream = null;  // canvas video + camera audio
  let recorder = null;
  let chunks = [];
  let drawHandle = null;
  let recordingStart = 0;
  let onTick = null;
  let facing = 'environment';

  // overlay metadata that the draw loop reads
  let overlay = {
    line1: '',
    line2: '',
  };

  /* ---------- camera setup ------------------------------------------------ */

  async function start({ videoEl, canvasEl, facingMode = 'environment' } = {}) {
    facing = facingMode;
    await stop(); // release any prior stream

    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width:  { ideal: 1280 },
        height: { ideal: 720  },
      },
      audio: true,
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);

    // show raw camera feed to the user — they'll see overlay via canvas
    // overlayed on the live element. To keep things simple, we mirror the
    // canvas to what the user sees by piping it into the visible <video>.
    videoEl.srcObject = null;     // we'll let the canvas drive the view
    videoEl.style.display = 'none';
    canvasEl.style.display = 'block';

    // configure canvas size to match video track
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const w = settings.width  || 1280;
    const h = settings.height || 720;
    canvasEl.width  = w;
    canvasEl.height = h;

    // hidden source video for the canvas
    const src = document.createElement('video');
    src.muted = true; src.autoplay = true; src.playsInline = true;
    src.srcObject = stream;
    await src.play();
    canvasEl._src = src;

    drawLoop(canvasEl);
  }

  async function switchCamera({ videoEl, canvasEl }) {
    facing = facing === 'environment' ? 'user' : 'environment';
    await start({ videoEl, canvasEl, facingMode: facing });
  }

  /* ---------- draw loop --------------------------------------------------- */
  function drawLoop(canvas) {
    const ctx = canvas.getContext('2d');
    const src = canvas._src;
    const draw = () => {
      if (!src) return;
      // draw frame
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      // draw overlay
      drawHUD(ctx, canvas.width, canvas.height);
      drawHandle = requestAnimationFrame(draw);
    };
    draw();
  }

  // burnt-in HUD — date/time, marketplace, order ID, optional brand badge
  function drawHUD(ctx, w, h) {
    const now = new Date();
    const date = UI.fmtDate(now);
    const time = UI.fmtTimeWithSec(now);

    const pad   = Math.round(w * 0.018);
    const fontL = Math.round(w * 0.020);
    const fontS = Math.round(w * 0.016);

    // bottom-left timestamp panel
    const ts = `${date}  |  ${time}`;
    ctx.font = `600 ${fontL}px 'JetBrains Mono', monospace`;
    const tsW = ctx.measureText(ts).width;
    drawBgBox(ctx, pad, h - pad - fontL*1.4 - 12, tsW + 24, fontL*1.4 + 12);
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(ts, pad + 12, h - pad - (fontL*1.4)/2 - 6);

    // bottom-right info block (marketplace + id, brand etc.)
    const lines = [overlay.line1, overlay.line2].filter(Boolean);
    if (lines.length) {
      ctx.font = `500 ${fontS}px 'JetBrains Mono', monospace`;
      const widths = lines.map(l => ctx.measureText(l).width);
      const bw = Math.max(...widths) + 24;
      const lh = fontS * 1.5;
      const bh = lines.length * lh + 12;
      drawBgBox(ctx, w - pad - bw, h - pad - bh, bw, bh);
      ctx.fillStyle = '#fff';
      lines.forEach((l, i) => {
        ctx.fillText(l, w - pad - bw + 12, h - pad - bh + 6 + lh*(i+0.5));
      });
    }

    // top-left rec dot when recording
    if (recorder && recorder.state === 'recording') {
      const r = Math.round(w * 0.01);
      drawBgBox(ctx, pad, pad, r*8 + 20, r*2 + 14);
      // pulsing dot
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 250);
      ctx.fillStyle = `rgba(248, 113, 113, ${pulse})`;
      ctx.beginPath();
      ctx.arc(pad + 12, pad + r + 7, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${fontS*0.85}px 'JetBrains Mono', monospace`;
      ctx.fillText('REC', pad + 12 + r + 6, pad + r + 7);
    }
  }

  function drawBgBox(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
  }

  /* ---------- overlay text setter ---------------------------------------- */
  function setOverlay({ line1 = '', line2 = '' }) {
    overlay.line1 = line1;
    overlay.line2 = line2;
  }

  /* ---------- recording start/stop --------------------------------------- */
  function record({ canvasEl, onTickCb }) {
    if (!stream) throw new Error('Camera not started.');
    chunks = [];
    onTick = onTickCb;

    // build combined stream: canvas video + camera audio
    const canvasStream = canvasEl.captureStream(30);
    const audioTracks  = stream.getAudioTracks();
    combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);

    const mime = pickMime();
    recorder = new MediaRecorder(combinedStream, {
      mimeType: mime,
      videoBitsPerSecond: window.VMS_CONFIG.VIDEO_BITRATE || 1_500_000,
    });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.start(1000);
    recordingStart = Date.now();

    // tick once a second for UI updates
    const tick = () => {
      if (!recorder || recorder.state !== 'recording') return;
      const elapsed = (Date.now() - recordingStart) / 1000;
      onTick?.(elapsed);
      // auto-stop at max length
      if (elapsed >= (window.VMS_CONFIG.MAX_RECORDING_SECONDS || 600)) {
        UI.toast('Max recording length reached', 'Recording stopped automatically.', 'warn');
        stopRecording();
        return;
      }
      setTimeout(tick, 250);
    };
    tick();
  }

  function pickMime() {
    const opts = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    return opts.find(t => MediaRecorder.isTypeSupported(t)) || '';
  }

  async function stopRecording() {
    if (!recorder || recorder.state === 'inactive') return null;
    return new Promise(resolve => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
        const duration = (Date.now() - recordingStart) / 1000;
        recorder = null;
        chunks = [];
        resolve({ blob, duration });
      };
      recorder.stop();
    });
  }

  /* ---------- cleanup ---------------------------------------------------- */
  async function stop() {
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch {}
    }
    recorder = null;
    chunks   = [];
    if (drawHandle) { cancelAnimationFrame(drawHandle); drawHandle = null; }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (combinedStream) {
      combinedStream.getTracks().forEach(t => t.stop());
      combinedStream = null;
    }
  }

  return { start, switchCamera, setOverlay, record, stopRecording, stop };
})();
