/* Shared instant-print geometry. GPL-3.0-or-later. */
(function(root){'use strict';
 var angle=22,perspective=720,preview=.12,duration=1380;
 function geometry(width,ratio){
  width=Math.max(1,Number(width)||1);ratio=ratio===.75?.75:1;
  var image=width/1.13,border=image*.065,bottom=image*.15;
  return {width:width,height:image/ratio+border+bottom,image:image,border:border,bottom:bottom};
 }
 function fit(width,height,ratio){
  var maxHeight=Math.max(100,height-300),maxWidth=Math.max(80,Math.min(340,width-44));
  if(height<=600){maxHeight=Math.max(90,height-190);maxWidth=Math.min(maxWidth,210);}
  return geometry(Math.min(maxWidth,maxHeight/geometry(1,ratio).height),ratio);
 }
 function feed(height){
  var travel=height+3;
  return [{offset:0,y:-travel},{offset:.08,y:-travel*.966},{offset:.9,y:-travel*.026},{offset:1,y:0}].map(function(frame){
   return {offset:frame.offset,transform:'perspective('+perspective+'px) rotateX('+angle+'deg) translate3d(0,'+frame.y+'px,0)'};
  });
 }
 function project(width,height,offset){
  var y=Math.max(0,height+offset),radians=angle*Math.PI/180,scale=1/(1-y*Math.sin(radians)/perspective);
  return {width:width*scale,height:y*Math.cos(radians)*scale};
 }
 function pose(dx,dy,scale,depth,tilt){
  return 'translate3d('+dx+'px,'+dy+'px,0) scale('+scale+') perspective('+depth+'px) rotateX('+tilt+'deg)';
 }
 root.FilmPaperPrint={geometry:geometry,fit:fit,feed:feed,project:project,pose:pose,angle:angle,perspective:perspective,preview:preview,duration:duration};
}(typeof window!=='undefined'?window:globalThis));
