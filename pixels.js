/* Display surfaces are bounded; capture bytes and PNG export remain full resolution. */
(function(root){'use strict';
 function draw(canvas,bytes,w,h,maxEdge){
  var scale=Math.min(1,maxEdge/Math.max(w,h)),dw=Math.max(1,Math.round(w*scale)),dh=Math.max(1,Math.round(h*scale));
  canvas.width=dw;canvas.height=dh;
  var ctx=canvas.getContext('2d');if(!ctx)throw Error('无法创建显示画布');
  var src=new Uint8ClampedArray(bytes);
  if(dw===w&&dh===h){ctx.putImageData(new ImageData(src,w,h),0,0);return;}
  var image=ctx.createImageData(dw,dh),out=image.data;
  for(var y=0;y<dh;y++)for(var x=0;x<dw;x++){
   var sx=Math.min(w-1,Math.floor((x+.5)*w/dw)),sy=Math.min(h-1,Math.floor((y+.5)*h/dh));
   var at=(sy*w+sx)*4,to=(y*dw+x)*4;
   out[to]=src[at];out[to+1]=src[at+1];out[to+2]=src[at+2];out[to+3]=src[at+3];
  }
  ctx.putImageData(image,0,0);
 }
 function release(canvas){canvas.width=0;canvas.height=0;}
 root.FilmPixels={draw:draw,release:release};
}(window));
