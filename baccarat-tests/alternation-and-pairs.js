const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','baccarat-helper.html'),'utf8').replace(/\r\n/g,'\n');
const advance=html.slice(html.indexOf('function abAdvance('),html.indexOf('\nfunction abResult('));
function line(base,outcomes){const ctx={ab:{base}};vm.createContext(ctx);vm.runInContext(advance,ctx);const s={bet:base,wins:0,losses:0},bets=[];for(const result of outcomes){bets.push(s.bet);ctx.abAdvance(s,result==='W')}return {bets,next:s.bet}}
for(const c of [
 {label:'纠正后的期望值保护',base:50,outcomes:'WLWLW',bets:[50,100,100,200,200],next:200},
 {label:'错对交替的期望值保护',base:50,outcomes:'LWLWLW',bets:[50,50,100,100,200,200],next:200},
 {label:'两次连续对回基础',base:100,outcomes:'WLWW',bets:[100,200,200,400],next:100},
 {label:'错后连续对',base:100,outcomes:'LWWW',bets:[100,100,200,100],next:200},
 {label:'普通连续两对',base:50,outcomes:'WW',bets:[50,100],next:50}
]){const got=line(c.base,c.outcomes);assert.deepStrictEqual(got.bets,c.bets,c.label+'逐注');assert.strictEqual(got.next,c.next,c.label+'下一注');console.log(c.label+'：通过')}
