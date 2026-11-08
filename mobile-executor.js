/* Single classic worker when supported; never transfer away the retained original. */
(function(root){'use strict';
 var localCreate=root.FilmMobileRenderer.create;
 function create(){var worker=null,local=null,settled=false,canceled=false,rejectRun=null,probeTimer=0,deadline=0,started=false;
  function cleanup(){clearTimeout(probeTimer);clearTimeout(deadline);if(worker){var w=worker;worker=null;w.onmessage=w.onerror=null;if(w.offTerminate)try{w.offTerminate();}catch(e){}try{w.terminate();}catch(e){}}}
  function cancel(){canceled=true;cleanup();if(local){local.cancel();local=null;}if(rejectRun&&!settled){settled=true;rejectRun(Error('显影已取消，原图已保留'));}}
  function render(photo,onPhase){return new Promise(function(resolve,reject){
   rejectRun=reject;
   function fail(e){if(settled)return;settled=true;cleanup();reject(e instanceof Error?e:Error(String(e)));}
   function done(bytes){if(settled||canceled)return;settled=true;cleanup();resolve(bytes);}
   function fallback(reason){if(settled||canceled||started)return;cleanup();started=true;local=localCreate();local.render(photo,onPhase).then(function(bytes){photo.diagnostics.execution='main-cooperative';photo.diagnostics.fallbackReason=reason;done(bytes);},fail);}
   async function begin(){
    try{await FilmPlatform.ready;if(canceled)return;
     if(typeof root.Worker!=='function'||typeof root.OffscreenCanvas!=='function'||!FilmPlatform.workerAllowed()){fallback('offscreen-unavailable');return;}
     try{worker=new root.Worker('./mobile-worker.js');}catch(e){fallback('worker-unavailable');return;}
     probeTimer=setTimeout(function(){fallback('worker-probe-timeout');},6000);
     if(worker.onTerminate)worker.onTerminate(function(){if(!settled&&!canceled)fail(Error('显影任务已被系统暂停，原图已保留'));});
     worker.onerror=function(e){if(e.preventDefault)e.preventDefault();if(started)fail(Error('离屏显影中断，原图已保留'));else fallback('worker-probe-error');};
     worker.onmessage=async function(event){var message=event.data||{};
      if(settled||canceled)return;
      if(message.type==='unsupported'){fallback('worker-gpu-unavailable');return;}
      if(message.type==='ready'&&!started){clearTimeout(probeTimer);started=true;
       try{onPhase('准备离屏显影');var data=await FilmMobileData.load(photo.film.id);if(canceled||settled)return;
        var input=new Uint8Array(photo.original),copy=new Uint8Array(input.length);
        for(var i=0;i<input.length;i+=1048576){copy.set(input.subarray(i,Math.min(input.length,i+1048576)),i);await new Promise(function(r){setTimeout(r,0);});if(canceled||settled)return;}
        worker.postMessage({type:'render',photo:{w:photo.w,h:photo.h,film:photo.film,seed:photo.seed,validationTile:photo.validationTile,original:copy.buffer},data:data},[copy.buffer]);
        deadline=setTimeout(function(){fail(Error('显影用时较长，原图已保留，可重试'));},90000);
       }catch(e){fail(e);}return;
      }
      if(message.type==='phase'){onPhase(message.text);return;}
      if(message.type==='error'){fail(Error(message.message||'离屏显影失败'));return;}
      if(message.type==='result'){
       if(!message.bytes||message.bytes.byteLength!==photo.w*photo.h*4){fail(Error('离屏显影像素不完整'));return;}
       photo.diagnostics=message.diagnostics||{};photo.diagnostics.execution='worker';root.FilmMobileLastRun=photo.diagnostics;done(message.bytes);
      }
     };
     worker.postMessage({type:'probe'});
    }catch(e){fail(e);}
   }begin();
  });}
  return {render:render,cancel:cancel};
 }
 root.FilmMobileRenderer={create:create,localCreate:localCreate};
}(window));
