import AsrWorker from './asr-worker.js?worker';
(function(){
if(!/iPhone|iPad|iPod/i.test(navigator.userAgent))return;
const host=document.getElementById('abVoiceStatus'),game=document.getElementById('abGame');if(!host||!game)return;
const defaults=['111','333','444','666','777'],names=['A庄','A闲','庄赢了','闲赢了','和局了'],key='baccaratVoiceCodesV2';
let codes=defaults.slice();try{const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x)&&x.length===5&&x.every(v=>typeof v==='string'&&/^\d{3}$/.test(v))&&new Set(x).size===5)codes=x}catch(e){}
const section=document.createElement('div');section.className='card';section.innerHTML='<strong>手机数字语音</strong><p>开局后开启，说对应的数字口令即可自动记录。</p><p id="vpMap"></p><button type="button" id="vpSpeak">开启持续语音</button><p id="vpStatus" role="status"></p><p id="vpLast" role="status"></p>';host.after(section);document.getElementById('abVoice').hidden=true;host.hidden=true;window.baccaratVoiceNumeric=true;
const settings=document.createElement('details');settings.className='card';settings.innerHTML='<summary>语音口令设置</summary><p>每项设置一个不同的三位数字。设置只保存在这部手机。</p><div id="vpFields"></div><button id="vpSave" type="button">保存口令</button><p id="vpConfigStatus" role="status"></p>';game.appendChild(settings);
const $=id=>document.getElementById(id),status=$('vpStatus');let worker=null,pending=null,requestId=0,busy=false,listening=false,generation=0,recordAbort=null,audioSession=null;
window.baccaratVoiceResultPrompt=()=>{const digit='零一二三四五六七八九';return '结果出来后请说'+codes.slice(2).map(code=>[...code].map(n=>digit[Number(n)]).join('')).join('、')+'。'};
function msg(t){status.textContent=t}function render(){ $('vpMap').textContent=codes.map((v,i)=>v+'：'+names[i]).join('　');$('vpFields').replaceChildren();names.forEach((name,i)=>{let label=document.createElement('label');label.textContent=name+' ';let input=document.createElement('input');input.type='text';input.inputMode='numeric';input.maxLength=3;input.value=codes[i];input.id='vpCode'+i;input.style.width='80px';input.autocomplete='off';label.appendChild(input);$('vpFields').appendChild(label)})}
function cancelPending(){if(pending){const p=pending;pending=null;p.reject(Error('语音已停止'))}}
function release(){cancelPending();if(worker){worker.terminate();worker=null}}
function one(pcm,rate){return new Promise((resolve,reject)=>{
 if(!worker){worker=new AsrWorker();worker.onmessage=e=>{let d=e.data;if(!pending||d.id!==pending.id)return;if(d.status){msg(d.status);return}let p=pending;pending=null;if(d.error){release();p.reject(Error(d.error));return}p.resolve(d)};worker.onerror=()=>{let p=pending;pending=null;release();if(p)p.reject(Error('语音模型运行失败，请重试。'))}}
 const id=++requestId;pending={id,resolve,reject};worker.postMessage({id,pcm,rate,codes:codes.slice()});
})}

async function openAudio(signal){
 if(audioSession){if(audioSession.stream.getAudioTracks().some(t=>t.readyState!=='live'))throw Error('麦克风连接已中断，请重新开启语音。');if(audioSession.ctx.state!=='running'){msg('正在恢复麦克风…');await audioSession.ctx.resume();if(audioSession.ctx.state!=='running')throw Error('麦克风已暂停，请返回网页后重新开启语音。')}return audioSession;}
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error('无法使用麦克风，请允许权限。');
 const ctx=new (window.AudioContext||window.webkitAudioContext)();let stream;
 try{
  const resumed=ctx.resume();
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  await resumed;
  if(signal.aborted)throw Error('语音已停止');
  let source=ctx.createMediaStreamSource(stream),proc=ctx.createScriptProcessor(4096,1,1),gain=ctx.createGain();gain.gain.value=0;
  source.connect(proc);proc.connect(gain);gain.connect(ctx.destination);
  let session={ctx,stream,source,proc,gain,consume:null};proc.onaudioprocess=e=>{if(session.consume)session.consume(e.inputBuffer.getChannelData(0))};audioSession=session;return session;
 }catch(e){if(stream)stream.getTracks().forEach(t=>t.stop());await ctx.close().catch(()=>{});throw e}
}
function closeAudio(){let session=audioSession;audioSession=null;if(!session)return;session.consume=null;session.proc.onaudioprocess=null;session.stream.getTracks().forEach(t=>t.stop());session.source.disconnect();session.proc.disconnect();session.gain.disconnect();session.ctx.close().catch(()=>{})}
async function record(onReady,signal){
 let session=await openAudio(signal);if(signal.aborted)throw Error('语音已停止');let chunks=[];
 try{await new Promise((resolve,reject)=>{let timer=null,started=false;let stall=setTimeout(()=>finish(Error('麦克风没有提供声音，请检查权限后重试。')),8000);
 function finish(error){clearTimeout(stall);clearTimeout(timer);signal.removeEventListener('abort',cancel);session.consume=null;error?reject(error):resolve()}
 function cancel(){finish(Error('语音已停止'))}
 session.consume=channel=>{if(!started){started=true;clearTimeout(stall);onReady();timer=setTimeout(()=>finish(),4500)}chunks.push(new Float32Array(channel))};
 signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 });let size=chunks.reduce((n,x)=>n+x.length,0),pcm=new Float32Array(size),offset=0;for(const c of chunks){pcm.set(c,offset);offset+=c.length}if(pcm.length<session.ctx.sampleRate*2)throw Error('录音太短，请重试');let rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);if(rms<0.004)throw Error('没有听到声音');return{pcm,rate:session.ctx.sampleRate};}finally{session.consume=null}
}

async function capture(){if(busy)return;let token=generation,before=JSON.stringify(ab);recordAbort=new AbortController();let controller=recordAbort;busy=true;try{msg('正在准备麦克风…');let audio=await record(()=>msg('🎙 正在听，现在可以说数字口令。'),controller.signal);msg('正在识别，暂时听不到下一句…');let result=await one(audio.pcm,audio.rate);if(controller.signal.aborted||!listening||token!==generation||!ab||ab.ended||JSON.stringify(ab)!==before)return;let i=codes.indexOf(result.text),actions=[()=>abChoose('庄'),()=>abChoose('闲'),()=>abResult('庄'),()=>abResult('闲'),()=>abResult('和')];if(i>=0&&(i<2||ab.side)){actions[i]();$('vpLast').textContent='最近识别：'+codes[i]+'（'+names[i]+'）';msg('已录入：'+names[i])}else{let reason=i>=2&&!ab.side?'请先说 '+codes[0]+' 或 '+codes[1]+' 选择方向。':'没有听清口令，请再说一次。';$('vpLast').textContent='上次没有录入：'+reason;msg(reason)}}catch(e){if(e.message==='语音已停止'){}else if(e.message==='没有听到声音'){$('vpLast').textContent='上次没有录入：麦克风没有听到声音，请检查权限或靠近手机。';msg('没有听到声音，正在继续监听…')}else{if(listening&&token===generation)stop();let reason=e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器设置中允许。':e.message;$('vpLast').textContent='语音已关闭：'+reason;msg('未完成：'+reason)}}finally{if(recordAbort===controller)recordAbort=null;busy=false}}
function stop(){listening=false;generation++;if(recordAbort)recordAbort.abort();closeAudio();cancelPending();$('vpSpeak').textContent='开启持续语音';msg('持续语音已关闭。')}
window.addEventListener('baccarat-game-ended',stop);
window.addEventListener('pagehide',()=>{stop();release()});
$('vpSpeak').onclick=async()=>{if(listening){stop();return}if(!ab||ab.ended){msg('请先开始牌局。');return}document.getElementById('abSpeak').checked=true;abSay('语音播报已开启。');listening=true;generation++;const mine=generation;$('vpSpeak').textContent='关闭持续语音';while(listening&&generation===mine&&ab&&!ab.ended){if(window.abSpeechActive){msg('正在播报，结束后继续听。');await new Promise(r=>setTimeout(r,500));continue}await capture();await new Promise(r=>setTimeout(r,300))}if(generation===mine){listening=false;cancelPending();$('vpSpeak').textContent='开启持续语音';msg('持续语音已停止。')}};
$('vpSave').onclick=()=>{let next=names.map((_,i)=>$('vpCode'+i).value.trim());if(!next.every(v=>/^\d{3}$/.test(v))){$('vpConfigStatus').textContent='每项都需要填写三位数字。';return}if(new Set(next).size!==5){$('vpConfigStatus').textContent='五个口令不能重复。';return}try{localStorage.setItem(key,JSON.stringify(next))}catch(e){$('vpConfigStatus').textContent='保存失败，请检查浏览器存储。';return}if(listening||busy)stop();codes=next;render();$('vpConfigStatus').textContent='已保存，开启语音后使用新口令。'};
render();msg('开始牌局后点击开启持续语音。');
})();
