/* Local-only lossless photo storage; no server uploads. */
(function(root){'use strict';
 var pending=Promise.resolve(),dbPromise=null,busy=false,idleWaiters=[];
 function setBusy(value){busy=!!value;if(!busy){var waiters=idleWaiters;idleWaiters=[];waiters.forEach(function(resolve){resolve();});}}
 async function waitIdle(){while(busy)await new Promise(function(resolve){idleWaiters.push(resolve);});}
 function encode(canvas){return new Promise(function(resolve,reject){if(typeof canvas.toBlob!=='function'){reject(Error('当前环境不支持异步原像素导出'));return;}var ended=false,timer=setTimeout(function(){ended=true;reject(Error('PNG编码超时'));},45000);canvas.toBlob(function(b){if(ended)return;clearTimeout(timer);if(!b||!b.size||b.type!=='image/png'){reject(Error('PNG编码失败'));return;}resolve(b);},'image/png');});}
 function dataURL(blob){return new Promise(function(resolve,reject){var r=new FileReader();r.onload=function(){resolve(r.result);};r.onerror=function(){reject(Error('文件转换失败'));};r.readAsDataURL(blob);});}
 async function png(bytes,w,h,framed){var c=document.createElement('canvas'),border=framed?Math.round(w*.065):0,bottom=framed?Math.round(w*.15):0;c.width=w+border*2;c.height=h+border+bottom;try{var ctx=c.getContext('2d');if(!ctx||c.width!==w+border*2||c.height!==h+border+bottom)throw Error('原像素画布不可用');if(framed){ctx.fillStyle='#fffdf8';ctx.fillRect(0,0,c.width,c.height);}ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes),w,h),border,border);var blob=await encode(c);return {blob:blob,width:c.width,height:c.height};}finally{c.width=c.height=0;}}
 function db(){if(dbPromise)return dbPromise;dbPromise=new Promise(function(resolve,reject){if(!root.indexedDB){reject(Error('照片缓存不可用'));return;}var q=root.indexedDB.open('filmcam-mobile-lab',1);q.onupgradeneeded=function(){q.result.createObjectStore('photos');};q.onsuccess=function(){resolve(q.result);};q.onerror=function(){reject(Error('照片缓存未打开'));};});return dbPromise;}
 async function idb(mode,key,value){var d=await db();return new Promise(function(resolve,reject){var tx=d.transaction('photos',mode),store=tx.objectStore('photos'),q=mode==='readwrite'?store.put(value,key):store.get(key),result; q.onsuccess=function(){result=q.result;};tx.oncomplete=function(){resolve(result);};tx.onerror=tx.onabort=function(){reject(Error('照片缓存读写失败'));};});}
 async function persist(blob,key){var client=await FilmPlatform.ready,api=root.xhs&&root.xhs.miniTool;
  if(FilmPlatform.inContainer){
   if(client<9490||!api||!['getFileStorageInfo','writeFile','appendFile','statFile'].every(function(name){return typeof api[name]==='function';}))throw Error('客户端不支持可恢复照片缓存');
   var options=root.xhs.launchOptions;
   if(!(options&&options.miniToolEnv&&options.miniToolEnv.userDataPath)&&typeof api.getLaunchOptions==='function')options=await api.getLaunchOptions();
   var base=options&&options.miniToolEnv&&options.miniToolEnv.userDataPath,info=await api.getFileStorageInfo();
   if(!base||!info||!Number.isFinite(info.limitBytes)||!Number.isFinite(info.usedBytes)||!(info.writeChunkMaxBytes>0))throw Error('照片缓存配额不可用');
   if(info.limitBytes-info.usedBytes<blob.size)throw Error('照片缓存空间不足，请先保存照片');
   var path=base+'/filmcam-lab-'+key+'-'+Date.now()+'.png',chunk=Math.floor(info.writeChunkMaxBytes);
   for(var pos=0;pos<blob.size;pos+=chunk){
    var part=blob.slice(pos,Math.min(blob.size,pos+chunk)),encoded=await dataURL(part),comma=encoded.indexOf(',');
    if(comma<0)throw Error('照片分片编码失败');
    var result=await api[pos===0?'writeFile':'appendFile']({filePath:path,data:encoded.slice(comma+1),encoding:'base64'});
    if(!result||result.writtenBytes!==part.size)throw Error('照片分片未完整写入');
   }
   var st=await api.statFile({filePath:path});if(!st||st.isDir||st.size!==blob.size)throw Error('照片文件校验失败');
   return {path:path,size:blob.size};
  }
  await idb('readwrite',key,blob);var back=await idb('readonly',key);if(!back||back.size!==blob.size)throw Error('照片缓存校验失败');return {key:key,size:blob.size};
 }
 async function decode(ref,w,h,background){var url=ref.path,owned=false;if(!url){var blob=await idb('readonly',ref.key);if(!blob)throw Error('照片缓存已不可用');url=URL.createObjectURL(blob);owned=true;}return new Promise(function(resolve,reject){var im=new Image(),timer=setTimeout(function(){finish(Error('照片读取超时'));},20000),settled=false;function finish(err,result){if(settled)return;settled=true;clearTimeout(timer);im.onload=im.onerror=null;if(owned)URL.revokeObjectURL(url);if(err)reject(err);else resolve(result);}im.onerror=function(){finish(Error('照片文件无法读取'));};im.onload=async function(){clearTimeout(timer);if(background)await waitIdle();if(settled)return;var c=document.createElement('canvas');try{if(im.naturalWidth!==w||im.naturalHeight!==h)throw Error('照片文件尺寸异常');c.width=w;c.height=h;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);finish(null,ctx.getImageData(0,0,w,h).data.buffer);}catch(e){finish(e);}finally{c.width=c.height=0;}};im.src=url;});}
 function archive(photo){var job=pending.then(async function(){var kinds=['original','result'];for(var i=0;i<kinds.length;i++){var key=kinds[i];await waitIdle();if(photo[key]&&!photo[key+'File']){var encoded=await png(photo[key],photo.w,photo.h,false);await waitIdle();var ref=await persist(encoded.blob,'photo-'+photo.id+'-'+key);await waitIdle();var restored=await decode(ref,photo.w,photo.h,true);var a=new Uint8Array(photo[key]),b=new Uint8Array(restored);if(a.length!==b.length)throw Error('缓存像素不完整');for(var base=0;base<a.length;base+=262144){await waitIdle();for(var k=base;k<Math.min(a.length,base+262144);k++)if(a[k]!==b[k])throw Error('缓存像素不一致');await new Promise(function(resolve){setTimeout(resolve,0);});}photo[key+'File']=ref;}}photo.cacheError='';return true;});pending=job.catch(function(e){photo.cacheError=e.message;return false;});return pending;}
 async function restore(photo){if(!photo.original){if(!photo.originalFile)throw Error('原图缓存不可用');photo.original=await decode(photo.originalFile,photo.w,photo.h);}if(!photo.result&&photo.resultFile)photo.result=await decode(photo.resultFile,photo.w,photo.h);return photo;}
 function trim(photos,current){photos.forEach(function(p){if(p===current)return;if(p.originalFile)p.original=null;if(p.resultFile)p.result=null;p.albumBytes=null;});}
 function residentBytes(photos){return photos.reduce(function(n,p){return n+(p.original?p.original.byteLength:0)+(p.result?p.result.byteLength:0);},0);}
 root.FilmPhotoStore={setBusy:setBusy,encode:encode,dataURL:dataURL,png:png,archive:archive,restore:restore,trim:trim,residentBytes:residentBytes,decode:decode};
}(window));
