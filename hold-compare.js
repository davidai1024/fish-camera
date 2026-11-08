/* Momentary comparison: every interrupted hold returns to the processed photo. */
(function(root){'use strict';
 function bind(button,options){
  var doc=button.ownerDocument,win=doc.defaultView,owner=null,mouseAfter=0;
  function stop(){if(!owner)return;var held=owner;owner=null;options.change(false);if(held.kind==='pointer'&&button.hasPointerCapture&&button.releasePointerCapture){try{if(button.hasPointerCapture(held.id))button.releasePointerCapture(held.id);}catch(e){}}}
  function start(kind,id,e){if(owner||button.disabled||doc.hidden||!options.enabled())return;if(e.cancelable)e.preventDefault();owner={kind:kind,id:id};options.change(true);}
  function inside(x,y){var r=button.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;}
  function end(kind,id){if(owner&&owner.kind===kind&&owner.id===id)stop();}
  if(win.PointerEvent){
   button.addEventListener('pointerdown',function(e){if(e.button!==0||e.isPrimary===false)return;start('pointer',e.pointerId,e);if(owner&&owner.kind==='pointer'&&owner.id===e.pointerId&&button.setPointerCapture){try{button.setPointerCapture(e.pointerId);}catch(err){}}});
   win.addEventListener('pointermove',function(e){if(owner&&owner.kind==='pointer'&&owner.id===e.pointerId&&(!inside(e.clientX,e.clientY)||(e.pointerType==='mouse'&&e.buttons===0)))stop();});
   win.addEventListener('pointerup',function(e){end('pointer',e.pointerId);});
   win.addEventListener('pointercancel',function(e){end('pointer',e.pointerId);});
   button.addEventListener('lostpointercapture',function(e){end('pointer',e.pointerId);});
   button.addEventListener('pointerleave',function(e){end('pointer',e.pointerId);});
  }else{
   button.addEventListener('touchstart',function(e){mouseAfter=Date.now()+800;if(e.touches.length!==1){stop();return;}start('touch',e.touches[0].identifier,e);},{passive:false});
   win.addEventListener('touchmove',function(e){if(!owner||owner.kind!=='touch')return;var t=null;for(var i=0;i<e.touches.length;i++)if(e.touches[i].identifier===owner.id)t=e.touches[i];if(!t||e.touches.length!==1||!inside(t.clientX,t.clientY))stop();},{passive:true});
   function touchEnd(e){mouseAfter=Date.now()+800;for(var i=0;i<e.changedTouches.length;i++)end('touch',e.changedTouches[i].identifier);}
   win.addEventListener('touchend',touchEnd);win.addEventListener('touchcancel',touchEnd);
   button.addEventListener('mousedown',function(e){if(e.button===0&&Date.now()>=mouseAfter)start('mouse',0,e);});
   win.addEventListener('mouseup',function(e){if(e.button===0)end('mouse',0);});
   win.addEventListener('mousemove',function(e){if(owner&&owner.kind==='mouse'&&(e.buttons===0||!inside(e.clientX,e.clientY)))stop();});
   button.addEventListener('mouseleave',function(){if(owner&&owner.kind==='mouse')stop();});
  }
  button.addEventListener('keydown',function(e){if(e.key!==' '&&e.key!=='Enter')return;if(e.cancelable)e.preventDefault();if(!e.repeat)start('key',e.key,e);});
  win.addEventListener('keyup',function(e){end('key',e.key);});
  button.addEventListener('click',function(e){e.preventDefault();});
  button.addEventListener('contextmenu',function(e){e.preventDefault();});
  button.addEventListener('dragstart',function(e){e.preventDefault();stop();});
  button.addEventListener('blur',stop);win.addEventListener('blur',stop);win.addEventListener('pagehide',stop);
  doc.addEventListener('visibilitychange',function(){if(doc.hidden)stop();});
  return {reset:stop};
 }
 root.FilmHoldCompare={bind:bind};
}(typeof window!=='undefined'?window:this));
