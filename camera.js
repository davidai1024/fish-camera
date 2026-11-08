/* Camera capture stays on device. No microphone or device enumeration. */
(function(root){'use strict';
 function create(options){
  var media=options.media,video=options.video,notify=options.onState||function(){},stream=null,token=0,face='environment',busy=false;
  function tracks(s){return s&&s.getTracks?s.getTracks():[];}
  function dispose(s){tracks(s).forEach(function(t){t.onended=null;t.stop();});}
  function stop(){token++;dispose(stream);stream=null;video.srcObject=null;busy=false;notify({state:'off',facing:face});}
  async function open(requested){
   if(busy)return false;
   if(stream&&(!requested||requested===face))return true;
   var id=++token;busy=true;dispose(stream);stream=null;video.srcObject=null;notify({state:'requesting',facing:face});
   try{
    if(!media||typeof media.getUserMedia!=='function')throw Object.assign(new Error('Camera unavailable'),{name:'NotSupportedError'});
    var next=await media.getUserMedia({audio:false,video:{facingMode:{ideal:requested||face},width:{ideal:3840},height:{ideal:3840}}});
    if(id!==token){dispose(next);return false;}stream=next;
    var track=tracks(next)[0],settings=track&&track.getSettings?track.getSettings():{};
    face=settings.facingMode||requested||face;video.srcObject=next;await video.play();
    if(id!==token){dispose(next);return false;}
    busy=false;if(track)track.onended=function(){if(stream===next){stop();notify({state:'error',error:'NotReadableError',facing:face});}};
    notify({state:'ready',facing:face});return true;
   }catch(error){if(id===token){dispose(stream);stream=null;video.srcObject=null;busy=false;notify({state:'error',error:error.name||'Error',facing:face});}return false;}
  }
  function capabilities(){try{var t=tracks(stream)[0];return t&&t.getCapabilities?t.getCapabilities():{};}catch(e){return {};}}
  async function torch(enabled){var t=tracks(stream)[0],caps=capabilities();if(!t||!caps.torch||!t.applyConstraints)return false;try{await t.applyConstraints({advanced:[{torch:!!enabled}]});return true;}catch(e){return false;}}
  return {open:open,stop:stop,switchCamera:function(){if(busy)return Promise.resolve(false);return open(face==='user'?'environment':'user');},torch:torch,capabilities:capabilities,get:function(){return {ready:!!stream&&!busy,busy:busy,facing:face};}};
 }
 var api={create:create};if(typeof module!=='undefined')module.exports=api;else root.FilmCamera=api;
}(typeof window!=='undefined'?window:this));
