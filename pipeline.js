/* Independent mobile GPU validation; original recipes and licenses retained. */
(function(root){'use strict';
 function create(options){var renderer=null,seq=0,timer=0,timeout=0,done=false,result=null,current=null,active=false,visible=0,previous=null,status='',tailStart=null,tailFrom=0,stopMotion=null,presented=false,pendingError='';
  var development=FilmDevelopment.create({durationMs:10000});
  function cacheBusy(value){if(root.FilmPhotoStore&&root.FilmPhotoStore.setBusy)root.FilmPhotoStore.setBusy(value);}
  function releaseMotion(){if(stopMotion){var stop=stopMotion;stopMotion=null;stop();}}
  function setStatus(value){if(status===value)return;status=value;if(value==='ready'||value==='finishing'||value==='error')releaseMotion();if(options.onStatus)options.onStatus(value);}
  function frame(time){
   timer=0;if(!active)return;
   var dt=previous===null?16:Math.min(40,Math.max(0,time-previous));previous=time;
   var p=development.tick().progress,target=done?p:Math.min(.8,p),next;
   setStatus(done?'finishing':p>=1?'processing':'revealing');
   // Pixel readiness ends the wait; gestures never gate a finished photograph.
   if(done){
    if(tailStart===null){tailStart=time;tailFrom=visible;}
    var t=Math.min(1,Math.max(0,(time-tailStart)/700));
    next=tailFrom+(1-tailFrom)*(1-Math.pow(1-t,2));
   }else next=visible+Math.max(0,Math.min(target-visible,(target-visible)*(1-Math.exp(-dt/180)),dt/1800));
   visible=Math.min(1,Math.max(visible,next));
   if(done&&visible>=1){options.onProgress(1,true);setStatus('ready');finish();return;}
   options.onProgress(visible,done);timer=root.requestAnimationFrame(frame);
  }
  function release(){releaseMotion();if(renderer){renderer.cancel();renderer=null;}root.cancelAnimationFrame(timer);clearTimeout(timeout);timer=0;timeout=0;cacheBusy(false);}
  function cancel(){active=false;seq++;release();development.cancel();status='';tailStart=null;result=null;current=null;presented=false;pendingError='';}
  function finish(){if(!active||!done)return;var output=result;active=false;release();options.onDone(output,current);}
  function fail(message){if(!active)return;active=false;release();development.cancel();pendingError=message;if(presented)options.onError(message);}
  function watchMotion(){var id=seq;if(stopMotion||!active||!presented||typeof FilmPlatform.watchGyroscope!=='function')return;stopMotion=FilmPlatform.watchGyroscope(function(value){if(active&&id===seq){if(status==='revealing')development.gyro(value);if(options.onMovement)options.onMovement(value);}},function(available){if(options.onMotion&&id===seq)options.onMotion(active&&available);});}
  function reveal(photo){
   if(current!==photo)return;
   if(presented)return;
   presented=true;
   if(pendingError){options.onError(pendingError);return;}
   if(!active)return;
   development.start();setStatus('revealing');options.onProgress(0,false);
   if(done)options.onImage(result,current);
   timer=root.requestAnimationFrame(frame);watchMotion();
  }
  async function start(photo,deferred){cancel();cacheBusy(true);current=photo;done=false;result=null;visible=0;previous=null;tailStart=null;tailFrom=0;pendingError='';presented=false;active=true;var id=seq;
   if(photo.result&&photo.result.byteLength===photo.w*photo.h*4){result=photo.result;done=true;if(!deferred){presented=true;options.onImage(result,photo);options.onProgress(1,true);setStatus('ready');finish();}return;}
   if(!deferred)reveal(photo);
   timeout=setTimeout(function(){fail('显影用时较长，请点重试');},60000);
   try{await FilmPlatform.ready;}catch(e){if(active&&id===seq)fail('未获取到客户端信息，点重试');return;}
   if(!active||id!==seq)return;
   clearTimeout(timeout);timeout=setTimeout(function(){fail('显影超时，原图已保留，未降低像素');},90000);
   try{var r=FilmMobileRenderer.create();renderer=r;r.render(photo,function(text){if(active&&id===seq){photo.phase=text;if(presented)options.onPhase(text);}}).then(function(bytes){
    if(!active||id!==seq)return;
    if(!bytes||bytes.byteLength!==photo.w*photo.h*4){fail('显影像素不完整，未保存低清结果');return;}
    result=bytes;photo.result=bytes;photo.processingMs=photo.diagnostics.processingMs;done=true;clearTimeout(timeout);if(presented)options.onImage(result,current);renderer=null;
   }).catch(function(e){if(active&&id===seq)fail(e.message||'无法开始显影，原图已保留');});
   }catch(e){if(active&&id===seq)fail(e.message||'无法开始显影，原图已保留');}

  }
  return {start:start,prepare:function(photo){return start(photo,true);},reveal:reveal,cancel:cancel,swipe:function(dx,speed){development.swipe(dx,speed);},isActive:function(){return active;}};
 }
 root.FilmPipeline={create:create};
}(window));
