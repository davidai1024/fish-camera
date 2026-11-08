/* One gesture region per control, pointer events with touch fallback. */
(function(root){'use strict';
 function bind(el,handlers){var points={},start=null,pinch=null,moved=false,multi=false,canceled=false,lastDistance=0,lastTouch=0;
  function list(){return Object.keys(points).map(function(k){return points[k];});}
  function distance(p){return Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
  function begin(id,x,y){points[id]={x:x,y:y};var p=list();if(p.length===1){start={x:x,y:y};moved=false;multi=false;canceled=false;if(handlers.start)handlers.start(start);}else if(p.length===2&&!multi&&!canceled){multi=true;pinch=distance(p);lastDistance=pinch;if(handlers.pinchStart)handlers.pinchStart(pinch);}else if(p.length>2){canceled=true;}}
  function move(id,x,y){if(!points[id]||canceled)return;points[id]={x:x,y:y};var p=list();if(p.length===2&&pinch){lastDistance=distance(p);moved=true;if(handlers.pinch)handlers.pinch(pinch,lastDistance);return;}if(start&&p.length===1&&!multi){var dx=x-start.x,dy=y-start.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=true;if(handlers.move)handlers.move(dx,dy);}}
 function end(id,cancel){if(!points[id])return;canceled=canceled||!!cancel;delete points[id];if(list().length)return;if(multi&&handlers.pinchEnd)handlers.pinchEnd(pinch,lastDistance,canceled);if(handlers.end)handlers.end(moved,canceled,multi);start=null;pinch=null;multi=false;}
  function childControl(e){var control=e.target.closest&&e.target.closest('button,a,input');return control&&control!==el;}
  function accepts(t){return !childControl(t)&&(!handlers.accept||handlers.accept(t.clientX,t.clientY,t.target));}
  function prevent(e){if(e.cancelable!==false&&e.preventDefault)e.preventDefault();}
  function checkTouches(e){if(handlers.pinchStart&&list().length&&e.touches){for(var i=0;i<e.touches.length;i++){if(!points['t'+e.touches[i].identifier]){canceled=true;break;}}}}
  // Touch events remain available even in WebViews with partial Pointer Events.
  // Ignore their duplicate pointer stream; keep pointer capture for mouse/pen.
  function pointerIgnored(e){return e.pointerType==='touch'||Date.now()-lastTouch<700;}
  if(root.PointerEvent){el.addEventListener('pointerdown',function(e){if(pointerIgnored(e)||!accepts(e)||(e.button&&e.button!==0))return;begin('p'+e.pointerId,e.clientX,e.clientY);try{el.setPointerCapture(e.pointerId);}catch(ignore){}});el.addEventListener('pointermove',function(e){if(!pointerIgnored(e))move('p'+e.pointerId,e.clientX,e.clientY);});el.addEventListener('pointerup',function(e){end('p'+e.pointerId,false);});el.addEventListener('pointercancel',function(e){end('p'+e.pointerId,true);});el.addEventListener('lostpointercapture',function(e){end('p'+e.pointerId,true);});}
  el.addEventListener('touchstart',function(e){lastTouch=Date.now();Array.prototype.forEach.call(e.changedTouches,function(t){var target=t.target||e.target;if(accepts({target:target,clientX:t.clientX,clientY:t.clientY}))begin('t'+t.identifier,t.clientX,t.clientY);});checkTouches(e);if(list().length>1)prevent(e);},{passive:false});
  el.addEventListener('touchmove',function(e){if(!list().length)return;checkTouches(e);prevent(e);Array.prototype.forEach.call(e.changedTouches,function(t){move('t'+t.identifier,t.clientX,t.clientY);});},{passive:false});
  el.addEventListener('touchend',function(e){lastTouch=Date.now();Array.prototype.forEach.call(e.changedTouches,function(t){end('t'+t.identifier,false);});});
  el.addEventListener('touchcancel',function(e){lastTouch=Date.now();Array.prototype.forEach.call(e.changedTouches,function(t){end('t'+t.identifier,true);});});
  if(handlers.pinchStart&&root.document)root.document.addEventListener('touchstart',checkTouches,{passive:true});
 }
 function lockPagePinch(el,enabled){
  function prevent(e){if(enabled()&&e.cancelable!==false)e.preventDefault();}
  function touch(e){if(e.touches&&e.touches.length>1)prevent(e);}
  el.addEventListener('touchstart',touch,{passive:false,capture:true});
  el.addEventListener('touchmove',touch,{passive:false,capture:true});
  el.addEventListener('gesturestart',prevent,{passive:false});
  el.addEventListener('gesturechange',prevent,{passive:false});
  el.addEventListener('wheel',function(e){if(e.ctrlKey)prevent(e);},{passive:false});
 }
 root.FilmGestures={bind:bind,lockPagePinch:lockPagePinch};
}(window));
