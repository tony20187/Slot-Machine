(() => {
  const PASSWORD = "0423594446";
  const LS_SYMBOL_LIMITS = "slot_symbol_limits_no_payout_v1"; // {file:{maxWins:number,wins:number}}
  const LS_FORCE_RATE   = "slot_force_jackpot_rate_percent_v1"; // 0~100 %
  const LS_SESSION_WINS = "slot_session_wins_v1";               // 本次開啟累計（session）

  /* ===== 可調機率：預設 20% =====
     代表「每次拉霸，有 X% 機率被強制為三連線」。
     只有三張完全相同才算中獎（未觸發強制時仍採正常隨機）。
  */
  let FORCE_JACKPOT_RATE_PERCENT = (() => {
    const v = Number(localStorage.getItem(LS_FORCE_RATE));
    return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.floor(v))) : 20;
  })();

  /* 7 張照片（依檔名） */
  const DEFAULT_SYMBOLS = [
    { file: "明宇-1.png", label: "明宇",  weight: 10 },
    { file: "明鑫-1.png", label: "明鑫",  weight: 10 },
    { file: "俊源.jpg",   label: "俊源",  weight: 10 },
    { file: "浩安.jpg",   label: "浩安",  weight: 10 },
    { file: "啟明.jpg",   label: "啟明",  weight: 10 },
    { file: "嘉明.jpg",   label: "嘉明",  weight: 10 },
    { file: "嘉政.jpg",   label: "嘉政",  weight: 10 }
  ];

  /* DOM */
  const img1 = document.getElementById("r1");
  const img2 = document.getElementById("r2");
  const img3 = document.getElementById("r3");
  const msg  = document.getElementById("msg");
  const muteBtn  = document.getElementById("muteBtn");
  const vol = document.getElementById("vol");
  const totalStat = document.getElementById("totalStat");
  const panelSpinBtn = document.getElementById("panelSpinBtn");
  const versionLabel = document.getElementById("versionLabel"); // 可選
  const root = document.body;

  /* 狀態 */
  let spinning=false, spinIntervals=[], isMuted=false;
  let symbols=[...DEFAULT_SYMBOLS];
  let bag=[];
  // 本局預先決定的最終結果（陣列長度 3）
  let plannedFinals = null;

  /* 本次開啟累計中獎數（session 儲存） */
  let sessionWins = Number(sessionStorage.getItem(LS_SESSION_WINS)) || 0;
  const incSessionWins = () => {
    sessionWins += 1;
    try { sessionStorage.setItem(LS_SESSION_WINS, String(sessionWins)); } catch(e){}
  };
  const resetSessionWins = () => {
    sessionWins = 0;
    try { sessionStorage.removeItem(LS_SESSION_WINS); } catch(e){}
  };

  /* 權重夾住：1～10 */
  const clampWeight = (v)=> {
    v = Math.round(Number(v)||1);
    if(v<1) v=1;
    if(v>10) v=10;
    return v;
  };

  /* ===== 個別上限/計數（永久，localStorage） ===== */
  function loadLimits(){
    let data = {};
    try{ data = JSON.parse(localStorage.getItem(LS_SYMBOL_LIMITS)||"{}"); }catch(e){ data={}; }
    symbols.forEach(s=>{ if(!data[s.file]) data[s.file]={maxWins:0,wins:0}; });
    localStorage.setItem(LS_SYMBOL_LIMITS, JSON.stringify(data));
    return data;
  }
  let symbolLimits = loadLimits();
  function saveLimits(){ localStorage.setItem(LS_SYMBOL_LIMITS, JSON.stringify(symbolLimits)); }
  const isBlocked = (file)=> {
    const lim = symbolLimits[file]; return lim && lim.maxWins>0 && lim.wins>=lim.maxWins;
  };

  /* 右下顯示：本次開啟累計 */
  const updateTotalStat = ()=> {
    if (totalStat) totalStat.textContent = `總連線中獎次數：${sessionWins}`;
  };
  updateTotalStat();

  /* ===== 權重抽樣袋（排除達上限者） ===== */
  function rebuildBag(){
    bag=[];
    symbols.forEach(s=>{
      if(isBlocked(s.file)) return; // 達上限者直接排除
      const w = clampWeight(s.weight);
      for(let i=0;i<w;i++) bag.push(s);
    });
    if(bag.length===0){
      bag = [...symbols]; // 保底：全部回袋
    }
  }
  rebuildBag();
  const pick = () => bag[Math.floor(Math.random()*bag.length)];

  /* 圖片預載 */
  function preload(list){
    return Promise.all(list.map(s => new Promise(res=>{
      const im = new Image(); im.onload=()=>res(); im.onerror=()=>res(); im.src=s.file;
    })));
  }

  /* ===== 聲音 ===== */
  let ctx=null, masterGain=null, spinNodes=null;
  function ensureAudio(){
    if(!ctx){
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = (Number(vol?.value||70)/100)*0.8;
      masterGain.connect(ctx.destination);
    }
    if(ctx.state==="suspended") ctx.resume();
  }
  function startSpinSFX(){
    if(isMuted) return;
    ensureAudio();
    const g = ctx.createGain(); g.gain.value=0.0001;
    const lp = ctx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=900;
    const o1 = ctx.createOscillator(); o1.type="sawtooth"; o1.frequency.value=160;
    const o2 = ctx.createOscillator(); o2.type="sawtooth"; o2.frequency.value=164; o2.detune.value=+6;
    o1.connect(g); o2.connect(g); g.connect(lp).connect(masterGain);
    const now = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime((Number(vol?.value||70)/100)*0.08, now+0.12);
    o1.frequency.linearRampToValueAtTime(260, now+1.5);
    o2.frequency.linearRampToValueAtTime(266, now+1.5);
    o1.start(); o2.start();
    spinNodes = {o1,o2,g};
  }
  function stopSpinSFX(){
    if(!spinNodes||!ctx) return;
    const {o1,o2,g} = spinNodes; const t=ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
    try{ o1.stop(t+0.15); o2.stop(t+0.15); }catch(e){}
    spinNodes=null;
  }
  function playApplause(){
    if(isMuted) return; ensureAudio();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type="triangle"; o.frequency.value=600; g.gain.value=0.0001;
    o.connect(g).connect(masterGain);
    const t=ctx.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime((Number(vol?.value||70)/100)*0.3, t+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.4);
    o.stop(t+0.45);
  }
  function playLose(){
    if(isMuted) return; ensureAudio();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type="sine"; o.frequency.value=300; g.gain.value=0.0001;
    o.connect(g).connect(masterGain);
    const t=ctx.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime((Number(vol?.value||70)/100)*0.25, t+0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.35);
    o.stop(t+0.4);
  }

  // 啟動提示音（載入後播一下「滴」）
  function playStartHint(){
    if(isMuted) return; ensureAudio();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type="square"; o.frequency.value=880; g.gain.value=0.0001;
    o.connect(g).connect(masterGain);
    const t=ctx.currentTime;
    o.start(t);
    g.gain.exponentialRampToValueAtTime((Number(vol?.value||70)/100)*0.18, t+0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.20);
    o.stop(t+0.22);
  }

  window.addEventListener("pointerdown", ()=>{ try{ ensureAudio(); }catch(e){} }, { once:true });
  vol?.addEventListener("input", ()=>{ if(masterGain) masterGain.gain.value=(Number(vol.value)/100)*0.8; });

  /* ===== 視覺旋轉 ===== */
  const reels=[img1,img2,img3];
  function startReel(i,period){
    const el = reels[i];
    const t = setInterval(()=>{ el.src = pick().file; }, period);
    spinIntervals[i]=t; el.classList.add("blur"); el.parentElement.classList.add("spin");
  }
  function stopReel(i,finalSymbol){
    clearInterval(spinIntervals[i]);
    reels[i].classList.remove("blur");
    reels[i].src = finalSymbol.file;
    reels[i].parentElement.classList.remove("spin");
  }
  function markWinSlots(on=true){
    const els = Array.from(document.querySelectorAll(".slot"));
    els.forEach(s=>s.classList.toggle("win", on));
    if(on && navigator.vibrate) try{ navigator.vibrate([60,60,60]); }catch(e){}
    setTimeout(()=>els.forEach(s=>s.classList.remove("win")),700);
  }

  /* ===== 遊戲流程：先決定結果，停止時只顯示 ===== */
  function startSpin(){
    if(spinning) return;
    spinning=true;
    msg.className="message"; msg.textContent="轉動中...";
    startSpinSFX();

    panelSpinBtn?.classList.add('press-glow');
    panelSpinBtn?.classList.add('disabled');

    startReel(0,55); startReel(1,65); startReel(2,75);

    // 命中機率→三張同圖；否則三張獨立
    const hit = Math.random() < (Math.min(100, Math.max(0, Number(FORCE_JACKPOT_RATE_PERCENT)||0)) / 100);
    if (hit) {
      const s = pick();
      plannedFinals = [s, s, s];
    } else {
      plannedFinals = [pick(), pick(), pick()];
    }

    setTimeout(()=>stopReel(0, plannedFinals[0]),700);
    setTimeout(()=>stopReel(1, plannedFinals[1]),1200);
    setTimeout(()=>{ stopReel(2, plannedFinals[2]); finish(plannedFinals); },1700);
  }

  function finish(arr){
    stopSpinSFX();
    spinning = false;

    panelSpinBtn?.classList.remove('disabled');

    var a = arr[0], b = arr[1], c = arr[2];

    if (a && b && c && a.file && a.file === b.file && b.file === c.file) {
      var sym = symbols.find(function(s){ return s.file === a.file; }) || a;
      var lim = symbolLimits[sym.file] || { maxWins: 0, wins: 0 };
      lim.wins = (lim.wins || 0) + 1;
      symbolLimits[sym.file] = lim;
      saveLimits();

      // ▶ 本次會話＋1（顯示於右下）
      incSessionWins();
      updateTotalStat();

      msg.className = "message ok";
      msg.textContent = "🎉 三連線！「" + sym.label + "」 （該人物第 " + lim.wins + " 次）";

      if (lim.maxWins > 0 && lim.wins >= lim.maxWins) rebuildBag();

      // 更新面板上的已中次數
      var key = sym.file;
      var selector = '[data-file="' + (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key) + '"].wins';
      var winsSpan = document.querySelector(selector);
      if (winsSpan) winsSpan.textContent = String(lim.wins);

      if (root) root.classList.add("win-flash");
      markWinSlots(true);
      setTimeout(function(){ if (root) root.classList.remove("win-flash"); }, 900);
      playApplause();
    } else {
      msg.className = "message bad";
      msg.textContent = "未中獎，再試一次！（Space）";
      playLose();
    }

    setTimeout(()=>panelSpinBtn?.classList.remove('press-glow'), 300);
  }

  function stopSpinManual(){
    if(!spinning) return;

    // 停止轉動特效
    [0,1,2].forEach(i=>{
      if(spinIntervals[i]) clearInterval(spinIntervals[i]);
      reels[i].classList.remove("blur");
      reels[i].parentElement.classList.remove("spin");
    });

    // 直接用「已決定的 plannedFinals」當最終結果（不再 pick()）
    if (!plannedFinals) {
      plannedFinals = reels.map(el=>{
        const f = (el.getAttribute("src")||"").split("/").pop();
        return symbols.find(s=>s.file===f) || {file:f,label:f,weight:1};
      });
    } else {
      reels[0].src = plannedFinals[0].file;
      reels[1].src = plannedFinals[1].file;
      reels[2].src = plannedFinals[2].file;
    }

    finish(plannedFinals);
  }

  /* ===== 操作綁定 ===== */
  document.addEventListener("keydown", e=>{
    if(e.code==="Space"){
      e.preventDefault(); ensureAudio();
      if(!spinning) startSpin(); else stopSpinManual();
    }
  });

  muteBtn?.addEventListener("click", ()=>{
    isMuted = !isMuted;
    muteBtn.textContent = isMuted ? "🔇 聲音：關" : "🔊 聲音：開";
  });

  panelSpinBtn?.addEventListener("click", () => {
    ensureAudio();
    if (!spinning) startSpin(); else stopSpinManual();
  });

  /* ===== 面板（密碼＋表單） ===== */
  const passInput=document.getElementById("passInput");
  const passBtn  =document.getElementById("passBtn");
  const passMsg  =document.getElementById("passMsg");
  const cfgHost  =document.getElementById("cfg");
  const cfgArea  =document.getElementById("cfgContainer");
  const passwordArea=document.getElementById("passwordArea");
  const resetWinsAllBtn=document.getElementById("resetWinsAllBtn");

  // === 強制三連線機率列（0~100%）＋ 設定 / 重置(20%)：放在面板最上方 ===
  function renderForceRateRow(container){
    const old = container.querySelector('.force-row');
    if (old) old.remove();

    const row = document.createElement("div");
    row.className = "size-row force-row";

    const label = document.createElement("label");
    label.textContent = "強制三連線機率(%)：";

    const input = document.createElement("input");
    input.type = "number"; input.min = "0"; input.max = "100"; input.step = "1";
    input.value = String(FORCE_JACKPOT_RATE_PERCENT);

    const setBtn = document.createElement("button");
    setBtn.textContent = "設定";
    setBtn.className = "btn mini";

    input.oninput = ()=>{
      let v = Math.floor(Number(input.value)||0);
      if(v<0) v=0; if(v>100) v=100;
      input.value = String(v);
    };
    setBtn.onclick = () => {
      let v = Math.floor(Number(input.value) || 0);
      if (v < 0) v = 0; if (v > 100) v = 100;
      FORCE_JACKPOT_RATE_PERCENT = v;
      try { localStorage.setItem(LS_FORCE_RATE, String(v)); } catch(e) {}
      msg.textContent = `🎯 已設定強制三連線機率為 ${v}%`;
    };

    const resetBtn = document.createElement("button");
    resetBtn.textContent = "重置";
    resetBtn.className = "btn mini";
    resetBtn.onclick = () => {
      FORCE_JACKPOT_RATE_PERCENT = 20;
      input.value = "20";
      try { localStorage.setItem(LS_FORCE_RATE, "20"); } catch(e) {}
      msg.textContent = "🔄 已重置強制三連線機率為 20%";
    };

    const tip = document.createElement("span");
    tip.className="muted";
    tip.textContent = "（0 = 不啟用；預設 20）";

    row.append(label, input, setBtn, resetBtn, tip);
    container.prepend(row);
  }

  function renderConfig(){
    cfgHost.innerHTML="";

    // 插入強制機率控制
    renderForceRateRow(cfgArea);

    const heads=["人物","權重(1~10)","預覽","已中","上限","重置"];
    heads.forEach((h)=>{
      const d=document.createElement("div");
      d.className="hdr"; d.textContent=h;
      cfgHost.appendChild(d);
    });

    symbols.forEach((s,i)=>{
      const lim = symbolLimits[s.file] || {maxWins:0,wins:0};

      const n=document.createElement("div"); n.textContent=s.label;

      const w=document.createElement("input");
      w.type="number"; w.min="1"; w.max="10"; w.step="1";
      w.value = clampWeight(s.weight);
      w.oninput=()=>{ symbols[i].weight = clampWeight(w.value); w.value = symbols[i].weight; rebuildBag(); };

      const prev=document.createElement("div");
      prev.className="prevBox"; prev.title = s.file;
      prev.innerHTML=`<img src="${s.file}" alt="${s.label}">`;

      const wins=document.createElement("div");
      wins.textContent=lim.wins||0; wins.className="wins"; wins.setAttribute("data-file", s.file);

      const maxIn=document.createElement("input");
      maxIn.type="number"; maxIn.min="0"; maxIn.step="1"; maxIn.placeholder="0=不限";
      maxIn.value = lim.maxWins>0 ? lim.maxWins : "";
      maxIn.oninput=()=>{
        const v = Number(maxIn.value||0);
        if(!symbolLimits[s.file]) symbolLimits[s.file]={maxWins:0,wins:0};
        symbolLimits[s.file].maxWins = v>0 ? Math.floor(v) : 0;
        saveLimits(); rebuildBag();
      };

      const resetBtn=document.createElement("button");
      resetBtn.className="btn mini"; resetBtn.textContent="重置";
      resetBtn.onclick=()=>{
        symbolLimits[s.file]={maxWins: (Number(maxIn.value)||0), wins:0};
        wins.textContent="0"; saveLimits(); rebuildBag(); updateTotalStat();
        msg.textContent=`🧹 已重置「${s.label}」已中獎次數`;
      };

      cfgHost.append(n,w,prev,wins,maxIn,resetBtn);
    });
  }

  document.getElementById("passBtn")?.addEventListener("click", ()=>{
    if(passInput.value===PASSWORD){
      passMsg.textContent="✅ 密碼正確";
      passwordArea.style.display="none";
      cfgArea.style.display="block";
      renderConfig();
    }else{
      passMsg.textContent="❌ 密碼錯誤";
    }
  });

  document.getElementById("applyBtn")?.addEventListener("click", ()=>{
    saveLimits(); rebuildBag();
    msg.textContent="✅ 已套用設定（權重/個別上限/機率）";
  });

  document.getElementById("resetBtn")?.addEventListener("click", ()=>{
    symbols=[...DEFAULT_SYMBOLS];
    renderConfig(); rebuildBag();
    msg.textContent="↩ 已重置為預設權重（機率值保留，可在上方調整）";
  });

  resetWinsAllBtn?.addEventListener("click", ()=>{
    Object.keys(symbolLimits).forEach(k=> symbolLimits[k].wins=0 );
    saveLimits(); rebuildBag();

    // 歸零「本次開啟」總數
    resetSessionWins();
    updateTotalStat();

    document.querySelectorAll(".wins").forEach(el=>el.textContent="0");
    msg.textContent="🧹 已重置遊戲（所有已中歸零，皆可再出現）";
  });

  /* 初始化 */
  preload(symbols).then(()=>{
    const f = symbols;
    document.getElementById("r1").src = f[0].file;
    document.getElementById("r2").src = f[1].file;
    document.getElementById("r3").src = f[2].file;

    playStartHint();
    msg.textContent = "照片已就緒：按下方拉霸按鈕開始！";

    // 顯示版本（如果 HTML 放了 #versionLabel）
    if (versionLabel && window.APP_VERSION) {
      versionLabel.textContent = `版本：v${window.APP_VERSION}`;
    }

    // 確保剛開啟時右下顯示 0（或 session 值）
    updateTotalStat();
  });
})();
