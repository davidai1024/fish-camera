/* film cam interaction geometry — GPL-3.0-or-later */
(function(root){'use strict';
 var films=[{id:'kodak_portra_400',name:'柔和人像',short:'PORTRA 400',filter:'saturate(.78) contrast(.95) sepia(.08)'},{id:'kodak_gold_200',name:'暖调日常',short:'GOLD 200',filter:'sepia(.2) saturate(1.18) contrast(1.03)'},{id:'fujifilm_pro_400h',name:'清透日光',short:'PRO 400H',filter:'saturate(.85) brightness(1.04) hue-rotate(7deg)'},{id:'ilford_hp5_plus_400',name:'经典黑白',short:'HP5 PLUS',filter:'grayscale(1) contrast(1.15)'}];
 function clamp(n,a,b){return Math.min(b,Math.max(a,n));}
 function crop(w,h,ratio,zoom){if(!(w>0&&h>0&&ratio>0))throw Error('Invalid image geometry');zoom=clamp(Number(zoom)||1,1,3);var cw=w,ch=w/ratio;if(ch>h){ch=h;cw=h*ratio;}cw/=zoom;ch/=zoom;return {x:(w-cw)/2,y:(h-ch)/2,w:cw,h:ch};}
 function size(ratio,max){return ratio>=1?{w:max,h:Math.round(max/ratio)}:{w:Math.round(max*ratio),h:max};}
 function pixelCrop(w,h,ratio,zoom){var c=crop(w,h,ratio,zoom);if(ratio===.75&&c.h>=4){c.h=Math.floor(c.h/4)*4;c.w=c.h*.75;}else{c.w=Math.max(1,Math.floor(c.w));c.h=Math.max(1,Math.floor(c.h));}c.x=Math.floor((w-c.w)/2);c.y=Math.floor((h-c.h)/2);return c;}
 function imageFit(w,h,maxEdge){
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)throw Error('照片内容为空，请重新选择');
  var scale=Math.min(1,(maxEdge||4096)/Math.max(w,h),Math.sqrt(12600000/(w*h))),outW=Math.max(1,Math.floor(w*scale)),outH=Math.max(1,Math.floor(h*scale));
  if(w/h===.75&&outH>=4){outH=Math.floor(outH/4)*4;outW=outH*.75;}
  return {w:outW,h:outH,adapted:outW!==w||outH!==h};
 }
 function formatFromPinch(initial,current,previous){if(current/initial>.13+1)return 'square';if(current/initial<.87)return 'portrait';return previous;}
 function filmIndex(start,delta){return clamp(start+Math.round(delta/26),0,films.length-1);}
 function zoomFromDrag(start,dx){return Math.round(clamp(start+dx/65,1,3)*10)/10;}
 var api={films:films,clamp:clamp,crop:crop,size:size,pixelCrop:pixelCrop,imageFit:imageFit,formatFromPinch:formatFromPinch,filmIndex:filmIndex,zoomFromDrag:zoomFromDrag};if(typeof module!=='undefined')module.exports=api;else root.FilmCore=api;
}(typeof window!=='undefined'?window:this));
