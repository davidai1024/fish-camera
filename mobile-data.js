/* Numerical PNG payload: lossless bytes, no ICC/gamma, outside assets/. */
(function(root){'use strict';
 var cached=null,pending=null;
 function crc(bytes){var c=0xffffffff;for(var i=0;i<bytes.length;i++){c^=bytes[i];for(var j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
 function half(h){var e=(h>>10)&31,m=h&1023;return (h&32768?-1:1)*(e?Math.pow(2,e-15)*(1+m/1024):m*Math.pow(2,-24));}
 async function unpack(rgba,meta,id){
  var bytes=new Uint8Array(meta.file.bytes),c=0xffffffff,data={film:id,side:meta.side,lut:meta.lut};
  for(var base=0;base<bytes.length;base+=16384){var end=Math.min(bytes.length,base+16384);for(var i=base;i<end;i++){var v=rgba[Math.floor(i/3)*4+i%3];bytes[i]=v;c^=v;for(var bit=0;bit<8;bit++)c=(c>>>1)^((c&1)?0xedb88320:0);}await new Promise(function(r){setTimeout(r,0);});}
  if(((c^0xffffffff)>>>0)!==meta.file.crc32)throw Error('胶片数值资源校验失败');
  var view=new DataView(bytes.buffer),keys=Object.keys(meta.arrays);
  for(var n=0;n<keys.length;n++){var k=keys[n],a=meta.arrays[k],out=new Float32Array(a.length);
   for(base=0;base<out.length;base+=16384){end=Math.min(out.length,base+16384);for(i=base;i<end;i++)out[i]=a.encoding==='float16'?half(view.getUint16(a.offset+i*2,true)):view.getFloat32((a.offset+i)*4,true);await new Promise(function(r){setTimeout(r,0);});}data[k]=out;
  }return data;
 }
 function load(id){if(cached&&cached.film===id)return Promise.resolve(cached);if(pending&&pending.id===id)return pending.promise;
  var meta=root.FilmMobileProfiles[id];if(!meta)return Promise.reject(Error('未找到胶片数据'));
  var promise=new Promise(function(resolve,reject){var img=new Image(),timer=setTimeout(function(){img.onload=img.onerror=null;reject(Error('胶片数据加载超时'));},15000);
   img.onerror=function(){clearTimeout(timer);reject(Error('胶片数据加载失败'));};
   img.onload=async function(){clearTimeout(timer);var canvas=document.createElement('canvas');try{if(img.naturalWidth!==meta.file.width||img.naturalHeight!==meta.file.height)throw Error('胶片资源尺寸被改变');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;var ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);var rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;canvas.width=canvas.height=0;var data=await unpack(rgba,meta,id);cached=data;resolve(data);}catch(e){reject(e);}finally{canvas.width=canvas.height=0;img.src='';}};img.src=meta.file.url;
  });pending={id:id,promise:promise};return promise.then(function(d){pending=null;return d;},function(e){pending=null;throw e;});
 }
 root.FilmMobileData={load:load,clear:function(){cached=null;},crc:crc,half:half};
}(window));
