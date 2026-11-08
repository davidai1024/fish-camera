/* Bounded, critically damped paper motion. No image or preference mutation. */
(function(root){'use strict';
 function create(options){
  var request=options.request||root.requestAnimationFrame.bind(root),cancel=options.cancel||root.cancelAnimationFrame.bind(root);
  var reduced=options.reduced||function(){return false;},apply=options.apply;
  var p=[0,0,0],v=[0,0,0],target=[0,0,0],base=[0,0,0],held=false,frame=0,previous=null;
  function bounded(start,delta,limit){var room=limit-(delta<0?-start:start);return delta&&room>0?start+delta/(1+Math.abs(delta)/room):start;}
  function wake(){if(!frame)frame=request(tick);}
  function tick(time){
   frame=0;if(reduced()){reset();return;}
   var dt=previous===null?1/60:Math.min(.032,Math.max(0,(time-previous)/1000));previous=time;
   var omega=held?36:20,decay=Math.exp(-omega*dt),moving=false;
   for(var i=0;i<3;i++){var error=p[i]-target[i],b=v[i]+omega*error;p[i]=target[i]+(error+b*dt)*decay;v[i]=(v[i]-omega*b*dt)*decay;if(Math.abs(p[i]-target[i])>.005||Math.abs(v[i])>.04)moving=true;}
   if(!moving){p=target.slice();v=[0,0,0];previous=null;}
   apply(p[0],p[1],p[2],held);if(moving)wake();
  }
  function reset(){if(frame)cancel(frame);frame=0;previous=null;held=false;p=[0,0,0];v=[0,0,0];target=[0,0,0];base=[0,0,0];apply(0,0,0,false);}
  return {
   begin:function(){if(reduced())return;base=p.slice();target=p.slice();held=true;wake();},
   move:function(dx,dy){if(!held||reduced())return;target=[bounded(base[0],dx*.28,24),bounded(base[1],dy*.2,16),bounded(base[2],dx*.025,3.2)];wake();},
   end:function(){held=false;target=[0,0,0];if(reduced())reset();else wake();},
   reset:reset,
   get:function(){return {x:p[0],y:p[1],angle:p[2],held:held,animating:!!frame};}
  };
 }
 var api={create:create};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FilmPaperMotion=api;
}(typeof window!=='undefined'?window:this));
