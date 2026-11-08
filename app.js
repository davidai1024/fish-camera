(function(){'use strict';
 var $=function(id){return document.getElementById(id);},C=FilmCore,P=FilmPlatform,S=FilmSound,Print=FilmPaperPrint,app=$('app'),video=$('video');
 var state={open:false,film:0,format:'square',zoom:1,flash:false,hardwareFlash:false,camera:'off',face:'environment',busy:false,photo:null,album:[],compare:false,sound:true,saving:false};
 var toastTimer=0,labelTimer=0,zoomTimer=0,flashSeq=0,captureSeq=0,chargeTimer=0,zoomFeedbackAt=0,draggedUntil=0,activeDialogTrigger=null;
 var gyroPaperTimer=0,morph=null,morphWidth=0,morphHeight=0,morphSpace=0,shapeHintDone=false;
 var paperArrival=null,paperMotion=FilmPaperMotion.create({reduced:reducedMotion,apply:function(x,y,angle,held){var paper=$('paper');paper.style.transform=reducedMotion()?'none':'translate3d('+x+'px,'+y+'px,0) rotate('+angle+'deg)';paper.classList.toggle('held',held);}});
 function resetPaper(){clearTimeout(gyroPaperTimer);gyroPaperTimer=0;clearTimeout(paperWheelTimer);paperWheelTimer=0;paperGesture=false;paperMoving=false;if(paperArrival){paperArrival.cancel();paperArrival=null;}paperMotion.reset();S.stop('paper');}
 var printAnimation=null,prepareAnimations=[];
 function clearPrint(){if(printAnimation){printAnimation.cancel();printAnimation=null;}prepareAnimations.forEach(function(a){a.cancel();});prepareAnimations=[];$('ejectPhoto').hidden=true;app.classList.remove('printing','retracting','print-preparing');app.dataset.printPhase='idle';FilmPixels.release($('ejectCanvas'));FilmPixels.release($('previewFreeze'));$('previewFreeze').hidden=true;}
 function waitAnimation(animation,duration){return new Promise(function(resolve){
  var settled=false,timer=setTimeout(finish,duration+120);
  function finish(){if(settled)return;settled=true;clearTimeout(timer);if(animation.removeEventListener){animation.removeEventListener('finish',finish);animation.removeEventListener('cancel',finish);}resolve();}
  if(animation.addEventListener){animation.addEventListener('finish',finish);animation.addEventListener('cancel',finish);}
  if(animation.finished&&typeof animation.finished.then==='function')animation.finished.then(finish,finish);
 });}
 function animatePreparation(el,frames,duration){if(reducedMotion()||!el.animate)return pause(0);var a=el.animate(frames,{duration:duration,easing:'cubic-bezier(.22,.7,.25,1)',fill:'forwards'});prepareAnimations.push(a);return waitAnimation(a,duration);}
 function sizePaper(el,g){el.style.width=g.width+'px';el.style.setProperty('--paper-border',g.border+'px');el.style.setProperty('--paper-bottom',g.bottom+'px');}
 function alignPrint(){var slot=$('printSlot').getBoundingClientRect(),box=app.getBoundingClientRect();$('ejectPhoto').style.top=(slot.top+slot.height/2-box.top+app.scrollTop)+'px';$('ejectPhoto').style.left=(slot.left+slot.width/2-box.left-app.clientLeft)+'px';}
 function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=setTimeout(function(){$('toast').classList.remove('visible');},4200);}
 function showFilm(){clearTimeout(labelTimer);$('filmLabel').classList.add('visible');labelTimer=setTimeout(function(){$('filmLabel').classList.remove('visible');},1300);}
 function layout(){var width=app.clientWidth,h=Math.round(Math.min(width*.68,width-120)),space=Math.round(width*1.145);morphWidth=width;morphHeight=h;morphSpace=space;document.documentElement.style.setProperty('--app-height',window.innerHeight+'px');document.documentElement.style.setProperty('--camera-space',space+'px');$('lens').style.height=h+'px';$('filmSwitch').style.top=(h/2-42)+'px';$('zoomLever').style.top=(h/2-56)+'px';$('filmLabel').style.top=(h+10)+'px';document.querySelector('.shutter-row').style.top=(h+38)+'px';renderPreview();fitPaper();if(morph)morph.refresh();if(app.dataset.printPhase==='feeding')alignPrint();}
 function renderPreview(){var innerH=(morphHeight-6)*.74;video.style.filter=C.films[state.film].filter;video.style.transform='scale('+(state.face==='user'?-state.zoom:state.zoom)+','+state.zoom+')';$('lens').style.width=(morphHeight*(state.format==='square'?1:55/68))+'px';$('aperture').style.width=(innerH*(state.format==='square'?1:.75))+'px';$('aperture').style.height=innerH+'px';$('lens').setAttribute('aria-label',(state.format==='square'?'正方形':'竖幅 3:4')+'取景器，双指捏合或拉开切换画幅');$('lens').dataset.format=state.format;$('zoomLabel').textContent=state.zoom.toFixed(1)+'×';$('zoomLever').setAttribute('aria-valuenow',state.zoom);$('zoomLever').setAttribute('aria-valuetext','数字倍率 '+state.zoom.toFixed(1)+' 倍');$('leverArm').style.transform='translateY('+((3-state.zoom)*30)+'px)';$('filmSwitch').disabled=state.busy||!state.open;if(morph)morph.refresh();}
 function cameraState(x){state.camera=x.state;state.face=x.facing||state.face;$('liveDot').classList.toggle('active',x.state==='ready');if(x.state==='ready'){$('previewFreeze').hidden=true;FilmPixels.release($('previewFreeze'));}$('cameraMessage').hidden=x.state==='ready';$('cameraMessage').setAttribute('aria-busy',String(x.state==='requesting'));$('shutter').disabled=x.state!=='ready'||state.busy;$('flip').disabled=x.state==='requesting'||state.busy;$('retryCamera').disabled=x.state==='requesting';$('retryCamera').textContent=x.state==='requesting'?'正在启动相机…':'开启相机';var messages={NotAllowedError:'未能访问相机，请检查相机权限或选照片',NotFoundError:'没有可用摄像头，也可以选照片',NotReadableError:'相机暂时不可用，请重试',NotSupportedError:'当前环境不支持相机，请选照片'};$('cameraError').textContent=x.state==='error'?(messages[x.error]||'相机未打开，请重试或选照片'):'';renderPreview();}
 var camera=FilmCamera.create({media:navigator.mediaDevices,video:video,onState:cameraState});
 function paintMorph(p){
  var lw=morphHeight*(state.format==='square'?1:55/68),lh=morphHeight,sx=118/lw+(1-118/lw)*p,sy=34/lh+(1-34/lh)*p;
  var rx=17+(lw*.25-17)*p,ry=17+(lh*.25-17)*p,lens=$('lens');
  lens.style.transform='translate3d(0px,'+(8*(1-p))+'px,0) scale('+sx+','+sy+')';
  lens.style.borderRadius=(rx/sx)+'px / '+(ry/sy)+'px';
  $('aperture').style.opacity=Math.max(0,(p-.25)/.75);$('liveDot').style.opacity=p;
  var y=(morphSpace-68)*p;document.querySelector('.camera-header').style.transform='translate3d(0,'+y+'px,0)';
  $('logo').style.transform='scale('+(1-.46*p)+')';$('settings').style.opacity=1-p;$('count').style.opacity=1-p;
  $('album').style.transform='translate3d(0,'+((morphSpace-87)*p)+'px,0)';
  var follow=-(lh-42)*(1-p),controls=Math.max(0,(p-.2)/.8);
  document.querySelector('.shutter-row').style.opacity=controls;document.querySelector('.shutter-row').style.transform='translate3d(0,'+follow+'px,0)';
  $('filmSwitch').style.opacity=controls;$('zoomLever').style.opacity=controls;document.querySelector('.shape-hint').style.opacity=shapeHintDone?0:Math.max(0,(p-.8)*5);
  $('pullHint').style.opacity=Math.max(0,1-p*5);app.dataset.openProgress=p.toFixed(4);
 }
 function settleMorph(p){$('album').style.height='calc(100% - '+(164+(morphSpace-87)*p)+'px - var(--safe-top) - var(--safe-bottom))';app.classList.remove('morphing');}
 function setOpen(open,request,deferStop){
  state.open=!!open;app.classList.toggle('open',state.open);$('openCam').setAttribute('aria-expanded',String(state.open));$('openCam').tabIndex=state.open?-1:0;$('settings').tabIndex=state.open?-1:0;
  $('filmSwitch').disabled=state.busy||!state.open;
  $('cameraControls').setAttribute('aria-hidden',String(!state.open));Array.prototype.forEach.call($('cameraControls').querySelectorAll('button,[tabindex]'),function(el){el.tabIndex=state.open?0:-1;});
  if(!state.open){flashSeq++;if(!deferStop)camera.stop();state.hardwareFlash=false;S.stop('charge');clearTimeout(chargeTimer);$('flash').classList.remove('charging');clearTimeout(labelTimer);$('filmLabel').classList.remove('visible');}
  app.classList.add('morphing');$('album').style.height='calc(100% - 164px - var(--safe-top) - var(--safe-bottom))';
  var result=morph?morph.to(state.open?1:0,reducedMotion()):Promise.resolve(true);
  // Start on the user's release/click, in parallel with settling (never on drag frames).
  if(state.open&&request&&!camera.get().ready&&!camera.get().busy)camera.open(state.face);
  return result;
 }
 function toggleOpen(){if(Date.now()<draggedUntil||state.busy)return;S.unlock();setOpen(!state.open,true);S.play(state.open?'open':'close');}
 function setFormat(value){if(state.busy||state.format===value)return;state.format=value;renderPreview();S.play('tick');P.haptic();toast(value==='square'?'正方形':'竖幅 3:4');}
 function selectFilm(index){if(state.busy)return;index=C.clamp(index,0,3);if(state.film===index)return;state.film=index;$('filmLabel').textContent=C.films[index].short;$('filmNumber').textContent=(index+1)+'/4';$('filmSwitch').setAttribute('aria-label','切换滤镜，当前'+C.films[index].name+'，'+(index+1)+'/4');renderPreview();showFilm();S.play('tick');P.haptic();}
 function setZoom(value){if(state.busy)return;value=C.clamp(value,1,3);if(value===state.zoom)return;state.zoom=value;if(Date.now()-zoomFeedbackAt>85){S.play('zoom');P.haptic();zoomFeedbackAt=Date.now();}renderPreview();clearTimeout(zoomTimer);$('zoomLabel').classList.add('visible');zoomTimer=setTimeout(function(){$('zoomLabel').classList.remove('visible');},1600);}
 function toggleFlash(){if(state.busy)return;clearTimeout(chargeTimer);state.flash=!state.flash;$('flash').classList.toggle('on',state.flash);$('flash').setAttribute('aria-pressed',String(state.flash));$('flash').setAttribute('aria-label',state.flash?'关闭闪光':'开启闪光');if(state.flash){S.play('charge');$('flash').classList.add('charging');chargeTimer=setTimeout(function(){$('flash').classList.remove('charging');},920);}else{flashSeq++;S.stop('charge');$('flash').classList.remove('charging');state.hardwareFlash=false;S.play('tick');}P.haptic();}
  function canCapture(){FilmPhotoStore.trim(state.album,state.photo);if(state.album.length>=12||FilmPhotoStore.residentBytes(state.album)>128*1024*1024){toast("本次照片或缓存已满，请先保存照片后重新打开小工具");return false;}return true;}
 function newPhoto(source,w,h){
  C.imageFit(w,h);var ratio=state.format==='square'?1:.75,crop=C.pixelCrop(w,h,ratio,state.zoom),limits=[4096,3072,2048];
  for(var attempt=0;attempt<limits.length;attempt++){
   var fit=C.imageFit(crop.w,crop.h,limits[attempt]),canvas=document.createElement('canvas');
   try{canvas.width=fit.w;canvas.height=fit.h;var ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建照片画布');
    ctx.imageSmoothingEnabled=fit.adapted;if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
    if(source===video&&state.face==='user'){ctx.translate(fit.w,0);ctx.scale(-1,1);}
    ctx.drawImage(source,crop.x,crop.y,crop.w,crop.h,0,0,fit.w,fit.h);
    var bytes=ctx.getImageData(0,0,fit.w,fit.h).data.buffer;if(bytes.byteLength!==fit.w*fit.h*4)throw Error('照片像素不完整');
    return {id:Date.now(),w:fit.w,h:fit.h,sourceWidth:w,sourceHeight:h,cropWidth:crop.w,cropHeight:crop.h,adapted:fit.adapted,adaptReason:attempt?'memory':fit.adapted?'size':'none',original:bytes,result:null,film:C.films[state.film],format:state.format,zoom:state.zoom,time:new Date(),saved:false};
   }catch(e){/* Retry a smaller working canvas without changing the source file. */}finally{canvas.width=0;canvas.height=0;}
  }
  throw Error('这次没能读取照片，请重新选择后再试');
 }
 function fitPaper(){var p=state.photo;if(!p)return;sizePaper($('paper'),Print.fit(app.clientWidth,window.innerHeight,p.w/p.h));}
 function drawResult(bytes,photo){fitPaper();FilmPixels.draw($('result'),bytes,photo.w,photo.h,Math.min(1280,Math.round(app.clientWidth*Math.min(window.devicePixelRatio||1,3))));}
 function syncComparison(){var ready=!state.busy&&state.photo&&state.photo.result&&$('viewer').dataset.developState==='ready';$('photoKind').hidden=!ready;$('photoKind').textContent=state.compare?'原图':'胶片图';$('photoKind').dataset.kind=state.compare?'original':'film';$('compare').setAttribute('aria-pressed',String(state.compare));$('compare').lastElementChild.textContent=state.compare?'松手还原':'按住对比';$('compare').setAttribute('aria-label',state.compare?'松手还原胶片图':'按住对比原图，松手显示胶片图');}
 function setComparison(original){original=!!original&&!state.busy&&!$('viewer').hidden&&!$('compare').disabled&&!!(state.photo&&state.photo.result);if(state.compare!==original){state.compare=original;if(state.photo&&state.photo.result)drawResult(original?state.photo.original:state.photo.result,state.photo);}syncComparison();}
 var compareHold;
 function resetComparison(){if(compareHold)compareHold.reset();setComparison(false);}
 function lockResult(locked){if(locked)resetComparison();$('save').disabled=locked||!state.photo||!state.photo.result;$('compare').disabled=locked||!state.photo||!state.photo.result;syncComparison();}
 function showViewer(){resetComparison();activeDialogTrigger=document.activeElement;$('viewer').hidden=false;$('viewer').scrollTop=0;$('again').focus({preventScroll:true});}
 function hideViewer(){if(state.saving)return;resetComparison();resetPaper();if(state.busy){pipeline.cancel();if(state.photo)addAlbum(state.photo);state.busy=false;if(!state.photo||!state.photo.result)toast('显影已暂停，可在照片里重试');}captureSeq++;clearPrint();S.stop('eject');$('viewer').classList.remove('arriving');$('viewer').hidden=true;pipeline.cancel();if(state.photo)FilmPhotoStore.archive(state.photo).then(function(){FilmPhotoStore.trim(state.album,(!$("viewer").hidden||state.busy||state.saving)?state.photo:null);});FilmPixels.release($('result'));$('screenFlash').hidden=true;if(activeDialogTrigger&&activeDialogTrigger.focus)activeDialogTrigger.focus();}
 function phase(text){/* Processing diagnostics stay on the photo, never on the paper UI. */}
 function paperCanSlide(){return state.busy&&!$('viewer').hidden&&['revealing','processing','finishing'].indexOf($('viewer').dataset.developState)>=0;}
 function motionStatus(available){/* Keep the same quiet gesture cue throughout development. */}
 function developmentStatus(value){
  $('viewer').dataset.developState=value;
  $('progress').hidden=true;$('progress').style.visibility='hidden';$('photoTime').textContent='';
  $('developHint').textContent=['revealing','processing','finishing'].indexOf(value)>=0?'轻轻滑动相片':'';
 }
 var pipeline=FilmPipeline.create({onProgress:function(p){$('progress').value=p*100;$('developCover').style.opacity=String((1-Print.preview)*(1-p));},onPhase:phase,onStatus:developmentStatus,onMotion:motionStatus,onMovement:function(value){if(!paperCanSlide()||$('viewer').classList.contains('arriving')||paperGesture||paperWheelTimer)return;var speed=Math.hypot(value.x,value.y,value.z);if(speed<.18)return;if(!gyroPaperTimer)paperMotion.begin();paperMotion.move(C.clamp((value.y+value.z)*22,-70,70),C.clamp(value.x*22,-50,50));clearTimeout(gyroPaperTimer);gyroPaperTimer=setTimeout(function(){gyroPaperTimer=0;paperMotion.end();},160);},onImage:function(bytes,photo){drawResult(bytes,photo);$('photoTime').textContent='';},onDone:function(bytes,photo){$('viewer').dataset.developState='ready';photo.result=bytes;state.busy=false;resetPaper();state.compare=false;$('compare').setAttribute('aria-pressed','false');$('developCover').hidden=true;$('progress').style.visibility='hidden';$('developHint').textContent='';$('photoTime').textContent='';$('retryDevelop').hidden=true;lockResult(false);addAlbum(photo);S.play('ready');P.haptic();},onError:function(msg){resetPaper();$('viewer').dataset.developState='error';$('progress').style.visibility='hidden';state.busy=false;$('retryDevelop').hidden=false;$('developHint').textContent=msg;$('photoTime').textContent='显影暂停';lockResult(true);}});
 function runDevelop(photo,prepared){resetPaper();state.photo=photo;state.busy=true;state.compare=false;$('compare').setAttribute('aria-pressed','false');$('compare').lastElementChild.textContent='原图';$('developCover').hidden=false;$('developCover').style.opacity=String(1-Print.preview);$('viewer').dataset.developState='revealing';$('progress').hidden=true;$('progress').style.visibility='hidden';$('progress').value=0;$('developHint').textContent='轻轻滑动相片';$('photoTime').textContent='';$('retryDevelop').hidden=true;drawResult(photo.original,photo);lockResult(true);if(prepared)pipeline.reveal(photo);else pipeline.start(photo);}
 function reducedMotion(){return window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;}
 function pause(ms){return new Promise(function(resolve){setTimeout(resolve,ms);});}
 async function processPhoto(photo){
  var id=++captureSeq;state.photo=photo;FilmPhotoStore.trim(state.album,photo);state.busy=true;lockResult(true);clearPrint();
  // Freeze only the visible preview; release camera before starting the full-resolution worker.
  FilmPixels.draw($('previewFreeze'),photo.original,photo.w,photo.h,640);$('previewFreeze').hidden=false;
  camera.stop();pipeline.prepare(photo).catch(function(){if(id===captureSeq)processFailure();});app.classList.add('print-preparing');app.dataset.printPhase='retracting';
  var island=$('openCam'),slot=island.getBoundingClientRect();
  await setOpen(false,false);$('album').scrollTop=0;
  if(id!==captureSeq||document.hidden)return;
  var ec=$('ejectCanvas');FilmPixels.draw(ec,photo.original,photo.w,photo.h,640);
  var g=Print.geometry(Math.min(212,app.clientWidth*.48),photo.w/photo.h),feed=$('ejectFeed'),card=$('ejectCard');
  sizePaper(card,g);app.style.setProperty('--print-width',g.width+'px');app.style.setProperty('--print-slot',(g.width+32)+'px');
  var projected=Print.project(g.width,g.height,0),feedFrames=Print.feed(g.height);
  $('ejectPhoto').style.width=(projected.width+40)+'px';$('ejectPhoto').style.height=(projected.height+28)+'px';feed.style.transform=feedFrames[0].transform;
  app.dataset.printPhase='slot-opening';app.classList.add('printing');
  await animatePreparation(island,[{width:slot.width+'px'},{width:(g.width+32)+'px'}],300);
  if(id!==captureSeq||document.hidden)return;
  alignPrint();
  app.dataset.printPhase='feeding';$('ejectPhoto').hidden=false;S.play('eject');P.haptic();
  if(!reducedMotion()&&feed.animate){printAnimation=feed.animate(feedFrames,{duration:Print.duration,easing:'linear',fill:'forwards'});await waitAnimation(printAnimation,Print.duration);}
  else{feed.style.transform=feedFrames[feedFrames.length-1].transform;await pause(150);}if(id!==captureSeq||document.hidden)return;
  var origin=card.getBoundingClientRect();showViewer();$('viewer').classList.add('arriving');runDevelop(photo,true);
  var paper=$('paper'),target=paper.getBoundingClientRect(),scale=g.width/target.width;
  if(!reducedMotion()&&paper.animate){paperArrival=paper.animate([{transformOrigin:'center top',transform:Print.pose(origin.left+origin.width/2-target.left-target.width/2,origin.top-target.top,scale,Print.perspective/scale,Print.angle)},{transformOrigin:'center top',transform:Print.pose(0,0,1,Print.perspective,0)}],{duration:480,easing:'cubic-bezier(.2,.75,.2,1)',fill:'both'});}
  clearPrint();await pause(reducedMotion()?0:480);if(id===captureSeq){if(paperArrival){paperArrival.cancel();paperArrival=null;}$('viewer').classList.remove('arriving');addAlbum(photo);}
 }

 function processFailure(){pipeline.cancel();captureSeq++;clearPrint();state.busy=false;if(state.photo)addAlbum(state.photo);toast('处理未完成，原照片已保留，可在相册重试');$('shutter').disabled=!camera.get().ready;$('flip').disabled=camera.get().busy;}
 async function capture(){
  if(state.busy||state.saving||!camera.get().ready||!canCapture())return;
  if(!video.videoWidth){toast('取景还没准备好');return;}
  state.busy=true;var shotId=++captureSeq,flashRequested=state.flash,torchLit=false,photo=null;
  $('shutter').disabled=true;$('flip').disabled=true;clearTimeout(chargeTimer);S.stop('charge');$('flash').classList.remove('charging');
  try{
   if(flashRequested){
    torchLit=await camera.torch(true);state.hardwareFlash=torchLit;
    if(shotId!==captureSeq||document.hidden||!camera.get().ready)return;
    $('screenFlash').hidden=state.hardwareFlash;
    await pause(160);
   }
   if(shotId!==captureSeq||document.hidden||!camera.get().ready)return;
   S.play('shutter');P.haptic();photo=newPhoto(video,video.videoWidth,video.videoHeight);
  }catch(e){if(shotId===captureSeq)toast('照片没拍下来，请再试一次');}
  finally{
   $('screenFlash').hidden=true;
   if(torchLit){var off=await camera.torch(false);if(!off&&camera.get().ready)camera.stop();}
   state.hardwareFlash=false;
   if(shotId===captureSeq&&!photo){state.busy=false;$('shutter').disabled=!camera.get().ready;$('flip').disabled=camera.get().busy;}
  }
  if(photo&&shotId===captureSeq&&!document.hidden)processPhoto(photo).catch(processFailure);
 }
 function importFile(file){
  if(!file||state.busy||state.saving||!canCapture())return;
  if(file.type&&!/^image\//.test(file.type)&&!(/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name||''))){toast('请选择照片');return;}
  var url,img=new Image(),loadId=++captureSeq,loadTimer=0;state.busy=true;lockResult(true);
  function cleanup(){clearTimeout(loadTimer);img.onload=null;img.onerror=null;if(url)URL.revokeObjectURL(url);}
  function failed(message){cleanup();if(loadId!==captureSeq)return;state.busy=false;lockResult(false);toast(message);}
  img.onload=function(){if(loadId!==captureSeq||document.hidden){cleanup();if(loadId===captureSeq){state.busy=false;lockResult(false);}return;}
   try{var photo=newPhoto(img,img.naturalWidth,img.naturalHeight);cleanup();state.busy=false;processPhoto(photo).catch(processFailure);}
   catch(e){failed(e.message||'这次没能读取照片，请重新选择后再试');}
  };
  img.onerror=function(){failed('当前环境没能解码这张照片，请重新从相册选择后再试');};
  try{url=URL.createObjectURL(file);loadTimer=setTimeout(function(){failed('读取照片用时较长，请重新选择后再试');img.src='';},45000);img.src=url;}
  catch(e){failed('这次没能打开照片，请重新选择后再试');}
 }
 function addAlbum(photo){
  if(state.album.indexOf(photo)<0)state.album.push(photo);

  $('count').textContent=state.album.length;$('emptyAlbum').hidden=true;$('albumImport').hidden=false;
  var p=photo,button=p.albumNode;
  if(!button){
   button=document.createElement('button');button.className='album-photo';p.albumNode=button;
   var c=document.createElement('canvas');c.setAttribute('role','img');c.setAttribute('aria-label',p.film.name);p.albumCanvas=c;button.appendChild(c);
   var label=document.createElement('span');label.className='pending-label';label.textContent='继续显影';button.appendChild(label);p.albumPending=label;
   button.addEventListener('click',async function(){if(state.busy||state.saving)return;var loadingId=++captureSeq;state.busy=true;var previousPhoto=state.photo;state.photo=p;try{await FilmPhotoStore.restore(p);}catch(e){if(loadingId===captureSeq){state.photo=previousPhoto;toast(e.message);state.busy=false;}return;}if(loadingId!==captureSeq){FilmPhotoStore.trim(state.album,state.photo);return;}state.busy=false;FilmPhotoStore.trim(state.album,p);if(!p.result){setOpen(false,false);showViewer();runDevelop(p);return;}state.photo=p;state.compare=false;$('compare').setAttribute('aria-pressed','false');drawResult(p.result,p);$('viewer').dataset.developState='ready';$('developCover').hidden=true;$('progress').hidden=true;$('developHint').textContent='';$('photoTime').textContent='';$('retryDevelop').hidden=true;$('compare').lastElementChild.textContent='原图';lockResult(false);setOpen(false,false);showViewer();});
   $('albumGrid').appendChild(button);
  }
  p.albumPending.hidden=!!(p.result||p.resultFile);
  // Keep a stable item; only changed pixels need painting, never JPEG encoding.
  var bytes=p.result||p.original;
  if(bytes&&p.albumKind!==(p.result?"result":"original")){FilmPixels.draw(p.albumCanvas,bytes,p.w,p.h,320);p.albumKind=p.result?"result":"original";}p.albumBytes=null;
  FilmPhotoStore.archive(p).then(function(){FilmPhotoStore.trim(state.album,(!$("viewer").hidden||state.busy||state.saving)?state.photo:null);});
  state.album.forEach(function(item,i){item.albumNode.setAttribute('aria-label','查看第 '+(i+1)+' 张照片');});
 }
 async function save(){if(state.busy||!state.photo||!state.photo.result||state.saving)return;if(!P.inContainer){toast('请在小红书中保存到系统相册');return;}state.saving=true;$('save').disabled=true;var p=state.photo;try{var encoded=await FilmPhotoStore.png(p.result,p.w,p.h,true);await P.save(await FilmPhotoStore.dataURL(encoded.blob));toast('已保存到相册');p.saved=true;}catch(e){toast('保存未完成，未降低画质；'+(e.message||'请检查相册权限'));}finally{state.saving=false;lockResult(state.busy);}}

 function bindClick(id,fn){$(id).addEventListener('click',fn);}
 ['openCam','logo','emptyOpen'].forEach(function(id){bindClick(id,toggleOpen);});bindClick('retryCamera',function(){if(state.busy)return;S.unlock();camera.open(state.face);});$('lens').addEventListener('keydown',function(e){if(e.target!==this)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();setFormat(e.key==='ArrowLeft'?'portrait':'square');}});bindClick('flash',toggleFlash);bindClick('flip',function(){if(state.busy)return;S.play('tick');camera.switchCamera();});bindClick('shutter',capture);
 ['importPhoto','albumImport','lensImport'].forEach(function(id){bindClick(id,function(){S.unlock();$('file').click();});});$('file').addEventListener('change',function(e){var f=e.target.files&&e.target.files[0];e.target.value='';importFile(f);});bindClick('save',save);bindClick('again',function(){hideViewer();setOpen(true,true);});bindClick('retryDevelop',function(){if(state.photo)runDevelop(state.photo);});
 compareHold=FilmHoldCompare.bind($('compare'),{enabled:function(){return !state.busy&&!$('viewer').hidden&&!!(state.photo&&state.photo.result);},change:setComparison});
 bindClick('settings',function(){activeDialogTrigger=document.activeElement;$('settingsModal').hidden=false;$('closeSettings').focus();});function closeSettings(){$('settingsModal').hidden=true;if(activeDialogTrigger)activeDialogTrigger.focus();}bindClick('closeSettings',closeSettings);bindClick('soundToggle',function(){state.sound=!state.sound;S.set(state.sound);$('soundToggle').setAttribute('aria-pressed',String(state.sound));$('soundState').textContent=state.sound?'开启':'关闭';P.set('filmcam-sound',state.sound);if(state.sound)S.play('tick');});
 var dragStartOpen=false,dragY=0,dragProgress=0;
 function bindOpenDrag(el){FilmGestures.bind(el,{start:function(){if(state.busy)return;dragStartOpen=state.open;dragY=0;dragProgress=morph.begin();app.classList.add('morphing');$('album').style.height='calc(100% - 164px - var(--safe-top) - var(--safe-bottom))';S.unlock();},move:function(dx,dy){if(Math.abs(dx)>Math.abs(dy)||Math.abs(dy)<5||state.busy)return;dragY=dy;morph.drag(C.clamp(dragProgress+dy/240,0,1));},end:function(moved,canceled,multi){if(state.busy)return;if(moved){draggedUntil=Date.now()+350;var open=canceled||multi?dragStartOpen:Math.abs(dragY)>38?dragY>0:dragStartOpen;setOpen(open,!canceled);S.play(open?'open':'close');}else setOpen(dragStartOpen,false);}});}
 bindOpenDrag($('topDrag'));bindOpenDrag($('openCam'));bindOpenDrag(document.querySelector('.camera-header'));bindOpenDrag($('logo'));bindOpenDrag($('emptyAlbum'));bindOpenDrag($('emptyOpen'));
 var pinchFormat=state.format,lensDy=0,lensDx=0;
 FilmGestures.lockPagePinch(document,function(){return state.open&&$('viewer').hidden&&$('settingsModal').hidden;});
 FilmGestures.bind($('lens'),{
  accept:function(x,y,target){if(!state.open||state.busy||!$('lens').contains(target))return false;var r=$('lens').getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;},
  start:function(){lensDy=0;lensDx=0;},
  pinchStart:function(){pinchFormat=state.format;S.unlock();$('lens').classList.add('pinching');},
  pinch:function(initial,current){if(state.busy||!(initial>0))return;var mix=C.clamp((pinchFormat==='square'?1:0)+(current/initial-1)*2.5,0,1),h=(morphHeight-6)*.74;$('lens').style.width=(morphHeight*(55+13*mix)/68)+'px';$('aperture').style.width=h*(.75+.25*mix)+'px';},
  pinchEnd:function(initial,current,canceled){$('lens').classList.remove('pinching');if(!canceled&&!state.busy&&initial>0){setFormat(C.formatFromPinch(initial,current,pinchFormat));if(Math.abs(current/initial-1)>.03){shapeHintDone=true;document.querySelector('.shape-hint').hidden=true;}}renderPreview();},
  move:function(dx,dy){lensDy=dy;lensDx=dx;},
  end:function(moved,canceled,multi){if(moved&&!canceled&&!multi&&lensDy< -70&&Math.abs(lensDy)>Math.abs(lensDx)&&!state.busy){setOpen(false,false);S.play('close');}}
 });
 bindClick('filmSwitch',function(){if(!state.open||state.busy)return;S.unlock();selectFilm((state.film+1)%C.films.length);});
 var startZoom=1,zoomFrame=0,zoomPending=1;
 FilmGestures.bind($('zoomLever'),{start:function(){startZoom=state.zoom;zoomPending=state.zoom;S.unlock();$('zoomLever').classList.add('held');},move:function(dx,dy){zoomPending=C.clamp(startZoom-dy/70,1,3);if(!zoomFrame)zoomFrame=requestAnimationFrame(function(){zoomFrame=0;setZoom(zoomPending);});},end:function(moved,canceled){if(zoomFrame)cancelAnimationFrame(zoomFrame);zoomFrame=0;$('zoomLever').classList.remove('held');setZoom(canceled?startZoom:zoomPending);}});
 $('zoomLever').addEventListener('keydown',function(e){if(['ArrowUp','ArrowDown','Home','End'].indexOf(e.key)>=0){e.preventDefault();setZoom(e.key==='Home'?1:e.key==='End'?3:Math.round((state.zoom+(e.key==='ArrowUp'?.1:-.1))*10)/10);}});
 var paperLastX=0,paperLastY=0,paperLastTime=0,paperSoundDistance=0,paperGesture=false,paperMoving=false,paperWheelTimer=0,paperWheelX=0,paperWheelY=0;
 function paperFeedback(delta,speed){if(!paperCanSlide()||delta<.5)return;paperSoundDistance+=delta;if(paperSoundDistance>=6&&S.play('paper',C.clamp(speed/1.5,.04,1)))paperSoundDistance=0;pipeline.swipe(delta,speed);}
 FilmGestures.bind($('paper'),{
  accept:function(){return paperCanSlide();},
  start:function(){if(!paperCanSlide())return;clearTimeout(paperWheelTimer);paperWheelTimer=0;paperGesture=true;paperMoving=false;paperLastX=0;paperLastY=0;paperSoundDistance=0;paperLastTime=performance.now();if(paperGesture){clearTimeout(gyroPaperTimer);gyroPaperTimer=0;S.unlock();}},
  move:function(dx,dy){
   if(!paperGesture||!paperCanSlide())return;if(!$('viewer').classList.contains('arriving')){if(!paperMoving){paperMotion.begin();paperMoving=true;}paperMotion.move(dx,dy);}
   var now=performance.now(),delta=Math.hypot(dx-paperLastX,dy-paperLastY),speed=delta/Math.max(4,now-paperLastTime);
   paperFeedback(delta,speed);paperLastTime=now;paperLastX=dx;paperLastY=dy;
  },
  end:function(moved,canceled){if(paperMoving&&paperCanSlide())paperMotion.end();if(canceled)S.stop('paper');paperGesture=false;paperMoving=false;paperSoundDistance=0;}
 });
 $('paper').addEventListener('wheel',function(e){
  if(!paperCanSlide()||e.ctrlKey||paperGesture)return;e.preventDefault();S.unlock();
  var unit=e.deltaMode===1?16:e.deltaMode===2?240:1,dx=C.clamp(e.deltaX*unit,-100,100),dy=C.clamp(e.deltaY*unit,-100,100),now=performance.now();
  if(!paperWheelTimer){paperWheelX=0;paperWheelY=0;paperSoundDistance=0;paperLastTime=now;paperMotion.begin();}
  paperWheelX+=dx;paperWheelY+=dy;if(!$('viewer').classList.contains('arriving'))paperMotion.move(paperWheelX,paperWheelY);
  paperFeedback(Math.hypot(dx,dy),Math.hypot(dx,dy)/Math.max(16,now-paperLastTime));paperLastTime=now;
  clearTimeout(paperWheelTimer);paperWheelTimer=setTimeout(function(){paperWheelTimer=0;if(paperCanSlide())paperMotion.end();paperSoundDistance=0;},140);
 },{passive:false});
 async function safeArea(){var info=await P.windowInfo();if(!info)return;var top=info.safeArea?Math.max(0,info.safeArea.top):0;var buttons=info.menuButtons||{};Object.keys(buttons).forEach(function(k){if(buttons[k])top=Math.max(top,buttons[k].bottom+8);});var bottom=info.safeArea?Math.max(0,info.windowHeight-info.safeArea.bottom):0;document.documentElement.style.setProperty('--safe-top',top+'px');document.documentElement.style.setProperty('--safe-bottom',bottom+'px');layout();}
 document.addEventListener('keydown',function(e){if(e.key==='Escape'){if(!$('settingsModal').hidden)closeSettings();else if(!$('viewer').hidden)hideViewer();return;}if(e.key==='Tab'){var modal=!$('settingsModal').hidden?$('settingsModal'):!$('viewer').hidden?$('viewer'):null;if(!modal)return;var items=Array.prototype.filter.call(modal.querySelectorAll('button,[tabindex],summary'),function(el){return !el.disabled&&el.offsetParent!==null;}),first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}}});
 document.addEventListener('visibilitychange',function(){if(document.hidden){resetPaper();paperGesture=false;flashSeq++;camera.stop();S.stop();clearTimeout(chargeTimer);$('flash').classList.remove('charging');clearPrint();$('viewer').classList.remove('arriving');if(state.busy){captureSeq++;pipeline.cancel();if(state.photo)addAlbum(state.photo);state.busy=false;if(state.photo&&state.photo.result){drawResult(state.photo.result,state.photo);$('viewer').dataset.developState='ready';$('developCover').hidden=true;$('progress').style.visibility='hidden';$('retryDevelop').hidden=true;$('developHint').textContent='';$('photoTime').textContent='';lockResult(false);}else{$('retryDevelop').hidden=!state.photo;$('developHint').textContent='显影已暂停，点重试继续';lockResult(true);}}$('screenFlash').hidden=true;}else if(state.open){$('cameraMessage').hidden=false;$('cameraError').textContent='点一下，恢复取景';}});window.addEventListener('pagehide',function(){resetPaper();captureSeq++;clearPrint();camera.stop();pipeline.cancel();S.stop();});window.addEventListener('resize',function(){layout();safeArea();});
 morph=FilmCameraMorph.create({paint:paintMorph,settled:settleMorph});layout();setOpen(false,false);renderPreview();safeArea();P.get('filmcam-sound').then(function(on){if(on===false){state.sound=false;S.set(false);$('soundToggle').setAttribute('aria-pressed','false');$('soundState').textContent='关闭';}});
}());
