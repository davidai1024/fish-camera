/* One shared lens surface. Input is coalesced to one paint per animation frame. */
(function(root){'use strict';
 function create(options){var value=0,wanted=0,frame=0,animation=null,resolve=null;
  function clamp(x){return Math.max(0,Math.min(1,x));}
  function interrupt(){if(frame)root.cancelAnimationFrame(frame);frame=0;animation=null;if(resolve){resolve(false);resolve=null;}}
  function paint(t){frame=0;if(animation){var p=Math.min(1,Math.max(0,(t-animation.start)/animation.duration)),ease=1-Math.pow(1-p,3);value=animation.from+(animation.to-animation.from)*ease;options.paint(value);if(p<1){frame=root.requestAnimationFrame(paint);return;}animation=null;if(options.settled)options.settled(value);if(resolve){var done=resolve;resolve=null;done(true);}}else{value=wanted;options.paint(value);}}
  function drag(x){wanted=clamp(x);animation=null;if(!frame)frame=root.requestAnimationFrame(paint);}
  function to(x,immediate){interrupt();wanted=clamp(x);if(immediate||Math.abs(wanted-value)<.0001){value=wanted;options.paint(value);if(options.settled)options.settled(value);return Promise.resolve(true);}animation={from:value,to:wanted,start:root.performance.now(),duration:260};frame=root.requestAnimationFrame(paint);return new Promise(function(r){resolve=r;});}
  return {value:function(){return value;},begin:function(){interrupt();return value;},drag:drag,to:to,refresh:function(){options.paint(value);},cancel:interrupt};
 }
 root.FilmCameraMorph={create:create};
}(window));
