(function(){
'use strict';

  // ── Kana → Romaji (Hepburn-style) ────────────────────────────
  // Ported from the same converter used to prebuild any static romaji;
  // kept here too so words YOU add in the custom box also get romaji.
  const KANA_MAP = {
    'あ':'a','い':'i','う':'u','え':'e','お':'o',
    'か':'ka','き':'ki','く':'ku','け':'ke','こ':'ko',
    'さ':'sa','し':'shi','す':'su','せ':'se','そ':'so',
    'た':'ta','ち':'chi','つ':'tsu','て':'te','と':'to',
    'な':'na','に':'ni','ぬ':'nu','ね':'ne','の':'no',
    'は':'ha','ひ':'hi','ふ':'fu','へ':'he','ほ':'ho',
    'ま':'ma','み':'mi','む':'mu','め':'me','も':'mo',
    'や':'ya','ゆ':'yu','よ':'yo',
    'ら':'ra','り':'ri','る':'ru','れ':'re','ろ':'ro',
    'わ':'wa','ゐ':'wi','ゑ':'we','を':'wo','ん':'n',
    'が':'ga','ぎ':'gi','ぐ':'gu','げ':'ge','ご':'go',
    'ざ':'za','じ':'ji','ず':'zu','ぜ':'ze','ぞ':'zo',
    'だ':'da','ぢ':'ji','づ':'zu','で':'de','ど':'do',
    'ば':'ba','び':'bi','ぶ':'bu','べ':'be','ぼ':'bo',
    'ぱ':'pa','ぴ':'pi','ぷ':'pu','ぺ':'pe','ぽ':'po',
    'ー':'-','・':' ','　':' ','～':'~',
  };
  const YOUON = {
    'きゃ':'kya','きゅ':'kyu','きょ':'kyo',
    'しゃ':'sha','しゅ':'shu','しょ':'sho',
    'ちゃ':'cha','ちゅ':'chu','ちょ':'cho',
    'にゃ':'nya','にゅ':'nyu','にょ':'nyo',
    'ひゃ':'hya','ひゅ':'hyu','ひょ':'hyo',
    'みゃ':'mya','みゅ':'myu','みょ':'myo',
    'りゃ':'rya','りゅ':'ryu','りょ':'ryo',
    'ぎゃ':'gya','ぎゅ':'gyu','ぎょ':'gyo',
    'じゃ':'ja','じゅ':'ju','じょ':'jo',
    'びゃ':'bya','びゅ':'byu','びょ':'byo',
    'ぴゃ':'pya','ぴゅ':'pyu','ぴょ':'pyo',
  };
  const VOWELS = new Set(['a','i','u','e','o']);

  function kataToHira(s){
    let out = '';
    for(const ch of s){
      const code = ch.codePointAt(0);
      out += (code>=0x30A1 && code<=0x30F6) ? String.fromCodePoint(code-0x60) : ch;
    }
    return out;
  }

  function toRomaji(sIn){
    const s = kataToHira(sIn);
    let result = [];
    let i = 0;
    const n = s.length;
    while(i < n){
      const ch = s[i];
      if(ch === 'っ'){
        const two = s.substr(i+1,2);
        const one = s.substr(i+1,1);
        if(YOUON[two]){ result.push(YOUON[two][0]); i+=1; continue; }
        if(KANA_MAP[one]){
          const r = KANA_MAP[one];
          if(r && !VOWELS.has(r[0]) && r!=='n') result.push(r[0]);
          i+=1; continue;
        }
        i+=1; continue;
      }
      const two = s.substr(i,2);
      if(YOUON[two]){ result.push(YOUON[two]); i+=2; continue; }
      const one = s[i];
      if(KANA_MAP[one] !== undefined){
        const r = KANA_MAP[one];
        if(r==='-' && result.length){
          const prev = result[result.length-1];
          if(prev && VOWELS.has(prev[prev.length-1])){ result.push(prev[prev.length-1]); i+=1; continue; }
        }
        result.push(r); i+=1; continue;
      }
      result.push(one); i+=1;
    }
    let romaji = result.join('');
    romaji = romaji.replace(/n([bmp])/g, 'm$1');
    return romaji;
  }

  // ── State ──────────────────────────────────────────────────
  let dataset   = [];   // full loaded set (may be range-limited for quiz)
  let fullset   = [];   // all words from selected level (for list view)
  let mode      = 'meaning';
  let selectedJlpt = null;
  let rangeFrom = 1;
  let rangeTo   = 50;
  let queue     = [];
  let total     = 0;
  let correctCount = 0;
  let wrongCount   = 0;
  let missedSet    = new Map();
  let current      = null;
  let locked       = false;

  // ── Elements ───────────────────────────────────────────────
  const setupScreen   = document.getElementById('setupScreen');
  const listScreen    = document.getElementById('listScreen');
  const quizScreen    = document.getElementById('quizScreen');
  const resultsScreen = document.getElementById('resultsScreen');
  const dataInput     = document.getElementById('dataInput');
  const parseError    = document.getElementById('parseError');
  const startBtn      = document.getElementById('startBtn');
  const viewListBtn   = document.getElementById('viewListBtn');
  const roundCount    = document.getElementById('roundCount');
  const totalNote     = document.getElementById('totalWordsNote');
  const rangeFromEl   = document.getElementById('rangeFrom');
  const rangeToEl     = document.getElementById('rangeTo');
  const rangePreview  = document.getElementById('rangePreview');

  // ── JLPT helpers ───────────────────────────────────────────
  function jlptWords(key){
    if(key === '5-3') return [...JLPT_DATA.n5, ...JLPT_DATA.n4, ...JLPT_DATA.n3];
    if(key === '5-1') return ['n5','n4','n3','n2','n1'].flatMap(k=>JLPT_DATA[k]);
    if(/^[1-5]$/.test(key)) return JLPT_DATA['n'+key];
    // alphabet charts store [char, romaji] pairs — expand to the same
    // [word, kana, meaning] shape the rest of the app expects
    if(key === 'hiragana') return KANA_DATA.hiragana.map(([c,r])=>[c,c,r]);
    if(key === 'katakana') return KANA_DATA.katakana.map(([c,r])=>[c,c,r]);
    return [];
  }

  function isAlphabetLevel(){
    return selectedJlpt === 'hiragana' || selectedJlpt === 'katakana';
  }

  function parseCSVLine(line){
    const fields=[]; let cur=''; let inQ=false;
    for(let i=0;i<line.length;i++){
      const ch=line[i];
      if(inQ){ if(ch==='"'){ if(line[i+1]==='"'){cur+='"';i++;}else{inQ=false;} }else{cur+=ch;} }
      else{ if(ch==='"'){inQ=true;} else if(ch===','){fields.push(cur);cur='';}else{cur+=ch;} }
    }
    fields.push(cur);
    return fields.map(f=>f.trim());
  }

  // ── Level buttons ──────────────────────────────────────────
  document.querySelectorAll('[data-jlpt]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('[data-jlpt]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedJlpt = btn.dataset.jlpt;
      rebuildDataset();
    });
  });

  // ── Mode buttons ───────────────────────────────────────────
  document.querySelectorAll('[data-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('[data-mode]').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      mode = btn.dataset.mode;
    });
  });

  // ── Custom textarea ────────────────────────────────────────
  dataInput.addEventListener('input', rebuildDataset);

  // ── Range inputs ───────────────────────────────────────────
  rangeFromEl.addEventListener('input', ()=>{ applyRange(); updateRangePreview(); });
  rangeToEl.addEventListener('input',   ()=>{ applyRange(); updateRangePreview(); });

  function applyRange(){
    const n = fullset.length;
    if(!n){ dataset=[]; return; }
    rangeFrom = Math.max(1, Math.min(parseInt(rangeFromEl.value)||1, n));
    rangeTo   = Math.max(rangeFrom, Math.min(parseInt(rangeToEl.value)||n, n));
    rangeFromEl.value = rangeFrom;
    rangeToEl.value   = rangeTo;
    dataset = fullset.slice(rangeFrom-1, rangeTo);
    const maxRound = dataset.length;
    roundCount.max = maxRound;
    if(parseInt(roundCount.value)>maxRound) roundCount.value=Math.min(20,maxRound);
    startBtn.disabled = dataset.length < 4;
    viewListBtn.disabled = fullset.length === 0;
  }

  function updateRangePreview(){
    const n = fullset.length;
    if(!n){ rangePreview.textContent=''; totalNote.textContent=''; return; }
    const from = Math.max(1,parseInt(rangeFromEl.value)||1);
    const to   = Math.min(n,Math.max(from,parseInt(rangeToEl.value)||n));
    const count = to-from+1;
    rangePreview.textContent = `Practising words ${from}–${to} (${count} word${count===1?'':'s'} from ${n} total)`;
    totalNote.textContent = `/ ${n}`;
  }

  function rebuildDataset(){
    // parse custom paste
    const raw = dataInput.value.trim();
    const customWords = [];
    const bad = [];
    if(raw){
      raw.split('\n').forEach((line,i)=>{
        line=line.trim(); if(!line) return;
        const f=parseCSVLine(line);
        if(f.length<3||!f[0]||!f[2]){ bad.push(i+1); return; }
        customWords.push({word:f[0],kana:f[1]||'',romaji:toRomaji(f[1]||''),meaning:f[2]});
      });
    }

    let base = [];
    if(selectedJlpt && selectedJlpt!=='custom'){
      base = jlptWords(selectedJlpt).map(([w,k,m])=>({word:w,kana:k,romaji:toRomaji(k),meaning:m}));
    }
    fullset = selectedJlpt==='custom' ? customWords : [...base,...customWords];

    if(bad.length){
      parseError.textContent=`Skipped ${bad.length} line(s) missing a field: line(s) ${bad.slice(0,8).join(', ')}${bad.length>8?'…':''}.`;
      parseError.classList.remove('hidden');
    } else {
      parseError.classList.add('hidden');
    }

    // reset range bounds to sensible defaults when level changes
    const n = fullset.length;
    if(n){
      rangeFromEl.max = n; rangeToEl.max = n;
      // if current range exceeds new size, reset
      if(parseInt(rangeFromEl.value)>n) rangeFromEl.value=1;
      if(parseInt(rangeToEl.value)>n)   rangeToEl.value=Math.min(50,n);
      if(parseInt(rangeToEl.value)<parseInt(rangeFromEl.value)) rangeToEl.value=rangeFromEl.value;
    }

    applyRange();
    updateRangePreview();
    updateListView();
  }

  // ── Start button ───────────────────────────────────────────
  startBtn.addEventListener('click',()=>{
    const n = Math.max(3, Math.min(parseInt(roundCount.value)||20, dataset.length));
    const indices = shuffled(dataset.length).slice(0,n);
    startRound(indices);
  });

  // ── Word list panel ────────────────────────────────────────
  viewListBtn.addEventListener('click',()=>{
    setupScreen.classList.add('hidden');
    listScreen.classList.remove('hidden');
    renderList('');
  });

  document.getElementById('closeListBtn').addEventListener('click',()=>{
    listScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
  });

  document.getElementById('listSearch').addEventListener('input', e=>{
    renderList(e.target.value.trim().toLowerCase());
  });

  function updateListView(){
    // If list panel is open, refresh it
    if(!listScreen.classList.contains('hidden')){
      renderList(document.getElementById('listSearch').value.trim().toLowerCase());
    }
  }

  function renderList(query){
    const tbody = document.getElementById('listBody');
    const countEl = document.getElementById('listCount');
    tbody.innerHTML='';
    if(!fullset.length){
      tbody.innerHTML='<tr><td colspan="4" class="list-empty">No words loaded — pick a JLPT level above.</td></tr>';
      countEl.textContent=''; return;
    }

    // highlight range
    const rFrom = parseInt(rangeFromEl.value)||1;
    const rTo   = parseInt(rangeToEl.value)||fullset.length;

    let shown=0;
    fullset.forEach((w,i)=>{
      const num = i+1;
      if(query){
        const hay = (w.word+' '+w.kana+' '+w.romaji+' '+w.meaning).toLowerCase();
        if(!hay.includes(query)) return;
      }
      shown++;
      const inRange = num>=rFrom && num<=rTo;
      const tr = document.createElement('tr');
      if(inRange) tr.style.background='#f2f7f3';
      tr.innerHTML=`
        <td class="num">${num}</td>
        <td class="han">${esc(w.word)}</td>
        <td class="py">${esc(w.kana)}<br><span style="color:#9a9182;font-size:11px;">${esc(w.romaji)}</span></td>
        <td class="mean">${esc(w.meaning)}</td>`;
      tbody.appendChild(tr);
    });
    if(shown===0){
      tbody.innerHTML='<tr><td colspan="4" class="list-empty">No matches.</td></tr>';
    }
    countEl.textContent = query
      ? `Showing ${shown} of ${fullset.length} words — green rows are in your current range (${rFrom}–${rTo}).`
      : `${fullset.length} words total — green rows are in your current range (${rFrom}–${rTo}).`;
  }

  // ── Quiz engine ────────────────────────────────────────────
  function shuffled(n){
    const a=Array.from({length:n},(_,i)=>i);
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  function startRound(indices){
    // indices are positions within dataset[]
    queue = indices.slice();
    total = queue.length;
    correctCount=0; wrongCount=0; missedSet=new Map();
    setupScreen.classList.add('hidden');
    listScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');
    nextCard();
  }

  function directionFor(){
    if(mode==='word')    return 'word';
    if(mode==='meaning') return 'meaning';
    return Math.random()<.5 ? 'meaning' : 'word';
  }

  function pickDistractors(correctPos, count){
    // distractors are indices into dataset[]
    const pool = shuffled(dataset.length).filter(i=>i!==correctPos);
    return pool.slice(0,count);
  }

  function nextCard(){
    locked=false;
    document.getElementById('nextBtn').disabled=true;
    if(!queue.length){ finishRound(); return; }

    const pos = queue.shift();       // index into dataset[]
    const direction = directionFor();
    current = {pos, direction};

    const done = total - queue.length;
    document.getElementById('cardIndex').textContent  = done;
    document.getElementById('cardTotal').textContent  = total;
    document.getElementById('progressFill').style.width = (((done-1)/total)*100)+'%';
    document.getElementById('liveCorrect').textContent = correctCount;
    document.getElementById('liveWrong').textContent   = wrongCount;

    const word = dataset[pos];
    const promptMain  = document.getElementById('promptMain');
    const promptLabel = document.getElementById('promptLabel');
    const promptSub   = document.getElementById('promptSub');

    const alphaMode = isAlphabetLevel();

    if(direction==='meaning'){
      promptLabel.textContent = alphaMode ? 'What sound does this make?' : 'What does this mean?';
      promptMain.textContent  = word.word;
      promptMain.classList.remove('meaning-mode');
      // In alphabet mode the romaji IS the answer being quizzed, so no hint is shown.
      promptSub.textContent   = alphaMode ? '' : (word.kana + (word.romaji ? ' · '+word.romaji : ''));
    } else {
      promptLabel.textContent = alphaMode ? 'Which character makes this sound?' : 'Which word matches this meaning?';
      promptMain.textContent  = word.meaning;
      promptMain.classList.add('meaning-mode');
      promptSub.textContent   = '';
    }

    const distractors = pickDistractors(pos, 3);
    const allPos = [pos,...distractors];
    // shuffle
    for(let i=allPos.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1));[allPos[i],allPos[j]]=[allPos[j],allPos[i]]; }

    const optionsList = document.getElementById('optionsList');
    optionsList.innerHTML='';
    allPos.forEach(optPos=>{
      const w = dataset[optPos];
      const btn = document.createElement('button');
      btn.className='option';
      btn.dataset.optPos = optPos;
      if(direction==='meaning'){
        btn.innerHTML=`<span>${esc(w.meaning)}</span>`;
      } else if(alphaMode){
        // subtitle would repeat the romaji answer right under each option — omit it
        btn.innerHTML=`<span class="opt-han">${esc(w.word)}</span>`;
      } else {
        btn.innerHTML=`<span class="opt-han">${esc(w.word)}</span><span style="color:#9a9182;font-size:12px;">${esc(w.kana||'')}${w.romaji?' · '+esc(w.romaji):''}</span>`;
      }
      btn.addEventListener('click',()=>handleAnswer(optPos,btn));
      optionsList.appendChild(btn);
    });
  }

  function handleAnswer(optPos, btnEl){
    if(locked) return;
    locked=true;
    const isCorrect = optPos===current.pos;
    const allOptions = document.querySelectorAll('#optionsList .option');
    allOptions.forEach(o=>o.classList.add('locked'));

    if(isCorrect){
      correctCount++;
    } else {
      wrongCount++;
      const w=dataset[current.pos];
      if(!missedSet.has(current.pos)) missedSet.set(current.pos,w);
      queue.push(current.pos);
      total++;
    }

    allOptions.forEach(opt=>{
      const p=parseInt(opt.dataset.optPos,10);
      if(p===current.pos)      opt.classList.add('correct');
      else if(opt===btnEl)     opt.classList.add('wrong');
      else                     opt.classList.add('dim');
    });

    document.getElementById('liveCorrect').textContent = correctCount;
    document.getElementById('liveWrong').textContent   = wrongCount;
    document.getElementById('nextBtn').disabled=false;
  }

  document.getElementById('nextBtn').addEventListener('click', nextCard);

  // ── Results ────────────────────────────────────────────────
  function finishRound(){
    quizScreen.classList.add('hidden');
    resultsScreen.classList.remove('hidden');
    const attempts = correctCount+wrongCount;
    const pct = attempts ? Math.round((correctCount/attempts)*100) : 0;
    document.getElementById('finalPct').textContent   = pct+'%';
    document.getElementById('finalSummary').textContent =
      `${correctCount} correct, ${wrongCount} missed across ${attempts} attempt${attempts===1?'':'s'}.`;

    const mc=document.getElementById('missContainer');
    mc.innerHTML='';
    if(!missedSet.size){
      mc.innerHTML='<div class="empty-misses">Perfect round — nothing to review. 🎉</div>';
      document.getElementById('retryMissedBtn').disabled=true;
    } else {
      document.getElementById('retryMissedBtn').disabled=false;
      missedSet.forEach(w=>{
        const row=document.createElement('div');
        row.className='miss-item';
        row.innerHTML=`<span><span class="han">${esc(w.word)}</span><span class="py">${esc(w.kana||'')}${w.romaji?' · '+esc(w.romaji):''}</span></span><span class="mean">${esc(w.meaning)}</span>`;
        mc.appendChild(row);
      });
    }
    window._lastMissedPos = Array.from(missedSet.keys());
  }

  document.getElementById('retryMissedBtn').addEventListener('click',()=>{
    const idxs = window._lastMissedPos||[];
    if(!idxs.length) return;
    startRound(shuffled(idxs.length).map(i=>idxs[i]));
  });

  document.getElementById('restartBtn').addEventListener('click',()=>{
    resultsScreen.classList.add('hidden');
    setupScreen.classList.remove('hidden');
  });

  function esc(s){
    return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

})();
