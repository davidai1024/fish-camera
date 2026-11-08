/* Camera Foley: GPL-3.0-or-later. All cues are synthesized with Web Audio. */
(function(root){'use strict';
 function create(options){var ctx=options&&options.context||null,enabled=true,played=0,voices=[],last={};
  function stop(kind){voices.slice().forEach(function(v){if(kind&&v.kind!==kind)return;try{v.node.stop();}catch(e){}v.node.disconnect();v.gain.disconnect();var i=voices.indexOf(v);if(i>=0)voices.splice(i,1);});}
  function unlock(){if(!enabled)return null;try{var A=root.AudioContext||root.webkitAudioContext;if(!ctx&&A)ctx=new A();if(ctx&&ctx.state==='suspended'&&ctx.resume)ctx.resume().catch(function(){});return ctx;}catch(e){return null;}}
  function tone(kind,f,end,duration,volume,type,delay){var o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+(delay||0),v={kind:kind,node:o,gain:g};o.type=type||'sine';o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(volume,t+Math.min(.012,duration/4));if((kind==='charge'||kind==='eject')&&duration>.5)g.gain.linearRampToValueAtTime(volume*.82,t+duration*.8);g.gain.exponentialRampToValueAtTime(.0001,t+duration-.005);g.gain.linearRampToValueAtTime(0,t+duration);o.connect(g);g.connect(ctx.destination);voices.push(v);o.onended=function(){o.disconnect();g.disconnect();var i=voices.indexOf(v);if(i>=0)voices.splice(i,1);};o.start(t);o.stop(t+duration+.002);}
  function noise(kind,duration,volume,delay){var length=Math.ceil(ctx.sampleRate*duration),b=ctx.createBuffer(1,length,ctx.sampleRate),d=b.getChannelData(0),seed=17;for(var i=0;i<length;i++){seed=(seed*16807)%2147483647;d[i]=(seed/1073741824-1)*Math.exp(-i/length*6);}var o=ctx.createBufferSource(),g=ctx.createGain(),t=ctx.currentTime+(delay||0),v={kind:kind,node:o,gain:g};o.buffer=b;g.gain.setValueAtTime(volume,t);o.connect(g);g.connect(ctx.destination);voices.push(v);o.onended=function(){o.disconnect();g.disconnect();var n=voices.indexOf(v);if(n>=0)voices.splice(n,1);};o.start(t);o.stop(t+duration);}
  function paper(strength){
   noise('paper',.05+strength*.055,.025+strength*.04);
  }
  function eject(){
   tone('eject',128,89,1.18,.033,'triangle',.04);
   noise('eject',.068,.075);
   noise('eject',.11,.045,.28);
   noise('eject',.10,.038,.67);
   noise('eject',.08,.047,1.14);
  }
  function play(kind,strength){var c=unlock();if(!c)return false;strength=Number.isFinite(strength)?Math.max(0,Math.min(1,strength)):.5;var now=c.currentTime,min=kind==='paper'?.15-strength*.065:kind==='zoom'?.065:kind==='tick'?.045:0;
   if(min&&last[kind]!==undefined&&now-last[kind]<min)return false;if(voices.length>16&&min)return false;if(kind==='paper'&&voices.filter(function(v){return v.kind==='paper';}).length>=3)return false;last[kind]=now;if(kind!=='paper')stop(kind);
   try{if(kind==='charge'){tone(kind,180,1350,.87,.045,'sawtooth');tone(kind,76,240,.86,.038);tone(kind,1500,1900,.12,.028,'sine',.8);}
    else if(kind==='paper'){paper(strength);}
    else if(kind==='shutter'){noise(kind,.055,.13);tone(kind,160,48,.08,.15,'triangle');noise(kind,.04,.09,.065);tone(kind,480,110,.045,.055,'square',.065);}
    else if(kind==='eject'){eject();}
    else if(kind==='open'||kind==='close'){tone(kind,kind==='open'?110:180,kind==='open'?260:65,.14,.07,'triangle');noise(kind,.06,.06,.08);}
    else if(kind==='ready'){tone(kind,660,660,.09,.025);tone(kind,990,990,.11,.018,'sine',.07);}
    else{tone(kind,kind==='zoom'?270:390,110,.035,.052,'triangle');noise(kind,.018,.028);}
    played++;return true;
   }catch(e){stop(kind);return false;}
  }
  return {play:play,unlock:unlock,stop:stop,set:function(v){enabled=!!v;if(!enabled)stop();},get:function(){return {enabled:enabled,played:played,active:voices.length,state:ctx&&ctx.state};}};
 }
 root.FilmSound=create();root.FilmSound.create=create;
}(window));
