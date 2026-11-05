import AsrWorker from './asr-worker.js?worker';
(function(){
if(!/iPhone|iPad|iPod/i.test(navigator.userAgent))return;
const host=document.getElementById('abVoiceStatus'),game=document.getElementById('abGame');if(!host||!game)return;
const defaults=['111','333','444','666','777'],names=['A庄','A闲','庄赢了','闲赢了','和局了'],key='baccaratVoiceCodesV2';
let codes=defaults.slice();try{const x=JSON.parse(localStorage.getItem(key)||'null');if(Array.isArray(x)&&x.length===5&&x.every(v=>typeof v==='string'&&/^\d{3}$/.test(v))&&new Set(x).size===5)codes=x}catch(e){}
const section=document.createElement('div');section.className='card';section.innerHTML='<strong>手机数字语音</strong><p>开局后开启，说对应的数字口令即可自动记录。</p><p id="vpMap"></p><button type="button" id="vpSpeak">开启持续语音</button><p id="vpStatus" role="status"></p><p id="vpLast" role="status"></p>';host.after(section);document.getElementById('abVoice').hidden=true;host.hidden=true;window.baccaratVoiceNumeric=true;
const settings=document.createElement('details');settings.className='card';settings.innerHTML='<summary>语音口令设置</summary><p>每项设置一个不同的三位数字。设置只保存在这部手机。</p><div id="vpFields"></div><button id="vpSave" type="button">保存口令</button><p id="vpConfigStatus" role="status"></p>';game.appendChild(settings);
const $=id=>document.getElementById(id),status=$('vpStatus');let worker=null,pending=null,requestId=0,busy=false,listening=false,generation=0,recordAbort=null,startupAbort=null,audioSession=null,pagePaused=false;
window.baccaratVoiceResultPrompt=()=>{const digit='零一二三四五六七八九';return '结果出来后请说'+codes.slice(2).map(code=>[...code].map(n=>digit[Number(n)]).join('')).join('、')+'。'};
function msg(t){status.textContent=t}function render(){ $('vpMap').textContent=codes.map((v,i)=>v+'：'+names[i]).join('　');$('vpFields').replaceChildren();names.forEach((name,i)=>{let label=document.createElement('label');label.textContent=name+' ';let input=document.createElement('input');input.type='text';input.inputMode='numeric';input.maxLength=3;input.value=codes[i];input.id='vpCode'+i;input.style.width='80px';input.autocomplete='off';label.appendChild(input);$('vpFields').appendChild(label)})}
function cancelPending(){if(pending){const p=pending;pending=null;p.reject(Error('语音已停止'))}}
function release(){cancelPending();if(worker){worker.terminate();worker=null}}
function one(pcm,rate){return new Promise((resolve,reject)=>{
 if(!worker){worker=new AsrWorker();worker.onmessage=e=>{let d=e.data;if(!pending||d.id!==pending.id)return;if(d.status){msg(d.status);return}let p=pending;pending=null;if(d.error){release();p.reject(Error(d.error));return}p.resolve(d)};worker.onerror=()=>{let p=pending;pending=null;release();if(p)p.reject(Error('语音模型运行失败，请重试。'))}}
 const id=++requestId;pending={id,resolve,reject};worker.postMessage({id,pcm,rate,codes:codes.slice()});
})}

function deadline(promise,ms,message,signal){return new Promise((resolve,reject)=>{let done=false;const timer=setTimeout(()=>finish(Error(message)),ms);function cancel(){finish(Error('语音已停止'))}function finish(error,value){if(done)return;done=true;clearTimeout(timer);if(signal)signal.removeEventListener('abort',cancel);error?reject(error):resolve(value)}if(signal){signal.addEventListener('abort',cancel,{once:true});if(signal.aborted){cancel();return}}Promise.resolve(promise).then(v=>finish(null,v),e=>finish(e))})}
async function openAudio(signal){
 if(audioSession && audioSession.stream.getAudioTracks().some(t=>t.readyState!=='live'))closeAudio();
 if(audioSession){if(audioSession.ctx.state!=='running'){msg('麦克风暂时中断，正在尝试恢复…');let resumed=await Promise.race([audioSession.ctx.resume().then(()=>true),new Promise(r=>setTimeout(()=>r(false),4000))]);if(!resumed||audioSession.ctx.state!=='running')throw Error('系统暂时中断麦克风')}return audioSession;}
 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw Error('无法使用麦克风，请允许权限。');
 const ctx=new (window.AudioContext||window.webkitAudioContext)();let stream,abandoned=false;
 try{
  const resumed=ctx.resume();resumed.catch(()=>{});
  const requested=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  requested.then(s=>{if(abandoned||signal.aborted)s.getTracks().forEach(t=>t.stop())},()=>{});
  stream=await deadline(requested,20000,'麦克风授权未完成，请检查浏览器的麦克风权限。',signal);
  await deadline(resumed,8000,'麦克风未能启动，请关闭语音后再点开启。',signal);
  if(signal.aborted)throw Error('语音已停止');
  let source=ctx.createMediaStreamSource(stream),proc=ctx.createScriptProcessor(4096,1,1),gain=ctx.createGain();gain.gain.value=0;
  source.connect(proc);proc.connect(gain);gain.connect(ctx.destination);
  let session={ctx,stream,source,proc,gain,consume:null};proc.onaudioprocess=e=>{if(session.consume)session.consume(e.inputBuffer.getChannelData(0))};audioSession=session;
  function interrupted(){if(audioSession!==session||!listening)return;if(recordAbort)recordAbort.abort();cancelPending();msg('语音保持开启，系统暂时中断麦克风，正在等待恢复…')}
  ctx.addEventListener('statechange',()=>{if(ctx.state!=='running')interrupted()});stream.getAudioTracks().forEach(track=>{track.addEventListener('mute',interrupted);track.addEventListener('ended',interrupted)});return session;
 }catch(e){abandoned=true;if(stream)stream.getTracks().forEach(t=>t.stop());ctx.close().catch(()=>{});throw e}
}
function closeAudio(){let session=audioSession;audioSession=null;if(!session)return;session.consume=null;session.proc.onaudioprocess=null;session.stream.getTracks().forEach(t=>t.stop());session.source.disconnect();session.proc.disconnect();session.gain.disconnect();session.ctx.close().catch(()=>{})}
async function record(onReady,signal){
 let session=await openAudio(signal);if(signal.aborted)throw Error('语音已停止');let chunks=[];
 try{await new Promise((resolve,reject)=>{let timer=null,started=false;let stall=setTimeout(()=>finish(Error('麦克风没有提供声音，请检查权限后重试。')),8000);
 function finish(error){clearTimeout(stall);clearTimeout(timer);signal.removeEventListener('abort',cancel);session.consume=null;error?reject(error):resolve()}
 function cancel(){finish(Error('语音已停止'))}
 session.consume=channel=>{if(!started){started=true;clearTimeout(stall);onReady();timer=setTimeout(()=>finish(),4500)}chunks.push(new Float32Array(channel))};
 signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 });if(signal.aborted||document.hidden||pagePaused)throw Error('语音已停止');if(session.ctx.state!=='running'||session.stream.getAudioTracks().some(t=>t.muted||t.readyState!=='live'))throw Error('系统暂时中断麦克风');let size=chunks.reduce((n,x)=>n+x.length,0),pcm=new Float32Array(size),offset=0;for(const c of chunks){pcm.set(c,offset);offset+=c.length}if(pcm.length<session.ctx.sampleRate*2)throw Error('录音太短，请重试');let rms=Math.sqrt(pcm.reduce((sum,x)=>sum+x*x,0)/pcm.length);if(rms<0.004)throw Error('没有听到声音');return{pcm,rate:session.ctx.sampleRate};}finally{session.consume=null}
}

async function capture(){if(busy)return;let token=generation,before=JSON.stringify(ab);recordAbort=new AbortController();let controller=recordAbort;busy=true;try{msg('正在准备麦克风…');let audio=await record(()=>msg('🎙 正在听，现在可以说数字口令。'),controller.signal);msg('正在识别，暂时听不到下一句…');let result=await one(audio.pcm,audio.rate);if(controller.signal.aborted||!listening||token!==generation||!ab||ab.ended||JSON.stringify(ab)!==before)return;let i=codes.indexOf(result.text),actions=[()=>abChoose('庄'),()=>abChoose('闲'),()=>abResult('庄'),()=>abResult('闲'),()=>abResult('和')];if(i>=0&&(i<2||ab.side)){actions[i]();$('vpLast').textContent='最近识别：'+codes[i]+'（'+names[i]+'）';msg('已录入：'+names[i])}else{let reason=i>=2&&!ab.side?'请先说 '+codes[0]+' 或 '+codes[1]+' 选择方向。':'没有听清口令，请再说一次。';$('vpLast').textContent='上次没有录入：'+reason;msg(reason)}}catch(e){if(e.message==='语音已停止'){}else if(listening&&(document.hidden||pagePaused||(audioSession && (audioSession.ctx.state!=='running'||audioSession.stream.getAudioTracks().some(t=>t.muted))))){msg('语音保持开启，系统暂时中断麦克风，正在等待恢复…');await new Promise(r=>setTimeout(r,2000))}else if(e.message==='系统暂时中断麦克风'&&listening){msg('语音保持开启，系统暂时中断麦克风，正在等待恢复…');await new Promise(r=>setTimeout(r,2000))}else if(e.message==='没有听到声音'){$('vpLast').textContent='上次没有录入：麦克风没有听到声音，请检查权限或靠近手机。';msg('没有听到声音，正在继续监听…')}else{if(listening&&token===generation)stop();let reason=e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器设置中允许。':e.message;$('vpLast').textContent='语音已关闭：'+reason;msg('未完成：'+reason)}}finally{if(recordAbort===controller)recordAbort=null;busy=false}}
function stop(){listening=false;generation++;if(startupAbort)startupAbort.abort();if(recordAbort)recordAbort.abort();closeAudio();cancelPending();$('vpSpeak').textContent='开启持续语音';msg('持续语音已关闭。')}
window.addEventListener('baccarat-game-ended',stop);
document.addEventListener('visibilitychange',()=>{if(!listening)return;if(document.hidden){if(startupAbort)startupAbort.abort();if(recordAbort)recordAbort.abort();cancelPending();msg('语音保持开启；离开网页时暂停收音，返回后尝试恢复。')}else msg('正在恢复语音，请稍候…')});
window.addEventListener('pagehide',e=>{if(e.persisted&&listening&&ab&&!ab.ended){pagePaused=true;if(startupAbort)startupAbort.abort();if(recordAbort)recordAbort.abort();closeAudio();cancelPending();msg('语音保持开启；页面暂存时暂停收音，返回后尝试恢复。')}else{stop();release()}});
window.addEventListener('pageshow',()=>{if(pagePaused){pagePaused=false;if(listening&&ab&&!ab.ended)msg('正在恢复语音，请稍候…')}});
$('vpSpeak').onclick=async()=>{if(listening){stop();return}if(!ab||ab.ended){msg('请先开始牌局。');return}listening=true;generation++;const mine=generation;$('vpSpeak').textContent='关闭持续语音';msg('正在请求麦克风，请在弹窗中允许…');const controller=new AbortController();startupAbort=controller;const opening=openAudio(controller.signal);document.getElementById('abSpeak').checked=true;abSay('语音播报已开启。');try{await opening}catch(e){if(e.message!=='语音已停止'&&listening&&generation===mine){stop();let reason=e.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器设置中允许。':e.message;$('vpLast').textContent='语音已关闭：'+reason;msg('未完成：'+reason)}if(!listening||generation!==mine)return}finally{if(startupAbort===controller)startupAbort=null}while(listening&&generation===mine&&ab&&!ab.ended){if(document.hidden||pagePaused){await new Promise(r=>setTimeout(r,500));continue}if(audioSession&&audioSession.stream.getAudioTracks().some(t=>t.muted)){msg('语音保持开启，麦克风暂时中断，正在等待恢复…');await new Promise(r=>setTimeout(r,1000));continue}if(window.abSpeechActive){msg('正在播报，结束后继续听。');await new Promise(r=>setTimeout(r,500));continue}await capture();await new Promise(r=>setTimeout(r,300))}if(generation===mine){listening=false;cancelPending();$('vpSpeak').textContent='开启持续语音';msg('持续语音已停止。')}};
$('vpSave').onclick=()=>{let next=names.map((_,i)=>$('vpCode'+i).value.trim());if(!next.every(v=>/^\d{3}$/.test(v))){$('vpConfigStatus').textContent='每项都需要填写三位数字。';return}if(new Set(next).size!==5){$('vpConfigStatus').textContent='五个口令不能重复。';return}try{localStorage.setItem(key,JSON.stringify(next))}catch(e){$('vpConfigStatus').textContent='保存失败，请检查浏览器存储。';return}if(listening||busy)stop();codes=next;render();$('vpConfigStatus').textContent='已保存，开启语音后使用新口令。'};
render();msg('开始牌局后点击开启持续语音。');
})();
