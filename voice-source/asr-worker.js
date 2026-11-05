import {initKWSModule,createKeywordSpotter} from '@sherpaw/kws/core';
import {loadData} from '@sherpaw/preloader';
const keywords=[
 {label:'A庄',threshold:0.05,score:3,matches:[{tokens:['ēi','zh','uāng']},{tokens:['èi','zh','uāng']},{tokens:['āi','zh','uāng']},{tokens:['EY1','zh','uāng']},{tokens:['EY0','zh','uāng']},{tokens:['āi','m','ǎi','zh','uāng']},{tokens:['ēi','m','ǎi','zh','uāng']}]},
 {label:'A闲',threshold:0.05,score:3,matches:[{tokens:['ēi','x','ián']},{tokens:['èi','x','ián']},{tokens:['āi','x','ián']},{tokens:['EY1','x','ián']},{tokens:['EY0','x','ián']},{tokens:['āi','m','ǎi','x','ián']},{tokens:['ēi','m','ǎi','x','ián']}]},
 {label:'庄赢了',matches:[{tokens:['zh','uāng','y','íng','l','e']}]},
 {label:'闲赢了',matches:[{tokens:['x','ián','y','íng','l','e']}]},
 {label:'和局了',matches:[{tokens:['h','é','j','ú','l','e']}]}
];
onmessage=async({data})=>{try{postMessage({status:'正在识别口令，暂时听不到下一句…'});let response=await fetch(new URL('kws-bi.data',self.location.href));if(!response.ok)throw Error('语音模型下载失败，请检查网络');let bytes=await response.arrayBuffer();if(bytes.byteLength!==13076183)throw Error('语音模型不完整');let module=await initKWSModule();loadData({module,metadata:{files:[{filename:'/decoder.onnx',start:0,end:759829},{filename:'/encoder.onnx',start:759829,end:12736101},{filename:'/joiner.onnx',start:12736101,end:13074255},{filename:'/tokens.txt',start:13074255,end:13076183}],remote_package_size:13076183},data:bytes});const spotter=createKeywordSpotter(module,{model:{encoder:'./encoder.onnx',decoder:'./decoder.onnx',joiner:'./joiner.onnx',tokens:'./tokens.txt'},keywords});try{let pcm=new Float32Array(data.pcm.length+data.rate);pcm.set(data.pcm);let hits=spotter.processAudio(pcm,data.rate);let unique=[...new Set(hits.map(h=>h.label))];postMessage({kind:'result',text:unique.length===1?unique[0]:''})}finally{spotter.dispose()}}catch(e){postMessage({error:String(e.message||e)})}};
