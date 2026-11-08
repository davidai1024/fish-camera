/* Mobile validation pipeline. Original recipes; finite blur + Gaussian grain approximation. */
(function(root){'use strict';
 var S=root.FilmMobileStages,M=[.5293459266781223,.3300727993638263,.14058127395805156,.09837434248373353,.8734610239730559,.028164633543210672,.016883217605215644,.11767247124974249,.8654443111450418];
 function transpose(m){return [m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]];}
 function pause(){return new Promise(function(r){setTimeout(r,0);});}
 function create(){var gpu=null,canceled=false,sliceAt=0;
  async function breathe(force){if(!root.FilmRenderCanvas&&(force||performance.now()-sliceAt>=6)){if(gpu)gpu.flush();await pause();sliceAt=performance.now();}if(canceled)throw Error("显影已取消，原图已保留");}
  async function render(photo,onPhase){canceled=false;sliceAt=performance.now();var began=sliceAt,w=photo.w,h=photo.h,rgba=new Uint8ClampedArray(photo.original),px=35000/Math.max(w,h),stats={engine:'webgl1-f32-staged-lab',input:[w,h],tile:128,overlap:0,peakGpuBytes:0,approximation:['finite-gaussian','density-poisson-gaussian','full-grid-meter'],tiles:0};
   if(w<1||h<1||w*h>12600000||Math.max(w,h)>4096)throw Error('验证版暂支持长边4096以内、1260万像素以内，未缩小原图');
   function guard(){if(canceled)throw Error('显影已取消，原图已保留');}
   try{onPhase('读取胶片配方');var d=await FilmMobileData.load(photo.film.id);guard();gpu=FilmMobileGL.create();stats.capability=gpu.capability;stats.thread=root.FilmRenderCanvas?'worker':'main-cooperative';await breathe(true);
    function check(){guard();stats.peakGpuBytes=Math.max(stats.peakGpuBytes,gpu.bytes());if(gpu.bytes()>64*1024*1024)throw Error('显影资源超出验证预算，原图已保留');}
    function tex3(values,tw,th){var a=new Float32Array(tw*th*4);for(var i=0;i<values.length/3;i++){a[i*4]=values[i*3];a[i*4+1]=values[i*3+1];a[i*4+2]=values[i*3+2];a[i*4+3]=1;}return gpu.texture(tw,th,a);}
    var spectral=tex3(d.table,192,192),curveX=tex3(d.film_curve_x,256,1),curveFilm=tex3(d.film_curve_y,256,1),curveCoupler=tex3(d.coupler_curve_y,256,1),grainX=tex3(d.grain_axis,256,1),gy=new Float32Array(256*3*3);
    for(var l=0;l<3;l++)for(var k=0;k<256;k++)for(var ch=0;ch<3;ch++)gy[(l*256+k)*3+ch]=d.grain_y[k*9+ch*3+l];
    var grainY=tex3(gy,256,3),print=tex3(d.printLut,1024,269),gp=PortraGrainStage.profile(d,px),gu={uniformity:[.97,.99,.97],seed:photo.seed||0x5eed};
    for(l=0;l<3;l++){gu['dmax'+l]=[gp.lp[l*4+1],gp.lp[(3+l)*4+1],gp.lp[(6+l)*4+1]];gu['min'+l]=[gp.lp[l*4],gp.lp[(3+l)*4],gp.lp[(6+l)*4]];gu['n'+l]=[gp.lp[l*4+2],gp.lp[(3+l)*4+2],gp.lp[(6+l)*4+2]];}
    if(gp.sigma.some(function(s){return s>.4;}))throw Error('此尺寸需要的颗粒云团尚未验证，未关闭颗粒');
    var lut=new Float32Array(256);for(k=0;k<256;k++){var f=k/255;lut[k]=f<=.040449936?f/12.92:Math.pow((f+.055)/1.055,2.4);}
    var wx=new Float64Array(w),wy=new Float64Array(h),edge=Math.max(w,h),mass=0,sum=0;
    for(k=0;k<w;k++)wx[k]=Math.exp(-Math.pow((k/w-.5)*w/edge,2)/.08);for(k=0;k<h;k++)wy[k]=Math.exp(-Math.pow((k/h-.5)*h/edge,2)/.08);
    var lm=[.288*M[0]+.7119*M[3]+.0001*M[6],.288*M[1]+.7119*M[4]+.0001*M[7],.288*M[2]+.7119*M[5]+.0001*M[8]];
    for(var y=0;y<h;y++){for(var x=0;x<w;x++){var at=(y*w+x)*4,weight=wx[x]*wy[y];sum+=(lm[0]*lut[rgba[at]]+lm[1]*lut[rgba[at+1]]+lm[2]*lut[rgba[at+2]])*weight;mass+=weight;}if(y%16===15){await breathe(false);guard();}}
    var gain=sum>0?.184/(sum/mass):1;stats.exposureGain=gain;
    // Common lattice for downsampled low-frequency fields; padding covers summed finite supports.
    var overlap=Math.ceil((3*(9.7*2.7684+65*Math.sqrt(3)+200*2.7684)/px+8)/32)*32;stats.overlap=overlap;
    var tile=photo.validationTile|| (edge<=1600?512:256);if([128,256,512].indexOf(tile)<0)throw Error("无效工作块");stats.tile=tile;var output=new Uint8ClampedArray(w*h*4);
    async function apply(name,target,inputs,u){gpu.run(name,S[name],target,inputs,u||{});check();await breathe(false);}
    async function scaled(source,tw,th){var t=gpu.texture(tw,th);await apply('down',t,{a:source},{texel:[1/source.w,1/source.h]});return t;}
    async function blur(source,sigmas){var max=Math.max.apply(null,sigmas),factor=1;while(max/factor>4)factor*=2;var input=source,owns=false;
     if(factor>1){input=await scaled(source,Math.max(1,Math.ceil(source.w/factor)),Math.max(1,Math.ceil(source.h/factor)));owns=true;}
     var tmp=gpu.texture(input.w,input.h),result=gpu.texture(input.w,input.h),ss=sigmas.map(function(s){return s/factor;});
     await apply('blur',tmp,{a:input},{direction:[1/input.w,0],sigma:ss});await apply('blur',result,{a:tmp},{direction:[0,1/input.h],sigma:ss});gpu.remove(tmp);if(owns)gpu.remove(input);
     if(factor>1){gpu.linear(result);var full=gpu.texture(source.w,source.h);await apply('copy',full,{a:result},{});gpu.remove(result);return full;}return result;
    }
    async function mixture(source,parts){var acc=null;for(var partIndex=0;partIndex<parts.length;partIndex++){var part=parts[partIndex],b=await blur(source,part.sigma);if(!acc){acc=gpu.texture(source.w,source.h);await apply('mix',acc,{a:b,b:b},{wa:part.weight,wb:[0,0,0]});}else{var next=gpu.texture(source.w,source.h);await apply('mix',next,{a:acc,b:b},{wa:[1,1,1],wb:part.weight});gpu.remove(acc);acc=next;}gpu.remove(b);}return acc;}
    function cmTexture(values){var arr=new Float32Array(720*64*3);for(var ii=0;ii<values.length;ii++)arr[ii*3]=values[ii];return tex3(arr,720,64);}
    var cmPro=cmTexture(d.cam16_cmax),cmSrgb=cmTexture(d.srgb_cam16_cmax),uPro=FilmMobileColor.uniforms(d,''),uSrgb=FilmMobileColor.uniforms(d,'srgb_');uPro.xyzToRgb=transpose(d.xyz_to_rgb);uSrgb.identity=transpose(d.prophoto_identity);uSrgb.toSrgb=transpose(d.prophoto_to_srgb);
    var fits=[[.1633,.5360],[.6496,1.5236],[.1870,2.7684]],tailW=[.78,.65,.67],tail=[9.3,9.7,9.1];
    for(var oy=0;oy<h;oy+=tile)for(var ox=0;ox<w;ox+=tile){guard();onPhase('原像素显影 '+Math.round(stats.tiles/(Math.ceil(w/tile)*Math.ceil(h/tile))*100)+'%');
     var x0=Math.max(0,ox-overlap),y0=Math.max(0,oy-overlap),x1=Math.min(w,ox+tile+overlap),y1=Math.min(h,oy+tile+overlap),tw=Math.ceil((x1-x0)/32)*32,th=Math.ceil((y1-y0)/32)*32,bytes=new Uint8Array(tw*th*4);
     for(y=0;y<th;y++){var yy=Math.min(h-1,y0+y);for(x=0;x<tw;x++){var xx=Math.min(w-1,x0+x),si=(yy*w+xx)*4,di=(y*tw+x)*4;bytes[di]=rgba[si];bytes[di+1]=rgba[si+1];bytes[di+2]=rgba[si+2];bytes[di+3]=255;}if(y%16===15)await breathe(false);}
     var input=gpu.texture(tw,th,bytes,true),exposure=gpu.texture(tw,th);await apply('input',exposure,{a:input,spectral:spectral},{gain:gain,toPro:transpose(M),toXYZ:transpose(d.matrix)});gpu.remove(input);bytes=null;
     var parts=[{sigma:[2.2/px,2/px,1.6/px],weight:tailW.map(function(q){return 1-q;})}];fits.forEach(function(fit){parts.push({sigma:tail.map(function(t){return t/px*fit[1];}),weight:tailW.map(function(q){return q*fit[0];})});});
     var scatter=await mixture(exposure,parts);gpu.remove(exposure);exposure=scatter;parts=[];
     for(k=0;k<3;k++)parts.push({sigma:Array.prototype.map.call(d.halation_first_sigma_um,function(s){return s/px*Math.sqrt(k+1);}),weight:[Math.pow(.5,k)/1.75,Math.pow(.5,k)/1.75,Math.pow(.5,k)/1.75]});
     var halo=await mixture(exposure,parts),merged=gpu.texture(tw,th);await apply('mix',merged,{a:exposure,b:halo},{wa:Array.prototype.map.call(d.halation_strength,function(s){return 1/(1+s);}),wb:Array.prototype.map.call(d.halation_strength,function(s){return s/(1+s);})});gpu.remove(halo);gpu.remove(exposure);
     var log=gpu.texture(tw,th);await apply('log',log,{a:merged});gpu.remove(merged);var correction=gpu.texture(tw,th);await apply('correction',correction,{a:log,curveX:curveX,curveY:curveFilm},{coupler:d.coupler_matrix});
     parts=[{sigma:[20/px,20/px,20/px],weight:[.94,.94,.94]}];fits.forEach(function(fit){parts.push({sigma:[200/px*fit[1],200/px*fit[1],200/px*fit[1]],weight:[.06*fit[0],.06*fit[0],.06*fit[0]]});});
     var spread=await mixture(correction,parts);gpu.remove(correction);var density=gpu.texture(tw,th);await apply('develop',density,{a:log,b:spread,curveX:curveX,curveY:curveCoupler});gpu.remove(log);gpu.remove(spread);
     var grained=gpu.texture(tw,th);gu.origin=[x0,y0];await apply('grain',grained,{a:density,grainX:grainX,grainY:grainY},gu);gpu.remove(density);density=await blur(grained,[.65,.65,.65]);gpu.remove(grained);
     var xyz=gpu.texture(tw,th);await apply('print',xyz,{a:density,lut:print},{low:d.lut.min,high:d.lut.max});gpu.remove(density);
     // Read LUT-domain marker before glare. Reject, never silently clamp invalid densities.
     await breathe(true);var packed=gpu.read(xyz);for(k=3;k<packed.length;k+=4)if(!(packed[k]>.5))throw Error('密度超出已验证映射范围，原图已保留');
     var glare=gpu.texture(tw,th);await apply('glareNoise',glare,{},gu);var glareBlur=await blur(glare,[.5,.5,.5]);gpu.remove(glare);var bright=gpu.texture(tw,th);await apply('glare',bright,{a:xyz,b:glareBlur},{illum:d.glare_illuminant});gpu.remove(xyz);gpu.remove(glareBlur);
     var scan=gpu.texture(tw,th);await apply('scan',scan,{a:bright,cmax:cmPro},uPro);gpu.remove(bright);var soft=await blur(scan,[.7,.7,.7]),sharp=gpu.texture(tw,th);await apply('unsharp',sharp,{a:scan,b:soft});gpu.remove(scan);gpu.remove(soft);var final=gpu.texture(tw,th,null,true);await apply('output',final,{a:sharp,cmax:cmSrgb},uSrgb);gpu.remove(sharp);await breathe(true);packed=gpu.read(final);gpu.remove(final);
     for(y=oy;y<Math.min(oy+tile,h);y++){var src=((y-y0)*tw+ox-x0)*4,dst=(y*w+ox)*4;for(var off=src+3;off<src+Math.min(tile,w-ox)*4;off+=4)if(packed[off]!==255)throw Error("显影输出含异常颜色，原图已保留");output.set(packed.subarray(src,src+Math.min(tile,w-ox)*4),dst);}packed=null;
     stats.tiles++;await pause();guard();
    }
    stats.processingMs=performance.now()-began;photo.diagnostics=stats;root.FilmMobileLastRun=stats;return output.buffer;
   }finally{if(gpu){gpu.dispose();gpu=null;}}
  }
  return {render:render,cancel:function(){canceled=true;if(gpu){gpu.dispose();gpu=null;}}};
 }
 root.FilmMobileRenderer={create:create};
}(window));
