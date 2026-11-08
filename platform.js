/* Small, guarded Xiaohongshu adapter. All media remains on device. */
(function(root){'use strict';
 var xhs=root.xhs,api=xhs&&xhs.miniTool,client=0;
 function version(o){return Math.floor((Number(o&&o.miniToolEnv&&o.miniToolEnv.buildVersion)||0)/1000);}
 var ready=(async function(){client=version(xhs&&xhs.launchOptions);if(!client&&api&&typeof api.getLaunchOptions==='function'){try{client=version(await api.getLaunchOptions());}catch(e){}}return client;})();
 function has(name,min){return client>=min&&api&&typeof api[name]==='function';}
 async function get(key){await ready;if(has('getStorage',9460)){try{var r=await api.getStorage({key:key});return r&&r.data?JSON.parse(r.data):null;}catch(e){return null;}}try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}}
 async function set(key,value){await ready;if(has('setStorage',9460)){try{await api.setStorage({key:key,data:JSON.stringify(value)});return true;}catch(e){return false;}}try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){return false;}}
 async function haptic(){await ready;if(has('vibrateShort',9500)){try{await api.vibrateShort({type:'light'});}catch(e){}}}
 async function windowInfo(){await ready;if(has('getWindowInfo',9490)){try{return await api.getWindowInfo();}catch(e){}}return null;}
 async function save(data){await ready;if(!xhs)return false;if(!has('saveImageToPhotosAlbum',9420))throw Error('请更新小红书后保存');var path=data;if(has('writeTempFile',9420)){var temp=await api.writeTempFile({data:data});if(temp&&temp.filePath)path=temp.filePath;}await api.saveImageToPhotosAlbum({filePath:path});return true;}
 var motionQueue=Promise.resolve();
 function watchGyroscope(onFrame,onAvailable){
  var canceled=false,listening=false,started=false,available=false,watchdog=0,startTimer=0;
  function cancel(){
   if(canceled)return;canceled=true;root.clearTimeout(watchdog);root.clearTimeout(startTimer);
   if(listening){try{api.offGyroscopeChange(frame);}catch(e){}listening=false;}
   if(available&&onAvailable)onAvailable(false);available=false;
   // A late start must finish before its stop; a new subscription waits for both.
   motionQueue=motionQueue.then(async function(){if(started){try{await api.stopGyroscope();}catch(e){}}});
  }
  function arm(){root.clearTimeout(watchdog);watchdog=root.setTimeout(function(){watchdog=0;if(available&&onAvailable)onAvailable(false);available=false;},4000);}
  function frame(value){
   if(canceled||!value||![value.x,value.y,value.z].every(Number.isFinite))return;
   arm();if(!available){available=true;if(onAvailable)onAvailable(true);}
   if(!canceled)onFrame({x:value.x,y:value.y,z:value.z});
  }
  motionQueue=motionQueue.then(async function(){
   await ready;if(canceled)return;
   if(!['startGyroscope','stopGyroscope','onGyroscopeChange','offGyroscopeChange'].every(function(name){return has(name,9500);}))return;
   try{listening=true;api.onGyroscopeChange(frame);started=true;startTimer=root.setTimeout(cancel,10000);await api.startGyroscope({interval:'ui'});root.clearTimeout(startTimer);startTimer=0;if(!canceled&&!available)arm();}
   catch(e){cancel();}
  });
  return cancel;
 }
 root.FilmPlatform={ready:ready,inContainer:!!xhs,get:get,set:set,haptic:haptic,windowInfo:windowInfo,save:save,watchGyroscope:watchGyroscope,workerAllowed:function(){return !xhs||client>=9530;}};
}(window));
